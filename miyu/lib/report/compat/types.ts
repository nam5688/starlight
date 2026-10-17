// 사주 궁합 리포트의 타입 — AI가 쓰는 초안(CompatDraftV1)과, 코드가 같은 엔진 결과로 채워 저장하는 리포트(CompatReport).
import type { CompatSectionId, CompatStepGroupId } from "./plan.ts";

/** 서로에게 해 볼 행동 하나 — say는 건넬 짧은 말 한 문장(상대의 반응 · 속마음은 쓰지 않는다) */
export type CompatStepDraft = { title: string; detail: string; say: string; evidence: string[] };

/** AI가 쓰는 본문 — 근거 ID는 compat.* 목록 안에서만 고른다. 두 사람은 "A님" · "B님"으로만 부른다(이름은 조립할 때 코드가 바꿔 넣는다) */
export type CompatDraftV1 = {
  headline: string;
  /** 7개 대주제 — 사주 궁합은 6번(view)을 뺀 여섯 장, 리포트 궁합은 일곱 장, 정해진 순서 */
  sections: { id: CompatSectionId; headline: string; paragraphs: string[]; evidence: string[] }[];
  steps: Record<CompatStepGroupId, CompatStepDraft[]>;
  /** 7번 장의 추천 질문 — 서로에게 물어보면 좋은 질문 2~3개 */
  questions: string[];
};

export type CompatStep = { title: string; detail: string; say: string };

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
  steps: Record<CompatStepGroupId, CompatStep[]>;
  /** 서로에게 물어보면 좋은 추천 질문(7번 장) — 2026-10-17 구성 이전에 저장된 글에는 없을 수 있다 */
  questions?: string[];
  /** 계산 · 안내 — 코드가 채운다 */
  notes: { cautions: string[]; items: string[]; page: string };
  /** 모의 작성기의 자리 표시 글이면 true — 판매할 수 없다 */
  placeholder?: true;
  generated: { provider: string; model: string; at: string };
};

/** 저장된 리포트 내용이 사주 궁합인지 — 개인 통합 리포트 · 고민 리포트와 같은 저장 칸에 kind로 구분해 담는다 */
export const isCompatReport = (c: { kind?: string } | object | null | undefined): c is CompatReport => !!c && "kind" in c && (c as { kind?: string }).kind === "compat-saju-v1";

/**
 * 리포트 궁합(유료 2)의 저장 형식 — 사주 궁합과 같은 위쪽 요약 · 영역 · 행동 모양에 응답 영역(response)과 비교 요약이 더해진 것.
 * **이름 · 생년월일 · 응답 원문 · 점수가 없다** — 본문은 "A님 · B님"이고 화면이 읽는 사람에게 누가 누구인지 알려 준다. 비교한 영역은 이름만(원래 답 없음).
 */
export type PairReport = Omit<CompatReport, "kind" | "names" | "notes"> & {
  kind: "compat-pair-v1";
  /** 두 사람이 모두 뚜렷하게 답해 비교한 영역의 이름(예: "관계 불안") · 한쪽만 뚜렷해 비교하지 않은 영역 수 */
  response: { comparedLabels: string[]; skipped: number };
  notes: { cautions: string[]; items: string[]; page: string };
};

export const isPairReport = (c: { kind?: string } | object | null | undefined): c is PairReport => !!c && "kind" in c && (c as { kind?: string }).kind === "compat-pair-v1";

