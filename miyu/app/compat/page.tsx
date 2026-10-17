import type { Metadata } from "next";
import { Suspense } from "react";
import { CompatForm } from "@/components/compat/compat-form";
import { CompatLevels } from "@/components/compat/compat-levels";
import { CompatPaidSection } from "@/components/compat/compat-paid-section";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow } from "@/components/ui/styles";

export const metadata: Metadata = {
  title: "간단 궁합 · 우리 둘은 무슨 커플일까? · ME:U 미유",
  description: "두 사람의 생년월일로 사주 궁합 엔진이 읽은 커플 유형과 궁합 지수를 무료로 알려 드려요. 로그인 없이, 입력한 정보는 저장하지 않아요.",
  alternates: { canonical: "/compat" },
};

/**
 * 간단 궁합(무료) — 두 사람의 출생정보만으로 커플 유형 · 궁합 지수를 보여 주는 가벼운 화면. 사주 궁합(유료)과 같은 엔진의 결과이며 입력은 저장하지 않는다.
 * 사주 궁합 · 리포트 궁합은 아직 만들지 않았으므로 "준비 중"으로만 안내한다.
 */
export default function CompatPage() {
  return (
    <main className="bg-page pb-20">
      <div className={`${pageNarrow} pt-8 md:pt-12`}>
        <p className="flex items-center gap-2 text-[13px] font-semibold text-accent">
          간단 궁합 <StatusBadge>무료</StatusBadge>
        </p>
        <h1 className="mt-2 text-[26px] leading-snug font-bold tracking-tight md:text-[32px]">우리 둘은 무슨 커플일까?</h1>
        <p className="mt-3 text-[16px] leading-[1.75] text-ink-2">두 사람의 생년월일만 넣으면, 두 사주에서 읽힌 커플 유형과 궁합 지수를 알려 드려요. 재미로 가볍게 봐 주세요.</p>
        <div className="mt-8">
          <CompatForm />
        </div>

        {/* 판매 스위치가 꺼져 있는 동안은 아무것도 그리지 않는다 */}
        <Suspense fallback={null}>
          <CompatPaidSection />
        </Suspense>

        <Suspense fallback={null}>
          <CompatLevels />
        </Suspense>
      </div>
    </main>
  );
}
