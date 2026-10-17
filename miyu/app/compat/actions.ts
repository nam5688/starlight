"use server";

import { notFound, redirect } from "next/navigation";
import { computeSimpleCompat, type SimpleCompatOutcome } from "@/lib/compat/simple";
import { SAJU_COMPAT } from "@/lib/config/product";
import { startCompatCheckout, getCompatReportView, type StartCompatResult } from "@/lib/services/compat-service";
import { readAcquisition } from "@/server/acquisition";
import { saleGateCheck } from "@/server/capacity";
import { paymentConfig, paymentEnvOf } from "@/server/env";
import { getMember } from "@/server/member";
import { claimAndSchedule } from "@/server/report-jobs";
import { now, readRepository, reportGenerator, writeRepository } from "@/server/services";

/**
 * 간단 궁합(무료) — 두 사람의 출생정보로 계산한 결과 카드를 돌려준다.
 * 입력한 생년월일 · 이름은 이 계산에만 쓰고 저장하거나 기록하지 않는다(로그 · 운영 기록 · 알림에도 남기지 않는다). 로그인 없이 쓸 수 있다.
 */
export async function simpleCompatAction(input: { a: unknown; b: unknown }): Promise<SimpleCompatOutcome> {
  return computeSimpleCompat(input?.a, input?.b, new Date());
}

export type CompatStartOutcome = { ok: false; message: string; errors?: Record<string, string> };

const MESSAGE: Record<Exclude<StartCompatResult["kind"], "order" | "invalid" | "not-found">, string> = {
  "not-open": "사주 궁합은 아직 준비 중이에요. 무료 간단 궁합은 지금 볼 수 있어요.",
  "ai-not-connected": "사주 궁합은 AI 연결이 끝난 뒤에 받을 수 있어요. 무료 간단 궁합은 지금 볼 수 있어요.",
  "sales-closed": "지금은 새 구매를 잠시 받지 않고 있어요. 이미 결제한 리포트에는 영향이 없어요. 잠시 뒤에 다시 시도해 주세요.",
  "db-not-ready": "사주 궁합을 준비하고 있어요. 잠시 뒤에 다시 시도해 주세요.",
};

/**
 * 사주 궁합(유료) 결제 시작 — 내 검사 결과(assessmentId)와 상대 입력으로 주문을 만들고 결제 화면으로 보낸다.
 * 판매 스위치가 꺼져 있거나(지금) AI가 연결되지 않았으면 주문을 만들지 않고 이유만 돌려준다 — 돈이 빠지지 않는다.
 * 금액 · 소유자 · 입력 확인은 모두 서버가 다시 한다. 상대 입력은 결제 주문과 함께 리포트가 만들어지는 동안에만 보관한다.
 */
export async function startCompatCheckoutAction(input: { assessmentId: string; partner: unknown }): Promise<CompatStartOutcome> {
  if (!SAJU_COMPAT.saleOpen) return { ok: false, message: MESSAGE["not-open"] };
  const assessmentId = typeof input?.assessmentId === "string" ? input.assessmentId : "";
  if (!/^[0-9a-f-]{36}$/.test(assessmentId)) return { ok: false, message: "내 검사 결과를 찾을 수 없어요." };
  const member = await getMember();
  if (!member || member.needsConsent) return { ok: false, message: "로그인이 필요해요. 로그인한 뒤 다시 시도해 주세요." };
  const config = paymentConfig();
  if (!config.ok) return { ok: false, message: "결제가 아직 설정되지 않았어요." };
  const result = await startCompatCheckout(
    { repo: writeRepository(), now, gate: saleGateCheck, generatorReady: Boolean(reportGenerator().generateCompat) },
    { userId: member.userId, assessmentId, partner: input.partner, paymentEnv: paymentEnvOf(config), acquisition: await readAcquisition() },
  );
  if (result.kind === "order") redirect(`/checkout/${result.order.orderNumber}`);
  if (result.kind === "not-found") notFound();
  if (result.kind === "invalid") return { ok: false, message: result.message ?? "상대 입력을 확인해 주세요.", errors: Object.fromEntries(Object.entries(result.errors).filter(([, v]) => typeof v === "string")) as Record<string, string> };
  return { ok: false, message: MESSAGE[result.kind] };
}

export type CompatStatusResult = { status: "ready" | "failed" | "generating" | "none"; canRetry: boolean };

/**
 * 사주 궁합 리포트가 만들어지는 동안 몇 초마다 확인한다 — 대기 중이거나 멈춘 작업이 있으면 여기서 이어받는다(다시 결제하지 않는다).
 * retry는 고객이 "다시 만들기"를 눌렀을 때만 실패한 작업을 다시 시작한다.
 */
export async function compatStatusAction(orderNumber: string, retry = false): Promise<CompatStatusResult> {
  const none: CompatStatusResult = { status: "none", canRetry: false };
  const member = await getMember();
  if (!member || member.needsConsent || typeof orderNumber !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(orderNumber)) return none;
  const view = await getCompatReportView(await readRepository(), { userId: member.userId, orderNumber });
  if (view.kind === "ready") return { status: "ready", canRetry: false };
  if (view.kind !== "generating" && view.kind !== "failed") return none;
  const { report } = await claimAndSchedule(view.order, retry ? { retryFailed: true } : {});
  if (report?.status === "ready") return { status: "ready", canRetry: false };
  const failed = report?.status === "failed";
  return { status: failed ? "failed" : "generating", canRetry: failed };
}
