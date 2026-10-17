// 사주 궁합(유료) — 결제 시작 · 상대 출생정보 보관과 지우기 · 만들 때 쓸 두 사람의 사주 · 내 궁합 목록.
//
// 원칙
// - 판매 스위치(SAJU_COMPAT.saleOpen)가 꺼져 있으면 주문을 만들지 않는다 — 돈이 빠지지 않는다. 가격 · 스위치는 lib/config/product.ts 한 곳에서만 고친다.
// - 상대 출생정보는 리포트를 만드는 동안에만 따로 보관하고(compat_requests, 서버만 읽는다) 리포트가 완성되면 지운다. 결제하지 않고 떠난 주문의 입력도 지운다.
//   상대의 출생정보 처리 근거 · 보관은 법률 검토 대상이다(docs/compat-engine.md).
// - 구매자 본인의 검사 결과가 "나"(A)이고, 상대(B)는 생년월일만 있다 — 상대의 응답(기질 · 성격 · 애착)은 만들지 않는다.
// - 주문은 상품 번호 `saju-compat:<요청 번호>`라 개인 통합 리포트 주문 · 고민 리포트 주문과 섞이지 않는다(결과 화면 · MY의 리포트 목록 · 매출 구분).

import { isCompatProduct, parseCompatProductId, SAJU_COMPAT, compatProductId } from "../config/product.ts";
import { createOrderNumber } from "../commerce/order.ts";
import { cleanNickname, parseCompatPerson, validateCompatPerson, type CompatPersonErrors } from "../compat/simple.ts";
import { isCompatReport } from "../report/compat/types.ts";
import type { CompatReport } from "../report/compat/types.ts";
import type { SajuOk } from "../saju/engine.ts";
import { calculateSaju } from "../saju/manseryeok-engine.ts";
import type { GateReason } from "./capacity-service.ts";
import { gateOpen, type SaleGateCheck } from "./order-service.ts";
import type { Acquisition, CompatPartner, MiyuRepository, OrderRecord, PaymentEnv } from "./ports.ts";

export const COMPAT_UNAVAILABLE_MESSAGE = {
  "not-open": "사주 궁합은 아직 준비 중이에요. 무료 간단 궁합은 지금 볼 수 있어요.",
  "ai-not-connected": "사주 궁합은 AI 연결이 끝난 뒤에 받을 수 있어요. 무료 간단 궁합은 지금 볼 수 있어요.",
  "db-not-ready": "사주 궁합을 준비하고 있어요. 잠시 뒤에 다시 시도해 주세요.",
} as const;

export type StartCompatResult =
  | { kind: "order"; order: OrderRecord; requestId: string }
  | { kind: "not-open" }
  | { kind: "ai-not-connected" }
  | { kind: "invalid"; errors: CompatPersonErrors; message?: string }
  | { kind: "sales-closed"; reason: GateReason | null }
  /** 질문표(DB 변경 23번)가 아직 없거나 저장에 실패 — 주문을 만들지 않았거나 취소했다 */
  | { kind: "db-not-ready" }
  | { kind: "not-found" };

/** 화면에서 온 상대 입력을 읽고 확인한다 — 이름은 제목용으로만 다듬는다. 성별은 이 궁합에서 쓰지 않는다 */
export function readCompatPartner(raw: unknown, today: Date): { ok: true; partner: CompatPartner } | { ok: false; errors: CompatPersonErrors; message?: string } {
  const p = parseCompatPerson(raw);
  if (!p) return { ok: false, errors: {}, message: "입력 형식이 올바르지 않아요." };
  const errors = validateCompatPerson(p, today);
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    partner: {
      nickname: cleanNickname(p.nickname, "상대"),
      calendar: p.calendar,
      isLeapMonth: p.calendar === "lunar" && p.isLeapMonth,
      birthYear: Number(p.birthYear),
      birthMonth: Number(p.birthMonth),
      birthDay: Number(p.birthDay),
      birthTime: p.birthTimeUnknown ? null : p.birthTime,
      gender: null,
    },
  };
}

