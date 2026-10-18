// 고객이 읽는 글(story-7 지시문 0.7) — 운영자 조율 2026-10-18. 실제 AI는 부르지 않는다(모의 작성기와 편집 시안만).
// 이 시험이 통과해도 실제 AI의 글이 고객용 서술로 나온다는 뜻이 아니다 — 실제 AI로는 아직 한 번도 시험하지 못했다(검증되지 않음).
//  · 번역 예시표(life-words.ts)가 일대일 번역표가 아니라 표현 예시이고 표 자체에 명리 말이 새지 않는다
//  · 지시문 0.7이 옛 용어 지시를 남기지 않고 BLOCK 취지(없는 근거 · 가족 · 설문 · 이름)를 그대로 가진다
//  · 본문에 새어 나온 명리 말은 경고(WARN)로만 세고 BLOCK은 하나도 늘리거나 줄이지 않는다
//  · "없음 · 부족" BLOCK이 생활 말로 옮긴 문장에도 걸린다 — 오탐(정상 문장)과 미탐(우회 표현)을 같이 적는다
//  · 이름이 없어도 {name} 또는 빈 "님"이 화면에 남지 않는다
import assert from "node:assert/strict";
import test from "node:test";
import { buildPersonas } from "../ai/compare-personas.ts";
import { buildEvidence } from "../ai/generator.ts";
import { customerVoiceLeaks, customerVoiceMessage } from "./customer-voice.ts";
import { HOUR_SCOPE_MARK, hourUnknownErrors, NONE_CLAIM } from "./hour-scope.ts";
import { LIFE_ABSENT_SOURCE, LIFE_POWER_SOURCE, LIFE_WORDS7, lifeWordsPrompt } from "./life-words.ts";
import { fillNameInJson, honorific } from "./name-fill.ts";
import { JARGON } from "./plan.ts";
import { renderStory7DraftMarkdown } from "./render-draft.ts";
import { absenceErrors } from "./story-validate.ts";
import { assembleStory7, fillStory7Name } from "./story7-assemble.ts";
import { composeMockStory7 } from "./story7-mock-model.ts";
import { STORY7_CAVEAT, STORY7_PROMPT_VERSION, STORY7_TERMS } from "./story7-plan.ts";
import { buildStory7UserMessage, STORY7_SYSTEM_PROMPT } from "./story7-prompt.ts";
import { validateStory7Draft } from "./story7-validate.ts";
import { isTermWarning } from "./warn-policy.ts";
import type { Story7DraftV1 } from "./types.ts";

const P01 = buildPersonas(10)[0];
const REF = { year: 2026, month: 10 };
const EVIDENCE = buildEvidence(P01.input, REF, { fortune: true });
const mockDraft = (): Story7DraftV1 => structuredClone(composeMockStory7(buildStory7UserMessage(EVIDENCE, "2026-10-17", P01.input.context)));
const section = (d: Story7DraftV1, no: number) => d.sections.find((s) => s.no === no)!;
const setPara = (d: Story7DraftV1, no: number, text: string, at = 0) => {
  const s = section(d, no);
  if (s.parts) s.parts[0].paragraphs[at] = text;
  else s.paragraphs![at] = text;
};
const validate = (d: Story7DraftV1) => validateStory7Draft(d, EVIDENCE, { hasContext: Boolean(P01.input.context) });
const blocksOf = (d: Story7DraftV1) => {
  const r = validate(d);
  return r.ok ? [] : r.errors;
};

// ───── 표현 예시표 ─────

/** 표의 "용어=고객 말" 중 고객 말 쪽(= 앞의 라벨은 내부 용어다) */
const phrasesOf = (say: string[]) => say.map((x) => (x.includes("=") ? x.split("=")[1] : x));

test("표현 예시표: 고객이 읽는 말 쪽에는 명리 용어 · 한자 · 간지가 없다", () => {
  for (const w of LIFE_WORDS7) for (const phrase of phrasesOf(w.say)) {
    assert.deepEqual(customerVoiceLeaks(phrase, { allowElementTalk: true }), [], `${w.term} → ${phrase}`);
    assert.ok(!JARGON.test(phrase), phrase);
  }
});

