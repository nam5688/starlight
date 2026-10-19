"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteReportRecordAction } from "@/app/my/actions";
import { useBodyScrollLock } from "./body-scroll-lock";
import { isVisiblyRendered } from "./visible-check";

/** 확인창 안내 문구 — 무엇이 지워지고 무엇이 남는지 (lib/services/my-service.ts의 deleteReportRecord와 DB 함수 delete_assessment_record가 하는 일과 같아야 한다) */
export const DELETE_RECORD_COPY = {
  button: "기록 삭제",
  title: "이 기록을 삭제할까요?",
  /** 어느 카드를 지우는지 — 확인창 맨 위에 카드에 이미 보이는 리포트명 · 이름 · 생성일을 다시 보인다 */
  targetTitle: "삭제할 기록",
  createdPrefix: "생성일",
  lead: "삭제하면 되돌릴 수 없어요.",
  /** 가운데 스크롤 영역의 이름 (키보드 · 보조기기로 스크롤할 수 있게 이름을 준다) */
  bodyLabel: "삭제되는 것과 그대로 남는 것 자세히 보기",
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
  /** 확인창이 화면에 보이지 않는 브라우저에서 같은 내용을 카드 안에 펼칠 때 위에 붙는 한 줄 */
  inlineNote: "확인창이 화면에 보이지 않아 여기에 펼쳤어요. 아래에서 그대로 확인하고 삭제할 수 있어요.",
  cancel: "취소",
  confirm: "삭제하기",
  pending: "삭제하는 중…",
} as const;

