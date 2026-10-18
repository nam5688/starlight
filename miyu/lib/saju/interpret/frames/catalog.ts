// 프레임 목록 — 연애 6 · 재물 8 · 과거 회고 6 = 20개(운영자 2026-10-18: 연애 · 재물 · 과거 회고를 먼저, 나머지 영역은 이 결과를 본 뒤 넓힌다).
import { LOVE_FRAMES } from "./love.ts";
import { PAST_FRAMES } from "./past.ts";
import { WEALTH_FRAMES } from "./wealth.ts";
import type { FrameDef } from "./types.ts";

export const FRAMES: FrameDef[] = [...LOVE_FRAMES, ...WEALTH_FRAMES, ...PAST_FRAMES];
export const FRAME_BY_ID: Record<string, FrameDef> = Object.fromEntries(FRAMES.map((f) => [f.id, f]));

/**
 * 프레임 명중률(무작위 명식에서 이 프레임이 나오는 비율) — 후보를 고를 때 "흔한 조합보다 드문 조합"을 앞세우는 데만 쓴다.
 * 출생 1960~2006 균등 · 성별 반반 · 시각 미상 20% · 기준일 2026-10으로 4,000명을 센 값이며 실제 이용자 분포가 아니다(`scripts/render-frames-doc.ts`가 다시 센다).
 * 시기 프레임(L6 · W8)은 "해당 시기가 하나라도 있는 비율"이라 거의 모두에게 나오고, 변별은 어느 시기인가(나이대 · 인스턴스)로 한다.
 */
export const FRAME_HIT_RATE: Record<string, number> = {
  L1: 0.14, L2: 0.35, L3: 0.25, L4: 0.23, L5: 0.14, L6: 0.99,
  W1: 0.32, W2: 0.07, W3: 0.15, W4: 0.07, W5: 0.11, W6: 0.3, W7: 0.07, W8: 0.98,
  R1: 0.36, R2: 0.24, R3: 0.46, R4: 0.47, R5: 0.57, R6: 0.45,
};
