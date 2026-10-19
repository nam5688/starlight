"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createPairInvite, joinPairInvite, paidPairOrder, startPairCheckout, unlinkPair, withdrawPairConsent, getPairView, type CreateInviteResult, type JoinResult, type StartPairCheckoutResult } from "@/lib/services/pair-service";
import { readAcquisition } from "@/server/acquisition";
import { paymentConfig, paymentEnvOf } from "@/server/env";
import { getMember } from "@/server/member";
import { alert } from "@/server/ops";
import { pairDeps } from "@/server/pair";
import { claimAndSchedule } from "@/server/report-jobs";

const UUID = /^[0-9a-f-]{36}$/;
const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

export type PairActionOutcome = { ok: false; message: string; /** 입력 칸별 오류 — 사이(relationship) · 내 성별(myGender) */ errors?: { relationship?: string; myGender?: string } };

const NEED_LOGIN = "로그인이 필요해요. 로그인한 뒤 다시 시도해 주세요.";

const INVITE_MESSAGE: Record<Exclude<CreateInviteResult["kind"], "created">, string> = {
  invalid: "입력을 확인해 주세요.",
  "not-open": "리포트 궁합은 아직 준비 중이에요.",
  "ai-not-connected": "리포트 궁합은 AI 연결이 끝난 뒤에 이용할 수 있어요.",
  "not-found": "내 검사 결과를 찾을 수 없어요.",
  "no-consent": "궁합 생성에 사용하는 데 동의해야 초대할 수 있어요.",
  "no-saju": "이 검사 결과로는 궁합을 만들 수 없어요. 무료 분석을 다시 받아 주세요.",
  "too-many": "열어 둔 초대가 너무 많아요. 이미 만든 초대를 먼저 쓰거나 끊어 주세요.",
  "db-not-ready": "리포트 궁합을 준비하고 있어요. 잠시 뒤에 다시 시도해 주세요.",
};

/** A가 내 검사 결과로 초대 링크를 만든다 — 동의 체크가 있어야 한다. 성공하면 쌍 화면으로 이동한다 */
export async function createPairInviteAction(input: { assessmentId: string; consent: boolean; relationship?: unknown; myGender?: unknown }): Promise<PairActionOutcome> {
  const assessmentId = typeof input?.assessmentId === "string" ? input.assessmentId : "";
  if (!UUID.test(assessmentId)) return { ok: false, message: INVITE_MESSAGE["not-found"] };
  const member = await getMember();
  if (!member || member.needsConsent) return { ok: false, message: NEED_LOGIN };
  const r = await createPairInvite(pairDeps(), { userId: member.userId, assessmentId, consent: input.consent === true, relationship: input.relationship, myGender: input.myGender });
  if (r.kind === "created") redirect(`/pair/${r.pair.id}`);
  if (r.kind === "invalid") return { ok: false, message: INVITE_MESSAGE.invalid, errors: r.errors };
  return { ok: false, message: INVITE_MESSAGE[r.kind] };
}

const JOIN_MESSAGE: Record<Exclude<JoinResult["kind"], "joined">, string> = {
  invalid: "입력을 확인해 주세요.",
  "not-open": "리포트 궁합은 아직 준비 중이에요.",
  "no-consent": "궁합 생성에 사용하는 데 동의해야 연결할 수 있어요.",
  "no-assessment": "내 검사 결과가 없어요. 무료 분석을 먼저 마친 뒤 이 링크를 다시 열어 주세요.",
  self: "내가 만든 초대예요. 상대에게 링크를 보내 주세요.",
  taken: "이미 다른 분이 연결한 초대예요.",
  expired: "초대 유효 기간이 지났어요. 초대한 분께 새 링크를 부탁해 주세요.",
  closed: "끊어진 초대예요.",
  "not-found": "초대를 찾을 수 없어요.",
  "bad-assessment": "이 검사 결과로는 연결할 수 없어요. 무료 분석을 다시 받아 주세요.",
  "db-not-ready": "리포트 궁합을 준비하고 있어요. 잠시 뒤에 다시 시도해 주세요.",
};

/** B가 링크로 들어와 동의하고 연결한다 — 성공하면 쌍 화면으로 이동한다 */
export async function joinPairAction(input: { token: string; consent: boolean; myGender?: unknown }): Promise<PairActionOutcome> {
  const token = typeof input?.token === "string" ? input.token : "";
  if (!TOKEN.test(token)) return { ok: false, message: JOIN_MESSAGE["not-found"] };
  const member = await getMember();
  if (!member || member.needsConsent) return { ok: false, message: NEED_LOGIN };
  const r = await joinPairInvite(pairDeps(), { token, userId: member.userId, consent: input.consent === true, myGender: input.myGender });
  if (r.kind === "joined") redirect(`/pair/${r.pair.id}`);
  if (r.kind === "invalid") return { ok: false, message: JOIN_MESSAGE.invalid, errors: r.errors };
  return { ok: false, message: JOIN_MESSAGE[r.kind] };
}

const CHECKOUT_MESSAGE: Record<Exclude<StartPairCheckoutResult["kind"], "order" | "not-found">, string> = {
  "not-open": "리포트 궁합은 아직 준비 중이에요.",
  "ai-not-connected": "리포트 궁합은 AI 연결이 끝난 뒤에 받을 수 있어요.",
  "not-linked": "연결이 끊겼거나 동의가 철회돼 결제할 수 없어요.",
  "already-paid": "이미 결제된 쌍이에요. 같은 글을 두 사람이 모두 볼 수 있어요.",
  refunded: "환불된 쌍이라 다시 결제할 수 없어요. 문의해 주세요.",
  busy: "상대가 지금 결제를 진행하고 있어요. 잠시 뒤에 다시 확인해 주세요.",
  "sales-closed": "지금은 새 구매를 잠시 받지 않고 있어요. 이미 결제한 리포트에는 영향이 없어요. 잠시 뒤에 다시 시도해 주세요.",
  "db-not-ready": "리포트 궁합을 준비하고 있어요. 잠시 뒤에 다시 시도해 주세요.",
};

