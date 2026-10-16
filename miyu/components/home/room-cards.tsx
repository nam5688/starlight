import Link from "next/link";
import { MiyuAvatar } from "@/components/talk/miyu-character";
import { ArrowIcon, LockIcon } from "@/components/ui/icons";
import { REPORT_TIER_NAMES } from "@/lib/config/product";
import { roomQuestionNote, roomSections } from "@/lib/report/chat/quota";
import { ROOM_ORDER, ROOMS, type RoomId, type TalkMood } from "@/lib/report/reading/talk-room";

/** 방마다 처음 보이는 표정 */
const CARD_MOOD: Record<RoomId, TalkMood> = { main: "happy", daily: "wave", year: "aha", love: "playful", marriage: "happy", career: "glasses", money: "thinking", concern: "basic" };

/**
 * 홈의 상담 주제 — 무료 리포트로 바로 이야기할 수 있는 방을 큰 카드로, 심층 리포트로 열리는 방은 작은 묶음으로 보인다(운영자 제안 2026-10-16).
 * - "나를 알아보기"는 질문하는 방이 아니라 분석 한 장을 보는 입구라 카드로 반복하지 않고 첫 화면의 [무료 분석 시작하기]가 맡는다.
 * - 카드에는 주제 이름 · 한 줄 설명 · 무료 질문 수만 둔다. 모드 이름(연애박사 미유 …)과 미유의 첫 인사는 채팅방 안에서 보인다.
 * - 주제를 누르면(/go/방이름) 분석 기록이 있는 회원은 바로 그 상담방으로, 없으면 "무료 리포트가 필요해요!" 안내와 [무료 리포트 만들기]로 이어진다(심층 리포트로만 열리는 방은 결과 화면에서 "이어서 이야기하기" 바로가기).
 * chatReady: 자유 질문 AI가 연결돼 있는가 — 아니면 질문 수를 약속하지 않고 "준비 중"으로 밝힌다.
 */
export function RoomCards({ chatReady = true }: { chatReady?: boolean }) {
  const { simple, deepOnly } = roomSections(ROOM_ORDER);
  const freeRooms = simple.filter((room) => room !== "main");
  return (
    <section aria-labelledby="home-rooms" className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 md:py-14">
      <div className="flex items-center gap-3">
        <MiyuAvatar className="size-12" mood="wave" />
        <p className="w-fit rounded-2xl rounded-tl-md bg-canvas px-4 py-2.5 text-[15px] leading-[1.5] shadow-soft">안녕하세요, 미유예요.</p>
      </div>
      <h2 id="home-rooms" className="mt-5 text-[22px] leading-snug font-bold tracking-tight md:text-[28px]">
        지금, 어떤 이야기가 궁금하세요?
      </h2>
      <p className="mt-2 max-w-[40rem] text-[15px] leading-[1.7] text-ink-2">내 분석을 바탕으로 미유와 하나씩 풀어봐요.</p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {freeRooms.map((room) => {
          const def = ROOMS[room];
          return (
            <li key={room}>
              <Link
                href={`/go/${room}`}
                prefetch={false}
                className="group flex h-full flex-col gap-2.5 rounded-2xl bg-accent-soft p-4 shadow-soft ring-1 ring-accent/25 transition-shadow hover:shadow-pop focus-visible:outline-offset-4"
              >
                <span className="flex items-center gap-3">
                  <MiyuAvatar className="size-11" mood={CARD_MOOD[room]} />
                  <span className="block text-[18px] leading-tight font-bold">{def.label}</span>
                </span>
                <span className="text-[14px] leading-[1.6] text-ink-2">{def.blurb}</span>
                <span className="text-[13px] leading-[1.5] font-semibold text-ink-2">{roomQuestionNote("free", room, chatReady)}</span>
                <span className="mt-auto flex items-center gap-1.5 pt-1 text-[14px] font-semibold text-accent-strong">
                  무료로 시작
                  <ArrowIcon className="size-4 transition-transform motion-safe:group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-7">
        <h3 className="text-[15px] font-bold text-ink-2">{REPORT_TIER_NAMES.deep}로 더 이야기할 수 있어요</h3>
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {deepOnly.map((room) => (
            <li key={room}>
              <Link
                href={`/go/${room}`}
                prefetch={false}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-canvas px-3.5 text-[14px] font-semibold text-ink-2 shadow-soft transition-shadow hover:shadow-pop"
              >
                <LockIcon className="size-3.5 text-ink-3" />
                {ROOMS[room].label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-5 max-w-[44rem] text-[13px] leading-[1.7] text-ink-3">
        처음이라면 약 5분의 무료 분석부터 시작해요. 분석을 마치면 고른 주제의 채팅방이 열려요. {REPORT_TIER_NAMES.deep}로 열리는 주제는 무료 리포트를 먼저 보여 드려요.
      </p>
    </section>
  );
}
