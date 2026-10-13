// 미유 자체 성향 질문 — 운영자 의견(2026-10-13) 네 가지 정정과 문항 설계 변경을 정리한 문서(docs/assessment-design-review-2.md)를 만든다.
// 숫자는 가상 응답 점검(lib/assessment/drafts/reliability-summary.ts)에서 읽어 와서 docs/assessment-reliability-sim.md와 어긋나지 않게 한다.
// 실행: node scripts/render-assessment-design-review.ts   (miyu 폴더에서)
import { writeFileSync } from "node:fs";
import { levelOf, SIM_NA_RATE, SIM_PEOPLE, summarizeReliability, versionOf } from "../lib/assessment/drafts/reliability-summary.ts";
import { CLEAR_DISTANCE, coverage, DRAFT_ITEMS, HOLD_TEXT, MIN_INDICATORS, UNCLEAR_TEXT } from "../lib/assessment/drafts/situational-draft.ts";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const f2 = (x: number) => x.toFixed(2);
const sim = summarizeReliability();
const v1 = versionOf(sim, "v01");
const v2 = versionOf(sim, "v02");
const v3 = versionOf(sim, "v02plus");
const m1 = levelOf(v1, "보통");
const l1 = levelOf(v1, "낮음");
const h1 = levelOf(v1, "높음");
const m2 = levelOf(v2, "보통");
const m3 = levelOf(v3, "보통");
const cov = coverage();
const st1 = m1.structure;
const st2 = m2.structure;
const readable2 = m2.perspectives.filter((p) => p.indicators >= 3);
const retest2 = `${f2(Math.min(...readable2.map((p) => p.retestCorrelation)))}~${f2(Math.max(...readable2.map((p) => p.retestCorrelation)))}`;
const retest1 = `${f2(Math.min(...m1.perspectives.map((p) => p.retestCorrelation)))}~${f2(Math.max(...m1.perspectives.map((p) => p.retestCorrelation)))}`;
const top = st1.topShared[0];
const fl = (b: { people: number; flipped: number }) => pct(b.people ? b.flipped / b.people : 0);

