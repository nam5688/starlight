// 리포트 생성기 연결 지점.
// - 개발용 규칙 생성기(generate-dev-report.ts) → FullReport (v1 화면)
// - AI 생성기(ai/generator.ts) → PersonalReportV2 (계산 결과 → 근거 → AI 서술 → 형식 검사)
// 저장된 리포트는 kind로 구분해 그대로 다시 보여준다 (v1에는 kind가 없다).

import type { PersonalContextInput } from "../personalization/context.ts";
import type { SajuResult } from "../saju/engine.ts";
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
  /** 나를 더 반영하기 (선택) — 해석의 초점과 예시에만 쓴다. 근거가 아니다 */
  context: (PersonalContextInput & { updatedAt?: string }) | null;
};

export type ReportContent = FullReport | PersonalReportV2;

export const isPersonalV2 = (c: ReportContent): c is PersonalReportV2 => "kind" in c && c.kind === "personal-v2";

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
  /** 나를 더 반영하기 내용을 해석에 반영하는지 (개발용 규칙 생성기는 반영하지 않는다) */
  readonly usesContext?: boolean;
  generate(input: ReportInput, ctx?: GenerateContext): Promise<ReportContent>;
}
