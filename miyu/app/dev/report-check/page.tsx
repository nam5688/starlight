import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { FullReportView } from "@/components/report/full-report-view";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import { buildDevFreeSummary } from "@/lib/report/build-free-summary";
import { buildDevReport, devReportGenerator } from "@/lib/report/generate-dev-report";
import { calculateSaju } from "@/lib/saju/manseryeok-engine";

export const metadata: Metadata = { title: "리포트 생성기 점검 · ME:U 미유", robots: { index: false } };

/** 가상 응답 패턴 — 응답에 따라 대표 경향이 달라지는지 눈으로 보기 위한 것 (실제 고객 정보 아님) */
const PATTERNS: { label: string; answer: (i: number) => number }[] = [
  { label: "고르게 섞인 응답", answer: (i) => (i % 5) + 1 },
  { label: "대부분 높게", answer: () => 5 },
  { label: "대부분 낮게", answer: () => 1 },
  { label: "문항마다 들쑥날쑥", answer: (i) => ((i * 3) % 5) + 1 },
];

/**
 * 개발용 — 내 컴퓨터에서만 열린다(공개 배포에서는 열리지 않는다).
 * "지금 코드가 새로 만드는 리포트"를 실제 구매 리포트와 같은 화면(FullReportView)으로 보여 준다.
 * 이미 구매한 리포트는 저장된 그대로이며 이 화면은 그것을 바꾸지 않는다. 실제 AI는 부르지 않고 가상 인물만 쓴다.
 */
export default function ReportCheckPage({ searchParams }: PageProps<"/dev/report-check">) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={<p className={`${pageNarrow} py-16 text-[16px] text-ink-2`}>불러오고 있어요.</p>}>
      <ReportCheck searchParams={searchParams} />
    </Suspense>
  );
}

async function ReportCheck({ searchParams }: Pick<PageProps<"/dev/report-check">, "searchParams">) {
  await connection(); // 리포트에 쓰는 기준 날짜(지금)가 요청 때마다 정해지도록
  const query = await searchParams;
  const p = Math.min(PATTERNS.length - 1, Math.max(0, Number(typeof query.p === "string" ? query.p : "0") || 0));
  const withSaju = query.saju !== "off";

  const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((item, i) => [item.id, PATTERNS[p].answer(i)])));
  const summary = buildDevFreeSummary(answers);
  // 사주 원국은 엔진 결과만 쓴다. "off"는 만세력 엔진이 연결되기 전에 저장한 옛 검사 결과(원국 없음)를 흉내 낸 것이다
  const saju = withSaju
    ? calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" })
    : ({ status: "not-connected" } as const);
  const report = buildDevReport({
    nickname: "예시",
    knownMbti: "INFJ",
    birthText: "1994년 11월 7일 (양력) · 08:40",
    summary,
    saju,
    gender: "female",
    context: null,
  });

  const link = (q: Record<string, string>, label: string, active: boolean) => {
    const sp = new URLSearchParams({ p: String(p), ...(withSaju ? {} : { saju: "off" }), ...q });
    return (
      <Link key={label} href={`/dev/report-check?${sp.toString()}`} aria-current={active ? "true" : undefined} className={`${textLink} inline-flex h-10 items-center rounded-md border px-3 text-[14px] ${active ? "border-accent bg-accent-soft font-semibold" : "border-line-strong"}`}>
        {label}
      </Link>
    );
  };

  return (
    <main className="bg-page">
      <div className={`${pageNarrow} py-8 md:py-12`}>
        <StatusBadge>개발용 · 내 컴퓨터에서만 열림 · 가상 인물</StatusBadge>
        <h1 className="mt-3 text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">지금 코드가 새로 만드는 리포트</h1>
        <p className="mt-2 text-[15px] leading-[1.7] text-ink-2">
          지금 리포트 생성기는 <b>{devReportGenerator.name} {devReportGenerator.version}</b>입니다. 이미 구매한 리포트는 만든 시점의 내용 · 버전 그대로 저장돼 있어서, 코드를 고쳐도 자동으로 바뀌지 않습니다(MY의 리포트 아래 “생성 …”에서 그 리포트의 생성기 버전을 볼 수 있습니다).
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-canvas">
          <table className="w-full text-left text-[14px] leading-[1.6]">
            <caption className="sr-only">리포트 생성기 버전별 차이</caption>
            <thead className="bg-mist text-[13px] text-ink-3">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">생성기 버전</th>
                <th scope="col" className="px-3 py-2 font-semibold">저장된 리포트의 특징</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              <tr>
                <th scope="row" className="px-3 py-2.5 font-semibold">dev-rules dev-0.1</th>
                <td className="px-3 py-2.5">만세력 엔진이 연결되기 전에 만든 옛 저장본. 사주 칸이 “만세력 계산 연결 전”이고, 사주 쉬운 풀이 · 상황별 · 관계 조건 · 보완 아이템이 없습니다.</td>
              </tr>
              <tr>
                <th scope="row" className="px-3 py-2.5 font-semibold">dev-rules {devReportGenerator.version}</th>
                <td className="px-3 py-2.5">지금 코드. 검사 결과에 사주 원국이 있으면 사주 쉬운 풀이 · 상황별 · 관계 조건 · 보완 아이템이 함께 들어갑니다. 규칙을 조합한 개발용 글이며 AI 글이 아닙니다.</td>
              </tr>
              <tr>
                <th scope="row" className="px-3 py-2.5 font-semibold">AI 읽기 구조 reading-v1</th>
                <td className="px-3 py-2.5">상품으로 파는 형태. 리포트 생성에 AI를 연결(운영자 승인)해야 만들어지고, 지금은 예시 화면(<Link href="/report/sample" className={textLink}>/report/sample</Link>)과 모의 글로만 확인했습니다. 실제 AI 글은 승인 범위 안의 시험 4건뿐입니다.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 className="mt-8 text-[17px] font-bold">아래 화면 고르기</h2>
        <p className="mt-1 text-[13px] leading-[1.6] text-ink-3">가상 응답 · 가상 생년월일(1994년 11월 7일 · 여성)이며 실제 고객 정보가 아닙니다.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="사주 원국">
          {link({ saju: "on" }, "사주 원국 있음 (지금 새로 검사한 결과)", withSaju)}
          {link({ saju: "off" }, "사주 원국 없음 (엔진 연결 전 옛 검사 결과)", !withSaju)}
        </div>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="가상 응답">
          {PATTERNS.map((x, i) => link({ p: String(i) }, x.label, i === p))}
        </div>
        {!withSaju && (
          <p className="mt-3 text-[14px] leading-[1.7] text-ink-2">
            엔진 연결 전에 저장한 검사 결과에는 사주 원국이 저장돼 있지 않아, 같은 검사 결과로 리포트를 다시 받아도 사주 칸은 비어 있습니다. 사주가 들어간 리포트를 받으려면 무료 검사를 새로 한 번 하면 됩니다(이전 결과 · 구매한 리포트는 그대로 남습니다).
          </p>
        )}
      </div>
      <FullReportView report={report} idPrefix="k-" />
    </main>
  );
}
