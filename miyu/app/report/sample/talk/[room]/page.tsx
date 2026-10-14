import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/page-fallback";
import { pageNarrow } from "@/components/ui/styles";
import { ROOM_ORDER, ROOMS, type RoomId } from "@/lib/report/reading/talk-room";
import { SampleTalk } from "../talk-sample";

export const metadata: Metadata = {
  title: "상담 채팅방 예시 · ME:U 미유",
  description: "가상 인물의 상담 모드 채팅방(원데이 · 흐름박사 · 연애박사 · 결혼박사 · 진로박사 · 재무박사 · 고민해결소) 예시입니다 (실제 검사 · 만세력 계산 결과가 아닙니다).",
  robots: { index: false },
};

export function generateStaticParams() {
  return ROOM_ORDER.filter((room) => room !== "main").map((room) => ({ room }));
}

/** 상담 모드 채팅방 예시 — 방마다 새 대화로 시작한다 */
export default function SampleTalkRoomPage({ params }: PageProps<"/report/sample/talk/[room]">) {
  return (
    <main className="bg-page">
      <Suspense fallback={<PageFallback text="채팅방을 불러오고 있어요." className={`${pageNarrow} py-16`} tall />}>
        <Room params={params} />
      </Suspense>
    </main>
  );
}

async function Room({ params }: Pick<PageProps<"/report/sample/talk/[room]">, "params">) {
  const { room } = await params;
  if (room === "main" || !(room in ROOMS)) notFound();
  return <SampleTalk room={room as RoomId} />;
}
