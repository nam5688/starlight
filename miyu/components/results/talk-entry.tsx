import Link from "next/link";
import { sampleRoomPath, talkRoomPath } from "@/components/talk/room-paths";
import { ArrowIcon, LockIcon } from "@/components/ui/icons";
import { formatKrw, PERSONAL_REPORT, REPORT_TIER_NAMES } from "@/lib/config/product";
import { roomQuestionNote, roomSections } from "@/lib/report/chat/quota";
import { ROOM_ORDER, ROOMS, type RoomId } from "@/lib/report/reading/talk-room";

type Props = {
  id?: string;
  /** 이 자료로 열 수 있는 방 */
  rooms: RoomId[];
  sample?: boolean;
  remembered?: RoomId | null;
  tasting?: boolean;
  /**
   * 어느 리포트 단계인가 — simple(무료 리포트 = 무료 분석): 네 개 방만 무료로 열리고 나머지는 "심층 리포트로는 아래 상담도 가능해요!"로 따로 보인다 ·
   * deep(심층 리포트 구매): 모든 방이 열리고 방마다 무료 질문 3번. 주지 않으면 예시 화면(방 이름만)
   */
  tier?: "simple" | "deep";
  /** 자유 질문 AI가 연결돼 있는가 — 아니면 질문 수를 약속하지 않고 "준비 중"으로 밝힌다 */
  chatReady?: boolean;
  /** 심층 리포트(구매)로 이어지는 주소 */
  buyHref?: string;
};

/**
 * 리포트 · 맛보기 화면의 "미유와 이야기하기" 입구.
 * 무료 리포트: 무료로 이야기할 수 있는 방 4개를 위쪽에 강조해 보이고(방마다 무료 질문 수), 그 아래 "심층 리포트로는 아래 상담도 가능해요!"로 나머지 방을 따로 보인다(운영자 2026-10-15).
 * 심층 리포트: 모든 방을 한 목록으로 보인다. 홈에서 미리 골라 둔 방이 있으면(remembered) 그 방으로 바로 가는 링크를 앞에 둔다. 방마다 새 대화로 시작한다.
 */
export function TalkEntry({ id, rooms, sample = false, remembered = null, tasting = false, tier, chatReady = true, buyHref }: Props) {
  const pathOf = (room: RoomId) => (sample || !id ? sampleRoomPath(room) : talkRoomPath(id, room));
  const pick = remembered && remembered !== "main" && rooms.includes(remembered) ? remembered : null;

  if (tier === "simple") {
    const { simple, deepOnly } = roomSections(ROOM_ORDER);
    const open = simple.filter((r) => rooms.includes(r));
    return (
      <div className="mx-auto w-full max-w-[720px] px-5 pb-1">
        {pick && (
          <Link href={pathOf(pick)} className="mb-3 flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-accent-soft px-4 py-3 transition-colors hover:brightness-95">
            <span className="text-[15px] font-bold text-accent-strong">
              {ROOMS[pick].mode} 방으로 이어서 이야기하기
              {!open.includes(pick) && <span className="ml-1.5 text-[13px] font-medium text-ink-2">· {REPORT_TIER_NAMES.deep}로 열려요</span>}
            </span>
            <ArrowIcon className="size-5 shrink-0 text-accent-strong" />
          </Link>
        )}
        <section aria-labelledby="entry-free">
          <h3 id="entry-free" className="text-[15px] font-bold text-accent-strong">
            {REPORT_TIER_NAMES.simple}로 바로 이야기할 수 있어요
          </h3>
          <ul className="mt-2.5 grid grid-cols-2 gap-2.5">
            {open.map((r) => (
              <li key={r}>
                <Link href={pathOf(r)} className="flex h-full flex-col justify-between gap-1 rounded-2xl bg-accent-soft px-3.5 py-3 ring-1 ring-accent/30 transition-colors hover:brightness-95">
                  <span>
                    <span className="block text-[16px] leading-tight font-bold text-accent-strong">{ROOMS[r].label}</span>
                    <span className="mt-0.5 block text-[12px] text-ink-3">{ROOMS[r].mode === "미유" ? "종합 분석 · 미유" : ROOMS[r].mode}</span>
                  </span>
                  <span className="text-[13px] leading-[1.45] font-medium text-ink-2">{roomQuestionNote("free", r, chatReady)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="entry-deep" className="mt-6">
          <h3 id="entry-deep" className="text-[15px] font-bold text-ink-2">
            {REPORT_TIER_NAMES.deep}로는 아래 상담도 가능해요!
          </h3>
          <ul className="mt-2.5 flex flex-wrap gap-2" aria-label={`${REPORT_TIER_NAMES.deep}로 열리는 상담방`}>
            {deepOnly.map((r) => (
              <li key={r}>
                <Link href={pathOf(r)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-canvas px-3.5 text-[14px] font-semibold text-ink-2 shadow-soft hover:bg-mist">
                  <LockIcon className="size-3.5 text-ink-3" />
                  {ROOMS[r].label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[13px] leading-[1.65] text-ink-3">
            {REPORT_TIER_NAMES.deep}를 받으면 모든 상담방이 열리고, 방마다 무료 질문을 드려요. 더 묻고 싶을 땐 질문 3개 묶음 결제로 이어 갈 수 있어요.
          </p>
          {buyHref && (
            <Link href={buyHref} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 text-[15px] font-semibold text-white hover:bg-accent-strong">
              {REPORT_TIER_NAMES.deep} 받기 · {formatKrw(PERSONAL_REPORT.priceKrw)}
            </Link>
          )}
        </section>
      </div>
    );
  }

  const others = rooms.filter((r) => r !== "main");
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
              <Link href={pathOf(r)} className="inline-flex min-h-10 flex-col justify-center rounded-2xl bg-canvas px-3.5 py-1.5 shadow-soft hover:bg-accent-soft">
                <span className="text-[14px] leading-tight font-semibold text-accent-strong">{ROOMS[r].label}</span>
                {tier === "deep" && <span className="text-[12px] leading-tight text-ink-3">{roomQuestionNote("paid", r, chatReady)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
