import Link from "next/link";
import { formatDate } from "@/components/ui/format";
import { ChevronIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/source-badge";
import { formatKrw } from "@/lib/config/product";
import { PAYMENT_ENV_LABEL, type MyOrderRow } from "@/lib/services/my-service";

/**
 * MY의 결제내역 — 기본은 접혀 있고(open 속성 없음) 누르면 펼쳐진다(2026-10-19 운영자 요청).
 * 네이티브 `<details>`라 키보드(Enter · Space)로 열고 닫을 수 있고, 화면 읽기 프로그램이 펼침 상태를 그대로 알린다. 접힌 동안에도 건수는 보인다.
 * 내용(주문 목록 · 주문 상세 링크)은 예전과 같고, 이 화면은 결제 기록을 바꾸지 않는다.
 */
export function OrdersFold({ orders }: { orders: MyOrderRow[] }) {
  return (
    <details className="group mt-3 overflow-hidden rounded-xl border border-line bg-canvas" data-testid="my-orders-fold">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-[15px] font-semibold hover:bg-mist/60 [&::-webkit-details-marker]:hidden">
        <span>
          결제내역 보기 <span className="font-normal text-ink-3">({orders.length}건)</span>
        </span>
        <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="divide-y divide-line border-t border-line">
        {orders.map((o) => (
          <li key={o.orderNumber}>
            <Link href={`/my/orders/${o.orderNumber}`} className="block px-4 py-3.5 hover:bg-mist/60">
              <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="text-[15px] font-semibold">{o.productName}</span>
                <span className="text-[15px] font-semibold tabular-nums">{formatKrw(o.amount)}</span>
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
                <span className={o.status === "paid" ? "font-semibold text-positive" : "font-semibold text-ink-2"}>{o.statusLabel}</span>
                <span>· {formatDate(o.approvedAt ?? o.createdAt)}</span>
                <span className="tabular-nums">· {o.orderNumber}</span>
                {PAYMENT_ENV_LABEL[o.paymentEnv] && <StatusBadge>{PAYMENT_ENV_LABEL[o.paymentEnv]}</StatusBadge>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-3 text-[13px] leading-[1.6] text-ink-3">주문을 누르면 결제 승인 기록과 리포트 제공 상태를 주문번호 기준으로 볼 수 있어요.</p>
    </details>
  );
}
