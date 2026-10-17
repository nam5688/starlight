// 생성 용량 · 비용 제어 — AI 생성이 몰리거나 하루 예산을 넘길 때, 새 판매는 멈추되 이미 결제한 고객은 계속 처리한다.
//
// 원칙
// - 이미 결제가 확인된 고객의 리포트는 어떤 한도에서도 취소하지 않는다. 한도는 "새로 결제를 받는 것"과 "동시에 생성하는 수"에만 건다.
// - 새 구매는 두 단계로 막는다: 결제를 시작하기 전(시작 기준, 낮음)과 결제사에 승인을 요청하기 직전(승인 기준, 더 높음).
//   승인 기준을 높게 두는 이유: 이미 결제창까지 간 고객이 한도 변동 때문에 막히는 일을 줄이기 위해서다.
//   승인을 요청하지 않으면 카드에서 돈이 빠지지 않는다.
// - 한도에 걸려 결제를 받지 않을 때 "계속 기다리게" 하지 않는다: 이유와 함께 바로 안내하고, 결제는 진행하지 않는다.
// - 동시 생성 수는 대기열(queued)로 조절한다. 대기 중인 리포트는 자리가 나는 대로(결과 화면 확인 · 정기 점검) 이어서 만든다.

import { REPORT_GENERATING_STALE_MS } from "../commerce/report.ts";
import type { AiUsageInput, MiyuRepository } from "./ports.ts";

export type CapacityConfig = {
  /** 동시에 생성하는 최대 수. 0이면 제한 없음 (AI 연결 전 개발용 생성기) */
  maxConcurrent: number;
  /** 대기 + 생성 중인 리포트가 이 수 이상이면 새 결제를 시작하지 못하게 한다. 0이면 제한 없음 */
  saleQueueLimit: number;
  /** 하루(한국 날짜) AI 예산 (원). 0이면 제한 없음 */
  dailyBudgetKrw: number;
  /** 리포트 한 건의 예상 비용 (원) — 대기 중인 건을 예산에 미리 반영하는 데 쓴다 */
  estCostKrwPerReport: number;
  /** 토큰 단가 (원 / 100만 토큰). 제공사를 정한 뒤 설정한다. 없으면 비용을 계산하지 않는다 */
  priceInputKrwPerMTok: number | null;
  priceOutputKrwPerMTok: number | null;
  /** 리포트 한 번의 생성 시도에 허용하는 시간(밀리초). 0이면 기본값(REPORT_GENERATION_TIMEOUT_MS) */
  generationTimeoutMs: number;
};

export const NO_LIMITS: CapacityConfig = {
  maxConcurrent: 0,
  saleQueueLimit: 0,
  dailyBudgetKrw: 0,
  estCostKrwPerReport: 0,
  priceInputKrwPerMTok: null,
  priceOutputKrwPerMTok: null,
  generationTimeoutMs: 0,
};

/** 승인 기준은 시작 기준의 이 배수 (이미 결제창까지 간 고객을 한도 변동으로 막지 않기 위함) */
export const CONFIRM_LIMIT_FACTOR = 2;
/** 예산은 시작 기준에서 이 비율이 되면 알리고, 승인 기준은 이 배수 */
export const BUDGET_WARN_RATIO = 0.8;
export const BUDGET_CONFIRM_FACTOR = 1.2;

export type GateReason = "queue" | "budget";
export type SaleGate = {
  /** 새 구매를 받을 수 있는지 */
  open: boolean;
  reason: GateReason | null;
  queued: number;
  generating: number;
  todayCostKrw: number;
  /** 예산의 몇 %를 쓰거나 예약했는지 (예산이 없으면 null) */
  budgetUsedPct: number | null;
};

/** 한국 날짜 기준 오늘 0시 (UTC ISO) */
export function seoulDayStart(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const midnightKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  return new Date(midnightKst - 9 * 3600_000).toISOString();
}

export function estimateCostKrw(cfg: CapacityConfig, usage: { inputTokens: number | null; outputTokens: number | null }): number | null {
  if (cfg.priceInputKrwPerMTok === null || cfg.priceOutputKrwPerMTok === null) return null;
  if (usage.inputTokens === null && usage.outputTokens === null) return null;
  const cost = ((usage.inputTokens ?? 0) * cfg.priceInputKrwPerMTok + (usage.outputTokens ?? 0) * cfg.priceOutputKrwPerMTok) / 1_000_000;
  return Math.round(cost * 10_000) / 10_000;
}

