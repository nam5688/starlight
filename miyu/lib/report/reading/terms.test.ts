// 실행: npm test — 사주 용어 사용 검사(terms.ts, 2026-10-16): "용어 0건"이 아니라 설명 없는 용어 · 근거 없는 판정 · 용어 나열을 본다.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Evidence } from "../evidence.ts";
import { JARGON } from "./plan.ts";
import { ALL_TERMS, checkTermUse } from "./terms.ts";

const ev = (id: string, strength: Evidence["strength"] = "moderate", uncertain = false): Evidence => ({ id, source: "saju", topics: ["personality"], strength, fact: `${id} 사실`, cue: `${id} 해석`, ...(uncertain ? { uncertain: true } : {}) });
const STRUCTURE = [ev("saju.structure.chart"), ev("saju.structure.hidden"), ev("saju.structure.month"), ev("saju.structure.roots"), ev("saju.structure.strength"), ev("saju.structure.johu")];
const run = (texts: string[], evidence: Evidence[] = STRUCTURE) => checkTermUse(texts.map((text, i) => ({ where: `t${i}`, text })), evidence);

test("용어 목록과 strict 낱말 모음(JARGON)은 같은 낱말을 다룬다 — 한쪽에만 있는 용어가 생기지 않는다", () => {
  for (const t of ALL_TERMS) {
    assert.ok(JARGON.test(t.name), `${t.name}: JARGON에 없다`);
    // 일지 · 지지 · 세운은 뒤따르는 글자에 따라 일상어와 구분하므로 여러 꼴로 써 본다
    assert.ok(["이 중요해요.", " 중요해요.", "은 중요해요.", "(이)에요."].some((tail) => run([`${t.name}${tail}`]).length > 0), `${t.name}: 설명 없이 써도 걸리지 않는다`);
  }
  // 반대로 JARGON이 잡는 낱말이 목록에서 빠지지 않았다
  for (const w of "비겁 식상 관성 인성 재성 정관 편관 비견 겁재 식신 편재 정재 정인 일간 천간 원국 오행 대운 십신 용신 격국 조후 월령 지장간 신살 희신 기신 신강".split(" ")) {
    assert.ok(JARGON.test(w) ? ALL_TERMS.some((t) => t.re.test(w)) : true, `${w}: 목록에 없다`);
  }
});

test("설명이 붙는 방식: 괄호 풀이 · 이란 · 이라고 부르는 · 뜻해요가 인정되고, 한자만 · 너무 짧은 괄호는 설명이 아니다", () => {
  assert.deepEqual(run(["일간(나 자신을 나타내는 글자)이 정화예요."]), []);
  assert.deepEqual(run(["일간이란 나 자신을 나타내는 글자예요."]), []);
  assert.deepEqual(run(["나 자신을 나타내는 글자를 일간이라고 불러요."]), []);
  assert.deepEqual(run(["대운은 10년마다 바뀌는 시기를 말해요."]), []);
  assert.ok(run(["일간(日干)이 정화예요."]).length > 0);
  assert.ok(run(["일간(나)이 정화예요."]).length > 0, "네 글자 미만의 괄호는 풀이로 보지 않는다");
});

test("한 번 풀어 준 용어는 뒤에서 다시 풀지 않아도 되고, 풀기 전에 먼저 나온 용어는 막힌다(읽는 순서대로)", () => {
  assert.deepEqual(run(["일간(나 자신을 나타내는 글자)이 정화예요.", "일간이 정화라서 오래 가는 집중이 있어요."]), []);
  const errs = run(["일간이 정화예요.", "일간(나 자신을 나타내는 글자)이 정화라서 오래 가요."]);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /^t0: 설명 없는 사주 용어\(일간\)/);
  // 용어마다 따로 풀어야 한다 — 일간을 풀었다고 천간이 풀린 것이 아니다
  assert.ok(run(["일간(나 자신을 나타내는 글자)이 정화예요.", "천간이 같은 글자예요."]).some((e) => /설명 없는 사주 용어\(천간\)/.test(e)));
});

