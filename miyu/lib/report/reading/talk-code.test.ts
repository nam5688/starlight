// 실행: npm test — 코드가 계산한 풀이(오늘의 한 장 · 인연의 경향 · 오래 가는 관계)가 사주 계산에서만 정해지고 금지선을 지키는지 확인한다.
import assert from "node:assert/strict";
import test from "node:test";
import { SAMPLE_CHART } from "../../samples/sample-report.ts";
import { sampleReadingReport } from "../../samples/sample-reading-report.ts";
import { TALK_COPY } from "./talk.ts";
import { codeTopicsFor, TALK_ASK_MARRIAGE, TALK_ASK_PARTNER } from "./talk-code.ts";
import { buildTalkModel } from "./talk.ts";

const TODAY = { year: 2026, month: 10, day: 15 };
const cal = { items: sampleReadingReport.calendars!.items, reference: sampleReadingReport.timelineReference };

test("질문 문구는 talk.ts의 고정 문구와 같다 (순환 불러오기를 피해 상수로 둔 것)", () => {
  assert.equal(TALK_ASK_PARTNER, TALK_COPY.ask.partner());
  assert.equal(TALK_ASK_MARRIAGE, TALK_COPY.ask.marriage());
});

test("코드가 계산한 풀이: 사주 계산 결과가 없으면 만들지 않고, 같은 입력은 같은 결과이며, 무료 맛보기에는 이어지는 부분이 잠긴다", () => {
  assert.deepEqual(codeTopicsFor({ saju: null, today: TODAY, calendar: cal, tier: "paid" }), []);
  assert.deepEqual(codeTopicsFor({ saju: { status: "not-connected" }, today: TODAY, calendar: cal, tier: "paid" }), []);
  const paid = codeTopicsFor({ saju: SAMPLE_CHART, today: TODAY, calendar: cal, tier: "paid" });
  assert.deepEqual(paid.map((t) => t.id), ["daily", "partner", "marriage"]);
  assert.deepEqual(paid, codeTopicsFor({ saju: SAMPLE_CHART, today: TODAY, calendar: cal, tier: "paid" }));
  const free = codeTopicsFor({ saju: SAMPLE_CHART, today: TODAY, calendar: undefined, tier: "free" });
  assert.deepEqual(free.map((t) => t.id), ["daily", "partner", "marriage"]);
  assert.equal(free.find((t) => t.id === "daily")!.locked, undefined, "오늘의 한 장은 하루 한 번 무료라 잠그지 않는다");
  for (const id of ["partner", "marriage"]) {
    const t = free.find((x) => x.id === id)!;
    assert.ok(t.locked && t.locked.hooks.length === 3, id);
    assert.ok(!t.summary.join(" ").includes("큰 방향만 본 거예요"), `${id}: 나이 차의 큰 방향은 구매 후`);
    assert.ok(t.detail.length === 0 && t.basis === null && !t.calendar, id);
  }
  // 오늘 날짜가 없으면 오늘의 한 장은 만들지 않는다
  assert.ok(!codeTopicsFor({ saju: SAMPLE_CHART, today: null, calendar: cal, tier: "paid" }).some((t) => t.id === "daily"));
});

test("인연의 경향 풀이(구매 후): 분위기 + 나이 차의 큰 방향 + 접힌 근거 + 인연이 움직이는 달 달력, 말하지 않는 것을 밝힌다", () => {
  const partner = codeTopicsFor({ saju: SAMPLE_CHART, today: TODAY, calendar: cal, tier: "paid" }).find((t) => t.id === "partner")!;
  assert.equal(partner.summary.length, 2);
  assert.match(partner.summary[1], /연상|또래|어리게/);
  assert.match(partner.summary[1], /몇 살 차이라는 뜻이 아니라 큰 방향만 본 거예요/);
  assert.match(partner.caveat ?? "", /100% 정확하거나 검증된 사실이 아니에요/);
  assert.ok(partner.calendar && partner.calendar.items.length === cal.items.length);
  assert.ok(partner.basis && partner.basis.unknown.some((u) => /통계나 조사로 확인된 것이 아니에요/.test(u)));
  const details = JSON.stringify(partner.detail);
  assert.match(details, /통계나 조사 결과를 쓰지 않았어요/);
  assert.match(details, /말하지 않고, 큰 방향과 눈에 띄는 달까지만 읽어요/);
  // 직업 · 구체적 나이 · 날짜를 말하지 않는다
  const all = JSON.stringify(partner);
  assert.doesNotMatch(all.replace(/정확한 나이 · 직업 · 마음, 만나는 날짜는 말하지 않고/g, ""), /\d+\s*살|직업은|연봉|회사원|의사|공무원/);
});

test("리포트 모델에는 코드가 계산한 풀이가 따로 담기고(리포트 주제와 섞이지 않는다), 오늘 날짜가 바뀌면 오늘의 한 장도 바뀐다", () => {
  const a = buildTalkModel(sampleReadingReport, { saju: SAMPLE_CHART, today: TODAY });
  const b = buildTalkModel(sampleReadingReport, { saju: SAMPLE_CHART, today: { year: 2026, month: 10, day: 16 } });
  assert.ok(!a.topics.some((t) => ["daily", "partner", "marriage"].includes(t.id)));
  assert.deepEqual(a.codeTopics.map((t) => t.id), ["daily", "partner", "marriage"]);
  assert.equal(a.dayKey, "2026-10-15");
  assert.equal(b.dayKey, "2026-10-16");
  assert.notEqual(a.codeTopics[0].basis!.computed[0], b.codeTopics[0].basis!.computed[0], "다음 날은 다른 일진이다");
  // 이웃한 날은 같은 분위기(같은 그룹)일 수 있어도 열흘 안에는 다른 분위기의 날이 나온다
  const heads = new Set([...Array(10).keys()].map((k) => buildTalkModel(sampleReadingReport, { saju: SAMPLE_CHART, today: { year: 2026, month: 10, day: 15 + k } }).codeTopics[0].headline));
  assert.ok(heads.size >= 3, `열흘 동안 나온 분위기 ${heads.size}가지`);
  assert.deepEqual(a.codeTopics.slice(1), b.codeTopics.slice(1), "날짜와 상관없는 풀이는 같다");
});

test("오늘의 한 장 무료 혜택을 끄면(DAILY_FREE) 무료 맛보기에서는 그날의 풀이 대신 질문만 보이고, 구매한 분은 그대로 본다", () => {
  const open = codeTopicsFor({ saju: SAMPLE_CHART, today: TODAY, calendar: undefined, tier: "free", dailyFree: true }).find((t) => t.id === "daily")!;
  const closed = codeTopicsFor({ saju: SAMPLE_CHART, today: TODAY, calendar: undefined, tier: "free", dailyFree: false }).find((t) => t.id === "daily")!;
  assert.equal(open.locked, undefined);
  assert.ok(open.summary.length > 0 && open.basis);
  assert.ok(closed.locked && closed.locked.hooks.length === 3 && closed.summary.length === 0 && closed.basis === null && closed.detail.length === 0);
  // 닫힌 맛보기에는 그날의 풀이 글이 새지 않는다
  const text = JSON.stringify(closed);
  for (const line of open.summary) assert.ok(!text.includes(line), "그날의 풀이 문장이 닫힌 맛보기에 있다");
  const paid = codeTopicsFor({ saju: SAMPLE_CHART, today: TODAY, calendar: cal, tier: "paid", dailyFree: false }).find((t) => t.id === "daily")!;
  assert.equal(paid.locked, undefined);
  assert.ok(paid.summary.length > 0);
});
