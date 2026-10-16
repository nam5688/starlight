// 실행: npm test — 리포트 예시(읽기 구조, 가상 인물 서윤)가 서윤의 실제 계산 근거 안에서 쓰였고, 본문은 쉬운 말이며,
// 원인을 좁혀 말하지 않고, 자료가 없는 영역을 "없음"으로 밝혔는지, 기본 화면이 짧게 유지되는지(요약 2문장 · 예시 1개 · 제목과 같은 말 되풀이 없음),
// 큰 흐름 타임라인이 글이 아니라 계산 결과에서 나왔는지 확인한다. 사람이 쓴 예시이며, 이 검사는 좋은 글의 보증이 아니다
// (근거가 결론을 실제로 뒷받침하는지는 "분석 근거"를 근거 문구와 나란히 놓고 사람이 읽어 확인한다).
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEvidence } from "../report/ai/generator.ts";
import { checkReadingDepth } from "../report/reading/depth.ts";
import { JARGON } from "../report/reading/plan.ts";
import { validateReadingDraft } from "../report/reading/validate.ts";
import { FORBIDDEN } from "../report/v2/validate.ts";
import { luckTimeline } from "../saju/interpret/rules.ts";
import { calculateSaju } from "../saju/manseryeok-engine.ts";
import { sampleReadingAsDraft, sampleReadingReport as R } from "./sample-reading-report.ts";
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
    ...(b.sections ?? []).flatMap((x) => [x.title, x.body, x.tryIt]),
    b.caveat ?? "",
    ...(b.traits ?? []).flatMap((t) => [t.name, t.shinesShort, t.burdenShort, t.shines, t.burden, t.example]),
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
  const paragraphs = [...R.blocks.flatMap((b) => [b.summary, b.example ?? "", ...b.details, b.watch ?? "", b.reactionFlow?.helpful ?? "", ...(b.traits ?? []).flatMap((t) => [t.shines, t.burden, t.example])]), R.flow.summary, R.flow.cardText];
  for (const p of paragraphs) assert.ok(sentences(p).length <= 3, `한 문단이 ${sentences(p).length}문장 — ${p.slice(0, 20)}`);
  // 대운 · 세운도 본문에는 쓰지 않는다 — "10년 단위의 시기" · "그해의 분위기"처럼 풀어 쓰고 용어는 근거에만 둔다
  assert.ok(R.summary.find((s) => s.kind === "flow")!.foot?.includes("사주에서 보는 10년 시기"), "대운은 쉬운 말로 풀어 쓴다");
});

