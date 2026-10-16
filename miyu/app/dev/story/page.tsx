import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReadingReportView } from "@/components/report/reading-report-view";
import { StatusBadge } from "@/components/ui/source-badge";
import { textLink } from "@/components/ui/styles";
import { sampleStoryReport } from "@/lib/samples/sample-story-report";
import { sampleReport } from "@/lib/samples/sample-report";

export const metadata: Metadata = { title: "영역별 이야기 예시 · ME:U 미유", robots: { index: false } };

/**
 * 개발용 — 내 컴퓨터에서만 열린다(공개 배포에서는 열리지 않는다).
 * 영역별 이야기(story-v1) 구조의 예시를 실제 리포트와 같은 화면(ReadingReportView)으로 보여 준다.
 * 본문은 시험용 대리 작성기(AI 하위 작업자)가 쓴 초안이며 실제 서비스에 연결된 AI의 글이 아니다. /report/sample(읽기 구조 v1)은 바뀌지 않았다.
 */
export default function DevStoryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const report = sampleStoryReport;
  return (
    <main className="bg-page">
      <div className="mx-auto w-full max-w-[720px] px-5 pt-5 pb-4 md:pt-10">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge>개발용 · 영역별 이야기(story-v1) 예시 · 가상 인물</StatusBadge>
        </div>
        <h1 className="mt-3 text-[22px] leading-snug font-bold tracking-tight md:text-[26px]">{report.personName} 님의 개인 통합 리포트 (영역별 이야기 구조)</h1>
        <p className="mt-2 text-[14px] leading-[1.7] text-ink-3">
          글 칸을 영역(핵심 · 가까운 관계 · 일과 재물 · 앞으로의 시기)마다 하나의 이야기로 묶고 행동은 마지막 한곳에 모은 구조입니다.{" "}
          <b className="text-ink-2">본문은 실제 서비스 AI가 아니라 시험용 대리 작성기가 쓴 초안</b>이고 제품 검사를 통과한 글이지만, 좋은 글이라는 증거도 실제 모델이 같은 구조로 통과한다는 증거도 아닙니다. 지금 서비스의 예시(
          <Link href="/report/sample" className={textLink}>
            /report/sample
          </Link>
          )와 이미 저장된 리포트는 그대로입니다.
        </p>
      </div>
      <ReadingReportView
        report={report}
        idPrefix="story-"
        tendencyName={sampleReport.tendency.name}
        saju={sampleReport.details.saju.saju}
        scores={[
          { title: "기질 · 성격 (개발용 예시 문항)", rows: sampleReport.temperament },
          { title: "가까운 관계 반응 (개발용 예시 문항)", rows: sampleReport.relationship },
        ]}
      />
    </main>
  );
}
