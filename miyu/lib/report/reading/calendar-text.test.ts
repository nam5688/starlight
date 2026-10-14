// 실행: npm test — 달력 문장: 저장된 달력에 있는 달 · 단계만 쓰고, 읽는 사람 화면의 문장에는 사주 용어를 쓰지 않으며, 성별이 없으면 가까운 관계 달력을 만들지 않는다
import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import type { SajuOk } from "../../saju/engine.ts";
import { monthCalendar, monthCalendars } from "../../saju/interpret/months.ts";
import { sampleReadingReport } from "../../samples/sample-reading-report.ts";
import { JARGON, SCORE_TEXT } from "./plan.ts";
import { basisLines, calendarNotes, monthLabel, reasonLine, startsLabel, summaryLine, topicUnavailable } from "./calendar-text.ts";

const chart = (gender: "male" | "female" | null) => calculateSaju({ year: 1992, month: 3, day: 3, calendar: "solar", isLeapMonth: false, birthTime: "12:00", gender }) as SajuOk;
const PLAIN_TERMS = /충|형(?![편태])|합|일지|일간|천간|지지|원국|십신|월운|세운/;

test("달력 문장: 예시 리포트의 달력은 3년이고 한 해 요약 · 달마다의 이유가 쉬운 말이다", () => {
  const cal = sampleReadingReport.calendars;
  assert.ok(cal && cal.items.length === 3 && /^saju-month-rules-/.test(cal.ruleVersion));
  for (const c of cal.items) {
    for (const topic of ["love", "money"] as const) {
      const lines = [summaryLine(c, topic), ...c.months.map((m) => reasonLine(m, topic)), ...calendarNotes(c, topic)];
      for (const line of lines) {
        assert.doesNotMatch(line, JARGON, line);
        assert.doesNotMatch(line, SCORE_TEXT, line);
        assert.doesNotMatch(line, /점수|확률|반드시|틀림없이|만나게 돼요|헤어지게|돈이 들어와요/, line);
        assert.doesNotMatch(line, PLAIN_TERMS, line);
      }
    }
  }
});

test("달력 문장: 요약에 나오는 달은 모두 그 달력의 달이고, 큰 달이 없으면 조금 움직이는 달을 보여 준다", () => {
  for (const g of ["male", "female"] as const) {
    for (const c of monthCalendars(chart(g), { year: 2026, month: 10 })) {
      for (const topic of ["love", "money"] as const) {
        const line = summaryLine(c, topic);
        const shown = [...line.matchAll(/(\d{4}년 )?(\d{1,2})월/g)].map((m) => m[0]);
        const allowed = new Set(c.months.map((m) => monthLabel(c, m)));
        for (const s of shown) assert.ok(allowed.has(s), `${line} — ${s}`);
        const high = c.months.filter((m) => m[topic].level === "high");
        const mid = c.months.filter((m) => m[topic].level === "mid");
        if (high.length === 0 && mid.length > 0) assert.match(line, /움직임이 큰 달이 없어요\. 조금 움직이는 달은/);
        if (high.length === 0 && mid.length === 0) assert.match(line, /눈에 띄는 달이 없어요/);
      }
    }
  }
});

test("달력 문장: 입춘 기준 해의 마지막 달(1월 초)은 다음 해로 적고, 달이 절기 기준임을 보인다", () => {
  const c = monthCalendar(chart("female"), { year: 2026, gender: "female" });
  assert.equal(monthLabel(c, c.months[0]), "2월");
  assert.equal(monthLabel(c, c.months[11]), "2027년 1월");
  assert.equal(startsLabel(c.months[0]), "입춘 2.4부터");
});

test("달력 문장: 성별 정보가 없으면 가까운 관계 달력은 보여 주지 않고 이유를 밝히며, 재물 달력은 그대로 보인다", () => {
  const c = monthCalendar(chart(null), { year: 2026, gender: null });
  assert.match(topicUnavailable(c, "love") ?? "", /성별 정보가 없어/);
  assert.equal(topicUnavailable(c, "money"), null);
  assert.match(summaryLine(c, "love"), /성별 정보가 없어/);
  assert.doesNotMatch(summaryLine(c, "money"), /성별/);
  const f = monthCalendar(chart("female"), { year: 2026, gender: "female" });
  assert.equal(topicUnavailable(f, "love"), null);
});

test("달력 문장: 분석 근거에는 계산 결과(월 간지 · 이유)만 있고 달력에 없는 달은 없다", () => {
  const c = monthCalendar(chart("male"), { year: 2027, gender: "male" });
  for (const topic of ["love", "money"] as const) {
    const lines = basisLines(c, topic);
    assert.equal(lines.length, c.months.filter((m) => m[topic].tags.length > 0).length);
    for (const l of lines) assert.match(l, /^(\d{4}년 )?\d{1,2}월\([가-힣]{2}월\) — /);
  }
});
