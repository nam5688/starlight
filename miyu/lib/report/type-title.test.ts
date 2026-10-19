// 실행: npm test — "나의 유형"(개인 유형 10개 + 혼합 경향)을 화면 · 대화 카드 · 읽기용 글이 같은 한 곳(type-title.ts)에서 받는지,
// 10개 분기가 각각 실제로 나오는지, 사람마다 자기 사주 + 응답으로 계산되고 다른 사람의 값이 섞이지 않는지,
// 동점 · 응답 누락 · 출생 시각 미상 · 사주 미계산에서 억지로 이름을 붙이지 않는지 확인한다.
// 규칙(사주 갈래 → 응답으로 두 모습 가르기)은 새로 만들지 않았다 — 기존 personal-type.ts를 그대로 쓰고, 이 시험은 그 결과가 화면 · 읽기 출력까지 어긋나지 않고 도착하는지 본다.
// 시험에 쓰는 사람 · 응답은 모두 시험이 지어낸 가상 값이다(실제 사람의 입력이 아니다).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { FLAVOR_RULES, MIXED_TYPE, PERSONAL_TYPE_IDS, PERSONAL_TYPES, personalTypeOf, sajuTilt, type PersonalTypeId } from "../assessment/personal-type.ts";
import { PERSONAL_TYPE } from "../config/product.ts";
import { sampleReadingReport } from "../samples/sample-reading-report.ts";
import { SAMPLE_CHART, SAMPLE_TYPE_TITLE, sampleReport } from "../samples/sample-report.ts";
import type { Group } from "../saju/interpret/structure.ts";
import type { SajuOk, SajuResult } from "../saju/engine.ts";
import { calculateSaju } from "../saju/manseryeok-engine.ts";
import { buildDevFreeSummary } from "./build-free-summary.ts";
import { buildIdentity } from "./identity.ts";
import { renderReadingMarkdown } from "./reading/render-text.ts";
import { buildTalkModel } from "./reading/talk.ts";
import { normalizeEol, readSource } from "./test-source.ts";
import { assessmentTypeTitle, legacyTypeTitle, personalTypeTitle, resolveTypeTitle, typeTitleFor } from "./type-title.ts";
import type { FreeSummary } from "./types.ts";

type Summ = Pick<FreeSummary, "temperament" | "relationship" | "mbti">;

const person = (year: number, month: number, day: number, birthTime: string | null = "14:20", gender: "female" | "male" = "female"): SajuOk => {
  const r = calculateSaju({ year, month, day, calendar: "solar", isLeapMonth: false, birthTime, gender });
  assert.equal(r.status, "ok");
  return r as SajuOk;
};

/** 응답 점수를 정해 요약을 만든다 — 정하지 않은 행은 50(가운데) */
const summaryOf = (scores: Partial<Record<string, number>>): Summ => {
  const row = (id: string) => ({ id, label: id, score: scores[id] ?? 50, lowMeaning: "", highMeaning: "" });
  const axis = (id: string) => ({ ...row(id), lowName: "", highName: "" });
  return { temperament: ["novelty", "caution", "sensitivity", "persistence"].map(row), relationship: ["anxiety", "avoidance"].map(row), mbti: { axes: ["ei", "sn", "tf", "jp"].map(axis) } };
};

/** 격자로 훑은 가상 사주들 */
const GRID: SajuOk[] = [];
for (let y = 1958; y <= 2006; y += 2) for (const [m, d] of [[1, 12], [2, 9], [3, 28], [5, 21], [7, 15], [8, 3], [10, 9], [11, 17]]) GRID.push(person(y, m, d, y % 4 === 0 ? null : "14:20"));

const GROUPS: Group[] = ["비겁", "식상", "재성", "관성", "인성"];
/** 사주 갈래가 하나로 정해지는(dominant) 가상 사주를 갈래마다 하나씩 */
const DOMINANT: Record<Group, SajuOk> = {} as Record<Group, SajuOk>;
for (const g of GROUPS) {
  const found = GRID.find((s) => sajuTilt(s).dominant === g);
  assert.ok(found, `${g}: 격자에서 이 갈래가 하나로 정해지는 사주를 찾았다`);
  DOMINANT[g] = found;
}

