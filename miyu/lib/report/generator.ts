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
  /** 나를 더 반영하기 (선택) — 해석의 초점과 예시에만 쓴다. 근거가 아니다 */
  context: (PersonalContextInput & { updatedAt?: string }) | null;
};

export type ReportContent = FullReport | PersonalReportV2;

export const isPersonalV2 = (c: ReportContent): c is PersonalReportV2 => "kind" in c && c.kind === "personal-v2";

export interface ReportGenerator {
  /** 저장할 때 함께 기록하는 생성기 이름과 버전 */
  readonly name: string;
  readonly version: string;
  /** 나를 더 반영하기 내용을 해석에 반영하는지 (개발용 규칙 생성기는 반영하지 않는다) */
  readonly usesContext?: boolean;
  generate(input: ReportInput): Promise<ReportContent>;
}
