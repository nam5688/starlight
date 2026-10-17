"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { couponTimeOf, SETTING_FIELDS } from "@/lib/commerce/benefits";
import { decideReferral, revokeReferral } from "@/lib/services/benefit-admin-service";
import { changeBenefitSetting, createCouponByAdmin, setCouponStatusByAdmin, type CouponDraft } from "@/lib/services/benefit-service";
import type { CouponStatus, ExpenseKind } from "@/lib/services/benefit-ports";
import { getAdminMember } from "@/server/member";
import { logError, recordOps } from "@/server/ops";
import { benefitRepository, now, writeRepository } from "@/server/services";

// 혜택 관리자 동작 — 모두 서버에서 관리자 여부를 다시 확인하고 운영 기록(ops_events)에 남긴다.
// 기록에는 항목 이름 · 회원번호 앞 8자 · 결과만 담는다(이름 · 생년월일 · 응답 · 고민 없음). 실제 지급은 서버 설정이 켜져 있을 때만 일어난다.

const page = (note: string, tab = "", extra = "") => redirect(`/admin/benefits?${tab ? `tab=${encodeURIComponent(tab)}&` : ""}note=${encodeURIComponent(note)}${extra}`);

async function admin() {
  const a = await getAdminMember();
  if (!a) redirect("/");
  return a;
}

const deps = () => ({ repo: writeRepository(), benefits: benefitRepository(), now });
const clip = (v: FormDataEntryValue | null, n: number) => String(v ?? "").trim().slice(0, n);

/** 설정 한 줄 바꾸기(스위치 · 숫자 · 구간 · 교환가) — 사유는 필수이고 이전 값과 함께 이력에 남는다 */
export async function changeSettingAction(formData: FormData) {
  const a = await admin();
  const key = clip(formData.get("key"), 80);
  const field = SETTING_FIELDS.find((f) => f.key === key);
  if (!field) page("알 수 없는 설정이에요.");
  const kind = field!.kind;
  const rawValue = clip(formData.get("value"), 2000);
  let value: unknown = rawValue;
  try {
    if (kind === "flag") value = rawValue === "on" || rawValue === "true";
    else if (kind === "int") value = rawValue === "" ? null : Number(rawValue);
    else value = JSON.parse(rawValue);
  } catch {
    page("값 형식이 올바르지 않아요.", field!.group);
  }
  try {
    const r = await changeBenefitSetting(deps(), { key, value, reason: clip(formData.get("reason"), 200), by: a.userId });
    if (!r.ok) page(r.message, field!.group);
    await recordOps({ kind: "admin.benefit_setting", message: `혜택 설정 변경: ${key}` });
    revalidatePath("/admin/benefits");
    page(r.ok && r.changed ? "저장했어요. 변경 이력에 남았어요." : "값이 같아 바꾸지 않았어요.", field!.group);
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    logError("admin.benefit-setting", e);
    page("저장하지 못했어요. 서버 기록을 확인해 주세요.", field!.group);
  }
}

/** 쿠폰 만들기(처음에는 초안 상태 — 켜기 전에는 쓰이지 않는다) */
export async function createCouponAction(formData: FormData) {
  const a = await admin();
  const num = (k: string) => {
    const v = clip(formData.get(k), 20);
    return v === "" ? null : Number(v);
  };
  const startsAt = couponTimeOf(clip(formData.get("startsAt"), 40));
  const endsAt = couponTimeOf(clip(formData.get("endsAt"), 40));
  if (startsAt === undefined || endsAt === undefined) page("쿠폰 시작 · 끝 시각을 확인해 주세요.", "coupons");
  const draft: CouponDraft = {
    code: clip(formData.get("code"), 40),
    name: clip(formData.get("name"), 80),
    description: clip(formData.get("description"), 200) || null,
    type: clip(formData.get("type"), 40),
    value: num("value") ?? 0,
    perUserLimit: num("perUserLimit") ?? 1,
    issueLimit: num("issueLimit"),
    startsAt: startsAt ?? null,
    endsAt: endsAt ?? null,
    purpose: clip(formData.get("purpose"), 20) || "promo",
    targetUserId: /^[0-9a-f-]{36}$/.test(clip(formData.get("targetUserId"), 40)) ? clip(formData.get("targetUserId"), 40) : null,
    reviewRewardEligible: formData.get("reviewRewardEligible") === "on",
    stackableWithReferral: formData.get("stackableWithReferral") === "on",
    creditExpireDays: num("creditExpireDays"),
  };
  try {
    const r = await createCouponByAdmin(deps(), draft, a.userId);
    if (!r.ok) page(r.message, "coupons");
    await recordOps({ kind: "admin.coupon_create", message: `쿠폰 만들기: ${draft.code.toUpperCase()}` });
    revalidatePath("/admin/benefits");
    page("쿠폰을 초안으로 만들었어요. 목록에서 [켜기]를 눌러야 쓸 수 있어요.", "coupons");
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    logError("admin.coupon-create", e);
    page("쿠폰을 만들지 못했어요.", "coupons");
  }
}

const STATUSES: CouponStatus[] = ["draft", "active", "paused", "revoked"];