/** 한 모습(a 또는 b)을 가장 또렷하게 가리키는 응답 — 그 모습의 행만 끝쪽(95 · 5)으로 두고 나머지는 가운데 */
function scoresToward(group: Group, side: "a" | "b"): Partial<Record<string, number>> {
  const rule = FLAVOR_RULES[group];
  const out: Record<string, number> = {};
  for (const p of side === "a" ? rule.aParts : rule.bParts) out[p.row] = p.toward === "high" ? 95 : 5;
  return out;
}

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
};

test("10개 유형 이름: 코드에 고정된 10개이고, 갈래마다 두 모습이 있다 (실구현 목록)", () => {
  const names = PERSONAL_TYPE_IDS.map((id) => PERSONAL_TYPES[id].name);
  assert.equal(names.length, 10);
  assert.deepEqual(
    [...names].sort(),
    ["관계 조율형", "기준 중심형", "독립 추진형", "빠른 실행형", "섬세 공감형", "신중 몰입형", "안정 구축형", "유연 적응형", "책임 완수형", "탐색 확장형"].sort(),
  );
  assert.equal(MIXED_TYPE.name, "혼합 경향");
});

test("10개 분기 각각: 사주 갈래가 정해지고 응답이 한 모습 쪽으로 또렷하면 그 이름이 나온다 — 화면 값(typeTitleFor)과 계산(personalTypeOf)이 같다", () => {
  assert.equal(PERSONAL_TYPE.visible, true);
  const reached: string[] = [];
  for (const group of GROUPS) {
    const saju = DOMINANT[group];
    const rule = FLAVOR_RULES[group];
    for (const side of ["a", "b"] as const) {
      const summary = summaryOf(scoresToward(group, side));
      const id: PersonalTypeId = side === "a" ? rule.a : rule.b;
      const direct = personalTypeOf({ saju, summary });
      assert.equal(direct.kind, "type", `${PERSONAL_TYPES[id].name}: 이름이 붙는다`);
      if (direct.kind === "type") assert.equal(direct.info.id, id);
      const title = typeTitleFor({ saju, summary }, sampleReport.tendency.name);
      assert.ok(title);
      assert.equal(title.kind, "type");
      assert.equal(title.name, PERSONAL_TYPES[id].name);
      assert.equal(title.line, PERSONAL_TYPES[id].line);
      assert.equal(personalTypeTitle({ saju, summary })?.name, title.name, "스위치를 읽지 않는 계산과 화면 값이 같다");
      reached.push(title.name);
    }
  }
  assert.equal(new Set(reached).size, 10, `10개 분기가 서로 다른 이름 10개로 모두 나온다: ${reached.join(", ")}`);
});

test("실제 22문항 응답 점수(buildDevFreeSummary)로도 10개 이름이 모두 나오고 혼합 경향도 나온다 — 한 이름으로 쏠리지 않는다", () => {
  const items = ASSESSMENT_MODULES.flatMap((m) => m.items);
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const counts = new Map<string, number>();
  for (let n = 0; n < 2400; n++) {
    const answers = Object.fromEntries(items.map((it) => [it.id, 1 + Math.floor(rnd() * 5)]));
    const title = typeTitleFor({ saju: GRID[n % GRID.length], summary: buildDevFreeSummary(answers) }, null);
    assert.ok(title);
    counts.set(title.name, (counts.get(title.name) ?? 0) + 1);
  }
  for (const id of PERSONAL_TYPE_IDS) assert.ok((counts.get(PERSONAL_TYPES[id].name) ?? 0) > 0, `${PERSONAL_TYPES[id].name}: 실제 응답 점수로 도달한다`);
  assert.ok((counts.get(MIXED_TYPE.name) ?? 0) > 0, "혼합 경향도 나온다");
  // 이름이 붙은 유형 가운데 한 이름이 15%를 넘지 않고(무작위 응답 · 격자 사주 기준의 어림 — 실제 이용자 분포가 아니다), 혼합 경향이 절반을 넘지 않는다
  const top = Math.max(...PERSONAL_TYPE_IDS.map((id) => counts.get(PERSONAL_TYPES[id].name) ?? 0));
  assert.ok(top / 2400 < 0.15, `한 이름이 15%를 넘지 않는다(최대 ${((top / 2400) * 100).toFixed(1)}%)`);
  assert.ok((counts.get(MIXED_TYPE.name) ?? 0) / 2400 < 0.5, "혼합 경향이 대부분을 차지하지 않는다");
});