test("한 문장에 서로 다른 용어는 둘까지다 — 같은 용어를 두 번 쓰는 것은 나열이 아니다", () => {
  assert.deepEqual(run(["비겁(나와 같은 기운)과 인성(나를 돕는 기운)이 같이 있어요."]), []);
  assert.ok(run(["비겁(나와 같은 기운)과 인성(나를 돕는 기운)과 식상(표현하는 기운)이 같이 있어요."]).some((e) => /한 문장에 사주 용어가 3개/.test(e)));
  assert.deepEqual(run(["일간(나 자신을 나타내는 글자)은 정화예요. 일간은 오래 가는 집중을 말해요. 일간 하나만 봐도 알 수 있어요."]), []);
});

test("근거 없는 판정: 구조 근거가 없거나 달라질 수 있거나 강약이 갈림이면 구조 용어 · 신강 · 신약을 이 사람의 것으로 쓸 수 없다", () => {
  assert.ok(run(["월령(태어난 달의 기운)이 약해요."], []).some((e) => /근거 목록에 없는 판정\(월령\)/.test(e)));
  assert.deepEqual(run(["월령(태어난 달의 기운)이 약해요."]), []);
  assert.ok(run(["월령(태어난 달의 기운)이 약해요."], [ev("saju.structure.month", "moderate", true)]).some((e) => /근거 목록에 없는 판정\(월령\)/.test(e)));
  // 득령 · 실령은 월령 근거를 따른다, 통근 · 투간은 roots, 지장간은 hidden, 조후는 johu
  assert.ok(run(["실령(태어난 달의 도움을 못 받는 것)이에요."], [ev("saju.structure.roots")]).length > 0);
  assert.ok(run(["통근(뿌리가 닿은 정도)이 약해요."], [ev("saju.structure.month")]).length > 0);
  assert.ok(run(["조후(계절의 한열)가 맞지 않아요."], STRUCTURE.filter((e) => e.id !== "saju.structure.johu")).length > 0);
  // 강약: 갈림(weak)이면 신강 · 신약을 쓰지 못하고 한쪽으로 모였으면 설명과 함께 쓸 수 있다
  const weakStrength = STRUCTURE.map((e) => (e.id === "saju.structure.strength" ? { ...e, strength: "weak" as const } : e));
  assert.ok(run(["신약(내 힘을 덜 받는 쪽)이에요."], weakStrength).some((e) => /근거 없는 판정\(신약\)/.test(e)));
  assert.deepEqual(run(["신약(내 힘을 덜 받는 쪽)이에요."]), []);
  assert.deepEqual(run(["신약 개발 회사에서 일하는 사람처럼 꼼꼼해요."], []), [], "일상어는 걸리지 않는다");
});

test("개인 격국 · 용신 · 희신 · 기신 · 신살은 근거 목록에 그 낱말이 없으면 설명이 있어도 쓸 수 없다", () => {
  for (const [text, name] of [["격국(사주의 큰 틀)이 좋아요.", "격국"], ["용신(필요한 기운)은 물이에요.", "용신"], ["희신(도와주는 기운)이 들어와요.", "희신"], ["기신(방해하는 기운)이 와요.", "기신"], ["신살(특별한 기운)이 있어요.", "신살"], ["도화살(사람을 끄는 기운)이 있어요.", "도화살"]] as const) {
    assert.ok(run([text]).some((e) => e.includes(`근거 목록에 없는 판정(${name})`)), text);
  }
  // 근거 목록의 글에 실제로 그 낱말이 있으면 막지 않는다(엔진이 계산하게 된 뒤의 경로)
  const withYongsin: Evidence[] = [...STRUCTURE, { ...ev("saju.yongsin"), fact: "용신 후보 수", cue: "용신으로 읽는 기운" }];
  assert.deepEqual(run(["용신(필요한 기운)은 물이에요."], withYongsin).filter((e) => /근거 목록에 없는 판정/.test(e)), []);
});

test("용어가 없는 글은 아무 오류도 내지 않는다", () => {
  assert.deepEqual(run(["새 일을 맡을 때는 기준부터 세우는 편이라 시작이 조금 느려 보일 수 있어요. 한번 붙으면 오래 가요."]), []);
  assert.deepEqual(run(["상관없이 편안하게 쉬어요. 편인데도 꾸준해요. 주는 편인데 받는 데는 서툴러요."], []), []);
  assert.deepEqual(run(["통근 시간이 길어서 아침이 빠듯해요. 통근하는 길에 생각을 정리해요."], []), [], "출퇴근을 뜻하는 통근은 걸리지 않는다");
});

