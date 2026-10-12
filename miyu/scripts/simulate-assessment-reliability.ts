// 미유 자체 성향 질문 초안(30문항 · 13관점)이 가상 응답에서 얼마나 안정적으로 읽히는지 계산해 표로 낸다.
// 실제 사람의 응답이 아니라 "응답 일관성"을 가정한 시뮬레이션이다 (lib/assessment/drafts/reliability-sim.ts 설명 참고).
// 실행: node scripts/simulate-assessment-reliability.ts           — 표를 화면에 출력
//       node scripts/simulate-assessment-reliability.ts --write   — docs/assessment-reliability-sim.md를 새로 쓴다
import { writeFileSync } from "node:fs";
import { summarizeReliability, SIM_NA_RATE, SIM_PEOPLE } from "../lib/assessment/drafts/reliability-summary.ts";
import type { SimReport } from "../lib/assessment/drafts/reliability-sim.ts";
import { DRAFT_ITEMS, indicatorCounts, PERSPECTIVE_IDS } from "../lib/assessment/drafts/situational-draft.ts";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const f2 = (x: number) => x.toFixed(2);
const need = (x: number) => (Number.isFinite(x) ? String(Math.ceil(x)) : "계산 불가");
const range = (xs: number[], fmt: (x: number) => string) => `${fmt(Math.min(...xs))}~${fmt(Math.max(...xs))}`;

const s = summarizeReliability();
const counts = indicatorCounts();
const totalIndicators = PERSPECTIVE_IDS.reduce((n, p) => n + counts[p], 0);
const fewest = PERSPECTIVE_IDS.filter((p) => counts[p] === Math.min(...PERSPECTIVE_IDS.map((q) => counts[q])));

