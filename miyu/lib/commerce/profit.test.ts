// 실행: npm test — 상품 · 보상 손익 모델(profit.ts)과 세금 계산(tax.ts): 같은 비용을 두 번 빼지 않는지, 부가세 · 소득세 구간 계산이 맞는지, 감면 시나리오가 단조로운지,
// 포인트의 기대 비용이 상한 안에 있는지, 추천 가입자 묶음의 비용이 전환율에 따라 설명되는지, 손익분기가 맞는지 확인한다.
// 이 시험은 계산 구조가 맞는지 보는 것이며, 기본 가정(전환율 · 광고비 · 고정비 · 수요 등)이 실제와 맞다는 보증이 아니고 세무 결과를 보증하지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSUMPTION_SOURCES, annualAfterTax, breakEvenBuyersPerMonth, compareAcquisition, costPerIssuedPointKrw, costPerPointUpperBoundKrw, DEFAULT_ASSUMPTIONS as A, freeUserCostKrw, netCashOfList, productJourneys, redemptionCostKrw, referralCohort, scenarioJourneys, unitEconomics, type Assumptions, type UnitLines } from "./profit.ts";
import { householdTax, incomeTaxOf, miyuIncrementalTax, simpleVatPayable, vatModeForAnnualGross, vatSplit } from "./tax.ts";

const J = Object.fromEntries(scenarioJourneys(A).map((j) => [j.id, j]));
const line = (u: UnitLines) => u.revenueKrw - u.refundAdjustKrw - u.pgFeeKrw - u.vatExpenseKrw - u.aiProductKrw - u.aiQuestionsKrw - u.freeFunnelKrw - u.earnPointCostKrw - u.signupPointCostKrw - u.creditCostKrw - u.reviewCreditCostKrw;

// ───── 세금 ─────

test("소득세: 구간별 한계세율을 쌓은 산출세액(누진공제 계산과 같다), 음수 · 0은 0", () => {
  assert.equal(incomeTaxOf(0), 0);
  assert.equal(incomeTaxOf(-5), 0);
  assert.equal(incomeTaxOf(14_000_000), 840_000);
  assert.equal(incomeTaxOf(50_000_000), 50_000_000 * 0.15 - 1_260_000);
  assert.equal(incomeTaxOf(88_000_000), 88_000_000 * 0.24 - 5_760_000);
  assert.equal(incomeTaxOf(150_000_000), 150_000_000 * 0.35 - 15_440_000);
  assert.equal(incomeTaxOf(300_000_000), 300_000_000 * 0.38 - 19_940_000);
});

test("부가세: 공급대가 → 공급가액 · 부가세, 간이과세 납부세액은 업종별 부가가치율 입력으로, 연 공급대가로 본 유형 판정", () => {
  assert.deepEqual(vatSplit(9900), { supplyKrw: 9000, vatKrw: 900 });
  assert.equal(simpleVatPayable(9900, 0.4), 396);
  assert.equal(vatModeForAnnualGross(10_000_000), "simple-exempt");
  assert.equal(vatModeForAnnualGross(60_000_000), "simple");
  assert.equal(vatModeForAnnualGross(150_000_000), "general");
});

