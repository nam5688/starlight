// 실행: npm test — 사주 풀이 재료(십성 분포 · 일의 계열 · 재물 · 육친 · 인연의 경향 · 개운, 2026-10-17 운영자 방향: 사주풀이가 중심).
// 예시 원국은 1994-11-07 08:40 양력 여성(서윤): 갑술(년) 갑술(월) 정유(일) 갑진(시) — 기대값은 손으로 세어 적었다(일간 정화: 목 3 · 화 1 · 토 3 · 금 1 · 수 0 / 인성 3 · 식상 3 · 재성 1 · 비겁 0 · 관성 0).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { FiveElement, SajuOk } from "../engine.ts";
import { FIVE_ELEMENTS } from "../engine.ts";
import { itemSuggestions } from "../items.ts";
import { calculateSaju } from "../manseryeok-engine.ts";
import { ELEMENT_FORTUNE, FORTUNE_EVIDENCE_ID, fortifyOf, fortifyPrimaryOf, fortuneEvidence, fortuneMentions } from "./fortune.ts";
import { ruleFor } from "./rule-meta.ts";
import { analyzeStructure } from "./structure.ts";

const chart = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" }) as SajuOk;
const byId = (ev: ReturnType<typeof fortuneEvidence>, id: string) => ev.find((e) => e.id === id)!;

test("오행 대응표: 방향 · 색 · 하도의 수(數)가 전통 대응과 같고 1~10이 한 번씩 나온다", () => {
  assert.deepEqual(Object.fromEntries(FIVE_ELEMENTS.map((e) => [e, ELEMENT_FORTUNE[e].direction.replace(/\(.*\)/, "")])), { 목: "동쪽", 화: "남쪽", 토: "중앙", 금: "서쪽", 수: "북쪽" });
  assert.deepEqual(Object.fromEntries(FIVE_ELEMENTS.map((e) => [e, ELEMENT_FORTUNE[e].numbers])), { 목: [3, 8], 화: [2, 7], 토: [5, 10], 금: [4, 9], 수: [1, 6] });
  assert.deepEqual(FIVE_ELEMENTS.flatMap((e) => ELEMENT_FORTUNE[e].numbers).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(Object.fromEntries(FIVE_ELEMENTS.map((e) => [e, ELEMENT_FORTUNE[e].colors[0]])), { 목: "초록", 화: "빨강", 토: "베이지", 금: "흰색", 수: "검정" });
  // 무료 화면의 보완 아이템(items.ts)과 같은 색 · 습관을 쓴다 — 두 화면이 서로 다른 말을 하지 않게
  const items = itemSuggestions(chart).items;
  for (const it of items) {
    for (const c of it.colors) assert.ok(ELEMENT_FORTUNE[it.element].colors.includes(c) || it.colors.every((x) => ELEMENT_FORTUNE[it.element].colors.includes(x)), `${it.element} 색 ${c}`);
    for (const h of it.habits) assert.ok(ELEMENT_FORTUNE[it.element].habits.includes(h), `${it.element} 습관 ${h}`);
  }
});

test("보완 후보: 서윤은 수가 없어 1순위 수, 그다음 개수가 적은 화 — 같은 입력은 늘 같은 결과이고 무료 보완 아이템이 고르는 기운 안에 있다", () => {
  const f = fortifyOf(chart);
  assert.deepEqual(f.counts, { 목: 3, 화: 1, 토: 3, 금: 1, 수: 0 });
  assert.deepEqual(f.primary, { element: "수", count: 0 });
  assert.deepEqual(f.others, [{ element: "화", count: 1, reason: "적음" }]);
  assert.deepEqual(fortifyOf(chart), f);
  const targets = itemSuggestions(chart).items.map((i) => i.element);
  assert.ok(targets.includes(f.primary.element), `${targets.join(",")}`);
});

test("보완 후보: 모든 기운이 2개 이상이면 가장 적은 기운, 동률이면 일간을 돕는 쪽(인성 · 비겁 · 식상 · 재성 · 관성) 순서", () => {
  const even = { ...chart, elementCounts: { 목: 3, 화: 2, 토: 2, 금: 2, 수: 2 } as Record<FiveElement, number> };
  // 일간 정화: 인성 목 · 비겁 화 · 식상 토 · 재성 금 · 관성 수 — 최소(2)는 화 · 토 · 금 · 수, 순서로는 화가 먼저
  assert.equal(fortifyOf(even).primary.element, "화");
  assert.equal(fortifyOf({ ...even, elementCounts: { 목: 2, 화: 3, 토: 2, 금: 2, 수: 2 } }).primary.element, "목");
});

test("보완 후보: 서로 다른 날짜 150개에서 1순위는 늘 가장 적은 개수이고, 계절 보완 후보는 월주가 확실하고 그 기운이 1개 이하일 때만 더해진다", () => {
  let winter = 0;
  let season = 0;
  for (let i = 0; i < 150; i++) {
    const d = new Date(Date.UTC(1960, 0, 3) + i * 97 * 86400000);
    const s = calculateSaju({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), calendar: "solar", isLeapMonth: false, birthTime: i % 3 ? "13:20" : null, gender: i % 2 ? "male" : "female" });
    if (s.status !== "ok") continue;
    const f = fortifyOf(s);
    assert.equal(f.primary.count, Math.min(...FIVE_ELEMENTS.map((e) => f.counts[e])), `${d.toISOString().slice(0, 10)} 1순위는 가장 적은 개수`);
    assert.ok(f.others.length <= 2);
    const johu = analyzeStructure({ dayMaster: s.dayMaster.stem, pillars: s.pillars.map((p) => ({ key: p.key, stem: p.stem, branch: p.branch })) }).johu;
    const monthUncertain = s.notes.some((n) => (n.kind === "jeolgi-day" || n.kind === "near-boundary" || n.kind === "jasi-school") && n.pillars.includes("month"));
    const expectsSeason = Boolean(johu) && !monthUncertain && johu!.need !== f.primary.element && f.counts[johu!.need] <= 1 && !f.others.some((o) => o.reason === "적음" && o.element === johu!.need);
    assert.equal(f.others.some((o) => o.reason === "계절"), expectsSeason, `${d.toISOString().slice(0, 10)} 계절 보완`);
    if (johu) winter++;
    if (expectsSeason) season++;
    // 근거는 늘 여섯 가지이고 같은 입력이면 같은 글이다
    const ev = fortuneEvidence(s);
    assert.deepEqual(ev.map((e) => e.id), ["saju.sipsung", "saju.career", "saju.wealth", "saju.kin", "saju.partner", "saju.fortify"]);
    assert.deepEqual(fortuneEvidence(s), ev);
  }
  assert.ok(winter > 20 && season > 0, `겨울 · 여름 태생 ${winter}개 · 계절 보완 ${season}개 — 계절 보완 경로도 실제로 시험했다`);
});

