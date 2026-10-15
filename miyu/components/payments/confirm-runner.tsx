"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { confirmPaymentAction, type ConfirmOutcome } from "@/app/payments/actions";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";

/** 결제 결과를 모를 때 자동으로 다시 확인하는 간격 (5초 → 15초 → 30초 … 최대 6번) */
const RETRY_DELAYS = [5000, 15000, 30000, 30000, 60000, 60000];

/**
 * 결제사에서 돌아온 값으로 서버 승인을 요청하고, 결과에 따라 이동하거나 안내한다.
 * - 인터넷이 끊기거나 서버 오류로 결과를 못 받아도 "실패"라고 하지 않고 "확인 중"으로 두고 자동으로 다시 확인한다.
 * - 결과를 모르는 동안에는 다시 결제하라고 하지 않는다.
 */
export function ConfirmRunner() {
  const params = useSearchParams();
  const router = useRouter();
  const [outcome, setOutcome] = useState<ConfirmOutcome | null>(null);
  const [busy, setBusy] = useState(true);
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(false);

  const orderId = params.get("orderId") ?? "";
  const paymentKey = params.get("paymentKey") ?? "";
  const amount = Number(params.get("amount"));

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const result = await confirmPaymentAction({ orderId, paymentKey, amount });
      setOffline(false);
      setOutcome(result);
      if (result.kind === "paid") router.replace(result.resultPath);
    } catch {
      // 요청 자체가 서버에 닿지 않았거나 응답을 받지 못함 — 결제 결과는 아직 모른다
      setOffline(true);
      setOutcome({ kind: "checking", assessmentId: null, resultPath: null, orderNumber: orderId || null, errorId: null });
    } finally {
      setBusy(false);
    }
  }, [orderId, paymentKey, amount, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  // 결과를 모르는 동안 자동으로 다시 확인한다
  useEffect(() => {
    if (busy || outcome?.kind !== "checking" || attempt >= RETRY_DELAYS.length) return;
    const timer = setTimeout(() => {
      setAttempt((n) => n + 1);
      void run();
    }, RETRY_DELAYS[attempt]);
    return () => clearTimeout(timer);
  }, [busy, outcome, attempt, run]);

  // 인터넷이 다시 연결되면 바로 확인한다
  useEffect(() => {
    const onOnline = () => {
      if (outcome?.kind === "checking") void run();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [outcome, run]);

  if (busy && !outcome) {
    return (
      <p role="status" className="mt-4 text-[16px] leading-relaxed text-ink-2">
        결제를 확인하고 있어요. 이 화면을 닫지 말아 주세요.
      </p>
    );
  }
  // 유료 질문 결제는 리포트가 아니라 질문했던 채팅방으로 돌아간다
  const cashFlow = Boolean(outcome && "resultPath" in outcome && outcome.resultPath?.includes("/talk"));
  if (outcome?.kind === "paid") {
    return (
      <p role="status" className="mt-4 text-[16px] leading-relaxed text-ink-2">
        {cashFlow ? "결제가 확인되었습니다. 곧 채팅방으로 이동해 질문에 이어서 답합니다." : "결제가 확인되었습니다. 곧 리포트 화면으로 이동합니다."}
      </p>
    );
  }

  if (outcome?.kind === "checking") {
    const gaveUp = attempt >= RETRY_DELAYS.length;
    return (
      <div className="mt-4 space-y-5">
        <p role="status" className="text-[16px] font-semibold leading-relaxed">
          결제 결과를 확인하고 있습니다
        </p>
        <p className="text-[16px] leading-relaxed text-ink-2">
          {offline ? "인터넷 연결이 불안정해 결과를 받지 못했습니다. " : "결제사 응답을 아직 받지 못했습니다. "}
          결제가 승인되었다면 확인되는 대로 자동으로 반영되고, {cashFlow ? "결제한 질문도 반영됩니다" : "리포트도 준비됩니다"}.{" "}
          <span className="font-semibold text-ink">다시 결제하지 않아도 됩니다.</span>
        </p>
        <p className="text-[14px] leading-relaxed text-ink-3">
          {gaveUp ? "자동 확인을 멈췄습니다. 아래 버튼으로 다시 확인하거나, MY에서 나중에 확인해 주세요. 결제가 승인된 경우 MY를 열면 자동으로 맞춰집니다." : busy ? "확인하는 중…" : "잠시 후 자동으로 다시 확인합니다."}
        </p>
        {(outcome.orderNumber || outcome.errorId) && (
          <p className="text-[13px] text-ink-3">
            문의할 때는 {outcome.orderNumber ? `주문번호 ${outcome.orderNumber}` : ""}
            {outcome.orderNumber && outcome.errorId ? " · " : ""}
            {outcome.errorId ? `오류번호 ${outcome.errorId}` : ""}를 알려 주세요.
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => void run()} disabled={busy} className={buttonPrimary}>
            {busy ? "확인 중…" : "지금 다시 확인"}
          </button>
          <Link href={outcome.resultPath ?? "/my"} className={buttonSecondary}>
            {outcome.resultPath ? "돌아가기" : "MY로 가기"}
          </Link>
        </div>
      </div>
    );
  }

  if (outcome?.kind === "login") {
    return (
      <div className="mt-4 space-y-5">
        <p className="text-[16px] leading-relaxed text-ink-2">로그인이 풀렸습니다. MY에서 다시 로그인한 뒤 결과를 확인해 주세요. 결제가 승인된 경우 다시 결제하지 않아도 반영됩니다.</p>
        <Link href="/my" className={buttonPrimary}>
          MY로 가기
        </Link>
      </div>
    );
  }

  const rejected = outcome?.kind === "rejected" ? outcome : null;
  return (
    <div className="mt-4 space-y-5">
      <p role="alert" className="text-[16px] font-medium leading-relaxed text-danger">
        {rejected ? rejected.message : "결제를 확인하지 못했습니다."}
      </p>
      {rejected?.charged ? (
        <p className="text-[14px] leading-relaxed text-ink-2">
          이 결제는 결제사에서 승인되었을 수 있습니다. 중복 결제로 확인되면 운영자가 확인 후 환불을 안내해 드립니다. 문의할 때 주문번호 {rejected.orderNumber ?? ""}를 알려 주세요.
        </p>
      ) : (
        <p className="text-[14px] text-ink-3">승인되지 않은 결제는 청구되지 않습니다.</p>
      )}
      <Link href={rejected?.resultPath ?? "/my"} className={buttonSecondary}>
        돌아가기
      </Link>
    </div>
  );
}
