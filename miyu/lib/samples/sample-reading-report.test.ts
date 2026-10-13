// 실행: npm test — 리포트 예시(읽기 구조, 가상 인물 서윤)가 서윤의 실제 계산 근거 안에서 쓰였고, 본문은 쉬운 말이며,
// 원인을 좁혀 말하지 않고, 자료가 없는 영역을 "없음"으로 밝혔는지 확인한다. 사람이 쓴 예시이며, 이 검사는 좋은 글의 보증이 아니다
// (근거가 결론을 실제로 뒷받침하는지는 "이렇게 분석했어요"를 근거 문구와 나란히 놓고 사람이 읽어 확인한다).
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEvidence } from "../report/ai/generator.ts";
import { FORBIDDEN } from "../report/v2/validate.ts";
import { calculateSaju } from "../saju/manseryeok-engine.ts";
import { sampleReadingReport as R } from "./sample-reading-report.ts";
import { sampleReport } from "./sample-report.ts";

const saju = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" });
const evidence = buildEvidence({ nickname: "서윤", knownMbti: "INFJ", birthText: "", summary: sampleReport, saju, gender: "female", context: null } as never, { year: 2026, month: 10 });
const known = new Map(evidence.map((e) => [e.id, e]));

/** 소비자 화면의 본문(접어 둔 "이렇게 분석했어요" 제외) */
const bodyTexts = () => [
  R.headline,
  ...R.summary.flatMap((s) => [s.keyword, s.text]),
  ...R.sections.flatMap((s) => [s.headline, s.lead, ...s.paragraphs, s.example, s.watch, s.caveat ?? "", ...(s.traits ?? []).flatMap((t) => [t.name, t.shines, t.burden]), ...(s.comfort ? [...s.comfort.comfortable, ...s.comfort.clash, s.comfort.note] : [])]),
  R.flow.headline,
  R.flow.lead,
  R.flow.caveat,
  ...R.flow.periods.flatMap((p) => [p.period, p.theme, p.watch]),
  ...R.flow.scenarios.flatMap((s) => [s.when, s.then]),
  R.flow.scenarioNote,
  R.flow.statistics,
  ...R.actions.flatMap((a) => [a.title, a.detail]),
];
const allTexts = () => [...bodyTexts(), ...R.inputs.map((i) => i.note), ...[...R.sections.map((s) => s.basis), R.flow.basis].flatMap((b) => [...b.computed, ...b.tradition, ...b.answers, ...(b.differences ?? []), ...b.unknown])];
const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).filter(Boolean);
const JARGON = /비겁|식상|관성|인성|재성|정관|편관|비견|겁재|식신|상관|편재|정재|정인|일지|일간|천간|지지|원국|오행|세운/;

test("리포트 예시: 모든 해석의 근거 ID는 서윤의 계산 결과에 있고, 내부 근거 ID는 소비자 화면 문구에 나오지 않는다", () => {
  for (const s of [...R.sections, R.flow]) {
    assert.ok(s.evidence.length > 0, `${s.title}: 근거 없음`);
    for (const id of s.evidence) assert.ok(known.has(id), `${s.title}: 없는 근거 ID ${id}`);
    assert.ok(s.evidence.some((id) => id.startsWith("saju.")), `${s.title}: 사주 근거가 없음`);
  }
  for (const t of allTexts()) assert.doesNotMatch(t, /\b(saju|survey|self)\.[\w.가-힣-]+/, `근거 ID 노출: ${t.slice(0, 30)}`);
});

test("리포트 예시: 본문은 쉬운 말이다 — 사주 용어와 점수 숫자는 접어 둔 '이렇게 분석했어요'에만 있고, 한 문단은 3문장 이하다", () => {
  for (const t of bodyTexts()) {
    assert.doesNotMatch(t, JARGON, `본문에 사주 용어: ${t.slice(0, 30)}`);
    assert.doesNotMatch(t, /\d{2,3}\s*점|백분위|\(\d{2}\)/, `본문에 점수: ${t.slice(0, 30)}`);
  }
  for (const s of R.sections) for (const p of s.paragraphs) assert.ok(sentences(p).length <= 3, `${s.title}: 한 문단이 ${sentences(p).length}문장 — ${p.slice(0, 20)}`);
  // 대운은 처음 한 번만 뜻을 붙이고(10년 단위의 큰 흐름), 이후 본문에서는 풀어 쓰거나 괄호 없이 쓴다
  const withGloss = bodyTexts().filter((t) => /대운/.test(t) && /10년 단위/.test(t)).length;
  assert.equal(withGloss, 1, "대운 뜻풀이는 본문에서 한 번");
});

