"use client";

import { miyuFontVariables } from "./fonts/miyu-fonts";
import "./globals.css";
import { errorIdFromDigest } from "@/lib/ops/redact";

/** 최상위 화면 자체가 깨졌을 때의 안내 — 자체 html · body를 가진다. 링크는 일반 주소 이동으로 전체를 다시 불러온다 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ko" className={miyuFontVariables}>
      <body className="text-[16px] leading-relaxed">
        <title>일시적인 문제 · ME:U 미유</title>
        <main className="mx-auto w-full max-w-2xl px-5 py-16 md:px-8 md:py-24">
          <h1 className="text-[26px] font-bold tracking-tight">일시적인 문제가 생겼어요</h1>
          <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
            서비스를 불러오는 중 문제가 생겼습니다. 결제를 진행하던 중이었다면 <strong>다시 결제하지 마세요.</strong> 승인된 결제는 자동으로 반영되며, 잠시 뒤 MY에서 확인할 수 있습니다.
          </p>
          {error.digest && <p className="mt-4 text-[14px] text-ink-3">문의할 때 오류번호 {errorIdFromDigest(error.digest)}를 알려 주세요.</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={retry} className="inline-flex h-12 items-center justify-center rounded-lg bg-accent px-6 text-[16px] font-semibold text-white">
              다시 시도
            </button>
            <a href="/my" className="inline-flex h-12 items-center justify-center rounded-lg border border-line-strong px-6 text-[16px] font-semibold">
              MY로 가기
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