/** 보관해 둔 상대 출생정보로 사주를 계산한다 — 계산하지 못하면 오류(리포트 생성이 실패로 남고 같은 주문으로 다시 만들 수 있다) */
export function partnerSajuOf(partner: CompatPartner): SajuOk {
  const r = calculateSaju({ year: partner.birthYear, month: partner.birthMonth, day: partner.birthDay, calendar: partner.calendar, isLeapMonth: partner.isLeapMonth, birthTime: partner.birthTime });
  if (r.status !== "ok") throw new Error("상대의 사주를 계산하지 못했습니다.");
  return r as SajuOk;
}

/** 대기 주문을 취소하고 그 주문의 상대 출생정보를 지운다 — 결제하지 않고 떠난 입력을 남기지 않는다 */
async function dropPending(repo: MiyuRepository, pending: OrderRecord, status: string, message: string): Promise<void> {
  const canceled = await repo.updateOrder(pending.id, ["pending"], { status: "canceled", failureCode: status, failureMessage: message });
  if (canceled) await repo.addPaymentEvent({ orderId: pending.id, source: "checkout", status, detail: {} }).catch(() => {});
  await repo.scrubCompatRequest(pending.id).catch(() => false);
}

export type StartCompatDeps = {
  repo: MiyuRepository;
  now: () => Date;
  newOrderNumber?: (now: Date) => string;
  newId?: () => string;
  gate?: SaleGateCheck;
  /** 시험에서만 쓴다 — 기본은 SAJU_COMPAT.saleOpen */
  saleOpen?: boolean;
  /** 이 환경의 생성기가 사주 궁합을 쓸 수 있는가(AI 연결) — 아니면 주문을 만들지 않는다 */
  generatorReady: boolean;
};

/**
 * 사주 궁합 결제 시작. 판매 스위치 · AI 연결 · 판매 문(용량 · 예산) · 입력을 확인한 뒤 주문 + 상대 출생정보 보관을 만든다.
 * 같은 사람이 결제하지 않고 남긴 이전 대기 주문은 취소하고 보관한 상대 정보도 지운다(대기 주문 하나만 남긴다).
 */
export async function startCompatCheckout(
  deps: StartCompatDeps,
  input: { userId: string; assessmentId: string; partner: unknown; paymentEnv?: PaymentEnv; acquisition?: Acquisition | null },
): Promise<StartCompatResult> {
  const { repo } = deps;
  if (!(deps.saleOpen ?? SAJU_COMPAT.saleOpen)) return { kind: "not-open" };
  if (!deps.generatorReady) return { kind: "ai-not-connected" };
  const assessment = await repo.getAssessment(input.assessmentId);
  if (!assessment || assessment.userId !== input.userId) return { kind: "not-found" };
  if (assessment.saju.status !== "ok") return { kind: "invalid", errors: { birthDate: "내 사주를 계산하지 못한 결과라 궁합을 볼 수 없어요." } };
  const read = readCompatPartner(input.partner, deps.now());
  if (!read.ok) return { kind: "invalid", errors: read.errors, message: read.message };
  // 상대 사주가 계산되는지 미리 확인한다(결제한 뒤에 계산하지 못해 실패하는 일을 줄인다)
  try {
    partnerSajuOf(read.partner);
  } catch {
    return { kind: "invalid", errors: { birthDate: "이 생년월일로는 사주를 계산하지 못했어요. 다시 확인해 주세요." } };
  }

  const sale = await gateOpen(deps.gate, "start");
  if (!sale.open) return { kind: "sales-closed", reason: sale.reason };

  // 이전에 결제하지 않고 남긴 대기 주문 정리
  const orders = await repo.listOrdersForAssessment(assessment.id);
  for (const pending of orders.filter((o) => o.status === "pending" && isCompatProduct(o.productId))) await dropPending(repo, pending, "SUPERSEDED", "새 결제 요청으로 대체됨");

  const requestId = (deps.newId ?? (() => globalThis.crypto.randomUUID()))();
  const makeNumber = deps.newOrderNumber ?? ((now: Date) => createOrderNumber(now));
  const inserted = await repo.insertOrder({
    orderNumber: makeNumber(deps.now()),
    userId: input.userId,
    assessmentId: assessment.id,
    productId: compatProductId(requestId),
    amount: SAJU_COMPAT.priceKrw,
    paymentEnv: input.paymentEnv ?? "test",
    acquisition: input.acquisition ?? null,
  });
  if (!inserted.ok) return { kind: "db-not-ready" };
  let saved = false;
  try {
    saved = (await repo.insertCompatRequest({ id: requestId, orderId: inserted.value.id, userId: input.userId, partner: read.partner })).ok;
  } catch {
    saved = false;
  }
  if (!saved) {
    // 상대 정보를 보관하지 못하면 만들 수 없다 — 결제되지 않게 주문을 취소한다
    await dropPending(repo, inserted.value, "COMPAT_REQUEST_FAILED", "상대 입력을 보관하지 못해 취소됨");
    return { kind: "db-not-ready" };
  }
  return { kind: "order", order: inserted.value, requestId };
}

