// 실행: npm test — 리포트 예시(읽기 구조, 가상 인물 서윤)가 서윤의 실제 계산 근거 안에서 쓰였고, 본문은 쉬운 말이며,
// 원인을 좁혀 말하지 않고, 자료가 없는 영역을 "없음"으로 밝혔는지, 기본 화면이 짧게 유지되는지(요약 2문장 · 예시 1개 · 제목과 같은 말 되풀이 없음),
// 큰 흐름 타임라인이 글이 아니라 계산 결과에서 나왔는지 확인한다. 사람이 쓴 예시이며, 이 검사는 좋은 글의 보증이 아니다
// (근거가 결론을 실제로 뒷받침하는지는 "분석 근거"를 근거 문구와 나란히 놓고 사람이 읽어 확인한다).
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEvidence } from "../report/ai/generator.ts";
import { FORBIDDEN } from "../report/v2/validate.ts";
import { luckTimeline } from "../saju/interpret/rules.ts";
import { calculateSaju } from "../saju/manseryeok-engine.ts";
import { sampleReadingReport as R } from "./sample-reading-report.ts";
import { SAMPLE_CHART, sampleReport } from "./sample-report.ts";

const saju = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" });
const evidence = buildEvidence({ nickname: "서윤", knownMbti: "INFJ", birthText: "", summary: sampleReport, saju, gender: "female", context: null } as never, { year: 2026, month: 10 });
const known = new Map(evidence.map((e) => [e.id, e]));
const topics = [...R.blocks, R.flow];

/** 소비자 화면의 본문(접어 둔 "분석 근거" 제외) */
const bodyTexts = () => [
  R.headline,
  ...R.summary.flatMap((s) => [s.label, s.keyword, s.note]),
  ...R.blocks.flatMap((b) => [
    b.topic,
    b.headline,
    b.summary,
    b.example ?? "",
    ...b.details,
    b.detailExample ?? "",
    b.watch ?? "",
    b.caveat ?? "",
    ...(b.traits ?? []).flatMap((t) => [t.name, t.shinesShort, t.burdenShort, t.shines, t.burden]),
    ...(b.comfort ? [...b.comfort.comfortable, ...b.comfort.clash, b.comfort.note] : []),
    ...(b.reactionFlow ? [b.reactionFlow.when, ...b.reactionFlow.steps.flatMap((s) => [s.label, s.text]), b.reactionFlow.helpful] : []),
  ]),
  R.flow.topic,
  R.flow.headline,
  R.flow.summary,
  R.flow.caveat,
  R.flow.cardText,
  ...R.flow.years.flatMap((y) => [y.year, y.theme]),
  ...R.flow.periods.flatMap((p) => [p.period, p.theme, p.watch]),
  ...R.flow.scenarios.flatMap((s) => [s.when, s.then]),
  R.flow.scenarioNote,
  R.flow.statistics,
  ...R.actions.flatMap((a) => [a.title, a.detail]),
].filter(Boolean);
const allTexts = () => [...bodyTexts(), ...R.inputs.map((i) => i.note), ...[...R.blocks.map((b) => b.basis), R.flow.basis].flatMap((b) => [...b.computed, ...b.tradition, ...b.answers, ...(b.differences ?? []), ...b.unknown])];
const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).filter(Boolean);
const JARGON = /비겁|식상|관성|인성|재성|정관|편관|비견|겁재|식신|상관|편재|정재|정인|일지|일간|천간|지지|원국|오행|세운/;

test("리포트 예시: 모든 해석의 근거 ID는 서윤의 계산 결과에 있고, 내부 근거 ID는 소비자 화면 문구에 나오지 않는다", () => {
  for (const s of topics) {
    assert.ok(s.evidence.length > 0, `${s.id}: 근거 없음`);
    for (const id of s.evidence) assert.ok(known.has(id), `${s.id}: 없는 근거 ID ${id}`);
    assert.ok(s.evidence.some((id) => id.startsWith("saju.")), `${s.id}: 사주 근거가 없음`);
  }
  for (const t of allTexts()) assert.doesNotMatch(t, /\b(saju|survey|self)\.[\w.가-힣-]+/, `근거 ID 노출: ${t.slice(0, 30)}`);
});

test("리포트 예시: 본문은 쉬운 말이다 — 사주 용어와 점수 숫자는 접어 둔 '분석 근거'에만 있고, 한 문단은 3문장 이하다", () => {
  for (const t of bodyTexts()) {
    assert.doesNotMatch(t, JARGON, `본문에 사주 용어: ${t.slice(0, 30)}`);
    assert.doesNotMatch(t, /\d{2,3}\s*점|백분위|\(\d{2}\)/, `본문에 점수: ${t.slice(0, 30)}`);
  }
  const paragraphs = [...R.blocks.flatMap((b) => [b.summary, b.example ?? "", ...b.details, b.watch ?? "", b.reactionFlow?.helpful ?? ""]), R.flow.summary, R.flow.cardText];
  for (const p of paragraphs) assert.ok(sentences(p).length <= 3, `한 문단이 ${sentences(p).length}문장 — ${p.slice(0, 20)}`);
  // 대운은 처음 한 번만 뜻을 붙이고(10년 단위의 큰 흐름), 이후 본문에서는 풀어 쓰거나 괄호 없이 쓴다
  const withGloss = bodyTexts().filter((t) => /대운/.test(t) && /10년 단위/.test(t)).length;
  assert.equal(withGloss, 1, "대운 뜻풀이는 본문에서 한 번");
});

