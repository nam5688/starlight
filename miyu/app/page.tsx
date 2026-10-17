import type { Metadata } from "next";
import { Suspense } from "react";
import { CompatSection } from "@/components/home/compat-section";
import { Faq } from "@/components/home/faq";
import { HeroStart } from "@/components/home/hero-start";
import { MethodFold } from "@/components/home/method-fold";
import { ReportBrief } from "@/components/home/report-brief";
import { ReviewSection } from "@/components/home/review-section";
import { RoomCards } from "@/components/home/room-cards";
import { RoomCardsLive } from "@/components/home/room-cards-live";
import { SampleChatSection } from "@/components/home/sample-chat-section";
import { pageWide } from "@/components/ui/styles";

export const metadata: Metadata = { alternates: { canonical: "/" } };

/**
 * 홈은 일곱 구역이다(운영자 결정 2026-10-17, 2026-10-16 방향을 이어 첫 화면만 바꿈): ① 첫 화면(미유 말풍선 + "우리 궁합 보기" · "내 사주 보기" 바로 고르기) → ② 미유가 이렇게 풀어줘요(서윤 예시 대화) →
 * ③ 궁합(간단 궁합 무료 · 사주 궁합 · 리포트 궁합 준비 중) → ④ 다른 상담 주제 → ⑤ 실제 이용 후기(공개 후기가 있을 때만) → ⑥ 리포트 · 가격 안내 → ⑦ 자주 묻는 질문(+ 분석 방법과 한계).
 * 메인에서 남길 인상은 "검사해서 리포트를 사는 곳"이 아니라 "미유가 내 사주와 성향을 먼저 쉽게 풀어주고, 궁금한 건 대화로 이어가고, 전체는 리포트로 다시 보는 곳"이다.
 * 상세 항목표 · 상담 이용 조건은 리포트 예시 페이지(/report/sample)에 있다. 첫 화면의 말풍선은 화면 구성 예시이며, 후기 · 이용자 수 · 정확도 표현은 쓰지 않는다.
 */
export default function Home() {
  return (
    <main className="bg-page">
      {/* 1. 첫 화면 — 미유 말풍선 + 궁합 · 사주 바로 고르기 */}
      <HeroStart />

      {/* 2. 미유가 이렇게 풀어줘요 (가상 인물 서윤의 예시 대화) */}
      <SampleChatSection />

      {/* 3. 궁합 (간단 궁합 무료 · 나머지 준비 중) */}
      <CompatSection />

      {/* 4. 다른 상담 주제 */}
      <Suspense fallback={<RoomCards chatReady={false} />}>
        <RoomCardsLive />
      </Suspense>

      {/* 5. 실제 이용 후기 — 공개에 동의한 후기가 하나도 없으면 아무것도 그리지 않는다(가짜 후기로 채우지 않는다) */}
      <Suspense fallback={null}>
        <ReviewSection />
      </Suspense>

      {/* 6. 리포트 · 가격 안내 (상세 항목은 리포트 예시 페이지) */}
      <ReportBrief />

      {/* 7. 자주 묻는 질문 + 분석 방법과 한계 */}
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
