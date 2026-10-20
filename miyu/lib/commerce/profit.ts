// 상품 · 보상 손익 모델 — 순수 계산(React · Next · 외부 SDK 없음). 관리자 수익 대시보드의 계산 구조이자 보상 설계의 "남는지" 확인용 **관리회계 추정**이다.
//
// 이 파일이 하는 것
// - 구매 한 건(여정)의 손익을 한 줄씩 나눠 계산한다: 결제금액 → 부가세 구분 → PG 수수료 → AI 원가(리포트 · 질문) → 무료 이용 원가 배분 → 보상 비용(구매 적립 · 추천 가입 포인트 · 질문권 · 리뷰) → 공헌이익 → 광고비 → 고정비 → 사업이익.
// - 연간으로 합쳐 소득세 · 지방소득세를 더해(tax.ts) 세후 이익과 손익분기를 본다.
//
// 지키는 것
// - **포인트 1P를 1원 · 1/1.2원으로 확정 회계 처리하지 않는다.** 한 포인트의 비용은 (사용률) × (사용처 상품의 실제 제공 원가 + 잠식률 × 잃은 현금 매출) ÷ 교환 포인트로 추정하고,
//   "전부 사용 · 전부 잠식"(상한)과 "사용률 낮음"을 같은 식에서 입력만 바꿔 본다. 회계 · 세무 처리는 이 추정과 따로 정해야 한다(세무사 확인).
// - 질문 1회 원가를 임의의 30원으로 고정하지 않는다. 기본값은 실제로 잰 한 건(입력 2,983 · 출력 455토큰, 약 17원)이고, 실제 사용량이 쌓이면 `ai_usage` 집계로 바꾼다.
// - 같은 비용을 두 번 빼지 않는다: 각 비용은 한 줄에만 들어가고 `contribution`은 줄의 합으로만 만든다(시험이 확인한다).
// - 아래 기본값(`DEFAULT_ASSUMPTIONS`)은 `measured`(직접 잰 값) · `contract`(계약 · 정책으로 정해진 값) · `assumed`(가정)로 출처를 표시한다. **가정이 대부분이며 수요 · 전환율 · 광고비 · 고정비는 근거가 없다** — 관리자가 실제 값으로 바꿔야 의미가 있다.
import { incomeTaxOf, miyuIncrementalTax, simpleVatPayable, vatModeForAnnualGross, vatSplit, type VatMode } from "./tax.ts";

export type Source = "measured" | "policy" | "assumed";

export type Assumptions = {
  // ── 가격 (부가세 포함, 원)
  listPriceKrw: number;
  invitePriceKrw: number;
  questionPackPriceKrw: number;
  /** 사주 궁합 · 리포트 궁합 — 가격 미정이라 관리자 가정값 */
  sajuCompatPriceKrw: number;
  reportCompatPriceKrw: number;
  // ── 과세
  vatMode: VatMode;
  /** 간이과세 부가가치율 — 업종코드가 정해져야 안다(15~40% 범위) */
  simpleValueAddedRate: number;
  // ── 결제 · 환불
  /** PG 수수료율(결제금액 대비, 수수료의 부가세 포함으로 가정) — 토스페이먼츠 계약 전이라 모른다 */
  pgFeeRate: number;
  refundRate: number;
  // ── AI 원가 (원)
  /** 심층 리포트 한 건(재작성 포함) */
  aiReportCostKrw: number;
  /** 사주 궁합 · 리포트 궁합 한 건 — 실제로 재지 못해 심층 리포트와 같다고 가정 */
  aiCompatCostKrw: number;
  /** 질문 1회 */
  aiQuestionCostKrw: number;
  // ── 무료 이용
  /** 심층 리포트 회원의 방당 무료 질문 수 × 방 수 (CHAT_ROOMS: 방 8개 × 3) */
  deepFreeQuestions: number;
  deepQuestionUsageRate: number;
  /** 무료 리포트 회원의 무료 질문 수(연애 2 + 고민 2 + 오늘 1) */
  freeRoomQuestions: number;
  freeQuestionUsageRate: number;
  /** 맛보기 리포트(AI 한 번)의 원가와 이용 비율 */
  tasteReportCostKrw: number;
  tasteReportShare: number;
  /** 무료 이용자 중 심층 리포트를 사는 비율 — 근거 없음(측정 필요) */
  freeToPaidRate: number;
  // ── 포인트(MP)
  /** 심층 리포트의 포인트 교환가(정가 9,900원 × 약 1.2) */
  reportPointPrice: number;
  /** 발행 포인트 중 쓰이는 비율 */
  pointUsageRate: number;
  /** 포인트로 산 상품 중 포인트가 없었다면 현금으로 샀을 비율(잠식) */
  pointCannibalization: number;
  // ── 추천 · 리뷰
  signupRewardPoints: number;
  /** 추천으로 가입한 사람 중 첫 심층 리포트를 사는 비율 — 근거 없음(측정 필요) */
  referralSignupToBuyRate: number;
  /** 추천 가입 보상 중 검증을 통과해 확정되는 비율 */
  signupConfirmRate: number;
  /** 지급된 질문권 중 실제로 쓰이는 비율 */
  creditUsageRate: number;
  /** 구매자 중 리뷰를 쓰는 비율 */
  reviewRate: number;
  // ── 광고 · 고정비
  adCostPerBuyerKrw: number;
  fixedMonthlyKrw: number;
  rentMonthlyKrw: number;
  monthlyBuyers: number;
};