test("리포트 예시: 기본 화면은 짧다 — 첫 화면 카드 3개(강점 · 주의할 점 · 현재 흐름), 주제마다 요약 2문장 이하 · 예시 1개, 제목과 같은 말을 되풀이하지 않는다", () => {
  assert.deepEqual(R.summary.map((s) => s.kind), ["strength", "caution", "flow"]);
  assert.ok(R.headline.length <= 36, `첫 화면 핵심 문장이 길다 (${R.headline.length}자)`);
  for (const s of R.summary) assert.ok(s.keyword.length <= 18 && s.note.length <= 60, `${s.kind} 카드가 길다`);
  for (const b of R.blocks) {
    assert.ok(b.headline.length <= 30, `${b.id}: 제목이 길다 (${b.headline.length}자)`);
    assert.ok(sentences(b.summary).length <= 2, `${b.id}: 요약이 2문장을 넘는다`);
    assert.ok(!b.summary.includes(b.headline), `${b.id}: 요약이 제목을 그대로 되풀이한다`);
    if (b.example) assert.ok(!b.summary.includes(b.example) && !b.details.some((d) => d.includes(b.example!)), `${b.id}: 예시가 본문과 겹친다`);
    // 같은 예시가 접힘 안에서 또 나오지 않는다 (본문 문단은 요약 · 예시에 없던 말을 더한다)
    for (const d of b.details) assert.ok(!b.summary.includes(d), `${b.id}: 풀이가 요약을 되풀이한다`);
    if (b.caveat) assert.ok(b.caveat.length <= 90, `${b.id}: 조건 안내가 길다`);
  }
  assert.ok(R.flow.headline.length <= 30);
  assert.ok(sentences(R.flow.summary).length <= 2);
  // 같은 이름표를 세 번 되풀이하던 이전 형식을 쓰지 않는다 (카드 이름표는 화면 부품이 한 번씩만 정한다)
  assert.doesNotMatch(bodyTexts().join("\n"), /힘이 되는 때|부담이 되는 때/);
});

test("리포트 예시: 강점과 부담은 특징 3개를 짧은 문구로 줄여 보이고, 문구는 자세한 풀이의 문장과 같은 뜻이다", () => {
  const b = R.blocks.find((x) => x.id === "strength-burden")!;
  assert.equal(b.traits?.length, 3);
  assert.deepEqual(b.traits!.map((t) => t.name), ["꼼꼼하게 다듬기", "상대 반응 살피기", "가까운 사람에게 기대기"]);
  for (const t of b.traits!) {
    assert.ok(t.name.length <= 12 && t.shinesShort.length <= 14 && t.burdenShort.length <= 16, `${t.name}: 카드 문구가 길다`);
    assert.ok(t.shines.length > t.shinesShort.length && t.burden.length > t.burdenShort.length, `${t.name}: 풀이 문장이 문구보다 자세해야 한다`);
    assert.doesNotMatch(t.shines + t.burden, /나쁘|잘못|문제가 있/, `${t.name}: 좋고 나쁨 표현`);
  }
  assert.ok(b.example, "일상 예시는 접힘 안에 있어야 한다");
});

test("리포트 예시: 지금 지나는 큰 흐름 타임라인은 서윤의 사주 계산에서 나왔고(글로 지어내지 않았다), 카드 문구의 기간과 맞는다", () => {
  assert.deepEqual(R.timeline, luckTimeline(SAMPLE_CHART, R.timelineReference));
  assert.deepEqual(R.timeline.map((s) => s.role), ["previous", "current", "next"]);
  const cur = R.timeline.find((s) => s.role === "current")!;
  assert.ok(cur.progress! > 0 && cur.progress! < 1);
  const dot = (s: string) => s.replace("-", ".");
  const flowCard = R.summary.find((s) => s.kind === "flow")!;
  assert.ok(flowCard.note.includes(dot(cur.from)) && flowCard.note.includes(dot(cur.to)), `현재 흐름 카드의 기간이 계산(${cur.from}~${cur.to})과 다르다`);
  // 근거에 적은 대운 기간도 같은 계산이다
  const [fy, fm] = cur.from.split("-").map(Number);
  const [ty, tm] = cur.to.split("-").map(Number);
  assert.ok(R.flow.basis.computed.join(" ").includes(`${fy}년 ${fm}월~${ty}년 ${tm}월`));
  // 흐름 해석의 주제 문구는 계산된 십신 묶음에서 가져온다 — 타임라인에 곡선 · 점수 · 확률은 없다
  assert.ok(cur.themes.length === 2);
  assert.doesNotMatch(JSON.stringify(R.timeline), /score|점수|확률|운세/);
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
  // 시기는 계산된 해(2026~2028)와 대운 기간만 (타임라인의 이전 · 다음 기간은 계산에서 나오며 글에 적지 않는다)
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
  const money = R.blocks.find((s) => s.id === "work-money")!;
  assert.match([...money.details, money.caveat ?? ""].join(" "), /응답이 없어/);
  assert.ok(money.basis.unknown.some((u) => /응답 자료가 없습니다/.test(u)));
  const love = R.blocks.find((s) => s.id === "love")!;
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
  for (const [name, re] of Object.entries(prefix)) {
    const input = R.inputs.find((i) => i.name === name)!;
    const actual = topics.filter((s) => s.evidence.some((id) => re.test(id))).map((s) => s.topic);
    const claimed = topics.filter((s) => input.usedIn.includes(s.topic)).map((s) => s.topic);
    assert.deepEqual(claimed, actual, `${name}: 쓰인 곳이 근거와 다름`);
  }
  for (const i of R.inputs) for (const u of i.usedIn) assert.ok(topics.some((s) => s.topic === u), `${i.name}: 없는 주제 ${u}`);
});
