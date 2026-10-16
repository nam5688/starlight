"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { makeTasteReportAction } from "@/app/results/[id]/taste-actions";
import { buttonPrimary } from "@/components/ui/styles";

/** 맛보기 리포트 받기 버튼 — AI가 쓰는 데 20~60초쯤 걸릴 수 있어 쓰는 동안 "쓰고 있어요"를 보이고, 두 번 눌러도 한 번만 보낸다 */
export function TasteReportButton({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const sent = useRef(false);

  const click = () => {
    if (sent.current || pending) return;
    sent.current = true;
    setMessage(null);
    start(async () => {
      try {
        const r = await makeTasteReportAction({ assessmentId });
        if (r.ok) router.refresh();
        else setMessage(r.message);
      } catch {
        setMessage("이번에는 맛보기 리포트를 만들지 못했어요. 한 번으로 세지 않았으니 잠시 뒤에 다시 눌러 주세요.");
      } finally {
        sent.current = false;
      }
    });
  };

  return (
    <div>
      <button type="button" onClick={click} disabled={pending} className={`${buttonPrimary} w-full sm:w-auto sm:px-8`} aria-busy={pending}>
        {pending ? "미유가 쓰고 있어요…" : "맛보기 리포트 받기 · 무료"}
      </button>
      {pending && (
        <p className="mt-2 text-[14px] leading-relaxed text-ink-3" role="status">
          사주와 응답을 엮어 쓰는 중이에요. 20~60초쯤 걸릴 수 있어요. 화면을 닫지 말고 기다려 주세요.
        </p>
      )}
      {message && (
        <p className="mt-2 text-[14px] leading-relaxed text-caution" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
