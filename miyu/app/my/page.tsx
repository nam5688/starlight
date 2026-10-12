import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { signOut } from "@/app/auth/actions";
import { setMarketingAction } from "@/app/my/actions";
import { KakaoLoginForm } from "@/components/auth/kakao-login-button";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonPrimary, buttonSecondary, pageNarrow, textLink } from "@/components/ui/styles";
import { retryReportAction } from "@/app/results/[id]/actions";
import { formatKrw } from "@/lib/config/product";
import { ENTITLEMENT_LABEL, GENERATION_LABEL, getMyPage, PAYMENT_ENV_LABEL, type MyReportCard } from "@/lib/services/my-service";
import { isAuthConfigured, paymentConfig } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { readRepository } from "@/server/services";

export const metadata: Metadata = {
  title: "MY · ME:U 미유",
  robots: { index: false },
};

export default function MyPage() {
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <h1 className="text-[26px] font-bold tracking-tight md:text-[30px]">MY</h1>
      <p className="mt-2 text-[16px] text-ink-2">저장한 결과와 구매한 리포트를 저장된 그대로 다시 볼 수 있습니다.</p>
      <Suspense fallback={<p className="mt-8 text-[16px] text-ink-2">불러오고 있어요.</p>}>
        <MyContent />
      </Suspense>
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

  const { cards, orders } = await getMyPage(await readRepository(), member.userId);
  const paymentsReady = paymentConfig().ok;
  return (
    <>
      <section aria-labelledby="my-list" className="mt-8">
        <h2 id="my-list" className="text-[18px] font-bold">
          내 리포트
        </h2>
        {cards.length === 0 ? (
          <p className="mt-3 border-y border-line py-8 text-[15px] text-ink-2">아직 저장한 결과가 없습니다.</p>
        ) : (
          <ul className="mt-3 border-t border-ink">
            {cards.map((card) => (
              <ReportRow key={card.assessmentId} card={card} paymentsReady={paymentsReady} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="my-orders" className="mt-10">
        <h2 id="my-orders" className="text-[18px] font-bold">
          결제내역
        </h2>
        {orders.length === 0 ? (
          <p className="mt-3 border-y border-line py-6 text-[15px] text-ink-2">결제내역이 없습니다.</p>
        ) : (
          <ul className="mt-3 border-t border-ink">
            {orders.map((o) => (
              <li key={o.orderNumber} className="border-b border-line">
                <Link href={`/my/orders/${o.orderNumber}`} className="block py-3.5 hover:bg-mist/60">
                  <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-[15px] font-semibold">{o.productName}</span>
                    <span className="text-[15px] font-semibold tabular-nums">{formatKrw(o.amount)}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
                    <span className={o.status === "paid" ? "font-semibold text-accent" : "font-semibold text-ink-2"}>{o.statusLabel}</span>
                    <span>· {formatDate(o.approvedAt ?? o.createdAt)}</span>
                    <span className="tabular-nums">· {o.orderNumber}</span>
                    {PAYMENT_ENV_LABEL[o.paymentEnv] && <StatusBadge>{PAYMENT_ENV_LABEL[o.paymentEnv]}</StatusBadge>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[13px] text-ink-3">주문을 누르면 결제 승인 기록과 리포트 제공 상태를 주문번호 기준으로 볼 수 있습니다.</p>
      </section>

      <section aria-labelledby="my-account" className="mt-10">
        <h2 id="my-account" className="text-[18px] font-bold">
          계정
        </h2>
        <dl className="mt-3 border-y border-line text-[15px]">
          <div className="flex items-center justify-between gap-4 border-b border-line py-3">
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

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

/** 리포트 한 건: 상품 · 대상 · 날짜 · 이용 권한 · 생성 상태와, 상태에 맞는 버튼만 */
function ReportRow({ card, paymentsReady }: { card: MyReportCard; paymentsReady: boolean }) {
  const href = `/results/${card.assessmentId}`;
  const small = "inline-flex h-10 items-center justify-center rounded-lg px-4 text-[14px] font-semibold";
  const primary = `${small} bg-accent text-white hover:bg-accent-strong`;
  const secondary = `${small} border border-line-strong bg-canvas text-ink hover:bg-mist`;
  return (
    <li className="border-b border-line py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[16px] font-semibold">{card.productName}</span>
        <StatusBadge>{ENTITLEMENT_LABEL[card.entitlement]}</StatusBadge>
        {card.generation !== "none" && <StatusBadge>{GENERATION_LABEL[card.generation]}</StatusBadge>}
        {card.source === "dev-scoring" && <StatusBadge>개발용 결과</StatusBadge>}
      </div>
      <p className="mt-1 text-[14px] text-ink-2">{card.subject}</p>
      <p className="mt-0.5 text-[13px] text-ink-3">
        생성일 {formatDate(card.createdAt)}
        {card.period ? ` · 기간 ${card.period}` : ""}
        {card.paidOrderNumber ? ` · 주문번호 ${card.paidOrderNumber}` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {card.entitlement === "purchased" ? (
          card.generation === "failed" ? (
            <>
              <form action={retryReportAction.bind(null, card.assessmentId)}>
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
      {card.entitlement === "purchased" && card.generation === "failed" && (
        <p className="mt-2 text-[13px] text-ink-3">결제는 정상 처리되었습니다. 다시 결제하지 말고 ‘다시 생성’을 눌러 주세요.</p>
      )}
    </li>
  );
}
