import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MiyuAvatar } from "@/components/talk/miyu-character";
import { PageFallback } from "@/components/ui/page-fallback";
import { buttonPrimary, buttonSecondary, pageNarrow } from "@/components/ui/styles";
import { NEED_REPORT_COPY } from "@/lib/report/reading/room-entry";
import { ROOM_ORDER, ROOMS, type RoomId } from "@/lib/report/reading/talk-room";

export const metadata: Metadata = {
  title: "무료 리포트가 필요해요 · ME:U 미유",
  robots: { index: false },
};

export function generateStaticParams() {
  return ROOM_ORDER.map((room) => ({ room }));
}

/**
 * 홈의 상담 카드를 눌렀는데 분석 기록이 없을 때(운영자 2026-10-15) — 먼저 무료 리포트를 만들어야 한다고 알리고 [무료 리포트 만들기]로 이어 준다.
 * 개인정보 · 결제 · 회원 정보를 읽지 않는 안내 화면이다.
 */
export default function NeedReportPage({ params }: PageProps<"/go/[room]/need">) {
  return (
    <main className="bg-page">
      <Suspense fallback={<PageFallback text="불러오고 있어요." className={`${pageNarrow} py-16`} tall />}>
        <Need params={params} />
      </Suspense>
    </main>
  );
}

async function Need({ params }: Pick<PageProps<"/go/[room]/need">, "params">) {
  const { room } = await params;
  if (!(room in ROOMS)) notFound();
  const id = room as RoomId;
  return (
    <div className={`${pageNarrow} py-12 md:py-16`}>
      <div className="flex items-center gap-3">
        <MiyuAvatar className="size-14" mood="basic" />
        <div>
          <p className="text-[13px] font-semibold text-ink-3">{ROOMS[id].mode}</p>
          <h1 className="text-[22px] leading-snug font-bold tracking-tight">{NEED_REPORT_COPY.title}</h1>
        </div>
      </div>
      <p className="mt-5 rounded-2xl rounded-tl-md bg-canvas px-4 py-3.5 text-[15px] leading-[1.7] shadow-soft">{NEED_REPORT_COPY.lead(id)}</p>
      <p className="mt-4 text-[15px] leading-[1.7] text-ink-2">{NEED_REPORT_COPY.next(id)}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {/* 라우트 핸들러가 고른 방을 기억한 뒤 무료 분석으로 보내므로 <Link>(미리 불러오기)가 아니라 <a>를 쓴다 */}
        <a href={`/go/${id}?start=1`} className={buttonPrimary}>
          {NEED_REPORT_COPY.start}
        </a>
        <Link href="/" className={buttonSecondary}>
          {NEED_REPORT_COPY.home}
        </Link>
      </div>
    </div>
  );
}
