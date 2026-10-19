"use client";

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { deleteReportRecordAction } from "@/app/my/actions";

/** 확인창 안내 문구 — 무엇이 지워지고 무엇이 남는지 (lib/services/my-service.ts의 deleteReportRecord와 DB 함수 delete_assessment_record가 하는 일과 같아야 한다) */
export const DELETE_RECORD_COPY = {
  button: "기록 삭제",
  title: "이 기록을 삭제할까요?",
  /** 어느 카드를 지우는지 — 확인창 맨 위에 카드에 이미 보이는 리포트명 · 이름 · 생성일을 다시 보인다 */
  targetTitle: "삭제할 기록",
  createdPrefix: "생성일",
  lead: "삭제하면 되돌릴 수 없어요.",
  removedTitle: "삭제되는 것",
  removed: [
    "이 결과로 받은 리포트 본문 (무료 리포트 · 심층 리포트)",
    "맛보기 리포트 글",
    "고민 반영 리포트와 적어 둔 고민",
    "삭제한 뒤에는 결과 화면 · 미리보기 · 전체 리포트를 다시 열 수 없고, 지운 글은 복구할 수 없어요.",
  ],
  keptTitle: "그대로 남는 것",
  kept: [
    "채팅방과 지난 대화 (읽기만 할 수 있는 기록으로 남아요)",
    "남은 질문권",
    "주문 · 결제 · 환불 기록과 계정 · 동의 정보",
    "채팅이 이어지도록 분석에 쓴 입력 정보",
  ],
  notes: [
    "이미 결제한 리포트라도 삭제한 기록은 다시 만들어 주거나 다시 구매하게 하지 않아요.",
    "맛보기 리포트는 계정당 한 번이라 삭제해도 다시 받을 수 없어요.",
    "새 분석을 시작하면 새 리포트를 받을 수 있어요.",
  ],
  cancel: "취소",
  confirm: "삭제하기",
  pending: "삭제하는 중…",
} as const;

function Buttons({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="mt-5 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line-strong bg-canvas px-3 text-[15px] font-semibold text-ink hover:bg-mist disabled:cursor-wait disabled:opacity-60"
      >
        {DELETE_RECORD_COPY.cancel}
      </button>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-caution px-3 text-[15px] font-bold text-white hover:brightness-90 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? DELETE_RECORD_COPY.pending : DELETE_RECORD_COPY.confirm}
      </button>
    </div>
  );
}

/**
 * 리포트 카드의 "기록 삭제" — 버튼을 누르면 확인창이 열리고, 확인창의 "삭제하기"를 눌러야 지워진다. 취소 · Esc · 바깥 누르기는 아무것도 지우지 않는다.
 * 네이티브 `<dialog>`라 열려 있는 동안 뒤쪽 화면은 초점과 읽기에서 빠지고 닫으면 눌렀던 버튼으로 초점이 돌아온다. 삭제 중에는 두 버튼이 잠겨 두 번 눌러도 한 번만 보낸다(서버도 한 번만 지운다).
 */
export function DeleteRecordButton({ assessmentId, productName, subject, created }: { assessmentId: string; /** 카드의 리포트명 (예: 심층 리포트) */ productName: string; /** 카드의 표시 이름 · 분석 대상 (예: 지민 님 · 1995. 4. 12.) */ subject: string; /** 카드의 생성일 (이미 화면에 보이는 값) */ created: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const targetId = useId();
  const bodyId = useId();
  const close = () => ref.current?.close();
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-haspopup="dialog"
        aria-label={`${productName}, ${subject}, ${DELETE_RECORD_COPY.button}`}
        className="inline-flex min-h-11 items-center rounded-lg px-1 text-[14px] font-semibold text-caution underline underline-offset-2 hover:text-ink"
        data-testid="delete-record-open"
      >
        {DELETE_RECORD_COPY.button}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        aria-describedby={`${targetId} ${bodyId}`}
        data-testid="delete-record-dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="m-auto max-h-[90dvh] w-[min(94vw,26rem)] overflow-y-auto rounded-3xl bg-canvas p-0 text-ink shadow-pop backdrop:bg-black/40"
      >
        <form action={deleteReportRecordAction.bind(null, assessmentId)} className="px-5 pt-6 pb-5">
          <h2 id={titleId} className="text-[20px] leading-snug font-bold">
            {DELETE_RECORD_COPY.title}
          </h2>
          <div id={targetId} data-testid="delete-record-target" className="mt-3 rounded-xl bg-mist px-3.5 py-3">
            <p className="text-[13px] font-semibold text-ink-3">{DELETE_RECORD_COPY.targetTitle}</p>
            <p className="mt-0.5 text-[16px] leading-snug font-bold break-words">{productName}</p>
            <p className="mt-0.5 text-[14px] leading-[1.6] break-words text-ink-2">{subject}</p>
            {created && (
              <p className="mt-0.5 text-[13px] leading-[1.6] text-ink-3">
                {DELETE_RECORD_COPY.createdPrefix} {created}
              </p>
            )}
          </div>
          <div id={bodyId}>
            <p className="mt-3 text-[15px] leading-[1.65] font-semibold text-caution">{DELETE_RECORD_COPY.lead}</p>
            <h3 className="mt-4 text-[14px] font-bold text-ink-2">{DELETE_RECORD_COPY.removedTitle}</h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[14px] leading-[1.6] text-ink-2">
              {DELETE_RECORD_COPY.removed.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <h3 className="mt-4 text-[14px] font-bold text-ink-2">{DELETE_RECORD_COPY.keptTitle}</h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[14px] leading-[1.6] text-ink-2">
              {DELETE_RECORD_COPY.kept.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <ul className="mt-4 space-y-1 text-[13px] leading-[1.6] text-ink-3">
              {DELETE_RECORD_COPY.notes.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <Buttons onCancel={close} />
        </form>
      </dialog>
    </>
  );
}
