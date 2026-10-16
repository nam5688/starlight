// 초대 링크 · 초대 할인(운영자 2026-10-16) — 심층 리포트를 산 회원이 링크를 만들고, 링크로 들어온 사람이 처음 살 때 5,900원(정가 9,900원).
// 모든 판단(할인 대상인지 · 한도 · 첫 구매 · 본인 링크)은 서버(DB 함수)가 하고, 화면 · 브라우저가 보내는 값은 믿지 않는다.
// 링크에는 이름 · 생년월일이 없고 무작위 토큰뿐이다. 궁합(심층 궁합)은 별도 유료이며 이 파일의 범위가 아니다.
import { createInviteToken, isInviteToken, type InviteDiscountCheck, type InviteDiscountReason } from "../commerce/invite.ts";
import { INVITE_DISCOUNT, PERSONAL_REPORT } from "../config/product.ts";
import type { MiyuRepository } from "./ports.ts";
import { paidPersonalOrders } from "./purchases.ts";
import { owns } from "./talk-service.ts";

const missingTable = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";

/** 결과 화면의 "친구 초대" 구역 상태 — locked: 심층 리포트를 받기 전(링크를 만들 수 없다) · unavailable: DB 18번 전 · available: 링크(없으면 token null) + 쓴 자리 */
export type InviteView =
  | { kind: "locked" }
  | { kind: "unavailable" }
  | { kind: "available"; token: string | null; used: number; cap: number; priceKrw: number; listKrw: number };

async function paidHere(repo: MiyuRepository, assessmentId: string): Promise<boolean> {
  return paidPersonalOrders(await repo.listOrdersForAssessment(assessmentId)).length > 0;
}

export async function getInviteView(repo: MiyuRepository, input: { userId: string; assessmentId: string }): Promise<InviteView> {
  if (!(await owns(repo, input.userId, input.assessmentId))) return { kind: "locked" };
  if (!(await paidHere(repo, input.assessmentId))) return { kind: "locked" };
  try {
    const invite = await repo.getInviteByAssessment(input.userId, input.assessmentId);
    const used = await repo.countInviteDiscountsUsed(input.userId);
    return { kind: "available", token: invite?.token ?? null, used, cap: INVITE_DISCOUNT.maxPerInviter, priceKrw: INVITE_DISCOUNT.priceKrw, listKrw: PERSONAL_REPORT.priceKrw };
  } catch (e) {
    if (missingTable(e)) return { kind: "unavailable" };
    throw e;
  }
}

export type CreateInviteResult = { ok: true; view: Extract<InviteView, { kind: "available" }> } | { ok: false; reason: "not-found" | "not-paid" | "not-ready" };

/** 초대 링크 만들기 — 심층 리포트를 받은 결과의 주인만. 이미 있으면 그 링크를 그대로 돌려준다(결과마다 하나) */
export async function createInviteLink(repo: MiyuRepository, input: { userId: string; assessmentId: string; newToken?: () => string }): Promise<CreateInviteResult> {
  if (!(await owns(repo, input.userId, input.assessmentId))) return { ok: false, reason: "not-found" };
  if (!(await paidHere(repo, input.assessmentId))) return { ok: false, reason: "not-paid" };
  try {
    await repo.createInvite({ userId: input.userId, assessmentId: input.assessmentId, token: (input.newToken ?? createInviteToken)(), tier: "deep" });
  } catch (e) {
    if (missingTable(e)) return { ok: false, reason: "not-ready" };
    throw e;
  }
  const view = await getInviteView(repo, input);
  return view.kind === "available" ? { ok: true, view } : { ok: false, reason: "not-ready" };
}

/** 결과 화면 구매 영역의 가격 표시 — eligible일 때만 정가와 초대 가격을 함께 보인다(운영자 예외). 어떤 이유로든 확인하지 못하면 정가만 보인다 */
export type InviteQuote = { kind: "eligible"; priceKrw: number; listKrw: number } | { kind: "none"; reason: InviteDiscountReason | null };

export async function quoteInviteDiscount(repo: MiyuRepository, input: { token: string | null | undefined; userId: string }): Promise<InviteQuote> {
  if (!isInviteToken(input.token)) return { kind: "none", reason: null };
  try {
    const r = await repo.inviteDiscountStatus({ token: input.token, inviteeUserId: input.userId, cap: INVITE_DISCOUNT.maxPerInviter });
    return r.ok ? { kind: "eligible", priceKrw: INVITE_DISCOUNT.priceKrw, listKrw: PERSONAL_REPORT.priceKrw } : { kind: "none", reason: r.reason };
  } catch {
    return { kind: "none", reason: null };
  }
}

/** 초대 링크 첫 화면 — 로그인하지 않은 사람도 본다. 열려 있는가(초대 가격 자리가 남았는가)만 알려 주고 초대한 사람 · 한도 숫자는 보이지 않는다 */
export type InviteLanding = { kind: "open" } | { kind: "closed"; reason: InviteDiscountReason | null };

/** 아무 회원도 아닌 가상의 확인용 번호 — 링크 · 초대한 사람 · 한도만 확인한다(본인 링크 · 구매 이력 확인은 건너뛴다) */
const NOBODY = "00000000-0000-0000-0000-000000000000";

export async function inviteLanding(repo: MiyuRepository, token: string): Promise<InviteLanding> {
  if (!isInviteToken(token)) return { kind: "closed", reason: "invalid" };
  try {
    const r: InviteDiscountCheck = await repo.inviteDiscountStatus({ token, inviteeUserId: NOBODY, cap: INVITE_DISCOUNT.maxPerInviter });
    return r.ok ? { kind: "open" } : { kind: "closed", reason: r.reason };
  } catch {
    return { kind: "closed", reason: null };
  }
}
