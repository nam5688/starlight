import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { TalkView } from "@/components/talk/talk-view";
import { pageNarrow } from "@/components/ui/styles";
import { buildTalkModel } from "@/lib/report/reading/talk";
import { isReadingReport } from "@/lib/report/reading/types";
import { readRunReport } from "@/server/dev-compare";

export const metadata: Metadata = { title: "AI 비교 결과 · 대화로 보기 · ME:U 미유", robots: { index: false } };

/** 개발용 — AI 비교 결과(가상 인물)를 실제 제품의 "대화로 풀어보기" 화면으로 읽는다. 공개 배포에서는 notFound */
export default function DevCompareTalkPage({ params }: PageProps<"/dev/compare/[run]/[item]/talk">) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="bg-page">
      <Suspense fallback={<p className={`${pageNarrow} py-16 text-[16px] text-ink-2`}>불러오고 있어요.</p>}>
        <Talk params={params} />
      </Suspense>
    </main>
  );
}

async function Talk({ params }: Pick<PageProps<"/dev/compare/[run]/[item]/talk">, "params">) {
  await connection();
  const { run, item } = await params;
  const report = await readRunReport(run, item);
  if (!report || !isReadingReport(report)) notFound();
  const base = `/dev/compare/${run}/${item}`;
  return (
    <TalkView
      model={buildTalkModel(report)}
      room="main"
      scope={`dev-${run}-${item}`}
      dateLabel="비교용"
      reportHref={base}
      dataHref={`${base}#c-data`}
      roomHrefs={{ main: `${base}/talk` }}
      badge={{ label: "개발용 비교", text: `개발용 · AI 비교 결과(${item}) · 가상 인물` }}
    />
  );
}
