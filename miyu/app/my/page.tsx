import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { signOut } from "@/app/auth/actions";
import { setMarketingAction } from "@/app/my/actions";
import { LoginOptions } from "@/components/auth/login-options";
import { MyHeader, MyHubList, MyStatCards } from "@/components/my/my-hub";
import { OrdersFold } from "@/components/my/orders-fold";
import { hubCards, hubItems } from "@/components/my/my-hub-data";
import { ConcernRow, DeletedRecords, ReportRow } from "@/components/my/report-rows";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonPrimary, buttonSecondary, textLink } from "@/components/ui/styles";
import { formatDate } from "@/components/ui/format";
import { CONCERN_RECORDS } from "@/lib/config/product";
import { getBenefitOverview, type BenefitOverview } from "@/lib/services/benefit-service";
import { getCashView } from "@/lib/services/cash-service";
import { listMyCompat } from "@/lib/services/compat-service";
import { listMyPairs } from "@/lib/services/pair-service";
import { pairDeps } from "@/server/pair";
import { deleteNoticeOf, getMyPage } from "@/lib/services/my-service";
import { isAuthConfigured, paymentConfig } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { logError } from "@/server/ops";
import { reconcileUserInBackground } from "@/server/reconcile";
import { benefitRepository, now, readRepository, writeRepository } from "@/server/services";
import { PageFallback } from "@/components/ui/page-fallback";

export const metadata: Metadata = {
  title: "MY · ME:U 미유",
  robots: { index: false },
};

