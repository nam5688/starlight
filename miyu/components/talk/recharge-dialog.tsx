"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { PurchaseStartButton } from "@/components/results/purchase-start-button";
import { TALK_COPY } from "@/lib/report/reading/talk";
import { MiyuAvatar } from "./miyu-character";
import type { MiyuTone } from "./miyu-moods";

/**
 * 안내창의 종류 — 무료 질문을 다 썼을 때의 경우와 심층 리포트 안내
 *  free-used: 무료 리포트 회원이 이 방의 무료 질문을 모두 썼다  paid-used: 심층 리포트 회원이 이 방의 무료 질문을 모두 썼다
 *  deep: 무료 리포트로는 더 이어 갈 수 없는 방이다 (또는 질문 3개 묶음 결제를 열 수 없는 무료 리포트 회원)
 */
export type RechargeVariant = "free-used" | "paid-used" | "deep";

/** 이어지는 곳 — 심층 리포트 구매(href) 또는 입력창으로 돌아가 질문을 이어 가기(onPick) */
export type RechargeAction = { label: string; href: string } | { label: string; pick: true };

type Props = {
  open: boolean;
  onClose: () => void;
  variant: RechargeVariant;
  /** 이어지는 곳 — 질문 이어가기(입력창으로, onPick) 또는 심층 리포트 구매(href). 없으면 버튼 없이 안내만 보인다 */
  action: RechargeAction | null;
  /** action이 pick일 때 누르면 — 안내창을 닫고 입력창으로 돌아간다 */
  onPick?: () => void;
  /** 이 방의 캐릭터 색 */
  tone?: MiyuTone;
  /** 내 결과 번호 — 있으면 심층 리포트 안내가 구매 영역으로 가는 링크가 아니라 "구매를 시작하는 버튼"(진행 중 · 막힌 이유를 이 안내창에 보인다)이다. 예시 화면에는 없다 */
  assessmentId?: string;
};

/**
 * 무료 질문을 모두 썼을 때 뜨는 안내창(운영자 2026-10-15 · 선불 충전 대신 질문 3개 묶음 결제) — 네이티브 `<dialog>`라 Esc · 바깥 누르기로 닫히고,
 * 열려 있는 동안 뒤쪽 화면은 초점과 읽기에서 빠지며, 닫으면 눌렀던 자리로 초점이 돌아온다.
 * 마감 타이머 · 불안을 자극하는 말은 쓰지 않고, "다음에 할게요"로 언제든 닫을 수 있다.
 */
export function RechargeDialog({ open, onClose, variant, action, onPick, tone, assessmentId }: Props) {
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
  const text = copy[variant];
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
        <MiyuAvatar tone={tone} className="size-16" />
        <h2 id={titleId} className="text-[20px] leading-snug font-bold">
          {text.title}
        </h2>
        <p id={bodyId} className="text-[15px] leading-[1.65] font-medium text-ink-2">
          {text.body}
        </p>
        {action &&
          ("href" in action ? (
            assessmentId && action.href.endsWith("#r-purchase") ? (
              <PurchaseStartButton
                assessmentId={assessmentId}
                panelHref={action.href}
                label={action.label}
                buttonClassName="mt-1 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-accent px-5 py-2 text-[16px] font-semibold text-white hover:bg-accent-strong"
                className="w-full"
              />
            ) : (
            <Link href={action.href} className="mt-1 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-accent px-5 py-2 text-[16px] font-semibold text-white hover:bg-accent-strong">
              {action.label}
            </Link>
            )
          ) : (
            <button type="button" onClick={onPick} className="mt-1 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-accent px-5 py-2 text-[16px] font-semibold text-white hover:bg-accent-strong">
              {action.label}
            </button>
          ))}
        <button type="button" onClick={onClose} className="min-h-11 w-full rounded-full text-[15px] font-medium text-ink-3 hover:bg-mist">
          {copy.later}
        </button>
      </div>
    </dialog>
  );
}