test("리포트 예시: 원인을 하나로 좁혀 말하지 않고, 막는 표현 · 날짜 · 사건 · 확률이 없다", () => {
  for (const t of allTexts()) {
    for (const f of FORBIDDEN) assert.doesNotMatch(t, f.re, `${f.why}: ${t.slice(0, 30)}`);
    // 연구 통계를 쓰지 않은 이유를 밝히는 문장은 "확률"이라는 말을 쓸 수 있다
    if (t === R.flow.statistics) continue;
    assert.doesNotMatch(t, /성격이 아니라|불안이 아니라|시기 때문입니다|때문입니다/, `원인을 좁혀 말함: ${t.slice(0, 30)}`);
    assert.doesNotMatch(t, /\d+\s*%|확률/, `확률 표현: ${t.slice(0, 30)}`);
    assert.doesNotMatch(t, /\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/, `특정 날짜: ${t.slice(0, 30)}`);
    assert.doesNotMatch(t, /결혼|이별|헤어지|이직하게|취업|퇴사/, `사건 예언: ${t.slice(0, 30)}`);
    // 나이 · 직업은 "다루지 않는다" 또는 "알지 못한다"는 안내에서만 나온다 (만들어 채우지 않는다)
    if (/나이|직업/.test(t)) assert.match(t, /다루지 않습니다|알지 못합니다/, `나이 · 직업 언급: ${t.slice(0, 30)}`);
  }
  // 시기는 계산된 해(2026~2028)와 대운 기간만
  const years = new Set(bodyTexts().join(" ").match(/\b20\d{2}\b/g));
  for (const y of years) assert.ok(["2026", "2027", "2028", "2024", "2034"].includes(y), `계산되지 않은 해 ${y}`);
  assert.match(R.flow.caveat, /예측이 아니며/);
  assert.match(R.flow.scenarioNote, /예측이 아닙니다/);
  assert.match(R.flow.statistics, /사용하지 않았습니다/);
});

test("리포트 예시: 없는 자료(알려 준 고민 · 상대 자료 · 연구 통계)는 '없음'으로 밝히고 만들어 채우지 않는다 — 돈 부분은 응답 자료가 없다고 쓴다", () => {
  const none = R.inputs.filter((i) => i.status === "none").map((i) => i.name);
  assert.deepEqual(none, ["알려 준 고민 · 상황", "상대 자료", "연구 통계"]);
  for (const i of R.inputs.filter((x) => x.status === "none")) assert.deepEqual(i.usedIn, [], i.name);
  assert.doesNotMatch(allTexts().join("\n"), /알려 주신/, "고민을 알려 주지 않은 인물에게 '알려 주신'");
  const money = R.sections.find((s) => s.id === "work-money")!;
  assert.match([...money.paragraphs, money.caveat ?? ""].join(" "), /응답이 없어/);
  assert.ok(money.basis.unknown.some((u) => /응답 자료가 없습니다/.test(u)));
  const love = R.sections.find((s) => s.id === "love")!;
  assert.match(love.caveat ?? "", /상대 자료: 없음/);
  // 개발용 문항을 새 자체 문항처럼 쓰지 않는다
  for (const i of R.inputs.filter((x) => x.name !== "사주" && x.status !== "none")) assert.equal(i.status, "dev", i.name);
});

test("리포트 예시: '쓰인 곳'은 각 주제가 실제로 단 근거와 맞는다 (자료가 어느 해석에 쓰였는지 화면의 말과 어긋나지 않는다)", () => {
  const prefix: Record<string, RegExp> = {
    "사주": /^saju\./,
    "MBTI": /^self\.mbti$/,
    "기질 · 성격": /^survey\.(novelty|caution|sensitivity|persistence)\./,
    "가까운 관계에서의 반응(애착 경향)": /^survey\.(anxiety|avoidance)\./,
  };
  const sections = [...R.sections, R.flow];
  for (const [name, re] of Object.entries(prefix)) {
    const input = R.inputs.find((i) => i.name === name)!;
    const actual = sections.filter((s) => s.evidence.some((id) => re.test(id))).map((s) => s.title);
    const claimed = sections.filter((s) => input.usedIn.some((u) => s.title.startsWith(u))).map((s) => s.title);
    assert.deepEqual(claimed, actual, `${name}: 쓰인 곳이 근거와 다름`);
  }
});
