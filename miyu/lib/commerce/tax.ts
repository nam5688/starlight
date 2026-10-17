// 세금 계산 규칙 — 순수 계산(React · Next · 외부 SDK 없음). 관리자 수익 대시보드의 "예상 세후 이익"에 쓰는 **관리회계 추정**이며 신고 확정액이 아니다.
//
// 지키는 것
// - 청년창업 세액감면율(0 · 0.5 · 0.75)은 **입력값**이다. 75%를 확정 세율로 계산하지 않는다 — 신규 창업 인정 · 업종 · 사업장 주소 · 청년 요건 · 기존 사업과의 독립 여부가 확인되기 전까지 세 시나리오를 함께 본다.
// - 소득세는 개인에게 귀속되는 소득을 합산해 계산한다. 슬링샵 등 다른 사업소득을 함께 넣고, 미유가 늘린 세금은 "미유가 있을 때의 세금 − 없을 때의 세금"으로 센다(구간이 올라가는 효과를 빼먹지 않고 같은 세금을 두 번 빼지 않는다).
// - 감면은 부가세가 아니라 소득세에만 적용한다. 감면 대상 소득(미유)과 대상이 아닌 소득(슬링샵 등)을 나눠 감면 대상 소득의 몫만큼만 감면한다.
// - 세율표 · 공제 · 감면 한도 · 최저한세 · 농어촌특별세는 **가정이거나 계산하지 않은 것**이다(아래 각 값에 적었다). 실제 신고액은 세무사가 정한다.

export type TaxBracket = { upTo: number; rate: number };

/**
 * 종합소득세 기본세율표(과세표준 구간별 한계세율) — 소득세법 제55조의 표를 옮긴 **가정**이다(2026년 귀속에 그대로 적용되는지 세무사가 확인한다).
 * 관리자가 바꿀 수 있도록 함수 인자로 받는다.
 */
export const INCOME_TAX_BRACKETS_ASSUMED: readonly TaxBracket[] = [
  { upTo: 14_000_000, rate: 0.06 },
  { upTo: 50_000_000, rate: 0.15 },
  { upTo: 88_000_000, rate: 0.24 },
  { upTo: 150_000_000, rate: 0.35 },
  { upTo: 300_000_000, rate: 0.38 },
  { upTo: 500_000_000, rate: 0.4 },
  { upTo: 1_000_000_000, rate: 0.42 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.45 },
];

/** 개인지방소득세 — 소득세(감면 · 공제 후 결정세액)의 10%를 가정한다(지방세법). 관리자가 바꿀 수 있다 */
export const LOCAL_INCOME_TAX_RATE_ASSUMED = 0.1;

/** 과세표준(원)에 대한 산출세액 — 구간별 한계세율을 쌓아 계산한다 */
export function incomeTaxOf(taxableKrw: number, brackets: readonly TaxBracket[] = INCOME_TAX_BRACKETS_ASSUMED): number {
  if (!(taxableKrw > 0)) return 0;
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    if (taxableKrw <= lower) break;
    tax += (Math.min(taxableKrw, b.upTo) - lower) * b.rate;
    lower = b.upTo;
  }
  return Math.round(tax);
}

export type HouseholdTaxInput = {
  /** 미유의 사업소득금액(수입 − 필요경비, 원) — 감면 대상으로 보는 소득. 손실이면 음수 */
  miyuIncomeKrw: number;
  /** 슬링샵 등 다른 과세 대상 소득금액(원) — 감면 대상이 아니다 */
  otherIncomeKrw: number;
  /** 소득공제 합계(원) — 기본공제 등. 가정 입력이다 */
  deductionsKrw: number;
  /** 청년창업 세액감면율 — 0 · 0.5 · 0.75 시나리오(확정 아님) */
  reductionRate: number;
  /** 세액공제 합계(원) — 계산하지 않으면 0 */
  creditsKrw?: number;
  /** 감면세액의 상한(원) — 모르면 null(제한 없음으로 계산하지 않고 확인 항목으로 둔다) */
  reductionCapKrw?: number | null;
  brackets?: readonly TaxBracket[];
  localRate?: number;
};

