import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { adminReconcileOrderAction, adminRetryReportAction, adminRunAllAction, adminTestAlertAction } from "@/app/admin/actions";
import { buttonPrimary, buttonSecondary, pageWide, textLink } from "@/components/ui/styles";
import { formatKrw } from "@/lib/config/product";
import { getAdminOverview, adminLookup, type AdminReportRow, type OrderTraceForAdmin } from "@/lib/services/admin-service";
import { costSummary, saleGate, type CapacityConfig, type CostSummary, type SaleGate } from "@/lib/services/capacity-service";
import type { OpsEventRecord } from "@/lib/services/ports";
import { capacityConfig } from "@/server/env";
import { getAdminMember } from "@/server/member";
import { now, writeRepository } from "@/server/services";

export const metadata: Metadata = { title: "관리자 · ME:U 미유", robots: { index: false, follow: false } };

const time = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "-");

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <main className={`${pageWide} py-10 md:py-14`}>
      <h1 className="text-[26px] font-bold tracking-tight">관리자</h1>
      <Suspense fallback={<p className="mt-6 text-[16px] text-ink-2">불러오고 있어요.</p>}>
        <AdminContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function AdminContent({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  await connection();
  // 관리자가 아니면 화면이 있다는 사실도 알리지 않는다
  if (!(await getAdminMember())) notFound();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const note = typeof params.note === "string" ? params.note.slice(0, 200) : "";
  const repo = writeRepository();
  const cfg = capacityConfig();
  const [overview, lookup, gate, cost] = await Promise.all([getAdminOverview(repo, now()), adminLookup(repo, q, now()), saleGate(repo, cfg, now(), "start"), costSummary(repo, cfg, now())]);
  const { counts } = overview;

  return (
    <div className="mt-6 space-y-10">
      <p className="text-[14px] leading-relaxed text-ink-3">
        주문 · 결제 · 리포트 생성 상태와 운영 기록만 보입니다. 고객 이름 · 생년월일 · 답변 · 리포트 내용은 이 화면에 없습니다. 환불은 이 화면에서 실행하지 않습니다 — 토스페이먼츠 관리자에서 직접 하세요.
      </p>
      {note && (
        <p role="status" className="rounded-md bg-mist px-4 py-3 text-[14px]">
          {note}
        </p>
      )}

      <section aria-labelledby="a-summary">
        <h2 id="a-summary" className="text-[18px] font-bold">
          지금 처리할 것
        </h2>
        <dl className="mt-3 grid grid-cols-2 border-y border-line text-[15px] md:grid-cols-4">
          <Stat label="결제 확인 대기 (2분 이상)" value={counts.pendingOrders} warn={counts.pendingOrders > 0} />
          <Stat label="리포트 생성 실패" value={counts.failedReports} warn={counts.failedReports > 0} />
          <Stat label="생성 지연 (15분 이상)" value={counts.delayedReports} warn={counts.delayedReports > 0} />
          <Stat label="최근 24시간 오류" value={counts.errors24h} warn={counts.errors24h > 0} />
        </dl>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <form action={adminRunAllAction}>
            <button type="submit" className={buttonPrimary}>
              결제 · 리포트 전체 점검 지금 실행
            </button>
          </form>
          <form action={adminTestAlertAction}>
            <button type="submit" className={buttonSecondary}>
              알림 시험
            </button>
          </form>
        </div>
      </section>

      <p className="text-[14px]">
        <Link href="/admin/metrics" className={textLink}>
          사업 지표 보기 (단계별 흐름 · 매출 · 광고 채널 · 만족도)
        </Link>
      </p>

      <section aria-labelledby="a-capacity">
        <h2 id="a-capacity" className="text-[18px] font-bold">
          생성 용량 · AI 비용
        </h2>
        <Capacity gate={gate} cost={cost} cfg={cfg} />
      </section>

      <section aria-labelledby="a-find">
        <h2 id="a-find" className="text-[18px] font-bold">
          주문번호 · 오류번호로 찾기
        </h2>
        <form action="/admin" method="get" className="mt-3 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="admin-q">
            주문번호 또는 오류번호
          </label>
          <input id="admin-q" name="q" defaultValue={q} placeholder="MEU-20261011-… 또는 ERR-…" className="h-12 w-full rounded-lg border border-line-strong px-4 text-[16px] sm:max-w-md" />
          <button type="submit" className={buttonSecondary}>
            찾기
          </button>
        </form>
        <Lookup lookup={lookup} />
      </section>

      <section aria-labelledby="a-pending">
        <h2 id="a-pending" className="text-[18px] font-bold">
          결제 확인 대기 주문
        </h2>
        {overview.pendingOrders.length === 0 ? (
          <p className="mt-2 text-[15px] text-ink-2">없습니다.</p>
        ) : (
          <Table head={["주문번호", "금액", "상태", "결제 요청"]}>
            {overview.pendingOrders.map((o) => (
              <tr key={o.orderNumber} className="border-b border-line">
                <td className="py-2.5 pr-3 font-mono text-[13px]">
                  <Link href={`/admin?q=${o.orderNumber}`} className={textLink}>
                    {o.orderNumber}
                  </Link>
                </td>
                <td className="py-2.5 pr-3 tabular-nums">{formatKrw(o.amount)}</td>
                <td className="py-2.5 pr-3">{o.statusLabel}</td>
                <td className="py-2.5 text-[13px] text-ink-3">{time(o.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section aria-labelledby="a-reports">
        <h2 id="a-reports" className="text-[18px] font-bold">
          리포트 생성 실패 · 지연
        </h2>
        {overview.reports.length === 0 ? (
          <p className="mt-2 text-[15px] text-ink-2">없습니다.</p>
        ) : (
          <Table head={["주문번호", "상태", "시도", "마지막 변경", "오류"]}>
            {overview.reports.map((r) => (
              <tr key={r.orderNumber} className="border-b border-line align-top">
                <td className="py-2.5 pr-3 font-mono text-[13px]">
                  <Link href={`/admin?q=${r.orderNumber}`} className={textLink}>
                    {r.orderNumber}
                  </Link>
                </td>
                <td className="py-2.5 pr-3">{reportLabel(r)}</td>
                <td className="py-2.5 pr-3 tabular-nums">
                  {r.attempts}/{r.maxAttempts}
                </td>
                <td className="py-2.5 pr-3 text-[13px] text-ink-3">{time(r.updatedAt)}</td>
                <td className="py-2.5 text-[13px] text-ink-2">{r.lastError ?? "-"}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section aria-labelledby="a-events">
        <h2 id="a-events" className="text-[18px] font-bold">
          최근 7일 주의 · 오류 기록
        </h2>
        <Events events={overview.events} />
      </section>
    </div>
  );
}

const krw = (n: number) => `${n.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;

function Capacity({ gate, cost, cfg }: { gate: SaleGate; cost: CostSummary; cfg: CapacityConfig }) {
  const limit = (n: number, unit = "") => (n > 0 ? `${n.toLocaleString("ko-KR")}${unit}` : "제한 없음");
  return (
    <dl className="mt-3 border-y border-line text-[14px]">
      <Row label="새 구매">
        <span className={gate.open ? "font-semibold" : "font-semibold text-danger"}>
          {gate.open ? "받는 중" : gate.reason === "budget" ? "멈춤 (하루 예산)" : "멈춤 (준비가 밀림)"}
        </span>
      </Row>
      <Row label="대기 · 생성 중">
        {gate.queued}건 · {gate.generating}건 (동시 생성 한도 {limit(cfg.maxConcurrent)} · 새 구매 중단 기준 {limit(cfg.saleQueueLimit, "건")})
      </Row>
      <Row label="오늘 AI 호출">
        {cost.callsToday}회 (실패 {cost.failedCallsToday}회)
      </Row>
      <Row label="오늘 예상 비용">{cost.pricingConfigured ? `${krw(cost.todayKrw)} (하루 예산 ${limit(cfg.dailyBudgetKrw, "원")}${gate.budgetUsedPct !== null ? ` · 예약 포함 ${gate.budgetUsedPct}%` : ""})` : "토큰 단가 설정 전 — 호출 수만 기록 중"}</Row>
      <Row label="최근 7일">{cost.pricingConfigured ? `${krw(cost.weekKrw)} · 리포트 ${cost.reportsWeek}건 · 한 건당 평균 ${cost.avgPerReportKrw === null ? "-" : krw(cost.avgPerReportKrw)}` : `리포트 ${cost.reportsWeek}건에 AI 호출 기록`}</Row>
    </dl>
  );
}

function reportLabel(r: AdminReportRow) {
  if (r.status === "failed") return "생성 실패";
  if (r.pastSla) return "생성 지연 (30분 넘음)";
  return r.status === "queued" ? "대기 중" : "생성 중";
}

function Stat({ label, value, warn }: { label: string; value: number; warn: boolean }) {
  return (
    <div className="border-b border-line px-1 py-3 md:border-b-0 md:border-r md:last:border-r-0">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className={`mt-0.5 text-[24px] font-bold tabular-nums ${warn ? "text-danger" : ""}`}>{value}</dd>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-y border-line text-[13px] text-ink-3">
            {head.map((h) => (
              <th key={h} scope="col" className="py-2 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Events({ events }: { events: OpsEventRecord[] }) {
  if (events.length === 0) return <p className="mt-2 text-[15px] text-ink-2">없습니다.</p>;
  return (
    <ol className="mt-3 border-t border-line text-[14px]">
      {events.map((e) => (
        <li key={e.id} className="border-b border-line py-2.5">
          <span className={e.severity === "error" ? "font-semibold text-danger" : "font-semibold"}>{e.severity === "error" ? "오류" : "주의"}</span> <span className="font-mono text-[12px] text-ink-3">{e.kind}</span>
          <span className="mt-0.5 block text-ink-2">{e.message}</span>
          <span className="mt-0.5 block text-[12px] text-ink-3">
            {time(e.createdAt)}
            {e.orderNumber ? ` · ${e.orderNumber}` : ""}
            {e.errorId ? ` · ${e.errorId}` : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Lookup({ lookup }: { lookup: Awaited<ReturnType<typeof adminLookup>> }) {
  switch (lookup.kind) {
    case "empty":
      return null;
    case "invalid":
      return <p className="mt-3 text-[14px] text-danger">{lookup.message}</p>;
    case "not-found":
      return <p className="mt-3 text-[14px] text-ink-2">{lookup.query}에 해당하는 기록이 없습니다.</p>;
    case "order":
      return <OrderTrace trace={lookup.order} />;
    case "error-id":
      return (
        <div className="mt-4 space-y-6">
          <div>
            <p className="text-[14px] font-semibold">{lookup.query} 기록</p>
            <Events events={lookup.events} />
          </div>
          {lookup.order && <OrderTrace trace={lookup.order} />}
        </div>
      );
  }
}

function OrderTrace({ trace }: { trace: OrderTraceForAdmin }) {
  const { order, report } = trace;
  return (
    <div className="mt-4 space-y-5 border-t border-ink pt-4">
      <dl className="border-y border-line text-[14px]">
        <Row label="주문번호">
          <span className="font-mono">{order.orderNumber}</span>
        </Row>
        <Row label="금액">{formatKrw(order.amount)}</Row>
        <Row label="결제 상태">
          {order.statusLabel}
          {order.paymentEnv !== "live" ? ` · ${order.paymentEnv === "test" ? "테스트 결제" : "테스트 결제 (공용 예제 키)"}` : ""}
        </Row>
        <Row label="결제 요청 / 승인">
          {time(order.createdAt)} / {time(order.approvedAt)}
        </Row>
        <Row label="리포트">{report ? `${reportLabel(report)} · 시도 ${report.attempts}/${report.maxAttempts}${report.lastError ? ` · ${report.lastError}` : ""}` : order.status === "paid" ? "리포트 기록 없음" : "-"}</Row>
      </dl>
      <div className="flex flex-col gap-3 sm:flex-row">
        <form action={adminReconcileOrderAction}>
          <input type="hidden" name="orderNumber" value={order.orderNumber} />
          <button type="submit" className={buttonSecondary}>
            결제사와 대조해 맞추기
          </button>
        </form>
        {order.status === "paid" && (
          <form action={adminRetryReportAction}>
            <input type="hidden" name="orderNumber" value={order.orderNumber} />
            <button type="submit" className={trace.needsReportAction ? buttonPrimary : buttonSecondary}>
              리포트 다시 만들기
            </button>
          </form>
        )}
      </div>
      <div>
        <p className="text-[14px] font-semibold">결제 처리 기록</p>
        {trace.paymentEvents.length === 0 ? (
          <p className="mt-1 text-[14px] text-ink-2">기록이 없습니다.</p>
        ) : (
          <ol className="mt-2 border-t border-line text-[14px]">
            {trace.paymentEvents.map((e, i) => (
              <li key={i} className="border-b border-line py-2">
                <span className="font-semibold">{e.source}</span> <span className="text-ink-2">{e.statusLabel ?? e.status ?? "-"}</span>
                {e.statusLabel && <span className="ml-1 font-mono text-[12px] text-ink-3">{e.status}</span>}
                <span className="mt-0.5 block text-[12px] text-ink-3">
                  {time(e.at)}
                  {e.method ? ` · ${e.method}` : ""}
                  {e.mId ? ` · ${e.mId}` : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div>
        <p className="text-[14px] font-semibold">운영 기록</p>
        <Events events={trace.events} />
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