test("계산된 방향과 반대로 쓰면 막는다: 실령인데 득령이라고, 힘을 덜 받는 쪽인데 신강이라고 쓰는 글 (방향이 맞으면 통과)", () => {
  const withFact = (id: string, fact: string): Evidence[] => STRUCTURE.map((e) => (e.id === id ? { ...e, fact } : e));
  const shiryeong = withFact("saju.structure.month", "월령(태어난 달의 기운): 월지 술 가을 → 월령을 얻지 못함(실령)");
  assert.ok(run(["득령(태어난 달의 도움을 받는 것)이라서 힘이 있어요."], shiryeong).some((e) => /계산된 월령과 반대\(득령\)/.test(e)));
  assert.deepEqual(run(["실령(태어난 달의 도움을 못 받는 것)이라서 혼자 힘을 쓰기 쉬워요."], shiryeong), []);
  const deuk = withFact("saju.structure.month", "월령(태어난 달의 기운): 월지 인 봄 → 월령을 얻음(득령)");
  assert.ok(run(["실령(태어난 달의 도움을 못 받는 것)이라서 힘이 없어요."], deuk).some((e) => /계산된 월령과 반대\(실령\)/.test(e)));
  const weakSide = withFact("saju.structure.strength", "일간 강약 후보(요소 기록, 점수 아님) → 후보: 힘을 덜 받는 쪽");
  assert.ok(run(["신강(내 힘을 많이 받는 쪽)이라서 밀고 나가요."], weakSide).some((e) => /계산된 강약 후보와 반대\(신강\)/.test(e)));
  assert.deepEqual(run(["신약(내 힘을 덜 받는 쪽)이라서 혼자 감당하면 지쳐요."], weakSide), []);
  const strongSide = withFact("saju.structure.strength", "일간 강약 후보(요소 기록, 점수 아님) → 후보: 힘을 받는 쪽");
  assert.ok(run(["신약(내 힘을 덜 받는 쪽)이라서 지쳐요."], strongSide).some((e) => /계산된 강약 후보와 반대\(신약\)/.test(e)));
  assert.deepEqual(run(["신강(내 힘을 많이 받는 쪽)이라서 밀고 나가요."], strongSide), []);
});

// ───────────── 실제 AI 첫 글(2026-10-16, 지시문 0.13)에서 확인한 풀이 순서 ─────────────
// 실제 모델은 용어를 거의 모두 "풀이(용어)" 순서로 풀었는데 검사가 "용어(풀이)"만 알아봐서 전부 걸렸다. 앞에 풀이가 오는 꼴을 알아보되, 짧은 말 · 한자만 · 단순 꾸밈은 풀이로 보지 않는다.
test("풀이가 용어보다 앞에 오는 꼴도 처음 쓸 때의 풀이다: 괄호 안의 용어 · \"~인 용어\" (앞 풀이가 충분히 길 때만)", () => {
  assert.deepEqual(run(["태어난 달의 기운(월령)이 나를 다스리는 쪽이에요."]), []);
  assert.deepEqual(run(["글자 아래쪽(지지)의 중심에 뿌리가 있어요."]), []);
  assert.deepEqual(run(["10년 단위로 바뀌는 시기(대운)인 지금은 표현이 주제예요."]), []);
  assert.deepEqual(run(["나 자신을 나타내는 글자인 일간이 정화예요."]), []);
  assert.deepEqual(run(["나와 같은 기운인 비견이 일지 자리에 있어요."]).map((e) => e.match(/\((.+?)\)/)?.[1]), ["일지"], "비견은 풀렸고 일지는 아직 풀리지 않았다");
  // 풀이가 아닌 것: 앞 말이 짧다 · 괄호가 한자뿐이다 · 용어 두 개가 서로를 풀이하는 꼴
  assert.ok(run(["그 시기(대운)에 일이 많아요."]).some((e) => /설명 없는 사주 용어\(대운\)/.test(e)), "앞 풀이가 세 글자뿐이다");
  assert.ok(run(["큰 흐름인 대운이 와요."]).some((e) => /설명 없는 사주 용어\(대운\)/.test(e)), "앞 풀이가 짧다");
  assert.ok(run(["정관(正官)이 많아요."]).some((e) => /설명 없는 사주 용어\(정관\)/.test(e)), "한자만 있는 괄호");
  assert.ok(run(["관성(정관)이 많아요."]).some((e) => /설명 없는 사주 용어\(관성\)/.test(e)), "용어가 용어를 풀이할 수는 없다");
  // 용어 앞의 꾸미는 말만 있는 꼴은 풀이로 알아보지 않는다 — 괄호로 풀어 달라고 요청한다(알려진 한계: 실제 글의 \"덜 받는 실령\"이 걸린다)
  assert.ok(run(["태어난 계절의 도움을 덜 받는 실령으로 읽혀요."]).some((e) => /설명 없는 사주 용어\(실령\)/.test(e)));
});