test("리포트 예시: 기본 화면은 짧다 — 첫 화면 카드 3개(강점 · 주의할 점 · 지금 나의 시기), 주제마다 요약 2문장 이하 · 예시 1개, 제목과 같은 말을 되풀이하지 않는다", () => {
  assert.deepEqual(R.summary.map((s) => s.kind), ["strength", "caution", "flow"]);
  assert.ok(R.headline.length <= 36, `첫 화면 핵심 문장이 길다 (${R.headline.length}자)`);
  // 강한 포인트 · 힘들 수 있는 포인트 카드는 AI가 쓰는 짧은 말, 지금 나의 시기 카드는 코드가 채우는 쉬운 말(제목 · 뜻)이라 한도가 따로다
  for (const s of R.summary.filter((x) => x.kind !== "flow")) assert.ok(s.keyword.length <= 18 && s.note.length <= 60, `${s.kind} 카드가 길다`);
  const flowCard = R.summary.find((x) => x.kind === "flow")!;
  assert.ok(flowCard.keyword.length <= 24 && flowCard.note.length <= 90, "지금 나의 시기 카드가 길다");
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

test("리포트 예시: '강한 포인트 / 힘들 수 있는 포인트'는 특징 3개를 짧은 문구로 줄여 보이고, 접힘 안에서 특징마다 풀이 · 예시를 나눠 쓴다", () => {
  const b = R.blocks.find((x) => x.id === "strength-burden")!;
  assert.equal(b.traits?.length, 3);
  assert.equal(new Set(b.traits!.map((t) => t.name)).size, 3, "특징 이름은 서로 다르다");
  for (const t of b.traits!) {
    assert.ok(t.name.length <= 12 && t.shinesShort.length <= 14 && t.burdenShort.length <= 16, `${t.name}: 카드 문구가 길다`);
    assert.ok(t.shines.length > t.shinesShort.length && t.burden.length > t.burdenShort.length, `${t.name}: 풀이 문장이 문구보다 자세해야 한다`);
    assert.doesNotMatch(t.shines + t.burden, /나쁘|잘못|문제가 있/, `${t.name}: 좋고 나쁨 표현`);
    assert.ok(t.example.length >= 20 && sentences(t.example).length <= 2, `${t.name}: 예시는 한두 문장`);
  }
  // 예시는 특징마다 다른 장면이다 (같은 장면을 되풀이하지 않는다) — 블록 전체 예시는 따로 두지 않는다
  assert.equal(new Set(b.traits!.map((t) => t.example)).size, 3);
  assert.equal(b.example, undefined);
  // 화면 이름표는 "강점 · 부담" 대신 쉬운 말
  assert.match(b.topic, /강한 포인트/);
  assert.doesNotMatch(bodyTexts().join("\n"), /강점과 부담|부담이 되는|조절이 필요할 때/);
  assert.deepEqual(R.summary.filter((s) => s.kind !== "flow").map((s) => s.label), ["내가 강한 포인트", "내가 힘들 수 있는 포인트"]);
});

test("리포트 예시: 지금 지나는 시기 타임라인은 서윤의 사주 계산에서 나왔고(글로 지어내지 않았다), 카드 문구의 기간과 맞는다", () => {
  assert.deepEqual(R.timeline, luckTimeline(SAMPLE_CHART, R.timelineReference));
  assert.deepEqual(R.timeline.map((s) => s.role), ["previous", "current", "next"]);
  const cur = R.timeline.find((s) => s.role === "current")!;
  assert.ok(cur.progress! > 0 && cur.progress! < 1);
  const dot = (s: string) => s.replace("-", ".");
  const flowCard = R.summary.find((s) => s.kind === "flow")!;
  assert.ok(flowCard.foot!.includes(dot(cur.from)) && flowCard.foot!.includes(dot(cur.to)), `지금 나의 시기 카드의 기간이 계산(${cur.from}~${cur.to})과 다르다`);
  // 근거에 적은 대운 기간도 같은 계산이다
  assert.ok(R.flow.basis.computed.join(" ").includes(`${cur.from}~${cur.to}`), "분석 근거의 대운 기간은 근거 목록(계산 결과)에서 그대로 나온다");
  // 흐름 해석의 주제 문구는 계산된 십신 묶음에서 가져온다 — 타임라인에 곡선 · 점수 · 확률은 없다
  assert.ok(cur.themes.length === 2);
  assert.doesNotMatch(JSON.stringify(R.timeline), /score|점수|확률|운세/);
});

test("리포트 예시: 원인을 하나로 좁혀 말하지 않고, 막는 표현 · 날짜 · 사건 · 확률이 없다", () => {
  for (const t of allTexts()) {
    for (const f of FORBIDDEN) assert.doesNotMatch(t, f.re, `${f.why}: ${t.slice(0, 30)}`);
    // 연구 통계를 쓰지 않은 이유를 밝히는 문장은 "확률"이라는 말을 쓸 수 있다
    if (t === R.flow.statistics) continue;
    assert.doesNotMatch(t, /성격이 아니라|불안이 아니라|시기 때문입니다|때문입니다|때문이에요|때문이죠/, `원인을 좁혀 말함: ${t.slice(0, 30)}`);
    assert.doesNotMatch(t, /\d+\s*%|확률/, `확률 표현: ${t.slice(0, 30)}`);
    assert.doesNotMatch(t, /\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/, `특정 날짜: ${t.slice(0, 30)}`);
    // 오래 가는 관계 · 결혼생활에서 중요해질 조건은 쓸 수 있다(운영자 2026-10-16) — 결혼 · 이별 · 이직 같은 사건을 예언하는 말만 막는다
    assert.doesNotMatch(t, /결혼(을|이) (하게|할|한다)|결혼하게|결혼할|이별하게|헤어지게|헤어질|이직하게|취업|퇴사/, `사건 예언: ${t.slice(0, 30)}`);
    // 나이 · 직업은 "다루지 않는다" 또는 "알지 못한다"는 안내에서만 나온다 (만들어 채우지 않는다)
    if (/나이|직업/.test(t)) assert.match(t, /다루지 않(습니다|아요)|알지 못(합니다|해요)|정해서 말하지 않/, `나이 · 직업 언급: ${t.slice(0, 30)}`);
  }
  // 시기는 계산된 해(2026~2028)와 대운 기간만 (타임라인의 이전 · 다음 기간은 계산에서 나오며 글에 적지 않는다)
  const years = new Set(bodyTexts().join(" ").match(/\b20\d{2}\b/g));
  for (const y of years) assert.ok(["2026", "2027", "2028", "2024", "2034"].includes(y), `계산되지 않은 해 ${y}`);
  assert.match(R.flow.caveat, /예측이 아니(며|고)/);
  assert.match(R.flow.scenarioNote, /예측이 아(닙니다|니에요)/);
  assert.match(R.flow.statistics, /(쓰지|사용하지) 않았(습니다|어요)/);
});

test("리포트 예시: 없는 자료(알려 준 고민 · 상대 자료 · 연구 통계)는 '없음'으로 밝히고 만들어 채우지 않는다 — 돈 부분은 직접 물은 응답이 없다고 한곳에 쓴다", () => {
  const none = R.inputs.filter((i) => i.status === "none").map((i) => i.name);
  assert.deepEqual(none, ["알려 준 고민 · 상황", "상대 자료", "연구 통계"]);
  for (const i of R.inputs.filter((x) => x.status === "none")) assert.deepEqual(i.usedIn, [], i.name);
  assert.doesNotMatch(allTexts().join("\n"), /알려 주신/, "고민을 알려 주지 않은 인물에게 '알려 주신'");
  const money = R.blocks.find((s) => s.id === "work-money")!;
  // 고정 안내(plan.ts)에 한 번만 쓴다 — 본문 문단에서 되풀이하지 않는다
  assert.match(money.caveat ?? "", /직접 물은 응답이 아니라/);
  assert.doesNotMatch([...money.details, ...(money.sections ?? []).map((x) => x.body)].join(" "), /응답이 없어|응답 자료 없이|직접 물은 응답/);
  // 한계 안내는 풀이마다 되풀이하지 않는다 — "사주만으로는 알 수 없어요" 같은 경고가 본문에 없다
  assert.doesNotMatch(bodyTexts().join("\n"), /사주(만으로|로는)\s*(는\s*)?(알 수 없|판단할 수 없|단정할 수 없)/);
  const love = R.blocks.find((s) => s.id === "love")!;
  assert.match(love.caveat ?? "", /상대 자료: 없음/);
  // 개발용 문항을 새 자체 문항처럼 쓰지 않는다
  for (const i of R.inputs.filter((x) => x.name !== "사주" && x.name !== "MBTI" && x.status !== "none")) assert.equal(i.status, "dev", i.name);
  // MBTI는 본인이 입력한 참고값이다 — 응답 문항으로 MBTI 축을 읽은 것처럼 쓰지 않는다 (생성기가 받는 근거에 그런 근거가 없다)
  const mbti = R.inputs.find((i) => i.name === "MBTI")!;
  assert.equal(mbti.status, "used");
  assert.match(mbti.note, /본인이 입력한/);
  assert.doesNotMatch(allTexts().join("\n"), /T 쪽|T\(논리|판단 기준이 T/);
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

// ── 예시와 실제 생성의 기준이 같다: 예시를 AI가 돌려주는 초안 형식으로 바꿔 실제 생성기와 같은 검사에 넣는다 ──
const sampleAsDraft = sampleReadingAsDraft;

test("리포트 예시: 실제 생성기가 쓰는 형식 검사(validateReadingDraft)를 그대로 통과한다 — 예시만 새롭고 생성기는 옛 규칙인 상태가 없다", () => {
  const checked = validateReadingDraft(sampleAsDraft(), evidence, { hasContext: false });
  assert.ok(checked.ok, checked.ok ? "" : checked.errors.join("\n"));
});

test("리포트 예시: 내용 차이 검사(조건 · 범용 문장 · 겹침 · 행동)도 같은 기준으로 확인한다 (기준값은 예시에 맞춰 바꾸지 않았다)", () => {
  const depth = checkReadingDepth({ draft: sampleAsDraft() });
  assert.deepEqual(depth.flags.filter((f) => f.severity === "fail"), [], depth.flags.map((f) => f.message).join("\n"));
});

test("리포트 예시: 고정 문구(이름표 · 안내)는 실제 생성과 같은 코드(plan.ts)의 것이다", () => {
  assert.deepEqual(R.summary.map((s) => s.label), ["내가 강한 포인트", "내가 힘들 수 있는 포인트", "지금 나의 시기"]);
  assert.match(R.blocks.find((b) => b.id === "love")!.caveat!, /상대 자료: 없음/);
});
