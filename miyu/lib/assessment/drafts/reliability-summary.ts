// 시뮬레이션 묶음 — 같은 난수 씨앗으로 매번 같은 값이 나온다. 문서(docs/assessment-reliability-sim.md)와
// 문항 검토 화면(docs/assessment-review.html)이 같은 값을 쓰도록 한 곳에서 만든다.
// 모든 값은 "응답 일관성 · 해당 없음 비율을 가정한 가상 응답"의 결과이며 실제 사람의 응답 결과가 아니다.
import { calibrateSituational, runSimulation, type SimReport, type SituationalCalibration } from "./reliability-sim.ts";
import type { SituationalRule } from "./situational-draft.ts";

export const SIM_PEOPLE = 4000;
export const SIM_SEED = 20261012;
export const SIM_NA_RATE = 0.05;

export const CONSISTENCY_LEVELS = [
  { consistency: 0.5, name: "낮음", note: "자기 성향과 상관없이 고르는 일이 많다" },
  { consistency: 1.0, name: "보통", note: "대체로 자기 성향에 맞게 고른다" },
  { consistency: 2.0, name: "높음", note: "자기 성향대로 꾸준히 고른다" },
] as const;

export const SITUATIONAL_RULES: SituationalRule[] = [
  { spread: 0.7, minEach: 1 },
  { spread: 0.8, minEach: 2 },
  { spread: 0.9, minEach: 2 },
  { spread: 0.9, minEach: 3 },
];

export const NA_RATES = [0.05, 0.1, 0.2, 0.3];

export type ReliabilitySummary = {
  levels: { consistency: number; name: string; note: string; report: SimReport }[];
  naSensitivity: { naRate: number; meanHold: number; worstHold: number }[];
  situational: SituationalCalibration[];
};

export function summarizeReliability(people = SIM_PEOPLE): ReliabilitySummary {
  const levels = CONSISTENCY_LEVELS.map((l) => ({ ...l, report: runSimulation({ people, seed: SIM_SEED, consistency: l.consistency, naRate: SIM_NA_RATE }) }));
  const naSensitivity = NA_RATES.map((naRate) => {
    const r = runSimulation({ people: Math.min(people, 2000), seed: SIM_SEED, consistency: 1, naRate });
    const holds = r.perspectives.map((p) => p.holdRate);
    return { naRate, meanHold: holds.reduce((s, v) => s + v, 0) / holds.length, worstHold: Math.max(...holds) };
  });
  const situational = calibrateSituational({ people, seed: SIM_SEED, consistency: 1, naRate: SIM_NA_RATE }, SITUATIONAL_RULES);
  return { levels, naSensitivity, situational };
}
