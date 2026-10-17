"use client";

import { useActionState, useRef, useState } from "react";
import type { BenefitFormState } from "@/app/my/benefits/actions";
import { FormMessage, type BenefitAction } from "@/components/my/benefits/form-message";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";

/**
 * 내 추천 링크 — 아직 없으면 [내 초대 링크 만들기], 있으면 링크 전체(줄바꿈해서 다 보인다)와 [복사].
 * 링크에는 무작위 토큰만 있고 이름 · 생년월일 · 회원번호는 없다.
 */
export function InviteLinkBox({ url, action, idPrefix = "" }: { url: string | null; action: BenefitAction; idPrefix?: string }) {
  const [state, formAction, pending] = useActionState<BenefitFormState, FormData>(action, null);
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const linkRef = useRef<HTMLParagraphElement>(null);

  if (!url) {
    return (
      <form action={formAction}>
        <button type="submit" disabled={pending} aria-busy={pending} className={`${buttonPrimary} w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto`}>
          {pending ? "만드는 중…" : "내 초대 링크 만들기"}
        </button>
        <FormMessage state={state} id={`${idPrefix}invite-message`} />
      </form>
    );
  }

  const link: string = url;

  function selectLink() {
    const node = linkRef.current;
    const selection = globalThis.getSelection?.();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopy("done");
    } catch {
      // 클립보드를 쓸 수 없는 환경(주소가 https가 아님 · 권한 거절 등) — 링크를 선택해 두고 직접 복사하게 안내한다
      selectLink();
      setCopy("failed");
    }
  }

  const labelId = `${idPrefix}invite-url-label`;
  return (
    <div role="group" aria-labelledby={labelId}>
      <p id={labelId} className="text-[15px] font-semibold">
        내 초대 링크
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <p ref={linkRef} onClick={selectLink} className="min-w-0 flex-1 rounded-lg bg-mist px-4 py-3 text-[14px] leading-[1.55] break-all text-ink select-all">
          {link}
        </p>
        <button type="button" onClick={copyLink} className={`${buttonSecondary} shrink-0 sm:px-5`}>
          {copy === "done" ? "복사됨" : "링크 복사"}
        </button>
      </div>
      {copy === "done" && (
        <p role="status" className="mt-2 text-[14px] text-positive">
          링크를 복사했어요. 친구에게 붙여 넣어 보내 주세요.
        </p>
      )}
      {copy === "failed" && (
        <p role="status" className="mt-2 text-[14px] text-caution">
          자동으로 복사하지 못했어요. 링크가 선택되어 있으니 길게 눌러(또는 Ctrl+C) 복사해 주세요.
        </p>
      )}
      <FormMessage state={state} id={`${idPrefix}invite-message`} />
    </div>
  );
}
