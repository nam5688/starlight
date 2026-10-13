import Link from "next/link";
import { StatusBadge } from "@/components/ui/source-badge";
import { formatDate, formatDateTime } from "@/components/ui/format";
import { CONTEXT_FIELDS, topicLabel } from "@/lib/personalization/context";
import type { ConcernEntry, ConcernEntryState } from "@/lib/services/concern-service";

const STATE_LABEL: Record<ConcernEntryState, string> = {
  generating: "리포트 생성 중",
  ready: "열람 가능",
  failed: "생성 실패 · 다시 만들기 가능",
  refunded: "환불됨",
};

/**
 * 고민 기록 목록 — 발급할 때 남긴 "그때의 고민"과, 그 고민을 반영해 발급한 리포트를 한 칸씩.
 * 이전 기록과 새 기록은 발급일 · 고민 주제로 구분한다. 고민 내용은 이 화면에서 본인만 볼 수 있다.
 */
export function ConcernRecords({ assessmentId, entries }: { assessmentId: string; entries: ConcernEntry[] }) {
  if (entries.length === 0) {
    return <p className="mt-3 border-y border-line py-6 text-[15px] leading-relaxed text-ink-2">아직 발급한 리포트가 없어요. 고민을 저장한 뒤 ‘이 고민으로 새 리포트 발급’을 누르면 이곳에 한 칸씩 쌓입니다.</p>;
  }
  return (
    <ul className="mt-3 border-t border-ink">
      {entries.map((e) => {
        const { record } = e;
        const filled = CONTEXT_FIELDS.filter((f) => record[f.id].length > 0);
        return (
          <li key={record.id} className="border-b border-line py-5" data-testid="concern-entry">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] tabular-nums text-ink-3">발급일 {formatDate(e.issuedAt)}</span>
              <StatusBadge>{STATE_LABEL[e.state]}</StatusBadge>
              {e.isCurrent && <StatusBadge>지금 적어 둔 고민</StatusBadge>}
            </div>
            <h3 className="mt-2 text-[17px] font-semibold leading-snug">{topicLabel(record.topic)}</h3>
            <p className="mt-0.5 text-[13px] text-ink-3">고민 작성 시점 {formatDateTime(record.writtenAt)}</p>

            <details className="mt-3">
              <summary className="cursor-pointer text-[14px] font-medium text-accent">그때 적은 고민 보기</summary>
              {record.scrubbedAt ? (
                <p className="mt-2 text-[14px] leading-relaxed text-ink-3">적은 내용을 지웠어요 ({formatDate(record.scrubbedAt)}). 주제와 작성 시점, 발급한 리포트는 남아 있습니다.</p>
              ) : filled.length === 0 ? (
                <p className="mt-2 text-[14px] text-ink-3">주제만 골랐고 적은 글은 없어요.</p>
              ) : (
                <dl className="mt-2 space-y-3 border-l-2 border-line pl-3 text-[14px] leading-relaxed">
                  {filled.map((f) => (
                    <div key={f.id}>
                      <dt className="font-medium text-ink-3">{f.label}</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-ink">{record[f.id]}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </details>

            {e.state !== "refunded" && (
              <Link
                href={`/results/${assessmentId}/context/${record.id}`}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-line-strong bg-canvas px-4 text-[14px] font-semibold text-ink hover:bg-mist"
              >
                이 고민이 반영된 리포트 보러가기
              </Link>
            )}
            <p className="mt-2 text-[12px] tabular-nums text-ink-3">주문번호 {e.orderNumber}</p>
          </li>
        );
      })}
    </ul>
  );
}
