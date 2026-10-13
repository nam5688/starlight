// 리포트 생성기 연결 지점.
// - 개발용 규칙 생성기(generate-dev-report.ts) → FullReport (v1 화면)
// - AI 생성기(ai/generator.ts) → PersonalReportV2 (계산 결과 → 근거 → AI 서술 → 형식 검사)
// 저장된 리포트는 kind로 구분해 그대로 다시 보여준다 (v1에는 kind가 없다).

import type { ContextTopic, PersonalContextInput } from "../personalization/context.ts";
import type { SajuResult } from "../saju/engine.ts";
import type { ConcernReportV1 } from "./concern/types.ts";
import type { FreeSummary, FullReport } from "./types.ts";
import type { PersonalReportV2 } from "./v2/types.ts";

export type ReportInput = {
  nickname: string;
  knownMbti: string | null;
  /** 사주 계산에 쓴 입력값을 사람이 읽을 수 있게 적은 것 */
  birthText: string;
  summary: FreeSummary;
  saju: SajuResult;
  /** 대운 방향 · 배우자 별 해석에만 쓴다. 아직 묻지 않으므로 null (성별 문항은 다음 단계) */
  gender: "male" | "female" | null;
  /** 시기 해석 기준 연 · 월 (없으면 지금, 한국 날짜 기준) */
  reference?: { year: number; month: number };
  /** 내 고민 자세히 알려주기 (선택) — 해석의 초점과 예시에만 쓴다. 근거가 아니다 */
  context: (PersonalContextInput & { updatedAt?: string }) | null;
};

/** 고민 반영 리포트를 쓸 때 받는 값 — 같은 검사 · 같은 사주에 "발급 당시 고민"을 얹는다 */
export type ConcernInput = Pick<ReportInput, "nickname" | "knownMbti" | "summary" | "saju" | "gender" | "reference"> & {
  /** 발급 당시의 고민 (저장본) — 지금 고민이 아니다 */
  concern: PersonalContextInput;
  snapshot: { recordId: string; writtenAt: string };
  /** 이미 준 개인 종합 리포트의 글 — 되풀이하지 않기 위한 기준 (없으면 중복 검사를 건너뛴다) */
  base: { headline: string; summary: string[]; sections: string[]; actions: string[]; all: string[] } | null;
  /** 이전에 발급한 고민 반영 리포트 (이번 고민과 다른 글이 되도록 알려 주는 용도) */
  previous: { topic: ContextTopic; headline: string; texts: string[] }[];
};

/** 개인 종합 리포트 생성 결과 (개발용 v1 · AI v2) */
export type ReportContent = FullReport | PersonalReportV2;
/** 저장 · 열람하는 모든 리포트 (개인 종합 + 고민 반영) */
export type AnyReportContent = ReportContent | ConcernReportV1;

export const isPersonalV2 = (c: AnyReportContent): c is PersonalReportV2 => "kind" in c && c.kind === "personal-v2";

/** AI 호출 한 번의 사용 기록 — 비용 계산과 운영 점검에 쓴다. 입력 · 출력 내용은 담지 않는다 */
export type AiUsageSample = {
  provider: string;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  /** ok: 형식 검사 통과 · invalid: 응답은 왔지만 형식 검사 실패 · timeout: 시간 초과 · error: 그 밖의 호출 오류 */
  outcome: "ok" | "invalid" | "timeout" | "error";
  errorCode: string | null;
};

/** 생성 한 번에 딸려 가는 값 — 중단 신호와 사용 기록 수신 */
export type GenerateContext = {
  /** 시간 제한 등으로 생성을 그만둬야 할 때 신호가 켜진다 (남은 AI 호출을 멈춘다) */
  signal?: AbortSignal;
  onUsage?: (usage: AiUsageSample) => void;
};

export interface ReportGenerator {
  /** 저장할 때 함께 기록하는 생성기 이름과 버전 */
  readonly name: string;
  readonly version: string;
  /** 내 고민 자세히 알려주기 내용을 해석에 반영하는지 (개발용 규칙 생성기는 반영하지 않는다) */
  readonly usesContext?: boolean;
  generate(input: ReportInput, ctx?: GenerateContext): Promise<ReportContent>;
  /** 고민 반영 리포트 (없으면 이 생성기로는 고민 리포트를 발급할 수 없다 — 개발용 규칙 생성기) */
  generateConcern?(input: ConcernInput, ctx?: GenerateContext): Promise<ConcernReportV1>;
}
