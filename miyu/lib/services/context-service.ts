// 나를 더 반영하기 — 보기 · 저장 · 지우기. 본인 검사 결과에만.
// 저장한 내용은 리포트를 만들 때 해석의 초점과 예시를 고르는 데만 쓴다 (사주 계산은 그대로).

import { normalizeContextInput, type PersonalContext } from "../personalization/context.ts";
import type { AssessmentRecord, MiyuRepository, ReportRecord } from "./ports.ts";

export type ContextView = {
  assessment: AssessmentRecord;
  context: PersonalContext | null;
  /** 결제한 리포트의 상태 — 이미 만들었거나 만드는 중이면, 고친 내용은 그 리포트에 반영되지 않는다 */
  reportStatus: ReportRecord["status"] | null;
};

async function ownedAssessment(repo: MiyuRepository, userId: string, assessmentId: string) {
  const assessment = await repo.getAssessment(assessmentId);
  return assessment && assessment.userId === userId ? assessment : null;
}

/** 본인 것이 아니면 null (화면에서는 '찾을 수 없음') */
export async function getContextView(repo: MiyuRepository, input: { userId: string; assessmentId: string }): Promise<ContextView | null> {
  const assessment = await ownedAssessment(repo, input.userId, input.assessmentId);
  if (!assessment) return null;
  const [context, orders] = await Promise.all([repo.getContext(assessment.id), repo.listOrdersForAssessment(assessment.id)]);
  const paid = orders.find((o) => o.status === "paid");
  const report = paid ? await repo.getReportByOrder(paid.id) : null;
  return { assessment, context, reportStatus: report?.status ?? null };
}

export type SaveContextResult =
  | { kind: "saved"; context: PersonalContext; redactions: number }
  | { kind: "invalid"; errors: string[] }
  | { kind: "not-found" };

export async function saveContext(
  repo: MiyuRepository,
  input: { userId: string; assessmentId: string; raw: Record<string, unknown>; agreed: boolean; now: () => Date },
): Promise<SaveContextResult> {
  const assessment = await ownedAssessment(repo, input.userId, input.assessmentId);
  if (!assessment) return { kind: "not-found" };
  const normalized = normalizeContextInput(input.raw);
  const errors = normalized.ok ? [] : [...normalized.errors];
  if (!input.agreed) errors.push("리포트 해석에 반영하는 데 동의해야 저장할 수 있습니다.");
  if (!normalized.ok || errors.length) return { kind: "invalid", errors };
  const context = await repo.upsertContext({
    ...normalized.value,
    assessmentId: assessment.id,
    userId: input.userId,
    agreedAt: input.now().toISOString(),
  });
  return { kind: "saved", context, redactions: normalized.redactions };
}

/** 지우기 — 이미 만든 리포트는 그대로 남는다 (구매한 리포트는 같은 버전을 보여 준다) */
export async function deleteContext(repo: MiyuRepository, input: { userId: string; assessmentId: string }): Promise<boolean> {
  const assessment = await ownedAssessment(repo, input.userId, input.assessmentId);
  if (!assessment) return false;
  await repo.deleteContext(assessment.id);
  return true;
}
