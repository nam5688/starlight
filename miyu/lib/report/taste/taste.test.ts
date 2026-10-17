// 실행: npm test — 맛보기 리포트(taste-v2): 실제 응답 근거 만들기 · 지시문 · 글 검사(연애는 정확히 3문장 150자 이상, 유료 핵심을 미리 쓰지 않기, 해 볼 행동은 action에서만, 구매 예고 · 응답 읽어 주기 · 한계 경고 금지) · 쓰기(고쳐 쓰기 · 실패) · 예전(v1) 글 읽기.
import assert from "node:assert/strict";
import test from "node:test";
import { ASSESSMENT_MODULES } from "../../assessment/modules/index.ts";
import { ModelCallError, type ModelRequest, type ModelResult, type TextModel } from "../ai/model.ts";
import { TASTE_ANSWERS_MAX, tasteAnswersOf } from "./input.ts";
import { composeMockTaste, createMockTasteModel, TASTE_SAMPLE } from "./mock-model.ts";
import { TASTE_PLAN, tasteSectionLabel } from "./plan.ts";
import { buildTasteRepairMessage, buildTasteUserMessage, TASTE_PROMPT_MARK, TASTE_PROMPT_VERSION, TASTE_SYSTEM_PROMPT } from "./prompt.ts";
import { TASTE_SECTION_IDS } from "./types.ts";
import { readTasteReport, tasteSentences, validateTaste } from "./validate.ts";
import { createTasteWriter, TasteWriteError } from "./writer.ts";

const ANSWERS = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((item, i) => [item.id, (i % 5) + 1])));
const input = { profile: { saju: ["큰 강처럼 넓게 흐르는 사람이에요"], response: ["시작하기 전에 여러 번 따져 보는 편일 수 있어요"] }, answers: tasteAnswersOf(ANSWERS, ASSESSMENT_MODULES) };

const sample = () => JSON.parse(JSON.stringify(TASTE_SAMPLE)) as { headline: string; sections: { id: string; title: string; body: string }[] };
const withBody = (id: string, body: string) => {
  const s = sample();
  s.sections.find((x) => x.id === id)!.body = body;
  return JSON.stringify(s);
};
const errorsOf = (raw: string) => {
  const r = validateTaste(raw);
  return r.ok ? [] : r.errors;
};

test("실제 응답 근거: 보통(3)은 빼고, 뚜렷한 답부터 한도까지 문항 순서로 담으며, 이름 · 생년월일이 없다", () => {
  const a = tasteAnswersOf(ANSWERS, ASSESSMENT_MODULES);
  assert.ok(a.length > 0 && a.length <= TASTE_ANSWERS_MAX, `${a.length}`);
  assert.ok(a.every((x) => ["전혀 아니다", "아니다", "그렇다", "매우 그렇다"].includes(x.answer) && x.statement.length > 5));
  // 모든 문항을 3(보통)으로 답하면 아무것도 담지 않는다
  assert.deepEqual(tasteAnswersOf(Object.fromEntries(Object.keys(ANSWERS).map((k) => [k, 3])), ASSESSMENT_MODULES), []);
  // 뚜렷한 답(1 · 5)이 먼저 뽑힌다
  const strong = tasteAnswersOf(Object.fromEntries(Object.keys(ANSWERS).map((k, i) => [k, i < 3 ? 5 : i < 6 ? 4 : 2])), ASSESSMENT_MODULES);
  assert.ok(strong.slice(0, 3).every((x) => x.answer === "매우 그렇다") || strong.filter((x) => x.answer === "매우 그렇다").length === 3);
  // 없는 문항 · 숫자가 아닌 값은 무시한다
  assert.deepEqual(tasteAnswersOf({ t1: 9, t2: Number.NaN } as never, ASSESSMENT_MODULES), []);
  const msg = buildTasteUserMessage(input);
  assert.ok(msg.includes('"answers"') && msg.includes('"profile"') && msg.includes("statement"));
  assert.ok(!/19\d\d|20[0-2]\d\s*년\s*\d+\s*월/.test(msg), "생년월일 형태가 없다");
});

