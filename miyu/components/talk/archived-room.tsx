import Link from "next/link";
import { buttonPrimary, buttonSecondary, pageNarrow } from "@/components/ui/styles";
import { ROOMS, type RoomId } from "@/lib/report/reading/talk-room";
import type { TranscriptLine } from "@/lib/report/reading/talk-transcript";
import { ArchivedLines } from "./archive-lines";
import { MiyuAvatar } from "./miyu-character";
import { toneOfRoom } from "./miyu-moods";

/**
 * 삭제한 기록의 채팅방 중 지금은 이어 갈 수 없는 방 — 리포트 풀이가 있어야 열리는 방(올해의 흐름 · 결혼 · 진로 · 재무)이거나, 삭제로 리포트 원문이 없어 이 방의 풀이를 다시 그릴 수 없는 경우.
 * 이미 나눈 대화(삭제 전에 화면에 표시된 말)는 그대로 읽을 수 있고, 새로 이어 가지 못하는 이유를 사실대로 알린다. 구매 안내는 하지 않는다.
 */
export function ArchivedRoom({ room, lines, reason, backHref, talkHref }: { room: RoomId; lines: TranscriptLine[]; reason: string; backHref: string; talkHref: string }) {
  const def = ROOMS[room];
  return (
    <main className="bg-page">
      <div className={`${pageNarrow} py-10 md:py-14`}>
        <div className="flex items-center gap-3">
          <MiyuAvatar className="size-14" tone={toneOfRoom(room)} />
          <div>
            <p className="text-[13px] font-semibold text-ink-3">삭제한 기록의 대화 · 읽기 전용</p>
            <h1 className="text-[22px] leading-snug font-bold tracking-tight">{def.label}</h1>
            <p className="text-[13px] text-ink-3">{def.mode}</p>
          </div>
        </div>
        <p role="note" className="mt-5 rounded-2xl bg-canvas px-4 py-3.5 text-[15px] leading-[1.7] shadow-soft">
          {reason}
        </p>
        {lines.length > 0 ? (
          <div className="mt-5 rounded-2xl bg-page">
            <ArchivedLines lines={lines} tone={toneOfRoom(room)} divider={false} />
          </div>
        ) : (
          <p className="mt-5 text-[15px] leading-[1.7] text-ink-2">이 방에 남아 있는 대화는 없어요.</p>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href={talkHref} className={buttonPrimary}>
            이어 갈 수 있는 채팅방 보기
          </Link>
          <Link href={backHref} className={buttonSecondary}>
            MY로 가기
          </Link>
        </div>
      </div>
    </main>
  );
}
