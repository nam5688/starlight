"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendPasswordReset, signInWithEmail, signUpWithEmail, updatePassword } from "@/app/auth/email/actions";
import { PASSWORD_RULE, type EmailFormState } from "@/lib/auth/email";
import { buttonPrimary, textLink } from "@/components/ui/styles";

export type EmailMode = "login" | "signup" | "reset" | "new-password";

const COPY: Record<EmailMode, { title: string; button: string; pending: string; action: (prev: EmailFormState, f: FormData) => Promise<EmailFormState> }> = {
  login: { title: "이메일로 로그인", button: "로그인", pending: "로그인 중…", action: signInWithEmail },
  signup: { title: "이메일로 가입", button: "가입하기", pending: "가입 중…", action: signUpWithEmail },
  reset: { title: "비밀번호 재설정", button: "재설정 메일 보내기", pending: "보내는 중…", action: sendPasswordReset },
  "new-password": { title: "새 비밀번호 정하기", button: "비밀번호 바꾸기", pending: "바꾸는 중…", action: updatePassword },
};

const field = "mt-1.5 block h-12 w-full rounded-xl bg-canvas px-4 text-[16px] ring-1 ring-line placeholder:text-ink-3 focus:ring-2 focus:ring-accent focus:outline-none";
const label = "block text-[15px] font-semibold";

/** 이메일 로그인 · 가입 · 비밀번호 재설정 · 새 비밀번호 — 서버 동작(app/auth/email/actions.ts)을 부른다. 비밀번호는 화면에 남기지 않는다 */
export function EmailForm({ mode, next }: { mode: EmailMode; next: string }) {
  const copy = COPY[mode];
  const [state, formAction, pending] = useActionState(copy.action, {} as EmailFormState);
  const q = `next=${encodeURIComponent(next)}`;
  const needsEmail = mode !== "new-password";
  const needsPassword = mode !== "reset";
  const confirms = mode === "signup" || mode === "new-password";
  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {needsEmail && (
        <div>
          <label htmlFor="email" className={label}>
            이메일
          </label>
          <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" defaultValue={state.email ?? ""} className={field} />
        </div>
      )}
      {needsPassword && (
        <div>
          <label htmlFor="password" className={label}>
            {mode === "new-password" ? "새 비밀번호" : "비밀번호"}
          </label>
          <input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required maxLength={200} aria-describedby={confirms ? "password-rule" : undefined} className={field} />
          {confirms && (
            <p id="password-rule" className="mt-1.5 text-[13px] text-ink-3">
              {PASSWORD_RULE}
            </p>
          )}
        </div>
      )}
      {confirms && (
        <div>
          <label htmlFor="passwordConfirm" className={label}>
            비밀번호 한 번 더
          </label>
          <input id="passwordConfirm" name="passwordConfirm" type="password" autoComplete="new-password" required maxLength={200} className={field} />
        </div>
      )}
      <div aria-live="polite">
        {state.error && (
          <p role="alert" className="rounded-xl bg-caution-soft px-4 py-3 text-[15px] leading-relaxed font-medium text-caution">
            {state.error}
          </p>
        )}
        {state.notice && (
          <p role="status" className="rounded-xl bg-positive-soft px-4 py-3 text-[15px] leading-relaxed font-medium text-positive">
            {state.notice}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} aria-busy={pending} className={`${buttonPrimary} w-full disabled:opacity-60`}>
        {pending ? copy.pending : copy.button}
      </button>
      {mode === "login" && (
        <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[14px] text-ink-2">
          <Link href={`/auth/email?mode=signup&${q}`} className={textLink}>
            처음이에요 · 이메일로 가입
          </Link>
          <Link href={`/auth/email?mode=reset&${q}`} className={textLink}>
            비밀번호를 잊었어요
          </Link>
        </p>
      )}
      {(mode === "signup" || mode === "reset") && (
        <p className="text-[14px] text-ink-2">
          <Link href={`/auth/email?mode=login&${q}`} className={textLink}>
            이미 가입했어요 · 로그인
          </Link>
        </p>
      )}
    </form>
  );
}
