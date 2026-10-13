// 시뮬레이션 묶음 — 같은 난수 씨앗으로 매번 같은 값이 나온다. 문서(docs/assessment-reliability-sim.md · assessment-design-review-2.md)와
// 문항 검토 화면(docs/assessment-review.html)이 같은 값을 쓰도록 한 곳에서 만든다.
// 모든 값은 "응답 일관성 · 해당 없음 비율을 가정한 가상 응답"의 결과이며 실제 사람의 응답 결과가 아니다.
import { calibrateSituational, runSimulation, type SimReport, type SituationalCalibration } from "./reliability-sim.ts";
import type { SituationalRule } from "./situational-draft.ts";
import { DRAFT_V01, DRAFT_V02, DRAFT_V02_PLUS, type SimDraft } from "./versions.ts";

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

export type VersionKey = "v01" | "v02" | "v02plus";

export const VERSIONS: { key: VersionKey; label: string; short: string; draft: SimDraft }[] = [
  { key: "v01", label: "초안 0.1 (동결본: 문항 하나가 최대 2~3개 관점에 점수)", short: "0.1", draft: DRAFT_V01 },
  { key: "v02", label: "초안 0.2 (현재: 문항 하나는 관점 하나)", short: "0.2", draft: DRAFT_V02 },
  { key: "v02plus", label: "0.2 + 보강 후보 9문항 (가상의 묶음 · 확정 아님)", short: "0.2+9", draft: DRAFT_V02_PLUS },
];

export type LevelRun = { consistency: number; name: string; note: string; report: SimReport };
export type VersionSummary = {
  key: VersionKey;
  label: string;
  short: string;
  levels: LevelRun[];
  /** 해당 없음 비율을 바꿨을 때 보류되는 관점의 몫 (응답 일관성 보통) */
  naSensitivity: { naRate: number; meanHold: number; worstHold: number }[];
  /** "상황에 따라 다름" 표시 규칙 시험 */
  situational: SituationalCalibration[];
};
export type ReliabilitySummary = { versions: VersionSummary[] };

export function summarizeReliability(people = SIM_PEOPLE): ReliabilitySummary {
  return {
    versions: VERSIONS.map((v) => {
      const levels = CONSISTENCY_LEVELS.map((l) => ({ ...l, report: runSimulation({ people, seed: SIM_SEED, consistency: l.consistency, naRate: SIM_NA_RATE }, v.draft) }));
      const naSensitivity = NA_RATES.map((naRate) => {
        const r = runSimulation({ people: Math.min(people, 2000), seed: SIM_SEED, consistency: 1, naRate }, v.draft);
        // 문항이 모자라 처음부터 보류인 관점은 해당 없음의 영향을 보는 데 의미가 없으므로 뺀다
        const readable = r.perspectives.filter((p) => p.indicators >= 3);
        const holds = readable.map((p) => p.holdRate);
        return { naRate, meanHold: holds.length ? holds.reduce((s, x) => s + x, 0) / holds.length : 0, worstHold: holds.length ? Math.max(...holds) : 0 };
      });
      const situational = calibrateSituational({ people: Math.min(people, 2000), seed: SIM_SEED, consistency: 1, naRate: SIM_NA_RATE }, SITUATIONAL_RULES, 1, v.draft);
      return { key: v.key, label: v.label, short: v.short, levels, naSensitivity, situational };
    }),
  };
}

export const versionOf = (s: ReliabilitySummary, key: VersionKey) => s.versions.find((v) => v.key === key)!;
export const levelOf = (v: VersionSummary, name: (typeof CONSISTENCY_LEVELS)[number]["name"]) => v.levels.find((l) => l.name === name)!.report;
