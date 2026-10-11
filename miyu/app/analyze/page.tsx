import type { Metadata } from "next";
import { AnalyzeFlow } from "@/components/analyze/analyze-flow";
import { isAuthConfigured } from "@/server/env";

export const metadata: Metadata = {
  title: "내 분석 시작하기 · ME:U 미유",
};

export default function AnalyzePage() {
  return <AnalyzeFlow authReady={isAuthConfigured()} />;
}
