import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/page-fallback";
import { pageNarrow } from "@/components/ui/styles";
import { ROOM_ORDER, ROOMS, type RoomId } from "@/lib/report/reading/talk-room";
import { SampleTalk } from "../../talk/talk-sample";

export const metadata: Metadata = {
  title: "무료 맛보기 예시 · ME:U 미유",
  description: "가상 인물이 무료 분석만 마쳤을 때의 상담방 맛보기 대화 예시예요 (실제 검사 · 만세력 계산 결과가 아니에요).",
  robots: { index: false },
};

export function generateStaticParams() {
  return ROOM_ORDER.filter((room) => room !== "main").map((room) => ({ room }));
}

/** 무료 맛보기 상담방 예시 */
export default function SampleTasteRoomPage({ params }: PageProps<"/report/sample/taste/[room]">) {
  return (
    <main className="bg-page">
      <Suspense fallback={<PageFallback text="채팅방을 불러오고 있어요." className={`${pageNarrow} py-16`} tall />}>
        <Room params={params} />
      </Suspense>
    </main>
  );
}

async function Room({ params }: Pick<PageProps<"/report/sample/taste/[room]">, "params">) {
  const { room } = await params;
  if (room === "main" || !(room in ROOMS)) notFound();
  return <SampleTalk room={room as RoomId} tier="free" />;
}
