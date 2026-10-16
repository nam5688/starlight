// 실행: npm test — 원국 구조 분석(지장간 · 월령 · 통근 · 투간 · 강약 후보 · 조후 후보, 2026-10-16)
// 예시 원국은 1994-11-07 08:40 양력 여성(서윤): 갑술(년) 갑술(월) 정유(일) 갑진(시). 기대값은 손으로 세어 적었다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { getBranchTenGod, getTenGod } from "manseryeok";
import type { PillarKey, SajuOk } from "../engine.ts";
import { calculateSaju } from "../manseryeok-engine.ts";
import { sajuEvidence } from "./rules.ts";
import { analyzeStructure, HIDDEN_STEMS, SEASON_OF_BRANCH, structureEvidence, type ChartPillar } from "./structure.ts";

const BRANCHES = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];
const STEMS = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
const ELEMENT_OF_BRANCH: Record<string, string> = { 자: "수", 축: "토", 인: "목", 묘: "목", 진: "토", 사: "화", 오: "화", 미: "토", 신: "금", 유: "금", 술: "토", 해: "수" };
const ELEMENT_OF_STEM: Record<string, string> = { 갑: "목", 을: "목", 병: "화", 정: "화", 무: "토", 기: "토", 경: "금", 신: "금", 임: "수", 계: "수" };

const chart = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" }) as SajuOk;
const pillarsOf = (c: SajuOk): ChartPillar[] => c.pillars.map((p) => ({ key: p.key, stem: p.stem, branch: p.branch }));
const P = (key: PillarKey, stem: string, branch: string): ChartPillar => ({ key, stem, branch });

test("지장간 표: 12지지 모두 있고 2~3글자, 마지막이 정기이며 정기의 오행이 그 지지의 오행과 같다(자 · 묘 · 유는 중기가 없다)", () => {
  assert.deepEqual(Object.keys(HIDDEN_STEMS).sort(), [...BRANCHES].sort());
  for (const b of BRANCHES) {
    const list = HIDDEN_STEMS[b];
    assert.ok(list.length === 2 || list.length === 3, `${b}: 지장간 ${list.length}개`);
    assert.equal(list[list.length - 1].role, "정기", `${b}: 마지막은 정기`);
    assert.equal(list.filter((h) => h.role === "정기").length, 1, `${b}: 정기는 하나`);
    assert.equal(new Set(list.map((h) => h.stem)).size, list.length, `${b}: 같은 글자가 겹치지 않는다`);
    assert.equal(ELEMENT_OF_STEM[list[list.length - 1].stem], ELEMENT_OF_BRANCH[b], `${b}: 정기의 오행 = 지지의 오행`);
    assert.equal(list.some((h) => h.role === "중기"), !["자", "묘", "유"].includes(b), `${b}: 중기 유무`);
  }
  // 위키백과 "지장간" 표와 대조해 같음을 확인한 값(2026-10-16) 몇 곳을 그대로 고정한다
  assert.deepEqual(HIDDEN_STEMS["술"].map((h) => h.stem + h.role), ["신여기", "정중기", "무정기"]);
  assert.deepEqual(HIDDEN_STEMS["축"].map((h) => h.stem + h.role), ["계여기", "신중기", "기정기"]);
  assert.deepEqual(HIDDEN_STEMS["인"].map((h) => h.stem + h.role), ["무여기", "병중기", "갑정기"]);
});

test("계절 표: 인묘진 봄 · 사오미 여름 · 신유술 가을 · 해자축 겨울", () => {
  assert.deepEqual(["인", "묘", "진"].map((b) => SEASON_OF_BRANCH[b]), ["봄", "봄", "봄"]);
  assert.deepEqual(["사", "오", "미"].map((b) => SEASON_OF_BRANCH[b]), ["여름", "여름", "여름"]);
  assert.deepEqual(["신", "유", "술"].map((b) => SEASON_OF_BRANCH[b]), ["가을", "가을", "가을"]);
  assert.deepEqual(["해", "자", "축"].map((b) => SEASON_OF_BRANCH[b]), ["겨울", "겨울", "겨울"]);
});

