"use server";

import { buildChatContext } from "@/lib/report/chat/context";
import { ROOMS, roomAvailable, roomSaveKey, type RoomId } from "@/lib/report/reading/talk-room";
import { ASK_MESSAGES, askFreeQuestion, type AskResult } from "@/lib/services/chat-service";
import { getResultView } from "@/lib/services/report-service";
import { closeRoom, saveRoomSummary, SUMMARY_MESSAGES, type SummaryFailure } from "@/lib/services/summary-service";
import { resetTalkRoom, saveTalkRoom } from "@/lib/services/talk-service";
import { chatAnswerer, chatCapacity } from "@/server/chat";
import { roomModelFor } from "@/server/talk-model";
import { chatConfig } from "@/server/env";
import { getMember } from "@/server/member";
import { logError } from "@/server/ops";
import { now, readRepository, writeRepository } from "@/server/services";

type Input = { assessmentId: unknown; roomKey: unknown; actions?: unknown };

/** 대화를 서버에 저장한다 — 로그인한 회원의 자기 검사 결과에만(서비스가 소유자를 확인한다). 실패해도 대화는 그대로 이어지고 이 기기에는 남는다 */
export async function saveTalkRoomAction(input: Input): Promise<{ ok: boolean }> {
  if (typeof input?.assessmentId !== "string" || typeof input?.roomKey !== "string") return { ok: false };
  const member = await getMember();
  if (!member || member.needsConsent) return { ok: false };
  const r = await saveTalkRoom(writeRepository(), { userId: member.userId, assessmentId: input.assessmentId, roomKey: input.roomKey, actions: input.actions });
  return { ok: r.ok };
}

/** "이 채팅방 새로 시작하기" — 서버에 저장된 이 방의 대화를 지운다 */
export async function resetTalkRoomAction(input: Input): Promise<{ ok: boolean }> {
  if (typeof input?.assessmentId !== "string" || typeof input?.roomKey !== "string") return { ok: false };
  const member = await getMember();
  if (!member || member.needsConsent) return { ok: false };
  const r = await resetTalkRoom(writeRepository(), { userId: member.userId, assessmentId: input.assessmentId, roomKey: input.roomKey });
  return { ok: r.ok };
}

export type SummaryActionResult = { ok: true; saved: boolean } | { ok: false; reason: SummaryFailure | "failed"; message: string };

const summaryFailed = (reason: SummaryFailure | "failed"): SummaryActionResult => ({ ok: false, reason, message: reason === "failed" ? "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요." : SUMMARY_MESSAGES[reason] });

type SummaryInput = Input & { room: unknown };

/** 요약에 쓰는 풀이 이름표를 가져오는 대화 모델 — 저장된 리포트(또는 무료 맛보기)에서 서버가 다시 만든다 (브라우저가 보낸 글을 믿지 않는다) */
async function summaryModel(userId: string, assessmentId: string, room: RoomId) {
  const view = await getResultView(await readRepository(), { userId, assessmentId });
  if (!view) return null;
  return roomModelFor(view, { paid: { state: "ready" }, free: { state: "ready", free: true } }, room).model;
}

/**
 * [저장하기] — 지금까지 나눈 대화를 짧은 "질문 → 답변"으로 요약해 저장한다 (이전 저장 이후의 대화만). 요약은 코드가 규칙대로 줄이며 AI를 부르지 않는다.
 * 저장한 요약은 MY의 "저장한 채팅 요약 보기"에서 본인만 본다. 서버 로그에는 가린 오류만 남기고 대화 내용은 어떤 기록에도 넣지 않는다.
 */
export async function saveChatSummaryAction(input: SummaryInput): Promise<SummaryActionResult> {
  if (typeof input?.assessmentId !== "string" || typeof input?.roomKey !== "string" || typeof input?.room !== "string" || !(input.room in ROOMS)) return summaryFailed("invalid");
  const member = await getMember();
  if (!member || member.needsConsent) return summaryFailed("not-found");
  try {
    const model = await summaryModel(member.userId, input.assessmentId, input.room as RoomId);
    if (!model) return summaryFailed("not-found");
    const r = await saveRoomSummary(writeRepository(), { userId: member.userId, assessmentId: input.assessmentId, roomKey: input.roomKey, room: input.room, actions: input.actions, model });
    return r.ok ? { ok: true, saved: true } : summaryFailed(r.reason);
  } catch (e) {
    logError("talk.summary.save", e);
    return summaryFailed("failed");
  }
}

