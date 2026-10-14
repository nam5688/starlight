import "server-only";
import { isReadingReport } from "@/lib/report/generator";
import { buildFreePreview } from "@/lib/report/preview";
import { seoulReference } from "@/lib/report/reference";
import { buildTalkModel, type TalkChat, type TalkModel } from "@/lib/report/reading/talk";
import { buildFreeTalkModel } from "@/lib/report/reading/talk-free";
import { roomHasMaterial, type RoomId } from "@/lib/report/reading/talk-room";
import { seoulDate } from "@/lib/saju/interpret/day-plain";
import type { getResultView } from "@/lib/services/report-service";
import { now } from "./services";

export type ResultView = NonNullable<Awaited<ReturnType<typeof getResultView>>>;

/** 구매해 준비된 개인 통합 리포트(읽기 구조)가 있으면 paid, 없으면 free(무료 맛보기) */
export function viewTier(view: ResultView): "paid" | "free" {
  const report = view.report;
  return view.paidOrder && report?.status === "ready" && report.content && isReadingReport(report.content) ? "paid" : "free";
}

/**
 * 한 검사 결과의 대화 모델 — 구매해 준비된 개인 통합 리포트(읽기 구조)가 있으면 저장된 글로(paid), 없으면(무료 분석만 마쳤거나 리포트를 준비 중) 무료 맛보기로(free) 만든다.
 * 대화 화면(talk-room-content)과 자유 질문(askMiyuAction)이 같은 규칙을 쓴다. chat은 두 경우의 자유 질문 상태(호출하는 쪽이 정한다).
 * room을 주면 무료 맛보기에서 그 방의 풀이에 내 자료로 읽은 내용이 없을 때 무료 질문을 열지 않는다(noMaterial — 운영자 2026-10-15, 재료가 있는 방에서만 연다).
 */
export function roomModelFor(view: ResultView, chat: { paid: TalkChat; free: TalkChat }, room?: RoomId): { tier: "paid" | "free"; model: TalkModel; noMaterial: boolean } {
  const { assessment, report } = view;
  const today = seoulDate(now());
  if (viewTier(view) === "paid" && report?.content && isReadingReport(report.content)) {
    return { tier: "paid", model: buildTalkModel(report.content, { saju: assessment.saju, today, chat: chat.paid }), noMaterial: false };
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
  });
  // 재료가 없는 방은 무료 질문을 열지 않는다 (질문 횟수를 쓰지 않고, 리포트를 받으면 열린다는 안내만 보인다)
  const noMaterial = room !== undefined && !roomHasMaterial(model, room);
  if (noMaterial && model.chat.state === "ready") return { tier: "free", model: { ...model, chat: { state: "locked", free: true, noMaterial: true } }, noMaterial };
  return { tier: "free", model, noMaterial };
}
