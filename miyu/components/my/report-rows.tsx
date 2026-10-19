import Link from "next/link";
import { hideReportAction, restoreReportAction } from "@/app/my/actions";
import { retryReceivedReportAction, retryReportAction } from "@/app/results/[id]/actions";
import { ReceivedReports } from "@/components/results/received-reports";
import { StateBadge } from "@/components/my/state-badge";
import { formatDate, formatDateTime } from "@/components/ui/format";
import { ChevronIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/source-badge";
import { textLink } from "@/components/ui/styles";
import { CONCERN_RECORDS } from "@/lib/config/product";
import { topicLabel } from "@/lib/personalization/context";
import type { MyConcernCard, MyReportCard } from "@/lib/services/my-service";

/** 고민 반영 리포트 한 건: 제목 · 상태 · 발급일 · 고민 주제 · 고민을 쓴 시점 */
export function ConcernRow({ card }: { card: MyConcernCard }) {
  const href = `/results/${card.assessmentId}/context/${card.recordId}`;
  const small = "inline-flex h-10 items-center justify-center rounded-lg px-4 text-[14px] font-semibold";
  const primary = `${small} bg-accent text-white hover:bg-accent-strong`;
  const secondary = `${small} border border-line-strong bg-canvas text-ink hover:bg-mist`;
  return (
    <li className="rounded-xl border border-line bg-canvas p-4" data-testid="my-concern">
      <p className="text-[16px] leading-snug font-bold">{card.topicLabel} 고민 리포트</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {card.entitlement === "refunded" ? <StateBadge kind="refunded">환불됨</StateBadge> : <StateBadge kind="paid">구매 완료</StateBadge>}
        {card.entitlement === "purchased" && card.generation === "in-progress" && <StateBadge kind="generating">생성 중</StateBadge>}
        {card.entitlement === "purchased" && card.generation === "failed" && <StateBadge kind="failed">생성 실패</StateBadge>}
        {card.entitlement === "purchased" && card.generation === "ready" && <StateBadge kind="ready">열람 가능</StateBadge>}
        <StateBadge kind="new">새 고민 반영</StateBadge>
      </div>
      <p className="mt-2.5 text-[14px] leading-[1.6] text-ink-2">{card.subject}</p>
      <p className="mt-1 text-[13px] leading-[1.6] text-ink-3">
        발급일 {formatDate(card.issuedAt)} · 고민 작성 시점 {formatDateTime(card.writtenAt)}
        {card.contentScrubbed ? " · 적은 내용을 지움" : ""} · 주문번호 {card.orderNumber}
      </p>
      {card.entitlement === "purchased" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {card.generation === "ready" ? (
            <Link href={href} className={primary}>
              이 고민이 반영된 리포트 보러가기
            </Link>
          ) : card.generation === "failed" ? (
            <Link href={href} className={primary}>
              같은 발급 건으로 다시 만들기
            </Link>
          ) : (
            <Link href={href} className={secondary}>
              생성 중 — 상태 보기
            </Link>
          )}
          <Link href={`/results/${card.assessmentId}/context`} className={secondary}>
            나의 고민 기록소
          </Link>
        </div>
      )}
    </li>
  );
}

/** 리포트 카드의 상태 표시 — 목록의 카드와 숨긴 리포트의 줄이 같은 모양을 쓴다 */
function ReportStateBadges({ card }: { card: MyReportCard }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {card.entitlement === "refunded" ? (
        <StateBadge kind="refunded">환불됨</StateBadge>
      ) : card.entitlement === "free" ? (
        <StateBadge kind="free">무료 결과</StateBadge>
      ) : (
        <>
          <StateBadge kind="paid">구매 완료</StateBadge>
          {card.generation === "in-progress" && <StateBadge kind="generating">생성 중</StateBadge>}
          {card.generation === "failed" && <StateBadge kind="failed">생성 실패</StateBadge>}
          {card.generation === "ready" && <StateBadge kind="ready">열람 가능</StateBadge>}
        </>
      )}
      {card.source === "dev-scoring" && <StatusBadge>개발용 결과</StatusBadge>}
    </div>
  );
}

/**
 * 리포트 한 건: 제목 · 상태(무료 / 구매 완료 / 생성 중) · 대상 · 날짜 · 고민 주제와, 상태에 맞는 버튼만.
 * hideAvailable이면 맨 아래에 "목록에서 숨기기"가 있다 — 이 목록에서만 접어 두는 것이고 결과 · 대화 · 구매 기록 · 질문권은 그대로다.
 */
