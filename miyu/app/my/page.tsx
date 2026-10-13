import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { signOut } from "@/app/auth/actions";
import { setMarketingAction } from "@/app/my/actions";
import { KakaoLoginForm } from "@/components/auth/kakao-login-button";
import { ConcernRow, ReportRow } from "@/components/my/report-rows";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonPrimary, buttonSecondary, textLink } from "@/components/ui/styles";
import { formatDate } from "@/components/ui/format";
import { formatKrw } from "@/lib/config/product";
import { getMyPage, PAYMENT_ENV_LABEL } from "@/lib/services/my-service";
import { isAuthConfigured, paymentConfig } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { reconcileUserInBackground } from "@/server/reconcile";
import { readRepository } from "@/server/services";
import { PageFallback } from "@/components/ui/page-fallback";

export const metadata: Metadata = {
  title: "MY · ME:U 미유",
  robots: { index: false },
};

export default function MyPage() {
  return (
    <main className="bg-page">
      <div className="mx-auto w-full max-w-[720px] px-5 py-8 md:py-12">
        <h1 className="text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">MY</h1>
        <p className="mt-1 text-[14px] leading-[1.6] text-ink-2">저장한 결과와 구매한 리포트를 저장된 그대로 다시 볼 수 있습니다.</p>
        <Suspense fallback={<PageFallback className="mt-8" />}>
          <MyContent />
        </Suspense>
      </div>
    </main>
  );
}

async function MyContent() {
  await connection(); // 환경변수·로그인 상태를 요청 때마다 확인한다
  if (!isAuthConfigured()) {
    return (
      <div className="mt-8 border-y border-line py-8">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[17px] font-semibold">로그인이 아직 설정되지 않았습니다</p>
          <StatusBadge>설정 전</StatusBadge>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          Supabase와 카카오 로그인 설정을 마치면 이곳에서 저장한 결과를 볼 수 있습니다.
        </p>
        <Actions />
      </div>
    );
  }

  const member = await getMember();
  if (!member) {
    return (
      <div className="mt-8 border-y border-line py-8">
        <p className="text-[17px] font-semibold">로그인하고 내 결과를 확인하세요</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          카카오 계정으로 가입·로그인합니다. 토스 가입이나 앱 설치는 필요 없습니다. 같은 카카오 계정으로 다시 로그인하면 저장한
          결과를 그대로 볼 수 있습니다.
        </p>
        <div className="mt-6">
          <KakaoLoginForm next="/my" />
        </div>
      </div>
    );
  }
  if (member.needsConsent) redirect(consentPath("/my"));
  // 결제 승인이 났는데 돌아오지 못한 주문이 있으면 응답 뒤에 결제사 기록과 맞춘다
  reconcileUserInBackground(member.userId);

  const { cards, concerns, orders } = await getMyPage(await readRepository(), member.userId);
  const paymentsReady = paymentConfig().ok;
  return (
    <>
      <section aria-labelledby="my-list" className="mt-8">
        <h2 id="my-list" className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
          내 리포트
        </h2>
        {cards.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-canvas px-4 py-8 text-[15px] text-ink-2">아직 저장한 결과가 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {cards.map((card) => (
              <ReportRow key={card.assessmentId} card={card} paymentsReady={paymentsReady} />
            ))}
          </ul>
        )}
      </section>

      {concerns.length > 0 && (
        <section aria-labelledby="my-concerns" className="mt-12">
          <h2 id="my-concerns" className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
            내 고민 반영 리포트
          </h2>
          <p className="mt-1.5 text-[13px] leading-[1.6] text-ink-3">개인 통합 리포트와 별도로 발급한 리포트입니다. 발급일 · 고민 주제로 구분하며, 이전 리포트는 새 리포트가 나와도 그대로 남습니다.</p>
          <ul className="mt-3 space-y-3">
            {concerns.map((c) => (
              <ConcernRow key={c.recordId} card={c} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="my-orders" className="mt-12">
        <h2 id="my-orders" className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
          결제내역
        </h2>
        {orders.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-canvas px-4 py-6 text-[15px] text-ink-2">결제내역이 없습니다.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas">
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
        )}
        <p className="mt-2 text-[13px] leading-[1.6] text-ink-3">주문을 누르면 결제 승인 기록과 리포트 제공 상태를 주문번호 기준으로 볼 수 있습니다.</p>
      </section>

      <section aria-labelledby="my-account" className="mt-12">
        <h2 id="my-account" className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
          계정
        </h2>
        <dl className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas px-4 text-[15px]">
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-ink-3">로그인</dt>
            <dd>카카오 계정</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-ink-3">새 상품·할인 소식</dt>
            <dd className="flex items-center gap-3">
              <span>{member.marketing ? "받음" : "받지 않음"}</span>
              <form action={setMarketingAction.bind(null, !member.marketing)}>
                <button type="submit" className={`${textLink} text-[14px]`}>
                  {member.marketing ? "끄기" : "받기"}
                </button>
              </form>
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-[13px] text-ink-3">
          결과 안내처럼 서비스 이용에 필요한 알림은 이 설정과 관계없이 제공됩니다.{" "}
          <Link href="/terms" className={textLink}>
            이용약관
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className={textLink}>
            개인정보 처리방침
          </Link>
        </p>
        <p className="mt-2 text-[13px] text-ink-3">
          <Link href="/my/withdraw" className={textLink}>
            회원 탈퇴
          </Link>
        </p>
      </section>
      <Actions signedIn />
    </>
  );
}

function Actions({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <Link href="/analyze" className={buttonPrimary}>
        새 분석 시작하기
      </Link>
      {signedIn ? (
        <form action={signOut}>
          <button type="submit" className={`${buttonSecondary} w-full sm:w-auto`}>
            로그아웃
          </button>
        </form>
      ) : (
        <Link href="/report/sample" className={buttonSecondary}>
          리포트 예시 보기
        </Link>
      )}
    </div>
  );
}