/** 사주 궁합 리포트를 만들 때 쓸 두 사람 — 상대 출생정보가 이미 지워졌거나 없으면 오류 */
export async function compatInputFor(repo: MiyuRepository, order: OrderRecord, assessment: { nickname: string; saju: unknown }): Promise<{ names: { a: string; b: string }; a: SajuOk; b: SajuOk }> {
  const requestId = parseCompatProductId(order.productId);
  if (!requestId) throw new Error("사주 궁합 주문이 아닙니다.");
  const request = await repo.getCompatRequestByOrder(order.id);
  if (!request || request.userId !== order.userId) throw new Error("사주 궁합 요청을 찾을 수 없습니다.");
  if (!request.partner || request.scrubbedAt) throw new Error("상대 입력이 지워져 사주 궁합을 만들 수 없습니다.");
  const a = assessment.saju as { status?: string };
  if (a?.status !== "ok") throw new Error("내 사주 계산 결과가 없어 사주 궁합을 만들 수 없습니다.");
  return { names: { a: cleanNickname(assessment.nickname, "나"), b: request.partner.nickname }, a: assessment.saju as SajuOk, b: partnerSajuOf(request.partner) };
}

export type MyCompat = { orderNumber: string; names: { a: string; b: string } | null; createdAt: string; status: "paid-ready" | "generating" | "failed" | "refunded" };

/** MY — 내가 산 사주 궁합 목록 (최근 것이 먼저). 이름은 완성된 리포트에만 있다 */
export async function listMyCompat(repo: MiyuRepository, userId: string): Promise<MyCompat[]> {
  const [orders, reports] = await Promise.all([repo.listOrdersForUser(userId), repo.listReportStatuses(userId)]);
  const mine = orders.filter((o) => isCompatProduct(o.productId) && (o.status === "paid" || o.status === "refunded"));
  const out: MyCompat[] = [];
  for (const o of mine) {
    const report = reports.find((r) => r.orderId === o.id);
    let names: MyCompat["names"] = null;
    if (o.status === "paid" && report?.status === "ready") {
      const full = await repo.getReportByOrder(o.id);
      if (full?.content && isCompatReport(full.content)) names = full.content.names;
    }
    out.push({
      orderNumber: o.orderNumber,
      names,
      createdAt: o.createdAt,
      status: o.status === "refunded" ? "refunded" : report?.status === "ready" ? "paid-ready" : report?.status === "failed" ? "failed" : "generating",
    });
  }
  return out.sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
}

export type CompatReportView =
  | { kind: "ready"; report: CompatReport; order: OrderRecord }
  | { kind: "generating"; order: OrderRecord }
  | { kind: "failed"; order: OrderRecord }
  | { kind: "refunded"; order: OrderRecord }
  | { kind: "not-found" };

/** 구매한 사주 궁합 열람 — 본인 주문만. 저장된 글을 그대로 보여 주고 다시 만들지 않는다 */
export async function getCompatReportView(repo: MiyuRepository, input: { userId: string; orderNumber: string }): Promise<CompatReportView> {
  const order = await repo.getOrderByNumber(input.orderNumber);
  if (!order || order.userId !== input.userId || !isCompatProduct(order.productId)) return { kind: "not-found" };
  if (order.status === "refunded") return { kind: "refunded", order };
  if (order.status !== "paid") return { kind: "not-found" };
  const report = await repo.getReportByOrder(order.id);
  if (report?.status === "ready" && report.content && isCompatReport(report.content)) return { kind: "ready", report: report.content, order };
  return report?.status === "failed" ? { kind: "failed", order } : { kind: "generating", order };
}
