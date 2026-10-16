// 맛보기 리포트의 분량 · 시간 한도 — 지시문 · 검사 · 화면이 같은 값을 쓴다.
// 운영자 방향(2026-10-16): 사주를 읽고 이 사람에게 어떻게 나타나는지 풀어 주는 완결된 짧은 풀이 — 잠금 · "구매 후" 예고 없이 끝까지 읽히고, 구매 안내는 화면 한곳에만.
// 연애는 간단 요약 3문장(150자 이상)을 유지한다(무료 샘플의 범위이며 심층 리포트의 연애 · 결혼 해석에는 이 제한이 없다).
import type { TasteSectionId } from "./types.ts";

type SectionPlan = { label: string; sentences: { min: number; max: number }; chars: { min: number; max: number } };

export const TASTE_PLAN = {
  headline: { min: 8, max: 40 },
  title: { min: 6, max: 30 },
  /** 섹션마다 문장 수 · 글자 수(공백 포함). 연애는 정확히 3문장 · 150자 이상(운영자 지정) */
  sections: {
    self: { label: "내 성향과 지나온 모습", sentences: { min: 4, max: 6 }, chars: { min: 300, max: 620 } },
    work: { label: "일에서는", sentences: { min: 3, max: 4 }, chars: { min: 170, max: 340 } },
    love: { label: "가까운 관계에서는", sentences: { min: 3, max: 3 }, chars: { min: 150, max: 300 } },
    action: { label: "지금 나에게 필요한 한 가지", sentences: { min: 2, max: 3 }, chars: { min: 90, max: 260 } },
    // 예전(v1)에 받은 글을 읽을 때만 쓰는 이름 — 새로 쓰지 않는다
    heart: { label: "지치거나 마음이 흔들릴 때", sentences: { min: 3, max: 4 }, chars: { min: 170, max: 340 } },
  } satisfies Record<TasteSectionId, SectionPlan>,
} as const;

/** 저장된 글을 화면에 보일 때의 섹션 이름 — v1 글의 이름(연애 · 일하고 공부할 때 …)은 그 글을 받을 때 본 이름 그대로 둔다 */
export const tasteSectionLabel = (id: TasteSectionId, version: string): string => {
  if (version === "taste-v1") return { self: "나는 이런 사람", love: "연애에서는", work: "일하고 공부할 때", heart: "지치거나 마음이 흔들릴 때", action: TASTE_PLAN.sections.action.label }[id];
  return TASTE_PLAN.sections[id].label;
};

export const TASTE_LIMITS = {
  /** 생각하는 토큰이 같이 들어가는 모델에게 주는 최대 출력(토큰) — 보이는 글은 대략 1,300~1,900자, 1,900~2,800토큰 */
  maxOutputTokens: 4000,
  /** 모델 호출 한 번 · 전체(다시 쓰기 포함)의 제한 시간 (밀리초) */
  callTimeoutMs: 75_000,
  totalTimeoutMs: 150_000,
} as const;
