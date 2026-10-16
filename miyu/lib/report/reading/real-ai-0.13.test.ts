// 실행: npm test — 실제 서비스 AI(claude-sonnet-5-5)가 지시문 0.13으로 쓴 첫 글(가상 인물 P01, 2026-10-16, 운영자 PC 실행)을 제품 검사에 다시 넣어 본다.
// 그 글은 형식 검사를 두 번 모두 통과하지 못해 리포트로 저장되지 않았다(실패한 글 · 비용 · 이유는 docs/samples/real-ai/ 에 있다). 걸린 15개 가운데 14개가 검사가 모델의 풀이 순서 · 따옴표 · "기운이" 를 몰라서 생긴 오탐이었고,
// 그 세 가지를 고친 뒤 남는 것은 실령 한 곳(꾸미는 말만 있는 풀이)이다. 이 시험은 그 상태를 고정해 두고, 같은 글에서 오탐이 되돌아오지 않는지 본다.
// 주의: 검사는 이 글을 본 뒤에 고쳤다(사후 수정). 고친 규칙이 설명 없는 용어 · 지어낸 판정을 더 많이 통과시키지 않는지는 terms.test.ts · prompt-pack.test.ts의 반대 사례가 함께 지킨다.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildPersonas } from "../ai/compare-personas.ts";
import { buildEvidence } from "../ai/generator.ts";
import { checkReadingDepth } from "./depth.ts";
import { classifyReadingIssue, groupReadingIssues } from "./issue-class.ts";
import { GUARANTEE_RULES } from "./plan.ts";
import { findRepeatedPhrases } from "./repeat.ts";
import type { ReadingDraftV1 } from "./types.ts";
import { countSentences, validateReadingDraft } from "./validate.ts";

const DIR = "../../../docs/samples/real-ai/reading-0.13-P01-stage-1-20261016-153543/";
const FIXTURE = new URL(`${DIR}failed/P01-X-round2.json`, import.meta.url);
const REVIEWED = new URL(`${DIR}reviewed/P01-X-round2.reviewed.json`, import.meta.url);
const COST = new URL(`${DIR}cost-and-checks.json`, import.meta.url);
/** 실제 AI 원문의 해시 — 원문은 바꾸지 않고 보존한다(편집은 reviewed/ 의 검토 후 수정본에서만) */
const ORIGINAL_SHA256 = "cd443b91695293574ff73fea76d1b75f88407165ddfb1e7c93e8b961988b00d1";
const p = buildPersonas(2)[0];
const evidence = buildEvidence(p.input, { year: 2026, month: 10 });
const run = (draft: unknown) => validateReadingDraft(draft, evidence, { hasContext: Boolean(p.input.context) });
const errorsOf = (draft: unknown) => {
  const r = run(draft);
  return r.ok ? [] : r.errors;
};

test("실제 AI의 0.13 첫 글(P01, 두 번째 시도): 오탐 세 가지를 고친 뒤 남는 것은 실령 한 곳뿐이다", () => {
  const p = buildPersonas(2)[0];
  const evidence = buildEvidence(p.input, { year: 2026, month: 10 });
  const raw = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const r = validateReadingDraft(raw, evidence, { hasContext: Boolean(p.input.context) });
  assert.equal(r.ok, false);
  const errors = r.ok ? [] : r.errors;
  // 되돌아오면 안 되는 오탐: 따옴표 안의 마침표 · "기운이 들어와" · "풀이(용어)" 순서의 풀이
  assert.ok(!errors.some((e) => /3문장/.test(e)), "따옴표 안의 말이 문장으로 세어졌다");
  assert.ok(!errors.some((e) => /운을 바꾼다는 보장/.test(e)), "\"기운이 들어와\"가 운 보장으로 걸렸다");
  const termErrors = errors.filter((e) => /설명 없는 사주 용어/.test(e));
  assert.deepEqual(termErrors.map((e) => e.match(/용어\((.+?)\)/)?.[1]), ["실령"]);
  assert.equal(errors.length, 1, errors.join("\n"));
});

