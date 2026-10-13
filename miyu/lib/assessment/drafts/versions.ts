// 문항 초안의 버전별 묶음 — 가상 응답 점검(reliability-sim.ts)이 0.1 구조와 0.2 구조를 같은 방식으로 재고 비교하게 한다.
// 0.1은 situational-draft-v01.ts에 동결해 둔 것이고(고치지 않는다), 0.2가 현재 초안이다. 어느 쪽도 화면 · 저장 · 리포트에 연결하지 않는다.
import * as V1 from "./situational-draft-v01.ts";
import * as V2 from "./situational-draft.ts";
import { contribution, indicatorCountsOf, PERSPECTIVE_IDS, PERSPECTIVES, scoreItems, type DraftAnswers, type DraftItem, type PerspectiveId, type Weights } from "./situational-draft.ts";
import { REINFORCEMENT_CANDIDATES } from "./reinforcement-candidates.ts";

/** 두 버전을 같은 모양으로 읽은 한 관점의 결과 — reading: 뚜렷한 높음 · 뚜렷한 낮음 · 뚜렷하지 않음 (0.1의 "약간" · "고르게"는 모두 뚜렷하지 않음으로 본다) */
export type SimResult =
  | { status: "hold"; answered: number }
  | { status: "ok"; score: number; reading: "high" | "low" | "unclear"; situational: boolean; answered: number };

export type SimDraft = {
  version: string;
  items: readonly { id: string; options: readonly { id: string; w: Weights; unscored?: boolean }[] }[];
  ids: PerspectiveId[];
  perspectives: Record<PerspectiveId, { name: string; usedByTypes: boolean }>;
  indicatorCounts(): Record<PerspectiveId, number>;
  score(answers: DraftAnswers): Record<PerspectiveId, SimResult>;
  contribution(itemId: string, option: "a" | "b" | "c" | "d", p: PerspectiveId): number | null;
};

type Scored = { status: "hold"; answered: number } | { status: "ok"; score: number; strength: string; situational: boolean; answered: number };

function adapt(m: {
  DRAFT_CONTENT_VERSION: string;
  DRAFT_ITEMS: SimDraft["items"];
  PERSPECTIVE_IDS: PerspectiveId[];
  PERSPECTIVES: SimDraft["perspectives"];
  indicatorCounts(): Record<PerspectiveId, number>;
  scoreDraft(a: DraftAnswers): { perspectives: Record<PerspectiveId, Scored> };
  contribution(item: never, option: "a" | "b" | "c" | "d", p: PerspectiveId): number | null;
  ITEM_BY_ID: Record<string, unknown>;
}): SimDraft {
  return {
    version: m.DRAFT_CONTENT_VERSION,
    items: m.DRAFT_ITEMS,
    ids: m.PERSPECTIVE_IDS,
    perspectives: m.PERSPECTIVES,
    indicatorCounts: m.indicatorCounts,
    score(answers) {
      const out = {} as Record<PerspectiveId, SimResult>;
      const res = m.scoreDraft(answers).perspectives;
      for (const p of m.PERSPECTIVE_IDS) {
        const r = res[p];
        out[p] =
          r.status === "hold"
            ? { status: "hold", answered: r.answered }
            : { status: "ok", score: r.score, reading: r.strength === "clear" ? (r.score > 50 ? "high" : "low") : "unclear", situational: r.situational, answered: r.answered };
      }
      return out;
    },
    contribution: (itemId, option, p) => m.contribution(m.ITEM_BY_ID[itemId] as never, option, p),
  };
}

/** 문항 묶음 하나를 0.2의 채점 규칙으로 읽는 묶음 — 보강 후보를 더한 가상의 묶음을 재는 데 쓴다 */
export function bundleOf(version: string, items: readonly DraftItem[]): SimDraft {
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    version,
    items,
    ids: PERSPECTIVE_IDS,
    perspectives: PERSPECTIVES,
    indicatorCounts: () => indicatorCountsOf(items),
    score(answers) {
      const out = {} as Record<PerspectiveId, SimResult>;
      const res = scoreItems(items, answers).perspectives;
      for (const p of PERSPECTIVE_IDS) {
        const r = res[p];
        out[p] =
          r.status === "hold"
            ? { status: "hold", answered: r.answered }
            : { status: "ok", score: r.score, reading: r.direction, situational: r.situational, answered: r.answered };
      }
      return out;
    },
    contribution: (itemId, option, p) => contribution(byId.get(itemId)!, option, p),
  };
}

export const DRAFT_V01: SimDraft = adapt(V1 as never);
export const DRAFT_V02: SimDraft = adapt(V2 as never);
/** 0.2의 30문항 + 보강 후보 9문항 — 확정이 아니다. 후보를 더하면 읽을 수 있는 관점이 몇 개가 되는지, 12유형 분류가 어떻게 되는지 보는 가상의 묶음 */
export const DRAFT_V02_PLUS: SimDraft = bundleOf("situational-0.2-draft + 보강 후보 9문항(미정)", [...V2.DRAFT_ITEMS, ...REINFORCEMENT_CANDIDATES]);