export type HouseholdTax = {
  totalIncomeKrw: number;
  taxableKrw: number;
  /** 감면 전 산출세액 */
  grossTaxKrw: number;
  /** 감면 대상 소득이 종합소득금액에서 차지하는 몫(0~1) */
  reductionShare: number;
  reductionKrw: number;
  /** 결정세액(소득세) */
  incomeTaxKrw: number;
  localTaxKrw: number;
  totalTaxKrw: number;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** 한 사람(개인)에게 귀속되는 소득을 합산한 소득세 · 지방소득세 추정 */
export function householdTax(i: HouseholdTaxInput): HouseholdTax {
  const total = i.miyuIncomeKrw + i.otherIncomeKrw;
  const taxable = Math.max(0, total - i.deductionsKrw);
  const gross = incomeTaxOf(taxable, i.brackets);
  const share = total > 0 && i.miyuIncomeKrw > 0 ? clamp01(i.miyuIncomeKrw / total) : 0;
  let reduction = gross * share * clamp01(i.reductionRate);
  if (i.reductionCapKrw != null) reduction = Math.min(reduction, i.reductionCapKrw);
  const incomeTax = Math.max(0, Math.round(gross - reduction - (i.creditsKrw ?? 0)));
  const local = Math.round(incomeTax * (i.localRate ?? LOCAL_INCOME_TAX_RATE_ASSUMED));
  return { totalIncomeKrw: total, taxableKrw: taxable, grossTaxKrw: gross, reductionShare: share, reductionKrw: Math.round(reduction), incomeTaxKrw: incomeTax, localTaxKrw: local, totalTaxKrw: incomeTax + local };
}

/** 미유 때문에 늘어난 세금 = (미유 포함 합산 세금) − (미유 없는 세금). 공제 · 다른 소득의 구간 효과가 함께 들어간다 */
export function miyuIncrementalTax(i: HouseholdTaxInput): { withMiyu: HouseholdTax; withoutMiyu: HouseholdTax; incrementalKrw: number } {
  const withMiyu = householdTax(i);
  const withoutMiyu = householdTax({ ...i, miyuIncomeKrw: 0 });
  return { withMiyu, withoutMiyu, incrementalKrw: withMiyu.totalTaxKrw - withoutMiyu.totalTaxKrw };
}

// ── 부가세 ─────────────────────────────────────────

/** 부가세율 10% (일반과세) */
export const VAT_RATE = 0.1;

/** 공급대가(부가세 포함 결제금액) → 공급가액 · 부가세 (일반과세자). 원 단위 반올림 */
export function vatSplit(grossKrw: number): { supplyKrw: number; vatKrw: number } {
  const supply = Math.round(grossKrw / (1 + VAT_RATE));
  return { supplyKrw: supply, vatKrw: grossKrw - supply };
}

/** 과세 유형 시나리오 — general: 일반과세 · simple: 간이과세(납부의무 있음) · simple-exempt: 간이과세 + 납부 면제(연 공급대가가 면제 기준 미만) */
export type VatMode = "general" | "simple" | "simple-exempt";

/**
 * 간이과세자 납부세액(업종별 부가가치율 × 10%) — **부가가치율은 업종코드가 정해져야 알 수 있어 입력값이다**(15~40% 범위로만 알려져 있고 미유의 업종은 미확정).
 * 매입세액 공제(공급대가 합계의 0.5% 등)는 계산하지 않는다(과소 추정이 아니라 작은 값이라 생략했다 — 세무사 확인).
 */
export function simpleVatPayable(grossKrw: number, valueAddedRate: number): number {
  return Math.round(grossKrw * valueAddedRate * VAT_RATE);
}

/** 간이과세 판정 기준(직전 연도 공급대가) — 관리자가 바꿀 수 있는 가정값. 면제 · 간이 기준은 법령 개정으로 바뀐다(세무사 확인) */
export const SIMPLE_VAT_THRESHOLDS_ASSUMED = { simpleMaxKrw: 104_000_000, exemptUnderKrw: 48_000_000 } as const;

/** 연 공급대가로 본 간이과세 구간 — 실제 적용 여부는 업종 배제 · 개업 연도 환산 등으로 달라질 수 있다 */
export function vatModeForAnnualGross(annualGrossKrw: number): VatMode {
  if (annualGrossKrw >= SIMPLE_VAT_THRESHOLDS_ASSUMED.simpleMaxKrw) return "general";
  return annualGrossKrw < SIMPLE_VAT_THRESHOLDS_ASSUMED.exemptUnderKrw ? "simple-exempt" : "simple";
}