test("문장 수: 따옴표로 묶은 말 안의 마침표는 문장을 나누지 않고, 짝이 없는 따옴표 · 실제 세 문장은 그대로 센다", () => {
  assert.equal(countSentences('이렇게 말해 보세요. "저는 천천히 알아가는 게 편해요. 중간중간 속도를 맞춰 봐요."'), 2);
  assert.equal(countSentences("이렇게 말해 보세요. “저는 천천히 알아가는 게 편해요. 속도를 맞춰 봐요.”"), 2);
  assert.equal(countSentences("하나예요. 둘이에요. 셋이에요."), 3);
  assert.equal(countSentences('이렇게 말해 보세요. "저는 천천히 알아가요. 중간에 확인해요.'), 3, "짝이 없는 따옴표는 묶지 않는다");
});

test("운 보장 검사: 기운이 들어온다는 해석은 막지 않고, 운이 트인다 · 들어온다는 보장은 계속 막는다", () => {
  const hit = (t: string) => GUARANTEE_RULES.some((r) => r.re.test(t));
  assert.equal(hit("그 기운이 들어와 있어서 준비한 것을 보여 주는 일이 커질 수 있어요."), false);
  assert.equal(hit("표현하는 기운이 들어오는 시기라서 결과물을 보여 주는 일이 주제로 읽혀요."), false);
  for (const bad of ["운이 들어와요.", "연애운이 올라요.", "행운이 따라요.", "재물운이 열려요.", "이 소품을 두면 운이 트여요."]) assert.equal(hit(bad), true, bad);
});

test("원문 보존: 실제 AI 원문 파일은 바뀌지 않았다(해시) — 편집은 검토 후 수정본에서만 한다", () => {
  assert.equal(createHash("sha256").update(readFileSync(FIXTURE)).digest("hex"), ORIGINAL_SHA256);
});

test("원문의 검사 결과를 성격별로 가른다: 내용 오류 0 · 형식 1(실령 설명 방식) · 품질 0 — 처음 실행에서 걸린 15개는 형식 14 · 내용 1이었고 15개 모두 오탐이 아니라 14개가 오탐이었다", () => {
  const g = groupReadingIssues(errorsOf(JSON.parse(readFileSync(FIXTURE, "utf8"))));
  assert.deepEqual({ content: g.content.length, format: g.format.length, quality: g.quality.length }, { content: 0, format: 1, quality: 0 });
  // 운영자 PC에서 처음 걸린 두 번째 응답의 15개(cost-and-checks.json) — 분류는 문구에 따른 것이고 "오탐 여부"는 사람이 읽고 붙인 판단이다
  const cost = JSON.parse(readFileSync(COST, "utf8")) as { runs: { attempts: { errors: string[] }[] }[] };
  const first = groupReadingIssues(cost.runs[0].attempts[1].errors);
  assert.deepEqual({ content: first.content.length, format: first.format.length, quality: first.quality.length }, { content: 1, format: 14, quality: 0 });
  assert.equal(classifyReadingIssue(first.content[0]), "content", "운 보장으로 분류됐지만 \"기운이 들어와\"의 오탐이었다 — 분류가 곧 옳고 그름은 아니다");
});

test("검토 후 수정본: 현재 검사를 통과하고 되풀이가 없다 — 실제 모델이 새로 생성한 글이 아니라 편집본이다", () => {
  const original = JSON.parse(readFileSync(FIXTURE, "utf8")) as ReadingDraftV1;
  const reviewed = JSON.parse(readFileSync(REVIEWED, "utf8")) as ReadingDraftV1;
  assert.deepEqual(errorsOf(reviewed), [], "형식 · 근거 검사");
  assert.equal(checkReadingDepth({ draft: reviewed }).pass, true, "내용 검사(어림)");
  assert.deepEqual(findRepeatedPhrases(reviewed), [], "12자 이상 되풀이 구절");
  assert.notDeepEqual(reviewed, original);
  const text = (d: ReadingDraftV1) => JSON.stringify(d, (k, v) => (k === "evidence" ? undefined : v));
  const count = (t: string, w: string) => t.split(w).length - 1;
  assert.ok(count(text(reviewed), "혼자 정리") < count(text(original), "혼자 정리") / 2, "\"혼자 정리\"를 절반 아래로");
  // 구조와 근거 ID는 그대로(실천만 4개 → 3개로 통합)
  assert.deepEqual(reviewed.blocks.map((b) => [b.id, b.evidence]), original.blocks.map((b) => [b.id, b.evidence]));
  assert.equal(reviewed.actions.length, 3);
  assert.equal(original.actions.length, 4);
  // 신강 · 신약으로 단정하지 않고, 근거 범위를 넘었던 문장은 고쳤다
  assert.doesNotMatch(text(reviewed), /신강|신약/);
  for (const gone of ["상황에 따라 기우는 쪽이 달라질 수 있어요", "끌림은 강한 반응에서 오더라도", "불안 때문이 아니라", "생각을 밖으로 꺼내는 일이 처음엔 어색할 수 있어요"]) assert.ok(!text(reviewed).includes(gone), gone);
  // 용어는 처음 쓸 때 모두 풀려 있고(검사 통과) 실령도 괄호 풀이가 붙었다
  assert.match(text(reviewed), /실령\(태어난 계절의 기운이 나를 돕지 않는다는 뜻\)/);
});