export function ReportRow({ card, paymentsReady, hideAvailable = false }: { card: MyReportCard; paymentsReady: boolean; hideAvailable?: boolean }) {
  const href = `/results/${card.assessmentId}`;
  const small = "inline-flex h-10 items-center justify-center rounded-lg px-4 text-[14px] font-semibold";
  const primary = `${small} bg-accent text-white hover:bg-accent-strong`;
  const secondary = `${small} border border-line-strong bg-canvas text-ink hover:bg-mist`;
  return (
    <li className="rounded-xl border border-line bg-canvas p-4" data-testid="my-report">
      <p className="text-[16px] leading-snug font-bold">{card.productName}</p>
      <ReportStateBadges card={card} />
      <p className="mt-2.5 text-[14px] leading-[1.6] text-ink-2">{card.subject}</p>
      <p className="mt-1 text-[13px] leading-[1.6] text-ink-3">
        생성일 {formatDate(card.createdAt)}
        {card.period ? ` · 기간 ${card.period}` : ""}
        {card.paidOrderNumber ? ` · 주문번호 ${card.paidOrderNumber}` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {card.entitlement === "purchased" ? (
          card.generation === "failed" ? (
            <>
              <form action={card.paidOrderNumber ? retryReceivedReportAction.bind(null, card.assessmentId, card.paidOrderNumber) : retryReportAction.bind(null, card.assessmentId)}>
                <button type="submit" className={primary}>
                  다시 생성
                </button>
              </form>
              <Link href={href} className={secondary}>
                결과 화면
              </Link>
            </>
          ) : card.generation === "ready" ? (
            <Link href={href} className={primary}>
              구매한 리포트 보기
            </Link>
          ) : (
            <Link href={href} className={secondary}>
              생성 중 — 상태 보기
            </Link>
          )
        ) : (
          <>
            <Link href={href} className={secondary}>
              무료 결과 보기
            </Link>
            {card.entitlement === "free" && paymentsReady && (
              <Link href={`${href}#r-purchase`} className={primary}>
                전체 리포트 구매
              </Link>
            )}
          </>
        )}
      </div>
      {card.received.length > 1 && (
        <div className="mt-3">
          <p className="mb-2 text-[13px] leading-[1.6] text-ink-3">같은 결과로 받은 리포트 {card.received.length}개 — 모두 그대로 남아 있어요.</p>
          <ReceivedReports rows={card.received} />
        </div>
      )}
      {CONCERN_RECORDS.visible && (
        <p className="mt-3 border-t border-line pt-3 text-[13px] leading-[1.6] text-ink-3">
          내 고민 자세히 알려주기: {card.contextTopic ? topicLabel(card.contextTopic) : "작성 기록 없음"} ·{" "}
          <Link href={`${href}/context`} className="font-semibold text-accent-strong underline underline-offset-2">
            나의 고민 기록소
          </Link>
        </p>
      )}
      {card.entitlement === "purchased" && card.generation === "failed" && (
        <p className="mt-2 text-[13px] leading-[1.6] text-ink-3">결제는 정상 처리되었어요. 다시 결제하지 말고 ‘다시 생성’을 눌러 주세요.</p>
      )}
      {hideAvailable && (
        <form action={hideReportAction.bind(null, card.assessmentId)} className="mt-3 border-t border-line pt-1">
          <button
            type="submit"
            aria-label={`${card.productName}, ${card.subject}, 내 리포트 목록에서 숨기기`}
            className={`${textLink} inline-flex min-h-11 items-center text-[14px] font-semibold text-ink-3`}
          >
            목록에서 숨기기
          </button>
        </form>
      )}
    </li>
  );
}

/** 목록에서 숨긴 리포트 — 접어 두었다가 펼쳐 다시 보이게 한다. 열어 보는 링크는 그대로 있다(숨김은 열람 권한과 무관) */
export function HiddenReports({ cards }: { cards: MyReportCard[] }) {
  if (cards.length === 0) return null;
  const touch = "inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-[14px] font-semibold";
  return (
    <details data-fold className="group mt-4 rounded-xl border border-line bg-canvas" data-testid="my-hidden">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="text-[15px] font-semibold">숨긴 리포트 {cards.length}개</span>
        <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-4 py-4">
        <p className="text-[13px] leading-[1.6] text-ink-3">
          목록에서만 숨겨 둔 리포트예요. 삭제나 탈퇴가 아니라서 결과 · 대화 · 구매 기록 · 질문권은 그대로이고, 아래에서 언제든 다시 보이게 할 수 있어요.
        </p>
        <ul className="mt-3 space-y-3">
          {cards.map((card) => (
            <li key={card.assessmentId} className="rounded-xl border border-line bg-page p-4" data-testid="my-hidden-report">
              <p className="text-[15px] leading-snug font-bold">{card.productName}</p>
              <ReportStateBadges card={card} />
              <p className="mt-2.5 text-[14px] leading-[1.6] text-ink-2">{card.subject}</p>
              <p className="mt-1 text-[13px] leading-[1.6] text-ink-3">
                생성일 {formatDate(card.createdAt)}
                {card.paidOrderNumber ? ` · 주문번호 ${card.paidOrderNumber}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/results/${card.assessmentId}`} className={`${touch} border border-line-strong bg-canvas text-ink hover:bg-mist`}>
                  {card.entitlement === "purchased" && card.generation === "ready" ? "구매한 리포트 보기" : "결과 보기"}
                </Link>
                <form action={restoreReportAction.bind(null, card.assessmentId)}>
                  <button
                    type="submit"
                    aria-label={`${card.productName}, ${card.subject}, 목록에 다시 보이기`}
                    className={`${touch} bg-accent text-white hover:bg-accent-strong`}
                  >
                    목록에 다시 보이기
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
