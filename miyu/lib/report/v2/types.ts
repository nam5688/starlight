// 개인 종합 리포트 v2 — 사주 중심 인물 해석. 문단마다 근거 ID를 가진다.
// AI가 쓰는 부분(서술)과 코드가 채우는 부분(원국 표 · 근거 목록 · 계산 기준)을 나눈다.

import type { Evidence } from "../evidence.ts";
import type { DataSource, SajuSection } from "../types.ts";

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
};

/** 저장 · 화면용 전체 */
export type PersonalReportV2 = ReportDraftV2 & {
  kind: "personal-v2";
  source: DataSource;
  personName: string;
  saju: SajuSection;
  evidence: Evidence[];
  basis: { ruleVersions: string[]; referenceDate: string; lines: string[] };
};
