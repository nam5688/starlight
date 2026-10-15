import Link from "next/link";
import { LockIcon } from "@/components/ui/icons";
import { buttonPrimary, buttonSecondary, pageNarrow } from "@/components/ui/styles";
import { CHAT_ROOMS, formatKrw, PERSONAL_REPORT, REPORT_TIER_NAMES } from "@/lib/config/product";
import { ROOMS, type RoomId } from "@/lib/report/reading/talk-room";
import { MiyuAvatar } from "./miyu-character";

/**
 * 무료 리포트(무료 분석)로는 열리지 않는 방 — 올해의 흐름 · 결혼 · 진로 · 재무(운영자 2026-10-15: 이 방들은 심층 리포트로만 열린다).
 * 방이 무엇을 이야기하는지만 알려 주고(풀이 · 문장은 보이지 않는다), 심층 리포트로 이어 준다. 이미 구매했지만 리포트를 이 방에서 쓸 수 없으면(만드는 중 · 만들지 못함 · 예전 형식) 그 이유를 알린다.
 */
export type LockedOwnedState = "pending" | "failed" | "old-format";

const OWNED_TEXT: Record<LockedOwnedState, string> = {
  pending: `${REPORT_TIER_NAMES.deep}를 준비하고 있어요. 준비되면 이 방이 열려요.`,
  failed: `${REPORT_TIER_NAMES.deep}를 만들지 못했어요. 내 리포트 화면에서 다시 만들 수 있어요.`,
  "old-format": `이 결과의 리포트는 예전 형식으로 저장돼 있어서 이 방을 열 수 없어요. 새 형식 ${REPORT_TIER_NAMES.deep}는 내 리포트 화면에서 다시 받을 수 있어요.`,
};

export function LockedRoom({ room, buyHref, ownedState, backHref }: { room: RoomId; buyHref: string; ownedState: LockedOwnedState | null; backHref: string }) {
  const def = ROOMS[room];
  const owned = ownedState !== null;
  return (
    <main className="bg-page">
      <div className={`${pageNarrow} py-12 md:py-16`}>
        <div className="flex items-center gap-3">
          <MiyuAvatar className="size-14" mood="basic" />
          <div>
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-3">
              <LockIcon className="size-3.5" />
              {REPORT_TIER_NAMES.deep}로 열려요
            </p>
            <h1 className="text-[22px] leading-snug font-bold tracking-tight">{def.label}</h1>
            <p className="text-[13px] text-ink-3">{def.mode}</p>
          </div>
        </div>
        <p className="mt-5 rounded-2xl rounded-tl-md bg-canvas px-4 py-3.5 text-[15px] leading-[1.7] shadow-soft">{def.blurb}</p>
        <p className="mt-4 text-[15px] leading-[1.7] text-ink-2">
          {ownedState
            ? OWNED_TEXT[ownedState]
            : `이 방은 ${REPORT_TIER_NAMES.deep}로 열려요. ${REPORT_TIER_NAMES.deep}를 받으면 모든 상담방이 열리고, 방마다 무료 질문을 ${CHAT_ROOMS.deepFreeQuestions}번 드려요. 더 묻고 싶을 땐 질문 한 개당 결제로 이어 갈 수 있어요.`}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href={buyHref} className={buttonPrimary}>
            {owned ? "내 리포트 보기" : `${REPORT_TIER_NAMES.deep} 받기 · ${formatKrw(PERSONAL_REPORT.priceKrw)}`}
          </Link>
          <Link href={backHref} className={buttonSecondary}>
            무료로 이야기할 수 있는 방 보기
          </Link>
        </div>
      </div>
    </main>
  );
}