test("지장간 정기의 십신은 엔진의 지지 십신과 일치한다 — 어긋나는 곳이 있으면 그 지지는 엔진이 다른 기준으로 센다는 뜻이므로 이 표로 월령을 읽는 규칙을 다시 본다", () => {
  const diffs: string[] = [];
  for (const b of BRANCHES) {
    const jeonggi = HIDDEN_STEMS[b].find((h) => h.role === "정기")!.stem;
    for (const dm of STEMS) {
      const engine = getBranchTenGod(dm as never, b as never);
      const table = getTenGod(dm as never, jeonggi as never);
      if (engine !== table) diffs.push(`${dm}일간 ${b}: 엔진 지지 십신 ${engine} ≠ 정기 ${jeonggi}의 십신 ${table}`);
    }
  }
  assert.deepEqual(diffs, []);
});

test("서윤(갑술 갑술 정유 갑진): 월령 · 뿌리 · 투간 · 세력 · 강약 후보 · 조후를 손으로 센 값과 같다", () => {
  const st = analyzeStructure({ dayMaster: chart.dayMaster.stem, pillars: pillarsOf(chart) });
  assert.equal(st.dayMaster.stem, "정");
  assert.equal(st.hourKnown, true);
  // 월령: 월지 술(가을), 정기 무 → 정 기준 상관(식상) → 실령
  assert.equal(st.month.branch, "술");
  assert.equal(st.month.season, "가을");
  assert.equal(st.month.jeonggi.stem, "무");
  assert.equal(st.month.jeonggi.tenGod, "상관");
  assert.equal(st.month.deukRyeong, false);
  // 통근: 화 오행은 년 · 월 지지 술의 정(丁) 중기뿐 — 정기에 뿌리가 없다
  assert.deepEqual(st.roots.all.map((r) => `${r.pillar}:${r.branch}:${r.stem}:${r.role}`), ["year:술:정:중기", "month:술:정:중기"]);
  assert.equal(st.roots.strong.length, 0);
  // 투간: 월지 술의 지장간(신 · 정 · 무) 가운데 정(丁)만 일간으로 드러난다
  assert.deepEqual(st.exposed, [{ stem: "정", role: "중기", where: ["day"] }]);
  // 세력: 돕는 자리 3곳(갑 천간 3곳이 모두 정인), 덜어내는 자리 4곳(술 · 술 · 유 · 진 지지)
  assert.equal(st.power.support.length, 3);
  assert.equal(st.power.drain.length, 4);
  assert.deepEqual(st.strength.factors.map((f) => `${f.kind}:${f.toward}`), ["월령:덜 받는 쪽", "뿌리:덜 받는 쪽", "세력:덜 받는 쪽"]);
  assert.equal(st.strength.candidate, "덜 받는 쪽");
  assert.equal(st.johu, null, "가을은 조후 후보를 만들지 않는다");
});

test("강약 후보: 세 요소가 모두 받는 쪽이면 받는 쪽, 월령은 덜 받는데 뿌리가 단단하면 갈림 — 점수로 정하지 않는다", () => {
  // 갑목 일간이 인월에 태어나 비견(득령) · 정기 뿌리 · 돕는 자리가 많은 원국
  const strong = analyzeStructure({ dayMaster: "갑", pillars: [P("year", "임", "자"), P("month", "갑", "인"), P("day", "갑", "인"), P("hour", "갑", "해")] });
  assert.equal(strong.month.deukRyeong, true);
  assert.ok(strong.roots.strong.length >= 1);
  assert.equal(strong.power.drain.length, 0);
  assert.equal(strong.strength.candidate, "받는 쪽");
  // 신월(편관, 실령)인데 일지 인에 갑이 정기로 뿌리내린 원국 — 월령은 덜 받고 뿌리는 받으니 한쪽으로 모이지 않는다
  const mixed = analyzeStructure({ dayMaster: "갑", pillars: [P("year", "경", "신"), P("month", "경", "신"), P("day", "갑", "인"), P("hour", "병", "오")] });
  assert.equal(mixed.month.deukRyeong, false);
  assert.ok(mixed.roots.strong.length >= 1);
  assert.equal(mixed.strength.candidate, "갈림");
  // 일간과 같은 오행이 지장간에 하나도 없는 원국은 뿌리가 없다
  const rootless = analyzeStructure({ dayMaster: "갑", pillars: [P("year", "경", "신"), P("month", "경", "유"), P("day", "갑", "신"), P("hour", "경", "신")] });
  assert.equal(rootless.roots.all.length, 0);
  assert.equal(rootless.strength.candidate, "덜 받는 쪽");
});

