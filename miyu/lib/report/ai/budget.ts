// AI 호출 예산 하드스톱 — 유료 호출을 하기 "전에" 최악의 비용을 예약하고, 한도를 넘길 호출은 제공사에 보내지 않는다.
// - 호출 전: (입력 토큰 추정 × 입력 단가 + 최대 출력 토큰 × 출력 단가) × 환율 × 여유율 을 예약한다. 예약하면 한도를 넘는 호출은 거절한다.
// - 호출 후: 실제 사용량(usage)으로 바꿔 기록한다. 사용량을 모르면(응답 누락 · 시간 초과) 예약한 최악의 값을 그대로 쓴다.
// - 출력 토큰의 최대치(maxOutputTokens)는 생각하는 데 쓰는 토큰까지 포함한다 (두 후보 모두 생각 토큰을 출력으로 과금하고 최대 출력 한도에 합산한다).
// - 환율 · 여유율은 가정값이다. 실제 청구는 제공사 콘솔의 사용량으로 확인한다.
// 이 파일은 네트워크를 쓰지 않는다. 제공사 구현체(연동 폴더)를 붙이기 전에도 모의 모델로 전부 검사한다.

import { ModelCallError, type ModelRequest, type ModelResult, type TextModel } from "./model.ts";

export type ModelPrice = { inputUsdPerMTok: number; outputUsdPerMTok: number };
export type Usage = { inputTokens: number; outputTokens: number };

export type BudgetSettings = {
  /** 이 단계 전체의 한도 (원) */
  capKrw: number;
  /** 1달러 = 몇 원 — 가정값 */
  fxKrwPerUsd: number;
  /** 부가세 등 표시 가격 위에 더 청구될 수 있는 몫 (1.1 = 10%) */
  surcharge: number;
  /** 회사(제공사)별 한도 (원) — 정하지 않으면 전체 한도만 적용 */
  perProviderCapKrw?: number;
};

/** 2026-10 실제 환율은 확인하지 않았다. 공식 환율을 확인한 뒤 바꾼다 */
export const DEFAULT_FX_KRW_PER_USD = 1600;
export const DEFAULT_SURCHARGE = 1.1;

/**
 * 입력 토큰 추정 — 보수적으로 크게 잡는다. 한글 · 한자 등은 글자당 2토큰, 영문 · 숫자 · 기호는 글자당 0.5토큰, 메시지마다 64토큰.
 * 실제 토큰 수는 제공사마다 다르다. 첫 호출의 실제 사용량(usage)과 비교해 이 추정이 너무 크거나 작은지 기록한다 (compare-plan의 보정 값).
 */
export function estimateInputTokens(texts: string[]): number {
  let t = 0;
  for (const text of texts) {
    let n = 0;
    for (const ch of text) n += ch.charCodeAt(0) < 128 ? 0.5 : 2;
    t += Math.ceil(n) + 64;
  }
  return t;
}

export function costKrw(price: ModelPrice, usage: Usage, s: Pick<BudgetSettings, "fxKrwPerUsd" | "surcharge">): number {
  const usd = (usage.inputTokens * price.inputUsdPerMTok + usage.outputTokens * price.outputUsdPerMTok) / 1_000_000;
  return usd * s.fxKrwPerUsd * s.surcharge;
}

/** 호출 한 번의 최악 비용 — 입력은 추정값, 출력은 최대치 */
export function worstCaseKrw(price: ModelPrice, est: { inputTokens: number; maxOutputTokens: number }, s: Pick<BudgetSettings, "fxKrwPerUsd" | "surcharge">): number {
  return costKrw(price, { inputTokens: est.inputTokens, outputTokens: est.maxOutputTokens }, s);
}

/** 예산이 모자라 호출하지 않았다 — 제공사에 요청이 나가지 않았으므로 청구되지 않는다 */
export class BudgetExceededError extends ModelCallError {
  readonly reason: "cap" | "provider-cap" | "halted";
  readonly needKrw: number;
  readonly remainingKrw: number;
  constructor(reason: "cap" | "provider-cap" | "halted", needKrw: number, remainingKrw: number) {
    super(
      reason === "halted"
        ? "추정보다 많이 쓰여서 예산 관리를 멈췄습니다. 더 호출하지 않습니다."
        : `예산 한도를 넘길 수 있어 호출하지 않았습니다. (필요 최대 ${Math.ceil(needKrw)}원 · 남은 예산 ${Math.floor(remainingKrw)}원)`,
      { retryable: false, code: "BUDGET_EXCEEDED" },
    );
    this.reason = reason;
    this.needKrw = needKrw;
    this.remainingKrw = remainingKrw;
  }
}

export type Reservation = { id: number; provider: string; label: string; price: ModelPrice; worstKrw: number; settled: boolean };

/** 어댑터가 "요청이 모델 생성에 닿지 않았다"고 보증하는 오류 코드 — 이 경우만 청구 없음으로 본다 */
export const NOT_BILLED_CODES: ReadonlySet<string> = new Set(["RATE_LIMITED", "AUTH", "INVALID_REQUEST", "BUDGET_EXCEEDED"]);

