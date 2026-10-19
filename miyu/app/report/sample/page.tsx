import type { Metadata } from "next";
import Link from "next/link";
import { FreePreviewBody } from "@/components/report/free-preview-body";
import { ReadingReportView } from "@/components/report/reading-report-view";
import { SampleTabs } from "@/components/report/sample-tabs";
import { ScopeCompare } from "@/components/report/scope-compare";
import { IdentityCard } from "@/components/results/identity-card";
import { TalkEntry } from "@/components/results/talk-entry";
import { ArrowIcon } from "@/components/ui/icons";
import { SourceBadge } from "@/components/ui/source-badge";
import { formatKrw, LUCKY_INDEX, PERSONAL_REPORT, PERSONAL_TYPE, REPORT_TIER_NAMES } from "@/lib/config/product";
import { buildIdentity } from "@/lib/report/identity";
import { buildFreePreview } from "@/lib/report/preview";
import { ROOM_ORDER } from "@/lib/report/reading/talk-room";
import { SAMPLE_CHART, SAMPLE_TYPE_TITLE, sampleReport } from "@/lib/samples/sample-report";
import { sampleReadingReport, TIMELINE_REFERENCE } from "@/lib/samples/sample-reading-report";

export const metadata: Metadata = {
  title: "리포트 예시 · ME:U 미유",
  description:
    "같은 가상 인물의 무료 리포트와 심층 리포트 예시. 사주에 MBTI · 기질 · 성격 · 가까운 관계 반응을 더해 하나의 해석으로 읽는 형식을 미리 볼 수 있어요 (실제 검사 · 만세력 계산 결과가 아니에요).",
  alternates: { canonical: "/report/sample" },
};

/**
 * 리포트 예시 — 무료 리포트와 심층 리포트를 같은 가상 인물(서윤)의 결과로 나란히 읽는 페이지(운영자 방향 2026-10-16).
 * 비교표만 있는 설명 페이지가 아니라 실제 결과를 읽어 보는 페이지라서 두 탭 모두 풀이를 그대로 보여 주고, 제공 범위 · 상담 이용 조건 · 가격은 아래 한곳에 모았다.
 * 무료는 핵심을 완결해서 설명하고 심층은 삶의 영역과 해석의 깊이를 넓힌다 — "무료에서는 답을 가리고 유료에서 보여 준다"는 옛 비교를 쓰지 않는다.
 */
export default function SampleReportPage() {
  const report = sampleReadingReport;
  const freePreview = buildFreePreview({ summary: sampleReport, saju: SAMPLE_CHART, reference: TIMELINE_REFERENCE });
  // 서윤의 나의 유형 카드 — 실제 서비스와 같은 코드가 서윤의 가상 원국 + 가상 응답에서 계산한다(고정한 이름이 아니다)
  const identity = PERSONAL_TYPE.visible || LUCKY_INDEX.visible ? buildIdentity({ saju: SAMPLE_CHART, summary: sampleReport }) : null;
  return (
    <main className="bg-page">
      <div className="mx-auto w-full max-w-[720px] px-5 pt-5 pb-5 md:pt-10">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <SourceBadge source={report.source} />
          <span className="text-[13px] text-ink-3">가상 인물 예시 · 실제 검사 · 만세력 계산 결과가 아니에요</span>
        </div>
        <h1 className="mt-3 text-[24px] leading-snug font-bold tracking-tight md:text-[30px]">무료 리포트와 심층 리포트, 실제로 읽어보세요.</h1>
        <p className="mt-2 text-[15px] leading-[1.7] text-ink-2">같은 가상 인물({report.personName} 님)의 결과로, 풀이의 범위와 깊이를 비교할 수 있어요.</p>
      </div>

      <SampleTabs
        deepLabel={`${REPORT_TIER_NAMES.deep} 예시 · ${formatKrw(PERSONAL_REPORT.priceKrw)}`}
        free={
          <div>
            <div className="mx-auto w-full max-w-[720px] px-5 pt-6">
              <h2 className="text-[20px] leading-snug font-bold tracking-tight md:text-[22px]">{report.personName} 님의 {REPORT_TIER_NAMES.simple}</h2>
              <p className="mt-1 text-[14px] leading-[1.65] text-ink-3">무료 분석을 마치면 받는 리포트예요. 핵심 풀이를 결론까지 보여 줘요.</p>
              {identity && (
                <div className="-mx-5 -mt-3">
                  <IdentityCard identity={identity} showType={PERSONAL_TYPE.visible} showLucky={LUCKY_INDEX.visible} idPrefix="free-id-" />
                </div>
              )}
              <div className="mt-6">
                <FreePreviewBody preview={freePreview} idPrefix="free-" />
              </div>
              <Link
                href="/report/sample/taste"
                className="mt-8 flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-accent-soft px-4 py-3 transition-colors hover:brightness-95"
              >
                <span>
                  <span className="block text-[15px] font-bold text-accent-strong">무료 리포트로 미유와 이야기하는 모습 보기</span>
                  <span className="block text-[13px] leading-[1.5] text-ink-2">같은 가상 인물이 무료 분석만 마쳤을 때의 상담방 예시예요.</span>
                </span>
                <ArrowIcon className="size-5 shrink-0 text-accent-strong" />
              </Link>
            </div>
          </div>
        }
        deep={
          <div>
            <div className="mx-auto w-full max-w-[720px] px-5 pt-6 pb-1">
              <h2 className="text-[20px] leading-snug font-bold tracking-tight md:text-[22px]">{report.personName} 님의 {REPORT_TIER_NAMES.deep}</h2>
              <p className="mt-1 text-[14px] leading-[1.65] text-ink-3">같은 사람의 결과를 삶의 영역별로 더 깊게 읽은 풀이예요. 구매한 분이 받는 내용을 그대로 읽을 수 있어요.</p>
            </div>
            <TalkEntry sample rooms={ROOM_ORDER.slice()} />
            <ReadingReportView
              report={report}
              idPrefix="deep-"
              typeTitle={SAMPLE_TYPE_TITLE}
              saju={sampleReport.details.saju.saju}
              scores={[
                { title: "기질 · 성격 (개발용 예시 문항)", rows: sampleReport.temperament },
                { title: "가까운 관계 반응 (개발용 예시 문항)", rows: sampleReport.relationship },
              ]}
              footer={
                <p className="text-[13px] leading-[1.7] text-ink-3">
                  이 예시는 미유가 목표로 하는 리포트 형식을 사람이 쓴 것이에요. AI가 연결되면 실제 리포트도 이 형식으로 만들어져요. AI 연결 전에 만들어지는 개발 단계의 리포트는 구성이 다를 수 있어요.
                </p>
              }
            />
          </div>
        }
      />

      <ScopeCompare />
    </main>
  );
}
