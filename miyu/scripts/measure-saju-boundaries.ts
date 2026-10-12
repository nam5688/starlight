// 태어난 시각이 "기준에 따라 사주 기둥이 달라지는 구간"에 들어갈 몫을 만세력 엔진으로 직접 센다.
// 가정: 출생 시각이 하루에 고르게 퍼져 있다 (실제 출생 시각 분포는 다를 수 있다 — 통계 자료는 확인하지 않았다).
// 날짜는 절기 경계에서 먼 날(매월 중순)을 여러 해에 걸쳐 고른다 (월주 변화가 섞이지 않게).
// 실행: node scripts/measure-saju-boundaries.ts   (miyu 폴더에서)
import { calculateSaju } from "../lib/saju/manseryeok-engine.ts";
import { SAJU_POLICY } from "../lib/saju/policy.ts";

const DATES = [
  [1991, 3, 17], [1994, 7, 18], [1997, 10, 16], [2000, 1, 18], [2003, 5, 17], [2006, 9, 17],
  [2009, 12, 16], [2012, 4, 17], [2015, 8, 17], [2018, 11, 16], [2021, 2, 17], [2024, 6, 17],
] as const;
const MINUTES = Array.from({ length: 1440 }, (_, i) => i);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

type Opt = Partial<typeof SAJU_POLICY>;
function pillars(date: readonly [number, number, number], minute: number, opt: Opt) {
  const r = calculateSaju({ calendar: "solar", isLeapMonth: false, year: date[0], month: date[1], day: date[2], birthTime: hhmm(minute) }, { ...SAJU_POLICY, ...opt });
  if (r.status !== "ok") throw new Error("사주 계산 실패");
  return Object.fromEntries(r.pillars.map((p) => [p.key, p.stem + p.branch])) as Record<string, string>;
}

/** 두 기준에서 지정한 기둥이 하나라도 다른 (날짜 · 시각) 조합의 비율 */
function share(a: Opt, b: Opt, keys: string[]) {
  let diff = 0;
  let total = 0;
  for (const d of DATES) for (const m of MINUTES) {
    const pa = pillars(d, m, a);
    const pb = pillars(d, m, b);
    if (keys.some((k) => pa[k] !== pb[k])) diff++;
    total++;
  }
  return diff / total;
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const rows: [string, string, string][] = [];
rows.push(["자시 관법: 지금 기본값(밤 11시부터 다음 날) vs 자정부터 다음 날 — 일주가 다름", pct(share({ dayBoundary: "jasi" }, { dayBoundary: "midnight" }, ["day"])), "일주"]);
rows.push(["자시 관법: 지금 기본값 vs 야자시(밤 11시~자정만 따로) — 일주 또는 시주가 다름", pct(share({ dayBoundary: "jasi" }, { dayBoundary: "splitJasi" }, ["day", "hour"])), "일주·시주"]);
rows.push(["자시 관법 세 가지 중 하나라도 다른 기둥이 있음", pct(Math.max(share({ dayBoundary: "jasi" }, { dayBoundary: "midnight" }, ["day", "hour"]), share({ dayBoundary: "jasi" }, { dayBoundary: "splitJasi" }, ["day", "hour"]), share({ dayBoundary: "splitJasi" }, { dayBoundary: "midnight" }, ["day", "hour"]))), "일주·시주"]);
const lon = { avg: 127.5, seoul: 126.98, busan: 129.07, jeju: 126.53, ulleung: 130.9, none: null as number | null };
rows.push(["지역: 기본값(평균 127.5°) vs 서울(126.98°) — 시주 · 일주가 다름", pct(share({ longitude: lon.avg }, { longitude: lon.seoul }, ["day", "hour"])), "시주·일주"]);
rows.push(["지역: 기본값 vs 부산(129.07°)", pct(share({ longitude: lon.avg }, { longitude: lon.busan }, ["day", "hour"])), "시주·일주"]);
rows.push(["지역: 서울 vs 부산", pct(share({ longitude: lon.seoul }, { longitude: lon.busan }, ["day", "hour"])), "시주·일주"]);
rows.push(["지역: 한국에서 서쪽(제주 126.53°) vs 동쪽 끝(울릉도 130.9°)", pct(share({ longitude: lon.jeju }, { longitude: lon.ulleung }, ["day", "hour"])), "시주·일주"]);
rows.push(["지역: 보정 없음(한국 표준시 그대로) vs 기본값", pct(share({ longitude: lon.none }, { longitude: lon.avg }, ["day", "hour"])), "시주·일주"]);

console.log(`표본: 날짜 ${DATES.length}일 × 하루 1,440분 = ${DATES.length * MINUTES.length}개 (출생 시각이 하루에 고르게 분포한다고 가정)`);
for (const [name, v, k] of rows) console.log(`| ${name} | ${v} | ${k} |`);
