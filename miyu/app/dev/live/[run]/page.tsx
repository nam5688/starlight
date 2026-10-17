import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CompatReportView } from "@/components/report/compat-report-view";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { readLiveRun } from "@/server/dev-live";

export const metadata: Metadata = { title: "궁합 실제 AI 시험 결과 · ME:U 미유", robots: { index: false } };

export default function DevLiveRunPage({ params }: PageProps<"/dev/live/[run]">) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="bg-page pb-20">
      <Suspense fallback={<p className={`${pageNarrow} py-16 text-[16px] text-ink-2`}>불러오고 있어요.</p>}>
        <Run params={params} />
      </Suspense>
    </main>
  );
}

async function Run({ params }: Pick<PageProps<"/dev/live/[run]">, "params">) {
  await connection();
  const { run } = await params;
  const detail = await readLiveRun(run);
  if (!detail) notFound();
  const c = detail.costAndChecks;
  const failure = (c?.failure ?? null) as { code?: string; message?: string; errors?: string[] } | null;
  const real = !detail.rehearsal && detail.report?.generated.provider !== "mock";
  return (
    <div className={`${pageNarrow} pt-5 md:pt-10`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge>{detail.rehearsal ? "리허설 · 모의 글(실제 AI 아님)" : "실제 AI 시험 결과"}</StatusBadge>
        <StatusBadge>{detail.stage === "compat-saju-p1" ? "사주 궁합 · 가상 쌍 C1" : "리포트 궁합 · 가상 인물 P01 · P02"}</StatusBadge>
      </div>
      <p className="mt-3 text-[14px] leading-[1.7] text-ink-3">
        {run} · 호출 {String(c?.calls ?? "?")}회 · 비용 {typeof c?.spentKrw === "number" ? `${c.spentKrw.toLocaleString("ko-KR")}원` : "?"} · {detail.report ? "검사를 통과한 글" : "검사를 통과하지 못한 결과(저장되지 않음)"}.{" "}
        {real ? "아래 글은 실제 AI가 쓴 글이에요. " : ""}검사 통과는 좋은 글이라는 뜻이 아니에요 — 전문을 읽고 돈을 내고 읽을 만한지 판단해 주세요.{" "}
        <Link href="/dev/live" className={textLink}>
          목록으로
        </Link>
      </p>

      {detail.report ? (
        <div className="mt-6">
          <CompatReportView report={detail.report} />
        </div>
      ) : (
        <div className="mt-6 rounded-xl bg-caution-soft p-4 text-[15px] leading-[1.7] text-caution">
          <p className="font-semibold">검사를 통과하지 못해 저장되지 않은 결과예요{failure?.code ? ` (${failure.code})` : ""}.</p>
          {failure?.message && <p className="mt-1">{failure.message}</p>}
          {failure?.errors && failure.errors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px]">
              {failure.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {detail.attempts.length > 0 && (
        <section className="mt-8 space-y-3">
          <h2 className="text-[18px] font-bold">모델이 돌려준 원문 ({detail.attempts.length}회)</h2>
          <p className="text-[14px] leading-[1.7] text-ink-3">검사에 걸린 글도 그대로예요. 호출마다 한 칸씩 — 첫 칸이 처음 쓴 글, 다음 칸은 고쳐 쓴 글이에요.</p>
          {detail.attempts.map((a) => (
            <details key={a.round} className="rounded-xl bg-canvas p-4 shadow-soft" data-fold>
              <summary className="cursor-pointer text-[15px] font-semibold">{a.round}번째 응답 원문</summary>
              <pre className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-[1.7] text-ink-2">{a.text}</pre>
            </details>
          ))}
        </section>
      )}

      {c && (
        <section className="mt-8">
          <h2 className="text-[18px] font-bold">비용 · 검사 기록</h2>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-canvas p-4 text-[12px] leading-[1.6] text-ink-2">{JSON.stringify(c, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}