test("설명 없는 용어는 처음 쓴 곳에서 한 번만 지적하고, 문장 일부를 붙여 어디를 고칠지 알려 준다", () => {
  const errs = run(["일간이 정화예요.", "일간은 같아요. 그래서 일간이 오래 가요."]);
  assert.equal(errs.length, 1, "풀이는 처음 쓰는 곳에 붙이면 되므로 뒤의 같은 용어는 되풀이해 지적하지 않는다");
  assert.match(errs[0], /^t0: 설명 없는 사주 용어\(일간\) — "…일간이 정화예요\.…"/);
  assert.match(errs[0], /"일간\(쉬운 풀이\)"/);
  assert.match(errs[0], /"쉬운 풀이\(일간\)"/, "풀이를 앞에 쓰는 꼴도 된다고 알려 준다");
});

// ───────────── 설명 방식을 넓힌 뒤의 양쪽 시험 (2026-10-16, 운영자 요청) ─────────────
// 정상적인 설명 방식은 통과하고, 실제 잘못된 판정 · 설명 없는 용어는 계속 막혀야 한다. 한 글에 맞춘 예외가 아니라 모든 용어(ALL_TERMS)에 같은 규칙이 걸리는지로 본다.
test("모든 용어에 같은 규칙: 괄호 풀이(앞 · 뒤) · 이라고 해요(따옴표 포함) · 줄표 풀이 · 이어지는 문장의 풀이는 통과하고, 설명 없는 쓰임은 막힌다", () => {
  const checked: string[] = [];
  for (const t of ALL_TERMS.filter((x) => x.cls === "explain" || x.cls === "structure")) {
    const n = t.name;
    const control = run([`${n}(日干)이 있어요.`]); // 한자만 있는 괄호는 풀이가 아니다 — 이 용어를 알아보는지 확인하는 대조
    if (control.length === 0) continue; // 뒤따르는 글자에 따라 일상어와 구분하는 용어(일지 · 세운 등)는 이 꼴로는 알아보지 않는다
    checked.push(n);
    assert.ok(control.some((e) => e.includes(`설명 없는 사주 용어(${n})`)), `${n}: 설명 없는 쓰임이 걸려야 한다`);
    for (const ok of [
      `${n}(태어난 때 기운이 쓰이는 방식)이 있어요.`,
      `태어난 때 기운이 쓰이는 방식(${n})이 있어요.`,
      `태어난 때 기운이 쓰이는 방식을 ‘${n}’이라고 해요.`,
      `${n} — 태어난 때 기운이 쓰이는 방식을 뜻해요.`,
      `${n}(日干)이 있어요. 이는 태어난 때 기운이 쓰이는 방식이라는 뜻이에요.`,
      `${n}이 있어요. 이는 태어난 때 기운이 쓰이는 방식이라는 뜻이에요.`,
    ]) assert.deepEqual(run([ok]), [], `${n}: ${ok}`);
  }
  assert.ok(checked.length >= 20, `검증한 용어 ${checked.length}개 — 대부분의 용어를 다뤄야 한다`);
});

