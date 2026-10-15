import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { TossCheckout } from "@/components/checkout/toss-checkout";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { cashOrderKind, formatKrw, isCashProduct, parseCashProductId, parseConcernProductId, parsePersonalSeq, productNameOf, QUESTION_PACK_SIZE } from "@/lib/config/product";
import { paymentConfig } from "@/server/env";
import { readRepository, writeRepository } from "@/server/services";
import { consentPath, getMember } from "@/server/member";
import { resultPathOf } from "@/server/order-paths";
import { PageFallback } from "@/components/ui/page-fallback";

export const metadata: Metadata = {
  title: "결제 · ME:U 미유",
  robots: { index: false },
};

export default function CheckoutPage({ params }: PageProps<"/checkout/[orderNumber]">) {
  return (
    <main className={`${pageNarrow} py-10 md:py-14`}>
      <h1 className="text-[26px] font-bold tracking-tight">결제</h1>
      <Suspense fallback={<PageFallback text="주문 정보를 불러오고 있어요." className="mt-6" />}>
        <CheckoutContent params={params} />
      </Suspense>
    </main>
  );
}

async function CheckoutContent({ params }: Pick<PageProps<"/checkout/[orderNumber]">, "params">) {
  const { orderNumber } = await params;
  const config = paymentConfig();
  if (!config.ok) {
    // 결제 설정 문제는 '없는 페이지'로 숨기지 않고 무엇이 빠졌는지 알린다 (키 값은 보여주지 않음)
    return (
      <Notice title="결제를 아직 진행할 수 없습니다" badge="결제 설정 전">
        결제 설정이 끝나지 않았습니다 ({config.reason}). 결제는 진행되지 않았고, 저장된 결과는 그대로 있습니다.
      </Notice>
    );
  }

  const member = await getMember();
  if (!member) redirect("/my");
  if (member.needsConsent) redirect(consentPath(`/checkout/${orderNumber}`));
  const userId = member.userId;

  const repo = await readRepository();
  const order = await repo.getOrderByNumber(orderNumber);
  // 다른 회원의 주문은 있는지조차 알리지 않는다
  if (!order || order.userId !== userId) notFound();
  // 이미 끝난 주문은 결제 화면을 다시 열지 않고 돌아갈 화면으로 보낸다 (고민 반영 리포트는 결제 완료면 그 기록의 리포트)
  if (order.status !== "pending") redirect(resultPathOf(order, { paid: order.status === "paid" }));
  const productName = productNameOf(order.productId);
  const isConcern = parseConcernProductId(order.productId) !== null;
  const isRepeat = (parsePersonalSeq(order.productId) ?? 1) > 1;
  const isCash = isCashProduct(order.productId);
  const cashParsed = parseCashProductId(order.productId);
  const isPack = cashParsed !== null && cashOrderKind(cashParsed) === "pack";
  const backPath = resultPathOf(order);

  // 본인 프로필(결제 구매자 키)이 빠져 있으면 서버가 채운다 — 테이블보다 먼저 가입한 회원
  let profile = await repo.getProfile(userId);
  if (!profile) {
    try {
      profile = await writeRepository().ensureProfile(userId);
    } catch (e) {
      console.error("[checkout] 프로필 보완 실패", e instanceof Error ? e.message : e);
      return (
        <Notice title="결제 정보를 준비하지 못했습니다" badge="회원 정보 확인 필요">
          회원 정보를 불러오지 못해 결제를 시작하지 않았습니다. 잠시 후 다시 시도해 주세요. 계속되면 주문번호 {order.orderNumber}와 함께
          문의해 주세요.
        </Notice>
      );
    }
  }

  return (
    <>
      <dl className="mt-6 border-y border-line text-[15px]">
        <Row label="상품">{productName}</Row>
        <Row label="결제 금액">
          <span className="font-bold tabular-nums">{formatKrw(order.amount)}</span>
          {isCash && <span className="ml-1 text-[13px] text-ink-3">(부가세 포함)</span>}
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
          orderName={productName}
          amount={order.amount}
        />
      </div>
      {isConcern && (
        <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
          기존 심층 리포트는 그대로 보관되고, 이 결제로는 지금 적어 둔 고민을 반영한 새 리포트가 따로 만들어집니다. 만들기에 실패하면 같은 주문으로 다시 시도하며 추가 결제는 없습니다.
        </p>
      )}
      {isCash && (
        <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">{isPack ? `질문 ${QUESTION_PACK_SIZE}개 = ${formatKrw(order.amount)}.` : `질문 1개 = ${formatKrw(order.amount)}.`}</span>{" "}
          {isPack
            ? `무료 질문을 다 쓴 뒤 이어서 묻는 유료 질문 ${QUESTION_PACK_SIZE}개를 묶어서 결제해요(1개씩 결제하는 방법은 없어요). 결제가 확인되면 방금 적은 질문에 이어서 답하고, 그 질문에 하나가 쓰여요. 남은 ${QUESTION_PACK_SIZE - 1}개는 쓰지 않으면 그대로 남아 있다가 이어서 쓸 수 있어요. 답을 받지 못하면 그 질문은 쓰이지 않아요. 리포트는 새로 만들어지지 않아요. 가격과 환불 · 유효기간 기준은 아직 확정 전이에요.`
            : "무료 질문을 다 쓴 뒤 이어서 묻는 유료 질문 한 개의 결제예요. 결제가 확인되면 방금 적은 질문에 이어서 답하고, 리포트는 새로 만들어지지 않아요. 답을 받지 못하면 같은 결제로 다시 물을 수 있어요. 가격은 가안이에요."}
        </p>
      )}
      {isRepeat && (
        <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
          같은 결과로 새 리포트를 받는 결제예요. 이미 받은 리포트는 그대로 남고, 이 결제가 끝나면 새 리포트가 따로 만들어져요.
        </p>
      )}
      <p className="mt-6 text-[14px] text-ink-3">
        <Link href={backPath} className={textLink}>
          {isConcern ? "고민 기록소로 돌아가기" : isCash ? "채팅방으로 돌아가기" : "결과 화면으로 돌아가기"}
        </Link>
      </p>
    </>
  );
}

function Notice({ title, badge, children }: { title: string; badge: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 border-y border-line py-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[17px] font-semibold">{title}</p>
        <StatusBadge>{badge}</StatusBadge>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{children}</p>
      <p className="mt-4 text-[15px]">
        <Link href="/my" className={textLink}>
          MY로 가기
        </Link>
      </p>
    </div>
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
