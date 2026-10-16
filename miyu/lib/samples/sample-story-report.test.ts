// 실행: npm test — 영역별 이야기(story-v1) 예시(가상 인물 서윤)가 실제 생성기의 검사를 그대로 통과하고, 같은 조립 코드로 저장 모양을 만들며,
// 글 칸 수 · 시기 이야기의 위치 · 맺음 틀 · 알파벳 코드가 규칙대로인지 확인한다. 본문은 시험용 대리 작성기가 쓴 초안이며 이 검사는 좋은 글의 보증이 아니다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkReadingDepth } from "../report/reading/depth.ts";
import { findRepeatedPhrasesIn } from "../report/reading/repeat.ts";
import { PERIOD_TALK, STORY_LIMITS } from "../report/reading/story-plan.ts";
import { storyDepthSource } from "../report/reading/story-assemble.ts";
import { validateStoryDraft, visibleStoryTexts } from "../report/reading/story-validate.ts";
import { isReadingReport, isStoryReport } from "../report/reading/types.ts";
import { SAMPLE_EVIDENCE } from "./sample-reading-report.ts";
import { SAMPLE_STORY_DRAFT } from "./sample-story-draft.ts";
import { sampleStoryReport as R } from "./sample-story-report.ts";

test("예시 본문 초안이 실제 생성기의 형식 검사(validateStoryDraft)를 그대로 통과한다", () => {
  const v = validateStoryDraft(structuredClone(SAMPLE_STORY_DRAFT), SAMPLE_EVIDENCE, { hasContext: false });
  assert.ok(v.ok, v.ok ? "" : v.errors.join("\n"));
});

test("내용 검사(조건 · 범용 문장 · 부분끼리 겹침)를 넘기고 12자 이상 되풀이는 한 곳(입력 성향 소개 문구)뿐이다", () => {
  const d = checkReadingDepth({ draft: storyDepthSource(SAMPLE_STORY_DRAFT) });
  assert.ok(d.pass, d.flags.map((f) => `${f.severity}:${f.id}`).join(","));
  assert.ok(d.metrics.conditionRatio >= 0.5, `조건 문장 비율 ${d.metrics.conditionRatio}`);
  const reps = findRepeatedPhrasesIn(visibleStoryTexts(SAMPLE_STORY_DRAFT));
  assert.ok(reps.length <= 1, reps.map((r) => r.phrase).join(" / "));
});

test("조립한 예시는 영역별 이야기 모양이고 저장된 리포트에만 붙는 값이 없다", () => {
  assert.ok(isReadingReport(R) && isStoryReport(R));
  assert.equal(R.source, "sample");
  assert.deepEqual(R.blocks.map((b) => b.id), ["tendency", "love", "work-money"]);
  assert.equal(R.actions.length, STORY_LIMITS.actions.count);
  assert.ok(new Set(R.actions.map((a) => a.area)).size >= 2, "행동이 영역 둘 이상에서 나온다");
  assert.ok(!("saju" in R && R.saju) && !("generated" in R && R.generated));
});

test("글 칸이 영역 문단으로 묶여 있다 — 이전 읽기 구조의 98칸 대신 40칸 안쪽", () => {
  const n = visibleStoryTexts(SAMPLE_STORY_DRAFT).length;
  assert.ok(n <= 40, `글 칸 ${n}개`);
});

test("시기 이야기(대운 · 세운 · 올해 · 연도)는 흐름 영역에만 있다", () => {
  for (const a of SAMPLE_STORY_DRAFT.areas) for (const p of a.paragraphs) assert.ok(!PERIOD_TALK.test(p), `${a.id}: ${p.slice(0, 30)}`);
  assert.ok(SAMPLE_STORY_DRAFT.flow.paragraphs.some((p) => PERIOD_TALK.test(p)));
});

test("알파벳 유형 코드와 이름은 본문에 없고 입력한 MBTI는 둘 이상의 영역에서 \"입력해 주신 성향\"으로 쓰인다", () => {
  const body = visibleStoryTexts(SAMPLE_STORY_DRAFT).map((t) => t.text).join("\n");
  assert.ok(!/\b[EI][NS][TF][JP]\b/.test(body));
  assert.ok(!body.includes("서윤"));
  const mbtiAreas = SAMPLE_STORY_DRAFT.areas.filter((a) => a.paragraphs.some((p) => /입력해 주신/.test(p)));
  assert.ok(mbtiAreas.length >= 2, `MBTI를 쓴 영역 ${mbtiAreas.length}개`);
});
