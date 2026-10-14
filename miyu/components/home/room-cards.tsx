import Link from "next/link";
import { MiyuAvatar } from "@/components/talk/miyu-character";
import { sampleRoomPath } from "@/components/talk/room-paths";
import { ArrowIcon } from "@/components/ui/icons";
import { TALK_COPY } from "@/lib/report/reading/talk";
import { ROOM_ORDER, ROOMS, type RoomId, type TalkMood } from "@/lib/report/reading/talk-room";

/** 방마다 처음 보이는 표정 */
const CARD_MOOD: Record<RoomId, TalkMood> = { main: "happy", love: "playful", work: "glasses", money: "thinking" };

/** 방에 들어가면 미유가 먼저 건네는 말 — 방 정의(ROOMS)의 먼저 묻는 질문을 그대로 쓴다 */
const firstMessage = (room: RoomId) => ROOMS[room].intake?.question ?? TALK_COPY.askTopic;

/**
 * 홈의 상담 입구 — 주제를 고르면 그 주제의 미유 채팅방(예시)으로 들어간다.
 * 방마다 새 대화로 시작하고 같은 미유가 주제에 맞게 모드만 바꾼다. 가상 인물 서윤의 예시 방이며, 내 분석이 준비되면 같은 방이 내 이야기로 열린다.
 */
export function RoomCards() {
  return (
    <section aria-labelledby="home-rooms" className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 md:py-14">
      <h2 id="home-rooms" className="text-[22px] leading-snug font-bold tracking-tight md:text-[28px]">
        어떤 이야기가 궁금하세요?
      </h2>
      <p className="mt-2 max-w-[40rem] text-[15px] leading-[1.7] text-ink-2">
        주제를 고르면 그 주제의 미유 채팅방이 열려요. 방마다 새 대화로 시작하고, 같은 미유가 주제에 맞는 모드로 이야기해요.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROOM_ORDER.map((room) => {
          const def = ROOMS[room];
          return (
            <li key={room}>
              <Link
                href={sampleRoomPath(room)}
                className="group flex h-full flex-col gap-3 rounded-2xl bg-canvas p-4 shadow-soft transition-shadow hover:shadow-pop focus-visible:outline-offset-4"
              >
                <span className="flex items-center gap-3">
                  <MiyuAvatar className="size-12" mood={CARD_MOOD[room]} />
                  <span className="min-w-0">
                    <span className="block text-[17px] leading-tight font-bold">{def.label}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{def.mode}</span>
                  </span>
                </span>
                <span className="block rounded-2xl rounded-tl-md bg-page px-3.5 py-2.5 text-[14px] leading-[1.6] text-ink-2">{firstMessage(room)}</span>
                <span className="hidden text-[13px] leading-[1.55] text-ink-3 sm:block">{def.blurb}</span>
                <span className="mt-auto flex items-center gap-1.5 text-[14px] font-semibold text-accent-strong">
                  예시 대화 보기
                  <ArrowIcon className="size-4 transition-transform motion-safe:group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[13px] leading-[1.65] text-ink-3">
        여기 보이는 대화는 가상 인물 서윤의 예시예요. 분석 리포트를 받으면 같은 방이 내 이야기로 열려요. 지금은 저장된 내 분석을 대화로 나눠 보여 주는 방식이고, 자유롭게 묻는 질문은 준비 중이에요.
      </p>
    </section>
  );
}