export async function setCouponStatusAction(formData: FormData) {
  await admin();
  const id = clip(formData.get("id"), 40);
  const status = clip(formData.get("status"), 20) as CouponStatus;
  if (!/^[0-9a-f-]{36}$/.test(id) || !STATUSES.includes(status)) page("올바르지 않은 요청이에요.", "coupons");
  try {
    const ok = await setCouponStatusByAdmin(deps(), id, status);
    await recordOps({ kind: "admin.coupon_status", message: `쿠폰 상태 변경: ${status}` });
    revalidatePath("/admin/benefits");
    page(ok ? "쿠폰 상태를 바꿨어요." : "바꾸지 못했어요.", "coupons");
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    logError("admin.coupon-status", e);
    page("바꾸지 못했어요.", "coupons");
  }
}

/** 검토 중인 추천 가입을 이유와 함께 확정하거나 거절한다 */
export async function decideReferralAction(formData: FormData) {
  const a = await admin();
  const invitee = clip(formData.get("invitee"), 40);
  const decision = clip(formData.get("decision"), 10) === "confirm" ? "confirm" : "reject";
  if (!/^[0-9a-f-]{36}$/.test(invitee)) page("올바르지 않은 요청이에요.", "referral");
  try {
    const r = await decideReferral(deps(), { inviteeUserId: invitee, decision, reason: clip(formData.get("reason"), 200), by: a.userId });
    await recordOps({ kind: "admin.referral_decide", message: `추천 가입 ${decision === "confirm" ? "확정" : "거절"}: ${invitee.slice(0, 8)} → ${r.ok ? r.status : "실패"}` });
    revalidatePath("/admin/benefits");
    page(r.ok ? (r.status === "confirmed" ? `확정했어요(${r.points ?? 0}P 지급).` : "거절했어요.") : r.message, "referral");
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    logError("admin.referral-decide", e);
    page("처리하지 못했어요.", "referral");
  }
}

/** 확정된 추천 가입을 부정으로 판단해 회수한다(쓰지 않은 보상만 — 이미 쓴 몫은 회수하지 못한 몫으로 기록) */
export async function revokeReferralAction(formData: FormData) {
  const a = await admin();
  const invitee = clip(formData.get("invitee"), 40);
  if (!/^[0-9a-f-]{36}$/.test(invitee)) page("올바르지 않은 요청이에요.", "referral");
  try {
    const r = await revokeReferral(deps(), { inviteeUserId: invitee, reason: clip(formData.get("reason"), 200), by: a.userId });
    await recordOps({ kind: "admin.referral_revoke", message: `추천 가입 회수: ${invitee.slice(0, 8)} → ${r.ok ? "회수" : "실패"}` });
    revalidatePath("/admin/benefits");
    page(r.ok ? "회수했어요(쓰지 않은 보상만)." : (r.message ?? "회수하지 못했어요."), "referral");
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    logError("admin.referral-revoke", e);
    page("회수하지 못했어요.", "referral");
  }
}

/** 광고비 · 고정비 입력(월 단위) — 손익 화면의 입력이다 */
export async function addExpenseAction(formData: FormData) {
  const a = await admin();
  const month = clip(formData.get("month"), 7);
  const kind = clip(formData.get("kind"), 10) as ExpenseKind;
  const amount = Number(clip(formData.get("amountKrw"), 12));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !["ad", "fixed", "other"].includes(kind) || !Number.isInteger(amount) || amount < 0 || amount > 1_000_000_000) page("월(YYYY-MM) · 종류 · 금액(원)을 확인해 주세요.", "finance");
  try {
    await benefitRepository().addExpense({ month, kind, amountKrw: amount, memo: clip(formData.get("memo"), 100) || null, by: a.userId });
    revalidatePath("/admin/benefits");
    page("비용을 기록했어요.", "finance", `&month=${month}`);
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    logError("admin.expense", e);
    page("기록하지 못했어요.", "finance", `&month=${month}`);
  }
}

export async function deleteExpenseAction(formData: FormData) {
  await admin();
  const id = Number(clip(formData.get("id"), 12));
  if (!Number.isInteger(id) || id < 1) page("올바르지 않은 요청이에요.", "finance");
  try {
    await benefitRepository().deleteExpense(id);
    revalidatePath("/admin/benefits");
    page("지웠어요.", "finance");
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    logError("admin.expense-delete", e);
    page("지우지 못했어요.", "finance");
  }
}

/** 혜택 정기 점검을 지금 한 번 돌린다(만료 정리 · 추천 확정 조건 확인 · 적립 누락 보정) */
export async function runBenefitMaintenanceAction() {
  await admin();
  try {
    const r = await benefitRepository().runMaintenance();
    await recordOps({ kind: "admin.benefit_maintenance", message: `혜택 점검: 포인트 만료 ${r.expiredPointLots}건 · 질문권 만료 ${r.expiredCreditLots}건 · 추천 확정 ${r.referralConfirmed}건` });
    revalidatePath("/admin/benefits");
    page(`점검을 마쳤어요 — 포인트 만료 ${r.expiredPointLots} · 질문권 만료 ${r.expiredCreditLots} · 적립 보정 ${r.earnedBackfill} · 추천 확정 ${r.referralConfirmed}`, "overview");
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    logError("admin.benefit-maintenance", e);
    page("점검을 실행하지 못했어요(DB 19~22번 적용 여부를 확인하세요).", "overview");
  }
}
