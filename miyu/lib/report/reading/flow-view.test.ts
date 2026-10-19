import assert from "node:assert/strict";
import test from "node:test";
import type { Evidence } from "../evidence.ts";
import { readFileSync } from "node:fs";
import { buildFlowView, completeClauseEnding, FLOW_CLOSING_COPY, FLOW_HIT_PX, FLOW_MIN_BAR_PCT, isHourUnknown, softenMonths, splitClauses, splitSentences } from "./flow-view.ts";
import type { IntegratedReadingReport, LuckSlot } from "./types.ts";

// 6번 장(앞으로의 운과 변화) 표시 계층 시험 — 저장된 글은 그대로이고 칸 · 시간축 · 개운 카드만 입력 값에서 만들어지는지 본다.
// 시험 글은 이 시험이 지어낸 것이다(실제 리포트 글이 아니다). 입력이 달라지면(연도 · 나이 · 후보 기운 · 시각을 아는지) 칸이 따라 달라져야 한다.

const slot = (role: LuckSlot["role"], from: string, to: string, stem: LuckSlot["stemGroup"] = "식상", branch: LuckSlot["branchGroup"] = "인성"): LuckSlot => ({ role, label: "임진(壬辰)", from, to, stemGroup: stem, branchGroup: branch, themes: [] });

const timingEvidence = (id: string, from: string, to: string, a: number, b: number): Evidence => ({
  id,
  source: "saju",
  topics: ["timing"],
  strength: "moderate",
  fact: "시기 근거",
  cue: "시기 해석",
  period: { from, to, label: "시기" },
  ageWindows: [{ from: a, to: b }],
});

const fortifyEvidence = (fact: string): Evidence => ({ id: "saju.fortify", source: "saju", topics: ["personality"], strength: "weak", fact, cue: "개운 해석" });

const TIE_FACT = "오행 개수(세 기둥 글자 기준): 목 0 · 화 2 · 토 2 · 금 0 · 수 3 / 보완 후보 동점(개수가 같아 우선순위를 가릴 수 없는 같은 후보): 금(세 기둥에 없음 — 시주에 있을 수 있음) · 목(세 기둥에 없음 — 시주에 있을 수 있음) / 보완 후보는 세 기둥 개수만으로 정한 단순화";
const ONE_FACT = "오행 개수(원국 글자 기준): 목 2 · 화 2 · 토 2 · 금 2 · 수 0 / 보완 후보 1순위: 수(원국에 없음) / 보완 후보는 원국 개수와 태어난 계절만으로 정한 단순화";

type Opts = {
  hourUnknown?: boolean;
  paragraphs?: string[];
  years?: { year: string; theme: string }[];
  evidence?: Evidence[];
  timeline?: LuckSlot[];
  reference?: { year: number; month: number };
  actions?: { title: string; detail: string }[];
};

const PAST = "지나온 시기를 돌아보면 만 7~16세 무렵에는 또래와 견주는 주제가 두드러졌을 수 있어요. 만 16세 무렵에는 관계가 달라지는 주제가 있었을 가능성이 있고, 만 16~26세 무렵에는 배우며 준비하는 시기였을 수 있어요. 도움을 받다 결정이 늦어진 느낌이 들 수도 있었어요. 만 20~21세 무렵에는 일의 환경이 바뀌는 주제가 겹쳤을 수 있어요. 지금의 모습은 현재의 것이고, 그때의 마음으로 이어서 말할 수는 없어요.";
const NOW = "지금은 2022년 무렵부터 2032년 무렵까지 이어지는 시기로, 배운 것을 밖으로 꺼내 보는 때예요. 익숙한 방식이 흔들리는 지점도 있어요. 2026년은 일의 결과를 챙기는 해라 정리할 일이 늘 수 있어요. 2027년은 맡은 일을 책임지는 해로 볼 수 있어요. 2028년은 역할을 맡으며 배우는 해예요.";
const NEXT = "그다음 2032년 무렵부터는 역할과 평가가 또렷해지는 시기가 와요. 만 36~46세 무렵에는 관계 주제가 두드러질 수 있어요. 서로 조율할 부분이 생길 수 있어서 마음은 말로 꺼내는 편이 좋아요.";
const FORT_A = "개운은 전통 해석을 가볍게 곁들이는 정도예요. 금은 서쪽 방향, 흰색·은색·회색, 숫자 4와 9, 탁 트이고 정돈된 곳이 어울려요.";
const FORT_B = "목은 동쪽 방향, 초록·청록·연두, 숫자 3과 8, 숲길이나 공원, 나무가 보이는 창가가 어울려요.";

