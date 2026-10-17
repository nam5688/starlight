// 상품 · 보상 손익 시나리오 표를 만든다(docs/profit-scenarios.md) — lib/commerce/profit.ts · tax.ts를 기본 가정으로 돌린 결과다.
// 모든 값은 관리회계 **추정**이다: 가정(measured가 아닌 값)이 대부분이며 수요 · 전환율 · 광고비 · 고정비는 근거가 없다. 실제 값을 넣으면 표가 달라진다.
// 실행: node scripts/profit-scenarios.ts [--write]  (miyu 폴더에서)
import { writeFileSync } from "node:fs";
import { ASSUMPTION_SOURCES, annualAfterTax, breakEvenBuyersPerMonth, compareAcquisition, costPerIssuedPointKrw, costPerPointUpperBoundKrw, DEFAULT_ASSUMPTIONS as A, freeUserCostKrw, netCashOfList, productJourneys, redemptionCostKrw, referralCohort, scenarioJourneys, unitEconomics, type Assumptions } from "../lib/commerce/profit.ts";

const n = (v: number) => Math.round(v).toLocaleString("ko-KR");
const d1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString("ko-KR");
const out: string[] = [];
const p = (s = "") => out.push(s);

p("# 상품 · 보상 손익 시나리오 (자동 생성 — `node scripts/profit-scenarios.ts --write`)");
p();
p("> **관리회계 추정이다. 실제 회계 · 세무 처리와 다르고 신고 확정액이 아니다.** 기본 가정의 대부분은 직접 잰 값이 아니라 가정이며(출처는 아래 1장), **수요(월 구매자) · 전환율 · 광고비 · 고정비 · 환불률은 근거가 없다.** 숫자는 \"이 가정이면 이렇게 계산된다\"는 구조 확인용이고 사업 전망이 아니다. 관리자 화면에서 실제 값으로 바꾸면 같은 코드가 다시 계산한다.");
p();
p("## 1. 입력 가정과 출처");
p();
p("| 항목 | 값 | 출처 | 근거 |");
p("| --- | --- | --- | --- |");
for (const k of Object.keys(A) as (keyof Assumptions)[]) {
  const v = A[k];
  const label = typeof v === "number" ? (v > 0 && v < 1 ? `${d1(v * 100)}%` : n(v)) : String(v);
  const s = ASSUMPTION_SOURCES[k];
  p(`| ${k} | ${label} | ${s.source === "measured" ? "측정" : s.source === "policy" ? "정책" : "**가정**"} | ${s.note} |`);
}
p();
p("## 2. 포인트 1P의 기대 비용 — 확정 회계 단가가 아니다");
p();
p(`- 정가 현금 구매 한 건의 순현금(환불 · PG 수수료 · 부가세 제외): **${n(netCashOfList(A))}원**`);
p(`- 포인트로 심층 리포트 한 건을 받을 때의 비용(제공 원가 + 잠식률 ${d1(A.pointCannibalization * 100)}% × 잃은 순현금): **${n(redemptionCostKrw(A))}원** → 11,900P 기준`);
p(`- 발행 1P의 기대 비용(사용률 ${d1(A.pointUsageRate * 100)}% 반영): **${costPerIssuedPointKrw(A).toFixed(4)}원/P**`);
p(`- 상한(발행 포인트가 전부 쓰이고 모두 현금 구매를 대신함): **${costPerPointUpperBoundKrw(A).toFixed(4)}원/P** — 1P ≈ 정가의 1/1.2(약 0.83원)와 순현금 기준 값 사이에서 이 범위로 본다.`);
p(`- 무료 이용자 한 명에게 드는 비용(무료 질문 + 맛보기, 무료 분석 · 무료 궁합은 AI 원가 없음): **${d1(freeUserCostKrw(A))}원**`);
p();
p("## 3. 구매 한 건의 손익 (A~F, 일반과세 · 기본 가정)");
p();
p("| 시나리오 | 결제금액 | 수입(공급가액) | PG | AI(리포트) | AI(무료 질문) | 무료 원가 배분 | 구매 적립 | 추천 500P | 질문권 2 | 리뷰 질문권 | **공헌이익** | 광고비 | 고정비 | **사업이익/건** |");
p("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
const js = scenarioJourneys(A);
for (const j of js.filter((x) => "ABCDEF".includes(x.id))) {
  const u = unitEconomics(A, j);
  p(`| ${j.id}. ${j.label} | ${n(u.paidKrw)} | ${n(u.revenueKrw)} | ${n(u.pgFeeKrw)} | ${n(u.aiProductKrw)} | ${n(u.aiQuestionsKrw)} | ${n(u.freeFunnelKrw)} | ${n(u.earnPointCostKrw)} | ${n(u.signupPointCostKrw)} | ${n(u.creditCostKrw)} | ${n(u.reviewCreditCostKrw)} | **${n(u.contributionKrw)}** | ${n(u.adKrw)} | ${n(u.fixedKrw)} | **${n(u.operatingKrw)}** |`);
}
p();
p("> 단위: 원, 환불률 반영. A~D는 광고로 온 정가 구매이고 E · F는 추천으로 온 첫 구매(광고비 대신 추천 보상 비용). 무료 원가 배분은 \"무료 이용자 한 명의 비용 ÷ 구매 전환율\"이라 전환율 가정에 매우 민감하다.");
p();
p("### 3-1. 다른 상품 한 건 (참고 — 질문 묶음은 확정 가안, 궁합 가격은 **가정값이며 제안이 아니다**)");
p();
p("| 상품 | 결제금액 | 수입 | PG | AI 원가 | 구매 적립 | **공헌이익** | 광고비 | **사업이익/건** |");
p("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const j of productJourneys(A)) {
  const u = unitEconomics(A, j);
  p(`| ${j.id}. ${j.label} | ${n(u.paidKrw)} | ${n(u.revenueKrw)} | ${n(u.pgFeeKrw)} | ${n(u.aiProductKrw)} | ${n(u.earnPointCostKrw)} | **${n(u.contributionKrw)}** | ${n(u.adKrw)} | **${n(u.operatingKrw)}** |`);
}
p();
p("> 질문 묶음은 AI 원가가 작아 수입 대비 공헌이익 비율은 높지만 금액이 작다. 고정비 배분은 구매 한 건당 같은 금액으로 나눴을 뿐(상품별 가치 배분이 아님)이라 작은 상품일수록 크게 느껴진다. 사주 궁합 · 리포트 궁합은 가격 · AI 원가 모두 가정값(AI 원가는 실제로 재지 않아 심층 리포트와 같다고 가정)이라 이 두 줄로 수익성을 판단하지 않는다.");
p();
p("## 4. 보상이 겹칠 때 (H · I · J — 보상이 가장 많이 쌓인 F를 흔든다)");
p();
p("| 시나리오 | 공헌이익 | 사업이익/건 | F와의 차이(공헌이익) |");
p("| --- | ---: | ---: | ---: |");
const f = unitEconomics(A, js.find((x) => x.id === "F")!);
for (const j of js.filter((x) => "FHIJ".includes(x.id))) {
  const u = unitEconomics(A, j);
  p(`| ${j.id}. ${j.label} | ${n(u.contributionKrw)} | ${n(u.operatingKrw)} | ${n(u.contributionKrw - f.contributionKrw)} |`);
}
p();
p("## 5. G — 추천 가입자가 많고 구매가 적을 때 (가입자 1,000명)");
p();
p("| 가입 → 첫 구매 전환 | 구매자 | 가입자 전원 비용(500P + 무료 이용) | 구매자 공헌이익 | **순손익** |");
p("| ---: | ---: | ---: | ---: | ---: |");
for (const conv of [0, 0.02, 0.05, 0.1, 0.2]) {
  const c = referralCohort(A, 1000, conv);
  p(`| ${d1(conv * 100)}% | ${n(c.buyers)} | ${n(c.signupCostKrw)} | ${n(c.buyerContributionKrw)} | **${n(c.netKrw)}** |`);
}
p();
p(`검증을 통과해 확정되는 가입이 70%뿐일 때(30%는 부정 · 중복으로 보상 미지급): 구매 전환 2%이면 순손익 ${n(referralCohort({ ...A, signupConfirmRate: 0.7 }, 1000, 0.02).netKrw)}원 (확정 100%일 때 ${n(referralCohort(A, 1000, 0.02).netKrw)}원). **무료 이용 원가는 보상 지급 여부와 상관없이 가입자 전원에게 든다 — 포인트 보상을 막아도 무료 이용 비용은 막지 못한다.**`);
p();
const breakEvenConv = (a: Assumptions) => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (referralCohort(a, 1000, m).netKrw < 0) lo = m;
    else hi = m;
  }
  return hi;
};
p("**추천 가입 → 첫 구매 전환율이 이 값보다 낮으면 추천 묶음은 적자다(손익분기 전환율)** — 이 값 자체가 가정에 따라 달라진다:");
p();
p("| 가정 | 손익분기 전환율 |");
p("| --- | ---: |");
p(`| 기본 가정 | ${d1(breakEvenConv(A) * 100)}% |`);
p(`| 검증 통과 70%(부정 · 중복 30% 보상 미지급) | ${d1(breakEvenConv({ ...A, signupConfirmRate: 0.7 }) * 100)}% |`);
p(`| 포인트 전부 사용 · 전부 잠식(상한) | ${d1(breakEvenConv({ ...A, pointUsageRate: 1, pointCannibalization: 1 }) * 100)}% |`);
p(`| AI 재작성 · 무료 상담 사용이 높음(J) | ${d1(breakEvenConv({ ...A, aiReportCostKrw: 1157, aiQuestionCostKrw: 51, deepQuestionUsageRate: 1, freeQuestionUsageRate: 1 }) * 100)}% |`);
p();
p("### 5-1. 정가 구매(광고 유입)와 추천 구매를 같은 기준으로 비교 (가입자 1,000명)");
p();
p(`**같은 기준**: 가입자 수 · 무료 이용 원가(가입자 전원이 진다: ${n(freeUserCostKrw(A))}원/명)는 두 유입이 같고, 광고비(구매자당 ${n(A.adCostPerBuyerKrw)}원 가정)는 정가 유입에만, 추천 가입 포인트(${A.signupRewardPoints}P) · 양쪽 질문권 비용은 추천 유입에만 든다. 구매자 한 명의 공헌이익은 무료 원가 · 가입 포인트 · 광고비를 빼기 전 값이다(정가 ${n(compareAcquisition(A, 1, 0.05, 0.05).list.grossPerBuyerKrw)}원 vs 추천 ${n(compareAcquisition(A, 1, 0.05, 0.05).referral.grossPerBuyerKrw)}원 — 추천은 가격이 ${n(A.invitePriceKrw)}원이고 질문권 ${2}개의 비용이 든다).`);
p();
p("| 비교 | 유입 | 전환율 | 구매자 | 구매자당 공헌(전) | 무료 원가 | 가입 포인트 | 광고비 | **순손익** | 가입자 1명당 |");
p("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const [label, lc, rc] of [["전환율이 같다(5% · 5%)", 0.05, 0.05], ["추천이 더 잘 산다(5% · 10%, 추천 전환율은 근거 없는 가정)", 0.05, 0.1], ["추천이 덜 산다(5% · 2%)", 0.05, 0.02]] as const) {
  const c = compareAcquisition(A, 1000, lc, rc);
  for (const r of [c.list, c.referral]) p(`| ${label} | ${r.route === "list" ? "정가" : "추천"} | ${d1(r.convRate * 100)}% | ${n(r.buyers)} | ${n(r.grossPerBuyerKrw)} | ${n(r.freeCostKrw)} | ${n(r.signupPointKrw)} | ${n(r.adKrw)} | **${n(r.netKrw)}** | ${n(r.netPerSignupKrw)} |`);
}
p();
const be = compareAcquisition(A, 1000, 0.05, 0.05).breakEvenConvReferral;
p(`추천 구매의 손익분기 전환율(가입자 한 명의 비용 ÷ 구매자 한 명의 공헌이익) = **${be === null ? "계산 불가" : d1(be * 100) + "%"}** — 이 값보다 낮으면 추천 유입은 적자다. 같은 전환율이면 정가 유입이 가입자당 더 남고(가격이 높고 질문권 비용이 없다), 추천 유입은 광고비 대신 가입 포인트가 들며 전환율이 더 높을 때만 앞선다. **이 표의 전환율 · 광고비는 모두 가정이며 실제 가입 데이터가 쌓이면 관리자 화면(/admin/benefits 손익)이 같은 계산을 측정값으로 다시 보인다.**`);
p();
p("## 6. 연간 · 세후 (일반과세 / 간이과세 시나리오, 청년창업 감면 0 · 50 · 75%)");
p();
p("정가 구매(A) 70% + 추천 구매(F) 30% 혼합. 소득세 · 지방소득세는 **미유가 늘린 몫**(미유 포함 합산세금 − 미유 없는 세금)이고 감면 대상은 미유 소득뿐이다. **75%는 확정 세율이 아니며 신규 창업 인정 · 업종 · 주소 · 청년 요건 확인 전 시나리오다.** 소득공제는 기본공제 150만원만 가정, 세액공제 · 최저한세 · 농어촌특별세 · 감면 한도는 계산하지 않았다.");
p();
for (const other of [0, 30_000_000]) {
  p(`### 슬링샵 등 다른 소득 ${n(other)}원 ${other ? "(예시 값이며 실제 슬링샵 소득이 아니다)" : "(미유 소득만)"}`);
  p();
  p("| 월 구매자 | 과세 유형(연 공급대가로 판정) | 연 공급대가 | 사업이익 | 감면 0% 세금 → 세후 | 50% 세금 → 세후 | 75% 세금 → 세후 | 세금 납부 준비액(부가세 + 소득세, 0%) |");
  p("| ---: | --- | ---: | ---: | --- | --- | --- | ---: |");
  for (const monthly of [50, 150, 300, 600]) {
    const base = { monthlyBuyers: monthly, referralShare: 0.3, otherIncomeKrw: other, deductionsKrw: 1_500_000, autoVatMode: true };
    const r0 = annualAfterTax(A, { ...base, reductionRate: 0 });
    const r50 = annualAfterTax(A, { ...base, reductionRate: 0.5 });
    const r75 = annualAfterTax(A, { ...base, reductionRate: 0.75 });
    const mode = r0.vatMode === "general" ? "일반" : r0.vatMode === "simple" ? "간이(납부)" : "간이(면제)";
    p(`| ${monthly} | ${mode} | ${n(r0.annualGrossKrw)} | ${n(r0.operatingKrw)} | ${n(r0.incrementalTaxKrw)} → **${n(r0.afterTaxKrw)}** | ${n(r50.incrementalTaxKrw)} → **${n(r50.afterTaxKrw)}** | ${n(r75.incrementalTaxKrw)} → **${n(r75.afterTaxKrw)}** | ${n(r0.taxReserveKrw)} |`);
  }
  p();
}
p("### 6-1. 과세 유형을 일반과세로 둘 때(간이과세가 배제되는 업종이거나 간이과세를 포기하는 경우의 참고, 다른 소득 0원 · 감면 0%)");
p();
p("| 월 구매자 | 간이(자동 판정) 사업이익 | 일반과세 사업이익 | 일반과세 부가세 납부(현금) | 일반과세 세후 이익 |");
p("| ---: | ---: | ---: | ---: | ---: |");
for (const monthly of [150, 300, 600]) {
  const base = { monthlyBuyers: monthly, referralShare: 0.3, otherIncomeKrw: 0, deductionsKrw: 1_500_000, reductionRate: 0 };
  const auto = annualAfterTax(A, { ...base, autoVatMode: true });
  const gen = annualAfterTax({ ...A, vatMode: "general" }, { ...base, autoVatMode: false });
  p(`| ${monthly} | ${n(auto.operatingKrw)} | ${n(gen.operatingKrw)} | ${n(gen.vatCashKrw)} | **${n(gen.afterTaxKrw)}** |`);
}
p();
p("> 일반과세는 부가세(매출세액 − 공제 가능한 매입세액)를 나라에 내므로 **현금으로 따로 모아 둘 돈**이다(손익에는 들어가지 않는다). 해외 AI 비용의 매입세액은 공제되지 않는다고 가정했다(세무사 확인).");
p();
p("## 7. 월 손익분기 구매자 수 (고정비 100,000원, 임대료 0원 / 300,000원)");
p();
p("| 시나리오 | 임대료 0원 | 임대료 300,000원 |");
p("| --- | ---: | ---: |");
for (const j of js.filter((x) => "AEF".includes(x.id))) {
  const a = breakEvenBuyersPerMonth(A, j);
  const b = breakEvenBuyersPerMonth({ ...A, rentMonthlyKrw: 300_000 }, j);
  p(`| ${j.id}. ${j.label} | ${a === null ? "구매 한 건이 적자" : `월 ${n(a)}명`} | ${b === null ? "구매 한 건이 적자" : `월 ${n(b)}명`} |`);
}
p();
p("## 8. 읽는 법과 한계");
p();
p("- 이 표는 **구조 확인용**이다. 어떤 시나리오가 \"남는다\"는 말은 위 가정이 맞을 때만 성립하며, 가정 가운데 직접 잰 값은 AI 원가(리포트 5건 · 질문 1건)뿐이다.");
p("- 가장 민감한 가정: ① 무료 → 구매 전환율(무료 원가 배분) ② 추천 가입 → 구매 전환율(추천 500P · 무료 원가 배분) ③ 월 구매자 수(고정비 배분 · 과세 유형) ④ 포인트 사용률 · 잠식률 ⑤ 광고비. 모두 측정 전이다.");
p("- 과세 유형(일반 / 간이 / 면제)은 연 공급대가 기준(가정 값 1억 400만원 미만 간이, 4,800만원 미만 납부 면제)으로 나눴을 뿐 업종 배제 · 개업 연도 환산 · 간이과세 포기 가능성을 반영하지 않았다 — 세무사 확인.");
p("- 소득세 세율표 · 공제 · 지방소득세 10% · 감면 비례 계산식은 가정이다. 최저한세 · 농어촌특별세 · 감면 한도 · 5년 감면기간 · 사후관리는 계산하지 않았다.");
p("- 같은 비용을 두 번 빼지 않는다(시험이 확인). 부가세는 일반과세에서 수입에서 빼고(공급가액) 간이과세에서는 납부세액을 비용으로 넣는다.");
const text = out.join("\n") + "\n";
if (process.argv.includes("--write")) {
  writeFileSync(new URL("../docs/profit-scenarios.md", import.meta.url), text);
  console.log("docs/profit-scenarios.md를 만들었습니다.");
} else console.log(text);
