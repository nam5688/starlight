// 첫 화면 "한눈에 기억되는 결과"의 재료 — 개인 유형명 · 럭키 지수를 한 번에 만든다(운영자 확정 2026-10-17, D1 · D2). 순수 계산이며 AI를 쓰지 않는다.
// 사주 원국(SajuOk)이 있을 때만 만든다 — 만세력이 연결되지 않았거나 입력이 잘못된 결과에는 이름도 점수도 만들지 않는다.
// 두 값은 따로 계산된다: 유형명은 사주 갈래 + 응답(personal-type.ts), 럭키 지수는 사주 원국만(lucky.ts). 서로를 합산하지 않는다.
// 표시 여부는 호출하는 쪽이 스위치(PERSONAL_TYPE · LUCKY_INDEX)로 정한다 — 이 파일은 스위치를 읽지 않는다.
import { personalTypeOf, personalTypeView } from "../assessment/personal-type.ts";
import type { SajuResult } from "../saju/engine.ts";
import { luckyIndexOf, type LuckyIndex } from "../saju/interpret/lucky.ts";
import type { FreeSummary } from "./types.ts";

export type IdentityView = {
  type: ReturnType<typeof personalTypeView> & { kind: "type" | "mixed" };
  lucky: LuckyIndex;
};

export function buildIdentity(input: { saju: SajuResult; summary: Pick<FreeSummary, "temperament" | "relationship" | "mbti"> }): IdentityView | null {
  if (input.saju.status !== "ok") return null;
  const t = personalTypeOf({ saju: input.saju, summary: input.summary });
  return { type: { ...personalTypeView(t), kind: t.kind }, lucky: luckyIndexOf(input.saju) };
}
