// 내 고민 반영 리포트 — 개인 종합 리포트(같은 검사 · 같은 사주)를 이미 가진 사람이, 발급 당시 적은 고민을 중심으로 새로 받는 리포트.
// 개인 종합 리포트에 문단 몇 개를 더한 것이 아니라, 이 고민에 답하는 별도의 해석이다.
// 문단마다 근거 ID를 갖고(사주 · 응답 근거), 고객이 적은 내용은 근거가 아니다 — 알려 준 이야기를 사주로 알아맞힌 것처럼 쓰지 않는다.

import type { ContextTopic } from "../../personalization/context.ts";
import type { Evidence } from "../evidence.ts";
import type { DataSource } from "../types.ts";
import type { Paragraph } from "../v2/types.ts";

export const CONCERN_REPORT_KIND = "concern-v1" as const;

/** AI가 돌려주는 부분 */
export type ConcernDraftV1 = {
  /** 이 고민에 대한 한 문장 결론 (8~60자) */
  headline: string;
  /** 알려 주신 고민을 어떻게 읽었는지 — 고객이 알려 준 내용임을 밝히며 시작 (1~2문단) */
  understanding: Paragraph[];
  /** 이 고민이 이 사람에게 반복되는 구조 — 사주 원국 · 대운과 응답 근거 (2~3문단) */
  pattern: Paragraph[];
  /** 고객이 적은 상황에서 출발한 상황별 해석과 제안 (3~5개): 상황 → 왜 그렇게 되는가 → 해볼 선택 */
  situations: { situation: string; reading: string; suggestion: string; evidence: string[] }[];
  /** 계산된 해만 — 이 고민의 관점에서 두드러지는 주제 · 살릴 기회 · 살펴볼 점 (1~3개) */
  timeline: { period: string; theme: string; opportunity: string; caution: string; evidence: string[] }[];
  /** 이 고민에서 사주와 응답이 다르게 보이는 부분 (0~2문단) */
  differences: Paragraph[];
  /** 시점이 있는 구체적 행동 (4~6개): 이번 주 / 이번 달 / 세 달 안에 */
  actions: { situation: string; action: string; evidence: string[] }[];
};

export type ConcernReportV1 = ConcernDraftV1 & {
  kind: typeof CONCERN_REPORT_KIND;
  source: DataSource;
  personName: string;
  evidence: Evidence[];
  basis: {
    ruleVersions: string[];
    referenceDate: string;
    lines: string[];
    /** 어떤 고민 기록을 반영했는지 — 주제 · 적은 항목 이름 · 기록 번호 · 작성 시점만 (내용은 기록에서 본인만 본다) */
    concern: { recordId: string; topic: ContextTopic; topicLabel: string; fields: string[]; writtenAt: string };
    /** 내용 차이 검사 결과 요약 (낱말 · 표지를 센 어림이며 좋은 글의 보증이 아니다) */
    quality?: { warnings: string[]; coverage: number; novelty: number };
  };
};

export const isConcernReport = (c: unknown): c is ConcernReportV1 =>
  typeof c === "object" && c !== null && (c as { kind?: unknown }).kind === CONCERN_REPORT_KIND;