/** 기본 가정 — 출처를 값마다 적는다. measured 외에는 근거가 없거나 가정이다 */
export const DEFAULT_ASSUMPTIONS: Assumptions = {
  listPriceKrw: 9900,
  invitePriceKrw: 6900,
  questionPackPriceKrw: 2500,
  sajuCompatPriceKrw: 8900,
  reportCompatPriceKrw: 15900,
  vatMode: "general",
  simpleValueAddedRate: 0.4,
  pgFeeRate: 0.033,
  refundRate: 0.05,
  aiReportCostKrw: 370,
  aiCompatCostKrw: 370,
  aiQuestionCostKrw: 17,
  deepFreeQuestions: 24,
  deepQuestionUsageRate: 0.25,
  freeRoomQuestions: 5,
  freeQuestionUsageRate: 0.3,
  tasteReportCostKrw: 42,
  tasteReportShare: 0.5,
  freeToPaidRate: 0.05,
  reportPointPrice: 11_900,
  pointUsageRate: 0.5,
  pointCannibalization: 0.5,
  signupRewardPoints: 500,
  referralSignupToBuyRate: 0.1,
  signupConfirmRate: 1,
  creditUsageRate: 0.7,
  reviewRate: 0.2,
  adCostPerBuyerKrw: 2500,
  fixedMonthlyKrw: 100_000,
  rentMonthlyKrw: 0,
  monthlyBuyers: 150,
};

