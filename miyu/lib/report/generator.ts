// 리포트 생성기 연결 지점.
// 지금은 규칙 기반 개발용 생성기(generate-dev-report.ts)를 쓰고,
// 이후 "구조화된 결과 → AI 해석" 생성기를 같은 인터페이스로 바꿔 끼운다.

import type { SajuResult } from "../saju/engine.ts";
import type { FreeSummary, FullReport } from "./types.ts";

export type ReportInput = {
  nickname: string;
  knownMbti: string | null;
  /** 사주 계산에 쓴 입력값을 사람이 읽을 수 있게 적은 것 */
  birthText: string;
  summary: FreeSummary;
  saju: SajuResult;
};

export interface ReportGenerator {
  /** 저장할 때 함께 기록하는 생성기 이름과 버전 */
  readonly name: string;
  readonly version: string;
  generate(input: ReportInput): Promise<FullReport>;
}
