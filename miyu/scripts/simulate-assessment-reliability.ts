// 미유 자체 성향 질문 초안이 가상 응답에서 얼마나 안정적으로 읽히는지 계산해 표로 낸다 (0.1 동결본 · 0.2 · 0.2+보강 후보를 같은 방식으로).
// 실제 사람의 응답이 아니라 "응답 일관성"을 가정한 시뮬레이션이다 (lib/assessment/drafts/reliability-sim.ts 설명 참고).
// 실행: node scripts/simulate-assessment-reliability.ts           — 표를 화면에 출력
//       node scripts/simulate-assessment-reliability.ts --write   — docs/assessment-reliability-sim.md를 새로 쓴다
import { writeFileSync } from "node:fs";
import { levelOf, SIM_NA_RATE, SIM_PEOPLE, summarizeReliability, versionOf, type VersionSummary } from "../lib/assessment/drafts/reliability-summary.ts";
import type { SimReport } from "../lib/assessment/drafts/reliability-sim.ts";
import { CLEAR_DISTANCE } from "../lib/assessment/drafts/situational-draft.ts";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const f2 = (x: number) => x.toFixed(2);
const range = (xs: number[], fmt: (x: number) => string) => {
  if (!xs.length) return "—";
  const lo = fmt(Math.min(...xs));
  const hi = fmt(Math.max(...xs));
  return lo === hi ? lo : `${lo}~${hi}`;
};
const fl = (b: { people: number; flipped: number }) => pct(b.people ? b.flipped / b.people : 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((n, v) => n + v, 0) / xs.length : 0);

const s = summarizeReliability();
const v1 = versionOf(s, "v01");
const v2 = versionOf(s, "v02");
const v3 = versionOf(s, "v02plus");
const readable = (r: SimReport) => r.perspectives.filter((p) => p.indicators >= 3);

const summaryRow = (v: VersionSummary) =>
  v.levels
    .map((l) => {
      const r = l.report;
      const rd = readable(r);
      const sign = r.sevenSignAllSame === null ? "계산 불가 (7개 중 " + r.typeAgreement.sevenReadable + "개만 읽힘)" : pct(r.sevenSignAllSame);
      const type = r.typeAgreement.computable ? `${pct(r.typeAgreement.sameGivenBothReal)} (판정 보류 ${pct(r.typeAgreement.shares.insufficient)})` : "분류 불가";
      return `| ${v.short} | ${l.consistency} (${l.name}) | ${rd.length}개 | ${range(rd.map((p) => p.retestCorrelation), f2)} | ${range(rd.map((p) => p.directionAgree), pct)} | ${pct(mean(rd.map((p) => p.holdRate)))} | ${pct(mean(rd.map((p) => p.unclearRate)))} | ${sign} | ${type} |`;
    })
    .join("\n");

function structureRow(v: VersionSummary) {
  const st = v.levels[0].report.structure;
  const c = st.itemsByPerspectiveCount;
  const top = st.topShared[0];
  return `| ${v.short} | ${st.items} | ${st.indicators} | ${c.one} / ${c.two} / ${c.threePlus} | ${st.maxPerspectivesPerItem} | ${st.sharedPairs}${top ? ` (가장 많이: ${top.a}–${top.b} ${top.items}문항)` : ""} | ${st.minIndicators} | ${st.readableByDistinctItems.length}개 |`;
}

