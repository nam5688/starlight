"use client";

import { useEffect, useId, useRef } from "react";
import { ROOM_COPY } from "@/lib/report/reading/talk-room";
import { MiyuAvatar } from "./miyu-character";

type Props = {
  open: boolean;
  /** 계속 대화하기 · Esc · 바깥 누르기 */
  onStay: () => void;
  /** true: 요약을 저장하고 끝낸다 · false: 저장하지 않고 끝낸다 */
  onClose: (keep: boolean) => void;
  /** 끝내는 중이면 버튼을 잠근다 */
  busy: boolean;
  /** 저장하지 못했다면 이유 (대화는 지우지 않았다) */
  error: string | null;
};

/**
 * 대화 종료 안내창 — "이전 채팅내용은 다시 볼 수 없어요. 저장할까요?" 예 · 아니오(운영자 문구 2026-10-15).
 * 네이티브 `<dialog>`라 Esc · 바깥 누르기로 닫히고(= 계속 대화하기), 열려 있는 동안 뒤쪽 화면은 초점과 읽기에서 빠지며, 닫으면 눌렀던 자리로 초점이 돌아온다.
 * 저장하지 않아도 이 방의 이야기가 보이지 않는 참고 기록으로 남는다는 것을 작게 알린다(숨기지 않는다).
 */
export function CloseDialog({ open, onStay, onClose, busy, error }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const copy = ROOM_COPY.summary;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onClose={() => {
        if (!busy) onStay();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onStay();
      }}
      className="m-auto w-[min(92vw,22rem)] rounded-3xl bg-canvas p-0 text-ink shadow-pop backdrop:bg-black/40"
    >
      <div className="flex flex-col items-center gap-3 px-6 pt-7 pb-6 text-center">
        <MiyuAvatar mood="basic" className="size-16" />
        <h2 id={titleId} className="text-[20px] leading-snug font-bold">
          {copy.closeTitle}
        </h2>
        <p id={bodyId} className="text-[15px] leading-[1.65] font-medium text-ink-2">
          {copy.closeBody}
        </p>
        {error && (
          <p role="alert" className="w-full rounded-xl bg-caution-soft px-3 py-2 text-[14px] leading-snug text-caution">
            {error}
          </p>
        )}
        <div className="mt-1 grid w-full grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onClose(true)}
            className="flex min-h-14 flex-col items-center justify-center rounded-2xl bg-accent px-3 py-2 text-white hover:bg-accent-strong disabled:cursor-wait disabled:opacity-70"
          >
            <span className="text-[17px] leading-tight font-bold">{copy.yes}</span>
            <span className="mt-0.5 text-[12px] leading-tight font-medium opacity-90">{copy.yesSub}</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onClose(false)}
            className="flex min-h-14 flex-col items-center justify-center rounded-2xl bg-accent-soft px-3 py-2 text-accent-strong hover:brightness-95 disabled:cursor-wait disabled:opacity-70"
          >
            <span className="text-[17px] leading-tight font-bold">{copy.no}</span>
            <span className="mt-0.5 text-[12px] leading-tight font-medium">{copy.noSub}</span>
          </button>
        </div>
        <button type="button" disabled={busy} onClick={onStay} className="min-h-11 w-full rounded-full text-[15px] font-medium text-ink-3 hover:bg-mist disabled:opacity-60">
          {copy.stay}
        </button>
        <p className="text-[12px] leading-[1.6] text-ink-3">{copy.closeNote}</p>
      </div>
    </dialog>
  );
}
