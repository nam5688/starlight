import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MiyuAvatar } from "@/components/talk/miyu-character";
import { PageFallback } from "@/components/ui/page-fallback";
import { buttonPrimary, buttonSecondary, pageNarrow } from "@/components/ui/styles";
import { INVITE_REASON_TEXT } from "@/lib/commerce/invite";
import { formatKrw, FREE_ANALYSIS_TIME, INVITE_DISCOUNT, PERSONAL_REPORT } from "@/lib/config/product";
import { referralLanding } from "@/lib/services/benefit-service";
import { inviteLanding } from "@/lib/services/invite-service";
import { benefitRepository, writeRepository } from "@/server/services";

export const metadata: Metadata = {
  title: "초대 링크 · ME:U 미유",
  robots: { index: false },
};

/**
 * 초대 링크 첫 화면(운영자 2026-10-16) — 로그인하지 않은 사람도 본다. 초대한 사람의 이름 · 정보는 보이지 않는다(링크의 무작위 토큰만으로 열린다).
 * 정가와 초대 가격을 함께 적는 것은 이 화면(실제 할인 대상 링크)만의 예외다. 마감 타이머 · "오늘만" 문구는 쓰지 않는다.
 * 실제로 5,900원이 되는지는 결제를 시작할 때 서버가 다시 확인한다(이미 구매했거나 자리가 찼으면 정가).
 */
export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <main className="bg-page">
      <Suspense fallback={<PageFallback text="불러오고 있어요." className={`${pageNarrow} py-16`} tall />}>
        <Invite params={params} />
      </Suspense>
    </main>
  );
}

async function Invite({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  const { token } = await params;
  // 새 추천 링크(제한 없는 초대)인지 먼저 확인하고, 아니면 예전 초대 링크(한 사람당 3명)로 본다 — 두 흐름이 같은 주소를 쓰고 예전 링크의 혜택은 그대로 이어진다
  const referral = await referralLanding(benefitRepository(), token);
  const landing = referral.kind === "open" ? ({ kind: "open" } as const) : await inviteLanding(writeRepository(), token);
  const price = referral.kind === "open" ? referral.priceKrw : INVITE_DISCOUNT.priceKrw;
  return (
    <div className={`${pageNarrow} py-12 md:py-16`}>
      <div className="flex items-center gap-3">
        <MiyuAvatar className="size-14" />
        <div>
          <p className="text-[13px] font-semibold text-ink-3">친구가 보낸 초대</p>
          <h1 className="text-[22px] leading-snug font-bold tracking-tight">{landing.kind === "open" ? "초대 가격으로 심층 리포트를 받아 보세요" : "이 초대 링크는 지금 쓸 수 없어요"}</h1>
        </div>
      </div>

      {landing.kind === "open" ? (
        <>
          <p className="mt-5 rounded-2xl rounded-tl-md bg-canvas px-4 py-3.5 text-[15px] leading-[1.7] shadow-soft">
            친구가 보낸 링크로 들어오셨어요. 무료 분석을 마치면 {PERSONAL_REPORT.name}를 초대 가격으로 받을 수 있어요.
          </p>
          <p className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[15px] text-ink-3">
              정가 <span className="tabular-nums line-through">{formatKrw(PERSONAL_REPORT.priceKrw)}</span>
            </span>
            <span className="text-[15px] font-semibold text-ink-2">→ 초대 가격</span>
            <span className="text-[28px] leading-none font-bold tracking-tight tabular-nums">{formatKrw(price)}</span>
          </p>
          <ul className="mt-4 space-y-1.5 text-[14px] leading-[1.65] text-ink-3">
            <li>· {PERSONAL_REPORT.name}를 처음 받을 때 한 번만 적용돼요.</li>
            <li>· 무료 분석({FREE_ANALYSIS_TIME})을 먼저 마쳐야 해요. 분석은 무료예요.</li>
            {referral.kind === "open" ? (
              <li>· 가입과 무료 분석을 마친 새 회원에게 적용돼요. 조건은 결제할 때 서버가 다시 확인하고, 맞지 않으면 사유와 정가를 먼저 알려 드려요.</li>
            ) : (
              <li>· 이 링크로 초대 가격을 받을 수 있는 자리는 한정돼 있어서, 결제할 때 다시 확인해요. 자리가 없으면 정가로 받을 수 있어요.</li>
            )}
            <li>· 궁합 비교는 준비 중이에요.</li>
          </ul>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {/* 라우트 핸들러가 링크를 기억한 뒤 무료 분석으로 보내므로 <Link>(미리 불러오기)가 아니라 <a>를 쓴다 */}
            <a href={`/invite/${token}/start`} className={buttonPrimary}>
              무료 분석 시작하기
            </a>
            <Link href="/" className={buttonSecondary}>
              미유 둘러보기
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="mt-5 rounded-2xl rounded-tl-md bg-canvas px-4 py-3.5 text-[15px] leading-[1.7] shadow-soft">{landing.reason ? INVITE_REASON_TEXT[landing.reason] : "초대 링크를 지금은 확인할 수 없어요. 잠시 뒤에 다시 열어 주세요."}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/analyze" className={buttonPrimary}>
              무료 분석 해보기
            </Link>
            <Link href="/" className={buttonSecondary}>
              미유 둘러보기
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
