// 월 단위 "움직이는 달" 표시 빈도를 직접 센다 — 단계 기준이 거의 모든 달을 "큰 달"로 만들거나 한 달도 안 만들면 의미가 없기 때문이다.
// 이 수치는 해석의 정확도가 아니라 **표시 빈도**다. 가정: 출생일이 1950~2008년에 고르게 분포하고, 출생 시각은 하루에 고르게 분포하며, 성별은 반반이다 (실제 분포는 다를 수 있다).
// 실행: node scripts/measure-month-calendar.ts   (miyu 폴더에서)
import { calculateSaju } from "../lib/saju/manseryeok-engine.ts";
import type { SajuOk } from "../lib/saju/engine.ts";
import { monthCalendar, type MonthLevel } from "../lib/saju/interpret/months.ts";

const YEAR = 2026;
const STEP_DAYS = 11;
type Tally = { charts: number; cells: Record<MonthLevel, number>; withHigh: number; highPerChart: number[]; noMid: number };
const fresh = (): Tally => ({ charts: 0, cells: { high: 0, mid: 0, calm: 0 }, withHigh: 0, highPerChart: [], noMid: 0 });
const tally: Record<string, Tally> = {};
for (const k of ["love·여성", "love·남성", "love·성별 없음", "money·여성", "money·남성", "money·성별 없음"]) tally[k] = fresh();

let n = 0;
for (let t = Date.UTC(1950, 0, 3); t <= Date.UTC(2008, 11, 31); t += STEP_DAYS * 86400000, n++) {
  const d = new Date(t);
  for (const gender of ["female", "male", null] as const) {
    const minute = (n * 37) % 1440;
    const r = calculateSaju({
      year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), calendar: "solar", isLeapMonth: false,
      birthTime: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`, gender,
    });
    if (r.status !== "ok") continue;
    const cal = monthCalendar(r as SajuOk, { year: YEAR, gender });
    const g = gender === "female" ? "여성" : gender === "male" ? "남성" : "성별 없음";
    for (const topic of ["love", "money"] as const) {
      const T = tally[`${topic}·${g}`];
      T.charts++;
      let high = 0;
      let mid = 0;
      for (const m of cal.months) {
        T.cells[m[topic].level]++;
        if (m[topic].level === "high") high++;
        if (m[topic].level === "mid") mid++;
      }
      if (high > 0) T.withHigh++;
      if (mid === 0 && high === 0) T.noMid++;
      T.highPerChart.push(high);
    }
  }
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`표본: 출생일 1950~2008을 ${STEP_DAYS}일 간격(${n}개) × 성별 3가지, ${YEAR}년 달력 (출생 시각은 하루에 고르게 분포한다고 가정)`);
console.log("| 주제 · 성별 | 사주 수 | 큰 달 | 조금 움직이는 달 | 차분한 달 | 한 해에 큰 달 평균 | 큰 달이 하나라도 있는 사주 | 큰 달 최대 |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const [k, T] of Object.entries(tally)) {
  const cells = T.charts * 12;
  const mean = T.highPerChart.reduce((a, b) => a + b, 0) / T.charts;
  console.log(`| ${k} | ${T.charts} | ${pct(T.cells.high / cells)} | ${pct(T.cells.mid / cells)} | ${pct(T.cells.calm / cells)} | ${mean.toFixed(2)}개 | ${pct(T.withHigh / T.charts)} | ${Math.max(...T.highPerChart)}개 |`);
}