function report(o: Opts = {}): IntegratedReadingReport {
  const paragraphs = o.paragraphs ?? [PAST, NOW, NEXT, FORT_A, FORT_B];
  const evidence = o.evidence ?? [
    timingEvidence("saju.frame.L6.a", "2012-12", "2022-11", 16, 26),
    timingEvidence("saju.frame.W8.b", "2022-12", "2032-11", 26, 36),
    timingEvidence("saju.frame.L6.c", "2032-12", "2042-11", 36, 46),
    fortifyEvidence(TIE_FACT),
  ];
  const hourUnknown = o.hourUnknown ?? true;
  return {
    kind: "integrated-reading",
    layout: "story7",
    flow: {
      id: "flow",
      topic: "앞으로의 운과 변화",
      headline: "배운 것을 꺼내는 10년",
      summary: paragraphs[0],
      paragraphs: paragraphs.slice(1),
      caveat: "",
      cardText: "",
      years: o.years ?? [
        { year: "2026", theme: "일의 결과와 살림을 챙기는 해" },
        { year: "2027", theme: "맡은 일의 결과를 책임지는 해" },
        { year: "2028", theme: "역할을 맡으며 배워 가는 해" },
      ],
      periods: [],
      scenarios: [],
      scenarioNote: "",
      statistics: "",
      basis: { computed: [], tradition: [], answers: [], unknown: [] },
      evidence: [],
    },
    actions: o.actions ?? [
      { title: "고마웠던 사람에게 먼저 안부 묻기", detail: "작은 안부부터요." },
      { title: "맡은 일의 범위를 한 번 적어 두기", detail: "기준을 눈에 보이게요." },
    ],
    timeline: o.timeline ?? [slot("previous", "2012-12", "2022-11", "인성", "비겁"), slot("current", "2022-12", "2032-11"), slot("next", "2032-12", "2042-11", "관성", "재성")],
    timelineReference: o.reference ?? { year: 2026, month: 10 },
    saju: { status: "computed", pillars: [{ position: "시주", stem: "", branch: "", unknown: hourUnknown }], dayMaster: "", elements: [] },
    generated: { promptVersion: "x", ruleVersions: [], referenceDate: "2026-10-19", lines: [], evidence: hourUnknown ? [...evidence, { id: "saju.hour.unknown", source: "saju", topics: [], strength: "weak", fact: "시각 미상", cue: "" }] : evidence },
  } as unknown as IntegratedReadingReport;
}

const view = (o: Opts = {}) => {
  const v = buildFlowView(report(o));
  assert.ok(v, "칸을 나눌 수 있는 글이다");
  return v!;
};

test("글을 시기별 칸으로 나눈다 — 지나온 시기는 원문 구간을 겹침 그대로 한 칸씩, 지금 · 가까운 세 해 · 다음 큰 시기는 계산된 시기에 맞춘다", () => {
  const v = view();
  const keys = v.items.map((i) => i.key);
  assert.deepEqual(keys, ["age-7-16", "age-16-16", "age-16-26", "age-20-21", "now", "year-2026", "year-2027", "year-2028", "next"]);
  assert.deepEqual(
    v.items.map((i) => i.title).slice(0, 4),
    ["만 7~16세 무렵", "만 16세 무렵", "만 16~26세 무렵", "만 20~21세 무렵"],
    "구간의 이름이 글에 적힌 나이 그대로다",
  );
  const byKey = Object.fromEntries(v.items.map((i) => [i.key, i]));
  assert.match(byKey["age-7-16"].text, /또래와 견주는 주제/);
  assert.match(byKey["age-16-16"].text, /관계가 달라지는 주제/);
  assert.match(byKey["age-16-26"].text, /배우며 준비하는 시기/);
  assert.match(byKey["age-16-26"].text, /결정이 늦어진 느낌/, "표지 없는 이어지는 문장은 앞 칸에 붙는다");
  assert.match(byKey["age-20-21"].text, /일의 환경이 바뀌는 주제/);
  assert.match(byKey.now.text, /꺼내 보는 때예요/);
  assert.match(byKey.now.text, /흔들리는 지점/);
  assert.match(byKey["year-2026"].text, /정리할 일이 늘 수 있어요/);
  assert.match(byKey["year-2028"].text, /배우는 해예요/);
  assert.match(byKey.next.text, /역할과 평가가 또렷해지는 시기/);
  assert.match(byKey.next.text, /관계 주제가 두드러질 수 있어요/, "다음 큰 시기의 나이 구간 문장은 다음 칸으로");
  assert.match(byKey.next.text, /조율할 부분/);
  // 지나온 시기 묶음 끝의 "그때의 마음으로…"는 한 칸이 아니라 묶음 전체에 걸린다
  assert.equal(v.notes.past.length, 1);
  assert.match(v.notes.past[0], /그때의 마음/);
  assert.ok(!byKey["age-20-21"].text.includes("그때의 마음"));
});

test("글자는 바꾸지 않는다 — 칸 · 묶음 말 · 앞머리에 나눈 문장을 이으면 개운 문단을 뺀 원문과 (쉼표만 빼고, 쉼표에서 나뉜 앞쪽 절의 이어 주는 어미만 끝맺음으로 바꾼 것을 빼고) 같다", () => {
  const v = view();
  // 쉼표에서 나뉜 앞쪽 절 "…가능성이 있고,"는 표시에서만 "…가능성이 있어요."로 끝맺는다 — 그 한 곳 말고는 모두 같아야 한다
  const original = [PAST, NOW, NEXT].join(" ").replace("가능성이 있고, 만 16~26세", "가능성이 있어요. 만 16~26세");
  const parts = [...v.lead, ...v.items.filter((i) => i.kind === "past").map((i) => i.text), ...v.notes.past, ...v.items.filter((i) => i.kind === "now" || i.kind === "year").map((i) => i.text), ...v.notes.now, ...v.items.filter((i) => i.kind === "next").map((i) => i.text), ...v.notes.next].join(" ");
  const norm = (s: string) => s.replace(/[,\s]/g, "");
  assert.equal(norm(parts), norm(original));
});