test("감면: 감면 대상 소득(미유)의 몫만큼만 감면하고, 0 · 50 · 75% 순으로 세금이 줄며 다른 소득은 감면하지 않는다", () => {
  const base = { miyuIncomeKrw: 10_000_000, otherIncomeKrw: 0, deductionsKrw: 0 };
  const t0 = householdTax({ ...base, reductionRate: 0 });
  assert.equal(t0.incomeTaxKrw, 600_000);
  assert.equal(t0.localTaxKrw, 60_000);
  assert.equal(householdTax({ ...base, reductionRate: 0.75 }).incomeTaxKrw, 150_000);
  assert.equal(householdTax({ ...base, reductionRate: 0.5 }).incomeTaxKrw, 300_000);
  // 다른 소득이 있으면 감면 대상은 미유 몫(여기서는 1/5)뿐이다
  const mixed = householdTax({ miyuIncomeKrw: 10_000_000, otherIncomeKrw: 40_000_000, deductionsKrw: 0, reductionRate: 0.75 });
  assert.equal(mixed.reductionShare, 0.2);
  assert.equal(mixed.reductionKrw, Math.round(mixed.grossTaxKrw * 0.2 * 0.75));
  // 미유가 손실이면 감면은 없다(다른 소득에서 손실이 통산될 뿐)
  const loss = householdTax({ miyuIncomeKrw: -3_000_000, otherIncomeKrw: 40_000_000, deductionsKrw: 0, reductionRate: 0.75 });
  assert.equal(loss.reductionKrw, 0);
  // 감면 한도를 알면 상한이 걸린다
  assert.equal(householdTax({ ...base, reductionRate: 0.75, reductionCapKrw: 100_000 }).reductionKrw, 100_000);
});

test("미유가 늘린 세금 = 미유 포함 − 미유 없는 세금: 다른 소득이 있으면 구간이 올라가 더 크고, 감면이 클수록 작으며, 음수가 되지 않는다", () => {
  const i = { miyuIncomeKrw: 20_000_000, deductionsKrw: 1_500_000, reductionRate: 0 };
  const alone = miyuIncrementalTax({ ...i, otherIncomeKrw: 0 });
  const stacked = miyuIncrementalTax({ ...i, otherIncomeKrw: 40_000_000 });
  assert.equal(alone.incrementalKrw, alone.withMiyu.totalTaxKrw - alone.withoutMiyu.totalTaxKrw);
  assert.ok(stacked.incrementalKrw > alone.incrementalKrw, "다른 소득이 있으면 같은 미유 소득에 더 높은 구간이 적용된다");
  const t0 = miyuIncrementalTax({ ...i, otherIncomeKrw: 40_000_000, reductionRate: 0 }).incrementalKrw;
  const t50 = miyuIncrementalTax({ ...i, otherIncomeKrw: 40_000_000, reductionRate: 0.5 }).incrementalKrw;
  const t75 = miyuIncrementalTax({ ...i, otherIncomeKrw: 40_000_000, reductionRate: 0.75 }).incrementalKrw;
  assert.ok(t0 > t50 && t50 > t75 && t75 >= 0);
  assert.equal(miyuIncrementalTax({ ...i, miyuIncomeKrw: 0, otherIncomeKrw: 40_000_000 }).incrementalKrw, 0);
});

// ───── 구매 한 건 ─────

test("같은 비용을 두 번 빼지 않는다: 공헌이익은 수입에서 각 줄을 한 번씩 뺀 값이고(반올림 오차 안), 모든 줄이 음수가 아니다", () => {
  for (const mode of ["general", "simple", "simple-exempt"] as const) {
    const a: Assumptions = { ...A, vatMode: mode };
    for (const j of [...scenarioJourneys(a), ...productJourneys(a)]) {
      const u = unitEconomics(a, j);
      assert.ok(Math.abs(u.contributionKrw - line(u)) < 0.2, `${mode} ${j.id}: ${u.contributionKrw} vs ${line(u)}`);
      for (const [k, v] of Object.entries(u)) if (k !== "contributionKrw" && k !== "operatingKrw") assert.ok(v >= 0, `${mode} ${j.id} ${k} = ${v}`);
      assert.ok(Math.abs(u.operatingKrw - (u.contributionKrw - u.adKrw - u.fixedKrw)) < 0.2);
    }
  }
});