test("세력은 일곱 자리(시각을 모르면 다섯 자리)를 세므로 돕는 자리와 덜어내는 자리가 같은 수가 되지 않는다", () => {
  const full = analyzeStructure({ dayMaster: "갑", pillars: [P("year", "임", "자"), P("month", "병", "오"), P("day", "갑", "자"), P("hour", "병", "오")] });
  assert.equal(full.power.support.length + full.power.drain.length, 7);
  assert.equal(full.power.support.length, 3, "년 천간 임 · 년 지지 자 · 일 지지 자");
  assert.equal(full.power.drain.length, 4, "월 천간 병 · 월 지지 오 · 시 천간 병 · 시 지지 오");
  const noHour = analyzeStructure({ dayMaster: "갑", pillars: [P("year", "임", "오"), P("month", "병", "오"), P("day", "갑", "자")] });
  assert.equal(noHour.power.support.length + noHour.power.drain.length, 5);
  assert.notEqual(noHour.power.support.length, noHour.power.drain.length);
});

test("조후 후보: 겨울과 여름 달만 만들고(겨울 → 화, 여름 → 수), 봄과 가을 달은 만들지 않는다", () => {
  const winter = analyzeStructure({ dayMaster: "정", pillars: [P("year", "임", "자"), P("month", "계", "해"), P("day", "정", "축"), P("hour", "신", "해")] });
  assert.equal(winter.johu?.season, "겨울");
  assert.equal(winter.johu?.need, "화");
  assert.equal(winter.johu?.visibleCount, 1, "화 글자는 일간 정(丁) 하나뿐 — 지지의 정기에는 화가 없다");
  assert.equal(winter.johu?.withHiddenCount, 1, "자 · 해 · 축의 지장간에도 화가 없어 지장간까지 세어도 같다");
  const summer = analyzeStructure({ dayMaster: "임", pillars: [P("year", "병", "오"), P("month", "병", "오"), P("day", "임", "오"), P("hour", "정", "사")] });
  assert.equal(summer.johu?.season, "여름");
  assert.equal(summer.johu?.need, "수");
  assert.equal(summer.johu?.visibleCount, 1, "일간 임 하나뿐");
  for (const month of ["인", "묘", "진", "신", "유", "술"]) {
    const st = analyzeStructure({ dayMaster: "정", pillars: [P("year", "갑", "자"), P("month", "갑", month), P("day", "정", "유")] });
    assert.equal(st.johu, null, `${month}월은 조후 후보를 만들지 않는다`);
  }
});

test("출생 시각을 모르는 원국: 시주 없이 여섯 글자로 계산하고 근거 문장에 시각을 모른다고 적는다", () => {
  const noHour = calculateSaju({ year: 1996, month: 3, day: 29, calendar: "solar", isLeapMonth: false, birthTime: null, gender: "female" }) as SajuOk;
  const st = analyzeStructure({ dayMaster: noHour.dayMaster.stem, pillars: pillarsOf(noHour) });
  assert.equal(st.hourKnown, false);
  assert.equal(st.pillars.length, 3);
  assert.equal(st.power.support.length + st.power.drain.length, 5, "천간 2곳(일간 제외) + 지지 3곳");
  const ev = structureEvidence(noHour, new Set());
  assert.match(ev.find((e) => e.id === "saju.structure.chart")!.fact, /^원국 여섯 글자/);
  assert.match(ev.find((e) => e.id === "saju.structure.chart")!.fact, /시주 없음/);
});

