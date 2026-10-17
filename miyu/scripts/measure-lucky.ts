// 럭키 지수(lib/saju/interpret/lucky.ts)의 분포 측정 — 가상의 무작위 사람(생년월일 · 시각 균등 분포 가정, 15%는 시각 모름)으로 하위 지수 · 총점 · 구간 · 가장 강한 포인트가 어떻게 나오는지 센다.
// 실행: node scripts/measure-lucky.ts [사람 수] (miyu 폴더에서). 같은 씨앗이면 같은 결과다. 이 분포는 "무작위 사람"의 것이며 실제 이용자 분포가 아니다(균등 분포는 가정).
import { LUCKY_BANDS, LUCKY_RULES, LUCKY_STRONGEST, LUCKY_TOTAL_BANDS } from "../lib/saju/interpret/lucky.ts";
import { measureLucky } from "./identity-measure.ts";

const N = Number(process.argv[2] ?? 20000);
const m = measureLucky(N);
const pct = (v: number) => `${((v / N) * 100).toFixed(1)}%`;
console.log(`## 럭키 지수 분포 측정 (무작위 ${N.toLocaleString()}명, 생년 1950~2005 · 시각 균등 · 15%는 시각 모름, 가정)`);
console.log(`- 구간 경계: 하위 지수 ${LUCKY_BANDS.low}점 미만 low · ${LUCKY_BANDS.high}점 이상 high · 총점 ${LUCKY_TOTAL_BANDS.low}점 미만 low · ${LUCKY_TOTAL_BANDS.high}점 이상 high · 가장 강한 포인트는 최고 ${LUCKY_STRONGEST.minScore}점 이상이고 둘째와 ${LUCKY_STRONGEST.minLead}점 이상 차이가 날 때만`);
for (const s of m.subs) console.log(`- ${LUCKY_RULES[s.id].name}: 점수표 합 최소 ${s.rawMin} · 중앙값 ${s.rawMed} · 최대 ${s.rawMax} (만점 ${LUCKY_RULES[s.id].max}) / 점수 5% ${s.q[0]} · 25% ${s.q[1]} · 중앙값 ${s.q[2]} · 75% ${s.q[3]} · 95% ${s.q[4]} / 구간 low ${pct(s.bands.low)} · mid ${pct(s.bands.mid)} · high ${pct(s.bands.high)}`);
console.log(`- 총점: 최소 ${m.total.min} · 5% ${m.total.q[0]} · 25% ${m.total.q[1]} · 중앙값 ${m.total.q[2]} · 75% ${m.total.q[3]} · 95% ${m.total.q[4]} · 최대 ${m.total.max} / 구간 low ${pct(m.total.bands.low)} · mid ${pct(m.total.bands.mid)} · high ${pct(m.total.bands.high)}`);
console.log(`- 가장 강한 포인트: ${Object.entries(m.strongest).map(([k, v]) => `${k} ${pct(v)}`).join(" · ")}`);
console.log(`- 안내(시각 모름 · 경계)가 붙은 사람: ${pct(m.caveats)}`);
console.log("- 점수표 항목이 적용된 비율:");
for (const [k, v] of Object.entries(m.itemHits).sort()) console.log(`  - ${k}: ${pct(v)}`);
