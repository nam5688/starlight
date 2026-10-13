import Link from "next/link";

export function SiteHeader() {
  return (
    <header data-site-chrome="" className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-5 md:h-16 md:px-8">
        <Link href="/" className="flex items-baseline gap-2" aria-label="ME:U 미유 홈">
          <span className="text-[19px] font-bold tracking-tight">ME:U</span>
          <span className="text-[14px] text-ink-3">미유</span>
        </Link>
        <nav aria-label="주요 메뉴" className="flex items-center gap-1 text-[15px]">
          <Link href="/report/sample" className="rounded-md px-2.5 py-2 text-ink-2 hover:bg-mist hover:text-ink">
            리포트 예시
          </Link>
          <Link href="/my" className="rounded-md px-2.5 py-2 text-ink-2 hover:bg-mist hover:text-ink">
            MY
          </Link>
          <Link
            href="/analyze"
            className="ml-2 hidden h-10 items-center rounded-lg bg-accent px-4 font-semibold text-white hover:bg-accent-strong md:inline-flex"
          >
            내 분석 시작하기
          </Link>
        </nav>
      </div>
    </header>
  );
}
