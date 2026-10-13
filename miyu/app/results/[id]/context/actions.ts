"use server";

import { notFound, redirect } from "next/navigation";
import { CONTEXT_FIELDS } from "@/lib/personalization/context";
import { getConcernRecordView, scrubRecordContent, startConcernCheckout } from "@/lib/services/concern-service";
import { deleteContext, saveContext } from "@/lib/services/context-service";
import { REPORT_SLA_MS } from "@/lib/commerce/report";
import { canRetryReport } from "@/lib/services/report-service";
import type { ReportStatusResult } from "@/app/results/[id]/actions";
import { getMember } from "@/server/member";
import { isMissingTableError } from "@/lib/integrations/supabase/repository";
import { readAcquisition } from "@/server/acquisition";
import { saleGateCheck } from "@/server/capacity";
import { issuingAvailability } from "@/server/concern";
import { paymentConfig, paymentEnvOf } from "@/server/env";
import { claimAndSchedule } from "@/server/report-jobs";
import { now, readRepository, writeRepository } from "@/server/services";

const NOT_READY = "이 기능을 쓰려면 운영자가 DB 변경 5번(20261015000000_personal_context.sql)을 먼저 적용해야 합니다.";

export type ContextFormState = { errors: string[]; values: Record<string, string> | null };

const base = (assessmentId: string) => `/results/${assessmentId}/context`;

/**
 * 저장 — 서버가 소유자 · 글자 수 · 동의를 확인하고, 연락처 · 이메일처럼 보이는 내용은 가려서 저장한다.
 * 저장은 리포트를 만들지 않는다 (새 리포트 발급은 startConcernCheckoutAction에서 따로 시작한다).
 */
export async function saveContextAction(assessmentId: string, _prev: ContextFormState, formData: FormData): Promise<ContextFormState> {
  const member = await getMember();
  if (!member || member.needsConsent) redirect(`/results/${assessmentId}`);
  const raw: Record<string, string> = { topic: String(formData.get("topic") ?? "") };
  for (const f of CONTEXT_FIELDS) raw[f.id] = String(formData.get(f.id) ?? "");
  let result;
  try {
    result = await saveContext(writeRepository(), {
      userId: member.userId,
      assessmentId,
      raw,
      agreed: formData.get("agree") === "on",
      now,
    });
  } catch (e) {
    if (isMissingTableError(e as { code?: string })) return { errors: [NOT_READY], values: raw };
    throw e;
  }
  if (result.kind === "not-found") return { errors: ["결과를 찾을 수 없습니다."], values: null };
  if (result.kind === "invalid") return { errors: result.errors, values: raw };
  const q = new URLSearchParams({ saved: result.changed ? "1" : "same" });
  if (result.redactions) q.set("redacted", String(result.redactions));
  redirect(`${base(assessmentId)}?${q}`);
}

/** 지우기 — 저장한 현재 고민을 삭제한다. 이미 발급한 리포트와 고민 기록은 그대로 남는다 */
export async function deleteContextAction(assessmentId: string) {
  const member = await getMember();
  if (!member || member.needsConsent) redirect(`/results/${assessmentId}`);
  try {
    await deleteContext(writeRepository(), { userId: member.userId, assessmentId, now });
  } catch (e) {
    if (!isMissingTableError(e as { code?: string })) throw e;
  }
  redirect(`${base(assessmentId)}?deleted=1`);
}

/**
 * 이 고민으로 새 리포트 발급하기 — 지금 저장된 고민을 기록으로 남기고 결제 화면으로 보낸다.
 * 기존 개인 통합 리포트는 덮어쓰지 않고, 새 리포트는 별도 주문 · 별도 리포트로 만든다.
 * 같은 저장본으로 두 번 눌러도 같은 주문으로 이어진다 (서비스의 멱등 처리).
 */
export async function startConcernCheckoutAction(assessmentId: string) {
  const member = await getMember();
  if (!member || member.needsConsent) redirect(`/results/${assessmentId}`);
  const config = paymentConfig();
  if (!config.ok) redirect(`${base(assessmentId)}?issue=payments`);

  const result = await startConcernCheckout(
    { repo: writeRepository(), now, gate: saleGateCheck, issuing: issuingAvailability() },
    { userId: member.userId, assessmentId, paymentEnv: paymentEnvOf(config), acquisition: await readAcquisition() },
  );
  if (result.kind === "not-found") notFound();
  if (result.kind === "order") redirect(`/checkout/${result.order.orderNumber}`);
  if (result.kind === "already-issued") redirect(`${base(assessmentId)}/${result.record.id}`);
  // 발급할 수 없는 경우: 결제는 시작하지 않았고, 기록소 화면이 사유를 알려 준다
  redirect(`${base(assessmentId)}?issue=${result.kind === "unavailable" ? result.reason : result.kind}`);
}

/** 고민 기록의 리포트 다시 만들기 — 같은 주문 · 같은 리포트 건으로 다시 시도한다 (추가 결제 없음). 생성은 백그라운드 */
export async function retryConcernReportAction(assessmentId: string, recordId: string) {
  const member = await getMember();
  if (!member || member.needsConsent) redirect(`/results/${assessmentId}`);
  const view = await getConcernRecordView(writeRepository(), { userId: member.userId, assessmentId, recordId });
  if (!view) notFound();
  let waiting: "capacity" | "cooldown" | undefined;
  if (view.paidOrder && view.report?.status !== "ready") waiting = (await claimAndSchedule(view.paidOrder, { retryFailed: true })).waiting;
  // 방금 시도한 직후이거나 순서를 기다리는 중이면 이유를 알려 준다 (결제는 그대로 유효)
  redirect(`${base(assessmentId)}/${recordId}${waiting ? `?retry=${waiting}` : ""}`);
}

/** 기록 화면의 생성 상태 확인 (몇 초마다). 대기 중이거나 멈춘 작업이 있으면 여기서 이어받는다 */
export async function concernReportStatusAction(assessmentId: string, recordId: string): Promise<ReportStatusResult> {
  const none: ReportStatusResult = { status: null, canRetry: false, waiting: null, delayed: false };
  const member = await getMember();
  if (!member || member.needsConsent) return none;
  const view = await getConcernRecordView(await readRepository(), { userId: member.userId, assessmentId, recordId });
  if (!view?.paidOrder) return none;
  let report = view.report;
  let waiting: ReportStatusResult["waiting"] = null;
  if (!report || report.status === "queued" || report.status === "generating") {
    const claimed = await claimAndSchedule(view.paidOrder);
    report = claimed.report ?? report;
    waiting = claimed.waiting ?? null;
  }
  const inProgress = report?.status === "queued" || report?.status === "generating";
  const delayed = Boolean(inProgress && report && now().getTime() - new Date(report.createdAt).getTime() > REPORT_SLA_MS);
  return { status: report?.status ?? null, canRetry: canRetryReport(report), waiting, delayed };
}

/** 그때 적은 고민 내용 지우기 — 리포트 · 기록 자리 · 주제 · 작성 시점은 남는다 */
export async function scrubConcernRecordAction(assessmentId: string, recordId: string) {
  const member = await getMember();
  if (!member || member.needsConsent) redirect(`/results/${assessmentId}`);
  const result = await scrubRecordContent(writeRepository(), { userId: member.userId, assessmentId, recordId, now });
  if (result.kind === "not-found") notFound();
  redirect(`${base(assessmentId)}/${recordId}?${result.kind === "scrubbed" ? "scrubbed=1" : "scrub=blocked"}`);
}
