// 실행: npm test — 상황형 28문항 질문 화면 · 공개 안내 · 임시 보관의 약속을 소스로 확인한다(브라우저를 띄우는 시험은 scripts/qa-*에 따로 있다). 비용 0.
import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { ASSESSMENT } from "../../config/product.ts";
import { EMPTY_BASIC_INFO } from "../../profile/basic-info.ts";
import { parseDraft, serializeDraft } from "../../profile/draft.ts";
import { readSource } from "../../report/test-source.ts";
import { SITUATIONAL_V2_ITEMS } from "../drafts/situational-v2-draft.ts";
import { SITUATIONAL_CHECKED, SITUATIONAL_DEVELOPMENT, SITUATIONAL_NOT_CHECKED, SITUATIONAL_SOURCES, SITUATIONAL_WHAT, situationalVersionRows } from "./basis.ts";
import { SCENE_IDS } from "./reading.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const NOW = 1_800_000_000_000;
const info = { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12" };

test("질문 화면: 지금 보여 주는 질문은 상황형 28문항이고(한 줄로 되돌릴 수 있다), 장면마다 선택지는 원문 네 개뿐이며 점수 · 유형 · 읽는 방향은 화면에 없다", () => {
  assert.equal(ASSESSMENT.active, "situational-28");
  const withComments = readSource(join(root, "components", "analyze", "scene-step.tsx"));
  const src = withComments.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /type="radio"/);
  assert.match(src, /item\.options\.map/, "선택지는 원문 선택지 그대로(다섯째 선택지를 더하지 않는다)");
  for (const bad of ["점수", "score", "유형", "성향을 읽", "해당 없음", "맞는 선택지가 없", "거의 없었어요"]) assert.ok(!src.includes(bad), `질문 화면에 ${bad}`);
  for (const item of SITUATIONAL_V2_ITEMS) assert.equal(item.options.length, 4, item.id);
  const flow = readSource(join(root, "components", "analyze", "analyze-flow.tsx"));
  assert.match(flow, /ASSESSMENT\.active/);
  assert.match(flow, /SceneStep/);
  // 질문 화면의 안내는 짧게 — 질문 버전 번호 같은 개발 내역을 보이지 않는다
  assert.match(withComments, /미유 성향 질문 · 개발용 예시 · 진단 아님/);
  assert.ok(!/situational-v2-live|SITUATIONAL_CONTENT_VERSION/.test(src), "버전 문자열을 질문 화면에 보이지 않는다");
  // 단계 이름은 무엇을 재는지 알려 주지 않는 중립 이름("질문 1")이다
  assert.match(flow, /label: `질문 \$\{i \+ 1\}`/);
});

test("이 탭의 임시 보관: 같은 질문의 응답(선택지 1~4)만 복원하고, 다른 질문(22문항)에 답하던 보관값은 기본 정보만 살리고 응답은 환산하지 않고 버린다", () => {
  const sceneAnswers = Object.fromEntries(SCENE_IDS.map((id) => [id, 2]));
  const raw = serializeDraft({ step: 3, info, answers: sceneAnswers, assessment: "situational-28" }, NOW);
  const d = parseDraft(raw, NOW + 1000, 5, "situational-28");
  assert.ok(d);
  assert.equal(Object.keys(d.answers).length, 28);
  assert.equal(d.step, 3);
  // 범위 밖 · 모르는 키는 거른다 (28문항은 1~4만)
  const odd = parseDraft(JSON.stringify({ v: 1, savedAt: NOW, step: 1, info, assessment: "situational-28", answers: { s01: 5, s02: 0, s03: 2, m1: 3, hack: 1 } }), NOW, 5, "situational-28");
  assert.deepEqual(odd?.answers, { s03: 2 });
  // 예전 22문항에 답하던 보관값(표시 없음)은 28문항 화면에서 응답을 버리고 첫 질문 단계까지만 돌아온다
  const old = parseDraft(JSON.stringify({ v: 1, savedAt: NOW, step: 3, info, answers: { m1: 4, t1: 2 } }), NOW, 5, "situational-28");
  assert.ok(old);
  assert.deepEqual(old.answers, {});
  assert.equal(old.step, 1);
  assert.equal(old.info.nickname, "지민", "기본 정보는 살린다");
  // 22문항 화면(되돌린 경우)은 예전 그대로
  const same22 = parseDraft(JSON.stringify({ v: 1, savedAt: NOW, step: 2, info, answers: { m1: 4 } }), NOW, 3);
  assert.deepEqual(same22?.answers, { m1: 4 });
  assert.equal(same22?.assessment, "likert-22");
  // 28문항 보관값을 22문항 화면이 읽으면 응답을 버린다
  assert.deepEqual(parseDraft(raw, NOW + 1000, 3)?.answers, {});
});

