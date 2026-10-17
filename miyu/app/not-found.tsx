import type { Metadata } from "next";
import Link from "next/link";
import { buttonPrimary, buttonSecondary, pageNarrow } from "@/components/ui/styles";

export const metadata: Metadata = {
  title: "찾을 수 없는 페이지 · ME:U 미유",
  robots: { index: false },
};

/**
 * 없는 주소 · 볼 수 없는 주소 공통 안내.
 * 다른 회원의 결과 · 주문 주소도 같은 화면이 나오므로, 그런 주소가 있는지 없는지는 알려 주지 않는다.
 */
export default function NotFound() {
  return (
    <main className={`${pageNarrow} py-16 md:py-24`}>
      <h1 className="text-[26px] font-bold tracking-tight md:text-[30px]">찾을 수 없는 페이지예요</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
        주소가 잘못되었거나, 이 계정으로는 볼 수 없는 페이지예요. 내 결과와 리포트는 MY에서 찾을 수 있어요.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/my" className={buttonPrimary}>
          MY로 가기
        </Link>
        <Link href="/" className={buttonSecondary}>
          처음으로
        </Link>
      </div>
    </main>
  );
}
