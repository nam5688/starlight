"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { simpleCompatAction } from "@/app/compat/actions";
import { RelationshipField } from "@/components/compat/choice-fields";
import { PersonFields } from "@/components/compat/person-fields";
import { CompatResult } from "@/components/compat/compat-result";
import { buttonPrimary } from "@/components/ui/styles";
import { COMPAT_DRAFT_KEY, hasCompatDraftContent, parseCompatDraft, serializeCompatDraft } from "@/lib/compat/draft";
import { NAME_PLACEHOLDER, type CompatRelationship } from "@/lib/compat/relationship";
import { EMPTY_COMPAT_PERSON, type CompatPersonErrors, type CompatPersonInput, type SimpleCompatCard } from "@/lib/compat/simple";

/**
 * 간단 궁합 입력 + 결과. 입력한 값은 계산하는 순간의 서버에서만 쓰고 저장하지 않는다.
 * 새로고침해도 이어 쓸 수 있게 이 브라우저 탭(sessionStorage)에만 1시간 임시로 두고, 탭을 닫거나 [입력 지우기]를 누르면 지워진다(서버로 보내지 않는다).
 */
export function CompatForm({ nextSteps }: { nextSteps?: React.ReactNode } = {}) {
  const [a, setA] = useState<CompatPersonInput>(EMPTY_COMPAT_PERSON);
  const [b, setB] = useState<CompatPersonInput>(EMPTY_COMPAT_PERSON);
  const [relationship, setRelationship] = useState<"" | CompatRelationship>("");
  const [errors, setErrors] = useState<{ a: CompatPersonErrors; b: CompatPersonErrors }>({ a: {}, b: {} });
  const [relationshipError, setRelationshipError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const [card, setCard] = useState<SimpleCompatCard | null>(null);
  const [pending, startTransition] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);
  const draftReady = useRef(false);
  const backToForm = useRef(false);

  // 이 탭에 임시 보관된 입력이 있으면 그린 직후 한 번 복원한다 (저장소는 브라우저에서만 읽을 수 있다)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const draft = parseCompatDraft(window.sessionStorage.getItem(COMPAT_DRAFT_KEY), Date.now());
        if (draft) {
          setA(draft.a);
          setB(draft.b);
          setRelationship(draft.relationship);
        }
      } catch {
        // 저장소를 쓸 수 없는 환경에서는 처음부터
      }
      draftReady.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // 입력이 바뀔 때마다 이 탭에만 임시 보관한다 (빈 상태는 지운다)
  useEffect(() => {
    if (!draftReady.current) return;
    try {
      const draft = { a, b, relationship };
      if (hasCompatDraftContent(draft)) window.sessionStorage.setItem(COMPAT_DRAFT_KEY, serializeCompatDraft(draft, Date.now()));
      else window.sessionStorage.removeItem(COMPAT_DRAFT_KEY);
    } catch {
      // 저장 실패는 입력 자체에 영향이 없다
    }
  }, [a, b, relationship]);

  const clearAll = () => {
    setA(EMPTY_COMPAT_PERSON);
    setB(EMPTY_COMPAT_PERSON);
    setRelationship("");
    setErrors({ a: {}, b: {} });
    setRelationshipError(undefined);
    setMessage(null);
    try {
      window.sessionStorage.removeItem(COMPAT_DRAFT_KEY);
    } catch {
      // 저장소를 쓸 수 없는 환경
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setMessage(null);
    setRelationshipError(undefined);
    startTransition(async () => {
      try {
        const out = await simpleCompatAction({ a, b, relationship });
        if (out.ok) {
          setErrors({ a: {}, b: {} });
          // 결과 위치로 옮기는 일은 결과 컴포넌트가 붙은 뒤 스스로 한다(CompatResult) — 여기서 옮기면 렌더 전에 실행될 수 있다
          setCard(out.card);
        } else {
          setErrors(out.errors);
          setRelationshipError(out.relationship);
          setMessage(out.message ?? "입력을 확인해 주세요.");
        }
      } catch {
        setMessage("계산하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
      }
    });
  };

  const reset = () => {
    backToForm.current = true;
    setCard(null);
    clearAll();
  };

  // "다시 보기"로 입력 화면이 다시 그려진 뒤 입력 맨 위로 옮긴다(그리기 전에는 topRef가 없다)
  useEffect(() => {
    if (card || !backToForm.current) return;
    backToForm.current = false;
    topRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [card]);

  if (card) return <CompatResult card={card} onReset={reset} nextSteps={nextSteps} />;

  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-describedby="compat-privacy">
      <div ref={topRef} />
      <PersonFields prefix="a" title="본인" placeholderName={NAME_PLACEHOLDER.self} genderLegend="본인의 성별" value={a} errors={errors.a} onChange={setA} />
      <PersonFields prefix="b" title="상대" placeholderName={NAME_PLACEHOLDER.partner} genderLegend="상대의 성별" value={b} errors={errors.b} onChange={setB} />
      <RelationshipField value={relationship} error={relationshipError} onChange={(r) => { setRelationship(r); setRelationshipError(undefined); }} />
      <p id="compat-privacy" className="text-[13px] leading-[1.7] text-ink-3">
        로그인 없이 볼 수 있어요. 입력한 정보는 궁합 계산을 위해 서버에 전달되지만 서버에는 저장하지 않아요. 새로고침해도 이어 쓸 수 있도록 이 브라우저 탭에 1시간 동안 임시 보관해요. 탭을 닫거나 [입력 지우기]를 누르면 지워져요.
      </p>
      {message && (
        <p role="alert" className="text-[15px] font-medium text-danger">
          {message}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${buttonPrimary} w-full disabled:opacity-60`}>
        {pending ? "두 사주를 읽는 중이에요" : "우리 궁합 보기"}
      </button>
      <button type="button" onClick={clearAll} className="mx-auto flex min-h-11 items-center justify-center px-3 text-[14px] font-medium text-ink-3 underline decoration-ink-3/30 underline-offset-4 hover:text-ink">
        입력 지우기
      </button>
    </form>
  );
}
