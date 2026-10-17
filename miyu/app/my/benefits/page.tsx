import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createReferralLinkAction, redeemCouponAction } from "@/app/my/benefits/actions";
import { LoginOptions } from "@/components/auth/login-options";
import { BenefitsView } from "@/components/my/benefits/benefits-view";
import { PageFallback } from "@/components/ui/page-fallback";
import { textLink } from "@/components/ui/styles";
import { getBenefitOverview, type BenefitOverview } from "@/lib/services/benefit-service";
import { getCashView } from "@/lib/services/cash-service";
import { isAuthConfigured } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { logError } from "@/server/ops";
import { benefitRepository, now, readRepository, writeRepository } from "@/server/services";
import { getSiteUrl } from "@/server/session";

export const metadata: Metadata = {
  title: "쿠폰 · 혜택 · ME:U 미유",
  robots: { index: false },
};

export default function BenefitsPage() {
  return (
    <main className="bg-page">
      <div className="mx-auto w-full max-w-[720px] px-5 py-8 md:py-12">
        <Link href="/my" className={`${textLink} text-[15px]`}>
          ← MY
        </Link>
        <h1 className="mt-3 text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">쿠폰 · 혜택</h1>
        <Suspense fallback={<PageFallback className="mt-8" />}>
          <BenefitsContent />
        </Suspense>
      </div>
    </main>
  );
}

async function BenefitsContent() {
  await connection(); // 환경변수 · 로그인 상태를 요청 때마다 확인한다
  if (!isAuthConfigured()) {
    return <p className="mt-8 text-[16px] leading-[1.7] text-ink-2">로그인이 아직 설정되지 않아 혜택을 볼 수 없어요.</p>;
  }
  const member = await getMember();
  if (!member) {
    return (
      <div className="mt-8">
        <p className="text-[17px] font-semibold">로그인하고 내 혜택을 확인하세요</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">포인트 · 질문권 · 쿠폰은 로그인한 계정에 쌓여요.</p>
        <div className="mt-6">
          <LoginOptions next="/my/benefits" />
        </div>
      </div>
    );
  }
  if (member.needsConsent) redirect(consentPath("/my/benefits"));

  // 혜택은 서버가 본인 회원번호로만 읽는다. 읽지 못하면(오류) "준비 중"이 아니라 다시 시도하라고 알린다
  let overview: BenefitOverview | null = null;
  try {
    overview = await getBenefitOverview({ repo: writeRepository(), benefits: benefitRepository(), now }, member.userId);
  } catch (e) {
    logError("my.benefits", e);
  }
  if (!overview) {
    return <p className="mt-8 text-[16px] leading-[1.7] text-ink-2">혜택 정보를 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요.</p>;
  }
  const [cash, siteUrl] = await Promise.all([getCashView(await readRepository(), member.userId, 1), getSiteUrl()]);

  return <BenefitsView overview={overview} paidQuestions={cash.ready ? cash.questions : 0} siteUrl={siteUrl} createLinkAction={createReferralLinkAction} redeemCouponAction={redeemCouponAction} />;
}
