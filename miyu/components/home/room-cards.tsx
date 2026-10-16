import Link from "next/link";
import { MiyuAvatar } from "@/components/talk/miyu-character";
import { ArrowIcon, LockIcon } from "@/components/ui/icons";
import { pageWide } from "@/components/ui/styles";
import { REPORT_TIER_NAMES } from "@/lib/config/product";
import { roomQuestionNote, roomSections } from "@/lib/report/chat/quota";
import { ROOM_ORDER, ROOMS, type RoomId, type TalkMood } from "@/lib/report/reading/talk-room";

/** 방마다 처음 보이는 표정 */
const CARD_MOOD: Record<RoomId, TalkMood> = { main: "happy", daily: "wave", year: "aha", love: "playful", marriage: "happy", career: "glasses", money: "thinking", concern: "basic" };

/**
 * 홈의 다른 상담 주제 — 작은 선택 영역(운영자 방향 2026-10-16: 궁합을 위로 올린 만큼 나머지 주제는 큰 카드 여러 장 대신 간결하게).
 * - 무료 리포트로 바로 이야기할 수 있는 방(오늘의 운세 · 연애 · 고민 상담)은 한 줄 카드로, 방마다 정해진 무료 질문 수를 바로 아래에 짧게 둔다.
 * - 심층 리포트로 열리는 방(올해의 흐름 · 결혼 · 일 · 진로 · 재무)은 아래 작은 묶음으로만 보인다. 모드 이름 · 미유의 첫 인사는 채팅방 안에서 보인다.
 * - "나를 알아보기"는 질문하는 방이 아니라 분석 한 장의 입구라 카드로 반복하지 않고 첫 화면의 [내 사주 무료로 보기]가 맡는다.
 * - 주제를 누르면(/go/방이름) 분석 기록이 있는 회원은 바로 그 상담방으로, 없으면 "무료 리포트가 필요해요!" 안내와 [무료 리포트 만들기]로 이어진다.
 * chatReady: 자유 질문 AI가 연결돼 있는가 — 아니면 질문 수를 약속하지 않고 "준비 중"으로 밝힌다.
 */
export function RoomCards({ chatReady = true }: { chatReady?: boolean }) {
  const { simple, deepOnly } = roomSections(ROOM_ORDER);
  const freeRooms = simple.filter((room) => room !== "main");
  return (
    <section aria-labelledby="home-rooms" className={`${pageWide} py-12 md:py-16`}>
      <h2 id="home-rooms" className="text-[22px] leading-snug font-bold tracking-tight md:text-[28px]">
        지금 떠오르는 고민도 이야기해보세요.
      </h2>
      <p className="mt-2 max-w-[40rem] text-[15px] leading-[1.7] text-ink-2">내 분석을 바탕으로 미유와 하나씩 풀어봐요.</p>

      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {freeRooms.map((room) => {
          const def = ROOMS[room];
          return (
            <li key={room}>
              <Link
                href={`/go/${room}`}
                prefetch={false}
                className="group flex h-full items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 shadow-soft ring-1 ring-accent/25 transition-shadow hover:shadow-pop focus-visible:outline-offset-4"
              >
                <MiyuAvatar className="size-10" mood={CARD_MOOD[room]} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] leading-tight font-bold">{def.label}</span>
                  <span className="mt-0.5 block text-[13px] leading-[1.45] font-medium text-ink-2">{roomQuestionNote("free", room, chatReady)}</span>
                </span>
                <ArrowIcon className="size-4 shrink-0 text-accent-strong transition-transform motion-safe:group-hover:translate-x-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-6">
        <h3 className="text-[14px] font-bold text-ink-2">{REPORT_TIER_NAMES.deep}로 더 이야기할 수 있어요</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
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

      <p className="mt-4 max-w-[44rem] text-[13px] leading-[1.7] text-ink-3">
        처음 이용한다면 내 분석부터 시작해요. 분석이 끝나면 고른 주제로 이어져요. {REPORT_TIER_NAMES.deep}로 열리는 주제는 무료 리포트를 먼저 보여 드려요. 이용 조건은 리포트 예시 페이지에서 확인할 수 있어요.
      </p>
    </section>
  );
}
