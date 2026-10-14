import type { Metadata } from "next";
import { SampleTalk } from "./talk-sample";

export const metadata: Metadata = {
  title: "대화로 풀어보기 예시 · ME:U 미유",
  description: "가상 인물의 개인 통합 리포트를 대화하듯 한 주제씩 풀어 보는 예시입니다 (실제 검사 · 만세력 계산 결과가 아닙니다).",
  robots: { index: false },
};

/** 대화로 풀어보기 예시(기본 방) — 가상 인물 서윤 */
export default function SampleTalkPage() {
  return (
    <main className="bg-page">
      <SampleTalk room="main" />
    </main>
  );
}
