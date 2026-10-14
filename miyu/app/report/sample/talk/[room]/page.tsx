import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ROOMS, type RoomId } from "@/lib/report/reading/talk-room";
import { SampleTalk } from "../talk-sample";

export const metadata: Metadata = {
  title: "상담 채팅방 예시 · ME:U 미유",
  description: "가상 인물의 상담 모드 채팅방(연애박사 · 일·진로 · 돈·소비) 예시입니다 (실제 검사 · 만세력 계산 결과가 아닙니다).",
  robots: { index: false },
};

export function generateStaticParams() {
  return (["love", "work", "money"] as const).map((room) => ({ room }));
}

/** 상담 모드 채팅방 예시 — 방마다 새 대화로 시작한다 */
export default async function SampleTalkRoomPage({ params }: PageProps<"/report/sample/talk/[room]">) {
  const { room } = await params;
  if (room === "main" || !(room in ROOMS)) notFound();
  return (
    <main className="bg-page">
      <SampleTalk room={room as RoomId} />
    </main>
  );
}
