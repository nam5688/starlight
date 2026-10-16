import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ScenarioLab } from "@/components/dev/scenario-lab";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow } from "@/components/ui/styles";
import { SCENARIO_CASES } from "@/lib/assessment/drafts/scenario-cases";
import { LAB_PRESETS } from "@/lib/assessment/drafts/scenario-lab";
import { SCENES } from "@/lib/assessment/drafts/scenario-v1";
import { labStatus } from "@/server/dev-scenario";

export const metadata: Metadata = { title: "장면 질문 시험 · ME:U 미유", robots: { index: false } };

/**
 * 개발용 — 내 컴퓨터에서만 열린다(공개 배포에서는 열리지 않는다). 새 장면 질문(10장면)에 직접 답하고 풀이가 어떻게 나오는지 읽는 시험 화면이다.
 * 일반 이용자 화면 · 검사 화면 · 저장된 회원 결과 · 점수표에 연결하지 않았고, 어디에도 저장하지 않는다.
 */
export default function DevScenarioPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="bg-page">
      <div className={`${pageNarrow} py-10 md:py-14`}>
        <StatusBadge>개발용 · 내 컴퓨터에서만 열림 · 저장하지 않음</StatusBadge>
        <h1 className="mt-3 text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">장면 질문 시험</h1>
        <p className="mt-2 text-[16px] leading-[1.7] text-ink-2">
          새 장면 질문 10개에 직접 답하고, 그 답이 풀이에 어떻게 쓰이는지 읽어 봅니다. 답에는 좋고 나쁨이 없고 점수로 바뀌지 않습니다. 이 질문은 아직 일반 이용자 화면 · 검사 · 저장된 회원 결과에 연결하지 않았습니다(개발용 초안, 사람에게 풀어 보게 한 적이 없습니다).
        </p>
        <Suspense fallback={<p className="mt-8 text-[16px] text-ink-2">불러오고 있어요.</p>}>
          <Lab />
        </Suspense>
      </div>
    </main>
  );
}

async function Lab() {
  await connection();
  const status = labStatus();
  const scenes = SCENES.map((s) => ({ id: s.id, ask: s.ask, options: s.options.map((o) => ({ id: o.id, text: o.text })) }));
  const presets = LAB_PRESETS.map((p) => ({ key: p.key, label: p.label, answers: SCENARIO_CASES.find((c) => c.key === p.key)!.answers as Record<string, string | undefined> }));
  return <ScenarioLab scenes={scenes} presets={presets} live={status.live} liveReason={status.reason} />;
}
