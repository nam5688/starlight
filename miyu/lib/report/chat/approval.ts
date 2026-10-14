// 채팅 질문의 실제 AI 호출 승인 가드 — 운영자가 직접 적은 승인 금액 · 호출 수 · 기간 안에서만 제공사를 부른다. 채널 독립 코드(네트워크 · 환경변수를 쓰지 않는다).
// 규칙(실패하면 호출하지 않는다 = 청구되지 않는다):
//  1. 승인 기간(한국 날짜 from ~ through)이 아니면 호출하지 않는다.
//  2. 호출 전에 이 호출의 최악 비용(입력 추정 + 최대 출력)을 지금까지 쓴 금액에 더해 승인 금액을 넘길 수 있으면 호출하지 않는다.
//  3. 지금까지의 호출 수 + 1이 승인 호출 수를 넘으면 호출하지 않는다 (속도 제한 · 인증 오류처럼 청구되지 않는 호출은 세지 않는다).
//  4. 지금까지 쓴 금액을 읽지 못하면(DB 오류) 호출하지 않는다 — 모르는 채로 쓰지 않는다.
// 지금까지 쓴 금액 = max(저장된 사용 기록의 합, 이 프로세스가 시작할 때의 기록 + 이 프로세스가 직접 센 호출). 기록이 아직 저장되기 전 · 사용량을 모르는 응답(시간 초과 등)은 최악 비용으로 센다.
// 이 가드는 한 프로세스(운영자 PC의 개발 서버)에서 시험하는 용도다 — 여러 서버가 동시에 쓰는 운영 환경의 한도는 다시 설계해야 한다.
import { costKrw, estimateInputTokens, NOT_BILLED_CODES, worstCaseKrw, type ModelPrice } from "../ai/budget.ts";
import { ModelCallError, type ModelRequest, type ModelResult, type TextModel } from "../ai/model.ts";

export type ChatApproval = {
  /** 승인 금액 상한 (원) — 운영자가 적은 값 */
  capKrw: number;
  /** 승인 호출 수 상한 (고쳐 쓰기 · 재시도 포함, 모델 호출 한 번이 1회) */
  maxCalls: number;
  /** 승인 기간 (한국 날짜 YYYY-MM-DD, 양 끝 포함) */
  from: string;
  through: string;
};

export type ChatPricing = { price: ModelPrice; fxKrwPerUsd: number; surcharge: number };
export type Spend = { calls: number; spentKrw: number };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** 한국 날짜(YYYY-MM-DD) */
export function seoulDate(now: Date): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 승인 기간의 시작 시각 (한국 시간 0시, ISO) — 이 시각 이후의 사용 기록만 센다 */
export function approvalSince(a: Pick<ChatApproval, "from">): string {
  return new Date(Date.parse(`${a.from}T00:00:00Z`) - 9 * 3600_000).toISOString();
}

export type ApprovalIssue = string;

/** 승인 값이 쓸 수 있는 모양인가 — 상한은 호출한 쪽(서버 설정)이 정한다. 문제가 있으면 이유를 돌려준다 */
export function checkApprovalShape(a: ChatApproval, limits: { maxCapKrw: number; maxCalls: number; maxDays: number }): ApprovalIssue | null {
  if (!Number.isFinite(a.capKrw) || a.capKrw <= 0) return "승인 금액(원)을 적어 주세요";
  if (a.capKrw > limits.maxCapKrw) return `승인 금액은 ${limits.maxCapKrw.toLocaleString("ko-KR")}원을 넘길 수 없어요 (남은 승인 금액 안에서만 시험해요)`;
  if (!Number.isInteger(a.maxCalls) || a.maxCalls <= 0) return "승인 호출 수를 적어 주세요";
  if (a.maxCalls > limits.maxCalls) return `승인 호출 수는 ${limits.maxCalls}회를 넘길 수 없어요`;
  if (!DATE.test(a.from) || !DATE.test(a.through)) return "승인 기간은 YYYY-MM-DD 모양으로 적어 주세요";
  const days = (Date.parse(`${a.through}T00:00:00Z`) - Date.parse(`${a.from}T00:00:00Z`)) / DAY_MS;
  if (!(days >= 0)) return "승인 기간의 끝은 시작보다 빠를 수 없어요";
  if (days + 1 > limits.maxDays) return `승인 기간은 ${limits.maxDays}일을 넘길 수 없어요`;
  return null;
}

export type UsageRow = { provider: string; promptVersion: string; estCostKrw: number | null; errorCode: string | null };

/**
 * 저장된 사용 기록에서 이 가드가 센 호출 수와 쓴 금액을 만든다.
 * - 이 제공사 · 채팅 지시문의 기록만 센다.
 * - 청구되지 않는 오류(속도 제한 · 인증 · 결제 · 잘못된 요청 · 예산 거절)는 호출 수에도 금액에도 세지 않는다.
 * - 금액을 모르는 기록(시간 초과 등)은 unknownRowKrw(최악 비용)로 센다. 금액을 아는 기록은 부가세 · 여유율(surcharge)을 곱해 센다.
 */