test("보상 줄은 해당 시나리오에만 생긴다: 정가 구매에는 추천 · 질문권이 없고, 리뷰 질문권은 F에만, 구매 적립은 적립률에 비례한다", () => {
  const a = unitEconomics(A, J.A);
  assert.equal(a.signupPointCostKrw, 0);
  assert.equal(a.creditCostKrw, 0);
  assert.equal(a.reviewCreditCostKrw, 0);
  assert.equal(unitEconomics(A, J.E).reviewCreditCostKrw, 0);
  assert.ok(unitEconomics(A, J.F).reviewCreditCostKrw > 0);
  assert.ok(unitEconomics(A, J.E).signupPointCostKrw > 0 && unitEconomics(A, J.E).creditCostKrw > 0);
  const [b, c, d] = ["B", "C", "D"].map((id) => unitEconomics(A, J[id]).earnPointCostKrw);
  assert.ok(a.earnPointCostKrw < b && b < c && c < d);
  assert.ok(Math.abs(d / a.earnPointCostKrw - 0.1 / 0.03) < 0.1, "적립 비용은 적립률에 비례");
});

test("환불은 수입만 줄이고 AI 원가는 남긴다(이미 만든 리포트): 환불률이 오르면 공헌이익이 줄고 AI 줄은 그대로", () => {
  const lo = unitEconomics({ ...A, refundRate: 0 }, J.A);
  const hi = unitEconomics({ ...A, refundRate: 0.2 }, J.A);
  assert.ok(hi.contributionKrw < lo.contributionKrw);
  assert.equal(hi.aiProductKrw, lo.aiProductKrw);
  assert.equal(hi.aiQuestionsKrw, lo.aiQuestionsKrw);
  assert.equal(lo.refundAdjustKrw, 0);
  assert.ok(Math.abs(hi.refundAdjustKrw - hi.revenueKrw * 0.2) < 0.01);
});

test("과세 유형: 일반과세는 공급가액이 수입이고 부가세 현금이 생기며, 면제는 부가세가 0이고, 간이(납부)는 납부세액이 비용이다", () => {
  const g = unitEconomics({ ...A, vatMode: "general" }, J.A);
  const e = unitEconomics({ ...A, vatMode: "simple-exempt" }, J.A);
  const s = unitEconomics({ ...A, vatMode: "simple" }, J.A);
  assert.equal(g.revenueKrw, 9000);
  assert.ok(g.vatCashKrw > 800 && g.vatCashKrw < 900, "매출세액 900에서 수수료 매입세액을 뺀 값");
  assert.equal(e.revenueKrw, 9900);
  assert.equal(e.vatCashKrw, 0);
  assert.equal(e.vatExpenseKrw, 0);
  assert.ok(s.vatExpenseKrw > 0 && s.vatCashKrw > 0);
});

// ───── 포인트 ─────

test("포인트 1P의 기대 비용은 확정 단가가 아니라 추정이다: 사용률 0이면 0, 상한(전부 사용 · 전부 잠식)이 실제 값 이상이며 1/1.2원(0.83) 아래", () => {
  assert.equal(costPerIssuedPointKrw({ ...A, pointUsageRate: 0 }), 0);
  const cpp = costPerIssuedPointKrw(A);
  const upper = costPerPointUpperBoundKrw(A);
  assert.ok(cpp > 0 && cpp <= upper);
  assert.ok(upper < A.listPriceKrw / A.reportPointPrice, "상한도 정가 환산(0.83원) 아래다 — 제공 원가 + 잃은 순현금은 정가보다 작다");
  // 상한 = (제공 원가 + 순현금) ÷ 교환 포인트
  const serve = A.aiReportCostKrw + A.aiQuestionCostKrw * A.deepFreeQuestions * A.deepQuestionUsageRate;
  assert.ok(Math.abs(upper - (serve + netCashOfList(A)) / A.reportPointPrice) < 1e-9);
  assert.equal(redemptionCostKrw({ ...A, pointCannibalization: 0 }), serve, "잠식이 없으면 제공 원가뿐이다");
});

test("H(전부 사용 · 전부 잠식) ≤ F ≤ I(사용률 낮음)의 공헌이익 순서이고 J(재작성 · 무료 상담 많음)는 F보다 낮다", () => {
  const c = (id: string) => unitEconomics(A, J[id]).contributionKrw;
  assert.ok(c("H") < c("F") && c("F") < c("I"));
  assert.ok(c("J") < c("F"));
});

