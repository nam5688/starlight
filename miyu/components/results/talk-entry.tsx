import Link from "next/link";
import { sampleRoomPath, talkRoomPath } from "@/components/talk/room-paths";
import { ArrowIcon } from "@/components/ui/icons";
import type { IntegratedReadingReport } from "@/lib/report/reading/types";
import { buildTalkModel } from "@/lib/report/reading/talk";
import { ROOM_ORDER, ROOMS, roomAvailable, type RoomId } from "@/lib/report/reading/talk-room";

/**
 * 구매한 리포트 위쪽의 "대화로 풀어보기" 입구 — 기본 방으로 들어가는 카드와, 이 리포트로 열 수 있는 상담방 링크.
 * 방은 저장된 리포트의 풀이가 있을 때만 보이고, 방마다 새 대화로 시작한다. AI를 부르지 않는다.
 */
export function TalkEntry({ id, report, sample = false }: { id?: string; report: IntegratedReadingReport; sample?: boolean }) {
  const model = buildTalkModel(report);
  const pathOf = (room: RoomId) => (sample || !id ? sampleRoomPath(room) : talkRoomPath(id, room));
  const rooms = ROOM_ORDER.filter((r) => r !== "main" && roomAvailable(model, r));
  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-1">
      <Link href={pathOf("main")} className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-accent-soft px-4 py-3 transition-colors hover:brightness-95">
        <span>
          <span className="block text-[16px] font-bold text-accent-strong">대화로 풀어보기{sample ? " (예시)" : ""}</span>
          <span className="block text-[13px] leading-[1.5] text-ink-2">분석 카드를 저장하고, 궁금한 주제부터 미유와 한 번에 하나씩 읽어요.</span>
        </span>
        <ArrowIcon className="size-5 shrink-0 text-accent-strong" />
      </Link>
      {rooms.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="주제별 상담방">
          {rooms.map((r) => (
            <li key={r}>
              <Link href={pathOf(r)} className="inline-flex min-h-10 items-center rounded-full bg-canvas px-3.5 text-[14px] font-semibold text-accent-strong shadow-soft hover:bg-accent-soft">
                {ROOMS[r].label} 상담방
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