/** 아래 고정 줄 — 안내가 아무리 길어도 취소 · 삭제하기는 늘 화면 안에 있다 (짧은 가로 화면에서는 줄여 안내 몫을 남긴다) */
function Buttons({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  // 보내기가 끝났는데 이 창이 아직 열려 있다면(이미 처리 중이라는 안내 · 기록을 찾지 못함 등 화면이 그대로 남는 경우) 창을 닫아 둔다
  useEffect(() => {
    if (wasPending.current && !pending) onDone();
    wasPending.current = pending;
  }, [pending, onDone]);
  return (
    <div
      data-testid="delete-record-foot"
      className="grid shrink-0 grid-cols-2 gap-2 border-t border-line px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] [@media(max-height:480px)]:px-4 [@media(max-height:480px)]:pt-2 [@media(max-height:480px)]:pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
    >
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line-strong bg-canvas px-3 text-[15px] font-semibold text-ink hover:bg-mist disabled:cursor-wait disabled:opacity-60 [@media(max-height:480px)]:min-h-10"
      >
        {DELETE_RECORD_COPY.cancel}
      </button>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-caution px-3 text-[15px] font-bold text-white hover:brightness-90 disabled:cursor-wait disabled:opacity-70 [@media(max-height:480px)]:min-h-10"
      >
        {pending ? DELETE_RECORD_COPY.pending : DELETE_RECORD_COPY.confirm}
      </button>
    </div>
  );
}

type SheetProps = {
  assessmentId: string;
  productName: string;
  subject: string;
  created: string;
  /** 이 안내 하나의 id 접두사 — 확인창과 카드 안 펼침이 같은 id를 갖지 않게 한다 */
  ids: { title: string; target: string; lead: string; body: string };
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  onCancel: () => void;
  onDone: () => void;
  /** 카드 안에 펼친 경우 — 안내를 안에서 스크롤하지 않고 문서 흐름대로 길게 보인다 */
  inline?: boolean;
};

/**
 * 확인 안내 본문(위 고정 · 가운데 안내 · 아래 고정). 확인창(<dialog>)과 카드 안 펼침이 같은 것을 쓴다.
 * 서버 액션을 부르는 <form>은 아래 고정 줄(취소 · 삭제하기)만 감싼다 — 안내 전체를 감싸 중첩 flex로 높이를 나누는 구조는
 * 브라우저에 따라 높이가 0이 되어 창이 보이지 않을 수 있어(실기기 보고) 쓰지 않는다. 위 · 가운데 · 아래는 모두 확인창의 직접 자식이다.
 */
function ConfirmSheet({ assessmentId, productName, subject, created, ids, titleRef, onCancel, onDone, inline = false }: SheetProps) {
  return (
    <>
      <div data-testid="delete-record-head" className="shrink-0 px-5 pt-5 pb-3 [@media(max-height:480px)]:px-4 [@media(max-height:480px)]:pt-3 [@media(max-height:480px)]:pb-2">
        <h2 ref={titleRef} id={ids.title} tabIndex={-1} className="text-[20px] leading-snug font-bold outline-none [@media(max-height:480px)]:text-[17px]">
          {DELETE_RECORD_COPY.title}
        </h2>
        {inline && <p className="mt-1.5 text-[13px] leading-[1.6] text-ink-3">{DELETE_RECORD_COPY.inlineNote}</p>}
        <div id={ids.target} data-testid="delete-record-target" className="mt-2.5 rounded-xl bg-mist px-3.5 py-2.5 [@media(max-height:480px)]:mt-1.5 [@media(max-height:480px)]:py-1.5">
          <p className="text-[13px] font-semibold text-ink-3 [@media(max-height:480px)]:hidden">{DELETE_RECORD_COPY.targetTitle}</p>
          <p className="mt-0.5 text-[16px] leading-snug font-bold break-words [@media(max-height:480px)]:mt-0 [@media(max-height:480px)]:text-[14px]">{productName}</p>
          <p className="mt-0.5 text-[14px] leading-[1.5] break-words text-ink-2 [@media(max-height:480px)]:mt-0 [@media(max-height:480px)]:text-[13px]">{subject}</p>
          {created && (
            <p className="mt-0.5 text-[13px] leading-[1.5] text-ink-3 [@media(max-height:480px)]:mt-0 [@media(max-height:480px)]:text-[12px]">
              {DELETE_RECORD_COPY.createdPrefix} {created}
            </p>
          )}
        </div>
        <p id={ids.lead} className="mt-2.5 text-[15px] leading-[1.5] font-semibold text-caution [@media(max-height:480px)]:mt-1.5 [@media(max-height:480px)]:text-[13px]">
          {DELETE_RECORD_COPY.lead}
        </p>
      </div>
      <div
        id={ids.body}
        data-testid="delete-record-body"
        {...(inline ? {} : { "data-scroll-ok": "", role: "region", "aria-label": DELETE_RECORD_COPY.bodyLabel, tabIndex: 0 })}
        className={`${inline ? "" : "min-h-0 flex-auto overflow-y-auto overscroll-contain "}border-t border-line px-5 pt-3 pb-3 [@media(max-height:480px)]:px-4 [@media(max-height:480px)]:pt-2 [@media(max-height:480px)]:pb-2`}
      >
        <h3 className="text-[14px] font-bold text-ink-2">{DELETE_RECORD_COPY.removedTitle}</h3>
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
      <form action={deleteReportRecordAction.bind(null, assessmentId)} className="shrink-0">
        <Buttons onCancel={onCancel} onDone={onDone} />
      </form>
    </>
  );
}

/**
 * 리포트 카드의 "기록 삭제" — 버튼을 누르면 확인창이 열리고, 확인창의 "삭제하기"를 눌러야 지워진다. 취소 · Esc · 바깥 누르기는 아무것도 지우지 않는다.
 * 네이티브 `<dialog>`라 열려 있는 동안 뒤쪽 화면은 초점과 읽기에서 빠지고 닫으면 눌렀던 버튼으로 초점이 돌아온다. 삭제 중에는 두 버튼이 잠겨 두 번 눌러도 한 번만 보낸다(서버도 한 번만 지운다).
 *
 * 화면 안에 들어오게 하는 구조(휴대폰 · 카카오톡 앱 안 브라우저 실기기 보고 2026-10-19: 창 전체가 스크롤돼 제목이 위로 잘렸다):
 *  - 창 높이는 보이는 화면(`.confirm-sheet`, 동적 뷰포트 높이)을 넘지 않는다.
 *  - 위 고정 영역(제목 · 삭제할 기록 · 경고 한 줄)과 아래 고정 영역(취소 · 삭제하기)은 스크롤되지 않고, 가운데 긴 안내(삭제되는 것 · 남는 것)만 안에서 스크롤된다.
 *  - 열 때 브라우저는 첫 버튼(취소)에 초점을 주고 그 자리로 스크롤하므로, 열자마자 제목으로 초점을 옮겨(스크롤 없이) 제목 · 대상이 처음부터 보이게 한다. 삭제하기 버튼에 초점을 주지 않는다.
 *  - 열려 있는 동안 뒤쪽 화면 스크롤을 막고(`useBodyScrollLock` — 문서 `overflow: hidden`, 위치는 건드리지 않음) 닫으면 눌렀던 버튼의 초점을 되돌린다.
 *
 * 어두운 배경만 남고 확인창이 보이지 않는다는 실기기 보고(2026-10-19, 위 보고 뒤 같은 날)에 대한 대비:
 *  - 확인창 높이를 나누던 중첩 flex(`flex-1` 0% 기준)와 본문 고정(`position: fixed`)은 브라우저에 따라 창이 0 높이가 되거나 화면 밖에 놓일 수 있어 없앴다(위 · 가운데 · 아래가 확인창의 직접 자식, 가운데는 `flex: auto`).
 *  - 그래도 열자마자 보이는지 두 번 그린 뒤 확인하고(`isVisiblyRendered`), 보이지 않으면 확인창을 닫고 같은 내용을 카드 안에 펼친다 — 어두운 배경만 남은 채 막히지 않는다.
 */
export function DeleteRecordButton({ assessmentId, productName, subject, created }: { assessmentId: string; /** 카드의 리포트명 (예: 심층 리포트) */ productName: string; /** 카드의 표시 이름 · 분석 대상 (예: 지민 님 · 1995. 4. 12.) */ subject: string; /** 카드의 생성일 (이미 화면에 보이는 값) */ created: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const inlineTitleRef = useRef<HTMLHeadingElement>(null);
  const [inline, setInline] = useState(false);
  const inlineWanted = useRef(false);
  const base = useId();
  const dialogIds = { title: `${base}-t`, target: `${base}-g`, lead: `${base}-l`, body: `${base}-b` };
  const inlineIds = { title: `${base}-it`, target: `${base}-ig`, lead: `${base}-il`, body: `${base}-ib` };
  const { lock, release } = useBodyScrollLock();

  const open = () => {
    const dialog = dialogRef.current;
    if (inline) {
      inlineTitleRef.current?.focus();
      return;
    }
    if (!dialog || dialog.open) return;
    lock();
    try {
      dialog.showModal();
    } catch {
      release();
      inlineWanted.current = true;
      setInline(true);
      return;
    }
    titleRef.current?.focus({ preventScroll: true });
    // 두 번 그린 뒤에도 보이지 않으면(어두운 배경만 남는 브라우저) 확인창을 닫고 카드 안에 펼친다
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!dialog.open || isVisiblyRendered(dialog, titleRef.current)) return;
        inlineWanted.current = true;
        setInline(true);
        dialog.close();
      }),
    );
  };
  const close = () => dialogRef.current?.close();
  // 취소 · Esc · 바깥 누르기 — 무엇이든 닫히면 배경 잠금을 풀고 열기 전 초점으로 되돌린다(카드 안에 펼치는 경우는 펼친 안내로 초점을 옮긴다)
  const onClosed = () => {
    release();
    if (inlineWanted.current) return;
    openerRef.current?.focus({ preventScroll: true });
  };
  // 보내기를 마쳤는데도 이 화면이 남아 있는 경우: 닫는다
  const onDone = () => {
    release();
    inlineWanted.current = false;
    setInline(false);
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  };
  const cancelInline = () => {
    inlineWanted.current = false;
    setInline(false);
    openerRef.current?.focus({ preventScroll: true });
  };

  // 카드 안에 펼친 안내로 초점(스크롤은 브라우저가 보이는 곳까지만)
  useEffect(() => {
    if (!inline) return;
    inlineTitleRef.current?.focus();
  }, [inline]);

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        aria-expanded={inline}
        aria-label={`${productName}, ${subject}, ${DELETE_RECORD_COPY.button}`}
        className="inline-flex min-h-11 items-center rounded-lg px-1 text-[14px] font-semibold text-caution underline underline-offset-2 hover:text-ink"
        data-testid="delete-record-open"
      >
        {DELETE_RECORD_COPY.button}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={dialogIds.title}
        aria-describedby={`${dialogIds.target} ${dialogIds.lead} ${dialogIds.body}`}
        data-testid="delete-record-dialog"
        onClose={onClosed}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="confirm-sheet rounded-3xl bg-canvas p-0 text-ink shadow-pop backdrop:bg-black/40"
      >
        <ConfirmSheet assessmentId={assessmentId} productName={productName} subject={subject} created={created} ids={dialogIds} titleRef={titleRef} onCancel={close} onDone={onDone} />
      </dialog>
      {inline && (
        <section
          role="group"
          aria-labelledby={inlineIds.title}
          aria-describedby={`${inlineIds.target} ${inlineIds.lead} ${inlineIds.body}`}
          data-testid="delete-record-inline"
          onKeyDown={(e) => {
            if (e.key === "Escape") cancelInline();
          }}
          className="mt-2 rounded-2xl border border-line-strong bg-canvas text-ink shadow-soft"
        >
          <ConfirmSheet assessmentId={assessmentId} productName={productName} subject={subject} created={created} ids={inlineIds} titleRef={inlineTitleRef} onCancel={cancelInline} onDone={onDone} inline />
        </section>
      )}
    </>
  );
}
