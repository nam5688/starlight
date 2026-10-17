import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CompatReportView } from "@/components/report/compat-report-view";
import { FreePreviewBody } from "@/components/report/free-preview-body";
import { ReadingReportView } from "@/components/report/reading-report-view";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { readLiveRun, type LiveRunDetail } from "@/server/dev-live";

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
  if (detail.own) return <OwnRun run={run} detail={detail} />;
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

/**
 * 운영자 본인 입력 시험(story-v1) — 같은 입력으로 만든 무료 리포트와 심층 리포트를 나란히 읽고, 검사에 걸려 저장되지 않았어도 모델의 원문 전문을 읽는다.
 * 읽기 전 지표는 코드가 센 보조 값이며 합격 판정이 아니다.
 */
function OwnRun({ run, detail }: { run: string; detail: LiveRunDetail }) {
  const own = detail.own!;
  const c = detail.costAndChecks;
  const failure = (c?.failure ?? null) as { code?: string; message?: string; errors?: string[] } | null;
  const nav = [
    ["own-free", "무료 리포트"],
    ["own-deep", "심층 리포트"],
    ["own-raw", "원문 전문"],
    ["own-metrics", "읽기 전 지표"],
    ["own-input", "입력 확인"],
    ["own-cost", "비용 · 검사 기록"],
  ] as const;
  return (
    <div className={`${pageNarrow} pt-5 md:pt-10`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge>{detail.rehearsal ? "리허설 · 모의 글(실제 AI 아님)" : "실제 AI 시험 결과"}</StatusBadge>
        <StatusBadge>개인 심층 story-v1 · 운영자 본인 입력</StatusBadge>
      </div>
      <p className="mt-3 text-[14px] leading-[1.7] text-ink-3">
        {run} · 호출 {String(c?.calls ?? "?")}회 · 비용 {typeof c?.spentKrw === "number" ? `${c.spentKrw.toLocaleString("ko-KR")}원` : "?"} · 누적 {typeof c?.cumulativeSpentKrw === "number" ? `${c.cumulativeSpentKrw.toLocaleString("ko-KR")}원` : "?"} · {own.reading ? "형식 검사를 통과한 글" : "형식 검사를 통과하지 못한 결과(저장되지 않음 — 원문 전문은 아래에서 읽을 수 있어요)"}.{" "}
        {detail.rehearsal ? "" : "아래 글은 실제 AI가 쓴 글이에요. "}검사 통과는 좋은 글이라는 뜻이 아니에요 — 전문을 읽고 돈을 내고 읽을 만한지 판단해 주세요. 재작성 · 다음 시험은 자동으로 하지 않았어요.{" "}
        <Link href="/dev/live" className={textLink}>
          목록으로
        </Link>
      </p>
      <nav aria-label="이 화면의 구역" className="mt-4 flex flex-wrap gap-2">
        {nav.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="inline-flex h-10 items-center rounded-lg border border-line-strong bg-canvas px-3 text-[14px] font-semibold hover:bg-mist">
            {label}
          </a>
        ))}
      </nav>

      <section id="own-free" className="mt-10 scroll-mt-16">
        <h2 className="text-[20px] font-bold">무료 리포트 (같은 입력 · 무료 화면 그대로)</h2>
        <p className="mt-1 text-[14px] leading-[1.7] text-ink-3">무료 분석을 마친 사람이 받는 화면이에요. 아래 심층 리포트와 같은 응답 · 같은 사주에서 만들어졌어요(AI를 쓰지 않아요).</p>
        <div className="mt-5">{own.free ? <FreePreviewBody preview={own.free} idPrefix="own-f-" /> : <p className="rounded-xl bg-canvas p-4 text-[15px] text-ink-2">무료 리포트를 만들지 못했어요(입력 파일이 없거나 사주를 계산하지 못했어요).</p>}</div>
      </section>

      <section id="own-deep" className="mt-14 scroll-mt-16">
        <h2 className="text-[20px] font-bold">심층 리포트 (실제 서비스 화면 그대로)</h2>
        {own.reading ? (
          <div className="mt-3 -mx-5">
            <ReadingReportView report={own.reading} idPrefix="own-d-" />
          </div>
        ) : (
          <div className="mt-3 rounded-xl bg-caution-soft p-4 text-[15px] leading-[1.7] text-caution">
            <p className="font-semibold">검사를 통과하지 못해 리포트로 저장되지 않았어요{failure?.code ? ` (${failure.code})` : ""}.</p>
            {failure?.message && <p className="mt-1">{failure.message}</p>}
            {failure?.errors && failure.errors.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px]">
                {failure.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[14px]">모델이 쓴 글 자체는 아래 &quot;읽는 순서로 풀어 쓴 글&quot;과 &quot;원문 전문&quot;에서 읽을 수 있어요.</p>
          </div>
        )}
      </section>

      <section id="own-raw" className="mt-14 scroll-mt-16 space-y-3">
        <h2 className="text-[20px] font-bold">원문 전문</h2>
        {own.readable && (
          <details className="rounded-xl bg-canvas p-4 shadow-soft" data-fold open={!own.reading}>
            <summary className="cursor-pointer text-[15px] font-semibold">읽는 순서로 풀어 쓴 글 (내용은 그대로 · 검사에 걸렸어도 읽을 수 있어요)</summary>
            <pre className="mt-3 whitespace-pre-wrap break-words text-[14px] leading-[1.8] text-ink-2">{own.readable}</pre>
          </details>
        )}
        {detail.attempts.map((a) => (
          <details key={a.round} className="rounded-xl bg-canvas p-4 shadow-soft" data-fold>
            <summary className="cursor-pointer text-[15px] font-semibold">{a.round}번째 응답 원문(모델이 돌려준 그대로)</summary>
            <pre className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-[1.7] text-ink-2">{a.text}</pre>
          </details>
        ))}
        {!own.readable && detail.attempts.length === 0 && <p className="rounded-xl bg-canvas p-4 text-[15px] text-ink-2">저장된 응답 원문이 없어요(호출 전에 멈췄거나 제공사 오류였어요).</p>}
      </section>

      <section id="own-metrics" className="mt-14 scroll-mt-16">
        <h2 className="text-[20px] font-bold">읽기 전 지표 (코드가 센 보조 값 · 합격 판정 아님)</h2>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-canvas p-4 text-[13px] leading-[1.7] text-ink-2">{own.metrics ?? "지표가 없어요."}</pre>
      </section>

      <section id="own-input" className="mt-14 scroll-mt-16">
        <h2 className="text-[20px] font-bold">입력 확인 (AI에 간 것)</h2>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-canvas p-4 text-[12px] leading-[1.7] text-ink-2">{own.inputCheck ?? "입력 확인 파일이 없어요."}</pre>
      </section>

      {c && (
        <section id="own-cost" className="mt-14 scroll-mt-16">
          <h2 className="text-[20px] font-bold">비용 · 검사 기록</h2>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-canvas p-4 text-[12px] leading-[1.6] text-ink-2">{JSON.stringify(c, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}
