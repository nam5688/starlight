// 개인 유형 규칙(lib/assessment/personal-type.ts)의 분포 측정 — 가상의 무작위 사람(생년월일 · 시각 균등 분포 가정, 15%는 시각 모름)과 무작위 응답으로 유형이 어떻게 나오는지 센다.
// 응답은 지금 화면 22문항에 1~5를 균등하게 무작위로 고른 것이다(가정) — 실제 사람의 응답은 문항끼리 연관이 있어 이 분포와 다르다. 실제 응답 분포는 시범 응답을 받기 전에는 알 수 없다.
// 실행: node scripts/measure-personal-type.ts [사람 수] (miyu 폴더에서). 같은 씨앗이면 같은 결과다.
import { PERSONAL_TYPE_IDS } from "../lib/assessment/personal-type.ts";
import { measurePersonalType } from "./identity-measure.ts";

const N = Number(process.argv[2] ?? 20000);
const m = measurePersonalType(N);
const pct = (v: number) => `${((v / N) * 100).toFixed(1)}%`;
console.log(`## 개인 유형 분포 측정 (무작위 ${N.toLocaleString()}명, 생년 1950~2005 · 시각 균등 · 15%는 시각 모름 · 응답은 22문항 균등 무작위 — 모두 가정)`);
console.log(`- 사주 갈래 후보가 하나인 사람: ${pct(m.single)} / 같은 수로 겹쳐 후보가 둘 이상인 사람: ${pct(m.ties)}`);
console.log(`- 사주 갈래 분포: ${Object.entries(m.tilts).sort().map(([k, v]) => `${k} ${pct(v)}`).join(" · ")}`);
console.log(`- 유형이 정해진 사람: ${pct(m.typed)} / 혼합 경향: ${pct(m.mixed)} (이유: ${Object.entries(m.reasons).map(([k, v]) => `${k} ${pct(v)}`).join(" · ")})`);
console.log(`- 유형별(${PERSONAL_TYPE_IDS.length}개): ${PERSONAL_TYPE_IDS.map((id) => `${m.names[id]} ${pct(m.types[id] ?? 0)}`).join(" · ")}`);
