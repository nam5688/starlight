// 궁합 규칙(compat.ts)의 분포 측정 — 가상의 무작위 두 사람(생년월일 · 시각 균등 분포 가정)으로 총점 · 끌림 · 부딪힘 · 속도 · 커플 유형이 어떻게 나오는지 센다.
// 실행: node scripts/measure-compat.ts [쌍 수] (miyu 폴더에서). 같은 씨앗이면 같은 결과다. 이 분포는 "무작위 두 사람"의 것이며 실제 이용자 분포가 아니다(균등 분포는 가정).
import { COUPLE_TYPES, compatOf, SCORE_MEANINGS } from "../lib/saju/interpret/compat.ts";
import { calculateSaju } from "../lib/saju/manseryeok-engine.ts";
import type { SajuOk } from "../lib/saju/engine.ts";

const PAIRS = Number(process.argv[2] ?? 20000);
let seed = 20261016;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

const pool: SajuOk[] = [];
while (pool.length < 4000) {
  const year = int(1950, 2005);
  const month = int(1, 12);
  const day = int(1, 28);
  const unknown = rnd() < 0.15;
  const birthTime = unknown ? null : `${String(int(0, 23)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}`;
  const r = calculateSaju({ year, month, day, calendar: "solar", isLeapMonth: false, birthTime, gender: rnd() < 0.5 ? "male" : "female" });
  if (r.status === "ok") pool.push(r);
}

const scores: number[] = [];
const types = new Map<string, number>();
const pulls = [0, 0, 0];
const fricts = [0, 0, 0];
const paces = new Map<string, number>();
let asymmetric = 0;
for (let i = 0; i < PAIRS; i++) {
  const a = pool[int(0, pool.length - 1)];
  const b = pool[int(0, pool.length - 1)];
  const r = compatOf(a, b);
  const rr = compatOf(b, a);
  if (r.score !== rr.score || r.coupleType.id !== rr.coupleType.id) asymmetric++;
  scores.push(r.score);
  types.set(r.coupleType.id, (types.get(r.coupleType.id) ?? 0) + 1);
  pulls[r.levels.pull]++;
  fricts[r.levels.friction]++;
  paces.set(r.levels.pace, (paces.get(r.levels.pace) ?? 0) + 1);
}
scores.sort((x, y) => x - y);
const q = (p: number) => scores[Math.min(scores.length - 1, Math.floor(p * scores.length))];
const pct = (n: number) => `${((n / PAIRS) * 100).toFixed(1)}%`;

console.log(`## 궁합 규칙 분포 측정 (무작위 ${PAIRS.toLocaleString()}쌍, 사람 ${pool.length}명 풀, 생년 1950~2005 · 시각 균등 · 15%는 시각 모름)`);
console.log(`- 총점: 최소 ${scores[0]} · 5% ${q(0.05)} · 25% ${q(0.25)} · 중앙값 ${q(0.5)} · 75% ${q(0.75)} · 95% ${q(0.95)} · 최대 ${scores[scores.length - 1]}`);
console.log(`- 구간(뜻): ${SCORE_MEANINGS.map((m, i) => `${m.min}점 이상 ${pct(scores.filter((s) => s >= m.min && (i === 0 || s < SCORE_MEANINGS[i - 1].min)).length)}`).join(" · ")}`);
console.log(`- 끌림 0/1/2: ${pulls.map(pct).join(" / ")} · 부딪힘 0/1/2: ${fricts.map(pct).join(" / ")}`);
console.log(`- 속도: ${[...paces].map(([k, v]) => `${k} ${pct(v)}`).join(" · ")}`);
console.log(`- A · B 순서를 바꾼 결과가 달라진 쌍: ${asymmetric}`);
console.log(`- 커플 유형(${types.size}/${COUPLE_TYPES.length}가지가 나옴):`);
for (const t of COUPLE_TYPES) console.log(`  - ${t.name}: ${pct(types.get(t.id) ?? 0)}`);
