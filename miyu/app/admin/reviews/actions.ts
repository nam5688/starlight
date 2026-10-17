"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { REVIEW_ACTION_LABEL, type ReviewAdminAction } from "@/lib/commerce/reviews";
import { applyReviewAction } from "@/lib/services/review-admin-service";
import { retryReviewRewards } from "@/lib/services/review-service";
import { getAdminMember } from "@/server/member";
import { logError, recordOps } from "@/server/ops";
import { reviewDeps } from "@/server/reviews";

// 후기 관리자 동작 — 모두 서버에서 관리자 여부를 다시 확인하고, 사유 분류와 함께 이력(review_admin_log)에 남기며, 운영 기록(ops_events)에는 후기 번호 · 조치 · 결과만 남긴다.
// 후기 글 · 메모는 운영 기록에 넣지 않는다. 부정적인 내용이라는 이유로는 조치할 수 없다(사유 분류에 없다).

const ACTIONS: readonly ReviewAdminAction[] = ["hide", "unhide", "delete", "feature", "unfeature", "dismiss_reports"];
const page = (note: string) => redirect(`/admin/reviews?note=${encodeURIComponent(note)}`);
const clip = (v: FormDataEntryValue | null, n: number) => String(v ?? "").trim().slice(0, n);

async function admin() {
  const a = await getAdminMember();
  if (!a) redirect("/");
  return a;
}

/** 숨김 · 숨김 해제 · 삭제 · 메인 선정 · 선정 해제 · 신고 기각 — 사유 분류는 필수(기타는 메모 필수) */
export async function reviewAdminAction(formData: FormData): Promise<void> {
  const a = await admin();
  const action = clip(formData.get("action"), 20) as ReviewAdminAction;
  const id = clip(formData.get("id"), 64);
  if (!ACTIONS.includes(action) || !/^[0-9a-f-]{36}$/i.test(id)) page("알 수 없는 조치예요.");
  let note = "처리하지 못했어요. 서버 기록을 확인해 주세요.";
  try {
    const r = await applyReviewAction(reviewDeps(), { reviewId: id, action, reasonCode: clip(formData.get("reason"), 40), memo: clip(formData.get("memo"), 200), adminId: a.userId });
    if (r.ok) {
      await recordOps({ kind: `admin.review_${action}`, message: `후기 ${REVIEW_ACTION_LABEL[action]}: ${id.slice(0, 8)}` });
      revalidatePath("/admin/reviews");
      revalidatePath("/reviews");
      revalidatePath("/");
      note = `${REVIEW_ACTION_LABEL[action]}을(를) 처리했어요. 조치 이력에 남았어요.`;
    } else {
      note = r.message;
    }
  } catch (e) {
    logError("admin.review-action", e);
  }
  page(note);
}

/** 보상이 확정되지 않은 후기(지급 확인 중 · 실패)를 다시 맞춘다 — 같은 지급 키라 질문권은 한 번만 들어간다 */
export async function reviewRetryRewardsAction(): Promise<void> {
  await admin();
  let note = "처리하지 못했어요. 서버 기록을 확인해 주세요.";
  try {
    const r = await retryReviewRewards(reviewDeps(), { limit: 100 });
    await recordOps({ kind: "admin.review_reward_retry", message: `후기 보상 다시 맞춤: ${r.tried}건 중 ${r.granted}건 확정` });
    revalidatePath("/admin/reviews");
    note = r.tried === 0 ? "다시 맞출 후기가 없어요(보상 스위치가 꺼져 있거나 확인 중인 후기가 없어요)." : `${r.tried}건을 확인해 ${r.granted}건의 보상을 확정했어요.`;
  } catch (e) {
    logError("admin.review-retry", e);
  }
  page(note);
}