test("지시문: 사주를 읽고 응답으로 나타나는 모습을 구체화하며, 유료 핵심(연애의 진행 · 어울리는 사람 · 시기)과 구매 예고를 쓰지 않고, 연애는 정확히 3문장 · 해 볼 행동은 action에서만이다", () => {
  assert.ok(TASTE_SYSTEM_PROMPT.startsWith(TASTE_PROMPT_MARK));
  for (const must of ["사주를 읽고", "사주(profile.saju)에서 읽은 성향", "answers", "profile.response", "해요체", "정확히 3문장", "쓰지 않는 것", "연애가 어떻게 진행될지", "어떤 사람이 어울리는지", "연애운이 강해지는 시기", "해 볼 행동", "JSON 하나만", "점수", "사주 용어", "~했던 때가 있었을 거예요", "경고를 문장마다 붙이지 않는다", "구매 후", "조건형"]) {
    assert.ok(TASTE_SYSTEM_PROMPT.includes(must), must);
  }
  for (const id of TASTE_SECTION_IDS) assert.ok(TASTE_SYSTEM_PROMPT.includes(`- ${id} "${TASTE_PLAN.sections[id].label}"`), id);
  assert.equal(TASTE_PROMPT_VERSION, "taste-v2-prompt-0.2");
  assert.deepEqual([...TASTE_SECTION_IDS], ["self", "work", "love", "action"]);
  assert.ok(buildTasteRepairMessage(["가", "나"]).includes("- 가") && buildTasteRepairMessage(["가"]).includes("JSON 전체"));
});

test("글 검사: 고정 예시는 통과하고, 섹션 순서 · 분량 · 연애 3문장 150자 이상을 지킨다", () => {
  const ok = validateTaste(composeMockTaste());
  assert.ok(ok.ok, JSON.stringify(ok));
  if (!ok.ok) return;
  assert.deepEqual(ok.report.sections.map((s) => s.id), [...TASTE_SECTION_IDS]);
  const love = ok.report.sections.find((s) => s.id === "love")!;
  assert.equal(tasteSentences(love.body).length, 3, "연애는 정확히 3문장");
  assert.ok(love.body.length >= 150, `연애 ${love.body.length}자`);
  // 코드 블록 · 앞뒤 설명이 붙어 있어도 읽는다
  assert.ok(validateTaste("```json\n" + composeMockTaste() + "\n```").ok);
  assert.ok(validateTaste("여기 있어요.\n" + composeMockTaste() + "\n이상입니다").ok);
  // JSON이 아니거나 모양이 틀리면 막는다
  assert.ok(errorsOf("그냥 글이에요").some((e) => e.includes("JSON")));
  assert.ok(errorsOf(JSON.stringify({ headline: "짧", sections: [] })).length >= 2);
  const swapped = sample();
  [swapped.sections[0], swapped.sections[1]] = [swapped.sections[1], swapped.sections[0]];
  assert.ok(errorsOf(JSON.stringify(swapped)).some((e) => e.includes('id는 "self"')));
  // 연애: 2문장 · 4문장 · 150자 미만은 막는다
  const two = "사주에서는 물 기운이 많아서 상대의 마음을 깊이 헤아리고 맞춰 주는 쪽으로 읽히고, 그만큼 표현이 늦어질 수 있어요. 응답에서도 가까운 관계에서 상대의 반응을 확인하고 싶은 마음이 보여서, 연락이 뜸하면 이유를 하나씩 따져 보게 되는 날이 있을 수 있어요.";
  assert.ok(errorsOf(withBody("love", two)).some((e) => e.includes("정확히 3문장")));
  assert.ok(errorsOf(withBody("love", `${two} 두 가지가 만나면 어긋나기 쉬워요. 마음을 천천히 보여 주는 사람이에요.`)).some((e) => e.includes("정확히 3문장")));
  assert.ok(errorsOf(withBody("love", "마음은 깊어요. 표현은 늦어요. 그래서 어긋나기 쉬워요.")).some((e) => e.includes("150") || e.includes("자로")));
});

