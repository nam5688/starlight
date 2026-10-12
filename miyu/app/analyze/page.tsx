import type { Metadata } from "next";
import { AnalyzeFlow } from "@/components/analyze/analyze-flow";
import { isAuthConfigured } from "@/server/env";

export const metadata: Metadata = {
  title: "내 분석 시작하기 · ME:U 미유",
  description: "생년월일과 몇 가지 문항으로 사주 · MBTI 성향 · 기질 · 애착을 함께 봅니다. 로그인 없이 무료 미리보기까지 확인할 수 있습니다.",
  alternates: { canonical: "/analyze" },
};

export default function AnalyzePage() {
  return <AnalyzeFlow authReady={isAuthConfigured()} />;
}