test("표현 예시표: 일대일 번역표가 아니라 표현 예시이고 사건 · 직업 · 가족 한 사람으로 옮기지 않는다", () => {
  const prompt = lifeWordsPrompt();
  assert.match(prompt, /일대일 번역표가 아니다/);
  assert.match(prompt, /근거에 이미 생활 말.*그 말을 먼저 쓴다/);
  assert.match(prompt, /특정 사건 · 특정 직업 · 특정 가족 구성원으로 옮기지 않는다/);
  // 표에는 사건(헤어짐 · 퇴사 · 결혼 …) · 직업 이름 · 가족 호칭이 없다
  const all = LIFE_WORDS7.flatMap((w) => phrasesOf(w.say)).join(" ");
  assert.doesNotMatch(all, /헤어|이별|퇴사|결혼|이혼|창업|합격|어머니|아버지|부모|형제|의사|교사|개발자/);
  // 한 용어에 경향의 말이 하나만 있는 것이 아니라 문맥에 맞게 고르도록 둘 이상(또는 힘의 말) 있다
  for (const w of LIFE_WORDS7.filter((x) => !["일지(배우자 자리)"].includes(x.term))) assert.ok(w.say.length >= 1, w.term);
});

test("표현 예시표: 없음 검사에 쓰는 어구(stems)는 명리 말이 없는 생활 말이고, 항목마다 표의 말에서 하나 이상 나온다", () => {
  for (const w of LIFE_WORDS7.filter((x) => x.stems?.length)) {
    const phrases = phrasesOf(w.say).join(" | ");
    for (const stem of w.stems!) assert.deepEqual(customerVoiceLeaks(stem, { allowElementTalk: true }), [], `${w.term}: ${stem}`);
    assert.ok(w.stems!.some((stem) => phrases.includes(stem)), `${w.term}: 표의 말과 겹치는 어구가 없다`);
  }
});

// ───── 지시문 0.7 ─────

