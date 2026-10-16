// 사주 궁합 리포트의 타입 — AI가 쓰는 초안(CompatDraftV1)과, 코드가 같은 엔진 결과로 채워 저장하는 리포트(CompatReport).
import type { CompatSectionId } from "./plan.ts";

/** AI가 쓰는 본문 — 근거 ID는 compat.* 목록 안에서만 고른다. 두 사람은 "A님" · "B님"으로만 부른다(이름은 조립할 때 코드가 바꿔 넣는다) */
export type CompatDraftV1 = {
  headline: string;
  sections: { id: CompatSectionId; headline: string; paragraphs: string[]; evidence: string[] }[];
  actions: { title: string; detail: string; area: CompatSectionId; evidence: string[] }[];
};

export type CompatReport = {
  kind: "compat-saju-v1";
  /** 규칙 · 지시문 버전 — 같은 두 사람이어도 규칙이 바뀌면 결과가 달라질 수 있어 기록한다 */
  ruleVersion: string;
  promptVersion: string;
  names: { a: string; b: string };
  /** 코드가 간단 궁합과 같은 결과에서 채운 요약 — AI가 쓰지 않는다 */
  summary: {
    typeName: string;
    typeLine: string;
    score: number;
    scoreMeaning: string;
    core: string;
    scoreBasis: string;
    scoreNotProbability: string;
    parts: { label: string; direction: string }[];
  };
  headline: string;
  sections: { id: CompatSectionId; topic: string; headline: string; paragraphs: string[] }[];
  actions: { title: string; detail: string; area: CompatSectionId }[];
  /** 계산 · 안내 — 코드가 채운다 */
  notes: { cautions: string[]; items: string[]; page: string };
  /** 모의 작성기의 자리 표시 글이면 true — 판매할 수 없다 */
  placeholder?: true;
  generated: { provider: string; model: string; at: string };
};
