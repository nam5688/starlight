// 맛보기 리포트의 분량 · 시간 한도 — 지시문 · 검사 · 화면이 같은 값을 쓴다.
// 운영자 방향(2026-10-16): 사주아이처럼 "한 줄 제목 → 풀이"로 풀되 절반쯤만 공개하고 핵심은 유료 리포트에서. 연애는 간단 요약 3줄(150자 이상).
import type { TasteSectionId } from "./types.ts";

export const TASTE_PLAN = {
  headline: { min: 8, max: 40 },
  title: { min: 6, max: 30 },
  /** 섹션마다 문장 수 · 글자 수(공백 포함). 연애는 정확히 3문장 · 150자 이상(운영자 지정) */
  sections: {
    self: { label: "나는 이런 사람", sentences: { min: 4, max: 5 }, chars: { min: 300, max: 560 } },
    love: { label: "연애에서는", sentences: { min: 3, max: 3 }, chars: { min: 150, max: 300 } },
    work: { label: "일하고 공부할 때", sentences: { min: 3, max: 4 }, chars: { min: 170, max: 340 } },
    heart: { label: "지치거나 마음이 흔들릴 때", sentences: { min: 3, max: 4 }, chars: { min: 170, max: 340 } },
  } satisfies Record<TasteSectionId, { label: string; sentences: { min: number; max: number }; chars: { min: number; max: number } }>,
} as const;

export const TASTE_LIMITS = {
  /** 생각하는 토큰이 같이 들어가는 모델에게 주는 최대 출력(토큰) — 보이는 글은 대략 1,300~1,900자, 1,900~2,800토큰 */
  maxOutputTokens: 4000,
  /** 모델 호출 한 번 · 전체(다시 쓰기 포함)의 제한 시간 (밀리초) */
  callTimeoutMs: 75_000,
  totalTimeoutMs: 150_000,
} as const;
