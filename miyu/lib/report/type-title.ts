// 화면 · 읽기용 글이 보이는 "나의 유형" 한 줄의 단일 입구 — 개인 유형 10개 + 혼합 경향(운영자 확정 2026-10-17 D1, 표시 승인 2026-10-19).
// 이름은 저장하지 않고 그 사람의 사주 원국(SajuOk) + 응답 점수에서 열 때마다 계산한다(personal-type.ts). AI는 이름을 만들지 않는다.
// 같은 입력이면 같은 이름이고, 입력이 다르면 다른 사람과 값이 섞이지 않는다 — 이 함수는 전달받은 한 사람의 값만 읽는다.
//
// 표시 규칙:
//  · 스위치(PERSONAL_TYPE.visible)가 켜져 있으면 새 유형만 보인다. 옛 후보 이름 4개(안정지향형 등)는 같은 자리에 함께 보이지 않는다.
//    사주가 계산되지 않았거나 계산에 필요한 입력이 없으면 이름을 만들지 않는다(옛 이름으로 대신 채우지 않는다).
//  · 스위치가 꺼져 있으면 예전 그대로 옛 후보 이름 + 설명을 보인다(한 줄로 되돌릴 수 있게).
//  · 사주 후보가 정해지지 않았거나 응답이 비었거나 둘 이상이 비슷하면 억지로 이름을 붙이지 않고 "혼합 경향"이다(personal-type.ts의 판단을 그대로 따른다).
import { tendencyPhrase } from "../assessment/dev-rules.ts";
import { personalTypeOf, personalTypeView } from "../assessment/personal-type.ts";
import { PERSONAL_TYPE } from "../config/product.ts";
import type { SajuResult } from "../saju/engine.ts";
import type { FreeSummary } from "./types.ts";

export type TypeTitle = {
  /** 화면에 보이는 이름 — 10개 유형 이름, "혼합 경향", 또는(스위치가 꺼졌을 때만) 옛 후보 이름 */
  name: string;
  /** 이름 바로 아래 한 줄 */
  line: string | null;
  /** type = 10개 중 하나 / mixed = 혼합 경향 / legacy = 옛 후보 이름(스위치 꺼짐) */
  kind: "type" | "mixed" | "legacy";
  /** 이름 옆에 항상 적는 안내(진단이 아니라는 뜻) */
  note: string;
};

export type TypeInput = { saju: SajuResult; summary: Pick<FreeSummary, "temperament" | "relationship" | "mbti"> };

export const LEGACY_NOTE = "대표 경향은 응답을 보고 붙인 후보 설명이며, 진단이나 평생 가는 유형이 아니에요.";

/** 옛 후보 이름(안정지향형 등) 제목 — 스위치가 꺼졌을 때의 표시, 그리고 옛 모양을 확인하는 시험에서만 쓴다 */
export const legacyTypeTitle = (name: string | null | undefined): TypeTitle | null => (name ? { name, line: tendencyPhrase(name), kind: "legacy", note: LEGACY_NOTE } : null);

/** 새 유형을 계산한다 — 사주가 계산되지 않은 입력이면 null(이름을 만들지 않는다). 스위치를 읽지 않는 순수 계산 */
export function personalTypeTitle(input: TypeInput | null | undefined): TypeTitle | null {
  if (!input || input.saju.status !== "ok") return null;
  const t = personalTypeOf({ saju: input.saju, summary: input.summary });
  const v = personalTypeView(t);
  return { name: v.name, line: v.line, kind: t.kind, note: v.note };
}

/**
 * 화면이 쓰는 제목. input은 그 사람의 사주 + 응답(없으면 null), legacy는 저장된 옛 후보 이름(스위치가 꺼졌을 때만 쓴다).
 * 스위치가 켜져 있으면 legacy를 읽지 않는다 — 두 이름 체계가 한 화면에 겹치지 않는다.
 */
export function typeTitleFor(input: TypeInput | null | undefined, legacy?: string | null): TypeTitle | null {
  if (!PERSONAL_TYPE.visible) return legacyTypeTitle(legacy);
  return personalTypeTitle(input);
}

/** 저장된 검사 결과(사주 + 응답 요약)에서 — 화면 · 대화 · 관리자 보기 · 읽기용 글이 모두 이 한 함수를 쓴다 */
export function assessmentTypeTitle(a: { saju: SajuResult; summary: Pick<FreeSummary, "temperament" | "relationship" | "mbti" | "tendency"> }): TypeTitle | null {
  return typeTitleFor({ saju: a.saju, summary: a.summary }, a.summary.tendency.name);
}

/** 컴포넌트 · 읽기용 글이 받은 값을 푼다 — 명시적으로 넘긴 값(null 포함)이 우선이고, 넘기지 않았을 때(undefined)만 스위치에 따라 옛 이름을 쓴다 */
export function resolveTypeTitle(given: TypeTitle | null | undefined, legacy: string | null | undefined): TypeTitle | null {
  if (given !== undefined) return given;
  return PERSONAL_TYPE.visible ? null : legacyTypeTitle(legacy);
}
