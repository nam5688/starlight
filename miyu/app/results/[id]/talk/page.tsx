import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/page-fallback";
import { pageNarrow } from "@/components/ui/styles";
import { paidOf, TalkRoomContent } from "./talk-room-content";

export const metadata: Metadata = {
  title: "대화로 풀어보기 · ME:U 미유",
  robots: { index: false },
};

export default function TalkPage({ params, searchParams }: PageProps<"/results/[id]/talk">) {
  return (
    <main className="bg-page">
      <Suspense fallback={<PageFallback text="리포트를 불러오고 있어요." className={`${pageNarrow} py-16`} tall />}>
        <Main params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** 기본 방(미유) — 내 분석 한 장과 주제별 풀이 */
async function Main({ params, searchParams }: Pick<PageProps<"/results/[id]/talk">, "params" | "searchParams">) {
  const { id } = await params;
  return <TalkRoomContent id={id} room="main" paid={paidOf(await searchParams)} />;
}
