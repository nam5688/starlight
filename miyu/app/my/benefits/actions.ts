"use server";

import { revalidatePath } from "next/cache";
import { COUPON_REASON_TEXT } from "@/lib/commerce/benefits";
import { createReferralLink, redeemCouponCode } from "@/lib/services/benefit-service";
import { getMember } from "@/server/member";
import { logError } from "@/server/ops";
import { benefitRepository, now, writeRepository } from "@/server/services";

// MY 혜택의 동작 — 로그인한 본인 것만, 지급 · 확정은 서버(DB 함수)가 한다. 화면이 보낸 금액 · 수량은 받지 않는다.

export type BenefitFormState = { ok: boolean; message: string } | null;

const deps = () => ({ repo: writeRepository(), benefits: benefitRepository(), now });

/** 쿠폰 코드 입력 — 질문권 쿠폰은 바로 지급하고, 할인 · 무료 이용권은 결제 화면에서 쓴다고 안내한다 */
export async function redeemCouponAction(_prev: BenefitFormState, formData: FormData): Promise<BenefitFormState> {
  const member = await getMember();
  if (!member || member.needsConsent) return { ok: false, message: "로그인이 필요해요." };
  const code = String(formData.get("code") ?? "").slice(0, 64);
  // 같은 입력을 두 번 보내도(두 번 클릭 · 새로고침) 한 번만 지급되도록 요청마다 정해진 키는 화면이 만든 값을 쓴다 — 없으면 이 요청의 고유 값
  const rawKey = String(formData.get("key") ?? "");
  const key = /^[A-Za-z0-9-]{8,64}$/.test(rawKey) ? `coupon-form:${member.userId}:${rawKey}` : `coupon-form:${member.userId}:${globalThis.crypto.randomUUID()}`;
  try {
    const r = await redeemCouponCode(deps(), { userId: member.userId, code, key });
    switch (r.kind) {
      case "credited":
        revalidatePath("/my/benefits");
        return { ok: true, message: `질문권 ${r.qty}개가 들어왔어요.` };
      case "use-at-checkout":
        return { ok: true, message: "이 쿠폰은 심층 리포트를 결제할 때 코드를 넣어서 써 주세요." };
      case "denied":
        return { ok: false, message: COUPON_REASON_TEXT[r.reason] ?? "쿠폰을 적용할 수 없어요." };
      case "off":
        return { ok: false, message: "지금은 쿠폰을 받지 않아요." };
      case "not-ready":
        return { ok: false, message: "혜택 기능을 준비하고 있어요. 잠시 뒤에 다시 시도해 주세요." };
    }
  } catch (e) {
    logError("benefits.coupon", e);
    return { ok: false, message: "처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요." };
  }
}

/** 내 추천 링크 만들기(이미 있으면 그 링크) */
export async function createReferralLinkAction(): Promise<BenefitFormState> {
  const member = await getMember();
  if (!member || member.needsConsent) return { ok: false, message: "로그인이 필요해요." };
  try {
    const r = await createReferralLink(deps(), member.userId, () => globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12) + globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12));
    if (!r.ok) return { ok: false, message: r.reason === "off" ? "지금은 친구 초대를 받지 않아요." : "혜택 기능을 준비하고 있어요." };
    revalidatePath("/my/benefits");
    return { ok: true, message: "초대 링크를 만들었어요." };
  } catch (e) {
    logError("benefits.referral-link", e);
    return { ok: false, message: "처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요." };
  }
}
