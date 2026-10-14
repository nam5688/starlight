import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { RecheckPayment } from "@/components/my/recheck-payment";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { formatKrw } from "@/lib/config/product";
import { GENERATION_LABEL, PAYMENT_ENV_LABEL, traceOrder } from "@/lib/services/my-service";
import { consentPath, getMember } from "@/server/member";
import { reconcileUserInBackground } from "@/server/reconcile";
import { readRepository, writeRepository } from "@/server/services";
import { DOCS_KEY_NOTE } from "@/server/setup-checks";
import { PageFallback } from "@/components/ui/page-fallback";

export const metadata: Metadata = { title: "주문 상세 · ME:U 미유", robots: { index: false } };

export default function OrderPage({ params }: PageProps<"/my/orders/[orderNumber]">) {
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <p className="text-[14px]">
        <Link href="/my" className={textLink}>
          MY
        </Link>
      </p>
      <h1 className="mt-2 text-[26px] font-bold tracking-tight">주문 상세</h1>
      <Suspense fallback={<PageFallback className="mt-6" />}>
        <OrderContent params={params} />
      </Suspense>
    </main>
  );
}

const time = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-");

async function OrderContent({ params }: Pick<PageProps<"/my/orders/[orderNumber]">, "params">) {
  const { orderNumber } = await params;
  const member = await getMember();
  if (!member) redirect("/my");
  if (member.needsConsent) redirect(consentPath(`/my/orders/${orderNumber}`));
  reconcileUserInBackground(member.userId);

  // 소유자 확인은 로그인 사용자 권한(RLS)으로, 결제 기록은 확인 후에 서버 권한으로 읽는다
  const trace = await traceOrder(await readRepository(), writeRepository(), { userId: member.userId, orderNumber });
  if (!trace) notFound();
  const { order } = trace;

  return (
    <div className="mt-6 space-y-10">
      <dl className="border-y border-line text-[15px]">
        <Row label="주문번호">
          <span className="tabular-nums">{order.orderNumber}</span>
        </Row>
        <Row label="상품">{order.productName}</Row>
        <Row label="금액">
          <span className="font-semibold tabular-nums">{formatKrw(order.amount)}</span>
        </Row>
        <Row label="결제 상태">
          <span className="flex flex-wrap items-center justify-end gap-2">
            <span className={order.status === "paid" ? "font-semibold text-accent" : "font-semibold"}>{order.statusLabel}</span>
            {PAYMENT_ENV_LABEL[order.paymentEnv] && <StatusBadge>{PAYMENT_ENV_LABEL[order.paymentEnv]}</StatusBadge>}
          </span>
        </Row>
        <Row label="결제 요청">{time(order.createdAt)}</Row>
        <Row label="승인 시각">{time(order.approvedAt)}</Row>
        <Row label="결제수단">{order.method ?? "-"}</Row>
        {order.failureMessage && <Row label="안내">{order.failureMessage}</Row>}
      </dl>

      {trace.cash ? (
        <section aria-labelledby="o-access">
          <h2 id="o-access" className="text-[18px] font-bold">
            미유캐시 충전
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            {trace.entitled
              ? `서버가 결제 승인을 확인해 지갑에 ${trace.cash.credited}캐시(충전 ${trace.cash.cash}${trace.cash.bonus > 0 ? ` + 보너스 ${trace.cash.bonus}` : ""})가 들어갔습니다.`
              : trace.cash.credited > 0 && trace.cash.clawedBack > 0
                ? `결제가 취소되어 이 충전으로 들어간 ${trace.cash.credited}캐시 중 ${trace.cash.clawedBack}캐시를 회수했습니다.${trace.cash.shortfall > 0 ? ` 이미 사용한 ${trace.cash.shortfall}캐시는 회수하지 못해 운영자가 확인합니다.` : ""}`
                : "결제 승인이 확인되지 않아 지갑에 캐시가 들어가지 않았습니다. 결제 성공 화면으로 이동했더라도 서버 승인 기록이 없으면 결제 완료가 아닙니다."}
          </p>
          <p className="mt-2 text-[15px]">
            <Link href={`/cash?a=${order.assessmentId}`} className={textLink}>
              미유캐시 화면 보기
            </Link>
          </p>
        </section>
      ) : (
        <section aria-labelledby="o-access">
          <h2 id="o-access" className="text-[18px] font-bold">
            리포트 제공
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            {trace.entitled
              ? `서버가 결제 승인을 확인해 전체 리포트 열람 권한이 있습니다. 생성 상태: ${GENERATION_LABEL[trace.generation] || "생성 전"}.`
              : "결제 승인이 확인되지 않아 전체 리포트 열람 권한이 없습니다. 결제 성공 화면으로 이동했거나 리포트가 보였더라도, 서버 승인 기록이 없으면 결제 완료가 아닙니다."}
          </p>
          <p className="mt-2 text-[15px]">
            <Link href={`/results/${order.assessmentId}`} className={textLink}>
              연결된 결과 보기
            </Link>
          </p>
        </section>
      )}

      <section aria-labelledby="o-events">
        <h2 id="o-events" className="text-[18px] font-bold">
          결제 처리 기록
        </h2>
        {trace.events.length === 0 ? (
          <p className="mt-2 text-[15px] text-ink-2">기록이 없습니다. 결제창에서 결제를 마치지 않았거나, 승인 요청이 서버에 도착하지 않았습니다.</p>
        ) : (
          <ol className="mt-3 border-t border-line text-[14px]">
            {trace.events.map((e, i) => (
              <li key={i} className="border-b border-line py-2.5">
                <span className="font-semibold">{e.source}</span>{" "}
                <span className="text-ink-2">{e.statusLabel ?? e.status ?? "-"}</span>
                {e.statusLabel && <span className="ml-1 font-mono text-[12px] text-ink-3">{e.status}</span>}
                <span className="mt-0.5 block text-[13px] text-ink-3">
                  {time(e.at)}
                  {e.method ? ` · ${e.method}` : ""}
                  {e.mId ? ` · 상점 ID ${e.mId}` : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
        {order.paymentEnv === "test-docs" && <p className="mt-3 text-[13px] leading-relaxed text-ink-3">{DOCS_KEY_NOTE}</p>}
        <div className="mt-4">
          <RecheckPayment orderNumber={order.orderNumber} />
        </div>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