function detailTable(r: SimReport) {
  const rows = r.perspectives.map(
    (p) => `| ${p.id} ${p.name} | ${p.indicators} | ${f2(p.scoreVsTrait)} | ${f2(p.retestCorrelation)} | ${pct(p.directionAgree)} | ${pct(p.classAgree)} | ${pct(p.holdRate)} | ${pct(p.situationalRate)} | ${need(p.neededFor70)} | ${need(p.neededFor80)} |`,
  );
  return [
    "| 관점 | 지표 수 | 점수↔성향 상관 | 재응답 점수 상관 | 방향 일치 | 세 구분 일치 | 보류 | 상황 표시 | 재응답 0.7에 필요한 지표 | 0.8에 필요한 지표 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

const lvl = (name: string) => s.levels.find((l) => l.name === name)!.report;
const low = lvl("낮음");
const mid = lvl("보통");
const high = lvl("높음");
const midDir = range(mid.perspectives.map((p) => p.directionAgree), pct);
const midClass = range(mid.perspectives.map((p) => p.classAgree), pct);
const midRetest = range(mid.perspectives.map((p) => p.retestCorrelation), f2);
const lowRetest = range(low.perspectives.map((p) => p.retestCorrelation), f2);
const lowNeed70 = range(low.perspectives.map((p) => p.neededFor70), (x) => String(Math.ceil(x)));
const lowNeed80 = range(low.perspectives.map((p) => p.neededFor80), (x) => String(Math.ceil(x)));
const sit0 = s.situational[0];
const sit1 = s.situational[1];
const fewestNames = fewest.join(" · ");
const lowestOf = (r: SimReport) =>
  [...r.perspectives]
    .sort((x, y) => x.retestCorrelation - y.retestCorrelation)
    .slice(0, 3)
    .map((p) => `${p.id} ${p.name}(지표 ${p.indicators}개, ${f2(p.retestCorrelation)})`)
    .join(" · ");
const lowestLow = lowestOf(low);
const lowestMid = lowestOf(mid);
const cc = mid.crossCorrelation;

const summaryRows = s.levels
  .map((l) => {
    const r = l.report;
    return `| ${l.consistency} (${l.name}) | ${range(r.perspectives.map((p) => p.retestCorrelation), f2)} | ${range(r.perspectives.map((p) => p.directionAgree), pct)} | ${range(r.perspectives.map((p) => p.classAgree), pct)} | ${pct(r.sevenSignAll)} | ${pct(r.sevenAllSame)} |`;
  })
  .join("\n");

const naRows = s.naSensitivity.map((n) => `| ${pct(n.naRate)} | ${pct(n.meanHold)} | ${pct(n.worstHold)} |`).join("\n");
const sitRows = s.situational
  .map((c) => `| ${c.rule.spread} · ${c.rule.minEach}${c.rule.spread === 0.7 && c.rule.minEach === 1 ? " (지금 초안)" : ""} | ${pct(c.falseFlag)} | ${pct(c.worstFalseFlag)} | ${pct(c.detected)} |`)
  .join("\n");

const doc = `# 미유 성향 질문 초안 — 30문항으로 13개 관점을 어디까지 읽을 수 있나

- 상태: **가상 응답으로 계산한 한계 점검 (실제 사람의 응답이 아니다).** \`node scripts/simulate-assessment-reliability.ts --write\`로 다시 만든다. 같은 난수 씨앗이라 매번 같은 값이 나온다.
- 대상: \`lib/assessment/drafts/situational-draft.ts\`의 30문항 · 13관점 · 채점 규칙 (초안 0.1, 화면 미연결)
- 코드: \`lib/assessment/drafts/reliability-sim.ts\` · \`reliability-summary.ts\`

## 0. 먼저 알아 둘 것 — 이 숫자가 말해 주지 않는 것

- 가상 응답자 ${SIM_PEOPLE.toLocaleString("ko-KR")}명이 문항에 답한다. 각 관점의 성향은 서로 독립인 무작위 값으로 두고(실제 사람의 성향은 서로 얽혀 있을 수 있다), 선택지는 "성향에 맞을수록 고르기 쉽게 + 무작위 흔들림" 규칙으로 고른다. **얼마나 일관되게 고르는지(응답 일관성)는 가정값**이고, 낮음 · 보통 · 높음 세 가지를 모두 계산했다. 해당 없음은 ${pct(SIM_NA_RATE)}로 가정했다.
- "다시 응답"은 **같은 사람이 같은 성향으로 다시 답하되 선택의 흔들림만 다르다**고 둔 계산이다. 기억 · 기분 · 시간이 지나 달라진 상태는 들어 있지 않다. 그러므로 **실제 재응답 일치는 여기 숫자보다 낮을 가능성이 크다.**
- 따라서 이 문서는 "30문항이 정확하다"는 증거가 아니다. **"문항 구조가 허용하는 한계가 이 정도다"**를 보여 주는 것이고, 실제 신뢰도 · 타당도는 시범 응답(\`assessment-design-v1.md\` 8장)과 같은 사람의 재응답으로만 알 수 있다.
- 필요한 지표 수는 스피어만-브라운 공식(문항들이 서로 비슷하게 성향을 재고 있다는 가정)으로 계산한 대략의 값이다.

## 1. 요약 — 응답 일관성별로 본 13개 관점의 범위

| 응답 일관성(가정) | 재응답 점수 상관 (13개 관점의 범위) | 방향 일치 (방향이 나온 사람 중) | 세 구분 일치 (높음 · 고르게 · 낮음) | 7개 관점의 높음/낮음이 모두 같음 | 7개 관점의 세 구분이 모두 같음 |
| --- | --- | --- | --- | --- | --- |
${summaryRows}

- 문항 30개가 13개 관점에 주는 지표는 모두 **${totalIndicators}개** (문항 하나가 선택지에 따라 1~2개 관점에 점수를 준다). 관점당 평균 ${(totalIndicators / 13).toFixed(1)}개이고, 가장 적은 관점은 ${counts[fewest[0]]}개(${fewestNames})다.
- "7개 관점"은 대표 경향 12유형 설계가 쓰는 새로움 · 대비 · 주변 반응 · 꾸준함 · 스스로 방향 · 맞추기 · 의미(T1 · T2 · T4 · T5 · C1 · C3 · C4)다.

## 2. 읽는 법 (결론)

**읽기로 하는 것** (가상 응답에서의 계산이며 실제 재응답 일치가 아니다)
- **관점별 "어느 쪽에 가까운가" (높은 쪽 / 낮은 쪽).** 가상 응답에서 응답 일관성을 보통으로 가정하면 방향이 나온 사람의 ${midDir}가 다시 답해도 같은 방향이었다. 실제 사람의 재응답은 이보다 낮을 수 있고, 얼마인지는 시범 응답으로만 안다.
- 13개 관점을 **영역(기질 · 성격 · 관계)별로 따로** 보여 주는 지금 설계. 합쳐서 하나의 점수나 이름으로 만들지 않는다.

**읽지 않기로 하는 것**
1. **점수 숫자의 작은 차이 (예: 58과 62).** 보통일 때 재응답 점수 상관은 ${midRetest}, 일관성이 낮으면 ${lowRetest}까지 내려간다. 방향과 정도(뚜렷 · 약간 · 고르게) 수준까지만 쓴다.
2. **"약간"과 "고르게"의 경계.** 세 구분이 두 번 모두 같은 몫은 보통일 때 ${midClass}뿐이다. 경계 근처인 사람은 다시 답하면 다른 칸에 들어간다 — 그래서 경계 근처는 단정하지 않고 "비슷하게 나타난다"고 쓴다.
3. **7개 관점을 한꺼번에 묶은 유형 이름 (12유형).** 응답 일관성이 보통이면 7개 관점의 **높음/낮음이 모두 두 번 같게 나오는 사람은 ${pct(mid.sevenSignAll)}**, 높아도 ${pct(high.sevenSignAll)}다. 이름 하나로 요약하면 같은 사람이 다시 답했을 때 **다른 이름이 나올 가능성이 더 크다.** 12유형은 이 문항으로 확정하지 않고, 쓰더라도 "주된 유형 + 보조 경향"으로 두며 이름을 확정 진단처럼 쓰지 않는다 (\`tendency-types-v2.md\` 7-3의 설계와 같은 방향이다).
4. **"상황에 따라 다름" 표시.** 지금 규칙은 어느 상황에서나 같은 성향인 가상 응답자에게도 ${pct(sit0.falseFlag)}(관점에 따라 최대 ${pct(sit0.worstFalseFlag)})에 붙고, 정말 상황에 따라 달라지는 가상 응답자에게는 ${pct(sit0.detected)}에만 붙는다. **소음과 거의 구분되지 않는다.** 규칙을 엄격하게 하면(예: ${sit1.rule.spread} · ${sit1.rule.minEach}) 오탐은 ${pct(sit1.falseFlag)}로 줄지만 탐지도 ${pct(sit1.detected)}로 무너진다. 그래서 **이 표시를 사람마다 판정하는 용도로는 쓰지 않는다.** 대신 리포트는 "이 두 상황에서 다르게 답하셨어요"처럼 **본인의 문항별 응답을 그대로** 보여 주는 방식으로 상황 차이를 설명한다 (판정이 아니라 응답 인용).

## 3. 30문항으로 부족한 부분

1. **재응답이 가장 흔들리는 관점.** 응답 일관성이 낮을 때 재응답 점수 상관이 가장 낮은 세 관점은 ${lowestLow}이고, 보통일 때는 ${lowestMid}이다. 지표 수가 적다고 항상 더 흔들리는 것은 아니다 — 선택지가 그 관점에 주는 점수 폭과 방향이 문항마다 달라서이다. 이 관점들은 문항을 고쳐 쓰거나 지표를 더하는 우선순위가 된다.
2. **응답 일관성이 낮을 때** 재응답 점수 상관 0.7을 얻으려면 관점당 지표가 ${lowNeed70}개, 0.8이면 ${lowNeed80}개 필요하다 — 13개 관점 모두 지금(4~7개)보다 많다. 응답 일관성이 보통이면 0.7은 3~4개, 0.8은 4~7개 수준이라 지금 지표 수로 대체로 충분하다. **결국 30문항이 충분한지는 사람들이 얼마나 일관되게 답하느냐에 달려 있고, 그것은 시범 응답으로만 알 수 있다.**
3. **13개 관점은 30문항에 비해 많다.** 한 문항이 최대 2개 관점에 점수를 주는 구조라 문항 수는 줄였지만, 한 문항의 응답이 두 관점에 함께 영향을 준다. 가상 응답자의 성향은 관점끼리 독립인데도 **점수끼리는 평균 ${f2(cc.meanAbs)}(절댓값), 가장 큰 쌍은 ${cc.max.a}–${cc.max.b} ${f2(cc.max.r)}, 상관 0.3 이상인 쌍이 ${cc.pairs}쌍 중 ${cc.pairsAbove03}쌍**으로 나온다 (응답 일관성 보통). 이 상관은 문항 구조에서 생긴 것이므로, 시범 응답에서 이보다 큰 관점 간 상관이 보일 때만 사람의 특성으로 읽는다.${cc.max.a === "T1" && cc.max.b === "T2" ? " 특히 새로움(T1)과 대비(T2)의 상관 " + f2(cc.max.r) + "은 `tendency-types-v2.md` 7-2가 \"실제로 반대로 움직이는 경향\"이라 가정한 값(−0.4)과 비슷한 크기여서, **시범 응답에서 이 정도 상관이 나와도 사람의 특성인지 문항 구조 때문인지 구분할 수 없다.** 두 관점을 따로 재는 문항을 더하거나 둘에 함께 점수를 주는 문항을 줄여야 한다." : ""}
4. **해당 없음이 많아지면 보류가 늘어난다.** 한 관점은 응답한 지표가 3개 미만이면 판단을 보류한다.

| 해당 없음 비율(가정) | 보류되는 관점의 평균 몫 | 가장 많이 보류되는 관점 |
| --- | --- | --- |
${naRows}

## 4. 읽는 범위 — A안으로 결정 (운영자, 2026-10-12)

| 선택 | 내용 | 장점 | 단점 |
| --- | --- | --- | --- |
| **A. 30문항 유지 + 읽는 범위를 좁힘 (결정됨)** | 리포트에 관점별 방향과 정도(뚜렷 · 약간 · 고르게)만 쓴다. 12유형 이름 · 점수 숫자의 작은 차이 · 상황 표시 판정은 쓰지 않는다. 시범 응답(실제 사람) 후 결정한다. | 지금 바로 시범 가능, 문항 수 부담 없음 | 사람마다 "나는 이런 유형"이라는 짧은 이름은 줄 수 없다 |
| B. 36~40문항으로 늘림 (지금은 하지 않음) | 지표가 4개인 관점에 문항을 더해 관점당 5~6개 이상으로 맞춘다 | 방향 · 정도의 안정이 올라간다 | 응답 시간이 늘고 끝까지 답하는 사람이 줄 수 있다 |
| C. 관점을 9~10개로 줄임 (지금은 하지 않음) | 비슷한 관점(예: R1 · R3)을 합치거나 낮은 우선 관점을 뺀다 | 같은 문항 수로 관점당 지표가 늘어난다 | 설명할 수 있는 폭이 줄고 관점마다 의미가 뭉개질 수 있다 |

**결정:** A로 진행하고 시범 응답을 먼저 받는다. 기질 · 성격 · 가까운 관계 3영역은 모두 유지하고, **13관점과 12유형은 실제 시범 응답을 보고 조정한다.** 시범에서 ① 같은 사람의 재응답 일치 ② 관점 간 상관 ③ 문항별 해당 없음 비율 ④ 끝까지 답한 비율을 확인한 뒤 B · C 중 필요한 것만 한다. 12유형은 이 결과를 보기 전에 화면에 연결하지 않는다.

## 5. 이 계산이 정하지 못하는 것

- 문항의 **타당도**(이 문항이 정말 그 성향을 재는가): 가상 성향에서 출발했으므로 문항이 실제 사람의 성향과 맞는지는 알 수 없다. 사람의 검토 · 시범 응답 · 사후 설명 확인이 필요하다.
- 사람마다 **선택지를 읽는 방식이 다르다**는 것(문화 · 직업 · 연령에 따라 같은 문장이 다르게 읽힘).
- 사주와 응답의 관계: 응답은 사주를 바꾸지 않고 사주와 점수를 합산하지 않는다 — 이 점검은 응답만 다룬다.

## 6. 상세 표 (응답 일관성별)

열 설명: **점수↔성향 상관**은 점수가 가상 성향을 얼마나 따라가는지, **재응답 점수 상관**은 같은 사람이 두 번 답한 점수끼리의 상관, **방향 일치**는 두 번 모두 높음/낮음이 나온 사람 중 방향이 같은 몫, **세 구분 일치**는 높음 · 고르게 · 낮음(보류 포함)이 두 번 같은 몫, **상황 표시**는 지금 규칙으로 "상황에 따라 다름"이 붙는 몫(가상 응답자는 한결같은 성향이므로 이 숫자는 모두 소음이다).

${s.levels
  .map((l) => `### 응답 일관성 ${l.consistency} — ${l.name} (${l.note})\n\n${detailTable(l.report)}\n\n7개 관점: 세 구분이 모두 같음 ${pct(l.report.sevenAllSame)} · 6개 이상 같음 ${pct(l.report.sevenAtLeastSix)} · 높음/낮음만 봐도 모두 같음 ${pct(l.report.sevenSignAll)} · 두 번 모두 4개 이상이 뚜렷 ${pct(l.report.fourClearBoth)}`)
  .join("\n\n")}

### "상황에 따라 다름" 표시 규칙 시험 (응답 일관성 1.0)

상황에 따라 달라지는 가상 응답자는 문항마다 성향에 표준편차 1.0의 흔들림이 더해진 사람이다.

| 규칙(문항별 기여값의 흔들림 크기 · 위/아래 방향 각각 최소 개수) | 한결같은 사람에게 붙는 몫(오탐) | 관점별 최고 오탐 | 상황에 따라 달라지는 사람에게 붙는 몫 |
| --- | --- | --- | --- |
${sitRows}

---
문항 수 ${DRAFT_ITEMS.length} · 관점 ${PERSPECTIVE_IDS.length} · 지표 ${totalIndicators}.
`;

if (process.argv.includes("--write")) {
  writeFileSync(new URL("../docs/assessment-reliability-sim.md", import.meta.url), doc);
  console.log("docs/assessment-reliability-sim.md를 새로 썼습니다.");
} else {
  console.log(doc);
}
