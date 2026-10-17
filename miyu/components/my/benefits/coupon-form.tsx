"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { BenefitFormState } from "@/app/my/benefits/actions";
import { FormMessage, type BenefitAction } from "@/components/my/benefits/form-message";
import { buttonPrimary } from "@/components/ui/styles";
import { inputClass } from "@/components/ui/form-controls";

/**
 * 쿠폰 코드 입력 — 질문권 쿠폰은 바로 들어오고, 할인 · 무료 이용권 쿠폰은 결제 화면에서 쓴다.
 * 숨은 필드 key는 화면이 열릴 때와 결과를 받을 때마다 새로 만든다. 같은 요청을 다시 보내도(두 번 누름 · 응답을 못 받고 다시 시도) 서버가 한 번만 지급한다.
 */
export function CouponForm({ action, idPrefix = "", initialState = null }: { action: BenefitAction; idPrefix?: string; /** 개발용 미리보기 전용: 처음부터 보일 결과 */ initialState?: BenefitFormState }) {
  const [state, formAction, pending] = useActionState<BenefitFormState, FormData>(action, initialState);
  const [code, setCode] = useState("");
  const [seen, setSeen] = useState(state);
  const keyRef = useRef<HTMLInputElement>(null);

  // 지급에 성공하면 입력 칸을 비운다(실패했을 때는 고쳐서 다시 낼 수 있게 적은 코드를 그대로 둔다)
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setCode("");
  }

  // 서버가 그리는 화면에는 키가 없고(브라우저마다 다른 값이 섞이지 않게), 브라우저에서 처음 한 번 + 결과를 받을 때마다 새 키를 넣는다
  useEffect(() => {
    if (keyRef.current) keyRef.current.value = globalThis.crypto.randomUUID();
  }, [state]);

  const inputId = `${idPrefix}coupon-code`;
  const messageId = `${idPrefix}coupon-message`;
  return (
    <form action={formAction}>
      <input type="hidden" name="key" ref={keyRef} />
      <label htmlFor={inputId} className="text-[15px] font-semibold">
        쿠폰 코드
      </label>
      <input
        id={inputId}
        name="code"
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        maxLength={32}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="쿠폰 코드를 입력해 주세요"
        aria-describedby={state ? messageId : undefined}
        aria-invalid={state && !state.ok ? true : undefined}
        className={`${inputClass(Boolean(state && !state.ok))} mt-2 uppercase placeholder:normal-case`}
      />
      <button type="submit" disabled={pending || code.trim() === ""} aria-busy={pending} className={`${buttonPrimary} mt-3 w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto`}>
        {pending ? "확인하는 중…" : "쿠폰 사용하기"}
      </button>
      <FormMessage state={state} id={messageId} />
    </form>
  );
}
