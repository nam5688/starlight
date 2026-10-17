"use client";

import { useState, useTransition } from "react";
import { startCompatCheckoutAction } from "@/app/compat/actions";
import { PersonFields } from "@/components/compat/person-fields";
import { buttonPrimary } from "@/components/ui/styles";
import { EMPTY_COMPAT_PERSON, type CompatPersonErrors, type CompatPersonInput } from "@/lib/compat/simple";

/**
 * 사주 궁합(유료) 구매 폼 — 내 사주(내 검사 결과)와 상대 생년월일로 받는다. 금액 · 소유자 · 입력 확인은 서버가 다시 하고, 결제 화면으로 이동한다.
 * 상대 입력은 리포트를 만드는 동안에만 보관하고 완성되면 지운다.
 */
export function CompatBuyForm({ assessmentId, myName, priceLabel }: { assessmentId: string; myName: string; priceLabel: string }) {
  const [partner, setPartner] = useState<CompatPersonInput>(EMPTY_COMPAT_PERSON);
  const [errors, setErrors] = useState<CompatPersonErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const out = await startCompatCheckoutAction({ assessmentId, partner });
        // 성공하면 서버가 결제 화면으로 보내므로 여기에 오는 것은 실패뿐이다
        if (out && !out.ok) {
          setErrors((out.errors ?? {}) as CompatPersonErrors);
          setMessage(out.message);
        }
      } catch (err) {
        // 이동(redirect)은 오류처럼 던져진다 — 그 밖의 오류만 알린다
        if (err && typeof err === "object" && "digest" in err && String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) throw err;
        setMessage("시작하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-describedby="compat-buy-note">
      <p className="text-[15px] leading-[1.75] text-ink-2">
        <span className="font-semibold text-ink">{myName} 님</span>의 사주와 상대의 사주를 자세히 풀어 읽어요. 두 사람의 사주만 보고, 상대가 직접 답한 성격 · 애착은 읽지 않아요.
      </p>
      <PersonFields prefix="p" title="상대" placeholderName="예: 남수" value={partner} errors={errors} onChange={setPartner} />
      <p id="compat-buy-note" className="text-[13px] leading-[1.7] text-ink-3">
        상대의 이름 · 생년월일은 궁합 리포트를 만드는 동안에만 보관하고, 리포트가 완성되면 지워요. 결제 전에 떠나면 보관하지 않아요. 결과는 재미 · 참고용이에요.
      </p>
      {message && (
        <p role="alert" className="text-[15px] font-medium text-danger">
          {message}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${buttonPrimary} w-full disabled:opacity-60`}>
        {pending ? "결제 화면으로 이동 중이에요" : `사주 궁합 받기 · ${priceLabel}`}
      </button>
    </form>
  );
}
