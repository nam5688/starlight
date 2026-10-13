// 자기 이해 풀이(비교용 초안 v0) — 사주를 틀로, 내가 중요하게 여기는 것 · 서로 부딪히는 마음 · 강점이 부담이 되는 때 · 선택 기준을
// 구체적인 일상 장면으로 풀어 쓰는 리포트 구조. AI 품질 비교(1단계)에서 두 후보에게 같은 구조로 쓰게 하려고 만든 것이며,
// 아직 제품의 생성 지침 · 화면에는 연결하지 않았다 (운영자가 구조를 확정한 뒤 반영한다).
import type { ContextTopic } from "../../personalization/context.ts";
import type { Evidence } from "../evidence.ts";
import type { DataSource } from "../types.ts";

export const PHILOSOPHICAL_KIND = "philosophical-v0" as const;

export type PBlock = { text: string; evidence: string[] };

/** AI가 돌려주는 부분 */
export type PhilosophicalDraftV0 = {
  /** 이 사람을 설명하는 한 문장 (8~60자) */
  headline: string;
  /** 읽는 법 — 해석은 근거에서 읽은 가설이며 맞는지는 질문으로 직접 확인한다 */
  intro: PBlock;
  /** 내가 중요하게 여기는 것 — 정확히 3개, 순서대로: ① 가치 ② 혼자 맡는 책임의 범위 ③ 고를 때의 기준 */
  values: (PBlock & { title: string })[];
  /** 내 안의 갈등 — 서로 부딪히는 두 마음 2~3개 */
  conflicts: (PBlock & { title: string; between: [string, string] })[];
  /** 원국 · 응답 · (알려 준 고민)이 한 방향으로 모이지 않을 때 합치지 않고 나란히 둔다는 안내 */
  disagreement: PBlock;
  /** 강점과 그 대가 2~3개 — 강점 · 부담이 되는 때 · 대가 · 근거 문장 */
  strengthCost: { strength: string; cost: string; when: string; reading: string; evidence: string[] }[];
  /** 이번 고민의 선택지 2~4개 — 알려 준 고민(context)이 있을 때만 */
  choices?: { option: string; protects: string; costs: string; check: string; evidence: string[] }[];
  /** 계산된 해의 주제와 글로 정해 둘 것 (사건 예언 없음) */
  flow: PBlock;
  /** 결정을 대신 내리지 않는다는 안내 — 알려 준 고민이 있을 때만 */
  noVerdict?: string;
  /** 돌아볼 질문과 행동 4~5개 — 질문마다 때 · 시점과 분량이 보이는 행동 */
  questionsActions: { when: string; question: string; action: string; evidence: string[] }[];
};

export type PhilosophicalReportV0 = PhilosophicalDraftV0 & {
  kind: typeof PHILOSOPHICAL_KIND;
  source: DataSource;
  personName: string;
  evidence: Evidence[];
  basis: {
    ruleVersions: string[];
    referenceDate: string;
    /** 반영한 고민 — 주제 · 적은 항목 이름만 (내용은 담지 않는다) */
    concern?: { topic: ContextTopic; topicLabel: string; fields: string[] };
  };
};

export const isPhilosophicalReport = (c: unknown): c is PhilosophicalReportV0 =>
  typeof c === "object" && c !== null && (c as { kind?: unknown }).kind === PHILOSOPHICAL_KIND;
