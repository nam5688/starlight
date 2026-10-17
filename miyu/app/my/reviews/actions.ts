"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ReviewDoneCode, ReviewFieldErrors } from "@/lib/commerce/reviews";
import { createReview, deleteReview, editReview, setReviewVisibility } from "@/lib/services/review-service";
import { getMember } from "@/server/member";
import { logError, recordOps } from "@/server/ops";
import { reviewDeps } from "@/server/reviews";

// 내 후기 동작 — 로그인한 본인 것만, 이용 자격 · 중복 · 보상은 서버(서비스 + DB)가 정한다. 화면이 보낸 종류 · 이용 건 번호 · 보상 값은 믿지 않고 다시 확인한다.
// 서버 로그 · 운영 기록에는 후기 번호 · 종류 · 결과만 남기고 후기 글은 어디에도 넣지 않는다. 성공하면 MY 후기 화면으로 돌아가 안내를 보인다(안내 문장은 done 이름으로 화면이 정한다).

export type ReviewFormState = { ok: boolean; message: string; errors?: ReviewFieldErrors } | null;

const done = (code: ReviewDoneCode) => redirect(`/my/reviews?done=${code}`);
const str = (v: FormDataEntryValue | null, max: number) => String(v ?? "").slice(0, max);

/** 후기 쓰기(id가 없으면) 또는 고치기(id가 있으면) — 입력 오류는 화면에 돌려주고, 성공하면 목록으로 돌아간다 */
export async function saveReviewAction(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const member = await getMember();
  if (!member || member.needsConsent) return { ok: false, message: "로그인이 필요해요." };
  const id = str(formData.get("id"), 64);
  const input = { rating: formData.get("rating"), body: str(formData.get("body"), 4000), publicConsent: formData.get("publicConsent") };
  let code: ReviewDoneCode;
  try {
    const deps = reviewDeps();
    if (id) {
      const r = await editReview(deps, { userId: member.userId, id, ...input });
      if (r.kind === "invalid") return { ok: false, message: "입력을 확인해 주세요.", errors: r.errors };
      if (r.kind === "not-found") return { ok: false, message: "고칠 수 있는 후기를 찾지 못했어요. 이미 지웠거나 내 후기가 아니에요." };
      if (r.kind === "not-ready") return { ok: false, message: "후기 기능을 준비하고 있어요. 잠시 뒤에 다시 시도해 주세요." };
      await recordOps({ kind: "review.updated", message: `후기 수정: ${id.slice(0, 8)}` });
      code = "updated";
    } else {
      const r = await createReview(deps, { userId: member.userId, kind: str(formData.get("kind"), 20), ref: str(formData.get("ref"), 64), ...input });
      switch (r.kind) {
        case "invalid":
          return { ok: false, message: "입력을 확인해 주세요.", errors: r.errors };
        case "not-eligible":
          return { ok: false, message: "이 이용 건에는 후기를 쓸 수 없어요. 결제가 끝나고 리포트가 완성된 내 이용 건(또는 AI 질문에 답을 받은 상담)만 쓸 수 있어요." };
        case "exists":
          return { ok: false, message: "이미 이 이용 건의 후기를 쓰셨어요. 아래 ‘내가 쓴 후기’에서 고칠 수 있어요." };
        case "blocked":
          return { ok: false, message: "운영 기준에 따라 삭제된 후기라 다시 쓸 수 없어요." };
        case "not-ready":
          return { ok: false, message: "후기 기능을 준비하고 있어요. 잠시 뒤에 다시 시도해 주세요." };
        case "created":
        case "revived":
          await recordOps({ kind: `review.${r.kind}`, message: `후기 ${r.kind === "created" ? "작성" : "다시 작성"}: ${r.review.id.slice(0, 8)} · ${r.review.kind} · 보상 ${r.reward}` });
          code = r.kind === "revived" ? "revived" : r.reward === "granted" ? "created_reward" : r.reward === "pending" || r.reward === "failed" ? "created_pending" : "created";
          break;
      }
    }
  } catch (e) {
    logError("reviews.save", e);
    return { ok: false, message: "처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요." };
  }
  revalidatePath("/my/reviews");
  revalidatePath("/reviews");
  revalidatePath("/");
  return done(code);
}

/** 공개 ↔ 나만 보기 전환 */
export async function setReviewVisibilityAction(formData: FormData): Promise<void> {
  const member = await getMember();
  if (!member || member.needsConsent) return done("error");
  let code: ReviewDoneCode = "error";
  try {
    const toPublic = formData.get("to") === "public";
    const r = await setReviewVisibility(reviewDeps(), { userId: member.userId, id: str(formData.get("id"), 64), publicConsent: toPublic });
    if (r.kind === "updated") code = toPublic ? "public" : "private";
  } catch (e) {
    logError("reviews.visibility", e);
  }
  revalidatePath("/my/reviews");
  revalidatePath("/reviews");
  revalidatePath("/");
  return done(code);
}

/** 후기 지우기 — 글만 지우고 묘비를 남긴다(같은 이용 건에 보상이 또 생기지 않는다) */
export async function deleteReviewAction(formData: FormData): Promise<void> {
  const member = await getMember();
  if (!member || member.needsConsent) return done("error");
  let code: ReviewDoneCode = "error";
  try {
    const id = str(formData.get("id"), 64);
    const r = await deleteReview(reviewDeps(), { userId: member.userId, id });
    if (r.kind === "deleted") {
      code = "deleted";
      await recordOps({ kind: "review.deleted", message: `후기 삭제: ${id.slice(0, 8)}` });
    }
  } catch (e) {
    logError("reviews.delete", e);
  }
  revalidatePath("/my/reviews");
  revalidatePath("/reviews");
  revalidatePath("/");
  return done(code);
}
