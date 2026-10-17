// 개인 유형 · 럭키 지수 분포 측정의 공통 재료 — measure-personal-type.ts · measure-lucky.ts · render-identity-docs.ts가 같이 쓴다.
// 가정(모두 실제 이용자 분포가 아니다): 생년 1950~2005 · 월 · 일(1~28) 균등, 시각 균등이고 15%는 시각 모름, 성별 반반, 응답은 지금 화면 22문항에 1~5를 균등하게 무작위로 고른 것.
// 같은 씨앗이면 같은 결과다.
import { mbtiModule, relationshipModule, temperamentModule } from "../lib/assessment/modules/index.ts";
import { PERSONAL_TYPE_IDS, PERSONAL_TYPES, personalTypeOf, sajuTilt } from "../lib/assessment/personal-type.ts";
import { buildDevFreeSummary } from "../lib/report/build-free-summary.ts";
import type { SajuOk } from "../lib/saju/engine.ts";
import { LUCKY_SUB_IDS, luckyIndexOf } from "../lib/saju/interpret/lucky.ts";
import { calculateSaju } from "../lib/saju/manseryeok-engine.ts";

export function randomPeople(n: number, seed0: number): SajuOk[] {
  let seed = seed0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const out: SajuOk[] = [];
  while (out.length < n) {
    const unknown = rnd() < 0.15;
    const r = calculateSaju({
      year: int(1950, 2005), month: int(1, 12), day: int(1, 28), calendar: "solar", isLeapMonth: false,
      birthTime: unknown ? null : `${String(int(0, 23)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}`,
      gender: rnd() < 0.5 ? "male" : "female",
    });
    if (r.status === "ok") out.push(r);
  }
  return out;
}

const quantile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

export function measureLucky(n: number) {
  const people = randomPeople(n, 20261017);
  const raws: Record<string, number[]> = Object.fromEntries(LUCKY_SUB_IDS.map((id) => [id, []]));
  const scores: Record<string, number[]> = Object.fromEntries(LUCKY_SUB_IDS.map((id) => [id, []]));
  const bands: Record<string, Record<string, number>> = Object.fromEntries(LUCKY_SUB_IDS.map((id) => [id, { high: 0, mid: 0, low: 0 }]));
  const totals: number[] = [];
  const totalBands = { high: 0, mid: 0, low: 0 };
  const strongest: Record<string, number> = { none: 0 };
  const itemHits: Record<string, number> = {};
  let caveats = 0;
  for (const s of people) {
    const r = luckyIndexOf(s);
    totals.push(r.total);
    totalBands[r.totalBand]++;
    strongest[r.strongest?.id ?? "none"] = (strongest[r.strongest?.id ?? "none"] ?? 0) + 1;
    if (r.caveat) caveats++;
    for (const sub of r.subs) {
      raws[sub.id].push(sub.raw);
      scores[sub.id].push(sub.score);
      bands[sub.id][sub.band]++;
      for (const it of sub.items) itemHits[`${sub.id}|${it.label}`] = (itemHits[`${sub.id}|${it.label}`] ?? 0) + 1;
    }
  }
  const sortedNum = (a: number[]) => [...a].sort((x, y) => x - y);
  return {
    n,
    subs: LUCKY_SUB_IDS.map((id) => {
      const raw = sortedNum(raws[id]);
      const sc = sortedNum(scores[id]);
      return { id, rawMin: raw[0], rawMed: quantile(raw, 0.5), rawMax: raw[raw.length - 1], q: [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => quantile(sc, p)), bands: bands[id] };
    }),
    total: (() => {
      const t = sortedNum(totals);
      return { min: t[0], q: [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => quantile(t, p)), max: t[t.length - 1], bands: totalBands };
    })(),
    strongest,
    caveats,
    itemHits,
  };
}

export function measurePersonalType(n: number) {
  const people = randomPeople(n, 20261018);
  let seed = 20261019;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const itemIds = [mbtiModule, temperamentModule, relationshipModule].flatMap((m) => m.items.map((i) => i.id));
  const randomAnswers = () => Object.fromEntries(itemIds.map((id) => [id, 1 + Math.floor(rnd() * 5)]));
  const tilts: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  const types: Record<string, number> = {};
  let single = 0;
  let ties = 0;
  for (const s of people) {
    const tilt = sajuTilt(s);
    const key = tilt.candidates.length > 1 ? "겹침(후보 둘 이상)" : tilt.candidates.length ? tilt.candidates[0] : `정해지지 않음(${tilt.reason})`;
    tilts[key] = (tilts[key] ?? 0) + 1;
    if (tilt.dominant) single++;
    if (tilt.candidates.length > 1) ties++;
    const t = personalTypeOf({ saju: s, summary: buildDevFreeSummary(randomAnswers()) });
    if (t.kind === "type") types[t.info.id] = (types[t.info.id] ?? 0) + 1;
    else reasons[t.reason] = (reasons[t.reason] ?? 0) + 1;
  }
  const typed = Object.values(types).reduce((a, b) => a + b, 0);
  return { n, single, ties, tilts, typed, mixed: n - typed, reasons, types, names: Object.fromEntries(PERSONAL_TYPE_IDS.map((id) => [id, PERSONAL_TYPES[id].name])) };
}