test("출생 시각을 모르면 연도 무렵으로만 보이고 달 · 지난 개월 수가 없다 / 알면 연-월을 쓴다", () => {
  const unknown = view({ hourUnknown: true });
  const text = JSON.stringify(unknown);
  assert.ok(!/\d{4}[.-]\d{2}/.test(text), "연-월 표기가 없다");
  assert.ok(!/개월/.test(text), "지난 개월 수가 없다");
  const now = unknown.items.find((i) => i.key === "now")!;
  assert.equal(now.caption, "2022년 무렵 ~ 2032년 무렵 · 만 26~36세 무렵");
  assert.equal(unknown.hourUnknown, true);
  const known = view({ hourUnknown: false });
  assert.equal(known.items.find((i) => i.key === "now")!.caption, "2022.12 ~ 2032.11 · 만 26~36세 무렵");
  assert.equal(known.hourUnknown, false);
});

test("isHourUnknown · softenMonths — 시주가 모름이거나 시각 미상 근거가 있을 때만, 연-월은 연도 무렵으로", () => {
  assert.equal(isHourUnknown(report({ hourUnknown: true })), true);
  assert.equal(isHourUnknown(report({ hourUnknown: false })), false);
  assert.equal(softenMonths("2022.12–2032.11 · 사주에서 보는 10년 시기"), "2022년 무렵–2032년 무렵 · 사주에서 보는 10년 시기");
  assert.equal(softenMonths("2026년 10월 기준"), "2026년 10월 기준", "날짜가 아닌 글은 건드리지 않는다");
  assert.equal(softenMonths("만 7~16세 무렵"), "만 7~16세 무렵");
});

test("시간축 — 모든 칸이 막대로 놓이고, 같은 줄에서 겹치지 않으며, 지금 위치와 눈금이 범위 안에 있다", () => {
  const v = view();
  const axis = v.axis!;
  assert.ok(axis, "축이 있다");
  assert.equal(axis.bars.length, v.items.length, "칸마다 막대가 하나다");
  for (const b of axis.bars) {
    assert.ok(b.left >= 0 && b.left + b.width <= 100.0001, `${b.key} 막대가 축 안에 있다`);
    assert.ok(b.width >= FLOW_MIN_BAR_PCT - 1e-9, "손가락으로 누를 수 있는 최소 너비");
  }
  for (const lane of new Set(axis.bars.map((b) => b.lane))) {
    const row = axis.bars.filter((b) => b.lane === lane).sort((a, b) => a.left - b.left);
    for (let i = 1; i < row.length; i += 1) assert.ok(row[i - 1].left + row[i - 1].width <= row[i].left + 1e-9, `같은 줄 ${lane}에서 ${row[i - 1].key}와 ${row[i].key}가 겹치지 않는다`);
  }
  assert.ok(axis.nowLeft > 0 && axis.nowLeft < 100);
  assert.ok(axis.ticks.length >= 3 && axis.ticks.every((t) => t.left >= 0 && t.left <= 100));
  // 겹치는 지나온 구간(7~16 · 16 · 16~26 · 20~21)이 서로 다른 줄에 놓인다 — 겹침을 보존한다
  const overlapping = ["age-16-16", "age-16-26"].map((k) => axis.bars.find((b) => b.key === k)!.lane);
  assert.notEqual(overlapping[0], overlapping[1]);
  // 막대는 시간 순서로 정렬되어 있다(키보드 이동 순서)
  const kinds = v.items.map((i) => i.kind);
  assert.deepEqual(kinds, ["past", "past", "past", "past", "now", "year", "year", "year", "next"]);
});

test("높낮이로 좋고 나쁨 · 점수를 만들지 않는다 — 막대에는 이름 · 위치 · 너비 · 줄 번호뿐", () => {
  const v = view();
  for (const b of v.axis!.bars) assert.deepEqual(Object.keys(b).sort(), ["key", "kind", "label", "lane", "left", "short", "width"]);
});

test("입력이 달라지면 칸도 달라진다 — 다른 나이 · 연도 · 해", () => {
  const evidence = [timingEvidence("saju.frame.L6.x", "2007-03", "2017-02", 22, 32), timingEvidence("saju.frame.W8.y", "2017-03", "2027-02", 32, 42), timingEvidence("saju.frame.L6.z", "2027-03", "2037-02", 42, 52), fortifyEvidence(ONE_FACT)];
  const paragraphs = [
    "지나온 시기를 돌아보면 만 12~22세 무렵에는 배움이 중심이었을 수 있어요. 만 22~32세 무렵에는 일의 환경을 찾는 주제가 있었을 가능성이 있어요.",
    "지금은 2017년 무렵부터 2027년 무렵까지 이어지는 시기예요. 2026년은 정리하는 해예요.",
    "그다음 2027년 무렵부터는 책임이 커지는 시기가 와요. 만 42~52세 무렵에는 사람 주제가 두드러질 수 있어요.",
    "수는 북쪽 방향, 검정·남색·짙은 파랑, 숫자 1과 6, 물가가 가까운 곳이 어울려요.",
  ];
  const v = view({
    hourUnknown: false,
    paragraphs,
    evidence,
    years: [{ year: "2026", theme: "정리하는 해" }],
    timeline: [slot("previous", "2007-03", "2017-02"), slot("current", "2017-03", "2027-02"), slot("next", "2027-03", "2037-02")],
    reference: { year: 2026, month: 5 },
  });
  assert.deepEqual(v.items.map((i) => i.key), ["age-12-22", "age-22-32", "now", "year-2026", "next"]);
  assert.equal(v.items.find((i) => i.key === "now")!.caption, "2017.03 ~ 2027.02 · 만 32~42세 무렵");
  assert.match(v.items.find((i) => i.key === "next")!.text, /사람 주제가 두드러질 수 있어요/);
  assert.ok(v.axis!.bars.every((b) => b.width > 0));
});

