// 리포트 예시(개인 통합 리포트 · 읽기 구조) — 가상 인물 서윤. 실제 검사 · 실제 서비스 AI의 출력이 아니라, 미유가 목표로 하는 리포트 형식의 예시다. 운영 데이터와 섞지 않는다.
// 서윤의 원국은 만세력 엔진 계산, 응답은 개발용 예시 문항에 가상으로 답한 값(sample-report.ts)이며, 결론은 그 근거 문구가 말하는 범위 안에서만 쓰였다.
//
// 이 예시는 실제 생성과 같은 길로 만든다(운영자 방향 2026-10-16: 예시와 실제 생성의 기준이 같아야 한다):
//   본문 초안(sample-reading-draft.ts — 서윤의 근거 목록으로 쓴 AI 초안 형식) → 실제 생성기가 쓰는 조립 코드(assembleReading)
//   → 이름표 · 묶음 · 접어 둔 "분석 근거"(계산 결과 · 전통 해석 · 응답 · 모르는 것) · 안내 · 큰 흐름 타임라인 · 월별 달력 · 참고한 자료 목록은 모두 코드가 근거 목록과 계산 결과로 채운다.
// 그래서 예시의 분석 근거는 사람이 쓴 글이 아니라 서윤의 근거 문구에서 나온 것이고, 실제 리포트와 같은 모양이다.
// 이 예시는 실제 생성기가 쓰는 검사(reading/validate.ts)를 그대로 통과해야 한다(sample-reading-report.test.ts).
// 서윤의 근거에 없는 내용(예: 개발용 MBTI 축 점수)은 쓰지 않았다. 사주 용어 · 응답 점수는 본문에 쓰지 않고 접어 둔 "분석 근거"에만 있다.
import { buildEvidence } from "../report/ai/generator.ts";
import { assembleReading } from "../report/reading/assemble.ts";
import { READING_PROMPT_VERSION } from "../report/reading/prompt.ts";
import type { IntegratedReadingReport, ReadingDraftV1 } from "../report/reading/types.ts";
import { SAMPLE_READING_DRAFT } from "./sample-reading-draft.ts";
import { SAMPLE_CHART, sampleReport } from "./sample-report.ts";

/** 큰 흐름 카드에 쓰는 기준 월 — 이 달에 지나는 구간을 현재로 본다 */
export const TIMELINE_REFERENCE = { year: 2026, month: 10 };

/** 서윤의 근거 목록 — 실제 생성기가 AI에게 주는 것과 같은 함수(buildEvidence)로 만든다 */
export const SAMPLE_EVIDENCE = buildEvidence({ knownMbti: "INFJ", summary: sampleReport, saju: SAMPLE_CHART, gender: "female" } as never, TIMELINE_REFERENCE);

const assembled = assembleReading({
  draft: SAMPLE_READING_DRAFT,
  evidence: SAMPLE_EVIDENCE,
  input: { nickname: "서윤", knownMbti: "INFJ", summary: sampleReport, saju: SAMPLE_CHART, context: null } as never,
  reference: { ...TIMELINE_REFERENCE, iso: "2026-10-12" },
  promptVersion: READING_PROMPT_VERSION,
  ruleVersions: [],
});

// 예시 화면은 저장된 리포트에만 붙는 값(원본 요약 · 계산 결과 · 생성 정보)을 쓰지 않는다
const { saju: _saju, base: _base, extras: _extras, generated: _generated, ...rest } = assembled;
void [_saju, _base, _extras, _generated];

export const sampleReadingReport: IntegratedReadingReport = { ...rest, source: "sample" };

/**
 * 이 예시의 본문을 AI가 돌려주는 초안 형식(ReadingDraftV1)으로 돌려준다 — 실제 생성기와 같은 형식 검사 · 내용 검사에 넣어 보고(sample-reading-report.test.ts),
 * 가짜 모델이 이 초안을 돌려줬을 때 생성기가 예시와 같은 구조의 리포트를 만드는지 확인하는 데(reading.test.ts) 쓴다. 화면에는 쓰지 않는다.
 */
export function sampleReadingAsDraft(): ReadingDraftV1 {
  return structuredClone(SAMPLE_READING_DRAFT);
}
