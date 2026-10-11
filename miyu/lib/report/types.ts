// 리포트 화면에 넘기는 데이터 구조.
// source로 출처를 항상 표시한다 — 샘플과 실제 결과를 섞지 않기 위해서다.

import type { TendencyId } from "../assessment/dev-rules.ts";

/**
 * - "sample": 리포트 예시용 가상 데이터
 * - "dev-scoring": 개발용 예시 문항 + 임시 규칙으로 계산한 결과
 * (운영 결과용 "live"는 실제 척도와 저장이 연결되는 단계에서 추가한다)
 */
export type DataSource = "sample" | "dev-scoring";

export type ScoreRow = {
  id: string;
  label: string;
  /** 0~100 환산값. 백분위·정확도가 아니다. */
  score: number;
  lowMeaning: string;
  highMeaning: string;
};

export type AxisRow = ScoreRow & {
  lowCode: string;
  lowName: string;
  highCode: string;
  highName: string;
};

export type CoreSummary = {
  comfortableEnvironment: string;
  repeatedReaction: string;
  stressTrigger: string;
  tryNow: string;
};

/** 무료 요약 — 로그인·구매 없이 보여주는 범위 */
export type FreeSummary = {
  source: DataSource;
  contentVersion: string;
  tendency: { id: TendencyId; name: string };
  oneLiner: string;
  core: CoreSummary;
  temperament: ScoreRow[];
  relationship: ScoreRow[];
  mbti: { code: string; axes: AxisRow[] };
};

export type SajuPillar = {
  position: "년주" | "월주" | "일주" | "시주";
  stem: string;
  branch: string;
};

export type SajuSection =
  | {
      status: "sample";
      pillars: SajuPillar[];
      dayMaster: string;
      elements: { name: string; count: number }[];
    }
  | { status: "not-connected" };

export type DetailBlock = {
  /** 무엇을 근거로 봤는지 */
  basis: string;
  findings: string[];
  limits: string;
};

/** 개인 통합 리포트 전체 — 구매 후에만 서버에서 내려준다 (리포트 예시는 예외) */
export type FullReport = FreeSummary & {
  personName: string;
  knownMbti: string | null;
  details: {
    mbti: DetailBlock;
    temperament: DetailBlock;
    relationship: DetailBlock;
    saju: DetailBlock & { saju: SajuSection };
  };
  integrated: {
    common: { point: string; basis: string[] }[];
    different: { point: string; explanation: string }[];
  };
  actions: { title: string; detail: string }[];
};
