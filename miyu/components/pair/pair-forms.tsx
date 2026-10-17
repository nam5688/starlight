"use client";

import { useState, useTransition } from "react";
import { createPairInviteAction, joinPairAction, startPairCheckoutAction, unlinkPairAction, withdrawPairConsentAction } from "@/app/pair/actions";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { PAIR_CONSENT } from "@/lib/report/compat/pair-consent";

/** 성공하면 서버가 다른 화면으로 보내므로(redirect) 여기에 오는 것은 실패뿐이다 — 이동은 오류처럼 던져져서 그대로 다시 던진다 */
const rethrowRedirect = (err: unknown) => {
  if (err && typeof err === "object" && "digest" in err && String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) throw err;
};

function ConsentCheck({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 text-[15px] leading-[1.6] text-ink">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-5 shrink-0 accent-accent" />
      <span>{PAIR_CONSENT.checkbox}</span>
    </label>
  );
}

/** 초대 링크 만들기 — 내 동의(체크)가 있어야 한다 */
export function PairInviteForm({ assessmentId, myName }: { assessmentId: string; myName: string }) {
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setMessage(null);
    start(async () => {
      try {
        const out = await createPairInviteAction({ assessmentId, consent });
        if (out && !out.ok) setMessage(out.message);
      } catch (err) {
        rethrowRedirect(err);
        setMessage("만들지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
      }
    });
  };
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-[15px] leading-[1.75] text-ink-2">
        <span className="font-semibold text-ink">{myName} 님</span>의 분석 결과로 초대 링크를 만들어요. 상대가 링크를 열고 자기 분석 결과로 동의하면 연결돼요.
      </p>
      <ConsentCheck id="pair-invite-consent" checked={consent} onChange={setConsent} />
      {message && (
        <p role="alert" className="text-[15px] font-medium text-danger">
          {message}
        </p>
      )}
      <button type="submit" disabled={pending || !consent} className={`${buttonPrimary} w-full disabled:opacity-60`}>
        {pending ? "만드는 중이에요" : "초대 링크 만들기"}
      </button>
    </form>
  );
}

/** 초대받은 사람이 동의하고 연결한다 */
export function PairJoinForm({ token, myName }: { token: string; myName: string }) {
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setMessage(null);
    start(async () => {
      try {
        const out = await joinPairAction({ token, consent });
        if (out && !out.ok) setMessage(out.message);
      } catch (err) {
        rethrowRedirect(err);
        setMessage("연결하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
      }
    });
  };
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-[15px] leading-[1.75] text-ink-2">
        <span className="font-semibold text-ink">{myName} 님</span>의 가장 최근 분석 결과로 연결해요.
      </p>
      <ConsentCheck id="pair-join-consent" checked={consent} onChange={setConsent} />
      {message && (
        <p role="alert" className="text-[15px] font-medium text-danger">
          {message}
        </p>
      )}
      <button type="submit" disabled={pending || !consent} className={`${buttonPrimary} w-full disabled:opacity-60`}>
        {pending ? "연결하는 중이에요" : "동의하고 연결하기"}
      </button>
    </form>
  );
}

/** 결제 시작 — 금액 · 쌍 상태는 서버가 다시 확인하고 결제 화면으로 보낸다 */
export function PairPayButton({ pairId, priceLabel }: { pairId: string; priceLabel: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pay = () => {
    if (pending) return;
    setMessage(null);
    start(async () => {
      try {
        const out = await startPairCheckoutAction({ pairId });
        if (out && !out.ok) setMessage(out.message);
      } catch (err) {
        rethrowRedirect(err);
        setMessage("시작하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
      }
    });
  };
  return (
    <div className="space-y-3">
      <button type="button" onClick={pay} disabled={pending} className={`${buttonPrimary} w-full disabled:opacity-60`}>
        {pending ? "결제 화면으로 이동 중이에요" : `리포트 궁합 받기 · ${priceLabel}`}
      </button>
      {message && (
        <p role="alert" className="text-[15px] font-medium text-danger">
          {message}
        </p>
      )}
    </div>
  );
}

/** 초대 링크 복사 — 복사가 막힌 환경이면 글을 선택해 직접 복사하도록 안내한다 */
export function CopyLinkBox({ url }: { url: string }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
  };
  return (
    <div className="space-y-2">
      <input readOnly value={url} aria-label="초대 링크" onFocus={(e) => e.currentTarget.select()} className="w-full rounded-md border border-line-strong bg-white px-3 py-3 text-[14px] text-ink-2" />
      <button type="button" onClick={copy} className={buttonSecondary}>
        링크 복사하기
      </button>
      <p role="status" aria-live="polite" className="text-[13px] text-ink-3">
        {copied === "yes" ? "복사했어요. 상대에게 보내 주세요." : copied === "no" ? "복사가 막혀 있어요. 위 글을 눌러 선택한 뒤 직접 복사해 주세요." : "\u00a0"}
      </p>
    </div>
  );
}

/** 연결 해제 · 동의 철회 — 안내를 읽고 한 번 더 누르는 확인을 화면 안에 둔다(확인 대화상자를 쓰지 않는다) */
export function PairChangeButtons({ pairId, canUnlink, canWithdraw }: { pairId: string; canUnlink: boolean; canWithdraw: boolean }) {
  const [asking, setAsking] = useState<"unlink" | "withdraw" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (kind: "unlink" | "withdraw") =>
    start(async () => {
      try {
        const out = kind === "unlink" ? await unlinkPairAction(pairId) : await withdrawPairConsentAction(pairId);
        setResult(out);
      } catch {
        setResult({ ok: false, message: "처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요." });
      }
      setAsking(null);
    });
  if (result?.ok) return <p role="status" className="text-[14px] leading-[1.7] text-ink-2">{result.message}</p>;
  return (
    <div className="space-y-3">
      {result && !result.ok && (
        <p role="alert" className="text-[14px] font-medium text-danger">
          {result.message}
        </p>
      )}
      {asking === null ? (
        <div className="flex flex-wrap gap-2">
          {canUnlink && (
            <button type="button" onClick={() => setAsking("unlink")} className={buttonSecondary}>
              연결 끊기
            </button>
          )}
          {canWithdraw && (
            <button type="button" onClick={() => setAsking("withdraw")} className={buttonSecondary}>
              동의 철회하기
            </button>
          )}
        </div>
      ) : (
        <div role="alertdialog" aria-label="확인" className="space-y-3 rounded-xl bg-mist p-4 text-[14px] leading-[1.75] text-ink-2">
          {asking === "unlink" ? (
            <p>연결을 끊으면 이 쌍으로는 새 궁합을 만들지 않아요. 이미 만들어진 글은 두 사람 모두 그대로 읽을 수 있어요. 끊을까요?</p>
          ) : (
            <p>동의를 철회하면 내 자료는 새 궁합을 만드는 데 더 쓰이지 않고, 연결도 끊겨요. 이 글은 나도 더 읽을 수 없고, 상대는 계속 읽어요. 결제는 환불되지 않을 수 있어요. 철회할까요?</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => run(asking)} disabled={pending} className={`${buttonPrimary} disabled:opacity-60`}>
              {pending ? "처리 중이에요" : asking === "unlink" ? "연결 끊기" : "동의 철회하기"}
            </button>
            <button type="button" onClick={() => setAsking(null)} disabled={pending} className={buttonSecondary}>
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
