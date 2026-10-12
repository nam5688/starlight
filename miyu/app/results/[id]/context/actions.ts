"use server";

import { redirect } from "next/navigation";
import { CONTEXT_FIELDS } from "@/lib/personalization/context";
import { deleteContext, saveContext } from "@/lib/services/context-service";
import { getMember } from "@/server/member";
import { isMissingTableError } from "@/lib/integrations/supabase/repository";
import { now, writeRepository } from "@/server/services";

const NOT_READY = "이 기능을 쓰려면 운영자가 DB 변경 5번(20261015000000_personal_context.sql)을 먼저 적용해야 합니다.";

export type ContextFormState = { errors: string[]; values: Record<string, string> | null };

/** 저장 — 서버가 소유자 · 글자 수 · 동의를 확인하고, 연락처 · 이메일처럼 보이는 내용은 가려서 저장한다 */
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
  redirect(`/results/${assessmentId}/context?saved=1${result.redactions ? `&redacted=${result.redactions}` : ""}`);
}

/** 지우기 — 저장한 내용을 삭제한다. 이미 만든 리포트는 그대로 남는다 */
export async function deleteContextAction(assessmentId: string) {
  const member = await getMember();
  if (!member || member.needsConsent) redirect(`/results/${assessmentId}`);
  try {
    await deleteContext(writeRepository(), { userId: member.userId, assessmentId });
  } catch (e) {
    if (!isMissingTableError(e as { code?: string })) throw e;
  }
  redirect(`/results/${assessmentId}/context?deleted=1`);
}
