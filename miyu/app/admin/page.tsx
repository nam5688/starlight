import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { adminCreditQuestionAction, adminReconcileOrderAction, adminRetryReportAction, adminRunAllAction, adminTestAlertAction } from "@/app/admin/actions";
import { buttonPrimary, buttonSecondary, pageWide, textLink } from "@/components/ui/styles";
import { formatKrw } from "@/lib/config/product";
import { getAdminOverview, adminLookup, type AdminReportRow, type OrderTraceForAdmin } from "@/lib/services/admin-service";
import { recentOrdersForAdmin, type AdminRecentOrder } from "@/lib/services/admin-support-service";
import { costSummary, saleGate, type CapacityConfig, type CostSummary, type SaleGate } from "@/lib/services/capacity-service";
import type { OpsEventRecord } from "@/lib/services/ports";
import { DEPLOY_WHERE_LABEL, deployNotes } from "@/lib/ops/deploy-info";
import { capacityConfig, deployInfo, telegramEnv } from "@/server/env";
import { isTestEnvironment } from "@/server/ops";
import { getAdminMember } from "@/server/member";
import { now, writeRepository } from "@/server/services";
import { PageFallback } from "@/components/ui/page-fallback";

export const metadata: Metadata = { title: "관리자 · ME:U 미유", robots: { index: false, follow: false } };

