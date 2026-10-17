"use client";

import { useActionState } from "react";
import type { ReportFormState } from "@/app/reviews/actions";
import { CheckIcon, InfoIcon } from "@/components/ui/icons";

export type ReportAction = (prev: ReportFormState, formData: FormData) => Promise<ReportFormState>;

const REASONS = [
  { code: "privacy", label: "개인정보가 보여요" },
  { code: "abuse", label: "욕설 · 혐오 표현이에요" },
  { code: "fake_or_ad", label: "허위이거나 광고예요" },
  { code: "other", label: "그 밖의 이유" },
] as const;

/**
 * 공개 후기 신고 — 작은 글자 링크 하나를 눌러 펼친다. 이유를 고르면 운영자에게 전달될 뿐 후기를 바로 숨기지 않는다(운영자가 글을 읽고 정한다).
 * "내용이 마음에 들지 않아요"는 신고 이유에 없다 — 부정적인 후기를 이유만으로 내리지 않는다.
 * 서버 동작은 prop으로 받는다 — 실제 화면은 app/reviews/actions.ts의 동작을, 개발용 미리보기는 아무것도 바꾸지 않는 동작을 넘긴다.
 */
export function ReviewReport({ reviewId, action, idPrefix = "" }: { reviewId: string; action: ReportAction; idPrefix?: string }) {
  const [state, formAction, pending] = useActionState<ReportFormState, FormData>(action, null);
  const selectId = `${idPrefix}report-${reviewId}`;
  const messageId = `${idPrefix}report-msg-${reviewId}`;
  return (
    <details className="group relative">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center text-[13px] text-ink-3 underline decoration-ink-3/30 underline-offset-4 hover:text-ink-2 [&::-webkit-details-marker]:hidden">신고</summary>
      <form action={formAction} className="mt-2 w-full min-w-[15rem] space-y-2 rounded-xl bg-mist px-3 py-3 text-ink">
        <input type="hidden" name="reviewId" value={reviewId} />
        <label htmlFor={selectId} className="block text-[13px] font-semibold">
          신고하는 이유
        </label>
        <select id={selectId} name="reason" defaultValue="privacy" aria-describedby={state ? messageId : undefined} className="h-11 w-full rounded-lg border border-line-strong bg-canvas px-3 text-[14px]">
          {REASONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} aria-busy={pending} className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-line-strong bg-canvas text-[14px] font-semibold hover:bg-page disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "보내는 중…" : "신고 보내기"}
        </button>
        {state && (
          <p id={messageId} role={state.ok ? "status" : "alert"} className={`flex items-start gap-1.5 text-[13px] leading-snug font-medium ${state.ok ? "text-positive" : "text-danger"}`}>
            {state.ok ? <CheckIcon className="mt-0.5 size-3.5 shrink-0" /> : <InfoIcon className="mt-0.5 size-3.5 shrink-0" />}
            <span>{state.message}</span>
          </p>
        )}
      </form>
    </details>
  );
}
