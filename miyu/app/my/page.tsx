import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonDisabled, buttonPrimary, buttonSecondary, pageNarrow } from "@/components/ui/styles";
import { INTEGRATIONS } from "@/lib/config/integrations";

export const metadata: Metadata = {
  title: "MY · ME:U 미유",
};

export default function MyPage() {
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <h1 className="text-[26px] font-bold tracking-tight md:text-[30px]">MY</h1>
      <p className="mt-2 text-[16px] text-ink-2">구매한 리포트를 저장된 그대로 다시 볼 수 있는 곳입니다.</p>

      <div className="mt-8 border-y border-line py-8">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[17px] font-semibold">로그인이 아직 연결되지 않았습니다</p>
          <StatusBadge>{INTEGRATIONS.kakaoLogin.stage}단계에서 연결</StatusBadge>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          카카오 로그인과 결과 저장은 {INTEGRATIONS.kakaoLogin.stage}단계, 구매한 리포트 다시보기는{" "}
          {INTEGRATIONS.payments.stage}단계에서 연결합니다. 지금은 저장된 리포트가 없습니다.
        </p>
        <button type="button" disabled className={`${buttonDisabled} mt-6 w-full sm:w-auto`}>
          카카오로 로그인 (연결 전)
        </button>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/analyze" className={buttonPrimary}>
          내 분석 시작하기
        </Link>
        <Link href="/report/sample" className={buttonSecondary}>
          리포트 예시 보기
        </Link>
      </div>
    </main>
  );
}
