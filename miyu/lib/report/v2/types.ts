// 개인 종합 리포트 v2 — 사주 중심 인물 해석. 문단마다 근거 ID를 가진다.
// AI가 쓰는 부분(서술)과 코드가 채우는 부분(원국 표 · 근거 목록 · 계산 기준)을 나눈다.

import type { ContextTopic } from "../../personalization/context.ts";
import type { Evidence } from "../evidence.ts";
import type { ReportExtras } from "../extras.ts";
import type { DataSource, FreeSummary, SajuSection } from "../types.ts";

export type Paragraph = { text: string; evidence: string[] };

export const SECTION_PLAN = [
  { id: "mechanics", title: "성격이 작동하는 방식", question: "무엇을 결정할 때 오래 걸리고, 어떤 조건에서 빨라지는가" },
  { id: "work-money", title: "일과 돈에서 반복되는 선택", question: "일하는 방식, 돈을 대하는 기준, 반복되는 선택" },
  { id: "relationships", title: "관계에서의 모습", question: "일반적인 관계와 가까운 관계에서 달라지는 점" },
  { id: "conditions", title: "강점이 살아나는 조건 · 어려움이 생기는 조건", question: "같은 특징이 어떤 환경에서 장점 또는 부담이 되는가" },
] as const;

export type SectionId = (typeof SECTION_PLAN)[number]["id"];

/** AI가 돌려주는 부분 */
export type ReportDraftV2 = {
  headline: string;
  summary: Paragraph[];
  sections: { id: SectionId; paragraphs: Paragraph[] }[];
  timeline: { period: string; theme: string; opportunity: string; caution: string; evidence: string[] }[];
  differences: Paragraph[];
  actions: { situation: string; action: string; evidence: string[] }[];
  /** 알려 주신 고민까지 반영한 해석 (내 고민 자세히 알려주기를 적었을 때만) */
  focus?: Paragraph[];
};

/** 저장 · 화면용 전체 */
export type PersonalReportV2 = ReportDraftV2 & {
  kind: "personal-v2";
  source: DataSource;
  personName: string;
  saju: SajuSection;
  evidence: Evidence[];
  /** 응답 요약 (대표 경향 · 핵심 요약 · 기질 · 관계 · MBTI) — 구매한 리포트에는 모두 보인다 */
  base?: FreeSummary;
  /** 규칙 기반 구성 요소 (원국 쉬운 풀이 · 개인 질문과 답 · 상황별 · 어울리는 관계 조건 · 보완 아이템 · 실천 3가지) */
  extras?: ReportExtras;
  basis: {
    ruleVersions: string[];
    referenceDate: string;
    lines: string[];
    /** 반영한 맥락 — 주제와 적은 항목 이름만 (내용은 담지 않는다) */
    context?: { topic: ContextTopic; topicLabel: string; fields: string[]; updatedAt: string | null };
  };
};
