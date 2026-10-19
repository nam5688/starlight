import "server-only";
import { isReadingReport } from "@/lib/report/generator";
import { buildFreePreview } from "@/lib/report/preview";
import { seoulReference } from "@/lib/report/reference";
import { assessmentTypeTitle } from "@/lib/report/type-title";
import { buildTalkModel, type TalkChat, type TalkModel, type TalkTopic } from "@/lib/report/reading/talk";
import { buildFreeTalkModel } from "@/lib/report/reading/talk-free";
import { ownedStateOf, type OwnedState } from "@/lib/report/reading/room-entry";
import { roomHasMaterial, type RoomId } from "@/lib/report/reading/talk-room";
import { seoulDate } from "@/lib/saju/interpret/day-plain";
import type { getResultView } from "@/lib/services/report-service";
import { now } from "./services";

export type { OwnedState };
export type ResultView = NonNullable<Awaited<ReturnType<typeof getResultView>>>;

/** 구매해 준비된 개인 통합 리포트(읽기 구조)가 있으면 paid, 없으면 free(무료 맛보기) */
export function viewTier(view: ResultView): "paid" | "free" {
  const report = view.report;
  return view.paidOrder && report?.status === "ready" && report.content && isReadingReport(report.content) ? "paid" : "free";
}

/** 구매한 리포트가 있는데 대화 방에서 풀이로 쓰지 못하는 이유(규칙은 lib/report/reading/room-entry.ts의 ownedStateOf) */
export function ownedState(view: ResultView): OwnedState | null {
  const report = view.report;
  return ownedStateOf({ paid: Boolean(view.paidOrder), status: report?.status ?? null, hasContent: Boolean(report?.content), readingFormat: Boolean(report?.content && isReadingReport(report.content)) });
}

/** 구매 예고(리포트가 답하는 질문 목록)를 뺀 풀이 */
function withoutLock(t: TalkTopic): TalkTopic {
  const copy = { ...t };
  delete copy.locked;
  return copy;
}

/**
 * 한 검사 결과의 대화 모델 — 구매해 준비된 개인 통합 리포트(읽기 구조)가 있으면 저장된 글로(paid), 없으면(무료 분석만 마쳤거나 리포트를 준비 중) 무료 맛보기로(free) 만든다.
 * 대화 화면(talk-room-content)과 자유 질문(askMiyuAction)이 같은 규칙을 쓴다. chat은 두 경우의 자유 질문 상태(호출하는 쪽이 정한다).
 * room을 주면 무료 맛보기에서 그 방의 풀이에 내 자료로 읽은 내용이 없을 때 무료 질문을 열지 않는다(noMaterial — 운영자 2026-10-15, 재료가 있는 방에서만 연다).
 */
export function roomModelFor(
  view: ResultView,
  chat: { paid: TalkChat; free: TalkChat },
  room?: RoomId,
  /** 오늘의 한 장처럼 날짜별 방을 그 날짜 기준으로 그릴 때(읽기용 대화 기록) — 없으면 오늘 */
  opts: { today?: ReturnType<typeof seoulDate> } = {},
): { tier: "paid" | "free"; model: TalkModel; noMaterial: boolean } {
  const { assessment, report } = view;
  const today = opts.today ?? seoulDate(now());
  // 나의 유형 — 이 사람의 사주 + 응답으로 계산(저장하지 않음). 무료 · 심층 대화 카드가 같은 값을 쓴다
  const typeTitle = assessmentTypeTitle(assessment);
  if (viewTier(view) === "paid" && report?.content && isReadingReport(report.content)) {
    return { tier: "paid", model: buildTalkModel(report.content, { typeTitle, saju: assessment.saju, today, chat: chat.paid }), noMaterial: false };
  }
  const owned = Boolean(view.paidOrder);
  const model = buildFreeTalkModel({
    name: assessment.nickname,
    preview: buildFreePreview({ summary: assessment.summary, saju: assessment.saju, reference: seoulReference(now()) }),
    saju: assessment.saju,
    today,
    href: owned ? `/results/${assessment.id}` : `/results/${assessment.id}#r-purchase`,
    owned,
    chat: chat.free,
    taste: view.taste?.kind === "ready" ? view.taste.report : null,
    typeTitle,
  });
  // 삭제한 기록은 구매 안내를 하지 않는다 — 기존 결제 주문이 있어도 다시 구매하게 이끌지 않고(구매 버튼 · "리포트가 답하는 질문" 안내 모두 없음), 채팅은 남은 분석 원자료의 무료 맛보기 풀이로만 이어진다
  const shown: TalkModel = view.deleted ? { ...model, buy: null, topics: model.topics.map(withoutLock), codeTopics: model.codeTopics.map(withoutLock) } : model;
  // 재료가 없는 방은 무료 질문을 열지 않는다 (질문 횟수를 쓰지 않고, 리포트를 받으면 열린다는 안내만 보인다)
  const noMaterial = room !== undefined && !roomHasMaterial(shown, room);
  if (noMaterial && shown.chat.state === "ready") return { tier: "free", model: { ...shown, chat: { state: "locked", free: true, noMaterial: true } }, noMaterial };
  return { tier: "free", model: shown, noMaterial };
}
