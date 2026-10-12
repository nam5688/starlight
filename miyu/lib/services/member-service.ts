// 회원 상태 — 가입 동의 확인·기록. 동의 전에는 검사 저장·결제를 하지 않는다.

import {
  CONSENT_ITEMS,
  hasRequiredConsents,
  marketingAgreed,
  TERMS_VERSION,
  type ConsentType,
} from "../membership/terms.ts";
import type { WithdrawalBlocker } from "../membership/withdrawal.ts";
import type { MiyuRepository } from "./ports.ts";

export type MemberStatus = {
  /** 현재 버전의 필수 약관에 동의하지 않았다 (신규 회원 또는 약관 변경) */
  needsConsent: boolean;
  /** 동의 기록이 하나도 없다 (처음 가입한 회원) */
  isNew: boolean;
  marketing: boolean;
};

export async function getMemberStatus(repo: MiyuRepository, userId: string): Promise<MemberStatus> {
  const records = await repo.listConsents(userId);
  return {
    needsConsent: !hasRequiredConsents(records),
    isNew: records.length === 0,
    marketing: marketingAgreed(records),
  };
}

export type AgreeResult = { ok: true } | { ok: false; message: string };

/** 가입 동의 기록. 필수 항목이 하나라도 빠지면 기록하지 않는다. */
export async function agreeToTerms(
  repo: MiyuRepository,
  userId: string,
  choices: Partial<Record<ConsentType, boolean>>,
): Promise<AgreeResult> {
  const missing = CONSENT_ITEMS.filter((i) => i.required && choices[i.type] !== true);
  if (missing.length > 0) return { ok: false, message: `필수 항목에 동의해 주세요: ${missing.map((m) => m.label).join(", ")}` };
  await repo.addConsents(
    userId,
    CONSENT_ITEMS.map((i) => ({ type: i.type, version: TERMS_VERSION, agreed: choices[i.type] === true })),
  );
  return { ok: true };
}

/** 마케팅 수신 동의 변경 (MY에서 언제든) */
export async function setMarketingConsent(repo: MiyuRepository, userId: string, agreed: boolean): Promise<void> {
  await repo.addConsents(userId, [{ type: "marketing", version: TERMS_VERSION, agreed }]);
}

/**
 * 가입 동의를 거절했을 때 계정을 지워도 되는지.
 * 저장한 검사·주문이 없는 신규 계정만 지운다 (기존 회원은 로그아웃만).
 */
export async function canRemoveOnDecline(repo: MiyuRepository, userId: string): Promise<boolean> {
  const [assessments, orders] = await Promise.all([repo.listAssessments(userId), repo.listOrdersForUser(userId)]);
  return assessments.length === 0 && orders.length === 0;
}

/** 탈퇴를 막는 상태 (진행 중인 결제 확인 · 리포트 생성) — 화면에서 미리 알려 주기 위한 확인. 실제 판단은 DB 함수가 다시 한다 */
export async function withdrawalBlockers(repo: MiyuRepository, userId: string, now: Date = new Date()): Promise<WithdrawalBlocker[]> {
  const [orders, reports] = await Promise.all([repo.listOrdersForUser(userId), repo.listReportStatuses(userId)]);
  const blockers: WithdrawalBlocker[] = [];
  if (orders.some((o) => o.userId === userId && o.status === "pending" && now.getTime() - new Date(o.createdAt).getTime() < 3600_000)) blockers.push("pending-order");
  if (reports.some((r) => r.status === "queued" || r.status === "generating")) blockers.push("report-in-progress");
  return blockers;
}

export type WithdrawResult =
  | { kind: "done"; counts: Record<string, number> }
  | { kind: "blocked"; reason: WithdrawalBlocker }
  | { kind: "not-found" };

/**
 * 회원 탈퇴의 데이터 처리 (개인정보 삭제 + 거래 기록 분리 보관). 로그인 연결 삭제는 호출한 쪽(서버)이 이어서 한다.
 * 여러 번 불러도 같은 결과이므로, 뒤 단계가 실패했을 때 다시 시도해도 된다.
 */
export async function withdrawMember(repo: MiyuRepository, userId: string): Promise<WithdrawResult> {
  const result = await repo.withdrawMemberData(userId);
  if (result.ok) return { kind: "done", counts: result.counts };
  return result.reason === "not-found" ? { kind: "not-found" } : { kind: "blocked", reason: result.reason };
}
