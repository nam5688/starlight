import Link from "next/link";
import { MiyuAvatar } from "@/components/talk/miyu-character";
import { ArrowIcon, LockIcon } from "@/components/ui/icons";
import { formatKrw, PERSONAL_REPORT, REPORT_TIER_NAMES } from "@/lib/config/product";
import { roomQuestionNote, roomSections } from "@/lib/report/chat/quota";
import { TALK_COPY } from "@/lib/report/reading/talk";
import { ROOM_ORDER, ROOMS, type RoomId, type TalkMood } from "@/lib/report/reading/talk-room";

/** 방마다 처음 보이는 표정 */
const CARD_MOOD: Record<RoomId, TalkMood> = { main: "happy", daily: "wave", year: "aha", love: "playful", marriage: "happy", career: "glasses", money: "thinking", concern: "basic" };

/** 방에 들어가면 미유가 먼저 건네는 말 — 방 정의(ROOMS)의 먼저 묻는 질문을 그대로 쓴다 */
const firstMessage = (room: RoomId) => ROOMS[room].intake?.question ?? TALK_COPY.askTopic;

/**
 * 홈의 상담 입구 — 직설적인 주제 이름(연애 · 결혼 · 일 · 진로 …)을 크게, 그 방의 미유 이름(연애박사 미유 …)을 작게 보인다(운영자 2026-10-15).
 * 두 구역: 간단 리포트(무료 분석)로 바로 이야기할 수 있는 방 4개(강조, 방마다 무료 질문 수)와 "심층 리포트로는 아래 상담도 가능해요!"(나머지 방, 잠금 표시).
 * 주제를 누르면 무료 분석으로 이어지고(/go/방이름), 분석을 마치면 무료 리포트(결과 화면)를 먼저 보여 준 뒤 거기서 상담방을 고른다(고른 주제는 "이어서 이야기하기" 바로가기로 남는다).
 * chatReady: 자유 질문 AI가 연결돼 있는가 — 아니면 질문 수를 약속하지 않고 "준비 중"으로 밝힌다.
 */
export function RoomCards({ chatReady = true }: { chatReady?: boolean }) {
  const { simple, deepOnly } = roomSections(ROOM_ORDER);
  return (
    <section aria-labelledby="home-rooms" className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 md:py-14">
      <h2 id="home-rooms" className="text-[22px] leading-snug font-bold tracking-tight md:text-[28px]">
        어떤 이야기가 궁금하세요?
      </h2>
      <p className="mt-2 max-w-[40rem] text-[15px] leading-[1.7] text-ink-2">
        주제를 고르면 무료 분석을 시작해요. 분석이 끝나면 먼저 내 무료 리포트를 보여 드리고, 거기서 그 주제의 미유 채팅방으로 이어 가요.
      </p>

      <h3 className="mt-7 text-[16px] font-bold text-accent-strong">{REPORT_TIER_NAMES.simple}로 바로 이야기할 수 있어요</h3>
      <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {simple.map((room) => {
          const def = ROOMS[room];
          return (
            <li key={room}>
              <Link
                href={`/go/${room}`}
                prefetch={false}
                className="group flex h-full flex-col gap-3 rounded-2xl bg-accent-soft p-3.5 shadow-soft ring-1 ring-accent/25 transition-shadow hover:shadow-pop focus-visible:outline-offset-4 sm:p-4"
              >
                <span className="flex items-center gap-2.5 sm:gap-3">
                  <MiyuAvatar className="size-11 sm:size-12" mood={CARD_MOOD[room]} />
                  <span className="min-w-0">
                    <span className="block text-[16px] leading-tight font-bold sm:text-[17px]">{def.label}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-ink-3 sm:text-[13px]">{def.mode === "미유" ? "종합 분석 · 미유" : def.mode}</span>
                  </span>
                </span>
                <span className="hidden rounded-2xl rounded-tl-md bg-canvas px-3.5 py-2.5 text-[14px] leading-[1.6] text-ink-2 sm:block">{firstMessage(room)}</span>
                <span className="text-[13px] leading-[1.5] font-semibold text-ink-2">{roomQuestionNote("free", room, chatReady)}</span>
                <span className="mt-auto flex items-center gap-1.5 text-[14px] font-semibold text-accent-strong">
                  무료로 시작
                  <ArrowIcon className="size-4 transition-transform motion-safe:group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <h3 className="mt-9 text-[16px] font-bold text-ink-2">{REPORT_TIER_NAMES.deep}로는 아래 상담도 가능해요!</h3>
      <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {deepOnly.map((room) => {
          const def = ROOMS[room];
          return (
            <li key={room}>
              <Link
                href={`/go/${room}`}
                prefetch={false}
                className="group flex h-full flex-col gap-2.5 rounded-2xl bg-canvas p-3.5 shadow-soft transition-shadow hover:shadow-pop focus-visible:outline-offset-4 sm:p-4"
              >
                <span className="flex items-center gap-2.5 sm:gap-3">
                  <MiyuAvatar className="size-10 sm:size-11" mood={CARD_MOOD[room]} />
                  <span className="min-w-0">
                    <span className="block text-[15px] leading-tight font-bold sm:text-[16px]">{def.label}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{def.mode}</span>
                  </span>
                </span>
                <span className="hidden text-[13px] leading-[1.55] text-ink-3 sm:block">{def.blurb}</span>
                <span className="mt-auto flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
                  <LockIcon className="size-3.5 text-ink-3" />
                  {REPORT_TIER_NAMES.deep}로 열려요
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[13px] leading-[1.65] text-ink-3">
        무료 분석은 생년월일과 질문에 답하면 끝나요. {REPORT_TIER_NAMES.deep}({formatKrw(PERSONAL_REPORT.priceKrw)})를 받으면 모든 상담방이 열리고 방마다 무료 질문을 드려요. 오늘의 운세는 하루 한 번 무료예요(초기 혜택). 궁합 비교는 준비 중이에요.
      </p>
    </section>
  );
}