/** 쌍의 결제 시작 — 금액 · 소유자 · 쌍 상태는 서버가 다시 확인하고, 성공하면 결제 화면으로 이동한다. 결제되지 않으면 어떤 글도 만들어지지 않는다 */
export async function startPairCheckoutAction(input: { pairId: string }): Promise<PairActionOutcome> {
  const pairId = typeof input?.pairId === "string" ? input.pairId : "";
  if (!UUID.test(pairId)) notFound();
  const member = await getMember();
  if (!member || member.needsConsent) return { ok: false, message: NEED_LOGIN };
  const config = paymentConfig();
  if (!config.ok) return { ok: false, message: "결제가 아직 설정되지 않았어요." };
  const r = await startPairCheckout(pairDeps(), { userId: member.userId, pairId, paymentEnv: paymentEnvOf(config), acquisition: await readAcquisition() });
  if (r.kind === "order") redirect(`/checkout/${r.order.orderNumber}`);
  if (r.kind === "not-found") notFound();
  return { ok: false, message: CHECKOUT_MESSAGE[r.kind] };
}

export type PairChangeResult = { ok: true; message: string } | { ok: false; message: string };

async function change(pairId: string, withdraw: boolean): Promise<PairChangeResult> {
  if (!UUID.test(pairId)) return { ok: false, message: "쌍을 찾을 수 없어요." };
  const member = await getMember();
  if (!member || member.needsConsent) return { ok: false, message: NEED_LOGIN };
  const deps = pairDeps();
  const r = withdraw ? await withdrawPairConsent(deps, { userId: member.userId, pairId }) : await unlinkPair(deps, { userId: member.userId, pairId });
  if (r.kind === "not-found") return { ok: false, message: "쌍을 찾을 수 없어요." };
  if (r.kind === "db-not-ready") return { ok: false, message: "잠시 뒤에 다시 시도해 주세요." };
  revalidatePath(`/pair/${pairId}`);
  revalidatePath("/pair");
  // 결제는 됐는데 글이 만들어지기 전에 끊겼다 — 결제한 고객이 글을 받지 못하게 됐으니 운영자에게 알린다(이름 · 개인정보 없이 쌍 번호 앞 8자만)
  if (r.paidNotGenerated) await alert({ kind: "pair.paid_not_generated", severity: "warn", title: `리포트 궁합 결제 후 글이 만들어지기 전에 연결이 끊겼어요 (쌍 ${pairId.slice(0, 8)}) — 환불 여부 확인`, dedupeKey: `pair.paid_not_generated:${pairId}` });
  if (r.paidNotGenerated) return { ok: true, message: "연결을 끊었어요. 결제는 됐지만 글이 아직 만들어지지 않았어요. 운영자가 환불 여부를 확인해요." };
  return { ok: true, message: withdraw ? "동의를 철회했어요. 내 자료는 새 궁합을 만드는 데 더 쓰이지 않아요." : "연결을 끊었어요. 이미 만들어진 글은 두 사람 모두 그대로 읽을 수 있어요." };
}

/** 연결 해제 — 새로 만들지 않는다. 이미 만들어진 글의 열람은 그대로다 */
export async function unlinkPairAction(pairId: string): Promise<PairChangeResult> {
  return change(pairId, false);
}

/** 동의 철회 — 내 자료를 새 궁합 생성에 더 쓰지 않고 철회한 사람의 열람이 끝난다 */
export async function withdrawPairConsentAction(pairId: string): Promise<PairChangeResult> {
  return change(pairId, true);
}

export type PairStatusResult = { status: "ready" | "failed" | "generating" | "none"; canRetry: boolean };

/**
 * 리포트 궁합이 만들어지는 동안 몇 초마다 확인한다 — 대기 중이거나 멈춘 작업이 있으면 여기서 이어받는다(다시 결제하지 않는다).
 * retry는 "다시 만들기"를 눌렀을 때만 실패한 작업을 다시 시작한다(결제한 사람이든 상대든 같은 주문으로).
 */
export async function pairStatusAction(pairId: string, retry = false): Promise<PairStatusResult> {
  const none: PairStatusResult = { status: "none", canRetry: false };
  const member = await getMember();
  if (!member || member.needsConsent || typeof pairId !== "string" || !UUID.test(pairId)) return none;
  const deps = pairDeps();
  const order = await paidPairOrder(deps, { pairId, userId: member.userId });
  if (!order) return none;
  const view = await getPairView(deps, { pairId, userId: member.userId });
  if (view.kind !== "ok") return none;
  if (view.report.state === "ready") return { status: "ready", canRetry: false };
  // 읽을 수 없는 사람(철회 · 환불)에게는 만들기를 이어받게 하지 않는다
  if (view.report.state !== "generating" && view.report.state !== "failed") return none;
  const { report } = await claimAndSchedule(order, retry ? { retryFailed: true } : {});
  if (report?.status === "ready") return { status: "ready", canRetry: false };
  const failed = report?.status === "failed";
  return { status: failed ? "failed" : "generating", canRetry: failed };
}
