import Link from "next/link";

export function SiteFooter() {
  return (
    <footer data-site-chrome="" className="mt-auto border-t border-line bg-mist">
      <div className="mx-auto w-full max-w-6xl space-y-2 px-5 py-10 text-[13px] leading-relaxed text-ink-3 md:px-8">
        <p className="text-[15px] font-semibold text-ink-2">ME:U 미유 · 개인 통합 분석 리포트</p>
        <p>미유의 리포트는 자기 이해를 돕는 참고 자료이며, 의학적·심리학적 진단을 대신하지 않습니다.</p>
        <p>사주는 전통 해석 체계로, 심리검사 점수와 합산하지 않고 따로 제시합니다.</p>
        <p className="flex gap-4 pt-2">
          <Link href="/terms" className="underline underline-offset-4 hover:text-ink">
            이용약관
          </Link>
          <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
            개인정보 처리방침
          </Link>
        </p>
      </div>
    </footer>
  );
}