/** 값마다의 출처와 근거 — 문서 · 관리자 화면이 같이 보여 준다 */
export const ASSUMPTION_SOURCES: Record<keyof Assumptions, { source: Source; note: string }> = {
  listPriceKrw: { source: "policy", note: "정가(운영자 확정)" },
  invitePriceKrw: { source: "policy", note: "추천받은 친구의 첫 구매 가격(운영자 확정 2026-10-17, 기존 5,900원 대체)" },
  questionPackPriceKrw: { source: "policy", note: "질문 3개 묶음(운영자 확정, 가안)" },
  sajuCompatPriceKrw: { source: "policy", note: "운영자 확정 2026-10-20 — 8,900원(lib/config/product.ts의 SAJU_COMPAT)" },
  reportCompatPriceKrw: { source: "policy", note: "운영자 확정 2026-10-20 — 15,900원, 둘 중 한 사람이 한 번 결제하면 두 사람이 열람(PAIR_COMPAT)" },
  vatMode: { source: "assumed", note: "과세 유형 미정(세무사 확인)" },
  simpleValueAddedRate: { source: "assumed", note: "업종코드 미정 — 간이과세 부가가치율은 업종별이라 15~40% 범위로만 알려져 있다. 보수적으로 40%" },
  pgFeeRate: { source: "assumed", note: "토스페이먼츠 계약 수수료를 모른다 — 실제 계약서 값으로 바꾼다" },
  refundRate: { source: "assumed", note: "환불률 측정 전" },
  aiReportCostKrw: { source: "measured", note: "실제 Claude 호출 5건 평균(2회 호출 포함 한 건 305·333·341·371·497원). 형식 검사를 통과해 완성된 story-v1 글은 아직 한 건도 없어 '완성된 한 건'의 원가가 아니다. 최악 예약액은 1,157원" },
  aiCompatCostKrw: { source: "assumed", note: "사주 궁합 · 리포트 궁합은 실제 AI로 한 번도 재지 않았다 — 심층 리포트와 같다고 가정" },
  aiQuestionCostKrw: { source: "measured", note: "실제 질문 4건 중 토큰이 기록된 1건(입력 2,983 · 출력 455토큰, 약 17원). 표본 1건 — 임의의 30원으로 고정하지 않는다. 실제 사용량 집계로 바꿀 것" },
  deepFreeQuestions: { source: "policy", note: "심층 리포트 회원: 방 8개 × 방마다 3개 (CHAT_ROOMS)" },
  deepQuestionUsageRate: { source: "assumed", note: "무료 질문 사용률 측정 전" },
  freeRoomQuestions: { source: "policy", note: "무료 리포트 회원: 연애 2 + 고민 2 + 오늘의 운세 1 (CHAT_ROOMS)" },
  freeQuestionUsageRate: { source: "assumed", note: "무료 질문 사용률 측정 전" },
  tasteReportCostKrw: { source: "assumed", note: "맛보기 리포트 한 번 어림 35~50원(docs/taste-report.md) — 재지 않은 값" },
  tasteReportShare: { source: "assumed", note: "무료 이용자 중 맛보기를 받는 비율 측정 전" },
  freeToPaidRate: { source: "assumed", note: "무료 → 심층 결제 전환율 — 근거 없음(측정 필요). 무료 원가를 구매 한 건에 배분하는 값이라 민감하다" },
  reportPointPrice: { source: "policy", note: "정가 9,900원 × 약 1.2 = 11,880 → 11,900P (운영자 예시)" },
  pointUsageRate: { source: "assumed", note: "포인트 사용률 측정 전" },
  pointCannibalization: { source: "assumed", note: "포인트로 산 상품이 현금 구매를 대신한 비율 측정 전" },
  signupRewardPoints: { source: "policy", note: "추천 가입 1명당 추천인에게 500P(검증 뒤 확정)" },
  referralSignupToBuyRate: { source: "assumed", note: "추천 가입 → 첫 구매 전환율 — 근거 없음(측정 필요)" },
  signupConfirmRate: { source: "assumed", note: "검증을 통과하는 가입 비율 — 기본 100%(부정 가입이 없다고 본 낙관 기준)" },
  creditUsageRate: { source: "assumed", note: "보상 질문권 사용률 측정 전" },
  reviewRate: { source: "assumed", note: "리뷰 작성률 측정 전" },
  adCostPerBuyerKrw: { source: "assumed", note: "광고를 아직 집행하지 않았다 — 근거 없음" },
  fixedMonthlyKrw: { source: "assumed", note: "호스팅 · DB · 도메인 · 도구 합계 가정 — 요금제 미정" },
  rentMonthlyKrw: { source: "assumed", note: "송도 · 영종 사업장 임대료 미정(0으로 두면 낙관 값)" },
  monthlyBuyers: { source: "assumed", note: "월 구매자 수 — 수요 근거 없음. 민감도 표로만 본다" },
};

// ── 부분 계산 ──────────────────────────────────────

/** 무료 이용자 한 명에게 드는 비용(원) — 무료 질문 + 맛보기. 무료 분석 · 무료 궁합은 코드가 계산해 AI 원가가 없다(서버 · DB는 고정비에 들어간다) */
export const freeUserCostKrw = (a: Assumptions): number => a.freeRoomQuestions * a.freeQuestionUsageRate * a.aiQuestionCostKrw + a.tasteReportCostKrw * a.tasteReportShare;