export class BudgetGuard {
  readonly settings: BudgetSettings;
  private spent = 0;
  private reserved = 0;
  private spentByProvider = new Map<string, number>();
  private reservedByProvider = new Map<string, number>();
  private nextId = 1;
  private haltedReason: string | null = null;
  private refused = 0;
  private settledCalls = 0;

  constructor(settings: BudgetSettings) {
    if (!(settings.capKrw > 0)) throw new Error("예산 한도(원)는 0보다 커야 합니다.");
    if (!(settings.fxKrwPerUsd > 0)) throw new Error("환율은 0보다 커야 합니다.");
    if (!(settings.surcharge >= 1)) throw new Error("여유율은 1 이상이어야 합니다.");
    this.settings = settings;
  }

  get spentKrw() {
    return this.spent;
  }
  get reservedKrw() {
    return this.reserved;
  }
  get remainingKrw() {
    return this.settings.capKrw - this.spent - this.reserved;
  }
  get halted() {
    return this.haltedReason;
  }

  /** 호출 전에 부른다. 한도를 넘길 수 있으면 BudgetExceededError를 던지고, 그때는 제공사를 부르면 안 된다 */
  reserve(label: string, provider: string, price: ModelPrice, est: { inputTokens: number; maxOutputTokens: number }): Reservation {
    const worst = worstCaseKrw(price, est, this.settings);
    if (this.haltedReason) {
      this.refused++;
      throw new BudgetExceededError("halted", worst, this.remainingKrw);
    }
    if (this.spent + this.reserved + worst > this.settings.capKrw) {
      this.refused++;
      throw new BudgetExceededError("cap", worst, this.remainingKrw);
    }
    const cap = this.settings.perProviderCapKrw;
    if (cap !== undefined) {
      const used = (this.spentByProvider.get(provider) ?? 0) + (this.reservedByProvider.get(provider) ?? 0);
      if (used + worst > cap) {
        this.refused++;
        throw new BudgetExceededError("provider-cap", worst, cap - used);
      }
    }
    this.reserved += worst;
    this.reservedByProvider.set(provider, (this.reservedByProvider.get(provider) ?? 0) + worst);
    return { id: this.nextId++, provider, label, price, worstKrw: worst, settled: false };
  }

  /**
   * 호출이 끝나면 부른다.
   * - usage: 실제 사용량 → 그 비용으로 기록 (예약보다 많으면 추정이 틀린 것이므로 이후 호출을 멈춘다)
   * - "unknown": 사용량을 모름 → 예약한 최악의 비용을 그대로 쓴다
   * - "not-billed": 제공사에 닿지 않음 → 청구 없음
   */
  settle(r: Reservation, outcome: Usage | "unknown" | "not-billed"): number {
    if (r.settled) throw new Error("이미 정산한 예약입니다.");
    r.settled = true;
    this.reserved -= r.worstKrw;
    this.reservedByProvider.set(r.provider, (this.reservedByProvider.get(r.provider) ?? 0) - r.worstKrw);
    let charge: number;
    if (outcome === "not-billed") charge = 0;
    else if (outcome === "unknown") charge = r.worstKrw;
    else {
      charge = costKrw(r.price, outcome, this.settings);
      if (charge > r.worstKrw + 1e-9) this.haltedReason = `${r.label}: 실제 비용이 예약한 최악 비용보다 큽니다`;
    }
    this.spent += charge;
    this.spentByProvider.set(r.provider, (this.spentByProvider.get(r.provider) ?? 0) + charge);
    this.settledCalls++;
    return charge;
  }

  snapshot() {
    return {
      capKrw: this.settings.capKrw,
      spentKrw: Math.round(this.spent * 100) / 100,
      reservedKrw: Math.round(this.reserved * 100) / 100,
      remainingKrw: Math.round(this.remainingKrw * 100) / 100,
      settledCalls: this.settledCalls,
      refusedCalls: this.refused,
      halted: this.haltedReason,
      byProvider: Object.fromEntries([...this.spentByProvider].map(([k, v]) => [k, Math.round(v * 100) / 100])),
    };
  }
}

/** 모델 연결을 예산 확인으로 감싼다 — 어떤 TextModel이든 (제공사 구현체 · 모의 모델) 같은 방식으로 한도를 지킨다 */
export function withBudget(model: TextModel, guard: BudgetGuard, price: ModelPrice): TextModel {
  return {
    provider: model.provider,
    model: model.model,
    async complete(request: ModelRequest): Promise<ModelResult> {
      const est = {
        inputTokens: estimateInputTokens([request.system, ...request.messages.map((m) => m.content)]),
        maxOutputTokens: request.maxOutputTokens,
      };
      const reservation = guard.reserve(model.model, model.provider, price, est);
      let result: ModelResult;
      try {
        result = await model.complete(request);
      } catch (e) {
        guard.settle(reservation, e instanceof ModelCallError && NOT_BILLED_CODES.has(e.code) ? "not-billed" : "unknown");
        throw e;
      }
      guard.settle(reservation, result.usage ?? "unknown");
      return result;
    },
  };
}
