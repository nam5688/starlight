"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createInviteLinkAction } from "@/app/results/[id]/invite-actions";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { formatKrw } from "@/lib/config/product";
import type { InviteView } from "@/lib/services/invite-service";

/**
 * 친구 초대하기(운영자 2026-10-16) — 심층 리포트를 받은 분이 링크를 만들고, 링크로 들어온 친구가 심층 리포트를 처음 받을 때 초대 가격(5,900원, 정가 9,900원)으로 받는다.
 * 한 사람이 3명까지. 링크에는 이름 · 생년월일이 없고, 친구가 받은 리포트는 나에게 보이지 않는다. 궁합 비교는 준비 중이다.
 * view는 서버가 만든 값이다(DB 변경 18번 전이면 이 구역을 보이지 않는다).
 */
export function InviteSection({ assessmentId, origin, view }: { assessmentId: string; origin: string; view: Extract<InviteView, { kind: "available" }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const sent = useRef(false);
  const link = view.token ? `${origin}/invite/${view.token}` : null;
  const left = Math.max(0, view.cap - view.used);

  const create = () => {
    if (sent.current || pending) return;
    sent.current = true;
    setMessage(null);
    start(async () => {
      try {
        const r = await createInviteLinkAction({ assessmentId });
        if (r.ok) router.refresh();
        else setMessage(r.message);
      } catch {
        setMessage("이번에는 링크를 만들지 못했어요. 잠시 뒤에 다시 눌러 주세요.");
      } finally {
        sent.current = false;
      }
    });
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("복사하지 못했어요. 링크를 길게 눌러 직접 복사해 주세요.");
    }
  };

  return (
    <section aria-labelledby="r-invite" className="space-y-3">
      <h2 id="r-invite" className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
        친구 초대하기
      </h2>
      <p className="text-[15px] leading-[1.7] text-ink-2">
        링크로 들어온 친구가 심층 리포트를 처음 받을 때 <span className="font-semibold tabular-nums">{formatKrw(view.priceKrw)}</span>에 받을 수 있어요(정가 <span className="tabular-nums">{formatKrw(view.listKrw)}</span>). 한 분이 {view.cap}명까지 초대할 수 있어요.
      </p>
      <p className="text-[14px] leading-[1.65] text-ink-3">
        지금까지 초대 가격으로 받은 친구 <span className="font-semibold tabular-nums text-ink-2">{view.used}</span>명 · 남은 자리 <span className="font-semibold tabular-nums text-ink-2">{left}</span>명
      </p>
      {link ? (
        <div className="space-y-2">
          <input readOnly value={link} aria-label="초대 링크" onFocus={(e) => e.currentTarget.select()} className="h-12 w-full rounded-lg border border-line-strong bg-canvas px-3 text-[14px] text-ink-2" />
          <button type="button" onClick={copy} className={`${buttonSecondary} w-full sm:w-auto sm:px-8`}>
            {copied ? "복사했어요" : "링크 복사하기"}
          </button>
        </div>
      ) : (
        <button type="button" onClick={create} disabled={pending} aria-busy={pending} className={`${buttonPrimary} w-full sm:w-auto sm:px-8`}>
          {pending ? "링크를 만들고 있어요…" : "초대 링크 만들기"}
        </button>
      )}
      {message && (
        <p className="text-[14px] leading-relaxed text-caution" role="alert">
          {message}
        </p>
      )}
      <ul className="space-y-1 text-[13px] leading-[1.65] text-ink-3">
        <li>· 링크에는 이름이나 생년월일이 들어 있지 않아요.</li>
        <li>· 친구가 받은 리포트의 내용은 나에게 보이지 않아요.</li>
        <li>· 친구가 이미 심층 리포트를 받았거나 자리가 찼다면 정가로 받아요.</li>
        <li>· 궁합 비교는 준비 중이에요.</li>
      </ul>
    </section>
  );
}
