"use client";

import Link from "next/link";
import { errorIdFromDigest } from "@/lib/ops/redact";
import { buttonPrimary, buttonSecondary, pageNarrow } from "@/components/ui/styles";

/**
 * 화면 오류 안내 — 빈 화면 대신 "무슨 일인지 · 지금 할 일 · 오류번호"를 보여 준다.
 * 결제 중이었을 수 있으므로 다시 결제하라고 하지 않고, 결제 상태 확인 방법을 안내한다.
 */
export function ErrorView({ digest, retry }: { digest?: string; retry: () => void }) {
  return (
    <main className={`${pageNarrow} py-16 md:py-24`}>
      <h1 className="text-[26px] font-bold tracking-tight md:text-[30px]">일시적인 문제가 생겼습니다</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
        화면을 불러오는 중 문제가 생겼습니다. 입력하신 정보와 결제 내역은 지워지지 않습니다. 잠시 뒤 다시 시도해 주세요.
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
        결제를 진행하던 중이었다면 <span className="font-semibold text-ink">다시 결제하지 마세요.</span> 결제가 승인되었다면 MY의 주문 상세에서 확인하고 반영할 수 있고, 자동으로도 반영됩니다.
      </p>
      {digest && <p className="mt-4 text-[14px] text-ink-3">문의할 때 오류번호 {errorIdFromDigest(digest)}를 알려 주세요.</p>}
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={retry} className={buttonPrimary}>
          다시 시도
        </button>
        <Link href="/my" className={buttonSecondary}>
          MY로 가기
        </Link>
        <Link href="/" className={buttonSecondary}>
          처음으로
        </Link>
      </div>
    </main>
  );
}
