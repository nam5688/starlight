"use client";

import { useActionState, useState } from "react";
import type { ReviewFormState } from "@/app/my/reviews/actions";
import { InfoIcon, StarIcon } from "@/components/ui/icons";
import { buttonPrimary } from "@/components/ui/styles";
import { REVIEW_NOTICES, type ReviewKind } from "@/lib/commerce/reviews";

export type ReviewSaveAction = (prev: ReviewFormState, formData: FormData) => Promise<ReviewFormState>;

export type ReviewFormProps = {
  action: ReviewSaveAction;
  /** create 처음 쓰기 · rewrite 지운 후기를 다시 쓰기(보상 없음) · edit 쓴 후기 고치기 */
  mode: "create" | "rewrite" | "edit";
  kind: ReviewKind;
  subjectRef: string;
  /** 고치기일 때 후기 번호 */
  reviewId?: string;
  initial?: { rating: number; body: string; publicConsent: boolean };
  minBodyChars: number;
  maxChars: number;
  /** 이 후기를 쓰면 질문권을 받는가(보상 스위치가 켜져 있고 보상 대상인 이용 건) — 질문권 수 */
  rewardCredits: number | null;
  /** 무료로 제공받은 이용(공개되면 "무료 체험 제공"으로 표시된다) */
  freeTrial: boolean;
  idPrefix: string;
};

const fieldClass =
  "mt-2 w-full rounded-lg border bg-canvas px-4 py-3 text-[16px] leading-relaxed text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

/**
 * 후기 작성 · 수정 — 별점(필수) · 글 · 공개 동의. 공개 전 안내(사주 · 관계 · 상담의 구체적 내용, 이름 · 생년월일 · 상대 정보는 적지 않기, 공개에 동의하면 메인과 전체 후기에 보임)를 항상 보이고,
 * 보상이 있으면 "별점 · 내용 · 공개 여부와 관계없이 같다"와 "보상을 받고 쓴 후기라는 표시가 공개 후기에 함께 붙는다"를 함께 알린다. 공개 동의는 처음에 꺼져 있다(직접 눌러야 공개된다).
 * 서버 동작은 prop으로 받는다 — 실제 화면은 app/my/reviews/actions.ts의 동작을, 개발용 미리보기는 아무것도 바꾸지 않는 동작을 넘긴다.
 */
export function ReviewForm({ action, mode, kind, subjectRef, reviewId, initial, minBodyChars, maxChars, rewardCredits, freeTrial, idPrefix }: ReviewFormProps) {
  const [state, formAction, pending] = useActionState<ReviewFormState, FormData>(action, null);
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [body, setBody] = useState(initial?.body ?? "");
  const [consent, setConsent] = useState(initial?.publicConsent ?? false);
  const len = [...body].length;
  const errors = state && !state.ok ? state.errors : undefined;
  const bodyId = `${idPrefix}body`;
  const bodyErr = `${idPrefix}body-err`;
  const ratingErr = `${idPrefix}rating-err`;
  const msgId = `${idPrefix}msg`;
  const label = mode === "edit" ? "고친 내용 저장" : mode === "rewrite" ? "다시 남기기" : "후기 남기기";

  return (
    <form action={formAction} className="space-y-6">
      {reviewId ? <input type="hidden" name="id" value={reviewId} /> : <input type="hidden" name="kind" value={kind} />}
      {!reviewId && <input type="hidden" name="ref" value={subjectRef} />}

      <fieldset aria-describedby={errors?.rating ? ratingErr : undefined}>
        <legend className="text-[16px] font-semibold">
          별점 <span className="text-[14px] font-normal text-ink-3">필수</span>
        </legend>
        <div role="radiogroup" aria-label="별점" className="mt-2 flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="peer sr-only" />
              <span className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-line-strong px-2.5 text-[15px] text-ink-2 peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent-strong peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                <StarIcon filled={n <= rating} className="size-4" />
                <span className="tabular-nums">{n}점</span>
              </span>
            </label>
          ))}
        </div>
        {errors?.rating && (
          <p id={ratingErr} role="alert" className="mt-2 text-[14px] font-medium text-danger">
            {errors.rating}
          </p>
        )}
      </fieldset>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={bodyId} className="text-[16px] font-semibold">
            후기 <span className="text-[14px] font-normal text-ink-3">{minBodyChars > 0 ? `${minBodyChars}자 이상` : "선택"}</span>
          </label>
          <span className={`text-[13px] tabular-nums ${len > maxChars ? "font-semibold text-danger" : "text-ink-3"}`} aria-live="polite">
            {len} / {maxChars}자
          </span>
        </div>
        <textarea
          id={bodyId}
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="이용하면서 어떤 점이 어땠는지 편하게 적어 주세요. 좋았던 점도 아쉬웠던 점도 괜찮아요."
          aria-describedby={errors?.body ? bodyErr : undefined}
          aria-invalid={errors?.body ? true : undefined}
          className={`${fieldClass} ${errors?.body ? "border-danger" : "border-line-strong"}`}
        />
        {errors?.body && (
          <p id={bodyErr} role="alert" className="mt-2 text-[14px] font-medium text-danger">
            {errors.body}
          </p>
        )}
      </div>

      <div className="space-y-2.5 rounded-xl bg-mist px-4 py-3.5 text-[13.5px] leading-[1.7] text-ink-2">
        <p className="flex items-start gap-2">
          <InfoIcon className="mt-1 size-3.5 shrink-0" />
          <span>{REVIEW_NOTICES.publish}</span>
        </p>
        <p>{REVIEW_NOTICES.noAi}</p>
        {rewardCredits !== null && <p className="font-medium text-ink">{REVIEW_NOTICES.reward(rewardCredits)}</p>}
        {freeTrial && <p>{REVIEW_NOTICES.freeTrial}</p>}
        {mode === "edit" && <p>{REVIEW_NOTICES.editNote}</p>}
        {mode === "rewrite" && <p>지운 후기를 다시 쓰면 질문권은 다시 들어오지 않아요(같은 이용 건의 보상은 한 번뿐이에요).</p>}
      </div>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-[15px] leading-[1.6]">
        <input type="checkbox" name="publicConsent" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-5 shrink-0 accent-accent" />
        <span>
          <span className="font-semibold">{REVIEW_NOTICES.consentLabel}</span>
          <span className="mt-0.5 block text-[13px] text-ink-3">체크하지 않으면 나만 보고 운영 기록 용도로만 쓰여요. 나중에 언제든 바꿀 수 있어요.</span>
        </span>
      </label>

      <div>
        <button type="submit" disabled={pending} aria-busy={pending} className={`${buttonPrimary} w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto`}>
          {pending ? "저장하는 중…" : label}
        </button>
        {state && !state.ok && (
          <p id={msgId} role="alert" className="mt-3 flex items-start gap-2 text-[15px] leading-[1.6] font-medium text-danger">
            <InfoIcon className="mt-1 size-4 shrink-0" />
            <span>{state.message}</span>
          </p>
        )}
      </div>
    </form>
  );
}