test("공개 안내(상황형 28문항 판): 있는 그대로만 적는다 — 문항은 AI 추천 후보라 직접 쓴 문항이라 말하지 않고, 하지 않은 검토 · 검증 · 이용 허락을 했다고 쓰지 않는다", () => {
  const text = [...SITUATIONAL_WHAT, ...SITUATIONAL_DEVELOPMENT, ...SITUATIONAL_CHECKED, ...SITUATIONAL_NOT_CHECKED, ...SITUATIONAL_SOURCES.flatMap((s) => [s.name, s.used, s.scope])].join("\n");
  assert.match(text, /미유가 처음부터 직접 쓴 문항이라고 말하지 않아요/);
  assert.match(text, /외부 AI 도구/);
  assert.match(text, /읽는 방법[^\n]*설계/);
  assert.match(text, /사람들에게 시험해 보지 않은 설계/);
  // 짧게: 공개 안내 본문(질문 설명 · 만든 방법 · 자료 · 확인한 것/못 한 것)은 길게 늘어놓지 않는다(운영자 2026-10-20) — 비진단 자기이해 서비스라는 점이 먼저다
  assert.ok(text.length <= 1300, `공개 안내가 너무 길다: ${text.length}자`);
  assert.match(SITUATIONAL_WHAT.join("\n"), /진단이 아니라 자기 이해를 돕는 서비스/);
  assert.ok(SITUATIONAL_DEVELOPMENT.length <= 2 && SITUATIONAL_CHECKED.length <= 2 && SITUATIONAL_NOT_CHECKED.length <= 2 && SITUATIONAL_SOURCES.length <= 2);
  assert.ok(!/자동 테스트|저장소|파일|OpenPsychometrics|글자까지|보존/.test(text), "개발 내부 사정(파일 · 저장소 · 테스트)을 고객 글에 늘어놓지 않는다");
  for (const bad of [/전문가(의)? (검토|감수)(를|가)? (받았|마쳤|거쳤|완료)/, /(검증|검토)(을)? (마쳤|거쳤|완료)/, /이용 허락을 (받았|얻었)/, /검증된 (검사|문항)/, /정확도가 높/, /과학적으로 검증/]) assert.ok(!bad.test(text), `쓰면 안 되는 표현: ${bad}`);
  assert.ok(SITUATIONAL_NOT_CHECKED.some((t) => /신뢰도 · 타당도/.test(t) && /정확도를 말할 수 없어요/.test(t)));
  assert.ok(SITUATIONAL_NOT_CHECKED.some((t) => /닮았는지/.test(t)), "문장의 독립성을 확인하지 못했다고 적는다");
  assert.ok(SITUATIONAL_SOURCES.some((s) => /이용 허락을 받지 않았/.test(s.scope)), "공식 검사는 이용 허락을 받지 않았다고 적는다");
  // 문항 문장 · 장면은 공개 안내에 싣지 않는다
  for (const item of SITUATIONAL_V2_ITEMS) assert.ok(!text.includes(item.scene) && item.options.every((o) => !text.includes(o)), item.id);
  const versions = situationalVersionRows();
  assert.ok(versions.every((v) => v.version.length > 3));
  assert.ok(versions[0].version.includes("situational-v2-live"));
  const page = readSource(join(root, "app", "assessment-basis", "page.tsx"));
  assert.match(page, /ASSESSMENT\.active === "situational-28"/, "안내 글은 지금 화면의 질문 버전을 따른다");
});
