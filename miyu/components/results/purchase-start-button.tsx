"use client";

import Link from "next/link";
import { useActionState } from "react";
import { startPurchaseAction } from "@/app/results/[id]/actions";
import { IDLE_PURCHASE_START } from "@/lib/commerce/purchase-start";

/**
 * 심층 리포트 구매 시작 버튼 — 눌렀을 때 무슨 일이 일어나는지 화면에 항상 보인다.
 * · 누르면 버튼이 잠기고 "결제 화면을 준비하고 있어요…"가 보인다(두 번 눌러도 한 번만 시작).
 * · 서버가 결제 화면으로 갈 수 있다고 확인하면 이동하고, 못 가면 이유(결제 준비 전 · 새 구매 중지 · 로그인 풀림 · 이미 받음 · 삭제한 기록 · 오류)와 이어 갈 곳을 버튼 아래에 보인다.
 * · 같은 화면의 구매 영역으로 가는 #링크가 아니라 구매를 시작하는 서버 동작이다(모바일에서 다른 화면에서 온 #주소 이동이 구매 영역까지 내려가지 않던 문제).
 * · 가격이 적힌 버튼이 이미 결제된 것처럼 읽히지 않게, 누르기 전에 "결제 화면으로 이동해요 · 이 버튼만으로는 결제되지 않아요"를 버튼 아래에 항상 적는다.
 * 결제 가드(판매 중지 · 용량 · 예산)는 서버가 그대로 쓴다 — 이 버튼은 가드를 우회하지 않는다.
 */
export function PurchaseStartButton({ assessmentId, label, panelHref, buttonClassName, className = "", again = false, hint = true }: { assessmentId: string; label: string; panelHref?: string; buttonClassName: string; className?: string; /** 같은 결과로 새 리포트를 한 번 더 받는 경우 */ again?: boolean; /** 버튼 아래 "결제 화면으로 이동해요" 안내(기본으로 보인다) */ hint?: boolean }) {
  const [state, formAction, pending] = useActionState(startPurchaseAction, IDLE_PURCHASE_START);
  const blocked = !pending && state.status === "blocked" ? state : null;
  return (
    <form action={formAction} className={`${className}${blocked || pending ? " basis-full" : ""}`.trim()} data-testid="purchase-start">
      <input type="hidden" name="assessmentId" value={assessmentId} />
      {panelHref && <input type="hidden" name="panelHref" value={panelHref} />}
      {again && <input type="hidden" name="again" value="1" />}
      <button type="submit" disabled={pending} aria-busy={pending} className={`${buttonClassName} disabled:cursor-wait disabled:opacity-70`}>
        {pending ? "결제 화면을 준비하고 있어요…" : label}
      </button>
      {hint && !pending && !blocked && (
        <p className="mt-2 text-[13px] leading-[1.6] text-ink-3" data-testid="purchase-start-hint">
          누르면 결제 화면으로 이동해요. 이 버튼만으로는 결제되지 않아요.
        </p>
      )}
      <div role="status" aria-live="polite" className="empty:hidden">
        {pending && <p className="mt-3 text-[14px] leading-[1.7] text-ink-2">결제 화면으로 이동하는 중이에요. 이 화면을 닫지 말고 잠시만 기다려 주세요.</p>}
        {blocked && (
          <div className="mt-3 rounded-xl bg-mist px-4 py-3" data-testid="purchase-start-blocked" data-reason={blocked.reason}>
            <p className="text-[14px] leading-[1.7] text-ink-2">{blocked.message}</p>
            {blocked.link && (
              <p className="mt-2">
                <Link href={blocked.link.href} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-accent underline underline-offset-2">
                  {blocked.link.label}
                </Link>
              </p>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