test("개운 카드 — 동점 후보(금 · 목)는 운영자가 정한 문구 그대로, 같은 무게로", () => {
  const v = view();
  const f = v.fortify!;
  assert.ok(f);
  assert.equal(f.lead, "금과 목이 부족한 사주라 일상생활에서 채워주면 균형이 좋아질 수 있어요");
  assert.equal(f.tied, true);
  assert.equal(f.cards.length, 2);
  const [gold, wood] = f.cards;
  assert.equal(gold.title, "금을 채울 수 있는 정보들");
  assert.equal(gold.place, "서쪽, 탁 트이고 정돈된 곳");
  assert.deepEqual(gold.colors.map((c) => c.name), ["회색", "은색", "흰색"]);
  assert.equal(gold.numbers, "4, 9");
  assert.equal(gold.tip, "휴대폰 화면이나 소품을 흰색 계열로 바꾸거나 서쪽으로 산책하거나 즐겨 쓰는 번호에 4나 9를 넣어 보세요.");
  assert.equal(wood.title, "목을 채울 수 있는 정보들");
  assert.equal(wood.place, "동쪽, 초록색 나무가 보이는 창가");
  assert.deepEqual(wood.colors.map((c) => c.name), ["초록", "청록", "연두"]);
  assert.equal(wood.numbers, "3, 8");
  assert.equal(wood.tip, "둘 중 하나를 앞세우지 않고 같은 무게의 후보로 두고, 이미 가진 물건으로 가볍게 해보는걸 추천해요");
  assert.ok(gold.colors.every((c) => /^#[0-9a-f]{6}$/.test(c.css)), "색상칩은 실제 색을 가진다");
  // 반복 안내는 카드 본문에 없다
  const cardText = JSON.stringify(f);
  assert.ok(!cardText.includes("출생 시각을 몰라"));
  assert.ok(!cardText.includes("어디까지나 전통의 상징"));
  // 개운 문단은 시기 칸 글에 섞이지 않는다
  assert.ok(!JSON.stringify(v.items).includes("서쪽 방향"));
  assert.ok(!JSON.stringify(v.items).includes("동쪽 방향"));
  assert.deepEqual(v.rest, []);
});

test("개운 카드 — 금 · 목을 고정하지 않는다: 한 가지 부족이면 그 기운 하나만, 다른 기운이면 다른 정보", () => {
  const evidence = [timingEvidence("saju.frame.L6.a", "2012-12", "2022-11", 16, 26), timingEvidence("saju.frame.W8.b", "2022-12", "2032-11", 26, 36), fortifyEvidence(ONE_FACT)];
  const v = view({ hourUnknown: false, evidence, paragraphs: [PAST, NOW, NEXT, "수는 북쪽 방향, 검정·남색·짙은 파랑, 숫자 1과 6, 물가가 가까운 곳이 어울려요."] });
  const f = v.fortify!;
  assert.equal(f.tied, false);
  assert.equal(f.cards.length, 1);
  assert.equal(f.lead, "수가 부족한 사주라 일상생활에서 채워주면 균형이 좋아질 수 있어요");
  assert.equal(f.cards[0].title, "수를 채울 수 있는 정보들");
  assert.match(f.cards[0].place, /^북쪽,/);
  assert.equal(f.cards[0].numbers, "1, 6");
  assert.match(f.cards[0].tip, /남색 계열로 바꾸거나 북쪽으로 산책하거나 즐겨 쓰는 번호에 1이나 6을 넣어 보세요\.$/, "받침에 맞게 이나/나 · 을/를이 바뀐다");
  assert.ok(!JSON.stringify(f).includes("금") && !JSON.stringify(f).includes("서쪽"));
  assert.ok(!f.cards[0].tip.includes("앞세우지"), "동점이 아니면 같은 무게 안내가 없다");
});

test("개운 근거가 없으면 카드를 만들지 않고 글을 잃지 않는다", () => {
  const evidence = [timingEvidence("saju.frame.L6.a", "2012-12", "2022-11", 16, 26), timingEvidence("saju.frame.W8.b", "2022-12", "2032-11", 26, 36)];
  const v = view({ evidence, hourUnknown: false });
  assert.equal(v.fortify, null);
  const all = JSON.stringify(v);
  assert.ok(all.includes("서쪽 방향"), "개운 문단 글이 칸 안에 그대로 남아 있다");
  assert.ok(all.includes("동쪽 방향"));
});

test("나눌 표지가 없는 글 · 대운 목록이 없는 글은 null — 호출하는 쪽이 예전 모양으로 보인다", () => {
  assert.equal(buildFlowView(report({ paragraphs: ["이 글에는 시기 표지가 없어요.", "그냥 이어지는 이야기예요."], timeline: [], years: [], evidence: [] })), null);
});

test("시기 근거가 없어도(옛 저장본) 글의 나이 · 코드의 대운 목록으로 칸을 나눈다 — 막대가 놓이지 않는 칸은 카드로만", () => {
  const v = view({ evidence: [], hourUnknown: true, paragraphs: [PAST, NOW, NEXT] });
  assert.deepEqual(v.items.map((i) => i.key), ["age-7-16", "age-16-16", "age-16-26", "age-20-21", "now", "year-2026", "year-2027", "year-2028", "next"]);
  const withoutSpan = v.axis!.bars.map((b) => b.key);
  assert.ok(!withoutSpan.includes("age-7-16"), "나이만 있고 연도를 알 수 없는 지나온 구간은 막대 없이 카드만");
  assert.ok(withoutSpan.includes("now") && withoutSpan.includes("next"));
  assert.ok(v.items.find((i) => i.key === "age-7-16")!.text.length > 0);
});

test("문장 · 쉼표 나누기", () => {
  assert.deepEqual(splitSentences("첫째예요. 둘째예요! 셋째예요?"), ["첫째예요.", "둘째예요!", "셋째예요?"]);
  assert.deepEqual(splitClauses("만 16세 무렵에는 관계가 달라지고, 만 16~26세 무렵에는 배워요."), ["만 16세 무렵에는 관계가 달라지고", "만 16~26세 무렵에는 배워요."]);
  assert.deepEqual(splitClauses("책임과 평가가 커지고, 주변이 달라져요."), ["책임과 평가가 커지고, 주변이 달라져요."], "시기 표지가 아닌 쉼표에서는 나누지 않는다");
});

test("막대의 눌리는 영역: 보이는 막대(30px)와 별개로 가로 · 세로 44px 이상 — 줄 간격이 곧 눌리는 높이이고 최소 너비는 가장 좁은 화면에서도 44px 이상", () => {
  assert.equal(FLOW_HIT_PX, 44);
  // 가장 좁은 화면(폭 320px − 쪽 여백 40px − 카드 안쪽 여백 24px = 막대 영역 256px)에서도 막대 최소 너비가 44px 이상이다
  assert.ok((256 * FLOW_MIN_BAR_PCT) / 100 >= 44, `최소 너비 ${FLOW_MIN_BAR_PCT}%는 256px 영역에서 ${(256 * FLOW_MIN_BAR_PCT) / 100}px`);
  const src = readFileSync(new URL("../../../components/report/flow-timeline.tsx", import.meta.url), "utf8");
  assert.match(src, /const LANE = FLOW_HIT_PX;/, "줄 높이 = 눌리는 높이");
  assert.match(src, /before:h-11/, "버튼의 눌리는 영역(의사요소)이 높이 44px");
  assert.match(src, /before:w-\[max\(calc\(100%\+4px\),44px\)\]/, "눌리는 영역의 너비는 막대(테두리 1~2px까지 포함해 덮도록 안쪽 너비 + 4px)와 44px 중 큰 쪽");
  const barButton = src.slice(src.indexOf("<button"), src.indexOf("</button>"));
  assert.ok(!/overflow-hidden/.test(barButton.split("<span")[0]), "버튼 자체에 overflow-hidden이 없다(있으면 바깥으로 넓힌 눌리는 영역이 잘린다) — 글자 말줄임은 안쪽 span이 한다");
});

// ───── 나이 칸의 연도: 나이 하한에 맞춰 나이만 잘린 근거의 넓은 기간을 그 나이 칸의 기간으로 옮기지 않는다 ─────
// 프레임은 나이의 하한(연애 만 16세 이후 등)에 맞춰 ageWindows만 좁게 자르고 period는 대운 전체를 그대로 담는다 — 만 16세 단일 칸이 10년으로 보이던 문제의 회귀 시험.

const CLIPPED_PAST = "지나온 시기를 돌아보면 만 7~16세 무렵에는 또래와 견주는 주제가 두드러졌을 수 있어요. 만 16세 무렵에는 관계가 달라지는 주제가 있었을 가능성이 있고, 만 16~26세 무렵에는 배우며 준비하는 시기였을 수 있어요.";
const clippedEvidence = (): Evidence[] => [
  timingEvidence("saju.frame.L6.clip", "2002-12", "2012-11", 16, 16), // 대운 전체(2002.12~2012.11)가 period인데 나이 범위는 하한 16세로 잘려 {16,16}
  timingEvidence("saju.frame.R3.whole", "2012-12", "2022-11", 16, 26),
  timingEvidence("saju.frame.W8.cur", "2022-12", "2032-11", 26, 36),
  timingEvidence("saju.frame.L6.nxt", "2032-12", "2042-11", 36, 46),
  fortifyEvidence(TIE_FACT),
];

test("만 16세 단일 칸은 근거의 넓은 기간(10년)이 아니라 그 나이 한 해로 놓이고, 7~16세 칸보다 뒤에 나온다", () => {
  const v = view({ evidence: clippedEvidence(), paragraphs: [CLIPPED_PAST, NOW, NEXT, FORT_A, FORT_B] });
  const keys = v.items.filter((i) => i.kind === "past").map((i) => i.key);
  assert.deepEqual(keys, ["age-7-16", "age-16-16", "age-16-26"], "나이순: 7~16 → 16 → 16~26");
  const by = Object.fromEntries(v.items.map((i) => [i.key, i]));
  assert.equal(by["age-16-16"].caption, "2012년 무렵", "16세는 그 나이의 한 해(무렵) — 2002~2012가 아니다");
  assert.equal(by["age-7-16"].caption, "2003년 무렵 ~ 2012년 무렵");
  assert.equal(by["age-16-26"].caption, "2012년 무렵 ~ 2022년 무렵");
  assert.ok(!JSON.stringify(v).includes("2002"), "잘린 근거의 기간 시작(2002)이 어느 칸에도 붙지 않는다");
  // 시간축: 16세 막대는 7~16세 막대의 끝 이후에 놓인다(한 해 폭 + 최소 눌림 폭)
  const bar = (k: string) => v.axis!.bars.find((b) => b.key === k)!;
  assert.ok(bar("age-7-16").left < bar("age-16-16").left, "7~16세 막대가 16세 막대보다 앞");
  assert.ok(bar("age-16-16").left >= bar("age-7-16").left + 0.1);
});

test("글의 순서가 뒤바뀌어도 지나온 칸은 나이 구간 순서(시작 → 끝)로 정렬된다", () => {
  const swapped = "만 16~26세 무렵에는 배우며 준비하는 시기였을 수 있어요. 만 16세 무렵에는 관계가 달라지는 주제가 있었을 가능성이 있어요. 만 7~16세 무렵에는 또래와 견주는 주제가 두드러졌을 수 있어요.";
  const v = view({ evidence: clippedEvidence(), paragraphs: [swapped, NOW, NEXT, FORT_A, FORT_B] });
  assert.deepEqual(v.items.filter((i) => i.kind === "past").map((i) => i.key), ["age-7-16", "age-16-16", "age-16-26"]);
});

test("연도를 안전하게 정할 수 없으면 나이 칸에 연도를 붙이지 않고 나이별 칸으로만 둔다(막대 없음)", () => {
  const cases: { name: string; evidence: Evidence[] }[] = [
    { name: "기간과 나이가 맞는 근거가 하나도 없음(잘린 근거뿐)", evidence: [timingEvidence("saju.frame.L6.clip", "2002-12", "2012-11", 16, 16), fortifyEvidence(TIE_FACT)] },
    { name: "맞는 근거끼리 한 해보다 더 어긋남", evidence: [timingEvidence("a", "2012-12", "2022-11", 16, 26), timingEvidence("b", "2022-12", "2032-11", 24, 34), fortifyEvidence(TIE_FACT)] },
    { name: "잘린 근거의 나이가 그 근거의 기간 밖으로 나옴(출생 연도 어림이 앞뒤가 맞지 않음)", evidence: [timingEvidence("a", "2012-12", "2022-11", 16, 26), timingEvidence("b", "2022-12", "2032-11", 26, 36), timingEvidence("clip", "2002-12", "2012-11", 24, 24), fortifyEvidence(TIE_FACT)] },
  ];
  for (const c of cases) {
    const v = view({ evidence: c.evidence, paragraphs: [CLIPPED_PAST, NOW, NEXT, FORT_A, FORT_B] });
    const past = v.items.filter((i) => i.kind === "past");
    assert.deepEqual(past.map((i) => i.key), ["age-7-16", "age-16-16", "age-16-26"], `${c.name}: 나이 칸은 그대로`);
    for (const i of past) assert.ok(!/\d{4}년/.test(i.caption), `${c.name}: ${i.title}에 연도가 없다 (${i.caption})`);
    assert.ok(!v.axis!.bars.some((b) => b.kind === "past"), `${c.name}: 지나온 칸의 막대가 없다`);
    // 지금 · 가까운 해 · 다음 큰 시기는 코드가 계산한 값이라 그대로 놓인다
    assert.ok(v.axis!.bars.some((b) => b.key === "now") && v.axis!.bars.some((b) => b.key === "next"), `${c.name}: 지금 · 다음 막대는 있다`);
  }
});

test("같은 부제(시기 이름)가 다른 시기 칸에 복사되지 않는다 — 인접한 대운의 천간 · 지지 그룹이 같으면 지금 칸에만 남긴다", () => {
  const same = view({
    evidence: clippedEvidence(),
    paragraphs: [CLIPPED_PAST, NOW, NEXT, FORT_A, FORT_B],
    timeline: [slot("previous", "2012-12", "2022-11", "인성", "식상"), slot("current", "2022-12", "2032-11", "인성", "식상"), slot("next", "2032-12", "2042-11", "인성", "식상")],
  });
  const themeOf = (v: ReturnType<typeof view>, key: string) => v.items.find((i) => i.key === key)?.theme;
  assert.ok(themeOf(same, "now"), "지금 칸은 부제를 가진다");
  assert.equal(themeOf(same, "age-16-26"), undefined, "이전 대운과 지금 대운의 이름이 같으면 이전 칸의 부제를 빼 복사된 것처럼 보이지 않게 한다");
  assert.equal(themeOf(same, "next"), undefined);
  assert.equal(same.items.find((i) => i.key === "next")?.plain, undefined, "같은 이름이면 쉬운 말 설명도 되풀이하지 않는다");
  assert.match(same.items.find((i) => i.key === "age-16-26")!.text, /배우며 준비하는 시기/, "글의 문장은 그대로");
  // 그룹이 다르면 각자 자기 시기의 이름을 가진다(이전 대운과 나이 · 연도가 맞는 칸에만)
  const diff = view({
    evidence: clippedEvidence(),
    paragraphs: [CLIPPED_PAST, NOW, NEXT, FORT_A, FORT_B],
    timeline: [slot("previous", "2012-12", "2022-11", "관성", "재성"), slot("current", "2022-12", "2032-11", "식상", "인성"), slot("next", "2032-12", "2042-11", "비겁", "비겁")],
  });
  const names = ["age-16-26", "now", "next"].map((k) => themeOf(diff, k));
  assert.ok(names.every(Boolean) && new Set(names).size === 3, `세 칸이 서로 다른 이름: ${names.join(" / ")}`);
  assert.equal(themeOf(diff, "age-7-16"), undefined, "이전 대운과 맞지 않는 나이 칸(7~16)에는 부제가 없다");
  assert.equal(themeOf(diff, "age-16-16"), undefined);
});

// ───── 6번 장 회귀(운영자 6차 확인): 명시된 단일 연도 보존 · 쉼표에서 나뉜 절의 끝맺음 ─────

// 세운 하나(2017년 한 해)를 통째로 가리키는 근거 — 나이 범위 만 20~21세(해의 앞뒤가 두 나이에 걸친다)
const W8_2017 = (): Evidence => timingEvidence("saju.frame.W8.2017", "2017-01", "2018-01", 20, 21);
const evidenceWith2017 = (): Evidence[] => [...clippedEvidence().slice(0, 4), W8_2017(), fortifyEvidence(TIE_FACT)];

test("만 20~21세 칸의 연도는 근거에 명시된 2017년을 그대로 쓴다 — 출생 연도 차이(1996)로 어림한 2016년이 덮어쓰지 않는다", () => {
  const v = view({ evidence: evidenceWith2017(), paragraphs: [PAST, NOW, NEXT, FORT_A, FORT_B] });
  const by = Object.fromEntries(v.items.map((i) => [i.key, i]));
  assert.equal(by["age-20-21"].caption, "2017년 무렵", "근거 saju.frame.W8.2017이 명시한 해");
  assert.ok(!JSON.stringify(by["age-20-21"]).includes("2016"), "2016년 무렵이 붙지 않는다");
  // 같은 입력에서 16세(넓은 기간을 가진 잘린 근거)는 그 나이 한 해(2012), 근거에 없는 연도는 만들지 않는다
  assert.equal(by["age-16-16"].caption, "2012년 무렵");
  assert.ok(!JSON.stringify(v).includes("2002"));
  assert.equal(by["age-7-16"].caption, "2003년 무렵 ~ 2012년 무렵");
  // 시간축: 2017년 한 해 막대가 2012년 무렵 막대와 2022년 무렵 사이에 놓인다
  const bar = (k: string) => v.axis!.bars.find((b) => b.key === k)!;
  assert.ok(bar("age-16-16").left < bar("age-20-21").left && bar("age-20-21").left < bar("now").left);
});

test("근거에 명시된 해가 없으면 만 20~21세는 출생 연도 차이로 어림한 해를 쓴다(2016년 무렵) — 명시된 해가 있을 때와 달라진다", () => {
  const v = view({ evidence: clippedEvidence(), paragraphs: [PAST, NOW, NEXT, FORT_A, FORT_B] });
  assert.equal(v.items.find((i) => i.key === "age-20-21")!.caption, "2016년 무렵");
});

test("같은 문장에 적힌 단일 연도는 나이 범위 안에 있을 때만 쓰고, 범위와 어긋나면 어림한 해로 둔다", () => {
  const inside = "지나온 시기를 돌아보면 만 20~21세 무렵(2017년)에는 일의 환경이 바뀌는 주제가 겹쳤을 수 있어요.";
  const outside = "지나온 시기를 돌아보면 만 20~21세 무렵(2002년)에는 일의 환경이 바뀌는 주제가 겹쳤을 수 있어요.";
  const a = view({ evidence: clippedEvidence(), paragraphs: [inside, NOW, NEXT, FORT_A, FORT_B] });
  assert.equal(a.items.find((i) => i.key === "age-20-21")!.caption, "2017년 무렵", "나이 범위(2016~2017) 안의 명시 연도는 유지");
  const b = view({ evidence: clippedEvidence(), paragraphs: [outside, NOW, NEXT, FORT_A, FORT_B] });
  assert.equal(b.items.find((i) => i.key === "age-20-21")!.caption, "2016년 무렵", "나이와 어긋난 연도(2002)는 쓰지 않는다");
  assert.ok(!JSON.stringify(b.axis).includes("2002"));
});

test("근거끼리 어긋나 출생 연도 차이를 안전하게 정할 수 없으면 명시된 해가 있어도 연도를 붙이지 않는다(연도 보류)", () => {
  const conflict: Evidence[] = [timingEvidence("a", "2012-12", "2022-11", 16, 26), timingEvidence("b", "2022-12", "2032-11", 26, 36), timingEvidence("c", "2005-01", "2006-01", 20, 21), fortifyEvidence(TIE_FACT)];
  const v = view({ evidence: conflict, paragraphs: [PAST, NOW, NEXT, FORT_A, FORT_B] });
  for (const i of v.items.filter((x) => x.kind === "past")) assert.ok(!/\d{4}년/.test(i.caption), `${i.title}: ${i.caption}`);
});

test("쉼표에서 나뉜 앞쪽 절은 이어 주는 어미 대신 같은 뜻의 끝맺음으로 보인다 — 16세 칸은 '…가능성이 있어요.'로 끝난다", () => {
  const v = view({ evidence: evidenceWith2017(), paragraphs: [PAST, NOW, NEXT, FORT_A, FORT_B] });
  const t16 = v.items.find((i) => i.key === "age-16-16")!.text;
  assert.equal(t16, "만 16세 무렵에는 관계가 달라지는 주제가 있었을 가능성이 있어요.");
  assert.ok(!/있고[.,]?$/.test(t16));
  // 쉼표로 나뉘지 않은 마지막 절 · 다른 칸의 글은 원문 그대로
  assert.equal(v.items.find((i) => i.key === "age-16-26")!.text.startsWith("만 16~26세 무렵에는 배우며 준비하는 시기였을 수 있어요."), true);
  assert.match(v.items.find((i) => i.key === "age-7-16")!.text, /두드러졌을 수 있어요\.$/);
});

test("끝맺음 보정은 정해진 여섯 어미에만 적용하고 이미 끝맺은 절 · 다른 어미는 그대로 둔다(새 내용을 더하지 않는다)", () => {
  assert.equal(completeClauseEnding("관계가 달라지는 주제가 있었을 가능성이 있고"), "관계가 달라지는 주제가 있었을 가능성이 있어요.");
  assert.equal(completeClauseEnding("기회가 없고"), "기회가 없어요.");
  assert.equal(completeClauseEnding("조금 힘든 때였고"), "조금 힘든 때였어요.");
  assert.equal(completeClauseEnding("일을 많이 했고"), "일을 많이 했어요.");
  assert.equal(completeClauseEnding("일이 바뀌었고"), "일이 바뀌었고", "표에 없는 어미(-었고)는 건드리지 않는다");
  assert.equal(completeClauseEnding("새 환경이 됐고"), "새 환경이 됐어요.");
  assert.equal(completeClauseEnding("이미 끝난 문장이에요."), "이미 끝난 문장이에요.");
  assert.equal(completeClauseEnding("배우며 준비하는 시기였지만"), "배우며 준비하는 시기였지만", "표에 없는 이어 주는 말은 건드리지 않는다");
  assert.equal(completeClauseEnding("함께 공부하고"), "함께 공부하고");
});

// ───── 인생 그래프의 끝: 근거 있는 시기 막대 + 점선으로 구분한 "앞으로 만들어 갈 변화" (운영자 2026-10-19, 점수 · 확정적 상승 없음) ─────

test("시간축 끝에 '앞으로 만들어 갈 변화'가 따로 있다 — 막대가 아니고, 준비 목록은 저장된 조언의 제목에서만 온다", () => {
  const v = view();
  assert.ok(v.closing && v.axis);
  assert.equal(v.closing.title, "앞으로 만들어 갈 변화");
  assert.equal(v.closing.axisLabel, "앞으로 만들어 갈 변화");
  assert.deepEqual(v.closing.points, ["고마웠던 사람에게 먼저 안부 묻기", "맡은 일의 범위를 한 번 적어 두기"], "저장된 조언(7번 장 실천 행동)의 제목 그대로");
  assert.ok(!v.axis.bars.some((b) => /closing|만들어/.test(`${b.key} ${b.label}`)), "마무리는 시기 막대가 아니다");
  // 입력이 달라지면 준비 목록도 따라 달라진다 — 한 사람의 목록을 베껴 두지 않았다
  const other = view({ actions: [{ title: "쉬는 날을 먼저 정하기", detail: "x" }] });
  assert.deepEqual(other.closing?.points, ["쉬는 날을 먼저 정하기"]);
  // 조언이 없는 리포트는 목록 없이 고정 문구만(새 조언을 지어내지 않는다)
  assert.deepEqual(view({ actions: [] }).closing?.points, []);
  // 조언이 많아도 세 개까지
  assert.equal(view({ actions: [1, 2, 3, 4, 5].map((n) => ({ title: `준비 ${n}`, detail: "x" })) }).closing?.points.length, 3);
});

test("마무리 문구는 점수 · 확률 · 확정적 상승 · 보장을 말하지 않고, 읽은 시기와 내가 만들어 갈 몫을 구분한다", () => {
  const c = FLOW_CLOSING_COPY;
  const text = [c.title, c.axisLabel, c.lead, c.listLabel, c.pointsNote].join(" ");
  assert.doesNotMatch(text.replace("7번 조언", "조언"), /\d|%|점/, "숫자(점수 · 퍼센트 · 연도)가 없다 — 장 번호(7번 조언)만 예외");
  assert.doesNotMatch(text, /반드시|확실|보장|무조건|틀림없|꼭 좋아|우상향|올라갑|상승|좋아질 거|잘될 거|성공/, "확정적 상승 · 보장 표현이 없다");
  assert.match(c.lead, /정해져 있지 않/, "앞으로의 모습이 정해져 있지 않다고 밝힌다");
  assert.match(c.lead, /사주에서 읽은 시기/, "읽은 시기와 구분한다");
  assert.match(c.lead, /만들어 갈 수 있어요/, "가능성의 말(수 있어요)로 마무리한다");
});

test("마무리를 더해도 시기 막대 · 연도 · 나이 매핑은 그대로다 — 막대는 예전과 같은 키 · 위치다", () => {
  const v = view({ evidence: evidenceWith2017(), paragraphs: [PAST, NOW, NEXT, FORT_A, FORT_B] });
  assert.equal(v.items.find((i) => i.key === "age-20-21")?.caption, "2017년 무렵");
  assert.equal(v.items.find((i) => i.key === "age-16-16")?.caption, "2012년 무렵");
  assert.ok(v.axis!.bars.length >= 5, "시기 막대가 그대로 있다");
  for (const b of v.axis!.bars) assert.ok(["past", "now", "year", "next"].includes(b.kind), `${b.key}: 막대 종류는 시기뿐`);
});

test("화면: 시간축 끝은 점선으로 구분하고(막대와 다른 모양), 마무리 칸은 점선 테두리 · 점수 막대가 없으며 누르면 마무리로 이동한다", () => {
  const src = readFileSync(new URL("../../../components/report/flow-timeline.tsx", import.meta.url), "utf8");
  assert.match(src, /border-dashed/, "점선");
  assert.match(src, /onClick=\{toClosing\}/);
  assert.match(src, /id=\{id\} tabIndex=\{-1\} aria-label=\{closing\.title\}/);
  const closingFn = src.slice(src.indexOf("function Closing"), src.indexOf("function Head"));
  assert.doesNotMatch(closingFn, /style=\{\{\s*(height|width)/, "마무리에는 높이 · 너비로 정도를 나타내는 막대가 없다");
  assert.doesNotMatch(closingFn, /%|점수/, "점수 · 퍼센트 표시가 없다");
  assert.match(src, /min-h-11/, "누르는 영역 높이 44px 이상");
});