test("글 검사: 유료 리포트의 핵심(해 볼 행동 · 어울리는 사람 · 시기 · 결혼 · 연애의 진행)과 설문 말투, 사주 용어 · 점수 · 합쇼체를 막는다", () => {
  const base = TASTE_SAMPLE.sections.find((s) => s.id === "love")!.body;
  const bad: [string, RegExp][] = [
    [`${base} 먼저 연락해 보세요.`, /해 볼 행동/],
    [`${base} 자세한 이야기는 심층 리포트에서 이어져요.`, /구매 예고/],
    [`${base} 나머지는 구매 후에 알 수 있어요.`, /구매 예고/],
    [`${base} 사주만으로는 알 수 없어요.`, /한계 경고/],
    [`${base} 그렇다고 응답에서 나타났어요.`, /응답을 그대로/],
    [`${base} 나에게 어울리는 사람은 차분한 상대예요.`, /어울리는 사람/],
    [`${base} 올해 가을에 연애운이 강해져요.`, /시기/],
    [`${base} 내년에는 좋은 사람이 생길 수 있어요.`, /시기/],
    [`${base} 결혼 이야기가 가까워질 수 있어요.`, /결혼/],
    [`${base} 곧 썸이 시작될 수 있어요.`, /연애의 진행/],
    [`${base} 응답하신 대로 그런 편이에요.`, /설문/],
    [`${base} 문항에서 매우 그렇다고 하셨어요.`, /설문/],
    [`${base} 일간이 약한 편이에요.`, /사주 용어/],
    [`${base} 연애운은 80점이에요.`, /점수/],
    [`${base} 그 사람은 속으로 이미 마음이 식었어요.`, /속마음/],
    [base.replace(/요\.$/, "입니다."), /합쇼체/],
  ];
  for (const [body, why] of bad) {
    const errs = errorsOf(withBody("love", body));
    assert.ok(errs.some((e) => why.test(e)), `${why}: ${errs.join(" | ")}`);
  }
  // 제목 · 총평에도 같은 규칙
  const t = sample();
  t.sections[0].title = "일간이 강해서 단단한 사람이에요 정말로요";
  assert.ok(errorsOf(JSON.stringify(t)).some((e) => e.includes("사주 용어")));
});

test("저장된 글 읽기: 모양이 맞는 것만 읽고, 아니면 null이다", () => {
  const v = validateTaste(composeMockTaste());
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.deepEqual(readTasteReport(JSON.parse(JSON.stringify(v.report))), v.report);
  assert.equal(readTasteReport(null), null);
  assert.equal(readTasteReport({ version: "x", headline: "a", sections: [] }), null);
  assert.equal(readTasteReport({ ...v.report, sections: v.report.sections.slice(0, 3) }), null);
  // 예전(v1) 글(self · love · work · heart)은 그대로 읽고, 새 글의 섹션으로는 읽지 않는다
  const legacy = { version: "taste-v1", headline: "예전 글이에요 그대로 읽어요", sections: ["self", "love", "work", "heart"].map((id) => ({ id, title: `제목 ${id}`, body: `본문 ${id}` })) };
  const old = readTasteReport(legacy);
  assert.ok(old && old.version === "taste-v1" && old.sections.map((x) => x.id).join() === "self,love,work,heart");
  assert.equal(readTasteReport({ ...legacy, version: "taste-v2" }), null, "v2는 새 섹션이어야 한다");
  assert.equal(tasteSectionLabel("self", "taste-v1"), "나는 이런 사람");
  assert.equal(tasteSectionLabel("heart", "taste-v1"), "지치거나 마음이 흔들릴 때");
  assert.equal(tasteSectionLabel("self", "taste-v2"), TASTE_PLAN.sections.self.label);
});