// ───── 추천 가입자 ─────

test("추천 가입자 묶음: 전환 0%이면 가입자 전원의 비용만 쌓이고, 전환율이 오를수록 순손익이 늘며, 검증 통과율이 낮으면 보상 비용이 줄지만 무료 이용 원가는 남는다", () => {
  const zero = referralCohort(A, 1000, 0);
  assert.equal(zero.buyers, 0);
  assert.equal(zero.buyerContributionKrw, 0);
  const cpp = costPerIssuedPointKrw(A);
  assert.ok(Math.abs(zero.signupCostKrw - 1000 * (500 * cpp + freeUserCostKrw(A))) < 1);
  assert.equal(zero.netKrw, -zero.signupCostKrw);
  const nets = [0, 0.02, 0.05, 0.1].map((c) => referralCohort(A, 1000, c).netKrw);
  assert.ok(nets.every((v, i) => i === 0 || v > nets[i - 1]));
  const strict = referralCohort({ ...A, signupConfirmRate: 0.7 }, 1000, 0);
  assert.ok(strict.signupCostKrw < zero.signupCostKrw);
  assert.ok(strict.signupCostKrw > 1000 * freeUserCostKrw(A), "무료 이용 원가는 보상 지급과 상관없이 든다");
});

// ───── 연간 · 손익분기 ─────

test("연간 세후: 세후 = 사업이익 − 미유가 늘린 세금이고, 75% ≥ 50% ≥ 0% 순으로 세후가 많으며 다른 소득이 있으면 같은 사업이익에 세금이 더 든다", () => {
  const base = { monthlyBuyers: 300, referralShare: 0.3, deductionsKrw: 1_500_000, autoVatMode: true };
  const r0 = annualAfterTax(A, { ...base, otherIncomeKrw: 0, reductionRate: 0 });
  const r50 = annualAfterTax(A, { ...base, otherIncomeKrw: 0, reductionRate: 0.5 });
  const r75 = annualAfterTax(A, { ...base, otherIncomeKrw: 0, reductionRate: 0.75 });
  assert.equal(r0.afterTaxKrw, r0.operatingKrw - r0.incrementalTaxKrw);
  assert.ok(r75.afterTaxKrw > r50.afterTaxKrw && r50.afterTaxKrw > r0.afterTaxKrw);
  assert.equal(r0.operatingKrw, r75.operatingKrw, "감면은 사업이익을 바꾸지 않고 세금만 바꾼다");
  const stacked = annualAfterTax(A, { ...base, otherIncomeKrw: 30_000_000, reductionRate: 0 });
  assert.ok(stacked.incrementalTaxKrw > r0.incrementalTaxKrw);
  assert.equal(r0.taxReserveKrw, r0.vatCashKrw + r0.incrementalTaxKrw);
  // 감면이 0%여도 이익이 난다(기본 가정에서) — 이 값은 가정에 따라 달라진다
  assert.ok(r0.afterTaxKrw > 0);
});

test("연간: 과세 유형을 연 공급대가로 고르면 면제 · 간이 · 일반으로 나뉘고, 일반과세는 부가세 현금이 생긴다", () => {
  const mk = (monthly: number) => annualAfterTax(A, { monthlyBuyers: monthly, referralShare: 0, otherIncomeKrw: 0, deductionsKrw: 0, reductionRate: 0, autoVatMode: true });
  assert.equal(mk(100).vatMode, "simple-exempt");
  assert.equal(mk(500).vatMode, "simple");
  assert.equal(mk(1500).vatMode, "general");
  assert.ok(mk(1500).vatCashKrw > 0 && mk(100).vatCashKrw === 0);
});