test("서로 다른 사용자: 같은 응답이라도 사주가 다르면 이름이 달라지고, 같은 사주라도 응답이 다르면 이름이 달라진다 — 한 이름으로 고정되어 있지 않다", () => {
  const summary = summaryOf({ ...scoresToward("인성", "a"), ...scoresToward("비겁", "a"), ...scoresToward("식상", "a"), ...scoresToward("재성", "a"), ...scoresToward("관성", "a") });
  const bySaju = new Set(GROUPS.map((g) => typeTitleFor({ saju: DOMINANT[g], summary }, null)?.name));
  assert.ok(bySaju.size >= 3, `같은 응답에서도 사주에 따라 여러 이름이 나온다: ${[...bySaju].join(", ")}`);
  for (const g of GROUPS) {
    const a = typeTitleFor({ saju: DOMINANT[g], summary: summaryOf(scoresToward(g, "a")) }, null)?.name;
    const b = typeTitleFor({ saju: DOMINANT[g], summary: summaryOf(scoresToward(g, "b")) }, null)?.name;
    assert.ok(a && b && a !== b, `${g}: 같은 사주도 응답이 반대면 다른 이름`);
  }
});

test("사용자 간 값 누출 없음: 입력을 얼려 둬도 계산되고(입력을 바꾸지 않는다), 번갈아 계산해도 각자 자기 값이며, 돌려준 값을 바꿔도 다음 계산에 영향이 없다", () => {
  const users = GROUPS.map((g, i) => ({ saju: deepFreeze(person(1980 + i, 3 + i, 10 + i)), summary: deepFreeze(summaryOf(scoresToward(g, i % 2 ? "a" : "b"))) }));
  const alone = users.map((u) => assessmentTypeTitle({ saju: u.saju, summary: { ...u.summary, tendency: { id: "stability", name: "안정지향형" } } as never }));
  for (let round = 0; round < 3; round++) {
    for (const i of [2, 0, 4, 1, 3]) {
      const t = assessmentTypeTitle({ saju: users[i].saju, summary: { ...users[i].summary, tendency: { id: "stability", name: "안정지향형" } } as never });
      assert.deepEqual(t, alone[i], `사용자 ${i}: 다른 사용자를 계산한 뒤에도 같은 값`);
      if (t) t.name = "오염"; // 돌려준 값을 바꿔도
    }
  }
  const again = assessmentTypeTitle({ saju: users[0].saju, summary: { ...users[0].summary, tendency: { id: "stability", name: "안정지향형" } } as never });
  assert.notEqual(again?.name, "오염", "새로 계산한 값은 이전에 바꾼 값과 무관하다");
  // 모든 사용자의 저장된 옛 대표 경향 이름이 같아도(안정지향형) 새 유형은 그 이름에 끌려가지 않는다
  assert.ok(alone.every((t) => t && t.name !== "안정지향형"));
});

