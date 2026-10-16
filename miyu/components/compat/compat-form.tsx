"use client";

import { useRef, useState, useTransition } from "react";
import { simpleCompatAction } from "@/app/compat/actions";
import { PersonFields } from "@/components/compat/person-fields";
import { CompatResult } from "@/components/compat/compat-result";
import { buttonPrimary } from "@/components/ui/styles";
import { EMPTY_COMPAT_PERSON, type CompatPersonErrors, type CompatPersonInput, type SimpleCompatCard } from "@/lib/compat/simple";

/** 간단 궁합 입력 + 결과. 입력한 값은 이 브라우저 화면과 계산하는 순간의 서버에만 있고 저장하지 않는다 */
export function CompatForm() {
  const [a, setA] = useState<CompatPersonInput>(EMPTY_COMPAT_PERSON);
  const [b, setB] = useState<CompatPersonInput>(EMPTY_COMPAT_PERSON);
  const [errors, setErrors] = useState<{ a: CompatPersonErrors; b: CompatPersonErrors }>({ a: {}, b: {} });
  const [message, setMessage] = useState<string | null>(null);
  const [card, setCard] = useState<SimpleCompatCard | null>(null);
  const [pending, startTransition] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const out = await simpleCompatAction({ a, b });
        if (out.ok) {
          setErrors({ a: {}, b: {} });
          setCard(out.card);
          requestAnimationFrame(() => document.getElementById("compat-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
        } else {
          setErrors(out.errors);
          setMessage(out.message ?? "입력을 확인해 주세요.");
        }
      } catch {
        setMessage("계산하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
      }
    });
  };

  const reset = () => {
    setCard(null);
    setA(EMPTY_COMPAT_PERSON);
    setB(EMPTY_COMPAT_PERSON);
    setErrors({ a: {}, b: {} });
    topRef.current?.scrollIntoView({ block: "start" });
  };

  if (card) return <CompatResult card={card} onReset={reset} />;

  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-describedby="compat-privacy">
      <div ref={topRef} />
      <PersonFields prefix="a" title="첫 번째 사람" placeholderName="예: 슬기" value={a} errors={errors.a} onChange={setA} />
      <PersonFields prefix="b" title="두 번째 사람" placeholderName="예: 남수" value={b} errors={errors.b} onChange={setB} />
      <p id="compat-privacy" className="text-[13px] leading-[1.7] text-ink-3">
        로그인 없이 볼 수 있어요. 입력한 이름 · 생년월일은 결과를 계산하는 동안만 쓰고 저장하지 않아요.
      </p>
      {message && (
        <p role="alert" className="text-[15px] font-medium text-danger">
          {message}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${buttonPrimary} w-full disabled:opacity-60`}>
        {pending ? "두 사주를 읽는 중이에요" : "우리 궁합 보기"}
      </button>
    </form>
  );
}