test("손익분기: 고정비 ÷ (공헌이익 − 광고비)를 올림하고, 한 건이 적자이면 null", () => {
  const be = breakEvenBuyersPerMonth(A, J.A);
  assert.ok(be !== null);
  const u = unitEconomics({ ...A, fixedMonthlyKrw: 0, rentMonthlyKrw: 0 }, J.A);
  assert.equal(be, Math.ceil((A.fixedMonthlyKrw + A.rentMonthlyKrw) / (u.contributionKrw - u.adKrw)));
  assert.ok(breakEvenBuyersPerMonth({ ...A, rentMonthlyKrw: 300_000 }, J.A)! > be);
  assert.equal(breakEvenBuyersPerMonth({ ...A, aiReportCostKrw: 20_000 }, J.A), null);
});

// ───── 가정의 출처 ─────

test("모든 가정에 출처가 있고, 직접 잰 값(measured)은 AI 원가 둘뿐이며 수요 · 전환율 · 광고비 · 고정비는 가정으로 표시된다", () => {
  for (const k of Object.keys(A) as (keyof Assumptions)[]) assert.ok(ASSUMPTION_SOURCES[k]?.note.length > 5, k);
  const measured = Object.entries(ASSUMPTION_SOURCES).filter(([, v]) => v.source === "measured").map(([k]) => k).sort();
  assert.deepEqual(measured, ["aiQuestionCostKrw", "aiReportCostKrw"]);
  for (const k of ["freeToPaidRate", "referralSignupToBuyRate", "adCostPerBuyerKrw", "fixedMonthlyKrw", "monthlyBuyers", "pointUsageRate"] as const) assert.equal(ASSUMPTION_SOURCES[k].source, "assumed", k);
  assert.match(ASSUMPTION_SOURCES.aiQuestionCostKrw.note, /표본 1건/);
  assert.match(ASSUMPTION_SOURCES.aiReportCostKrw.note, /한 건도 없어/);
});

// ───── 정가 구매 vs 추천 구매(같은 기준) ─────

test("정가 vs 추천: 같은 가입자 수 · 같은 무료 이용 원가를 쓰고 광고비는 정가 유입에만, 가입 포인트는 추천 유입에만 든다", () => {
  const c = compareAcquisition(A, 1000, 0.05, 0.05);
  assert.equal(c.list.freeCostKrw, c.referral.freeCostKrw);
  assert.equal(c.list.freeCostKrw, Math.round(1000 * freeUserCostKrw(A) * 100) / 100);
  assert.equal(c.referral.adKrw, 0);
  assert.equal(c.list.signupPointKrw, 0);
  assert.ok(c.list.adKrw > 0 && c.referral.signupPointKrw > 0);
  // 같은 전환율이면 정가 구매가 더 벌고(가격이 높고 질문권 비용이 없다), 차이는 줄마다 설명된다
  assert.ok(c.list.grossPerBuyerKrw > c.referral.grossPerBuyerKrw);
});

test("추천 구매의 손익분기 전환율: 그 전환율에서 순이익이 0이고, 그보다 낮으면 적자 · 높으면 흑자", () => {
  const be = compareAcquisition(A, 10_000, 0.05, 0.05).breakEvenConvReferral;
  assert.ok(be !== null && be > 0 && be < 1);
  const at = compareAcquisition(A, 10_000, 0.05, be!);
  assert.ok(Math.abs(at.referral.netKrw) < 10_000 * 0.001 * 100, String(at.referral.netKrw));
  assert.ok(compareAcquisition(A, 10_000, 0.05, be! / 2).referral.netKrw < 0);
  assert.ok(compareAcquisition(A, 10_000, 0.05, Math.min(1, be! * 2)).referral.netKrw > 0);
  // 가입 포인트를 늘리면 손익분기 전환율이 올라간다
  assert.ok(compareAcquisition({ ...A, signupRewardPoints: 1500 }, 100, 0.05, 0.05).breakEvenConvReferral! > be!);
});

test("정가 vs 추천: 가입자 수를 0으로 넣어도 나누기 오류 없이 0을 돌려준다", () => {
  const c = compareAcquisition(A, 0, 0.05, 0.05);
  assert.equal(c.list.netPerSignupKrw, 0);
  assert.equal(c.referral.netPerSignupKrw, 0);
});
