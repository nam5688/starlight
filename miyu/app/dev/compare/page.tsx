import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { listRuns } from "@/server/dev-compare";

export const metadata: Metadata = { title: "AI 비교 결과 · ME:U 미유", robots: { index: false } };

/** 개발용 — 내 컴퓨터에서만 열린다(공개 배포에서는 열리지 않는다). 비교 실행 결과를 실제 미유 리포트 화면으로 읽는다. 후보 이름은 가려져 있다 */
export default function DevComparePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <StatusBadge>개발용 · 내 컴퓨터에서만 열림</StatusBadge>
      <h1 className="mt-3 text-[26px] font-bold tracking-tight md:text-[30px]">AI 비교 결과 읽기</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-2">
        비교 실행(<code className="text-[14px]">scripts/run-ai-compare.ts</code>)이 만든 리포트를 실제 미유 리포트 화면으로 읽습니다. X · Y가 어느 AI인지는 가려져 있고, 채점이 끝난 뒤에 <code className="text-[14px]">key-open-after-scoring.json</code>을 엽니다.
      </p>
      <Suspense fallback={<p className="mt-8 text-[16px] text-ink-2">불러오고 있어요.</p>}>
        <Runs />
      </Suspense>
    </main>
  );
}

async function Runs() {
  await connection();
  const runs = await listRuns();
  if (runs.length === 0)
    return <p className="mt-8 rounded-lg border border-line bg-canvas p-4 text-[15px] leading-[1.7]">아직 비교 결과가 없습니다. 비교를 실행하면 이곳에 나타납니다 (<code className="text-[14px]">pilot-data/ai-compare</code> 폴더).</p>;
  return (
    <ul className="mt-8 divide-y divide-line rounded-xl border border-line bg-canvas">
      {runs.map((r) => (
        <li key={r.id} className="px-4 py-4">
          <p className="text-[16px] font-semibold">{r.id}</p>
          <p className="mt-1 text-[13px] text-ink-3">개인 통합 리포트(읽기 구조) {r.items.length}건</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {r.items.map((it) => (
              <li key={it}>
                <Link href={`/dev/compare/${r.id}/${it}`} className={`${textLink} inline-flex h-10 items-center rounded-md border border-line-strong px-3 text-[15px]`}>
                  {it}
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