test("지시문 0.7: 버전 · 새 블록 · 옛 용어 지시가 남지 않음", () => {
  assert.equal(STORY7_PROMPT_VERSION, "story-7-prompt-0.7");
  assert.match(STORY7_SYSTEM_PROMPT, /\[고객이 읽는 글 — 풀이는 사주로 하고, 글은 이 사람의 이야기로 쓴다/);
  assert.match(STORY7_SYSTEM_PROMPT, /\[표현 예시 — 명리 말을 옮길 때의 참고다/);
  assert.match(STORY7_SYSTEM_PROMPT, /\[명리 용어 — 본문에는 쓰지 않는다\]/);
  for (const old of [
    "[사주 용어 — 필요하면 쓰고, 처음 쓸 때 바로 풀어 준다]",
    "풀이에 필요한 용어는 풀이와 함께 쓴다",
    "용어는 처음 쓸 때 풀이를 붙여",
    "용어는 풀이를 붙여 쓰되 나열하지 않는다",
    "한 문장에 용어는 3개까지만 쓴다",
    "한 문단에서 새로 설명하는 용어는 4개까지",
    "한 문단에 새로 설명하는 사주 용어는",
    "사주 용어는 필요하면 쓰고 처음 쓸 때 일상의 말로 풀어 준다",
    "(원국 글자 몇 개)",
    "(시주에 있을 수 있어요)",
    "이 기운이 원국에 적어서",
    "\"사주에서는 ~로 읽히는데, 평소 행동에서는",
    "관성이 많아 책임을 크게 진다",
  ]) assert.ok(!STORY7_SYSTEM_PROMPT.includes(old), `옛 문장이 남아 있다: ${old}`);
});

test("지시문 0.7: D-A · D-B 규칙이 한 곳에 있다(사람 이야기로 시작 · 오행 이름 최소 · 일대일 단정 금지 · 없는 설문 · 과거 · 가족 · 이름)", () => {
  const p = STORY7_SYSTEM_PROMPT;
  assert.match(p, /본문의 첫 문장과 모든 제목.*사람의 성향 · 경험 · 관계 · 기회 이야기로 바로 시작한다/);
  assert.match(p, /오행의 한글 이름.*해설의 주인공으로 쓰지 않는다.*6번 개운 문단/);
  assert.match(p, /용어 하나를 특정 사건 · 직업 · 가족 한 사람으로 옮기지 않는다/);
  assert.match(p, /근거 목록에 그 항목이 실제로 있고 그 장의 주제와 맞닿을 때만/);
  assert.match(p, /없는 응답을 만들지 않고, 응답이 없는 장에서는 응답 이야기를 하지 않는다/);
  assert.match(p, /지난 일 · 가족 구성 · 관계의 좋고 나쁨 · 입력받지 않은 사건과 사람을 있었던 일처럼 만들지 않는다/);
  assert.match(p, /생활 조언만 이어 붙이지 않는다/);
  assert.match(p, /이름이 없는 입력도 있으니 "\{name\} 님"을 빼도 문장이 성립하게 쓴다/);
  // 기존 안전 규칙은 그대로다
  assert.match(p, /격국 · 용신 · 희신 · 기신 · 신살/);
  assert.match(p, /가족은 "전통에서는 ~로 읽어요 · ~기 쉬워요"로만 쓴다/);
  assert.match(p, /첫 문장은 이 장의 핵심 사주풀이 결론/);
});

test("지시문 0.7: 근거는 바꾸지 않았다 — 사용자 메시지의 근거 ID · fact · cue · terms는 그대로 건넨다", () => {
  const msg = buildStory7UserMessage(EVIDENCE, "2026-10-17", P01.input.context);
  const payload = JSON.parse(msg.slice(msg.indexOf("{"))) as { evidence: { id: string; fact: string; cue: string }[]; terms: unknown[] };
  assert.equal(payload.evidence.length, EVIDENCE.length);
  for (const [i, e] of EVIDENCE.entries()) {
    assert.equal(payload.evidence[i].id, e.id);
    assert.equal(payload.evidence[i].fact, e.fact);
    assert.equal(payload.evidence[i].cue, e.cue);
  }
  assert.ok(payload.terms.length > 0, "terms 사전은 읽는 자료로 그대로 간다");
});

test("용어 한도(한 문장 3 · 한 문단 4 · 첫 문단 2)는 그대로이고 경고(WARN)로만 센다", () => {
  assert.deepEqual({ ...STORY7_TERMS }, { perSentenceMax: 3, perParagraphMax: 4, firstParagraphMax: 2 });
});

// ───── 용어 노출 WARN ─────

test("용어 노출 지표: 한자 · 간지 · 십성 · 구조 이름은 세고, 생활 말은 세지 않는다", () => {
  assert.deepEqual(customerVoiceLeaks("만들어 낸 것이 돈이나 평가로 돌아오는 쪽에 가까워요."), []);
  assert.deepEqual(customerVoiceLeaks("가까운 사람 앞에서는 속도를 천천히 맞추려는 편이에요."), []);
  assert.ok(customerVoiceLeaks("편재가 지장간에 숨어 있어요.").includes("편재"));
  assert.ok(customerVoiceLeaks("일주 · 월주 이름은 정축일이에요.").some((x) => /정축/.test(x)));
  assert.ok(customerVoiceLeaks("마음이 木처럼 자라요.").includes("한자"));
  // "정화하다"처럼 일상어는 걸리지 않는다
  assert.deepEqual(customerVoiceLeaks("마음을 정화하는 시간이 필요해요."), []);
  assert.deepEqual(customerVoiceLeaks("일주일에 한 번은 쉬는 날을 두세요."), []);
});

test("용어 노출 지표: 오행의 한글 이름은 6번 개운 문단에서만 허용한다", () => {
  const t = "타고난 바탕에 물의 기운이 적은 편이라 전통에서는 일상에서 보태 주면 균형이 맞는다고 읽어요.";
  assert.ok(customerVoiceLeaks(t).some((x) => /물의 기운/.test(x)));
  assert.deepEqual(customerVoiceLeaks(t, { allowElementTalk: true }), []);
});

test("용어 노출은 경고(WARN)일 뿐 BLOCK이 아니다 — 저장을 막지 않고 BLOCK 목록에 들어가지 않는다", () => {
  const found = customerVoiceLeaks("편재와 지장간이 보여요.");
  assert.ok(isTermWarning(customerVoiceMessage("sections.2.paragraphs[0]", found)));
  const d = mockDraft();
  setPara(d, 2, "{name} 님의 정축일 사주에서는 편재가 지장간에 숨어 있다고 전통에서 읽어요. 그래서 한꺼번에 들어오는 일은 늦게 보이는 편이에요. 이 말은 그 시기에 그 주제가 크게 느껴질 수 있다는 정도예요.");
  const r = validate(d);
  const warnings = r.warnings;
  assert.ok(warnings.some((m) => m.includes("본문에 명리 용어(")), "새 지표가 경고로 센다");
  const errors = r.ok ? [] : r.errors;
  assert.ok(!errors.some((m) => m.includes("본문에 명리 용어(")), "BLOCK 목록에는 없다");
});

test("BLOCK 정책은 낮추지 않았다 — 용어를 쓴 옛 단정은 그대로 막는다", () => {
  assert.ok(absenceErrors(["재성이 없어서 돈 관리가 약해요."], "w", { relaxed: true }).length > 0);
  assert.ok(absenceErrors(["수 기운이 없어서 쉬는 힘이 없어요."], "w", { relaxed: true }).length > 0);
  assert.ok(hourUnknownErrors([{ where: "w", text: "식상이 없어요." }]).length > 0);
  assert.ok(hourUnknownErrors([{ where: "w", text: "재성이 적어요." }]).length > 0);
  assert.equal(hourUnknownErrors([{ where: "w", text: "출생 시각을 몰라 확인되는 범위에서는 식상이 보이지 않아요." }]).length, 0);
});

// ───── 생활 말로 옮긴 "없음 · 부족" 문장 — 오탐 · 우회 ─────

const absent = (s: string) => absenceErrors([s], "w", { relaxed: true }).length > 0;
const noneClaim = (s: string) => hourUnknownErrors([{ where: "w", text: s }]).length > 0;

test("없는 기운 단정: 표현 예시의 말을 따라 쓴 단정은 막는다", () => {
  for (const s of [
    "돈을 다루는 감각이 없어서 돈 관리가 어려워요.",
    "생각을 말이나 결과물로 내보내는 힘이 부족해서 결국 약해져요.",
    "물의 기운이 없어서 쉬어 가는 힘이 약해요.",
    "밀고 가는 힘이 보이지 않아서 시작을 못 해요.",
    "생각하고 쉬어 가는 힘이 부족한 편이에요.",
  ]) assert.ok(absent(s), s);
});

test("없는 기운 단정: 정상 생활 문장은 막지 않는다(오탐 확인)", () => {
  for (const s of [
    "돈을 다루는 감각이 꾸준한 편이라 모으는 쪽이 편해요.",
    "생각을 말이나 결과물로 내보내는 힘이 있어서 아이디어를 보여 주는 자리에서 편해요.",
    "물의 기운이 적은 편이라 전통에서는 일상에서 보태 주면 균형이 맞는다고 읽어요.",
    "물의 기운이 적을 때는 쉬는 시간이 줄기 쉬워요.",
    "쉬어 가는 힘을 일부러 챙기면 좋아요.",
    "책임과 평가를 받아들이는 방식이 천천히 자리 잡는 편이에요.",
    "주말에는 시간이 없어서 약속을 줄이는 편이에요.",
    "돈이 없어서 걱정하는 때가 있어도 모으는 방식은 꾸준해요.",
  ]) assert.ok(!absent(s), s);
});

test("없는 기운 단정: 알려진 한계 — 같은 문장에 표의 어구와 시간 부족이 함께 있으면 오탐하고, 표에 없는 말로 옮기면 놓친다", () => {
  // 오탐(알려진 한계): 어구와 "없어서"가 한 문장에 있으면 서로 다른 주어여도 센다
  assert.ok(absent("결과물로 내보내는 힘이 있어도 시간이 없어서 미루게 돼요."));
  // 미탐(알려진 한계): 표에 없는 말로 옮긴 단정은 정규식이 알아보지 못한다 — 지시문 · 사람이 읽는 평가가 본다
  for (const s of ["마음속 이야기를 밖으로 꺼낼 통로가 없어서 답답함이 쌓여요.", "돈에 대한 감이 없어서 돈이 새요.", "물 쪽이 비어 있어서 쉬는 힘이 약해요."]) assert.ok(!absent(s), `미탐으로 기록: ${s}`);
});

test("출생 시각 미상: 생활 말로 옮긴 '없음 · 적음'도 범위 말이 없으면 막고, 범위 말이 있으면 통과한다", () => {
  for (const s of ["돈을 다루는 감각은 보이지 않아요.", "물의 기운이 적어요.", "밀고 가는 힘이 하나도 없어요."]) assert.ok(noneClaim(s), s);
  for (const s of [
    "출생 시각을 몰라 확인되는 범위에서는 돈을 다루는 감각이 보이지 않아요.",
    "돈을 다루는 감각이 꾸준해요.",
    "물의 기운이 많은 편이에요.",
  ]) assert.ok(!noneClaim(s), s);
  // 앞 문장이 범위를 밝히면 통과한다
  assert.equal(hourUnknownErrors([{ where: "w", text: "출생 시각을 몰라 확인되는 범위의 이야기예요. 물의 기운이 적어요." }]).length, 0);
  assert.ok(HOUR_SCOPE_MARK.test("출생 시각을 몰라 확인되는 범위에서는"));
});

test("정규식 확장은 용어 쪽 동작을 바꾸지 않는다 — 번역 어구가 없는 글의 검사 결과는 같다", () => {
  assert.ok(NONE_CLAIM.test("식상이 없어요"));
  assert.ok(!NONE_CLAIM.test("그럴 수는 없어요"));
  assert.ok(LIFE_POWER_SOURCE.length > 0 && LIFE_ABSENT_SOURCE.length > 0);
});

// ───── 이름 ─────

test("이름: 있으면 채우고(따옴표도 안전) 없으면 호칭을 지워 {name}과 빈 님이 남지 않는다", () => {
  assert.equal(fillNameInJson('"{name} 님은 신중해요"', "서윤"), '"서윤 님은 신중해요"');
  assert.equal(JSON.parse(fillNameInJson(JSON.stringify("{name} 님은 신중해요"), '서"윤\\')), '서"윤\\ 님은 신중해요');
  assert.equal(JSON.parse(fillNameInJson(JSON.stringify("{name} 님은 신중한 편이에요. {name}님의 하루는 느려요."), "")), "신중한 편이에요. 하루는 느려요.");
  assert.equal(JSON.parse(fillNameInJson(JSON.stringify("{name}"), "  ")), "");
  // 호칭을 지워도 문장의 뜻이 바뀌지 않는다 — "님만 아는 일"은 "본인만 아는 일"로
  assert.equal(JSON.parse(fillNameInJson(JSON.stringify("실제로 어땠는지는 {name} 님만 아는 일이에요."), "")), "실제로 어땠는지는 본인만 아는 일이에요.");
  assert.equal(JSON.parse(fillNameInJson(JSON.stringify("실제로 어땠는지는 {name} 님만 아는 일이에요."), "서윤")), "실제로 어땠는지는 서윤 님만 아는 일이에요.");
  assert.equal(JSON.parse(fillNameInJson(JSON.stringify("이 이야기는 {name} 님도 느끼실 거예요."), "")), "이 이야기는 본인도 느끼실 거예요.");
  assert.equal(honorific("서윤"), "서윤 님");
  assert.equal(honorific(" "), "");
});

test("이름이 비어 있는 입력으로 조립해도 리포트 어디에도 {name}이나 빈 '님'이 없다", () => {
  const draft = mockDraft();
  setPara(draft, 1, "{name} 님은 머릿속의 생각을 말이나 결과물로 꺼내 보이는 일에서 힘이 나는 편이에요. 한번 정한 방향은 쉽게 접지 않는 쪽이라 {name} 님의 속도는 천천히 단단해져요.");
  const input = { ...P01.input, nickname: "" };
  assert.deepEqual(fillStory7Name(draft, "").sections[0].paragraphs?.[0].match(/\{name\}/), null);
  const report = assembleStory7({ draft, evidence: EVIDENCE, input, reference: { ...REF, iso: "2026-10-17" }, promptVersion: "x", ruleVersions: [] });
  const strings: string[] = [];
  JSON.stringify(report, (_k, v) => (typeof v === "string" ? (strings.push(v), v) : v));
  for (const s of strings) {
    assert.doesNotMatch(s, /\{name\}/, s.slice(0, 40));
    assert.doesNotMatch(s, /(?:^|[^가-힣A-Za-z0-9])님(?![가-힣])/, `빈 호칭 '님'이 남았다: ${s.slice(0, 60)}`);
  }
  assert.ok(!STORY7_CAVEAT.love!("").includes("님"));
  assert.match(STORY7_CAVEAT.love!(""), /사주와 응답만으로 읽었어요/);
  assert.match(STORY7_CAVEAT.love!("서윤"), /서윤 님의 사주와 응답만으로/);
});

test("읽기용 풀어 쓰기(운영자 PC 화면)도 {name}을 닉네임으로 채우거나 지운다", () => {
  const d = mockDraft();
  setPara(d, 1, "{name} 님은 머릿속의 생각을 말이나 결과물로 꺼내 보이는 일에서 힘이 나는 편이에요. 한번 정한 방향은 쉽게 접지 않아요.");
  assert.match(renderStory7DraftMarkdown(d, { name: "시험닉네임" }), /시험닉네임 님은 머릿속의 생각을/);
  const none = renderStory7DraftMarkdown(d);
  assert.doesNotMatch(none, /\{name\}/);
  assert.doesNotMatch(none, /(?:^|[^가-힣A-Za-z0-9])님은/);
});

// ───── 편집 시안(모의 출력이 아니라 사람이 쓴 시안) — 고객용 서술이 형식 검사를 그대로 통과하는지 ─────

test("편집 시안: 명리 말 없이 사람 이야기로 쓴 1번 · 5번(재물) 문단은 용어 경고도 BLOCK도 만들지 않는다", () => {
  const d = mockDraft();
  const one = "{name} 님은 머릿속의 생각을 말이나 결과물로 꺼내 보이는 일에서 힘이 나는 편이에요. 한번 정한 방향은 쉽게 접지 않는 쪽이라, 처음 만난 사람에게는 단단해 보이다가도 가까워지면 의외로 섬세하다는 말을 듣기 쉬워요. 입력해 주신 성향까지 함께 보면 혼자 정리하는 시간이 있어야 편해지는 모습으로도 나타날 수 있어요.";
  const money = "{name} 님은 직접 만들어 내놓은 것이 돈이나 평가로 돌아오는 쪽에 가까워요. 아이디어를 꺼내 보이는 순간 길이 열리는 편인데, 보상이 오기 전까지 버티는 시간이 길게 느껴질 수 있어요. 함께 쓰고 나누는 자리에서는 돈이 생각보다 빨리 나갈 때도 있어요.";
  setPara(d, 1, one, 0);
  const s5 = section(d, 5);
  const moneyPart = s5.parts!.find((p) => p.title === "재물")!;
  moneyPart.paragraphs[0] = money;
  assert.deepEqual(customerVoiceLeaks(one), []);
  assert.deepEqual(customerVoiceLeaks(money), []);
  const before = blocksOf(mockDraft());
  const after = blocksOf(d);
  assert.deepEqual(after.filter((m) => !before.includes(m)), [], "시안이 만든 새 BLOCK이 없다");
  const warnings = validate(d).warnings.filter((m) => m.includes("본문에 명리 용어(") && (m.includes("sections.1.paragraphs[0]") || m.includes("sections.5.parts[1]")));
  assert.deepEqual(warnings, []);
});

test("편집 시안 3개(1번 · 5번 재물 · 6번 지난 시기→지금→앞으로): 근거 ID를 그대로 달고 새 BLOCK도 용어 경고도 만들지 않는다", () => {
  const before = blocksOf(mockDraft());
  const d = mockDraft();
  section(d, 1).paragraphs![0] =
    "{name} 님은 한번 마음먹은 일을 천천히 키워 가는 쪽이에요. 시작하고 키우는 힘과 안정시키고 이어 가는 힘이 넉넉해서 계획을 세워 꾸준히 이어 가는 데 강해요. 기준을 세워 딱 잘라 정리하거나 한 걸음 물러나 쉬는 일은 그 주제가 크게 느껴지는 시기에 더 의식하게 될 수 있어요. 입력해 주신 성향까지 함께 보면 혼자 정리하는 시간이 있어야 편해지는 모습으로도 나타날 수 있어요.";
  section(d, 5).parts!.find((p) => p.title === "재물")!.paragraphs[0] =
    "{name} 님의 돈은 눈에 띄게 불어나기보다 조용히 쌓이다가 때가 되면 모습을 드러내는 쪽에 가까워요. 앞에 나서서 챙기기보다 실속을 먼저 보는 편이라, 좋은 기회가 와도 알아보는 데 시간이 걸려 내 몫을 놓칠 수 있어요. 평소에도 앞서 나서기보다 한 번 더 살피는 모습이 이 모양과 이어져요.";
  section(d, 6).paragraphs![0] =
    "만 25~26세 무렵에는 가까운 관계에서 의미 있는 변화가 있었을 가능성이 있어요. 관계가 자리를 잡거나 거리를 다시 정하게 되는 시기로 읽히는데, 실제로 어땠는지는 {name} 님만 아는 일이에요. 만 30~31세 무렵에는 일하는 환경이나 수입의 형태가 달라졌을 수 있어요. 지금 지나는 10년 단위의 큰 시기(만 29~39세 무렵)는 그때 시도한 것이 자리를 잡아 가기 좋은 때이고, 입력해 주신 성향대로 새 기회는 한 번 더 살핀 뒤 고르는 편이면 잘 맞아요.";
  for (const id of ["saju.frame.L6.2014", "saju.frame.W8.2019", "saju.frame.W8.신해대운"]) if (!section(d, 6).evidence.includes(id)) section(d, 6).evidence.push(id);
  section(d, 5).evidence.push("saju.frame.W6");
  // 시안이 달고 있는 근거는 모두 실제 근거 목록에 있다(근거를 지어내지 않았다)
  const known = new Set(EVIDENCE.map((e) => e.id));
  for (const s of d.sections) for (const id of s.evidence) assert.ok(known.has(id), id);
  const r = validate(d);
  const blocks = r.ok ? [] : r.errors;
  assert.deepEqual(blocks.filter((m) => !before.includes(m)), [], "시안이 만든 새 BLOCK이 없다");
  const touched = r.warnings.filter((m) => /sections\.(?:1\.paragraphs\[0\]|5\.parts\[1\]|6\.paragraphs\[0\])/.test(m));
  assert.deepEqual(touched, [], "시안 문단에는 용어 경고도 없다");
  // 시안의 나이는 근거에 적힌 만 나이 범위 안이다
  const text = EVIDENCE.map((e) => e.fact).join(" ");
  for (const age of ["만 25~26세", "만 30~31세", "만 29~39세"]) assert.ok(text.includes(age), age);
});

test("같은 글에서 없는 기운을 생활 말로 원인 풀이하면 장 단위 검사에서도 BLOCK이 나온다 — 조립 전 단계에서 걸린다", () => {
  const d = mockDraft();
  section(d, 5).parts!.find((p) => p.title === "재물")!.paragraphs[0] =
    "{name} 님은 돈을 다루는 감각이 없어서 돈 관리가 서툴러요. 앞에 나서서 챙기기보다 실속을 먼저 보는 편이에요. 좋은 기회가 와도 알아보는 데 시간이 걸려요.";
  const blocks = blocksOf(d);
  assert.ok(blocks.some((m) => m.includes("생활 기능의 부족이나 원인")), blocks.join("\n"));
});

// ───── 편집 시안을 이름 처리까지 거친 고객 표시본으로 — 가상 이름(서윤)과 이름 없음 ─────

const SIAN_1 =
  "{name} 님은 한번 마음먹은 일을 천천히 키워 가는 쪽이에요. 시작하고 키우는 힘과 안정시키고 이어 가는 힘이 넉넉해서 계획을 세워 꾸준히 이어 가는 데 강해요. 기준을 세워 딱 잘라 정리하거나 한 걸음 물러나 쉬는 일은 그 주제가 크게 느껴지는 시기에 더 의식하게 될 수 있어요. 입력해 주신 성향까지 함께 보면 혼자 정리하는 시간이 있어야 편해지는 모습으로도 나타날 수 있어요.";
const SIAN_5 =
  "{name} 님의 돈은 눈에 띄게 불어나기보다 조용히 쌓이다가 때가 되면 모습을 드러내는 쪽에 가까워요. 앞에 나서서 챙기기보다 실속을 먼저 보는 편이라, 좋은 기회가 와도 알아보는 데 시간이 걸려 내 몫을 놓칠 수 있어요. 평소에도 앞서 나서기보다 한 번 더 살피는 모습이 이 모양과 이어져요.";
const SIAN_6 =
  "만 25~26세 무렵에는 가까운 관계에서 의미 있는 변화가 있었을 가능성이 있어요. 관계가 자리를 잡거나 거리를 다시 정하게 되는 시기로 읽히는데, 실제로 어땠는지는 {name} 님만 아는 일이에요. 만 30~31세 무렵에는 일하는 환경이나 수입의 형태가 달라졌을 수 있어요. 지금 지나는 10년 단위의 큰 시기(만 29~39세 무렵)는 그때 시도한 것이 자리를 잡아 가기 좋은 때이고, 입력해 주신 성향대로 새 기회는 한 번 더 살핀 뒤 고르는 편이면 잘 맞아요.";

function displayStrings(name: string): string[] {
  const d = mockDraft();
  section(d, 1).paragraphs![0] = SIAN_1;
  section(d, 5).parts!.find((p) => p.title === "재물")!.paragraphs[0] = SIAN_5;
  section(d, 6).paragraphs![0] = SIAN_6;
  const report = assembleStory7({ draft: d, evidence: EVIDENCE, input: { ...P01.input, nickname: name }, reference: { ...REF, iso: "2026-10-17" }, promptVersion: "x", ruleVersions: [] });
  const strings: string[] = [];
  JSON.stringify(report, (_k, v) => (typeof v === "string" ? (strings.push(v), v) : v));
  return strings;
}

test("편집 시안 세 장을 조립하면 가상 이름(서윤)은 호칭으로, 이름 없음은 호칭 없이 — 어느 쪽에도 {name} · 빈 '님'이 없다", () => {
  for (const name of ["서윤", ""]) {
    const strings = displayStrings(name);
    for (const s of strings) {
      assert.doesNotMatch(s, /\{name\}/, s.slice(0, 40));
      assert.doesNotMatch(s, /(?:^|[^가-힣A-Za-z0-9])님(?![가-힣])/, `빈 호칭 '님'이 남았다: ${s.slice(0, 60)}`);
    }
  }
  const named = displayStrings("서윤");
  assert.ok(named.some((s) => s.startsWith("서윤 님은 한번 마음먹은 일을 천천히 키워 가는 쪽이에요.")));
  assert.ok(named.some((s) => s.startsWith("서윤 님의 돈은 눈에 띄게 불어나기보다")));
  assert.ok(named.some((s) => s.includes("실제로 어땠는지는 서윤 님만 아는 일이에요.")));
  const blank = displayStrings("");
  assert.ok(blank.some((s) => s.startsWith("한번 마음먹은 일을 천천히 키워 가는 쪽이에요.")));
  assert.ok(blank.some((s) => s.startsWith("돈은 눈에 띄게 불어나기보다")));
  assert.ok(blank.some((s) => s.includes("실제로 어땠는지는 본인만 아는 일이에요.")));
});