test("실령 설명 형식(운영자 예시): 용어 뒤 괄호 · 풀이 뒤 용어 표기 · 이어지는 문장의 풀이는 통과하고, 풀이 없이 쓰거나 꾸미는 말뿐이면 막힌다 — 설명 문제이지 판정 문제가 아니다", () => {
  // 풀이 안에 다른 용어(일간)가 들어 있으면 그 용어도 먼저 풀려 있어야 한다 — 풀이 속 용어도 같은 규칙이다
  const dayMaster = "일간(나 자신을 나타내는 글자)이 정화예요.";
  assert.deepEqual(run([dayMaster, "실령(태어난 계절의 기운이 일간을 왕성하게 돕는 때는 아니라는 뜻)이에요."]), []);
  assert.deepEqual(run([dayMaster, "실령 — 태어난 계절의 기운이 일간을 왕성하게 돕는 때는 아니라는 뜻이에요."]), []);
  assert.deepEqual(run([dayMaster, "태어난 계절의 기운이 일간을 왕성하게 돕는 때는 아니에요. 사주에서는 이를 ‘실령’이라고 해요."]), []);
  assert.deepEqual(run(["태어난 계절의 기운이 일간을 왕성하게 돕는 때는 아니에요. 사주에서는 이를 ‘실령’이라고 해요."]).map((e) => e.match(/용어\((.+?)\)/)?.[1]), ["일간"], "일간을 먼저 풀지 않았으면 풀이 속 일간이 걸린다(실령은 풀렸다)");
  assert.deepEqual(run(["태어난 달의 기운(월령)이 나를 돕는 쪽이 아니에요. 실령은 태어난 계절의 도움을 받지 못한다는 뜻이에요."]), []);
  assert.deepEqual(run(["실령이에요. 이는 태어난 계절의 도움을 덜 받는다는 뜻이에요."]), []);
  assert.ok(run(["실령이에요. 그래서 일이 많아요."]).some((e) => /설명 없는 사주 용어\(실령\)/.test(e)), "뒤 문장이 풀이가 아니면 막힌다");
  assert.ok(run(["실령이에요. 이는 정말 중요해요."]).some((e) => /설명 없는 사주 용어\(실령\)/.test(e)), "뜻을 말하지 않는 지시어 문장은 풀이가 아니다");
  assert.ok(run(["태어난 계절의 도움을 덜 받는 실령으로 읽혀요."]).some((e) => /설명 없는 사주 용어\(실령\)/.test(e)), "꾸미는 말만 있는 꼴은 풀이로 보지 않는다");
});

test("설명이 있어도 판정이 틀리거나 근거가 없으면 계속 막힌다 — 설명 문제와 내용 오류를 따로 본다", () => {
  const withFact = (id: string, fact: string): Evidence[] => STRUCTURE.map((e) => (e.id === id ? { ...e, fact } : e));
  const shiryeong = withFact("saju.structure.month", "월령(태어난 달의 기운): 월지 술 가을 → 월령을 얻지 못함(실령)");
  // 계산된 방향과 반대: 설명을 아무리 붙여도 득령이라고 쓰면 안 된다
  assert.ok(run(["득령(태어난 계절의 도움을 받는 상태)이라서 힘이 있어요."], shiryeong).some((e) => /계산된 월령과 반대\(득령\)/.test(e)));
  assert.ok(run(["태어난 계절의 도움을 받는 상태(득령)라서 힘이 있어요."], shiryeong).some((e) => /계산된 월령과 반대\(득령\)/.test(e)));
  // 강약이 갈림이면 신강 · 신약을 이 사람의 것으로 쓰지 못한다
  const weakStrength = STRUCTURE.map((e) => (e.id === "saju.structure.strength" ? { ...e, strength: "weak" as const } : e));
  assert.ok(run(["내 힘을 덜 받는 쪽(신약)이에요."], weakStrength).some((e) => /근거 없는 판정\(신약\)/.test(e)));
  // 구조 근거가 없거나 달라질 수 있으면 월령을 이 사람의 것으로 쓰지 못한다
  assert.ok(run(["태어난 달의 기운(월령)이 약해요."], []).some((e) => /근거 목록에 없는 판정\(월령\)/.test(e)));
  assert.ok(run(["태어난 달의 기운(월령)이 약해요."], [ev("saju.structure.month", "moderate", true)]).some((e) => /근거 목록에 없는 판정\(월령\)/.test(e)));
  // 엔진이 계산하지 않는 개인 판정은 풀이를 붙여도 쓰지 못한다
  for (const text of ["사주의 큰 틀(격국)이 좋아요.", "필요한 기운(용신)은 물이에요.", "특별한 기운을 뜻하는 신살(神煞)이 있어요.", "사람을 끄는 기운(도화살)이 있어요."]) {
    assert.ok(run([text]).some((e) => /근거 목록에 없는 판정/.test(e)), text);
  }
  // 용어 나열은 설명이 모두 있어도 막힌다
  assert.ok(run(["비겁(나와 같은 기운)과 인성(나를 돕는 기운)과 식상(표현하는 기운)이 같이 있어요."]).some((e) => /한 문장에 사주 용어가 3개/.test(e)));
});
