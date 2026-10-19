"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { startCompatCheckoutAction } from "@/app/compat/actions";
import { GenderField, RelationshipField } from "@/components/compat/choice-fields";
import { PersonFields } from "@/components/compat/person-fields";
import { buttonPrimary } from "@/components/ui/styles";
import { COMPAT_BUY_DRAFT_KEY, hasBuyDraftContent, parseBuyDraft, serializeBuyDraft } from "@/lib/compat/draft";
import { GENDER_HELP, GENDER_LABEL, NAME_PLACEHOLDER, type CompatGender, type CompatRelationship } from "@/lib/compat/relationship";
import { EMPTY_COMPAT_PERSON, type CompatPersonErrors, type CompatPersonInput } from "@/lib/compat/simple";

type BuyErrors = CompatPersonErrors & { myGender?: string; relationship?: string };

const clearDraft = () => {
  try {
    window.sessionStorage.removeItem(COMPAT_BUY_DRAFT_KEY);
  } catch {
    // 저장소를 쓸 수 없는 환경
  }
};

/**
 * 사주 궁합(유료) 구매 폼 — 내 사주(내 검사 결과)와 상대 생년월일 · 두 사람의 성별 · 지금의 사이로 받는다. 금액 · 소유자 · 입력 확인은 서버가 다시 하고, 결제 화면으로 이동한다.
 * 상대 입력은 리포트를 만드는 동안에만 보관하고 완성되면 지운다.
 * 새로고침해도 이어 쓸 수 있게 이 브라우저 탭에만 1시간 임시로 두고(서버로 보내지 않는다), 결제 화면으로 넘어가거나 탭을 닫으면 지워진다.
 * savedGender는 분석 때 입력한 내 성별 — 고르는 값과 다르면 서버가 덮어쓰지 않고 멈춰 알려 준다.
 */
export function CompatBuyForm({ assessmentId, myName, priceLabel, savedGender }: { assessmentId: string; myName: string; priceLabel: string; savedGender: CompatGender | null }) {
  const [partner, setPartner] = useState<CompatPersonInput>(EMPTY_COMPAT_PERSON);
  const [myGender, setMyGender] = useState<"" | CompatGender>("");
  const [relationship, setRelationship] = useState<"" | CompatRelationship>("");
  const [errors, setErrors] = useState<BuyErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const draftReady = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const draft = parseBuyDraft(window.sessionStorage.getItem(COMPAT_BUY_DRAFT_KEY), Date.now());
        if (draft) {
          setPartner(draft.partner);
          setMyGender(draft.myGender);
          setRelationship(draft.relationship);
        }
      } catch {
        // 저장소를 쓸 수 없는 환경에서는 처음부터
      }
      draftReady.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!draftReady.current) return;
    try {
      const draft = { partner, myGender, relationship };
      if (hasBuyDraftContent(draft)) window.sessionStorage.setItem(COMPAT_BUY_DRAFT_KEY, serializeBuyDraft(draft, Date.now()));
      else window.sessionStorage.removeItem(COMPAT_BUY_DRAFT_KEY);
    } catch {
      // 저장 실패는 입력 자체에 영향이 없다
    }
  }, [partner, myGender, relationship]);

  const clearAll = () => {
    setPartner(EMPTY_COMPAT_PERSON);
    setMyGender("");
    setRelationship("");
    setErrors({});
    setMessage(null);
    clearDraft();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const out = await startCompatCheckoutAction({ assessmentId, partner, relationship, myGender });
        // 성공하면 서버가 결제 화면으로 보내므로 여기에 오는 것은 실패뿐이다
        if (out && !out.ok) {
          setErrors((out.errors ?? {}) as BuyErrors);
          setMessage(out.message);
        }
      } catch (err) {
        // 이동(redirect)은 오류처럼 던져진다 — 결제 화면으로 넘어가므로 임시 보관한 입력을 지우고 그대로 다시 던진다
        if (err && typeof err === "object" && "digest" in err && String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) {
          clearDraft();
          throw err;
        }
        setMessage("시작하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
      }
    });
  };

  const genderHelp = savedGender ? `분석할 때 입력한 성별은 "${GENDER_LABEL[savedGender]}"예요. 궁합은 그 분석 결과를 그대로 쓰기 때문에 같게 선택해야 해요. ${GENDER_HELP}` : GENDER_HELP;

  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-describedby="compat-buy-note">
      <p className="text-[15px] leading-[1.75] text-ink-2">
        <span className="font-semibold text-ink">{myName} 님</span>의 사주와 상대의 사주를 자세히 풀어 읽어요. 두 사람의 사주와 알려 주신 사이만 보고, 상대가 직접 답한 성격 · 애착은 읽지 않아요.
      </p>
      <fieldset className="min-w-0 rounded-2xl bg-canvas p-5 shadow-soft md:p-6">
        <legend className="float-left w-full px-0 text-[17px] font-bold">본인</legend>
        <div className="clear-both -mt-5">
          <GenderField prefix="me" legend="본인의 성별" value={myGender} error={errors.myGender} onChange={(g) => setMyGender(g)} help={genderHelp} />
        </div>
      </fieldset>
      <PersonFields prefix="p" title="상대" placeholderName={NAME_PLACEHOLDER.partner} genderLegend="상대의 성별" value={partner} errors={errors} onChange={setPartner} />
      <RelationshipField prefix="buy-rel" value={relationship} error={errors.relationship} onChange={(r) => { setRelationship(r); setErrors((x) => ({ ...x, relationship: undefined })); }} />
      <p id="compat-buy-note" className="text-[13px] leading-[1.7] text-ink-3">
        [서버 보관] 상대의 이름 · 생년월일 · 성별과 두 분의 사이는 결제를 시작하면 궁합 리포트를 만드는 동안에만 서버에 보관하고, 리포트가 완성되면 지워요(리포트에는 이름이 호칭으로, 사이가 읽는 관점으로 남아요). 결제를 시작하기 전에 떠나면 서버에는 보관하지 않아요. 이름 · 생년월일 · 성별은 AI에 보내지 않고, 사이는 풀이의 관점을 정하는 지침으로만 전달해요. [탭 임시 보관] 이와 별개로 새로고침해도 이어 쓸 수 있도록 입력한 내용을 이 브라우저 탭에 1시간 동안 임시 보관하고, 결제 화면으로 넘어가거나 [입력 지우기]를 누르면 지워져요. 결과는 재미 · 참고용이에요.
      </p>
      {message && (
        <p role="alert" className="text-[15px] font-medium text-danger">
          {message}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${buttonPrimary} w-full disabled:opacity-60`}>
        {pending ? "결제 화면으로 이동 중이에요" : `사주 궁합 받기 · ${priceLabel}`}
      </button>
      <button type="button" onClick={clearAll} className="mx-auto flex min-h-11 items-center justify-center px-3 text-[14px] font-medium text-ink-3 underline decoration-ink-3/30 underline-offset-4 hover:text-ink">
        입력 지우기
      </button>
    </form>
  );
}