/**
 * 대화 종료 — 이 방의 대화를 지우고 새 대화로 시작하게 한다. keep이 true이면 마지막 저장 이후의 대화를 요약해 저장하고,
 * false이면 저장하지 않고 끝내되 보이지 않는 참고 기록으로만 남긴다(다음 질문에서 AI가 이전 이야기를 참고한다 · 회원이 MY에서 지울 수 있다).
 */
export async function closeTalkRoomAction(input: SummaryInput & { keep: unknown }): Promise<SummaryActionResult> {
  if (typeof input?.assessmentId !== "string" || typeof input?.roomKey !== "string" || typeof input?.room !== "string" || !(input.room in ROOMS)) return summaryFailed("invalid");
  const member = await getMember();
  if (!member || member.needsConsent) return summaryFailed("not-found");
  try {
    const model = await summaryModel(member.userId, input.assessmentId, input.room as RoomId);
    if (!model) return summaryFailed("not-found");
    const r = await closeRoom(writeRepository(), { userId: member.userId, assessmentId: input.assessmentId, roomKey: input.roomKey, room: input.room, actions: input.actions, model, keep: input.keep === true });
    return r.ok ? { ok: true, saved: r.saved } : summaryFailed(r.reason);
  } catch (e) {
    logError("talk.summary.close", e);
    return summaryFailed("failed");
  }
}

type AskInput = { assessmentId: unknown; room: unknown; roomKey: unknown; question: unknown; topicId?: unknown; intake?: unknown; followUp?: unknown };

const failed = (reason: "not-found" | "failed"): AskResult => ({ ok: false, reason, message: ASK_MESSAGES[reason] });

/**
 * 자유 질문 — 로그인한 회원이 자기 검사 결과의 방에서만(리포트를 받은 분은 하루 한도, 무료 맛보기는 평생 2번 · 질문은 1,000자까지). 근거는 브라우저가 아니라 서버가 저장된 리포트(또는 무료 맛보기)에서 다시 만든다
 * (브라우저가 보내는 것은 질문 · 방 · 지금 이야기 중인 풀이 번호 · 고른 답 번호뿐이다). 한도 · 예산 · 소유자 확인은 서비스(chat-service)가 한다.
 */
export async function askMiyuAction(input: AskInput): Promise<AskResult> {
  const { assessmentId, room, roomKey } = input;
  if (typeof assessmentId !== "string" || typeof roomKey !== "string" || typeof room !== "string" || !(room in ROOMS)) return failed("not-found");
  const member = await getMember();
  if (!member || member.needsConsent) return failed("not-found");
  const text = (v: unknown) => (typeof v === "string" && v.length <= 40 ? v : null);
  try {
    return await askFreeQuestion(
      {
        repo: writeRepository(),
        answerer: chatAnswerer(),
        now,
        config: chatConfig(),
        capacity: chatCapacity(),
        loadAsk: async () => {
          const view = await getResultView(await readRepository(), { userId: member.userId, assessmentId });
          if (!view) return null;
          // 구매해 준비된 리포트가 있으면 paid(저장된 풀이 글, 하루 한도), 없으면 free(무료 맛보기의 보이는 글만, 평생 무료 질문 한도, 재료 없는 방은 noMaterial로 거절)
          const { tier, model, noMaterial } = roomModelFor(view, { paid: { state: "ready" }, free: { state: "ready", free: true } }, room as RoomId);
          if (!roomAvailable(model, room as RoomId)) return null;
          const context = buildChatContext(model, room as RoomId, { topicId: text(input.topicId), intakeId: text(input.intake), followUp: input.followUp === true });
          // 방 이름(날짜별 방 포함)은 브라우저가 보낸 값이 아니라 서버가 정한다 — 방마다 무료 질문 수를 우회하지 못하게
          return { context, referenceDate: model.dayKey, tier, noMaterial, room, roomKey: roomSaveKey(model, room as RoomId) };
        },
      },
      { userId: member.userId, assessmentId, roomKey, question: input.question },
    );
  } catch (e) {
    // 고객에게는 같은 안내만 보인다. 서버 로그에는 가린 오류만 남기고 질문 · 답 내용은 어떤 기록에도 넣지 않는다
    logError("talk.ask", e);
    return failed("failed");
  }
}
