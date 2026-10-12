"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { agreeTermsAction, declineTermsAction, type ConsentFormState } from "@/app/auth/consent/actions";
import { buttonPrimary, buttonSecondary, textLink } from "@/components/ui/styles";
import { CONSENT_ITEMS, type ConsentType } from "@/lib/membership/terms";

/** 가입 동의 — 필수 항목에 모두 동의해야 다음으로 넘어간다. 선택 항목은 따로 고를 수 있다. */
export function ConsentForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<ConsentFormState, FormData>(agreeTermsAction, { message: null });
  const [checked, setChecked] = useState<Record<ConsentType, boolean>>({
    age_14: false,
    terms: false,
    privacy: false,
    marketing: false,
  });
  const allChecked = CONSENT_ITEMS.every((i) => checked[i.type]);
  const requiredDone = CONSENT_ITEMS.filter((i) => i.required).every((i) => checked[i.type]);

  function toggleAll(value: boolean) {
    setChecked({ age_14: value, terms: value, privacy: value, marketing: value });
  }

  return (
    <div className="mt-8">
      <form action={formAction}>
        <input type="hidden" name="next" value={next} />
        <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-line-strong px-4 text-[17px] font-semibold">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => toggleAll(e.target.checked)}
            className="size-5 accent-accent"
          />
          전체 동의
          <span className="text-[13px] font-normal text-ink-3">(선택 항목 포함)</span>
        </label>

        <ul className="mt-3 divide-y divide-line border-y border-line">
          {CONSENT_ITEMS.map((item) => (
            <li key={item.type} className="py-3.5">
              <div className="flex items-start justify-between gap-3">
                <label className="flex min-h-8 cursor-pointer items-start gap-3 text-[16px]">
                  <input
                    type="checkbox"
                    name={item.type}
                    checked={checked[item.type]}
                    onChange={(e) => setChecked((c) => ({ ...c, [item.type]: e.target.checked }))}
                    className="mt-1 size-5 shrink-0 accent-accent"
                  />
                  <span>
                    <span className={`mr-1.5 text-[14px] font-semibold ${item.required ? "text-accent" : "text-ink-3"}`}>
                      {item.required ? "필수" : "선택"}
                    </span>
                    {item.label}
                    {item.detail && <span className="mt-1 block text-[14px] leading-relaxed text-ink-3">{item.detail}</span>}
                  </span>
                </label>
                {item.href && (
                  <Link href={item.href} target="_blank" className={`${textLink} shrink-0 text-[14px]`}>
                    전문 보기
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>

        {state.message && (
          <p role="alert" className="mt-4 text-[15px] font-medium text-danger">
            {state.message}
          </p>
        )}
        <button
          type="submit"
          disabled={!requiredDone || pending}
          aria-busy={pending}
          className={`${buttonPrimary} mt-6 w-full disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {pending ? "처리 중…" : "동의하고 시작하기"}
        </button>
      </form>

      <form action={declineTermsAction} className="mt-3">
        <button type="submit" className={`${buttonSecondary} w-full`}>
          동의하지 않고 나가기
        </button>
      </form>
    </div>
  );
}