/** 정가 현금 구매 한 건에서 환불 · PG 수수료를 뺀 순현금(부가세 제외, 포인트 잠식 때 잃는 몫) */
export function netCashOfList(a: Assumptions): number {
  const { revenue, pgFee } = revenueLines(a.listPriceKrw, a);
  return (revenue - pgFee) * (1 - a.refundRate);
}

/** 포인트로 심층 리포트 한 건을 받을 때(제공 원가 + 잠식률 × 잃은 현금 순매출) */
export function redemptionCostKrw(a: Assumptions): number {
  const serve = a.aiReportCostKrw + a.aiQuestionCostKrw * a.deepFreeQuestions * a.deepQuestionUsageRate;
  return serve + a.pointCannibalization * netCashOfList(a);
}

/** 발행된 포인트 1P의 기대 비용(원) = 사용률 × (교환 한 건 비용 ÷ 교환 포인트). 확정 회계 단가가 아니다 */
export const costPerIssuedPointKrw = (a: Assumptions): number => (a.pointUsageRate * redemptionCostKrw(a)) / a.reportPointPrice;

/** 상한: 포인트가 전부 쓰이고 모두 현금 구매를 대신할 때의 1P 비용 */
export const costPerPointUpperBoundKrw = (a: Assumptions): number => costPerIssuedPointKrw({ ...a, pointUsageRate: 1, pointCannibalization: 1 });

/** 수익 줄: 결제금액 → (소득세 계산에 들어가는 수입, PG 수수료, 간이과세 납부세액, 부가세 현금) — 일반과세는 공급가액이 수입, 간이과세는 공급대가가 수입이고 납부세액이 비용이다 */
function revenueLines(grossKrw: number, a: Assumptions): { revenue: number; pgFee: number; vatExpense: number; vatCash: number } {
  const feeGross = grossKrw * a.pgFeeRate;
  if (a.vatMode === "general") {
    const { supplyKrw, vatKrw } = vatSplit(grossKrw);
    // PG 수수료의 부가세는 매입세액으로 공제된다고 가정(세금계산서 수취 확인 필요) → 비용은 공급가액 기준
    const feeVat = feeGross - feeGross / 1.1;
    return { revenue: supplyKrw, pgFee: feeGross / 1.1, vatExpense: 0, vatCash: vatKrw - feeVat };
  }
  const vat = a.vatMode === "simple" ? simpleVatPayable(grossKrw, a.simpleValueAddedRate) : 0;
  return { revenue: grossKrw, pgFee: feeGross, vatExpense: vat, vatCash: vat };
}

// ── 구매 한 건의 여정 ────────────────────────────────

export type Journey = {
  id: string;
  label: string;
  /** 상품 */
  product: "report" | "question-pack" | "saju-compat" | "report-compat";
  /** 결제금액(부가세 포함) */
  paidKrw: number;
  /** 구매 적립률 — 누적 결제 구간별 3 · 5 · 7 · 10% (10만~30만 구간은 미정이라 기본 3%). 포인트 전액 교환 주문은 0 */
  earnRate: number;
  /** 추천으로 온 첫 구매 — 추천인 500P · 질문권 2개 · 무료 원가를 추천 가입 기준으로 배분 */
  referral: boolean;
  /** 리뷰 질문권 1개 포함 */
  review: boolean;
  /** 광고비를 쓰는 구매인가(추천 유입은 광고비 대신 보상 비용) */
  paidAd: boolean;
  overrides?: Partial<Assumptions>;
};