const time = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "-");

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <main className={`${pageWide} py-10 md:py-14`}>
      <h1 className="text-[26px] font-bold tracking-tight">관리자</h1>
      <Suspense fallback={<PageFallback className="mt-6" />}>
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
  const [overview, lookup, gate, cost, recent, heartbeat] = await Promise.all([
    getAdminOverview(repo, now()),
    adminLookup(repo, q, now()),
    saleGate(repo, cfg, now(), "start"),
    costSummary(repo, cfg, now()),
    recentOrdersForAdmin(repo, now(), 30),
    repo.listOpsEvents({ kinds: ["cron.heartbeat"], limit: 1 }),
  ]);
  const deploy = deployInfo();
  const lastCron = heartbeat[0] ?? null;
  const notes = deployNotes(deploy, lastCron?.createdAt ?? null, now());
  const { counts } = overview;

  return (
    <div className="mt-6 space-y-10">
      <p className="text-[14px] leading-relaxed text-ink-3">
        주문 · 결제 · 리포트 생성 상태와 운영 기록, 누가(닉네임 · 회원번호 앞 8자) 무엇을 샀는지만 보입니다. 생년월일 · 답변 · 채팅 대화 · 고민은 이 화면에 없고, 리포트 본문은 고객 문의에 답하려고 따로 열 때만 보입니다(열람 기록이 남습니다). 환불은 이 화면에서 실행하지 않습니다 — 토스페이먼츠 관리자에서 직접 하세요.
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
              텔레그램 알림 시험 (종류별 5건)
            </button>
          </form>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-3">
          알림 연결: {telegramEnv() ? "텔레그램 설정이 있습니다 (시험 버튼으로 실제 도착을 확인하세요)" : "텔레그램이 연결되지 않았습니다 — 알림은 서버 로그에만 남습니다"}
          {" · "}
          알림 표시: {isTestEnvironment() ? "[미유·테스트] (실결제 모드 아님)" : "[미유] (실결제 모드)"}
        </p>
      </section>

      <p className="flex flex-col gap-2 text-[14px] sm:flex-row sm:gap-6">
        <Link href="/admin/metrics" className={textLink}>
          사업 지표 보기 (단계별 흐름 · 매출 · 광고 채널 · 만족도)
        </Link>
        <Link href="/admin/benefits" className={textLink}>
          혜택 · 쿠폰 · 손익 관리 →
        </Link>
        <Link href="/admin/reviews" className={textLink}>
          후기 관리 →
        </Link>
      </p>

      <section aria-labelledby="a-deploy">
        <h2 id="a-deploy" className="text-[18px] font-bold">
          배포 정보 · 정기 점검
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-[14px] sm:grid-cols-[auto_1fr]">
          <dt className="text-ink-3">환경</dt>
          <dd>{DEPLOY_WHERE_LABEL[deploy.where]}</dd>
          <dt className="text-ink-3">브랜치</dt>
          <dd className="font-mono text-[13px]">{deploy.branch ?? "-"}</dd>
          <dt className="text-ink-3">커밋</dt>
          <dd className="font-mono text-[13px]">
            {deploy.commitShort ? (
              deploy.commitUrl ? (
                <a href={deploy.commitUrl} target="_blank" rel="noreferrer" className={textLink}>
                  {deploy.commitShort}
                </a>
              ) : (
                deploy.commitShort
              )
            ) : (
              "-"
            )}
          </dd>
          <dt className="text-ink-3">정기 점검 마지막 실행</dt>
          <dd>{lastCron ? `${time(lastCron.createdAt)} (${lastCron.message})` : "기록 없음"}</dd>
        </dl>
        <ul className="mt-3 space-y-1.5 text-[14px] leading-relaxed">
          {notes.map((n) => (
            <li key={n.text} className={n.level === "warn" ? "text-caution" : "text-ink-2"}>
              {n.level === "warn" ? "확인 필요 · " : "정상 · "}
              {n.text}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">커밋 번호는 GitHub의 작업 브랜치 커밋 목록에서 찾아 올리려던 버전(8128fab 또는 그 이후)인지 확인하세요. 비밀값은 이 화면에 나오지 않습니다.</p>
      </section>

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

      <section aria-labelledby="a-recent">
        <h2 id="a-recent" className="text-[18px] font-bold">
          최근 주문 30건
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">문의가 오면 닉네임 · 결제 시각 · 금액으로 찾아 주문번호를 눌러 확인하세요. 닉네임은 검사할 때 적은 이름이고, 회원번호는 같은 사람인지 가리는 용도입니다.</p>
        <RecentOrders rows={recent} />
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

function RecentOrders({ rows }: { rows: AdminRecentOrder[] }) {
  if (rows.length === 0) return <p className="mt-2 text-[15px] text-ink-2">아직 주문이 없습니다.</p>;
  return (
    <Table head={["주문번호", "닉네임 · 회원", "상품", "금액", "상태", "리포트", "결제 요청"]}>
      {rows.map((o) => (
        <tr key={o.orderNumber} className="border-b border-line align-top">
          <td className="py-2.5 pr-3 font-mono text-[13px]">
            <Link href={`/admin?q=${o.orderNumber}`} className={textLink}>
              {o.orderNumber}
            </Link>
          </td>
          <td className="py-2.5 pr-3">
            {o.nickname}
            <span className="block font-mono text-[12px] text-ink-3">{o.memberShort}</span>
          </td>
          <td className="py-2.5 pr-3">{o.productName}</td>
          <td className="py-2.5 pr-3 tabular-nums">{formatKrw(o.amount)}</td>
          <td className="py-2.5 pr-3">
            {o.statusLabel}
            {o.paymentEnv !== "live" && <span className="block text-[12px] text-ink-3">테스트 결제</span>}
          </td>
          <td className="py-2.5 pr-3 text-[13px] text-ink-2">{o.isQuestion ? "-" : o.report}</td>
          <td className="py-2.5 text-[13px] text-ink-3">{time(o.createdAt)}</td>
        </tr>
      ))}
    </Table>
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
  const { order, report, question } = trace;
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
        {question ? (
          <>
            <Row label="질문 장부">{!question.ready ? "장부를 읽지 못했습니다 (DB 변경 13번 전)" : question.credited ? `이 주문의 질문이 들어감 (${time(question.creditedAt)})` : order.status === "paid" ? "결제 완료인데 장부에 질문이 없음 — 아래 버튼으로 결제사 확인 뒤 넣을 수 있습니다" : "아직 결제 완료가 아니라 들어가지 않음"}</Row>
            <Row label="이 회원이 쓸 수 있는 결제한 질문">{question.ready ? `${question.questionsLeft}개` : "-"}</Row>
            {question.pack ? (
              <>
                <Row label="이 묶음의 사용 · 환불">
                  질문 {question.pack.questions}개 중 사용 {question.pack.used}개 · 환불 {question.pack.refundedQuestions}개 (누적 {formatKrw(question.pack.refundedKrw)}) · 남은 질문 {question.pack.remaining}개
                  {question.pack.shortfall > 0 ? ` · 환불받은 질문 중 ${question.pack.shortfall}개는 이미 쓴 질문이라 회수하지 못함` : ""}
                </Row>
                {question.pack.nextRefunds.length > 0 && (
                  <Row label="환불 금액 안내 (토스 관리자의 취소 금액)">
                    {question.pack.nextRefunds.map((s) => `질문 ${s.questions}개 환불 → ${formatKrw(s.cancelNow)}`).join(" · ")} (취소 후 누적 환불액이 결제액 {formatKrw(order.amount)}을 넘지 않도록 정한 금액입니다. 이 금액이 아니면 질문이 회수되지 않고 이 화면에 확인 필요로 남습니다.)
                  </Row>
                )}
              </>
            ) : (
              order.status === "paid" && question.credited && <Row label="이 묶음의 사용 · 환불">묶음 장부가 없는 주문입니다 (DB 변경 16번 전에 결제됨) — 부분 환불은 질문에 자동 반영되지 않습니다. 환불이 필요하면 운영 매뉴얼을 보세요.</Row>
            )}
          </>
        ) : (
          <Row label="리포트">{report ? `${reportLabel(report)} · 시도 ${report.attempts}/${report.maxAttempts}${report.lastError ? ` · ${report.lastError}` : ""}` : order.status === "paid" ? "리포트 기록 없음" : "-"}</Row>
        )}
      </dl>
      <div className="flex flex-col gap-3 sm:flex-row">
        <form action={adminReconcileOrderAction}>
          <input type="hidden" name="orderNumber" value={order.orderNumber} />
          <button type="submit" className={buttonSecondary}>
            결제사와 대조해 맞추기
          </button>
        </form>
        {order.status === "paid" && !question && (
          <form action={adminRetryReportAction}>
            <input type="hidden" name="orderNumber" value={order.orderNumber} />
            <button type="submit" className={trace.needsReportAction ? buttonPrimary : buttonSecondary}>
              리포트 다시 만들기
            </button>
          </form>
        )}
        {order.status === "paid" && !question && (
          <Link href={`/admin/report/${order.orderNumber}`} className={buttonSecondary}>
            저장된 리포트 보기
          </Link>
        )}
        {question && order.status === "paid" && question.ready && !question.credited && (
          <form action={adminCreditQuestionAction}>
            <input type="hidden" name="orderNumber" value={order.orderNumber} />
            <button type="submit" className={buttonPrimary}>
              결제사 확인 후 질문 넣기
            </button>
          </form>
        )}
      </div>
      {question && (
        <p className="text-[13px] leading-relaxed text-ink-3">
          질문 결제는 결제 완료가 되는 순간 자동으로 질문이 들어갑니다. 위 버튼은 결제사 기록으로 결제 완료를 다시 확인한 뒤, 빠진 경우에만 한 번 넣습니다(주문 한 건에 한 번만, 이미 들어가 있으면 더 넣지 않습니다). 결제가 안 된 주문에는 넣지 않습니다.
        </p>
      )}
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
