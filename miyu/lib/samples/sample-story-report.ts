// 영역별 이야기(story-v1) 예시 리포트 — 가상 인물 서윤. 실제 생성과 같은 조립 코드(assembleStory)로 만든다.
// 본문(sample-story-draft.ts)은 시험용 대리 작성기가 쓴 초안이며 실제 서비스 AI의 글이 아니다. 이름표 · 묶음 · 분석 근거 · 안내 · 큰 흐름 타임라인은 코드가 근거 목록과 계산 결과로 채운다.
// 개발용 화면 /dev/story와 시험에서만 쓴다 — /report/sample(읽기 구조 v1)은 바뀌지 않는다.
import { assembleStory } from "../report/reading/story-assemble.ts";
import { STORY_PROMPT_VERSION } from "../report/reading/story-plan.ts";
import type { IntegratedReadingReport } from "../report/reading/types.ts";
import { SAMPLE_STORY_DRAFT } from "./sample-story-draft.ts";
import { SAMPLE_EVIDENCE, TIMELINE_REFERENCE } from "./sample-reading-report.ts";
import { SAMPLE_CHART, sampleReport } from "./sample-report.ts";

const assembled = assembleStory({
  draft: SAMPLE_STORY_DRAFT,
  evidence: SAMPLE_EVIDENCE,
  input: { nickname: "서윤", knownMbti: "INFJ", summary: sampleReport, saju: SAMPLE_CHART, context: null } as never,
  reference: { ...TIMELINE_REFERENCE, iso: "2026-10-12" },
  promptVersion: STORY_PROMPT_VERSION,
  ruleVersions: [],
});

// 예시 화면은 저장된 리포트에만 붙는 값(원본 요약 · 계산 결과 · 생성 정보)을 쓰지 않는다
const { saju: _saju, base: _base, extras: _extras, generated: _generated, ...rest } = assembled;
void [_saju, _base, _extras, _generated];

export const sampleStoryReport: IntegratedReadingReport = { ...rest, source: "sample" };
