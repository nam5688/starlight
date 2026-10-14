import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/page-fallback";
import { pageNarrow } from "@/components/ui/styles";
import { SampleTalk } from "../talk/talk-sample";

export const metadata: Metadata = {
  title: "무료 맛보기 예시 · ME:U 미유",
  description: "가상 인물이 무료 분석만 마쳤을 때의 맛보기 대화 예시입니다 (실제 검사 · 만세력 계산 결과가 아닙니다).",
  robots: { index: false },
};

/** 무료 맛보기 예시(기본 방) — 가상 인물 서윤이 무료 분석만 마쳤을 때 */
export default function SampleTastePage() {
  return (
    <main className="bg-page">
      <Suspense fallback={<PageFallback text="채팅방을 불러오고 있어요." className={`${pageNarrow} py-16`} tall />}>
        <SampleTalk room="main" tier="free" />
      </Suspense>
    </main>
  );
}
