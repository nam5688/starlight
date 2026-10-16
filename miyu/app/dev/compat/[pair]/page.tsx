import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CompatReportView } from "@/components/report/compat-report-view";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { devCompatView } from "@/server/dev-compat";

export const metadata: Metadata = { title: "사주 궁합 리포트 · ME:U 미유", robots: { index: false } };

export default function DevCompatPairPage({ params }: PageProps<"/dev/compat/[pair]">) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="bg-page pb-20">
      <Suspense fallback={<p className={`${pageNarrow} py-16 text-[16px] text-ink-2`}>불러오고 있어요.</p>}>
        <Pair params={params} />
      </Suspense>
    </main>
  );
}

async function Pair({ params }: Pick<PageProps<"/dev/compat/[pair]">, "params">) {
  await connection();
  const { pair } = await params;
  const view = await devCompatView(pair);
  if (!view) notFound();
  return (
    <div className={`${pageNarrow} pt-5 md:pt-10`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge>개발용 · 사주 궁합 리포트 · 가상 인물 {pair}</StatusBadge>
      </div>
      <p className="mt-3 text-[14px] leading-[1.7] text-ink-3">
        {view.ok
          ? view.source === "proxy"
            ? "풀이 본문은 시험용 대리 작성기가 쓴 글이며, 읽을 때마다 제품 검사를 다시 통과한 글만 보여 줍니다. 좋은 글이라는 증거도 실제 서비스 AI가 같은 글을 쓴다는 증거도 아닙니다."
            : "저장된 글이 없어 모의 작성기의 자리 표시 글을 보여 줍니다."
          : "저장된 글을 보여 줄 수 없습니다."}{" "}
        <Link href="/dev/compat" className={textLink}>
          쌍 목록으로
        </Link>
      </p>
      <div className="mt-6">
        {view.ok ? (
          <CompatReportView report={view.report} />
        ) : (
          <div className="rounded-xl border border-line bg-canvas p-4 text-[15px] leading-[1.7]">
            <p className="font-semibold">{view.reason}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-ink-2">
              {view.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