export default function MyPage({ searchParams }: { searchParams: Promise<{ notice?: string | string[] }> }) {
  return (
    <main className="bg-page">
      <div className="mx-auto w-full max-w-[720px] px-5 py-8 md:py-12">
        <MyHeader />
        <Suspense fallback={<PageFallback className="mt-8" />}>
          <MyContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function MyContent({ searchParams }: { searchParams: Promise<{ notice?: string | string[] }> }) {
  await connection(); // 환경변수·로그인 상태를 요청 때마다 확인한다
  if (!isAuthConfigured()) {
    return (
      <div className="mt-8 border-y border-line py-8">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[17px] font-semibold">로그인이 아직 설정되지 않았어요</p>
          <StatusBadge>설정 전</StatusBadge>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          Supabase와 카카오 로그인 설정을 마치면 이곳에서 저장한 결과를 볼 수 있어요.
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
          카카오 계정으로 가입·로그인해요. 토스 가입이나 앱 설치는 필요 없어요. 같은 카카오 계정으로 다시 로그인하면 저장한
          결과를 그대로 볼 수 있어요.
        </p>
        <div className="mt-6">
          <LoginOptions next="/my" />
        </div>
      </div>
    );
  }
  if (member.needsConsent) redirect(consentPath("/my"));
  // 결제 승인이 났는데 돌아오지 못한 주문이 있으면 응답 뒤에 결제사 기록과 맞춘다
  reconcileUserInBackground(member.userId);

  const repo = await readRepository();
  const notice = deleteNoticeOf((await searchParams).notice);
  const [{ cards, deletedRecords, deleteAvailable, concerns, orders }, cash, benefits, compats, pairs] = await Promise.all([
    getMyPage(repo, member.userId),
    getCashView(repo, member.userId, 1),
    readBenefits(member.userId),
    listMyCompat(repo, member.userId).catch(() => []),
    listMyPairs(pairDeps(), member.userId).catch(() => []),
  ]);
  const paymentsReady = paymentConfig().ok;
  return (
    <>
      <MyStatCards cards={hubCards(benefits, cash.ready ? cash.questions : 0)} />
      <MyHubList items={hubItems(benefits, cards.length)} />

      <section aria-labelledby="my-list" className="mt-12 scroll-mt-20">
        <h2 id="my-list" className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
          내 리포트
        </h2>
        <p className="mt-1.5 text-[13px] leading-[1.6] text-ink-3">저장한 결과와 구매한 리포트를 저장된 그대로 다시 볼 수 있어요.</p>
        {notice && (
          <p
            role="status"
            data-testid="delete-notice"
            className={`mt-3 rounded-xl px-4 py-3 text-[14px] leading-[1.65] ${notice.tone === "ok" ? "bg-positive-soft text-positive" : "bg-caution-soft text-caution"}`}
          >
            {notice.text}
          </p>
        )}
        {cards.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-canvas px-4 py-8 text-[15px] text-ink-2">
            {deletedRecords.length > 0 ? "목록에 보이는 리포트가 없어요. 삭제한 기록의 대화는 아래에서 열 수 있어요." : "아직 저장한 결과가 없어요."}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {cards.map((card) => (
              <ReportRow key={card.assessmentId} card={card} paymentsReady={paymentsReady} deleteAvailable={deleteAvailable} />
            ))}
          </ul>
        )}
        {deleteAvailable && cards.length > 0 && (
          <p className="mt-2 text-[13px] leading-[1.6] text-ink-3">
            ‘기록 삭제’를 누르면 확인창이 열려요. 삭제하면 리포트 글은 되돌릴 수 없지만, 채팅방 · 남은 질문권 · 주문 기록은 그대로 남아요.
          </p>
        )}
        {deleteAvailable && <DeletedRecords records={deletedRecords} />}
      </section>

      {compats.length > 0 && (
        <section aria-labelledby="my-compat" className="mt-12">
          <h2 id="my-compat" className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
            내 사주 궁합
          </h2>
          <p className="mt-1.5 text-[13px] leading-[1.6] text-ink-3">구매한 사주 궁합은 저장된 그대로 다시 볼 수 있어요. 상대 생년월일은 리포트가 만들어진 뒤 지워져요.</p>
          <ul className="mt-3 space-y-3">
            {compats.map((c) => (
              <li key={c.orderNumber}>
                <Link href={`/compat/report/${c.orderNumber}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl bg-canvas px-4 py-3.5 shadow-soft">
                  <span className="text-[15px] font-semibold">{c.names ? `${c.names.a} × ${c.names.b}` : "사주 궁합"}</span>
                  <span className="text-[13px] text-ink-3">
                    {c.status === "paid-ready" ? "완성" : c.status === "generating" ? "만드는 중" : c.status === "failed" ? "만들지 못함 · 다시 만들 수 있어요" : "환불됨"} · {formatDate(c.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pairs.length > 0 && (
        <section aria-labelledby="my-pairs" className="mt-12">
          <h2 id="my-pairs" className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
            내 리포트 궁합
          </h2>
          <p className="mt-1.5 text-[13px] leading-[1.6] text-ink-3">두 사람이 연결한 쌍의 궁합이에요. 한 사람이 결제하면 두 사람이 같은 글을 저장된 그대로 다시 볼 수 있어요.</p>
          <ul className="mt-3 space-y-3">
            {pairs.map((p) => (
              <li key={p.pairId}>
                <Link href={`/pair/${p.pairId}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl bg-canvas px-4 py-3.5 shadow-soft">
                  <span className="text-[15px] font-semibold">{p.otherNickname ? `${p.otherNickname} 님과` : "상대를 기다리는 초대"}</span>
                  <span className="text-[13px] text-ink-3">
                    {p.report === "ready" ? "완성" : p.report === "generating" ? "만드는 중" : p.report === "failed" ? "만들지 못함 · 다시 만들 수 있어요" : p.report === "blocked" ? "열람이 막힘" : p.status === "invited" ? "상대를 기다리는 중" : p.status === "linked" ? "연결됨 · 결제 전" : "연결이 끊김"} · {formatDate(p.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {CONCERN_RECORDS.visible && concerns.length > 0 && (
        <section aria-labelledby="my-concerns" className="mt-12">
          <h2 id="my-concerns" className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
            내 고민 반영 리포트
          </h2>
          <p className="mt-1.5 text-[13px] leading-[1.6] text-ink-3">심층 리포트와 별도로 발급한 리포트예요. 발급일 · 고민 주제로 구분하며, 이전 리포트는 새 리포트가 나와도 그대로 남아요.</p>
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
          <p className="mt-3 rounded-xl border border-line bg-canvas px-4 py-6 text-[15px] text-ink-2">결제내역이 없어요.</p>
        ) : (
          <OrdersFold orders={orders} />
        )}
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

/** 혜택은 서버가 본인 회원번호로만 읽는다. 읽지 못하면(DB 변경 전 · 오류) 혜택 카드 · 줄만 보이지 않고 나머지 MY는 그대로 열린다 */
async function readBenefits(userId: string): Promise<BenefitOverview | null> {
  try {
    return await getBenefitOverview({ repo: writeRepository(), benefits: benefitRepository(), now }, userId);
  } catch (e) {
    logError("my.benefits-overview", e);
    return null;
  }
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