const doc = `# 미유 성향 질문 — 문항 설계 보완 정리 (운영자 의견 네 가지 정정과 변경 내용)

- 날짜: 2026-10-13 · 대상: 초안 0.1 → 0.2 · **A안(30문항 유지)은 최종 검사 확정이 아니라 시범용**이다.
- 이 문서의 숫자는 모두 **가상 응답**(${SIM_PEOPLE.toLocaleString("ko-KR")}명, 응답 일관성과 해당 없음 ${pct(SIM_NA_RATE)}를 가정)으로 계산한 문항 구조의 한계이며, 실제 사람의 응답이 아니고 실제 신뢰도 · 정확도가 아니다. 같은 값이 \`assessment-reliability-sim.md\`에 있다 (\`node scripts/render-assessment-design-review.ts\`로 코드에서 만든다).
- 이 작업은 **시뮬레이션 숫자를 높이려고 문항을 고친 것이 아니다.** 구조의 오류(같은 응답의 중복 반영, 관점 정의의 혼동, 선택지 순서 편향)를 고쳤고, 그 결과 숫자는 좋아지지 않았다(7절).

## 0. 한 줄 결론

30문항 자체가 무조건 모자라서가 아니라, **30문항으로 너무 많은 특성(13개 관점 + 12유형)을 구분하려 한 것**이 문제였다. 지금 30문항으로 읽을 수 있는 것은 **${cov.readable.length}개 관점의 뚜렷한 방향**뿐이다. 12유형은 별도 검증 전까지 보류하고, 먼저 몇 사람이 질문을 직접 풀고 "왜 이 답을 골랐는지" 확인하는 인터뷰(\`assessment-pilot-protocol.md\`)를 한 뒤 문항을 고치고 다시 확인한다.

## 1. ① 문항 30개와 채점 지표 62개는 다르다

- 초안 0.1에서 한 선택지는 최대 2개(일부 3개) 관점에 점수를 줬다. 그래서 **문항 ${st1.items}개가 (문항, 관점) 쌍으로 ${st1.indicators}개의 지표**가 됐다 (점수를 주는 관점이 1개인 문항 ${st1.itemsByPerspectiveCount.one} · 2개 ${st1.itemsByPerspectiveCount.two} · 3개 이상 ${st1.itemsByPerspectiveCount.threePlus}).
- "관점마다 지표 4개 이상"이라는 말은 관점 하나만 볼 때는 맞다(서로 다른 문항 ${st1.minIndicators}~${Math.max(...Object.values(st1.perPerspective))}개). 그러나 **62개를 서로 독립인 근거 62개로 읽으면 같은 응답을 여러 번 센 것**이다. 문항 하나에 답한 한 번의 선택이 두 관점의 점수에 함께 들어갔다.
- 0.2는 문항마다 **주로 보는 관점 하나**만 정하고, 선택지는 그 관점에만 점수를 준다. 문항 30개 = 지표 30개다.
- 대가: 관점마다 문항이 줄어, 서로 다른 문항 ${MIN_INDICATORS}개 이상으로 읽을 수 있는 관점이 **13개에서 ${cov.readable.length}개**(${cov.readable.join(" · ")})로 줄었다. 나머지 ${cov.needMore.length}개(${cov.needMore.map((n) => `${n.id}(+${n.short})`).join(" · ")})는 문항이 모자라 **보류**한다. 0.1에서는 이 부족이 숨겨져 있었다.

## 2. ② 한 문항이 여러 관점에 주는 영향

- 0.1에서 같은 문항을 함께 쓰는 관점 쌍이 ${st1.sharedPairs}쌍이었고, 가장 많이 겹친 쌍은 ${top.a}(새로움)–${top.b}(대비) ${top.items}문항이었다. 이 두 관점은 대표 경향 12유형이 쓰는 관점이다.
- 가상 응답자의 성향은 관점끼리 독립인데도 **점수는 얽혔다**: 점수끼리 상관의 평균 ${f2(m1.crossCorrelation.meanAbs)}(절댓값), 가장 큰 쌍 ${m1.crossCorrelation.max.a}–${m1.crossCorrelation.max.b} ${f2(m1.crossCorrelation.max.r)}. 한 관점의 점수에 다른 관점의 성향이 섞인 정도는 최대 ${f2(m1.leak.max.r)}(${m1.leak.max.score} 점수 ← ${m1.leak.max.trait} 성향)였다.
- 0.2: 평균 ${f2(m2.crossCorrelation.meanAbs)}, 최대 ${f2(m2.crossCorrelation.max.r)}, 섞임 최대 ${f2(m2.leak.max.r)}. **문항 구조에서 생기는 얽힘이 사라졌다.** 이제 시범 응답에서 관점끼리 상관이 보이면, 그것은 구조 때문이 아니라 사람의 특성이거나 문항이 헷갈리기 때문이라고 읽을 수 있다.
- 새로움(T1)과 대비(T2)가 \`tendency-types-v2.md\`의 가정처럼 "반대로 움직이는 경향"인지는 이 가상 점검으로 알 수 없다. 0.1의 문항으로는 사람의 특성인지 구조인지 구분할 수 없었고, 0.2에서는 구분할 수 있지만 T2가 문항 부족으로 보류라 시범에서 보강 후보(N01)와 함께 본다.

## 3. ③ 7개 방향 전체 일치율과 실제 12유형 일치율은 다르다

0.1에서 세 가지를 따로 센 값이다 (응답 일관성 낮음 · 보통 · 높음).

| 무엇을 셌나 | 낮음 | 보통 | 높음 |
| --- | --- | --- | --- |
| 7개 관점의 위 · 아래 방향이 두 번 모두 같음 | ${pct(l1.sevenSignAllSame ?? 0)} | ${pct(m1.sevenSignAllSame ?? 0)} | ${pct(h1.sevenSignAllSame ?? 0)} |
| 12유형 분류 규칙을 그대로 적용한 결과가 두 번 모두 같음 | ${pct(l1.typeAgreement.sameGivenBothReal)} | ${pct(m1.typeAgreement.sameGivenBothReal)} | ${pct(h1.typeAgreement.sameGivenBothReal)} |
| 두 번 모두 "뚜렷"(주된 유형이 정해짐)인 사람 | ${pct(l1.typeAgreement.bothClear)} | ${pct(m1.typeAgreement.bothClear)} | ${pct(h1.typeAgreement.bothClear)} |
| 그중 주된 유형이 같은 몫 | ${pct(l1.typeAgreement.samePrimaryGivenBothClear)} | ${pct(m1.typeAgreement.samePrimaryGivenBothClear)} | ${pct(h1.typeAgreement.samePrimaryGivenBothClear)} |
| 두 유형 사이("경계")로 나오는 결과의 몫 | ${pct(l1.typeAgreement.shares.boundary)} | ${pct(m1.typeAgreement.shares.boundary)} | ${pct(h1.typeAgreement.shares.boundary)} |

- **7개 방향 전체 일치는 12유형이 같다는 뜻이 아니다.** 앞의 값은 7개 점수의 위 · 아래가 모두 같은 몫이고, 뒤의 값은 분류 규칙이 세기와 경계까지 반영해 정한 결과의 칸이 같은 몫이라 세는 대상이 다르다. 7개 방향이 대부분 맞는 것을 12유형이 맞는 것으로 읽으면 안 된다.
- 이름 하나로 요약했을 때 같은 사람이 다시 답해도 같은 이름이 나오는 비율은 응답이 보통으로 일관될 때 ${pct(m1.typeAgreement.sameGivenBothReal)}, 높게 일관돼도 ${pct(h1.typeAgreement.sameGivenBothReal)}였다.
- **0.2의 30문항으로는 7개 관점 중 3개만 읽혀 12유형 분류 자체가 불가능**하다. 보강 후보 9문항을 더한 39문항은 7개 관점이 모두 읽히지만, 7개가 모두 있어야 분류하므로 한 문항만 건너뛰어도 분류하지 못해 **분류가 나오는 응답이 ${pct(1 - m3.typeAgreement.shares.insufficient)}뿐**이다. 문항을 늘려도 12유형은 별도 검증 전까지 보류한다.

## 4. ④ "약간 · 고르게" — 문서의 모순과 정리

- 이전 문서에 두 문장이 함께 있었다. (가) "약간"과 "고르게"의 경계는 읽지 않는다 (\`assessment-reliability-sim.md\`, CLAUDE.md). (나) 리포트에는 방향과 정도(뚜렷 · 약간 · 고르게)를 쓴다 (\`assessment-design-v1.md\`의 채점표 4단계, 결과 표시). 두 문장은 서로 맞지 않는다.
- **정리: 읽는 규칙은 두 단계뿐이다.**
  1. 가운데(50)에서 ${CLEAR_DISTANCE} 이상 떨어지면 **뚜렷한 방향**(높은 쪽 · 낮은 쪽).
  2. 아니면 **"${UNCLEAR_TEXT}"**. "약간 ~한 편"처럼 방향을 억지로 붙이지 않는다.
  3. 서로 다른 문항 ${MIN_INDICATORS}개 미만으로만 볼 수 있는 관점은 **"${HOLD_TEXT}"**.
- 근거: 0.1에서 응답 일관성이 보통일 때, 첫 응답이 가운데에서 10 미만 떨어졌던 점수는 ${fl(m1.directionFlip.under10)}, 10~20 떨어졌던 점수("약간")는 ${fl(m1.directionFlip.from10to20)}, 20 이상("뚜렷")은 ${fl(m1.directionFlip.over20)}가 다시 답했을 때 위 · 아래 방향이 뒤집혔다 (읽을 수 있는 13개 관점을 합친 값). 0.2에서도 비슷하다(${fl(m2.directionFlip.under10)} · ${fl(m2.directionFlip.from10to20)} · ${fl(m2.directionFlip.over20)}). 읽을 수 있는 관점이라도 "뚜렷하지 않음"이 평균 ${pct(m2.perspectives.filter((p) => p.indicators >= 3).reduce((n, p) => n + p.unclearRate, 0) / readable2.length)}(응답 일관성 보통)라서, 이 칸을 억지로 방향으로 채우지 않는다.
- 코드: \`situational-draft.ts\`의 \`Strength = "clear" | "unclear"\`, \`UNCLEAR_TEXT\`, \`HOLD_TEXT\`. 0.1의 "약간"과 "고르게"는 가상 응답 비교에서 모두 "뚜렷하지 않음"으로 합쳐 셌다.

## 5. 이번에 바꾼 것

| 요청 | 한 일 | 확인 |
| --- | --- | --- |
| 관점 정의와 이웃 관점과의 차이 (예: "맞춤") | 13개 관점마다 **무엇이고 · 무엇이 아니고 · 이웃과 어떻게 다른지** 적었다. "맞춤"은 **상대 필요를 함께 놓는 정도(C3, 배려의 동기)**로 좁히고, 거절하기 어려워서 · 갈등이 싫어서 · 인정받고 싶어서 맞추는 것은 이 관점이 아니라고 적었다 | \`situational-draft.ts\`의 \`PERSPECTIVES\`, 테스트 |
| 문항마다 주 관점 하나 | 선택지는 주 관점에만 점수를 준다 (다른 관점은 근거가 있을 때만 — 지금은 없음) | 테스트: 선택지의 관점 수 = 1 |
| 같은 행동 · 다른 이유 분리 | 이유가 갈리는 문항(Q19 · Q20 · Q22)은 이유를 선택지에 적고, 목표 관점의 이유가 아닌 답("말을 꺼내기 어려워서 더 한다" · "거절하기 어려워서 돕는다" · "약속 때문에 확인차 연락한다")은 **점수에 넣지 않고 이유만 남긴다**. 늦게 말을 꺼내는 이유(Q24)는 이유를 기록하되 점수는 속도로만 매긴다 | 테스트: 점수에 넣지 않는 답은 이유 필수, 기여값 없음 |
| 정답처럼 보이는 선택지 | **내 초안의 결함을 검사가 잡았다:** 가장 높은 쪽 선택지가 30문항 중 22문항에서 첫 번째(a)였다 — 위치가 방향을 알려 주는 구조다. 선택지 순서를 섞어 고정했고(높은 쪽 · 낮은 쪽이 어느 글자에도 5~10번, 높음 → 낮음으로 줄 서지 않음), 높은 쪽과 낮은 쪽 선택지의 길이 균형 · 단정 표현(항상 · 절대 · 무조건 · 전혀 · 완전히)을 검사로 확인한다 | \`situational-draft.test.ts\` |
| 같은 성향을 다른 장면에서 | 문항마다 장면(일 · 친구 · 연애 · 가족 · 혼자 · 돈 · 낯선 자리)을 달았고, 두 문항 이상이 보는 관점은 서로 다른 장면에서 묻는다 | 테스트: 관점당 장면 2종 이상 |
| 불분명 · 부족한 응답 | "${UNCLEAR_TEXT}", "${HOLD_TEXT}" 두 가지로만 표현한다 | 4절 |
| 실제 사람의 이해 확인 | 풀어보기 화면의 검토 모드에 **질문을 어떻게 이해했는지 · 왜 이 답을 골랐는지 · 같은 행동을 다른 이유로도 할 수 있는지** 칸을 더했다. 인터뷰 절차를 \`assessment-pilot-protocol.md\`에 썼다 | 브라우저 확인 (390px · 1440px) |
| 모자란 관점만 보강 | 40문항으로 늘리지 않고, 읽을 수 없는 8개 관점만 채우는 **후보 9문항**을 연결하지 않은 채 써 두었다. 시범 인터뷰 결과를 보고 쓸지 정한다 | \`reinforcement-candidates.ts\`, 테스트 |
| 12유형 보류 | 화면 · 채점 · 리포트에 연결하지 않았다. 별도 검증 전까지 보류 | 3절 |

## 6. 리포트에서 쓰는 방식 (설계 — 아직 구현하지 않음)

관점 13개를 점수표로 늘어놓지 않는다. 사용자가 적은 고민(또는 선택한 주제)과 이어지는 **2~3개 관점**만 골라 아래 순서로 쓴다.

1. **상황** — 본인이 답한 실제 문항의 장면.
2. **반응** — 그 장면에서 첫 반응이 어느 쪽이었는지 (뚜렷한 방향이 있을 때만).
3. **강점과 어려움** — 그 반응이 도움이 되는 때와 부담이 되는 때 (좋고 나쁨이 아니다).
4. **작은 행동 하나.**

예(가상 인물의 응답, 연락이 늦어질 때의 장면):
> 가까운 사람의 답이 이틀째 뜸한 장면(Q22)에서 "계속 신경이 쓰여서 먼저 물어본다"를 고르셨고, 가족의 말수가 줄어든 장면(Q26)에서도 비슷하게 답하셨어요. 이 응답에서는 반응이 불확실할 때 확인으로 안심을 구하는 쪽이 뚜렷하게 나타났습니다. 이 방식은 서로의 오해를 일찍 풀어 주는 장점이 있고, 상대가 바쁠 때는 재촉처럼 느껴질 수 있는 부담도 있습니다. 한 번 물어본 뒤 답을 기다릴 시간을 미리 정해 두는 것을 작은 행동으로 해 볼 수 있어요.

- 측정하지 않은 성향(읽을 수 없는 관점)을 있는 것처럼 쓰지 않는다. "이런 사람입니다" 대신 "이 응답에서는 ~로 나타났습니다".
- 같은 행동을 다른 이유로 고른 답(점수에 넣지 않은 답)은 **본인의 응답 그대로** 보여 줄 수 있다 ("여러 상황에서 거절하기 어려워서 도왔다고 답하셨어요"). 관점으로 판정하지 않는다.
- 사주와 응답을 합산하지 않는다. 응답은 사주 해석의 초점과 생활 사례를 고르는 보조 근거다.

## 7. 숫자는 좋아지지 않았다 (좋아지게 만들지 않았다)

응답 일관성 보통에서 읽을 수 있는 관점만 비교했다.

| 버전 | 읽을 수 있는 관점 | 재응답 점수 상관 | 평균 보류 | 관점 간 상관(평균 · 최대) |
| --- | --- | --- | --- | --- |
| 0.1 | ${st1.readableByDistinctItems.length}개 | ${retest1} | ${pct(m1.perspectives.reduce((n, p) => n + p.holdRate, 0) / m1.perspectives.length)} | ${f2(m1.crossCorrelation.meanAbs)} · ${f2(m1.crossCorrelation.max.r)} |
| 0.2 | ${st2.readableByDistinctItems.length}개 | ${retest2} | ${pct(readable2.reduce((n, p) => n + p.holdRate, 0) / readable2.length)} | ${f2(m2.crossCorrelation.meanAbs)} · ${f2(m2.crossCorrelation.max.r)} |

- 재응답 점수 상관은 비슷하다. 0.2는 관점당 문항이 3개뿐이라 문항을 하나만 건너뛰어도 그 관점이 보류되어 **보류가 늘었다**(해당 없음 ${pct(SIM_NA_RATE)} 가정). 0.1의 낮은 보류는 안정적이어서가 아니라 같은 응답이 여러 관점에 중복 반영된 덕분이었다.
- 이 숫자는 모두 가상 응답의 구조 점검이다. 실제 사람이 같은 답을 같은 이유로 고르는지, 같은 사람이 2주 뒤 같게 답하는지는 시범으로만 안다.

## 8. 남은 한계와 다음 순서

1. **시범 인터뷰 (먼저).** 5~8명이 풀고 "왜 이 답을 골랐는지" 말한다 (\`assessment-pilot-protocol.md\`). 특히 Q19 · Q20 · Q22(같은 행동 · 다른 이유), Q05(새로움과 사교성), Q23 · Q25 · Q28(혼자 시간이 거부로 읽히는지)을 본다.
2. 결과로 문항을 고치고, 고친 문항만 다른 2~3명에게 다시 확인한다.
3. **모자란 관점만 보강한다** (후보 9문항 — 인터뷰 결과를 보고 쓸지 · 고칠지 정한다).
4. 고친 문항으로 **시범 응답**(수십 명)을 받아 해당 없음 비율 · 이유 선택지를 고른 비율 · 끝까지 답한 비율 · 관점 간 상관을 본다. 이어서 2주 뒤 재응답 일치.
5. 12유형은 이 과정이 끝나고 **별도로 검증하기 전에는** 화면에 연결하지 않는다.

이 정리가 하지 못하는 것: 문항이 정말 그 성향을 재는지(타당도), 같은 문장을 사람마다 다르게 읽는 정도, 같은 행동의 다른 이유가 실제로 얼마나 나뉘는지 — 모두 사람에게 물어야 안다. 현재 문항은 화면에 연결하지 않았고, 기존 개발용 예시 문항(\`dev-example\`)이 그대로 쓰이고 있다.
`;

writeFileSync(new URL("../docs/assessment-design-review-2.md", import.meta.url), doc);
console.log("docs/assessment-design-review-2.md", doc.length, "자", `· 문항 ${DRAFT_ITEMS.length}`);
