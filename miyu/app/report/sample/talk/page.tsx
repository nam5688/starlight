import type { Metadata } from "next";
import { TalkView } from "@/components/talk/talk-view";
import { buildTalkModel } from "@/lib/report/reading/talk";
import { sampleReport } from "@/lib/samples/sample-report";
import { sampleReadingReport } from "@/lib/samples/sample-reading-report";

export const metadata: Metadata = {
  title: "대화로 풀어보기 예시 · ME:U 미유",
  description: "가상 인물의 개인 통합 리포트를 대화하듯 한 주제씩 풀어 보는 예시입니다 (실제 검사 · 만세력 계산 결과가 아닙니다).",
  robots: { index: false },
};

/** 대화로 풀어보기 예시 — 가상 인물 서윤. 구매 없이 볼 수 있고, 실제 리포트도 같은 화면에서 읽는다 */
export default function SampleTalkPage() {
  const report = sampleReadingReport;
  const model = buildTalkModel(report, { tendencyName: sampleReport.tendency.name });
  return (
    <main className="bg-page">
      <TalkView model={model} dateLabel="예시" reportHref="/report/sample" dataHref="/report/sample#data" subtitle="개발용 샘플 · 가상 인물 예시예요. 실제 검사 · 만세력 계산 결과가 아니에요." />
    </main>
  );
}