export async function loadLoad(repo: MiyuRepository, now: Date) {
  const staleBefore = new Date(now.getTime() - REPORT_GENERATING_STALE_MS).toISOString();
  const [generating, queued, todayCostKrw] = await Promise.all([
    repo.countActiveGenerations(staleBefore),
    repo.countQueuedReports(),
    repo.sumAiCostSince(seoulDayStart(now)),
  ]);
  return { generating, queued, todayCostKrw: Math.round(todayCostKrw * 100) / 100 };
}

/**
 * 새 구매를 받아도 되는지 판단한다.
 * - start: 결제를 시작하기 전  - confirm: 결제사에 승인을 요청하기 직전 (더 넉넉한 기준)
 */
export async function saleGate(repo: MiyuRepository, cfg: CapacityConfig, now: Date, stage: "start" | "confirm"): Promise<SaleGate> {
  const load = await loadLoad(repo, now);
  const waiting = load.queued + load.generating;
  const queueLimit = cfg.saleQueueLimit * (stage === "confirm" ? CONFIRM_LIMIT_FACTOR : 1);
  const budget = cfg.dailyBudgetKrw;
  // 대기 중인 건도 곧 비용이 되므로 예상 비용을 미리 더한다
  const projected = load.todayCostKrw + waiting * cfg.estCostKrwPerReport;
  const budgetLimit = budget * (stage === "confirm" ? BUDGET_CONFIRM_FACTOR : 1);

  let reason: GateReason | null = null;
  if (cfg.saleQueueLimit > 0 && waiting >= queueLimit) reason = "queue";
  else if (budget > 0 && projected >= budgetLimit) reason = "budget";
  return {
    open: reason === null,
    reason,
    queued: load.queued,
    generating: load.generating,
    todayCostKrw: load.todayCostKrw,
    budgetUsedPct: budget > 0 ? Math.round((projected / budget) * 100) : null,
  };
}

/** 고객에게 보여 주는 안내 — 결제가 진행되지 않았다는 것과 다시 열리는 조건을 알린다 */
export function salesClosedMessage(reason: GateReason | null): string {
  return reason === "budget"
    ? "오늘은 리포트 준비 용량이 가득 차 새 구매를 잠시 받지 않아요. 결제는 진행되지 않았고 청구되지 않아요. 내일 다시 이용해 주세요. 이미 구매하신 분의 리포트는 계속 준비돼요."
    : "지금은 리포트를 준비 중인 주문이 많아 새 구매를 잠시 받지 않아요. 결제는 진행되지 않았고 청구되지 않아요. 이미 구매하신 분의 리포트가 먼저 준비된 뒤 다시 열리니, 잠시 후 다시 확인해 주세요.";
}

/** 사용 기록 + 비용 요약 (관리자 화면 · 주문당 비용) */
export type CostSummary = {
  todayKrw: number;
  weekKrw: number;
  callsToday: number;
  failedCallsToday: number;
  /** 최근 7일: 사용 기록이 있는 리포트 수와 한 건당 평균 비용 (단가가 설정된 경우) */
  reportsWeek: number;
  avgPerReportKrw: number | null;
  pricingConfigured: boolean;
};

export async function costSummary(repo: MiyuRepository, cfg: CapacityConfig, now: Date): Promise<CostSummary> {
  const weekStart = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();
  const dayStart = seoulDayStart(now);
  const usage = await repo.listAiUsageSince(weekStart, 5000);
  const today = usage.filter((u) => u.createdAt >= dayStart);
  const sum = (list: { estCostKrw: number | null }[]) => Math.round(list.reduce((n, u) => n + (u.estCostKrw ?? 0), 0) * 100) / 100;
  const reports = new Set(usage.filter((u) => u.reportId).map((u) => u.reportId));
  const pricingConfigured = cfg.priceInputKrwPerMTok !== null && cfg.priceOutputKrwPerMTok !== null;
  return {
    todayKrw: sum(today),
    weekKrw: sum(usage),
    callsToday: today.length,
    failedCallsToday: today.filter((u) => u.outcome !== "ok").length,
    reportsWeek: reports.size,
    avgPerReportKrw: pricingConfigured && reports.size > 0 ? Math.round((sum(usage) / reports.size) * 100) / 100 : null,
    pricingConfigured,
  };
}

export type { AiUsageInput };