test("근거 문장(서윤): 개운은 수의 대응(북쪽 · 검정 · 1과 6 · 물가)을, 십성 분포는 손으로 센 값을, 재물 · 육친은 구조를 적는다", () => {
  const ev = fortuneEvidence(chart);
  const fortify = byId(ev, "saju.fortify");
  assert.match(fortify.fact, /오행 개수\(원국 글자 기준, 지장간 제외\): 목 3 · 화 1 · 토 3 · 금 1 · 수 0/);
  assert.match(fortify.fact, /보완 후보 1순위: 수\(원국에 없음\) · 그다음 후보: 화\(1개 — 적음\)/);
  assert.match(fortify.cue, /방향 북쪽, 계절 겨울, 색 검정 · 남색 · 짙은 파랑, 수\(數\) 1 · 6/);
  assert.match(fortify.cue, /그다음 후보 화\(불\) 기운은 방향 남쪽/);
  assert.match(fortify.cue, /효과나 재물 · 건강의 변화를 보장하지 않고/);
  const sip = byId(ev, "saju.sipsung").fact;
  assert.match(sip, /비겁 0자리 \/ 식상 3자리\(상관 3\) \/ 재성 1자리\(편재 1\) \/ 관성 0자리 \/ 인성 3자리\(정인 3\)/);
  assert.match(sip, /가장 많은 쪽: 인성 3자리/);
  assert.match(sip, /원국에 없는 쪽: 비겁 · 관성/);
  const wealth = byId(ev, "saju.wealth").fact;
  assert.match(wealth, /재성 1자리\(편재 1\)/);
  assert.match(wealth, /편재가 정재보다 많음/);
  assert.match(wealth, /식상이 재성으로 이어짐/);
  const kin = byId(ev, "saju.kin");
  assert.match(kin.fact, /인성 3자리\(어머니 · 윗사람 · 스승/);
  assert.match(kin.fact, /월주 갑술\(부모 · 형제 · 성장 환경 자리\)|월주 갑술 — 천간 정인 · 지지 상관\(부모 · 형제 · 성장 환경 자리\)/);
  assert.match(kin.fact, /가까이 두면 균형이 맞는 사람의 분위기\(보완 후보 수 기운의 성향\): 생각이 깊고/);
  assert.match(byId(ev, "saju.career").fact, /가장 두드러진 쪽 인성\(3자리\)/);
  assert.match(byId(ev, "saju.partner").fact, /배우자 자리\(일지\) 유 — /);
});

test("근거 문장에는 엔진이 계산하지 않은 판정 이름 · 점수 · 확률 · 나이 · 개인 정보가 없다 — 이 낱말이 근거에 있으면 글에서 이 사람의 판정으로 써도 되는 것으로 읽히기 때문이다", () => {
  const forbidden = /격국|용신|희신|기신|신살|십이운성|도화|역마|화개|양인|괴강|백호|홍염|귀문|천을귀인|원진|\d\s*%|퍼센트|확률|\d{2,3}\s*점|생년월일|이름/;
  for (const s of [chart, ...[1970, 1983, 1991, 2003].map((y) => calculateSaju({ year: y, month: 6, day: 15, calendar: "solar", isLeapMonth: false, birthTime: "09:10", gender: "male" }) as SajuOk)]) {
    for (const e of fortuneEvidence(s)) {
      assert.doesNotMatch(`${e.fact} ${e.cue}`, forbidden, `${e.id}: ${(forbidden.exec(`${e.fact} ${e.cue}`) ?? [""])[0]}`);
      assert.equal(e.source, "saju");
      assert.ok(FORTUNE_EVIDENCE_ID.test(e.id));
      assert.ok(e.fact.length > 30 && e.cue.length > 60, e.id);
      assert.ok(e.topics.length > 0);
    }
  }
});

test("규칙 이력: 여섯 근거 모두 규칙 하나에 대응하고, 검토 전(unreviewed) 초안으로 적혀 있으며 계산 한계를 밝힌다", () => {
  for (const e of fortuneEvidence(chart)) {
    const r = ruleFor(e.id);
    assert.ok(r, `${e.id}: 규칙 이력 없음`);
    assert.equal(r!.review, "unreviewed");
    assert.match(r!.source, /문헌 근거는 확인하지 못했다/);
    assert.match(r!.exceptions.join("\n"), /격국 · 용신 · 희신 · 기신 · 신살/);
  }
});

test("불확실한 기둥: 년주 · 월주가 달라질 수 있으면 육친 읽기는, 일주가 달라질 수 있으면 인연의 경향은 uncertain으로 표시해 해석에 쓰지 않는다 — 나머지는 그대로다", () => {
  const withNote = (pillars: ("year" | "month" | "day" | "hour")[]): SajuOk => ({ ...chart, notes: [{ kind: "near-boundary", pillars, message: "경계 근처" } as SajuOk["notes"][number]] });
  const flagged = (s: SajuOk) => fortuneEvidence(s).filter((e) => e.uncertain).map((e) => e.id);
  assert.deepEqual(flagged(chart), []);
  assert.deepEqual(flagged(withNote(["month"])), ["saju.kin"]);
  assert.deepEqual(flagged(withNote(["year"])), ["saju.kin"]);
  assert.deepEqual(flagged(withNote(["day"])), ["saju.partner"]);
  assert.deepEqual(flagged(withNote(["hour"])), []);
  // 월주가 확실하지 않으면 계절 보완 후보는 만들지 않는다
  const f = fortifyOf(withNote(["month"]));
  assert.ok(!f.others.some((o) => o.reason === "계절"));
});

test("인연의 경향: 나이 방향 스위치를 끄면 나이 차의 큰 방향이 근거에서 빠지고 분위기 · 오래 가는 관계의 조건은 남는다", () => {
  const on = byId(fortuneEvidence(chart, { ageDirection: true }), "saju.partner");
  const off = byId(fortuneEvidence(chart, { ageDirection: false }), "saju.partner");
  assert.match(on.fact, /나이 차의 큰 방향/);
  assert.doesNotMatch(off.fact, /나이 차의 큰 방향/);
  assert.doesNotMatch(off.cue, /나이 차는/);
  assert.match(off.fact, /편하게 느끼기 쉬운 상대의 분위기/);
  assert.match(off.fact, /오래 가는 관계에서 중요하게 여기기 쉬운 것/);
  assert.match(on.cue, /구체적인 나이 · 직업 · 마음 · 만나는 날짜는 말하지 않고/);
});

test("개운 근거 읽기: 근거 목록에서 1순위 기운을 꺼내고, 본문이 그 기운의 방향 · 색 · 숫자 · 장소를 말하는지 알아본다(다른 기운의 대응은 알아보지 않는다)", () => {
  const ev = fortuneEvidence(chart);
  assert.equal(fortifyPrimaryOf(ev), "수");
  assert.equal(fortifyPrimaryOf(ev.map((e) => (e.id === "saju.fortify" ? { ...e, uncertain: true } : e))), null);
  assert.equal(fortifyPrimaryOf([]), null);
  const good = "북쪽으로 산책하고 남색 소품을 두고, 숫자 6을 즐겨 쓰고, 강가 같은 물가에 머물러 보세요.";
  assert.deepEqual(fortuneMentions(good, "수"), { direction: true, color: true, number: true, place: true });
  // 같은 글은 목(나무)의 대응으로는 하나도 맞지 않는다 — 임의로 다른 기운의 대응을 쓰면 알아본다
  assert.deepEqual(fortuneMentions(good, "목"), { direction: false, color: false, number: false, place: false });
  // 숫자는 앞뒤에 다른 숫자가 없는 한 글자로 센다("2026"의 6이나 "16"의 6은 세지 않는다)
  assert.equal(fortuneMentions("2026년 16일", "수").number, false);
  assert.equal(fortuneMentions("숫자 1과 6", "수").number, true);
  assert.equal(fortuneMentions("숫자 10", "토").number, true);
});
