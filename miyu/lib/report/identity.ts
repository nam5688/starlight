// 첫 화면 "한눈에 기억되는 결과"의 재료 — 개인 유형명 · 럭키 지수를 한 번에 만든다(운영자 확정 2026-10-17, D1 · D2). 순수 계산이며 AI를 쓰지 않는다.
// 사주 원국(SajuOk)이 있을 때만 만든다 — 만세력이 연결되지 않았거나 입력이 잘못된 결과에는 이름도 점수도 만들지 않는다.
// 두 값은 따로 계산된다: 유형명은 사주 갈래 + 응답(personal-type.ts), 럭키 지수는 사주 원국만(lucky.ts). 서로를 합산하지 않는다.
// 표시 여부는 호출하는 쪽이 스위치(PERSONAL_TYPE · LUCKY_INDEX)로 정한다 — 이 파일은 스위치를 읽지 않는다.
import { personalTypeOf, personalTypeView } from "../assessment/personal-type.ts";
import type { SajuResult } from "../saju/engine.ts";
import { luckyIndexOf, type LuckyIndex } from "../saju/interpret/lucky.ts";
import type { FreeSummary } from "./types.ts";

export type IdentityTypeView = ReturnType<typeof personalTypeView> & { kind: "type" | "mixed" };

export type IdentityView = {
  type: IdentityTypeView;
  lucky: LuckyIndex;
};

type IdentityInput = { saju: SajuResult; summary: Pick<FreeSummary, "temperament" | "relationship" | "mbti"> };

/**
 * 개인 유형만 — 로그인 전 무료 미리보기와 로그인 뒤 저장된 결과가 같은 입력에서 같은 이름 · 같은 설명을 보이도록 두 화면이 이 함수 하나를 쓴다(운영자 2026-10-20).
 * 럭키 지수를 만들지 않으므로 브라우저로 보내는 값에 지수가 섞이지 않는다.
 */
export function buildIdentityType(input: IdentityInput): IdentityTypeView | null {
  if (input.saju.status !== "ok") return null;
  const t = personalTypeOf({ saju: input.saju, summary: input.summary });
  return { ...personalTypeView(t), kind: t.kind };
}

export function buildIdentity(input: IdentityInput): IdentityView | null {
  const type = buildIdentityType(input);
  if (!type || input.saju.status !== "ok") return null;
  return { type, lucky: luckyIndexOf(input.saju) };
}
