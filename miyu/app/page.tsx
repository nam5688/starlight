import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExampleSection } from "@/components/home/example-section";
import { Faq } from "@/components/home/faq";
import { MethodFold } from "@/components/home/method-fold";
import { PriceSection } from "@/components/home/price-section";
import { RoomCards } from "@/components/home/room-cards";
import { RoomCardsLive } from "@/components/home/room-cards-live";
import { buttonPrimary, buttonSecondary, pageWide } from "@/components/ui/styles";
import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import { formatKrw, FREE_ANALYSIS_TIME, PERSONAL_REPORT } from "@/lib/config/product";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const QUESTION_COUNT = ASSESSMENT_MODULES.reduce((n, m) => n + m.items.length, 0);

/**
 * 홈은 다섯 구역이다(운영자 제안 2026-10-16): 첫 소개 → 상담 주제 → 분석 · 대화 예시 → 가격과 제공 범위 → 자주 묻는 질문(+ 분석 방법과 한계).
 * "5분쯤 답하면 내 분석이 나오고, 그걸 바탕으로 미유와 궁금한 이야기를 할 수 있고, 무료로 먼저 보고 자세한 리포트는 9,900원"이 한눈에 읽히는 것이 목표라
 * 같은 내용을 여러 구역에서 되풀이하지 않는다. 리포트의 세부 항목 · 분석에 쓰는 정보의 설명은 접어 둔다.
 */
export default function Home() {
  return (
    <main className="bg-page">
      {/* 1. 첫 소개 — 미유가 무엇인지, 무엇을 누르면 되는지만 */}
      <section className={`${pageWide} py-10 md:py-16 lg:py-20`}>
        <div className="max-w-[40rem]">
          <p className="text-[14px] font-semibold text-accent">ME:U 미유 · 개인 통합 분석</p>
          <h1 className="mt-3 text-[28px] leading-[1.35] font-bold tracking-tight md:text-[42px]">
            내 분석은 한 장으로,
            <br />
            궁금한 건 대화로.
          </h1>
          <p className="mt-4 text-[16px] leading-[1.7] text-ink-2 md:text-[18px]">사주와 내가 답한 성향 · 관계 질문을 함께 읽어, 나를 이해하고 지금의 고민을 정리해요.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/analyze" className={buttonPrimary}>
              무료 분석 시작하기
            </Link>
            <Link href="/report/sample" className={buttonSecondary}>
              리포트 예시 보기
            </Link>
          </div>
          <p className="mt-4 text-[14px] leading-[1.65] text-ink-2">
            {FREE_ANALYSIS_TIME} · 문항 {QUESTION_COUNT}개 · 미리보기 무료 · {PERSONAL_REPORT.name}{" "}
            <span className="font-semibold tabular-nums text-ink">{formatKrw(PERSONAL_REPORT.priceKrw)}</span> · 단건 구매
          </p>
          <p className="mt-3 text-[12px] leading-[1.65] text-ink-3">
            성격 · 기질 · 애착은 미유가 직접 만든 질문에 답한 내용이고, MBTI는 아는 유형을 입력해요. 공식 검사나 진단이 아니며 정확도는 검증하지 않았어요.{" "}
            <a href="#home-method" className="underline underline-offset-2 hover:text-ink">
              분석 방법과 한계 보기
            </a>
          </p>
        </div>
      </section>

      {/* 2. 상담 주제 */}
      <Suspense fallback={<RoomCards chatReady={false} />}>
        <RoomCardsLive />
      </Suspense>

      {/* 3. 분석 한 장 + 이어지는 대화 예시 (후기 자리에는 가상 인물 예시만 둔다) */}
      <ExampleSection />

      {/* 4. 가격과 제공 범위 */}
      <PriceSection />

      {/* 5. 자주 묻는 질문 + 분석 방법과 한계 */}
      <section aria-labelledby="home-faq" className="border-t border-line py-14 md:py-20">
        <div className={`${pageWide} grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16`}>
          <h2 id="home-faq" className="text-[24px] font-bold tracking-tight md:text-[28px]">
            자주 묻는 질문
          </h2>
          <div>
            <Faq />
            <MethodFold />
          </div>
        </div>
      </section>
    </main>
  );
}
