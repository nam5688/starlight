import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CompatSection } from "@/components/home/compat-section";
import { Faq } from "@/components/home/faq";
import { HeroChat } from "@/components/home/hero-chat";
import { MethodFold } from "@/components/home/method-fold";
import { ReportBrief } from "@/components/home/report-brief";
import { RoomCards } from "@/components/home/room-cards";
import { RoomCardsLive } from "@/components/home/room-cards-live";
import { ArrowIcon } from "@/components/ui/icons";
import { buttonPrimary, buttonSecondary, pageWide } from "@/components/ui/styles";
import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import { formatKrw, FREE_ANALYSIS_TIME, PERSONAL_REPORT } from "@/lib/config/product";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const QUESTION_COUNT = ASSESSMENT_MODULES.reduce((n, m) => n + m.items.length, 0);

/**
 * 홈은 다섯 구역이다(운영자 방향 2026-10-16): 첫 소개 + 미유 대화창 → 궁합(준비 중) → 다른 상담 주제 → 리포트 · 가격 안내 → 자주 묻는 질문(+ 분석 방법과 한계).
 * 메인에서 남길 인상은 "검사해서 리포트를 사는 곳"이 아니라 "미유가 내 사주와 성향을 먼저 쉽게 풀어주고, 궁금한 건 대화로 이어가고, 전체는 리포트로 다시 보는 곳"이다.
 * 그래서 미유 캐릭터와 대화 예시를 첫 화면에 두고, 상세 항목표 · 상담 이용 조건은 리포트 예시 페이지(/report/sample)로 옮겼다. 삭제한 것은 되풀이되는 설명과 긴 비교표이지 미유 캐릭터와 말풍선이 아니다.
 */
export default function Home() {
  return (
    <main className="bg-page">
      {/* 1. 첫 소개 + 미유 대화창 — 모바일에서는 제목과 시작 버튼 아래에 대화창 */}
      <section className={`${pageWide} py-10 md:py-16 lg:py-20`}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-center lg:gap-16">
          <div className="max-w-[40rem]">
            <p className="text-[14px] font-semibold text-accent">ME:U 미유 · 대화로 풀어보는 사주와 관계</p>
            <h1 className="mt-3 text-[28px] leading-[1.35] font-bold tracking-tight md:text-[40px]">
              내 사주는 기본,
              <br />
              성격 · 기질 · 애착까지 더해
              <br />
              이야기하듯 풀어줄게요.
            </h1>
            <p className="mt-4 text-[16px] leading-[1.7] text-ink-2 md:text-[18px]">내가 어떤 사람인지, 왜 비슷한 상황에서 힘들고 부딪히는지.</p>
            <p className="mt-2 text-[16px] leading-[1.7] text-ink-2 md:text-[18px]">
              사주에 더해 MBTI 기질 성격 애착 테스트까지 반영해요.
              <br />
              <span className="font-semibold text-ink">나온 분석은 미유가 먼저 쉽게 풀어주고 궁금한 건 대화로 이어가요.</span>
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/analyze" className={buttonPrimary}>
                내 사주 무료로 보기
              </Link>
              <a href="#home-compat" className={buttonSecondary}>
                궁합 서비스 소개 · 준비 중
              </a>
            </div>
            <p className="mt-4 text-[14px] leading-[1.65] text-ink-2">
              {FREE_ANALYSIS_TIME} · 문항 {QUESTION_COUNT}개 · 무료 미리보기 · {PERSONAL_REPORT.name}{" "}
              <span className="font-semibold tabular-nums text-ink">{formatKrw(PERSONAL_REPORT.priceKrw)}</span> · 단건 구매
            </p>
            <p className="mt-2">
              <Link href="/report/sample" className="inline-flex items-center gap-1 text-[14px] font-semibold text-accent underline underline-offset-4 hover:text-accent-strong">
                무료 · 심층 리포트 예시 보기
                <ArrowIcon className="size-4" />
              </Link>
            </p>
            <p className="mt-3 text-[12px] leading-[1.65] text-ink-3">
              성격 · 기질 · 애착은 미유가 직접 만든 질문에 답한 내용이고, MBTI는 아는 유형을 입력해요. 공식 검사나 진단이 아니며 정확도는 검증하지 않았어요.{" "}
              <a href="#home-method" className="underline underline-offset-2 hover:text-ink">
                분석 방법과 한계 보기
              </a>
            </p>
          </div>
          <HeroChat />
        </div>
      </section>

      {/* 2. 궁합 (준비 중) */}
      <CompatSection />

      {/* 3. 다른 상담 주제 */}
      <Suspense fallback={<RoomCards chatReady={false} />}>
        <RoomCardsLive />
      </Suspense>

      {/* 4. 리포트 · 가격 안내 (상세 항목은 리포트 예시 페이지) */}
      <ReportBrief />

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
