import Link from "next/link";
import { sampleRoomPath, talkRoomPath } from "@/components/talk/room-paths";
import { ArrowIcon } from "@/components/ui/icons";
import { ROOMS, type RoomId } from "@/lib/report/reading/talk-room";

/**
 * 리포트 · 맛보기 화면 위쪽의 "미유와 이야기하기" 입구 — 기본 방으로 들어가는 카드와, 열 수 있는 상담방 링크.
 * 방은 이 사람의 자료로 열 수 있는 것만 보이고(rooms), 방마다 새 대화로 시작한다. 홈에서 미리 골라 둔 방이 있으면(remembered) 그 방으로 바로 가는 링크를 앞에 둔다.
 */
export function TalkEntry({ id, rooms, sample = false, remembered = null, tasting = false }: { id?: string; rooms: RoomId[]; sample?: boolean; remembered?: RoomId | null; tasting?: boolean }) {
  const pathOf = (room: RoomId) => (sample || !id ? sampleRoomPath(room) : talkRoomPath(id, room));
  const others = rooms.filter((r) => r !== "main");
  const pick = remembered && remembered !== "main" && rooms.includes(remembered) ? remembered : null;
  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-1">
      <Link href={pathOf(pick ?? "main")} className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-accent-soft px-4 py-3 transition-colors hover:brightness-95">
        <span>
          <span className="block text-[16px] font-bold text-accent-strong">
            {pick ? `${ROOMS[pick].mode} 방으로 이어서 이야기하기` : tasting ? "미유와 이야기하며 맛보기" : "대화로 풀어보기"}
            {sample ? " (예시)" : ""}
          </span>
          <span className="block text-[13px] leading-[1.5] text-ink-2">{tasting ? "공감 가는 부분부터, 궁금한 주제별 방에서 짧게 풀어 줘요." : "분석 카드를 저장하고, 궁금한 주제부터 미유와 한 번에 하나씩 읽어요."}</span>
        </span>
        <ArrowIcon className="size-5 shrink-0 text-accent-strong" />
      </Link>
      {others.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="주제별 상담방">
          {others.map((r) => (
            <li key={r}>
              <Link href={pathOf(r)} className="inline-flex min-h-10 items-center rounded-full bg-canvas px-3.5 text-[14px] font-semibold text-accent-strong shadow-soft hover:bg-accent-soft">
                {ROOMS[r].label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