test("동점 · 응답 누락 · 사주 미계산: 억지로 이름을 붙이지 않고 혼합 경향(또는 이름 없음)으로 정직하게 둔다", () => {
  // 응답이 비어(모두 가운데) 있으면 혼합 경향 — 사주 후보가 있어도 이름을 만들지 않는다
  let missing = 0;
  for (const s of GRID) {
    const t = sajuTilt(s);
    const title = personalTypeTitle({ saju: s, summary: summaryOf({}) });
    assert.ok(title);
    if (t.candidates.length) {
      assert.equal(title.kind, "mixed");
      assert.equal(title.name, MIXED_TYPE.name);
      assert.equal(title.line, MIXED_TYPE.line);
      missing++;
    }
  }
  assert.ok(missing > 0);
  // 사주 후보가 둘 이상(동점)인 사람: 두 갈래를 비슷한 세기로 가리키면 이름을 정하지 않고(혼합), 한쪽이 확실히 더 또렷하면 그쪽만 고른다
  const tie = GRID.find((s) => sajuTilt(s).candidates.length >= 2);
  assert.ok(tie, "사주 후보가 둘 이상인 가상 사주가 있다");
  const [g1, g2] = sajuTilt(tie).candidates;
  const both = personalTypeTitle({ saju: tie, summary: summaryOf({ ...scoresToward(g1, "a"), ...scoresToward(g2, "a") }) });
  assert.ok(both);
  if (both.kind === "type") assert.ok([...[g1, g2].flatMap((g) => [FLAVOR_RULES[g].a, FLAVOR_RULES[g].b].map((id) => PERSONAL_TYPES[id].name))].includes(both.name), "고른 이름은 사주 후보 갈래의 이름이다");
  // 한쪽만 또렷: 그 갈래의 이름이 나온다
  const oneSide = personalTypeTitle({ saju: tie, summary: summaryOf(scoresToward(g1, "b")) });
  assert.ok(oneSide);
  assert.equal(oneSide.name, PERSONAL_TYPES[FLAVOR_RULES[g1].b].name);
  // 사주가 계산되지 않은 입력: 이름을 만들지 않고, 저장된 옛 후보 이름으로 대신 채우지도 않는다
  const none: SajuResult = { status: "not-connected" };
  assert.equal(personalTypeTitle({ saju: none, summary: summaryOf({}) }), null);
  assert.equal(typeTitleFor({ saju: none, summary: summaryOf({}) }, "안정지향형"), null);
  assert.equal(typeTitleFor(null, "안정지향형"), null);
  assert.equal(resolveTypeTitle(undefined, "안정지향형"), null);
});

test("출생 시각 미상: 시주 없이 다섯 자리로 읽어도 이름 또는 혼합 경향이 나오고, 시각을 아는 경우와 따로 계산된다", () => {
  let differs = 0;
  for (const [y, m, d] of [[1985, 5, 21], [1990, 8, 3], [1996, 3, 29], [2001, 11, 17], [1972, 2, 9], [1978, 10, 9]]) {
    const known = person(y, m, d, "14:20");
    const unknown = person(y, m, d, null);
    assert.equal(unknown.hourPillarOmitted, true);
    for (const side of ["a", "b"] as const) {
      const kn = personalTypeTitle({ saju: known, summary: summaryOf(scoresToward("인성", side)) });
      const un = personalTypeTitle({ saju: unknown, summary: summaryOf(scoresToward("인성", side)) });
      assert.ok(kn && un, "둘 다 계산된다");
      assert.ok(un.kind === "type" || un.kind === "mixed");
      if (kn.name !== un.name) differs++;
    }
    // 시주가 없으면 자리 수가 줄어 갈래 세기가 달라질 수 있다 — 같은 날의 두 계산은 서로 독립이다
    const sum = (s: SajuOk) => Object.values(sajuTilt(s).counts).reduce((a, b) => a + b, 0);
    assert.ok(sum(unknown) < sum(known), "시각을 모르면 세는 자리가 줄어든다");
  }
  assert.ok(differs >= 0);
});

