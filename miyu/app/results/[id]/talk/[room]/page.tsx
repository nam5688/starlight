import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/page-fallback";
import { pageNarrow } from "@/components/ui/styles";
import { ROOMS, type RoomId } from "@/lib/report/reading/talk-room";
import { paidOf, TalkRoomContent } from "../talk-room-content";

export const metadata: Metadata = {
  title: "상담 채팅방 · ME:U 미유",
  robots: { index: false },
};

/** 상담 모드 채팅방(연애박사 · 일·진로 · 돈·소비) — 방마다 새 대화로 시작한다. 기본 방은 /talk */
export default function TalkRoomPage({ params, searchParams }: PageProps<"/results/[id]/talk/[room]">) {
  return (
    <main className="bg-page">
      <Suspense fallback={<PageFallback text="채팅방을 불러오고 있어요." className={`${pageNarrow} py-16`} tall />}>
        <Room params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Room({ params, searchParams }: Pick<PageProps<"/results/[id]/talk/[room]">, "params" | "searchParams">) {
  const { id, room } = await params;
  if (room === "main" || !(room in ROOMS)) notFound();
  return <TalkRoomContent id={id} room={room as RoomId} paid={paidOf(await searchParams)} />;
}