export type UnitLines = {
  paidKrw: number;
  /** 소득세 계산에 들어가는 수입(일반과세: 공급가액 · 간이/면제: 공급대가) */
  revenueKrw: number;
  refundAdjustKrw: number;
  pgFeeKrw: number;
  vatExpenseKrw: number;
  aiProductKrw: number;
  aiQuestionsKrw: number;
  freeFunnelKrw: number;
  earnPointCostKrw: number;
  signupPointCostKrw: number;
  creditCostKrw: number;
  reviewCreditCostKrw: number;
  /** 줄의 합으로만 만든다 */
  contributionKrw: number;
  adKrw: number;
  fixedKrw: number;
  operatingKrw: number;
  /** 현금 흐름 참고: 이 한 건으로 나라에 낼 부가세(일반: 매출세액 − 공제 가능한 매입세액) */
  vatCashKrw: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

export function unitEconomics(base: Assumptions, j: Journey): UnitLines {
  const a: Assumptions = { ...base, ...(j.overrides ?? {}) };
  const keep = 1 - a.refundRate;
  const r = revenueLines(j.paidKrw, a);
  const cpp = costPerIssuedPointKrw(a);

  // AI 원가: 환불돼도 이미 만든 리포트의 원가는 남는다(환불 전에 생성된다고 가정) — 환불로 줄이지 않는다
  const aiProduct = j.product === "report" ? a.aiReportCostKrw : j.product === "question-pack" ? a.aiQuestionCostKrw * 3 : a.aiCompatCostKrw;
  const aiQuestions = j.product === "report" ? a.aiQuestionCostKrw * a.deepFreeQuestions * a.deepQuestionUsageRate : 0;

  // 무료 이용 원가 배분: 광고 유입은 무료 → 구매 전환율로, 추천 유입은 추천 가입 → 구매 전환율로 나눠 구매 한 건이 진다
  const funnelRate = j.referral ? a.referralSignupToBuyRate : a.freeToPaidRate;
  const freeFunnel = j.product === "report" ? freeUserCostKrw(a) / funnelRate : 0;

  // 보상 비용 (환불되면 지급하지 않거나 회수한다고 가정 → keep을 곱한다. 추천 가입 포인트는 구매와 상관없이 가입 때 지급되므로 keep을 곱하지 않는다)
  const earnPts = j.earnRate * j.paidKrw;
  const earnPointCost = earnPts * cpp * keep;
  const signupPointCost = j.referral ? (a.signupRewardPoints * cpp * a.signupConfirmRate) / a.referralSignupToBuyRate : 0;
  const creditCost = j.referral ? 2 * a.aiQuestionCostKrw * a.creditUsageRate * keep : 0;
  const reviewCreditCost = j.review ? a.reviewRate * a.aiQuestionCostKrw * a.creditUsageRate * keep : 0;

  // 환불된 주문은 수입이 없고 그 주문의 PG 수수료 · 간이과세 납부세액도 없다(AI 원가는 이미 들었다). 수입 × 환불률만 빼고 수수료 · 납부세액은 환불되지 않은 몫만 센다
  const refundAdjust = r.revenue * a.refundRate;
  const contribution = r.revenue - refundAdjust - r.pgFee * keep - r.vatExpense * keep - aiProduct - aiQuestions - freeFunnel - earnPointCost - signupPointCost - creditCost - reviewCreditCost;
  const pgFeeNet = r.pgFee * keep;
  const vatExpenseNet = r.vatExpense * keep;
  const ad = j.paidAd ? a.adCostPerBuyerKrw : 0;
  const fixed = (a.fixedMonthlyKrw + a.rentMonthlyKrw) / a.monthlyBuyers;
  return {
    paidKrw: j.paidKrw,
    revenueKrw: round(r.revenue),
    refundAdjustKrw: round(refundAdjust),
    pgFeeKrw: round(pgFeeNet),
    vatExpenseKrw: round(vatExpenseNet),
    aiProductKrw: round(aiProduct),
    aiQuestionsKrw: round(aiQuestions),
    freeFunnelKrw: round(freeFunnel),
    earnPointCostKrw: round(earnPointCost),
    signupPointCostKrw: round(signupPointCost),
    creditCostKrw: round(creditCost),
    reviewCreditCostKrw: round(reviewCreditCost),
    contributionKrw: round(contribution),
    adKrw: round(ad),
    fixedKrw: round(fixed),
    operatingKrw: round(contribution - ad - fixed),
    vatCashKrw: round(r.vatCash * keep),
  };
}

// ── 시나리오 A~J ────────────────────────────────────

const L = (a: Assumptions) => a.listPriceKrw;

/** A~F: 구매 한 건 단위. G는 가입자 묶음, H~J는 가장 보상이 많이 쌓인 F를 흔들어 본다 */
export function scenarioJourneys(a: Assumptions): Journey[] {
  const e: Journey = { id: "E", label: "초대가 + 3% 적립 + 추천 500P + 양쪽 질문권 2개", product: "report", paidKrw: a.invitePriceKrw, earnRate: 0.03, referral: true, review: false, paidAd: false };
  const f: Journey = { ...e, id: "F", label: "E + 리뷰 질문권 1개", review: true };
  return [
    { id: "A", label: "정가 + 3% 적립", product: "report", paidKrw: L(a), earnRate: 0.03, referral: false, review: false, paidAd: true },
    { id: "B", label: "정가 + 5% 적립(누적 30만원 이상 회원)", product: "report", paidKrw: L(a), earnRate: 0.05, referral: false, review: false, paidAd: true },
    { id: "C", label: "정가 + 7% 적립(누적 70만원 이상 회원)", product: "report", paidKrw: L(a), earnRate: 0.07, referral: false, review: false, paidAd: true },
    { id: "D", label: "정가 + 10% 적립(누적 100만원 이상 회원)", product: "report", paidKrw: L(a), earnRate: 0.1, referral: false, review: false, paidAd: true },
    e,
    f,
    { ...f, id: "H", label: "F + 발행 포인트가 전부 쓰이고 모두 현금 구매를 대신함(상한)", overrides: { pointUsageRate: 1, pointCannibalization: 1 } },
    { ...f, id: "I", label: "F + 포인트 사용률 20% · 잠식 20%(낮음)", overrides: { pointUsageRate: 0.2, pointCannibalization: 0.2 } },
    { ...f, id: "J", label: "F + AI 재작성 · 무료 상담 사용이 높음(리포트 원가 최악 예약액 · 질문 원가 3배 · 무료 질문 전부 사용)", overrides: { aiReportCostKrw: 1157, aiQuestionCostKrw: 51, deepQuestionUsageRate: 1, freeQuestionUsageRate: 1 } },
  ];
}

/** 질문 3개 묶음 · 사주 궁합 · 리포트 궁합의 구매 한 건(참고) — 가격 미정 상품은 관리자 가정값이다. 무료 원가 배분은 리포트 구매에만 건다 */
export function productJourneys(a: Assumptions): Journey[] {
  const base = { earnRate: 0.03, referral: false, review: false, paidAd: true } as const;
  return [
    { id: "P1", label: "질문 3개 묶음(질문 3개를 모두 쓴다고 가정)", product: "question-pack", paidKrw: a.questionPackPriceKrw, ...base, paidAd: false },
    { id: "P2", label: "사주 궁합(8,900원)", product: "saju-compat", paidKrw: a.sajuCompatPriceKrw, ...base },
    { id: "P3", label: "리포트 궁합(15,900원, 한 쌍 한 번)", product: "report-compat", paidKrw: a.reportCompatPriceKrw, ...base },
  ];
}

export type SignupCohort = {
  signups: number;
  convRate: number;
  buyers: number;
  /** 가입자 전원에게 드는 비용: 추천 가입 포인트 + 무료 이용 원가 */
  signupCostKrw: number;
  /** 구매자가 만드는 공헌이익(추천 가입 · 무료 원가 배분을 뺀, E 여정의 나머지 몫) */
  buyerContributionKrw: number;
  netKrw: number;
};

/** G: 추천 가입자 묶음 — 구매 전환율이 낮을 때 보상 비용이 얼마나 쌓이는가(검증 통과율을 함께 입력) */
export function referralCohort(a: Assumptions, signups: number, convRate: number): SignupCohort {
  const cpp = costPerIssuedPointKrw(a);
  const signupCost = signups * (a.signupRewardPoints * cpp * a.signupConfirmRate + freeUserCostKrw(a));
  const buyers = signups * convRate;
  // 구매자 한 명의 공헌이익 = E 여정에서 추천 가입 · 무료 원가 배분을 빼고 센다(그 비용은 위에서 가입자 전원 기준으로 이미 셌다)
  const lines = unitEconomics({ ...a, referralSignupToBuyRate: 1, signupConfirmRate: 0 }, { id: "G", label: "", product: "report", paidKrw: a.invitePriceKrw, earnRate: 0.03, referral: true, review: false, paidAd: false });
  const perBuyer = lines.contributionKrw + lines.freeFunnelKrw + lines.signupPointCostKrw;
  return { signups, convRate, buyers, signupCostKrw: round(signupCost), buyerContributionKrw: round(buyers * perBuyer), netKrw: round(buyers * perBuyer - signupCost) };
}

// ── 정가 구매 vs 추천 구매 — 같은 기준으로 비교 ─────────────

export type AcquisitionRow = {
  route: "list" | "referral";
  label: string;
  signups: number;
  convRate: number;
  buyers: number;
  /** 구매자 한 명이 만드는 공헌이익(무료 원가 · 가입 포인트 · 광고비를 빼기 전) */
  grossPerBuyerKrw: number;
  freeCostKrw: number;
  signupPointKrw: number;
  adKrw: number;
  netKrw: number;
  netPerSignupKrw: number;
};

/**
 * 같은 가입자 수 · 같은 무료 이용 원가 · 같은 광고비 기준으로 정가 유입과 추천 유입을 나란히 센다.
 * - 광고 유입: 가입자 한 명을 데려오는 광고비 = 구매자당 광고비 × 구매 전환율(광고비를 구매자 기준으로 가정한 값을 가입자 기준으로 바꿈)
 * - 추천 유입: 광고비 0, 대신 추천 가입 포인트(확정분)와 양쪽 질문권 비용이 든다
 * - 무료 이용 원가는 두 유입 모두 가입자 전원이 진다(같은 `freeUserCostKrw`)
 * `convList` · `convReferral`을 같은 값으로 넣으면 "전환율이 같다면"의 비교가 된다.
 */
export function compareAcquisition(a: Assumptions, signups: number, convList: number, convReferral: number): { list: AcquisitionRow; referral: AcquisitionRow; breakEvenConvReferral: number | null } {
  const free = freeUserCostKrw(a);
  const cpp = costPerIssuedPointKrw(a);
  const noFunnel = { ...a, freeToPaidRate: 1, referralSignupToBuyRate: 1, signupConfirmRate: 0 };
  const listLine = unitEconomics(noFunnel, { id: "L", label: "", product: "report", paidKrw: a.listPriceKrw, earnRate: 0.03, referral: false, review: false, paidAd: false });
  const refLine = unitEconomics(noFunnel, { id: "R", label: "", product: "report", paidKrw: a.invitePriceKrw, earnRate: 0.03, referral: true, review: false, paidAd: false });
  const listGross = listLine.contributionKrw + listLine.freeFunnelKrw;
  const refGross = refLine.contributionKrw + refLine.freeFunnelKrw + refLine.signupPointCostKrw;

  const listBuyers = signups * convList;
  const listAd = signups * convList * a.adCostPerBuyerKrw;
  const listFree = signups * free;
  const list: AcquisitionRow = {
    route: "list",
    label: "정가 구매(광고 유입)",
    signups,
    convRate: convList,
    buyers: listBuyers,
    grossPerBuyerKrw: round(listGross),
    freeCostKrw: round(listFree),
    signupPointKrw: 0,
    adKrw: round(listAd),
    netKrw: round(listBuyers * listGross - listFree - listAd),
    netPerSignupKrw: 0,
  };
  list.netPerSignupKrw = signups ? round(list.netKrw / signups) : 0;

  const refBuyers = signups * convReferral;
  const refSignupPoints = signups * a.signupRewardPoints * cpp * a.signupConfirmRate;
  const refFree = signups * free;
  const referral: AcquisitionRow = {
    route: "referral",
    label: "추천 구매(초대 가격 · 가입 포인트 · 질문권)",
    signups,
    convRate: convReferral,
    buyers: refBuyers,
    grossPerBuyerKrw: round(refGross),
    freeCostKrw: round(refFree),
    signupPointKrw: round(refSignupPoints),
    adKrw: 0,
    netKrw: round(refBuyers * refGross - refFree - refSignupPoints),
    netPerSignupKrw: 0,
  };
  referral.netPerSignupKrw = signups ? round(referral.netKrw / signups) : 0;

  // 추천 구매의 손익분기 전환율 = 가입자 한 명의 비용 ÷ 구매자 한 명의 공헌이익(가입 비용만큼 구매자가 벌어 와야 한다)
  const breakEven = refGross > 0 ? (free + a.signupRewardPoints * cpp * a.signupConfirmRate) / refGross : null;
  return { list, referral, breakEvenConvReferral: breakEven === null ? null : Math.round(breakEven * 10_000) / 10_000 };
}

// ── 연간 · 세후 ──────────────────────────────────────

export type AnnualInput = {
  /** 월 구매자 수 × (정가 비중) / (추천 비중) */
  monthlyBuyers: number;
  referralShare: number;
  otherIncomeKrw: number;
  deductionsKrw: number;
  reductionRate: number;
  /** 과세 유형을 연 공급대가로 고르는가(true) 아니면 a.vatMode 그대로(false) */
  autoVatMode: boolean;
};

export type AnnualResult = {
  annualGrossKrw: number;
  vatMode: VatMode;
  contributionKrw: number;
  operatingKrw: number;
  incrementalTaxKrw: number;
  afterTaxKrw: number;
  vatCashKrw: number;
  /** 세금 납부 준비액 = 부가세 현금 + 소득세 · 지방소득세(미유가 늘린 몫) */
  taxReserveKrw: number;
};

/** 정가 구매(A)와 추천 구매(F)를 섞은 한 해의 사업이익과 세후 이익 */
export function annualAfterTax(base: Assumptions, i: AnnualInput): AnnualResult {
  const annualBuyers = i.monthlyBuyers * 12;
  const refBuyers = annualBuyers * i.referralShare;
  const listBuyers = annualBuyers - refBuyers;
  const annualGross = listBuyers * base.listPriceKrw + refBuyers * base.invitePriceKrw;
  const vatMode = i.autoVatMode ? vatModeForAnnualGross(annualGross) : base.vatMode;
  const a: Assumptions = { ...base, vatMode, monthlyBuyers: i.monthlyBuyers };
  const [ja, , , , , jf] = scenarioJourneys(a);
  const ua = unitEconomics(a, ja);
  const uf = unitEconomics(a, jf);
  const contribution = listBuyers * ua.contributionKrw + refBuyers * uf.contributionKrw;
  const ads = listBuyers * ua.adKrw + refBuyers * uf.adKrw;
  const fixed = (a.fixedMonthlyKrw + a.rentMonthlyKrw) * 12;
  const operating = contribution - ads - fixed;
  const tax = miyuIncrementalTax({ miyuIncomeKrw: operating, otherIncomeKrw: i.otherIncomeKrw, deductionsKrw: i.deductionsKrw, reductionRate: i.reductionRate });
  const vatCash = listBuyers * ua.vatCashKrw + refBuyers * uf.vatCashKrw;
  return {
    annualGrossKrw: Math.round(annualGross),
    vatMode,
    contributionKrw: Math.round(contribution),
    operatingKrw: Math.round(operating),
    incrementalTaxKrw: tax.incrementalKrw,
    afterTaxKrw: Math.round(operating - tax.incrementalKrw),
    vatCashKrw: Math.round(vatCash),
    taxReserveKrw: Math.round(vatCash + tax.incrementalKrw),
  };
}

/** 월 손익분기 구매자 수 = 고정비 ÷ (구매 한 건의 공헌이익 − 광고비). 한 건이 적자이면 null */
export function breakEvenBuyersPerMonth(a: Assumptions, j: Journey): number | null {
  const u = unitEconomics({ ...a, fixedMonthlyKrw: 0, rentMonthlyKrw: 0 }, j);
  const perBuyer = u.contributionKrw - u.adKrw;
  if (perBuyer <= 0) return null;
  return Math.ceil((a.fixedMonthlyKrw + a.rentMonthlyKrw) / perBuyer);
}

/** 소득세 계산만 따로 쓰는 곳(관리자 화면의 "감면 시뮬레이션")을 위한 재수출 */
export { incomeTaxOf };
