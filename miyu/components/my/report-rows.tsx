import Link from "next/link";
import { retryReceivedReportAction, retryReportAction } from "@/app/results/[id]/actions";
import { DeleteRecordButton } from "@/components/my/delete-record-button";
import { ReceivedReports } from "@/components/results/received-reports";
import { StateBadge } from "@/components/my/state-badge";
import { formatDate, formatDateTime } from "@/components/ui/format";
import { StatusBadge } from "@/components/ui/source-badge";
import { CONCERN_RECORDS } from "@/lib/config/product";
import { topicLabel } from "@/lib/personalization/context";
import type { MyConcernCard, MyDeletedRecord, MyReportCard } from "@/lib/services/my-service";

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

/** 리포트 카드의 상태 표시 */
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
 * deleteAvailable이면 맨 아래에 "기록 삭제"가 있다 — 누르면 확인창이 열리고, 확인해야 리포트 본문 · 맛보기 글 · 고민이 되돌릴 수 없게 지워진다(대화 · 질문권 · 주문 · 결제 기록은 남는다).
 */
export function ReportRow({ card, paymentsReady, deleteAvailable = false }: { card: MyReportCard; paymentsReady: boolean; deleteAvailable?: boolean }) {
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
      {deleteAvailable && (
        <div className="mt-3 border-t border-line pt-1">
          <DeleteRecordButton assessmentId={card.assessmentId} label={`${card.productName}, ${card.subject}`} />
        </div>
      )}
    </li>
  );
}

/**
 * 삭제한 기록의 대화 — 리포트를 삭제한 검사 결과도 채팅방은 그대로 열린다(삭제 전에 오간 대화는 읽기만 되는 기록으로 남고, 새 대화는 이어 갈 수 있는 방에서 계속된다).
 * 리포트 · 결과 화면으로 가는 링크는 없다.
 */
export function DeletedRecords({ records }: { records: MyDeletedRecord[] }) {
  if (records.length === 0) return null;
  const touch = "inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-[14px] font-semibold border border-line-strong bg-canvas text-ink hover:bg-mist";
  return (
    <div className="mt-6" data-testid="my-deleted">
      <h3 className="text-[15px] font-bold">삭제한 기록의 대화</h3>
      <p className="mt-1 text-[13px] leading-[1.6] text-ink-3">
        리포트를 삭제한 기록이에요. 리포트 글은 지워졌지만 채팅방과 지난 대화는 그대로 열려요. 지난 대화는 읽기만 할 수 있고, 이어 갈 수 있는 방에서는 새 대화를 계속할 수 있어요.
      </p>
      <ul className="mt-3 space-y-3">
        {records.map((r) => (
          <li key={r.assessmentId} className="rounded-xl border border-line bg-canvas p-4" data-testid="my-deleted-record">
            <p className="text-[15px] leading-snug font-bold">삭제한 기록</p>
            <p className="mt-1.5 text-[14px] leading-[1.6] text-ink-2">{r.subject}</p>
            <p className="mt-1 text-[13px] leading-[1.6] text-ink-3">
              삭제일 {formatDate(r.deletedAt)} · 저장된 채팅방 {r.chatRooms}개
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/results/${r.assessmentId}/talk`} className={touch}>
                채팅방 열기
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
