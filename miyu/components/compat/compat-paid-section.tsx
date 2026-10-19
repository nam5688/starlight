import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginOptions } from "@/components/auth/login-options";
import { CompatBuyForm } from "@/components/compat/compat-buy-form";
import { buttonPrimary } from "@/components/ui/styles";
import { formatKrw, SAJU_COMPAT } from "@/lib/config/product";
import { genderOfSaju } from "@/lib/saju/engine";
import { isAuthConfigured } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { saleOpenOf } from "@/server/sale-switch";
import { readRepository } from "@/server/services";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <section aria-labelledby="compat-paid" className="mt-14">
      <h2 id="compat-paid" className="text-[18px] font-bold">
        사주 궁합 받기 <span className="ml-1 text-[14px] font-medium text-ink-3">{formatKrw(SAJU_COMPAT.priceKrw)}</span>
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * /compat의 "사주 궁합 받기" 구역 — **판매 스위치(SAJU_COMPAT.saleOpen, 시험 환경에서만 server/sale-switch.ts)가 꺼져 있으면 아무것도 그리지 않는다**(지금).
 * 켜져 있으면: 로그인 → 내 검사 결과(가장 최근) → 상대 입력 → 결제. 내 검사 결과가 없으면 무료 분석으로 안내한다.
 */
export async function CompatPaidSection() {
  if (!saleOpenOf("saju-compat") || !isAuthConfigured()) return null;
  const member = await getMember();
  if (!member) {
    return (
      <Frame>
        <p className="mb-4 text-[15px] leading-[1.75] text-ink-2">사주 궁합은 로그인한 뒤 내 사주와 상대의 생년월일로 받아요.</p>
        <LoginOptions next="/compat" />
      </Frame>
    );
  }
  if (member.needsConsent) redirect(consentPath("/compat"));
  const assessments = await (await readRepository()).listAssessments(member.userId).catch(() => []);
  const latest = assessments.filter((a) => a.userId === member.userId && !a.recordDeletedAt && a.saju.status === "ok").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (!latest) {
    return (
      <Frame>
        <p className="mb-4 text-[15px] leading-[1.75] text-ink-2">사주 궁합은 내 사주가 필요해요. 무료 분석을 먼저 마쳐 주세요.</p>
        <Link href="/analyze" className={buttonPrimary}>
          무료로 내 사주 보기
        </Link>
      </Frame>
    );
  }
  return (
    <Frame>
      <CompatBuyForm assessmentId={latest.id} myName={latest.nickname} priceLabel={formatKrw(SAJU_COMPAT.priceKrw)} savedGender={genderOfSaju(latest.saju)} />
    </Frame>
  );
}