test("고친 검사는 정상 표현을 통과시키되 실제 잘못은 계속 막는다 — 같은 글에 한 문장씩 잘못을 넣어 본다(이 글만 통과시키는 예외가 아니다)", () => {
  const reviewed = JSON.parse(readFileSync(REVIEWED, "utf8")) as ReadingDraftV1;
  const withValues1 = (t: string) => {
    const d = structuredClone(reviewed);
    d.blocks.find((b) => b.id === "values")!.details[1] = t;
    return d;
  };
  const cases: [string, ReadingDraftV1, RegExp, "content" | "format" | "quality"][] = [
    ["신약으로 단정(강약은 갈림)", withValues1("내 힘을 덜 받는 쪽(신약)이라서 혼자 감당하면 지쳐요. 평소에는 단단하게 버티다가도 책임이 겹치면 지칠 수 있어요."), /근거 없는 판정\(신약\)/, "content"],
    ["월령 방향을 반대로(득령)", withValues1("태어난 계절의 도움을 받는 득령(태어난 계절의 기운이 나를 돕는다는 뜻)이라서 힘이 있어요. 평소에는 단단하게 버티다가도 책임이 겹치면 지칠 수 있어요."), /계산된 월령과 반대\(득령\)/, "content"],
    ["엔진이 계산하지 않은 격국", withValues1("사주의 큰 틀(격국)이 좋아서 버티는 힘이 있어요. 평소에는 단단하게 버티다가도 책임이 겹치면 지칠 수 있어요."), /근거 목록에 없는 판정\(격국\)/, "content"],
    ["계산되지 않은 해", withValues1("2031년에는 책임이 한꺼번에 몰려서 지칠 수 있어요. 평소에는 단단하게 버티다가도 책임이 겹치면 지칠 수 있어요."), /계산되지 않은 해 2031/, "content"],
    ["중대한 선택 확정", withValues1("지금 일은 퇴사하세요. 평소에는 단단하게 버티다가도 책임이 겹치면 지칠 수 있어요."), /중대한 선택을 확정/, "content"],
    ["응답을 읽어 주는 말", withValues1("관계 불안이 낮다고 답하셨으므로 흔들리지 않아요. 평소에는 단단하게 버티다가도 책임이 겹치면 지칠 수 있어요."), /응답을 그대로 읽어 주는 말/, "quality"],
    ["설명 없는 용어(통근)", withValues1("통근이 단단해서 버텨요. 평소에는 단단하게 버티다가도 책임이 겹치면 지칠 수 있어요."), /설명 없는 사주 용어\(통근\)/, "format"],
  ];
  for (const [label, draft, re, cls] of cases) {
    const hit = errorsOf(draft).find((e) => re.test(e));
    assert.ok(hit, `${label}: 막혀야 한다`);
    assert.equal(classifyReadingIssue(hit!), cls, `${label}: 분류`);
  }
  // 반대쪽: 같은 자리에 정상 표현(풀이 앞 · 뒤 · 이어지는 문장)을 넣으면 통과한다
  for (const ok of [
    "태어난 달의 기운(월령)이 나를 돕는 쪽이 아니에요. 평소에는 단단하게 버티다가도 책임이 겹치면 지칠 수 있어요.",
    "월령(태어난 달의 기운)이 나를 돕는 쪽이 아니에요. 평소에는 단단하게 버티다가도 책임이 겹치면 지칠 수 있어요.",
    "월령은 태어난 달의 기운을 말해요. 평소에는 단단하게 버티다가도 책임이 겹치면 지칠 수 있어요.",
  ]) {
    const d = structuredClone(reviewed);
    // 월령은 이미 앞(values.details[0])에서 풀었으므로 설명을 다시 붙여도 · 붙이지 않아도 된다
    d.blocks.find((b) => b.id === "values")!.details[1] = ok;
    assert.deepEqual(errorsOf(d), [], ok);
  }
});
