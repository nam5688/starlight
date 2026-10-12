// 실행: npm run test:saju — 사주 엔진(manseryeok)의 독립 교차 검증. 엔진을 올리거나 바꿀 때 반드시 실행한다.
// 비교 대상 (모두 MIT, 개발용으로만 설치):
// - korean-lunar-calendar: 한국천문연구원 자료 기반 한국 음력 → 음력 날짜 · 윤달
// - lunar-javascript: 중국 만세력 라이브러리 → 일주(전 구간 같아야 함), 경계에서 먼 연주 · 월주 · 시주
// - astronomy-engine: 태양 겉보기 황경 계산 → 절입 시각
import assert from "node:assert/strict";
import { test } from "node:test";
import * as A from "astronomy-engine";
import KoreanLunarCalendar from "korean-lunar-calendar";
import lunarPkg from "lunar-javascript";
import { calculateFourPillars, getSolarTermsOfYear, lunarToSolar, solarToLunar } from "manseryeok";

const { Solar } = lunarPkg as { Solar: { fromYmdHms(...a: number[]): { getLunar(): Record<string, () => string> } } };
const HAN2KO: Record<string, string> = Object.fromEntries([
  ...[..."甲乙丙丁戊己庚辛壬癸"].map((c, i) => [c, "갑을병정무기경신임계"[i]]),
  ...[..."子丑寅卯辰巳午未申酉戌亥"].map((c, i) => [c, "자축인묘진사오미신유술해"[i]]),
]);
const ko = (s: string) => [...s].map((c) => HAN2KO[c]).join("");
const gz = (p: { heavenlyStem: string; earthlyBranch: string }) => p.heavenlyStem + p.earthlyBranch;
const FROM = 1900;
const TO = 2049;

test(`음력 변환: ${FROM}~${TO} 매일, 한국천문연구원 기반 자료와 같고 왕복 변환이 맞는다`, () => {
  const klc = new KoreanLunarCalendar();
  let checked = 0;
  for (let t = Date.UTC(FROM, 1, 1); t <= Date.UTC(TO, 11, 31); t += 86400000) {
    const d = new Date(t);
    const [y, m, dd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
    const a = solarToLunar(y, m, dd);
    klc.setSolarDate(y, m, dd);
    const b = klc.getLunarCalendar();
    assert.deepEqual([a.year, a.month, a.day, a.isLeapMonth], [b.year, b.month, b.day, b.intercalation], `${y}-${m}-${dd}`);
    assert.deepEqual(lunarToSolar(a.year, a.month, a.day, a.isLeapMonth), { year: y, month: m, day: dd });
    checked++;
  }
  assert.ok(checked > 54000);
});

test(`일주: ${FROM}~${TO} 매일 다른 만세력과 같다`, () => {
  for (let t = Date.UTC(FROM, 0, 1); t <= Date.UTC(TO, 11, 31); t += 86400000) {
    const d = new Date(t);
    const [y, m, dd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
    const ours = gz(calculateFourPillars({ year: y, month: m, day: dd, hour: 12, minute: 0 }).day);
    assert.equal(ours, ko(Solar.fromYmdHms(y, m, dd, 12, 0, 0).getLunar().getDayInGanZhi()), `${y}-${m}-${dd}`);
  }
});

test(`연주 · 월주(매달 20일) · 시주(홀수 시 30분): ${FROM}~${TO} 다른 만세력과 같다`, () => {
  for (let y = FROM; y <= TO; y++) {
    for (let m = 1; m <= 12; m++) {
      const fp = calculateFourPillars({ year: y, month: m, day: 20, hour: 12, minute: 0 });
      const lu = Solar.fromYmdHms(y, m, 20, 12, 0, 0).getLunar();
      assert.equal(gz(fp.month), ko(lu.getMonthInGanZhiExact()), `${y}-${m} 월주`);
      assert.equal(gz(fp.year), ko(lu.getYearInGanZhiExact()), `${y}-${m} 연주`);
      for (const h of [1, 7, 13, 19]) {
        const hp = calculateFourPillars({ year: y, month: m, day: 20, hour: h, minute: 30 });
        assert.equal(gz(hp.hour), ko(Solar.fromYmdHms(y, m, 20, h, 30, 0).getLunar().getTimeInGanZhi()), `${y}-${m}-20 ${h}:30`);
      }
    }
  }
});

test(`절입 시각: ${FROM}~2050 모든 절기가 천문 계산과 2분 이내`, () => {
  let max = 0;
  for (let y = FROM; y <= 2050; y++) {
    for (const st of getSolarTermsOfYear(y)) {
      const at = new Date(st.date).getTime();
      const found = A.SearchSunLongitude((285 + 15 * st.index) % 360, A.MakeTime(new Date(at - 5 * 86400000)), 10);
      assert.ok(found, `${y} ${st.name}`);
      max = Math.max(max, Math.abs(found.date.getTime() - at) / 60000);
    }
  }
  assert.ok(max < 2, `최대 차이 ${max.toFixed(2)}분`);
});

test("절기 경계: 1950~2049 모든 절(節) 직전 · 직후 2분에 월주가 바뀐다 (입춘은 연주도) — 당시 한국 시계 기준", () => {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" });
  const wall = (ms: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute };
  };
  const clock = { longitude: 135, applyEquationOfTime: false, applyHistoricalDst: true };
  for (let y = 1950; y <= 2049; y++) {
    for (const st of getSolarTermsOfYear(y).filter((t) => t.index % 2 === 0)) {
      const t = new Date(st.date).getTime();
      const before = calculateFourPillars({ ...wall(t - 120000), trueSolarTime: clock });
      const after = calculateFourPillars({ ...wall(t + 120000), trueSolarTime: clock });
      assert.notEqual(gz(before.month), gz(after.month), `${y} ${st.name} 월주`);
      assert.equal(gz(before.year) !== gz(after.year), st.index === 2, `${y} ${st.name} 연주`);
    }
  }
});
