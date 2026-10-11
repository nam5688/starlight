import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { TossCheckout } from "@/components/checkout/toss-checkout";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { formatKrw, PERSONAL_REPORT } from "@/lib/config/product";
import { paymentConfig } from "@/server/env";
import { readRepository } from "@/server/services";
import { getSessionUserId } from "@/server/session";

export const metadata: Metadata = {
  title: "결제 · ME:U 미유",
  robots: { index: false },
};

export default function CheckoutPage({ params }: PageProps<"/checkout/[orderNumber]">) {
  return (
    <main className={`${pageNarrow} py-10 md:py-14`}>
      <h1 className="text-[26px] font-bold tracking-tight">결제</h1>
      <Suspense fallback={<p className="mt-6 text-[16px] text-ink-2">주문 정보를 불러오고 있어요.</p>}>
        <CheckoutContent params={params} />
      </Suspense>
    </main>
  );
}

async function CheckoutContent({ params }: Pick<PageProps<"/checkout/[orderNumber]">, "params">) {
  const { orderNumber } = await params;
  const config = paymentConfig();
  if (!config.ok) notFound();

  const userId = await getSessionUserId();
  if (!userId) redirect("/my");

  const repo = await readRepository();
  const order = await repo.getOrderByNumber(orderNumber);
  if (!order || order.userId !== userId) notFound();
  if (order.status !== "pending") redirect(`/results/${order.assessmentId}`);

  const profile = await repo.getProfile(userId);
  if (!profile) notFound();

  return (
    <>
      <dl className="mt-6 border-y border-line text-[15px]">
        <Row label="상품">{PERSONAL_REPORT.name}</Row>
        <Row label="결제 금액">
          <span className="font-bold tabular-nums">{formatKrw(order.amount)}</span>
        </Row>
        <Row label="주문번호">
          <span className="tabular-nums">{order.orderNumber}</span>
        </Row>
      </dl>
      {!config.liveMode && (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-[14px] text-ink-2">
          <StatusBadge>테스트 결제</StatusBadge>
          실제로 돈이 결제되지 않는 테스트 환경입니다.
        </p>
      )}
      <div className="mt-6">
        <TossCheckout
          clientKey={config.clientKey}
          customerKey={profile.paymentCustomerKey}
          orderId={order.orderNumber}
          orderName={PERSONAL_REPORT.name}
          amount={order.amount}
        />
      </div>
      <p className="mt-6 text-[14px] text-ink-3">
        <Link href={`/results/${order.assessmentId}`} className={textLink}>
          결과 화면으로 돌아가기
        </Link>
      </p>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