test("글 검사(action): 해 볼 행동은 action에서만 쓰고 action에는 꼭 있어야 하며, 시점 · 기간을 정하지 않는다", () => {
  const withAction = (body: string) => {
    const s2 = sample();
    s2.sections.find((x) => x.id === "action")!.body = body;
    return JSON.stringify(s2);
  };
  assert.deepEqual(errorsOf(withAction("지금 부담스러운 일 하나를 골라 내가 결정할 것, 상대에게 확인할 것, 시작한 뒤 조정할 것으로 나눠 보세요. 모든 걸 미리 해결해 두지 않아도 움직일 수 있다는 기준을 만드는 연습이에요.")), []);
  assert.ok(errorsOf(withAction("지금 부담스러운 일 하나를 골라 내가 결정할 것, 상대에게 확인할 것, 시작한 뒤 조정할 것을 분명히 해 두는 쪽이 도움이 돼요. 모든 걸 미리 해결해 두지 않아도 움직일 수 있다는 기준이 생겨요.")).some((e) => e.includes("action에는")));
  assert.ok(errorsOf(withAction("오늘부터 매일 부담스러운 일 하나를 골라 내가 결정할 것, 상대에게 확인할 것, 시작한 뒤 조정할 것으로 나눠 보세요. 모든 걸 미리 해결해 두지 않아도 움직일 수 있다는 기준을 만드는 연습이에요.")).some((e) => e.includes("시점")));
  // 다른 섹션의 해 볼 행동 지시는 막는다
  const s3 = sample();
  s3.sections[1].body += " 내일부터 확인 기준을 적어 보세요.";
  assert.ok(errorsOf(JSON.stringify(s3)).some((e) => e.includes("action") || e.includes("해 볼 행동")));
});

test("쓰기: 통과한 글만 돌려주고, 검사에 걸리면 이유를 알려 한 번 고쳐 쓰게 하며, 그래도 걸리면 실패로 남긴다(사용 기록은 호출마다)", async () => {
  const usage: string[] = [];
  const ctx = { onUsage: (u: { outcome: string; promptVersion: string }) => usage.push(`${u.outcome}:${u.promptVersion}`) };
  const w = createTasteWriter({ model: createMockTasteModel(), sleep: async () => {} });
  const r = await w.write(input, ctx);
  assert.equal(r.version, "taste-v2");
  assert.deepEqual(usage, [`ok:${TASTE_PROMPT_VERSION}`]);
  assert.equal(w.provider, "mock");
  assert.equal(w.promptVersion, TASTE_PROMPT_VERSION);

  // 첫 응답은 나쁘고 고쳐 쓰면 통과
  const calls: ModelRequest[] = [];
  const flaky: TextModel = {
    provider: "mock",
    model: "flaky",
    async complete(req) {
      calls.push(req);
      return { text: calls.length === 1 ? withBody("love", "마음은 깊어요. 표현은 늦어요. 그래서 어긋나기 쉬워요.") : composeMockTaste(), model: "flaky", usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  usage.length = 0;
  const fixed = await createTasteWriter({ model: flaky, sleep: async () => {} }).write(input, ctx);
  assert.ok(fixed.sections.length === 4);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].messages.some((m) => m.role === "user" && m.content.includes("처음부터 다시")) && calls[1].messages.length === 3, "나쁜 글과 이유가 함께 간다");
  assert.deepEqual(usage, [`invalid:${TASTE_PROMPT_VERSION}`, `ok:${TASTE_PROMPT_VERSION}`]);

  // 계속 나쁘면 INVALID
  const bad: TextModel = { provider: "mock", model: "bad", complete: async (): Promise<ModelResult> => ({ text: "글이에요", model: "bad" }) };
  await assert.rejects(createTasteWriter({ model: bad, sleep: async () => {} }).write(input), (e: unknown) => e instanceof TasteWriteError && e.code === "INVALID" && e.errors.length > 0);

  // 호출 실패는 MODEL (일시 오류는 한 번 다시 시도)
  let n = 0;
  const down: TextModel = {
    provider: "mock",
    model: "down",
    async complete() {
      n++;
      throw new ModelCallError("연결 실패", { retryable: true, code: "NETWORK_ERROR" });
    },
  };
  await assert.rejects(createTasteWriter({ model: down, sleep: async () => {} }).write(input), (e: unknown) => e instanceof TasteWriteError && e.code === "MODEL");
  assert.equal(n, 2, "일시 오류는 한 번 다시 시도");
});
