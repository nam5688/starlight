import Link from "next/link";
import { startRepurchaseAction } from "@/app/results/[id]/actions";
import { StateBadge } from "@/components/my/state-badge";
import { formatDate } from "@/components/ui/format";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonDisabled, buttonSecondary } from "@/components/ui/styles";
import { formatKrw, PERSONAL_REPORT } from "@/lib/config/product";
import { salesClosedMessage, type GateReason } from "@/lib/services/capacity-service";
import type { MyReceivedReport } from "@/lib/services/my-service";

const GENERATION_BADGE = {
  ready: { kind: "ready", label: "열람 가능" },
  "in-progress": { kind: "generating", label: "만드는 중" },
  failed: { kind: "failed", label: "만들지 못함" },
  none: { kind: "generating", label: "준비 중" },
} as const;

/**
 * 같은 결과로 받은 리포트 전부 — 받은 리포트는 모두 기록으로 남고 언제든 다시 열 수 있다(운영자 2026-10-15).
 * 새로 받아도 이미 받은 리포트의 내용은 바뀌지 않는다. current는 지금 열려 있는 리포트의 주문번호.
 */
export function ReceivedReports({ rows, current }: { rows: MyReceivedReport[]; current?: string | null }) {
  if (rows.length === 0) return null;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas" aria-label="받은 리포트">
      {rows.map((r) => {
        const badge = GENERATION_BADGE[r.generation];
        const here = r.orderNumber === current;
        return (
          <li key={r.orderNumber} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold">
                {r.seq}번째로 받은 리포트
                <StateBadge kind={badge.kind}>{badge.label}</StateBadge>
              </p>
              <p className="mt-1 text-[13px] leading-[1.6] text-ink-3">
                받은 날 {formatDate(r.receivedAt)}
                {r.generatorLabel ? ` · 생성 ${r.generatorLabel}` : ""} · 주문번호 {r.orderNumber}
              </p>
            </div>
            {here ? (
              <span className="text-[14px] font-semibold text-ink-2">보고 있는 리포트</span>
            ) : (
              <Link href={r.href} className={`${buttonSecondary} !h-10 !px-4 text-[14px]`}>
                열어 보기
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 같은 결과로 새 리포트 받기 — 이미 받은 리포트는 그대로 남고, 새 결제(주문)마다 새 리포트가 따로 만들어진다.
 * 지금 만들어지는 생성 버전이 가장 최근 리포트와 같으면 내용이 같을 수 있다고 알린다(같은 입력 · 같은 규칙이면 같은 글).
 */
export function RepurchasePanel({
  assessmentId,
  paymentsReady,
  paymentsNote,
  salesClosedReason,
  latestGenerator,
  nowGenerator,
}: {
  assessmentId: string;
  paymentsReady: boolean;
  paymentsNote: string | null;
  salesClosedReason: { reason: GateReason | null } | null;
  /** 가장 최근에 받은 리포트의 생성 버전 (예: dev-rules dev-0.2) */
  latestGenerator: string | null;
  /** 지금 새로 받으면 쓰이는 생성 버전 */
  nowGenerator: string;
}) {
  const same = latestGenerator !== null && latestGenerator === nowGenerator;
  return (
    <section aria-labelledby="r-repurchase" className="rounded-xl bg-canvas px-5 py-5 shadow-soft md:px-6">
      <h2 id="r-repurchase" className="text-[18px] leading-snug font-bold tracking-tight">
        같은 결과로 새 리포트 받기
      </h2>
      <p className="mt-2 text-[15px] leading-[1.7] text-ink-2">
        새로 받으면 지금 만들어지는 방식으로 새 리포트가 따로 만들어져요. 이미 받은 리포트는 그대로 남고 MY에서 언제든 다시 볼 수 있어요.
      </p>
      {same ? (
        <p className="mt-2 text-[14px] leading-[1.65] text-ink-3">
          지금 받은 리포트도 같은 방식({nowGenerator})으로 만들어서, 새로 받아도 내용이 같을 수 있어요.
        </p>
      ) : (
        latestGenerator && (
          <p className="mt-2 text-[14px] leading-[1.65] text-ink-3">
            가장 최근에 받은 리포트는 {latestGenerator}로, 지금 새로 받으면 {nowGenerator}로 만들어져요.
          </p>
        )
      )}
      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[20px] font-bold tabular-nums">{formatKrw(PERSONAL_REPORT.priceKrw)}</span>
        <StatusBadge>가격 {PERSONAL_REPORT.priceNote}</StatusBadge>
        <span className="text-[13px] text-ink-3">한 번 받을 때마다 결제 · 카드 결제</span>
      </p>
      <div className="mt-4">
        {salesClosedReason ? (
          <div>
            <button type="button" disabled className={buttonDisabled}>
              지금은 새 구매를 받지 않아요
            </button>
            <p role="status" className="mt-3 text-[14px] leading-relaxed text-ink-2">
              {salesClosedMessage(salesClosedReason.reason)}
            </p>
          </div>
        ) : paymentsReady ? (
          <form action={startRepurchaseAction.bind(null, assessmentId)}>
            <button type="submit" className={buttonSecondary}>
              새 리포트 받기 · {formatKrw(PERSONAL_REPORT.priceKrw)}
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled className={buttonDisabled}>
              결제 연결 전
            </button>
            {paymentsNote && <span className="text-[14px] text-ink-3">{paymentsNote}</span>}
          </div>
        )}
      </div>
    </section>
  );
}