export function tallyUsage(rows: UsageRow[], model: { provider: string }, s: { surcharge: number; unknownRowKrw: number }): Spend {
  let calls = 0;
  let spent = 0;
  for (const r of rows) {
    if (r.provider !== model.provider || !r.promptVersion.startsWith("chat-")) continue;
    if (r.errorCode && NOT_BILLED_CODES.has(r.errorCode)) continue;
    calls += 1;
    spent += r.estCostKrw === null ? s.unknownRowKrw : r.estCostKrw * s.surcharge;
  }
  return { calls, spentKrw: spent };
}

export type ApprovalRefusal = "not-started" | "expired" | "cap" | "calls" | "unreadable";

export class ChatApprovalError extends ModelCallError {
  readonly reason: ApprovalRefusal;
  constructor(reason: ApprovalRefusal) {
    super(
      {
        "not-started": "승인 기간 전이라 AI를 부르지 않았어요.",
        expired: "승인 기간이 지나 AI를 부르지 않았어요.",
        cap: "승인 금액을 넘길 수 있어 AI를 부르지 않았어요.",
        calls: "승인 호출 수를 모두 써서 AI를 부르지 않았어요.",
        unreadable: "지금까지 쓴 금액을 확인하지 못해 AI를 부르지 않았어요.",
      }[reason],
      // BUDGET_EXCEEDED는 "청구 없음"으로 보증하는 코드다 — 제공사에 요청이 나가지 않았다
      { retryable: false, code: "BUDGET_EXCEEDED" },
    );
    this.reason = reason;
  }
}

export type ApprovedModelOptions = {
  approval: ChatApproval;
  pricing: ChatPricing;
  now: () => Date;
  /** 저장된 사용 기록으로 센 지금까지의 호출 수 · 금액 (읽지 못하면 던진다 — 그러면 호출하지 않는다) */
  loadSpend: (sinceIso: string, unknownRowKrw: number) => Promise<Spend>;
};

/** 모델 연결을 승인 가드로 감싼다 — 제공사 구현체 · 모의 모델 어느 쪽이든 같은 방식으로 승인 범위를 지킨다 */
export function withChatApproval(model: TextModel, opts: ApprovedModelOptions): TextModel {
  const { approval, pricing } = opts;
  const settings = { fxKrwPerUsd: pricing.fxKrwPerUsd, surcharge: pricing.surcharge };
  // 이 프로세스가 직접 센 값 — 기록 저장이 늦어도 같은 호출을 두 번 빠뜨리지 않는다
  let baseline: Spend | null = null;
  const local: Spend = { calls: 0, spentKrw: 0 };
  const inFlight: Spend = { calls: 0, spentKrw: 0 };
  // 확인 + 예약을 한 번에 하나씩 (동시에 들어온 호출이 같은 잔액을 보고 함께 통과하지 못하게)
  let gate: Promise<unknown> = Promise.resolve();

  async function admit(request: ModelRequest): Promise<{ worst: number }> {
    const est = { inputTokens: estimateInputTokens([request.system, ...request.messages.map((m) => m.content)]), maxOutputTokens: request.maxOutputTokens };
    const worst = worstCaseKrw(pricing.price, est, settings);
    const today = seoulDate(opts.now());
    if (today < approval.from) throw new ChatApprovalError("not-started");
    if (today > approval.through) throw new ChatApprovalError("expired");
    let stored: Spend;
    try {
      stored = await opts.loadSpend(approvalSince(approval), worst);
    } catch {
      throw new ChatApprovalError("unreadable");
    }
    baseline ??= stored;
    const spent = Math.max(stored.spentKrw, baseline.spentKrw + local.spentKrw);
    const calls = Math.max(stored.calls, baseline.calls + local.calls);
    if (calls + inFlight.calls + 1 > approval.maxCalls) throw new ChatApprovalError("calls");
    if (spent + inFlight.spentKrw + worst > approval.capKrw) throw new ChatApprovalError("cap");
    inFlight.calls += 1;
    inFlight.spentKrw += worst;
    return { worst };
  }

  return {
    provider: model.provider,
    model: model.model,
    async complete(request: ModelRequest): Promise<ModelResult> {
      const turn = gate.then(() => admit(request));
      gate = turn.catch(() => {});
      const { worst } = await turn;
      let charge = worst;
      let counted = true;
      try {
        const result = await model.complete(request);
        charge = result.usage ? costKrw(pricing.price, result.usage, settings) : worst;
        return result;
      } catch (e) {
        if (e instanceof ModelCallError && NOT_BILLED_CODES.has(e.code)) {
          charge = 0;
          counted = false;
        }
        throw e;
      } finally {
        inFlight.calls -= 1;
        inFlight.spentKrw -= worst;
        if (counted) local.calls += 1;
        local.spentKrw += charge;
      }
    },
  };
}