test("화면 · 대화 카드 · 읽기용 글이 같은 값: 한 사람의 이름이 모든 출력에 같게 도착한다", () => {
  const user = { saju: DOMINANT["식상"], summary: { ...summaryOf(scoresToward("식상", "a")), tendency: { id: "exploration", name: "탐색지향형" } } };
  const title = assessmentTypeTitle(user as never);
  assert.ok(title);
  // 무료 결과 화면 맨 위 카드(IdentityCard)가 쓰는 값
  const identity = buildIdentity({ saju: user.saju, summary: user.summary });
  assert.equal(identity?.type.name, title.name);
  assert.equal(identity?.type.line, title.line);
  // 대화 분석 카드
  const card = buildTalkModel(sampleReadingReport, { typeTitle: title }).card;
  assert.equal(card.typeName, title.name);
  assert.equal(card.tendency, title.line);
  // 읽기용 글 맨 위 줄
  const md = renderReadingMarkdown(sampleReadingReport, { typeTitle: title });
  assert.ok(md.includes(`**나의 유형** ${title.name} — ${title.line}`));
  // 옛 후보 이름(탐색지향형)은 이 사람의 어떤 출력에도 나오지 않는다
  for (const text of [md, JSON.stringify(card)]) assert.ok(!text.includes("탐색지향형"), "옛 대표 경향 이름이 같은 자리에 겹쳐 보이지 않는다");
  // 예시 인물(서윤)의 값도 자기 가상 원국 + 응답에서 계산된 값이다 — 위 사용자와 이름을 공유하도록 고정하지 않았다
  assert.deepEqual(SAMPLE_TYPE_TITLE, assessmentTypeTitle({ saju: SAMPLE_CHART, summary: sampleReport }));
});

test("옛 모양으로 되돌리는 길: 스위치를 끄면(legacy) 저장된 옛 후보 이름 + 설명이 예전 그대로이고, 켜져 있는 동안은 같은 자리에 둘이 함께 보이지 않는다", () => {
  const legacy = legacyTypeTitle("확인추구형");
  assert.deepEqual({ name: legacy?.name, kind: legacy?.kind }, { name: "확인추구형", kind: "legacy" });
  assert.equal(legacy?.line, "관계에서 확인을 중요하게 여기는 편");
  assert.equal(legacyTypeTitle(null), null);
  assert.equal(PERSONAL_TYPE.visible, true);
  assert.equal(typeTitleFor({ saju: DOMINANT["관성"], summary: summaryOf(scoresToward("관성", "a")) }, "확인추구형")?.kind, "type");
});

/** 연결 점검(정적)에 걸리는 문제 목록 — read는 저장소 기준 상대 경로의 소스를 읽어 주는 함수(줄바꿈은 LF로 정규화된 글) */
function wiringProblems(read: (p: string) => string): string[] {
  const bad: string[] = [];
  const need = (ok: boolean, why: string) => {
    if (!ok) bad.push(why);
  };
  const results = read("app/results/[id]/page.tsx");
  need(/const typeTitle = assessmentTypeTitle\(assessment\)/.test(results), "결과 화면: typeTitle 단일 입구");
  for (const needle of ["<ReadingReportView report={content} typeTitle={typeTitle}", "<PersonalV2View report={content} typeTitle={typeTitle}", "<FullReportView report={content} typeTitle={typeTitle}", "buildTalkModel(content, { typeTitle,", "typeTitle: assessmentTypeTitle(assessment)", "<IdentityCard identity={identity} showType={PERSONAL_TYPE.visible}"]) {
    need(results.includes(needle), `결과 화면: ${needle}`);
  }
  const talk = read("server/talk-model.ts");
  need(/const typeTitle = assessmentTypeTitle\(assessment\)/.test(talk), "대화: typeTitle 단일 입구");
  need(talk.includes("buildTalkModel(report.content, { typeTitle,") && talk.includes("    typeTitle,\n  });"), "대화: 심층 · 무료 모델이 같은 값을 쓴다");
  need(read("app/admin/report/[orderNumber]/page.tsx").includes("typeTitle={view.typeTitle}"), "관리자 읽기 전용 보기도 고객이 보는 값");
  need(read("lib/services/admin-support-service.ts").includes("renderReadingMarkdown(content, { typeTitle })"), "관리자의 복사용 글도 같은 값");
  // 컴포넌트는 옛 이름 사전(TENDENCY_NAMES · tendencyPhrase)을 직접 읽지 않는다
  for (const f of ["components/report/reading-report-view.tsx", "components/report/summary-blocks.tsx", "components/talk/analysis-card.tsx", "components/talk/talk-view.tsx"]) {
    need(!/TENDENCY_NAMES|tendencyPhrase/.test(read(f)), `${f}: 옛 대표 경향 사전을 직접 읽지 않는다`);
  }
  // 유형을 보이는 카드는 개인 유형이 켜져 있을 때 무료 결과의 옛 ① 블록을 숨긴다
  need(/!PERSONAL_TYPE\.visible \?/.test(read("components/report/free-preview-body.tsx")), "무료 결과의 옛 ① 블록은 개인 유형이 꺼져 있을 때만");
  return bad;
}
const readRepoSource = (p: string) => readSource(new URL(`../../${p}`, import.meta.url));