test("근거 목록: 서윤은 가을 달이라 조후를 뺀 다섯 근거가 나오고, 사실 문장에 자리와 십신 · 요소가 있고 월지에 기대는 근거는 uncertain이 아니다", () => {
  const ev = structureEvidence(chart, new Set());
  assert.deepEqual(ev.map((e) => e.id), ["saju.structure.chart", "saju.structure.hidden", "saju.structure.month", "saju.structure.roots", "saju.structure.strength"]);
  const by = (id: string) => ev.find((e) => e.id === id)!;
  assert.match(by("saju.structure.chart").fact, /년주 갑술\(甲戌\) — 천간 정인 · 지지 상관/);
  assert.match(by("saju.structure.chart").fact, /일주 정유\(丁酉\) — 천간 일간 · 지지 편재/);
  assert.match(by("saju.structure.hidden").fact, /월주 지지 술\(戌\) — 신\(辛\) 여기 편재, 정\(丁\) 중기 비견, 무\(戊\) 정기 상관/);
  assert.match(by("saju.structure.month").fact, /월지 술\(戌\) 가을 — 정기 무\(戊\)는 일간 기준 상관\(식상\) → 월령을 얻지 못함\(실령\)/);
  assert.match(by("saju.structure.roots").fact, /뿌리\(통근\): 년주 지지 술의 정\(丁\) 중기\(일간과 같은 글자\), 월주 지지 술의 정\(丁\) 중기\(일간과 같은 글자\) — 정기에는 없음/);
  assert.match(by("saju.structure.roots").fact, /일간\(일주 천간, 나 자신\)에 드러남/);
  assert.match(by("saju.structure.strength").fact, /① 월령 — 월령을 얻지 못함.*② 뿌리 — 일간과 같은 오행이 중기 · 여기에만 있어 뿌리가 약함.*③ 세력 — 돕는 자리 3곳, 덜어내는 자리 4곳.*후보: 힘을 덜 받는 쪽/);
  for (const e of ev) {
    assert.equal(e.source, "saju", e.id);
    assert.ok(!e.uncertain, `${e.id}: 월주가 확실한 원국에서는 uncertain이 아니다`);
    assert.ok(e.fact.length > 20 && e.cue.length > 20, e.id);
    // 점수 · 퍼센트로 환산하지 않는다
    assert.ok(!/\d\s?%|점수 \d|\d+점/.test(e.fact), `${e.id}: 점수 환산이 들어 있다`);
    // 계산하지 않은 판단을 한 것처럼 쓰지 않는다
    assert.ok(!/격국|용신|희신|기신|신살/.test(`${e.fact} ${e.cue}`), `${e.id}: 아직 계산하지 않는 판단이 들어 있다`);
  }
});

test("월주가 절기 경계에 걸려 달라질 수 있으면 월지에 기대는 근거(월령 · 통근 · 강약 · 조후)는 uncertain으로 표시한다", () => {
  const ev = structureEvidence(chart, new Set<PillarKey>(["month"]));
  const flagged = ev.filter((e) => e.uncertain).map((e) => e.id).sort();
  assert.deepEqual(flagged, ["saju.structure.month", "saju.structure.roots", "saju.structure.strength"]);
  assert.ok(!ev.find((e) => e.id === "saju.structure.chart")!.uncertain, "여덟 글자 표는 계산된 그대로 보여 준다");
  // 근거 문장에 어느 기둥이 달라질 수 있는지 밝힌다
  assert.match(ev.find((e) => e.id === "saju.structure.chart")!.fact, /월주는 절기 · 자시 경계에 걸려 달라질 수 있음/);
});

test("겨울 달 원국에서는 조후 근거가 만들어지고, 필요한 기운이 원국에 없으면 moderate · 있으면 weak이다", () => {
  const winterChart = calculateSaju({ year: 1990, month: 12, day: 25, calendar: "solar", isLeapMonth: false, birthTime: "12:00", gender: "male" }) as SajuOk;
  const ev = structureEvidence(winterChart, new Set());
  const johu = ev.find((e) => e.id === "saju.structure.johu");
  assert.ok(johu, "겨울(해 · 자 · 축 월)에는 조후 근거가 있다");
  assert.match(johu!.fact, /조후\(계절의 한열\): 월지 .* 겨울/);
  assert.match(johu!.cue, /화\(불\)/);
  const m = johu!.fact.match(/원국 글자 (\d+)개/);
  assert.ok(m);
  assert.equal(johu!.strength, Number(m![1]) === 0 ? "moderate" : "weak");
});

test("근거 목록 전체(sajuEvidence)에 구조 근거가 함께 들어가고 id가 겹치지 않는다", () => {
  const all = sajuEvidence(chart, { reference: { year: 2026, month: 10 }, gender: "female" });
  const ids = all.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "근거 ID 중복");
  for (const id of ["saju.structure.chart", "saju.structure.hidden", "saju.structure.month", "saju.structure.roots", "saju.structure.strength"]) assert.ok(ids.includes(id), id);
});
