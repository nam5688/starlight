import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { listLiveRuns } from "@/server/dev-live";

export const metadata: Metadata = { title: "궁합 실제 AI 시험 결과 · ME:U 미유", robots: { index: false } };

const STAGE_NAME: Record<string, string> = { "compat-saju-p1": "사주 궁합", "compat-pair-p1": "리포트 궁합", "story-own": "개인 심층 story-v1(본인 입력)", "story7-own": "개인 심층 7개 대주제(본인 입력)" };

export default function DevLivePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="bg-page pb-20">
      <Suspense fallback={<p className={`${pageNarrow} py-16 text-[16px] text-ink-2`}>불러오고 있어요.</p>}>
        <Runs />
      </Suspense>
    </main>
  );
}

async function Runs() {
  await connection();
  const runs = await listLiveRuns();
  return (
    <div className={`${pageNarrow} pt-5 md:pt-10`}>
      <StatusBadge>개발용 · 궁합 실제 AI 시험 결과 · 이 PC에서만 열려요</StatusBadge>
      <h1 className="mt-3 text-[22px] font-bold tracking-tight">실제 AI가 쓴 글 읽기</h1>
      <p className="mt-2 text-[14px] leading-[1.7] text-ink-3">
        운영자가 이 PC에서 <code>scripts/run-compat-live.ts</code>로 실제 AI를 부른 결과(<code>pilot-data/ai-compare</code>)를 실제 서비스 화면 그대로 읽습니다. 검사를 통과하지 못해 저장되지 않은 글도 돈을 쓰고 받은 원문이라 그대로 볼 수 있어요.
        <strong> 검사 통과는 좋은 글이라는 뜻이 아니에요 — 글 전문을 직접 읽고 판단해 주세요.</strong> 가상 인물로 한 개인 리포트 결과는 <Link href="/dev/compare" className={textLink}>/dev/compare</Link>에서, 운영자 본인 입력 시험(<code>scripts/run-own-story.ts</code>)은 여기서 무료 · 심층 리포트를 나란히 읽어요.
      </p>
      {runs.length === 0 ? (
        <p className="mt-6 rounded-xl bg-canvas p-4 text-[15px] leading-[1.7] text-ink-2">아직 결과가 없어요. 실행 방법은 <code>docs/real-ai-run-guide.md</code>에 있어요.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {runs.map((r) => (
            <li key={r.id} className="rounded-xl bg-canvas p-4 shadow-soft">
              <Link href={`/dev/live/${r.id}`} className={`${textLink} text-[16px] font-semibold`}>
                {STAGE_NAME[r.stage]} · {r.id}
              </Link>
              <p className="mt-1 text-[14px] leading-[1.7] text-ink-2">
                {r.rehearsal ? "리허설(모의 글 · 실제 AI 아님)" : "실제 AI"} · 호출 {r.calls ?? "?"}회 · 비용 {r.spentKrw === null ? "?" : `${r.spentKrw.toLocaleString("ko-KR")}원`} · {r.result === "ok" ? "검사 통과 · 글이 저장됨" : "검사 불통과 · 저장되지 않음(원문은 볼 수 있어요)"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
