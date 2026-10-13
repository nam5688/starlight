// 내 고민 자세히 알려주기 — 보기 · 저장 · 지우기. 본인 검사 결과에만.
// 저장한 내용은 (1) 구매 전에 만드는 개인 통합 리포트의 해석 초점과 예시, (2) 새 리포트를 발급할 때의 고민 기록으로만 쓴다 (사주 계산은 그대로).
// 고민을 쓰고 · 고치고 · 저장하는 것은 리포트를 만들지 않는다. 새 리포트 발급은 concern-service에서 따로 시작한다.

import { isPersonalProduct } from "../config/product.ts";
import { sameConcern } from "../personalization/concern.ts";
import { normalizeContextInput, type PersonalContext } from "../personalization/context.ts";
import { discardUnissuedRecords } from "./concern-service.ts";
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
  const paid = orders.find((o) => o.status === "paid" && isPersonalProduct(o.productId));
  const report = paid ? await repo.getReportByOrder(paid.id) : null;
  return { assessment, context, reportStatus: report?.status ?? null };
}

export type SaveContextResult =
  /** changed: 이전 저장 내용과 달라 저장 시점이 바뀜 (같은 내용을 다시 저장하면 바뀌지 않는다) */
  | { kind: "saved"; context: PersonalContext; redactions: number; changed: boolean }
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
  // 같은 내용을 다시 저장하면 저장 시점을 바꾸지 않는다 (고친 것이 없는데 "수정했다"로 보지 않는다)
  const prev = await repo.getContext(assessment.id);
  if (prev && sameConcern(prev, normalized.value)) return { kind: "saved", context: prev, redactions: normalized.redactions, changed: false };
  const context = await repo.upsertContext({
    ...normalized.value,
    assessmentId: assessment.id,
    userId: input.userId,
    agreedAt: input.now().toISOString(),
  });
  // 결제 없이 남은 임시 저장본(이전 고민)은 지운다 — 발급한 기록 · 결제 대기 중인 기록은 그대로 둔다
  await discardUnissuedRecords(repo, { assessmentId: assessment.id, now: input.now }).catch(() => {});
  return { kind: "saved", context, redactions: normalized.redactions, changed: true };
}

/** 지우기 — 이미 만든 리포트와 발급한 고민 기록은 그대로 남는다 (구매한 리포트는 같은 버전을 보여 준다) */
export async function deleteContext(repo: MiyuRepository, input: { userId: string; assessmentId: string; now?: () => Date }): Promise<boolean> {
  const assessment = await ownedAssessment(repo, input.userId, input.assessmentId);
  if (!assessment) return false;
  await repo.deleteContext(assessment.id);
  await discardUnissuedRecords(repo, { assessmentId: assessment.id, now: input.now ?? (() => new Date()) }).catch(() => {});
  return true;
}