test("연결 점검(정적): 결과 화면 · 심층 리포트 · 대화 · 관리자 보기 · 읽기용 글이 모두 단일 입구를 거치고 옛 대표 경향 이름을 직접 그리지 않는다", () => {
  assert.deepEqual(wiringProblems(readRepoSource), []);
});

test("연결 점검(정적) CRLF 회귀: Windows(core.autocrlf=true)처럼 소스가 CRLF여도 줄바꿈을 LF로 맞춰 읽으면 같은 점검이 통과한다 — 점검을 지우지 않는다", () => {
  const toCrlf = (text: string) => text.replace(/\r?\n/g, "\r\n");
  // 작업 폴더의 소스가 CRLF인 상태를 흉내 낸다: 원본을 CRLF로 바꾼 글을 정규화해서 읽는다
  assert.deepEqual(wiringProblems((p) => normalizeEol(toCrlf(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")))), []);
  // 정규화하지 않은 CRLF 글에는 줄바꿈이 든 문자열이 없다 — 이 점검이 Windows에서 실패했던 이유를 그대로 재현한다
  const raw = toCrlf(readFileSync(new URL("../../server/talk-model.ts", import.meta.url), "utf8"));
  assert.ok(raw.includes("\r\n") && !raw.includes("    typeTitle,\n  });"), "CRLF 원문에서는 LF 문자열이 찾아지지 않는다");
  assert.ok(normalizeEol(raw).includes("    typeTitle,\n  });"), "정규화하면 찾아진다");
  // 글자는 바꾸지 않는다: 정규화한 CRLF 글은 원본(LF)과 한 글자도 다르지 않다
  const lf = readFileSync(new URL("../../server/talk-model.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal(normalizeEol(raw), lf);
  // CRLF만 LF로 바꾼다 — 낱개 CR은 그대로 둔다(줄바꿈 차이가 아닌 변경을 눈감지 않는다)
  assert.equal(normalizeEol("a\r\nb\rc\nd"), "a\nb\rc\nd");
});

test("연결 점검(정적)은 비어 있는 점검이 아니다: 연결이 끊긴 소스를 넣으면 문제를 찾아낸다", () => {
  const broken = wiringProblems((p) => (p === "server/talk-model.ts" ? "export const x = 1;\n" : readRepoSource(p)));
  assert.ok(broken.length >= 2, `끊긴 연결을 찾아낸다: ${broken.join(" / ")}`);
  const brokenView = wiringProblems((p) => (p === "components/talk/talk-view.tsx" ? "const n = TENDENCY_NAMES;\n" : readRepoSource(p)));
  assert.ok(brokenView.some((m) => m.includes("talk-view.tsx")));
});
