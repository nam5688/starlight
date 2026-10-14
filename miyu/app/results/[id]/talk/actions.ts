"use server";

import { buildChatContext } from "@/lib/report/chat/context";
import { isReadingReport } from "@/lib/report/generator";
import { buildTalkModel } from "@/lib/report/reading/talk";
import { ROOMS, roomAvailable, type RoomId } from "@/lib/report/reading/talk-room";
import { seoulDate } from "@/lib/saju/interpret/day-plain";
import { ASK_MESSAGES, askFreeQuestion, type AskResult } from "@/lib/services/chat-service";
import { getResultView } from "@/lib/services/report-service";
import { resetTalkRoom, saveTalkRoom } from "@/lib/services/talk-service";
import { chatAnswerer } from "@/server/chat";
import { capacityConfig, chatConfig } from "@/server/env";
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

type AskInput = { assessmentId: unknown; room: unknown; roomKey: unknown; question: unknown; topicId?: unknown; intake?: unknown; followUp?: unknown };

const failed = (reason: "not-found" | "failed"): AskResult => ({ ok: false, reason, message: ASK_MESSAGES[reason] });

/**
 * 자유 질문 — 로그인한 회원이 구매해 준비된 자기 리포트의 방에서만. 근거는 브라우저가 아니라 서버가 저장된 리포트에서 다시 만든다
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
        capacity: capacityConfig(),
        loadAsk: async () => {
          const view = await getResultView(await readRepository(), { userId: member.userId, assessmentId });
          const report = view?.report;
          if (!view?.paidOrder || report?.status !== "ready" || !report.content || !isReadingReport(report.content)) return null;
          const today = seoulDate(now());
          const model = buildTalkModel(report.content, { saju: view.assessment.saju, today, chat: { state: "ready" } });
          if (!roomAvailable(model, room as RoomId)) return null;
          const context = buildChatContext(model, room as RoomId, { topicId: text(input.topicId), intakeId: text(input.intake), followUp: input.followUp === true });
          return { context, referenceDate: model.dayKey };
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
