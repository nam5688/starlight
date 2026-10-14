"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { TALK_COPY, type TalkBuy } from "@/lib/report/reading/talk";
import { MiyuAvatar } from "./miyu-character";

type Props = {
  open: boolean;
  onClose: () => void;
  /** 이어지는 곳 — 실제로 있는 리포트 구매(이미 구매했다면 내 리포트). 별도의 "질문 충전" 상품은 아직 없다 */
  buy: TalkBuy;
};

/**
 * 무료 질문을 모두 썼을 때 뜨는 안내창(운영자 문구 2026-10-15) — 네이티브 `<dialog>`라 Esc · 바깥 누르기로 닫히고,
 * 열려 있는 동안 뒤쪽 화면은 초점과 읽기에서 빠지며, 닫으면 눌렀던 자리로 초점이 돌아온다.
 * 마감 타이머 · 불안을 자극하는 말은 쓰지 않고, "다음에 할게요"로 언제든 닫을 수 있다.
 */
export function RechargeDialog({ open, onClose, buy }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const copy = TALK_COPY.recharge;
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onClose={onClose}
      // 안쪽 상자 밖(바깥 어두운 곳)을 눌렀을 때만 닫는다 — 안쪽을 누르면 target이 안쪽 요소다
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto w-[min(92vw,22rem)] rounded-3xl bg-canvas p-0 text-ink shadow-pop backdrop:bg-black/40"
    >
      <div className="flex flex-col items-center gap-3 px-6 pt-7 pb-6 text-center">
        <MiyuAvatar mood="happy" className="size-16" />
        <h2 id={titleId} className="text-[20px] leading-snug font-bold">
          {copy.title}
        </h2>
        <p id={bodyId} className="text-[15px] leading-[1.65] text-ink-2">
          <span className="block">{copy.used}</span>
          <span className="block font-semibold text-ink">{copy.body}</span>
        </p>
        <Link
          href={buy.href}
          className="mt-1 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-accent px-5 py-2 text-[16px] font-semibold text-white hover:bg-accent-strong"
        >
          {buy.label}
        </Link>
        <button type="button" onClick={onClose} className="min-h-11 w-full rounded-full text-[15px] font-medium text-ink-3 hover:bg-mist">
          {copy.later}
        </button>
      </div>
    </dialog>
  );
}