function detailTable(r: SimReport) {
  const rows = r.perspectives.map((p) => {
    if (p.indicators < 3) return `| ${p.id} ${p.name} | ${p.indicators} | 문항이 모자라 항상 보류 | | | | | |`;
    return `| ${p.id} ${p.name} | ${p.indicators} | ${f2(p.scoreVsTrait)} | ${f2(p.retestCorrelation)} | ${pct(p.directionAgree)} | ${pct(p.readingAgree)} | ${pct(p.holdRate)} | ${pct(p.unclearRate)} |`;
  });
  return [
    "| 관점 | 문항(지표) 수 | 점수↔성향 상관 | 재응답 점수 상관 | 두 번 모두 뚜렷할 때 방향 일치 | 판독 일치 | 보류 | 뚜렷하지 않음 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

const mid1 = levelOf(v1, "보통");
const mid2 = levelOf(v2, "보통");
const mid3 = levelOf(v3, "보통");
const low1 = levelOf(v1, "낮음");
const high1 = levelOf(v1, "높음");
const rd2 = readable(mid2);
const naRows = (v: VersionSummary) => v.naSensitivity.map((n) => `| ${pct(n.naRate)} | ${pct(n.meanHold)} | ${pct(n.worstHold)} |`).join("\n");
const sitRows = (v: VersionSummary) =>
  v.situational.map((c) => `| ${c.rule.spread} · ${c.rule.minEach} | ${pct(c.falseFlag)} | ${pct(c.worstFalseFlag)} | ${pct(c.detected)} |`).join("\n");
const sit1 = v2.situational[0];
const sit2 = v2.situational[v2.situational.length - 1];
const c1 = mid1.crossCorrelation;
const c2 = mid2.crossCorrelation;
const lk1 = mid1.leak;
const lk2 = mid2.leak;
const lowest = (r: SimReport) =>
  [...readable(r)]
    .sort((x, y) => x.retestCorrelation - y.retestCorrelation)
    .slice(0, 3)
    .map((p) => `${p.id} ${p.name}(${f2(p.retestCorrelation)})`)
    .join(" · ");
const holdLine = (r: SimReport) => {
  const rd = readable(r);
  const worst = [...rd].sort((a, b) => b.holdRate - a.holdRate)[0];
  return `평균 ${pct(mean(rd.map((p) => p.holdRate)))}, 가장 많은 관점 ${worst.id} ${pct(worst.holdRate)}`;
};

const doc = `# 미유 성향 질문 초안 — 가상 응답 한계 점검 (0.1 동결본 · 0.2 · 0.2+보강 후보 비교)

- 상태: **가상 응답으로 계산한 한계 점검 (실제 사람의 응답이 아니다).** \`node scripts/simulate-assessment-reliability.ts --write\`로 다시 만든다. 같은 난수 씨앗이라 매번 같은 값이 나온다.
- 대상: 초안 0.1(\`situational-draft-v01.ts\`, 동결 · 고치지 않음) · 초안 0.2(\`situational-draft.ts\`, 현재) · 0.2에 보강 후보 9문항(\`reinforcement-candidates.ts\`)을 더한 가상의 묶음 (화면에는 어느 것도 연결하지 않았다)
- 코드: \`lib/assessment/drafts/reliability-sim.ts\` · \`reliability-summary.ts\` · \`versions.ts\`
- 정리 문서: \`docs/assessment-design-review-2.md\` (운영자 의견 네 가지 정정과 문항 설계 변경)

## 0. 먼저 알아 둘 것 — 이 숫자가 말해 주지 않는 것

- 가상 응답자 ${SIM_PEOPLE.toLocaleString("ko-KR")}명이 문항에 답한다. 각 관점의 성향은 서로 독립인 무작위 값으로 두고(실제 사람의 성향은 서로 얽혀 있을 수 있다), 선택지는 "성향에 맞을수록 고르기 쉽게 + 무작위 흔들림" 규칙으로 고른다. **얼마나 일관되게 고르는지(응답 일관성)는 가정값**이고, 낮음 · 보통 · 높음 세 가지를 모두 계산했다. 해당 없음은 ${pct(SIM_NA_RATE)}로 가정했다.
- **같은 행동의 다른 이유**(불안해서 연락한 사람 vs 약속 때문에 연락한 사람)는 이 모델에 들어 있지 않다. 0.2에서 이유를 적은 선택지(점수에 넣지 않음)는 점수 방향이 없어 가상 응답자 중 가운데 성향인 사람이 많이 고른다 — **실제로 몇 %가 그 이유를 고르는지는 가정이 아니라 시범으로 알아야 한다.** 이유 선택지를 많이 고르는 관점(C3 · R1)은 이 표에서 보류가 많이 나오지만, 실제 비율은 다를 수 있다.
- "다시 응답"은 **같은 사람이 같은 성향으로 다시 답하되 선택의 흔들림만 다르다**고 둔 계산이다. 기억 · 기분 · 시간이 지나 달라진 상태는 들어 있지 않다. 그러므로 **실제 재응답 일치는 여기 숫자보다 낮을 가능성이 크다.**
- 따라서 이 문서는 "문항이 정확하다"는 증거가 아니다. **"문항 구조가 허용하는 한계가 이 정도다"**를 보여 주는 것이고, 실제 신뢰도 · 타당도는 시범 인터뷰 · 시범 응답과 같은 사람의 재응답으로만 알 수 있다.
- 필요한 지표 수는 스피어만-브라운 공식(지표들이 서로 독립적으로 같은 성향을 잰다는 가정 — 0.1처럼 같은 문항이 여러 관점에 들어가면 이 가정이 깨진다)으로 계산한 대략의 값이다.

## 1. 문항 구조 — 문항 30개는 지표 30개가 아니었다

지표 = (문항, 점수를 받는 관점) 한 쌍. 한 선택지가 점수를 주는 관점마다 하나씩 센다.

| 버전 | 문항 | 지표 | 점수를 주는 관점이 1개 / 2개 / 3개 이상인 문항 | 한 문항의 최대 관점 수 | 같은 문항을 함께 쓰는 관점 쌍 | 관점당 최소 지표 | 서로 다른 문항 3개 이상으로 읽을 수 있는 관점 |
| --- | --- | --- | --- | --- | --- | --- | --- |
${structureRow(v1)}
${structureRow(v2)}
${structureRow(v3)}

- 0.1은 문항 30개가 지표 ${v1.levels[0].report.structure.indicators}개로 불어났다. 관점 하나만 보면 그 지표는 서로 다른 문항이므로 관점당 ${v1.levels[0].report.structure.minIndicators}~${Math.max(...Object.values(v1.levels[0].report.structure.perPerspective))}개 문항이라는 말은 맞다. 그러나 **문항 하나의 응답이 두 관점(가끔 세 관점)의 점수에 함께 들어가므로 13개 관점 점수는 서로 독립인 13개의 측정이 아니다.** 지표 ${v1.levels[0].report.structure.indicators}개를 "근거 ${v1.levels[0].report.structure.indicators}개"로 읽으면 같은 응답을 여러 번 센 것이다. 특히 12유형이 쓰는 새로움(T1)과 대비(T2)는 문항 4개를 함께 쓴다.
- 0.2는 문항마다 주된 관점 하나만 정하고 그 관점에만 점수를 준다. 문항 30개 = 지표 30개이고, 서로 다른 문항 3개 이상으로 읽을 수 있는 관점은 **13개 중 ${rd2.length}개**(${rd2.map((p) => p.id).join(" · ")})다. 나머지 8개(T2 · T3 · T4 · T5 · C2 · C3 · R3 · R4)는 문항이 모자라 **보류**한다. 모자란 수는 7개 관점이 1문항씩, R4가 2문항 — 모두 9문항이다.
- 보강 후보 9문항을 더하면 13개 관점이 모두 문항 3개가 된다. 3개는 "방향을 말할 수 있는 최소"이지 안정적으로 읽는다는 뜻이 아니다 (4절).

## 2. 요약 — 버전 × 응답 일관성

읽을 수 있는 관점(서로 다른 문항 3개 이상)만 센 범위다. "방향 일치"는 두 번 모두 뚜렷한 방향이 나온 사람 중 방향이 같은 몫이다. 판독은 **뚜렷한 높음 · 뚜렷한 낮음 · 현재 응답만으로 뚜렷하지 않음 · 보류** 네 가지이고, 0.1의 "약간"과 "고르게"는 모두 "뚜렷하지 않음"으로 합쳐 같은 방식으로 셌다 (6절).

| 버전 | 응답 일관성(가정) | 읽을 수 있는 관점 | 재응답 점수 상관 | 방향 일치 (뚜렷한 사람 중) | 평균 보류 | 평균 뚜렷하지 않음 | 7개 관점 방향이 두 번 모두 같음 | 12유형 분류 결과가 두 번 모두 같음 (결과가 나온 사람 중) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${summaryRow(v1)}
${summaryRow(v2)}
${summaryRow(v3)}

- "7개 관점"은 대표 경향 12유형 설계가 쓰는 새로움 · 대비 · 주변 반응 · 꾸준함 · 스스로 방향 · 상대 필요 · 의미(T1 · T2 · T4 · T5 · C1 · C3 · C4)다. "7개 관점 방향이 두 번 모두 같음"은 7개 점수가 모두 나온 사람 중 위 · 아래 방향이 7개 모두 같은 몫(세기는 보지 않음)이고, "12유형 분류 결과"는 \`tendency-v2.ts\`의 분류 규칙을 두 번의 응답에 그대로 적용한 결과다 (뚜렷 · 같은 주된 유형 / 경계 · 같은 묶음 / 쏠림 없음이면 같다고 센다). 괄호의 판정 보류는 7개 관점 중 하나라도 점수가 나오지 않아 분류하지 못한 응답의 몫이고, 일치율은 **두 번 모두 결과가 나온 사람만** 센 값이다 (판정 보류끼리를 일치로 세지 않았다).
- **7개 방향 전체 일치와 실제 12유형 일치는 다른 값이다.** 0.1의 응답 일관성 보통에서 7개 방향 전체 일치는 ${pct(mid1.sevenSignAllSame ?? 0)}, 12유형 분류 결과 전체 일치는 ${pct(mid1.typeAgreement.sameGivenBothReal)}(두 번 모두 결과가 나온 사람 중)다. 앞의 값은 7개 점수의 위 · 아래 방향이 모두 같은 몫이고, 뒤의 값은 분류 규칙이 세기와 경계까지 반영해 정한 결과의 칸이 같은 몫이라 세는 대상이 다르다 — 서로 바꿔 쓸 수 없고, **7개 방향이 대부분 맞는다는 것이 12유형이 맞는다는 근거가 아니다.** 어느 쪽이든 "같은 사람에게 같은 유형 이름이 나온다"는 말은 이 문항으로 할 수 없다.
- 0.1에서 두 번 모두 "뚜렷"(주된 유형이 정해짐)인 사람은 ${pct(mid1.typeAgreement.bothClear)}이고, 그중 주된 유형이 같은 몫은 ${pct(mid1.typeAgreement.samePrimaryGivenBothClear)}(응답 일관성 낮음 ${pct(low1.typeAgreement.samePrimaryGivenBothClear)} · 높음 ${pct(high1.typeAgreement.samePrimaryGivenBothClear)})다. 응답이 높게 일관돼도 경계(두 유형 사이) 결과가 ${pct(high1.typeAgreement.shares.boundary)}라 이름 하나로 요약하기 어렵다.
- 0.2의 30문항은 7개 관점 중 3개(T1 · C1 · C4)만 읽을 수 있어 **12유형 분류 자체가 불가능**하다. 보강 후보까지 더한 39문항은 7개 관점이 모두 읽히지만, 7개 관점이 모두 읽혀야 분류하므로 문항을 하나만 건너뛰어도 판정 보류가 되어 **분류가 나오는 사람이 ${pct(1 - mid3.typeAgreement.shares.insufficient)}뿐**이다 (해당 없음 ${pct(SIM_NA_RATE)} 가정). 그중 두 번 모두 실제 결과가 나온 사람 사이의 결과 일치는 ${pct(mid3.typeAgreement.sameGivenBothReal)}다. **문항을 늘려도 12유형은 별도 검증 전까지 보류한다.**

## 3. 읽는 법 (결론)

**읽기로 하는 것** (가상 응답에서의 계산이며 실제 재응답 일치가 아니다)
- **읽을 수 있는 관점에서만, 뚜렷한 방향만.** 읽을 수 있는 관점이라도 방향이 "뚜렷"하지 않은 결과가 평균 ${pct(mean(rd2.map((p) => p.unclearRate)))}(응답 일관성 보통)이고, 이때는 방향을 붙이지 않고 "현재 응답만으로 뚜렷하지 않음"으로 쓴다. 뚜렷한 방향이 나온 경우 두 번 모두 뚜렷했던 사람의 ${range(rd2.map((p) => p.directionAgree), pct)}가 같은 방향이었다.
- 영역(기질 · 성격 · 관계)별로 따로 보여 주는 지금 설계. 합쳐서 하나의 점수나 이름으로 만들지 않는다.

**읽지 않기로 하는 것**
1. **점수 숫자의 작은 차이 (예: 58과 62).** 읽을 수 있는 관점의 재응답 점수 상관이 보통에서 ${range(rd2.map((p) => p.retestCorrelation), f2)}, 낮으면 ${range(readable(levelOf(v2, "낮음")).map((p) => p.retestCorrelation), f2)}다. 방향(뚜렷한 높음 · 뚜렷한 낮음)과 "뚜렷하지 않음"만 쓴다.
2. **"약간"과 "고르게"의 구분.** 0.1은 가운데에서 10~19 떨어진 점수를 "약간", 10 미만을 "고르게"로 나눴지만, 경계 근처인 사람은 다시 답하면 다른 칸에 들어가는 일이 많아 이 구분은 읽지 않기로 했다 (**읽을 때의 규칙은 한 가지**: 가운데에서 20 이상이면 뚜렷한 방향, 아니면 "현재 응답만으로 뚜렷하지 않음", 읽을 수 없는 관점은 "문항이 부족해 판단을 보류").
3. **7개 관점을 한꺼번에 묶은 유형 이름 (12유형).** 위 2절 — 0.1의 문항으로도 같은 사람에게 같은 이름이 나오는 비율이 보통 ${pct(mid1.typeAgreement.sameGivenBothReal)}에 그쳤고, 0.2의 30문항으로는 분류 자체가 안 된다.
4. **"상황에 따라 다름" 표시.** 0.2의 30문항 묶음에서 지금 규칙은 어느 상황에서나 같은 성향인 가상 응답자에게도 ${pct(sit1.falseFlag)}(관점에 따라 최대 ${pct(sit1.worstFalseFlag)})에 붙고, 정말 상황에 따라 달라지는 가상 응답자에게는 ${pct(sit1.detected)}에 붙는다. 규칙을 엄격하게 하면(${sit2.rule.spread} · ${sit2.rule.minEach}) 오탐은 ${pct(sit2.falseFlag)}로 줄지만 탐지도 ${pct(sit2.detected)}로 무너진다. **이 표시를 사람마다 판정하는 용도로는 쓰지 않는다.** 대신 리포트는 "이 두 상황에서 다르게 답하셨어요"처럼 **본인의 문항별 응답을 그대로** 보여 주는 방식으로 상황 차이를 설명한다 (판정이 아니라 응답 인용).

## 4. 30문항으로 부족한 부분

1. **13개 관점을 읽기에는 문항이 모자란다.** 0.2는 5개 관점만 읽는다. 13개 관점을 각각 4개 이상 문항으로 읽으려면 52문항 이상이 필요하고, 관점당 3개로는 최소선일 뿐이다 (3번). 문항 수를 늘리는 것이 능사가 아니므로 **시범 인터뷰 결과를 보고 모자란 관점만 보강한다** (\`docs/assessment-pilot-protocol.md\`).
2. **읽을 수 있는 관점의 재응답 점수 상관이 가장 낮은 세 관점**은 (응답 일관성 보통) ${lowest(mid2)}이다. 다섯 관점의 차이가 작아(${range(rd2.map((p) => p.retestCorrelation), f2)}) 순위에 큰 뜻은 없고, 모두 지표가 3개뿐이라 응답 하나의 흔들림이 점수에 크게 반영된다.
3. **3문항은 한 문항만 건너뛰어도 그 관점이 보류된다.** 해당 없음 비율을 바꿔 가며 계산한 읽을 수 있는 관점의 보류율(응답 일관성 보통):

| 해당 없음 비율(가정) | 0.2 · 보류되는 관점의 평균 몫 | 0.2 · 가장 많이 보류되는 관점 |
| --- | --- | --- |
${naRows(v2)}

   0.1은 같은 문항이 여러 관점에 들어가 있어 해당 없음이 ${pct(SIM_NA_RATE)}일 때 거의 보류되지 않았다 (${holdLine(mid1)}). 그것은 안정적이어서가 아니라 **한 문항을 건너뛰어도 다른 관점의 지표가 남아 있어서**였고, 같은 응답이 여러 관점에 중복 반영된 대가다.
4. **이유 선택지를 많이 고르는 관점은 보류가 늘어난다.** C3(상대 필요를 함께 놓음)와 R1(확인하고 싶은 마음)은 "같은 행동 · 다른 이유" 선택지가 있어, 그 답을 고르면 그 문항이 점수에 들어가지 않는다. 이 값은 시범에서 실제 비율을 보고 정한다 (0절).
5. **관점끼리 점수가 얽히는 정도.** 가상 응답자의 성향은 관점끼리 독립인데도, 0.1은 점수끼리 평균 ${f2(c1.meanAbs)}(절댓값), 가장 큰 쌍이 ${c1.max.a}–${c1.max.b} ${f2(c1.max.r)}, 한 관점의 점수에 다른 관점의 성향이 섞인 정도가 최대 ${f2(lk1.max.r)}(${lk1.max.score} 점수 ← ${lk1.max.trait} 성향)였다. 0.2는 평균 ${f2(c2.meanAbs)}, 최대 ${f2(c2.max.r)}, 섞임 최대 ${f2(lk2.max.r)}로 **구조에서 생기는 얽힘이 사라졌다.** 시범 응답에서 이보다 큰 관점 간 상관이 보이면 그것은 문항 구조가 아니라 사람의 특성(또는 문항이 헷갈리는 정도)일 수 있다.

## 5. 읽는 범위 — A안은 최종 검사가 아니라 시범용 (운영자, 2026-10-12 결정 · 2026-10-13 정리)

| 선택 | 내용 | 장점 | 단점 |
| --- | --- | --- | --- |
| **A. 30문항 유지 + 읽는 범위를 좁힘 (결정됨 · 시범용)** | 리포트에 읽을 수 있는 관점의 뚜렷한 방향만 쓴다. 12유형 이름 · 점수 숫자의 작은 차이 · 상황 표시 판정은 쓰지 않는다. 시범 응답(실제 사람) 후 결정한다. | 지금 바로 시범 가능, 문항 수 부담 없음 | 13개 관점을 다 말할 수 없고(읽을 수 있는 것 5개), 짧은 유형 이름은 줄 수 없다 |
| B. 모자란 관점만 보강 (후보 9문항, 지금은 연결하지 않음) | 읽을 수 없는 8개 관점에 한해 문항을 더한다 | 읽을 수 있는 관점이 늘어난다 | 응답 시간이 늘고, 3문항은 여전히 최소선이다 |
| C. 관점을 줄임 (지금은 하지 않음) | 비슷한 관점을 합치거나 낮은 우선 관점을 뺀다 | 같은 문항 수로 관점당 지표가 늘어난다 | 설명할 수 있는 폭이 줄고 관점마다 의미가 뭉개질 수 있다 |

**순서:** ① 몇 사람이 질문을 직접 풀고 "왜 이 답을 골랐는지"를 말해 본다 (풀어보기 화면의 검토 모드에 질문을 이해한 방식 · 고른 이유 · 다른 이유 칸이 있다) → ② 결과로 문항을 고친다 → ③ 모자란 관점만 보강한다 → ④ 고친 문항으로 다시 시범 응답을 받는다. 기질 · 성격 · 가까운 관계 3영역은 유지하고, **13관점과 12유형은 시범 결과를 보고 조정한다.** 12유형은 별도로 검증되기 전까지 화면에 연결하지 않는다.

## 6. 0.1의 "약간 · 고르게"를 읽는 방법 (문서 모순 정리)

- 이전 문서에는 두 문장이 함께 있었다: (가) "약간"과 "고르게"의 경계는 읽지 않는다. (나) 리포트에는 방향과 정도(뚜렷 · 약간 · 고르게)를 쓴다. 두 문장은 서로 맞지 않는다.
- 정리: **읽는 규칙은 두 단계뿐이다.** 가운데(50)에서 ${CLEAR_DISTANCE} 이상 떨어지면 뚜렷한 높음 · 뚜렷한 낮음, 아니면 "현재 응답만으로 뚜렷하지 않음". 지표가 모자란 관점은 "문항이 부족해 판단을 보류". 점수가 가운데 근처인 사람에게 "약간 ~한 편"처럼 방향을 억지로 붙이지 않는다 — 방향이 약한 사람은 다시 답했을 때 방향이 바뀌는 일이 많기 때문이다.
- 근거: 응답 일관성 보통에서 첫 응답이 가운데에서 10 미만 떨어졌던 점수는 ${fl(mid1.directionFlip.under10)}, 10~20 떨어졌던 점수(0.1의 "약간")는 ${fl(mid1.directionFlip.from10to20)}, 20 이상("뚜렷")은 ${fl(mid1.directionFlip.over20)}가 다시 답했을 때 위 · 아래 방향이 뒤집혔다 (0.1, 읽을 수 있는 13개 관점을 합친 값. 0.2는 ${fl(mid2.directionFlip.under10)} · ${fl(mid2.directionFlip.from10to20)} · ${fl(mid2.directionFlip.over20)}).
- 이 표의 0.1 칸은 0.1의 "약간"과 "고르게"를 모두 "뚜렷하지 않음"으로 합쳐서 셌다 (같은 기준으로 0.2와 비교하기 위해서).

## 7. 이 계산이 정하지 못하는 것

- 문항의 **타당도**(이 문항이 정말 그 성향을 재는가): 가상 성향에서 출발했으므로 문항이 실제 사람의 성향과 맞는지는 알 수 없다. 사람의 검토 · 시범 인터뷰 · 시범 응답이 필요하다.
- 사람마다 **선택지를 읽는 방식이 다르다**는 것 (문화 · 직업 · 연령에 따라 같은 문장이 다르게 읽힘). 같은 행동의 다른 이유가 실제로 얼마나 나뉘는지.
- 사주와 응답의 관계: 응답은 사주를 바꾸지 않고 사주와 점수를 합산하지 않는다 — 이 점검은 응답만 다룬다.

## 8. 상세 표 (응답 일관성 보통 · 해당 없음 ${pct(SIM_NA_RATE)})

열 설명: **점수↔성향 상관**은 점수가 가상 성향을 얼마나 따라가는지, **재응답 점수 상관**은 같은 사람이 두 번 답한 점수끼리의 상관, **방향 일치**는 두 번 모두 뚜렷한 방향이 나온 사람 중 방향이 같은 몫, **판독 일치**는 뚜렷한 높음 · 뚜렷한 낮음 · 뚜렷하지 않음 · 보류가 두 번 같은 몫, **보류**와 **뚜렷하지 않음**은 응답 중 그 판독이 나온 몫이다.

### 초안 0.2 (현재, 30문항)

${detailTable(mid2)}

### 초안 0.1 (동결본, 비교용)

${detailTable(mid1)}

### 0.2 + 보강 후보 9문항 (가상의 묶음, 확정 아님)

${detailTable(mid3)}

관점이 모두 문항 3개(최소선)라 한 문항만 건너뛰어도 보류되는 것에 주의한다. 보류가 큰 C3 · R1은 이유 선택지(점수에 넣지 않음)가 있는 관점이다.

### "상황에 따라 다름" 표시 규칙 시험 (응답 일관성 1.0)

상황에 따라 달라지는 가상 응답자는 문항마다 성향에 표준편차 1.0의 흔들림이 더해진 사람이다. 점수가 나온(문항 3개 이상) 관점만 센다.

| 규칙(문항별 기여값의 흔들림 크기 · 위/아래 방향 각각 최소 개수) | 한결같은 사람에게 붙는 몫(오탐) | 관점별 최고 오탐 | 상황에 따라 달라지는 사람에게 붙는 몫 |
| --- | --- | --- | --- |
${sitRows(v2)}

---
${SIM_PEOPLE.toLocaleString("ko-KR")}명 · 해당 없음 ${pct(SIM_NA_RATE)} · 같은 난수 씨앗. 위 숫자는 모두 가정 아래의 계산이다.
`;

// 문서에 쓴 값이 같은 값을 쓰고 있는지 확인용으로 표준 출력에도 낸다
if (process.argv.includes("--write")) {
  writeFileSync(new URL("../docs/assessment-reliability-sim.md", import.meta.url), doc);
  console.log("docs/assessment-reliability-sim.md를 새로 썼습니다.");
} else {
  console.log(doc);
}
