import Link from "next/link";
import type { ReactNode } from "react";
import { MiyuAvatar } from "@/components/talk/miyu-character";
import { ArrowIcon } from "@/components/ui/icons";

// MY 첫 부분 — 머리글 · 숫자 카드 둘(미유 포인트 · 남은 질문권) · 바로가기 목록. props만 받는 순수 화면 조각이다(데이터는 app/my/page.tsx가 읽는다).
// 숫자는 항상 실제 값만 받는다. 포인트는 원화로 환산하지 않고 "P"로만 보인다.

/** "나의 미유" 머리글 — 작은 미유 얼굴 + 제목 + 한 줄 */
export function MyHeader() {
  return (
    <header className="flex items-center gap-3.5">
      <MiyuAvatar className="size-12" />
      <div className="min-w-0">
        <h1 className="text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">나의 미유</h1>
        <p className="mt-0.5 text-[14px] leading-[1.6] text-ink-2">내 분석과 우리가 남긴 이야기를 모아두는 곳</p>
      </div>
    </header>
  );
}

export type StatCardData = {
  label: string;
  value: number;
  unit: string;
  /** 카드 아래의 작은 이동 안내 (예: "포인트 내역") */
  linkLabel: string;
  /** 이동할 곳. 없으면(혜택 기능을 아직 쓸 수 없을 때) 눌리지 않는 카드로 보인다 */
  href: string | null;
};

const cardClass = "block h-full rounded-2xl bg-canvas px-4 py-4 shadow-soft";

function StatCard({ card }: { card: StatCardData }) {
  const body = (
    <>
      <span className="block text-[13px] leading-snug text-ink-3">{card.label}</span>
      <span className="mt-1 flex flex-wrap items-baseline">
        <span className="text-[26px] leading-tight font-bold tabular-nums">{card.value.toLocaleString("ko-KR")}</span>
        <span className="ml-1 text-[15px] font-semibold text-ink-2">{card.unit}</span>
      </span>
      {card.href && (
        <span className="mt-2.5 flex items-center gap-1 text-[13px] font-semibold text-accent-strong">
          {card.linkLabel}
          <ArrowIcon className="size-3.5 shrink-0" />
        </span>
      )}
    </>
  );
  return card.href ? (
    <Link href={card.href} className={`${cardClass} hover:bg-mist/60`}>
      {body}
    </Link>
  ) : (
    <div className={cardClass}>{body}</div>
  );
}

/** 숫자 카드 — 둘이면 가로 2칸(좁은 화면에서도), 하나만 보일 때는 한 칸 전체 */
export function MyStatCards({ cards }: { cards: StatCardData[] }) {
  if (cards.length === 0) return null;
  return (
    <ul className={`mt-6 grid gap-3 ${cards.length > 1 ? "grid-cols-2" : "grid-cols-1"}`} aria-label="내 포인트와 질문권">
      {cards.map((c) => (
        <li key={c.label}>
          <StatCard card={c} />
        </li>
      ))}
    </ul>
  );
}

export type HubItem = {
  id: string;
  title: string;
  description: string;
  /** 같은 화면 안(#앵커) 또는 다른 화면 주소 */
  href: string;
  icon: ReactNode;
  /** 눌리지 않는 보조 안내 — 준비 중인 것을 적는다(링크 밖, 같은 줄 아래) */
  note?: string;
};

/** 바로가기 목록 — 한 장의 흰 면 안에 줄로 나눈다. 오른쪽 화살표는 눌리는 줄에만 있다 */
export function MyHubList({ items }: { items: HubItem[] }) {
  return (
    <nav aria-label="MY 바로가기" className="mt-4">
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-canvas shadow-soft">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={item.href} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-mist/60">
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] leading-snug font-semibold">{item.title}</span>
                <span className="mt-0.5 block text-[13px] leading-[1.55] text-ink-3">{item.description}</span>
              </span>
              <ArrowIcon className="size-4 shrink-0 text-ink-3" />
            </Link>
            {item.note && <p className="-mt-1 pr-4 pb-3.5 pl-[70px] text-[13px] leading-[1.55] text-ink-3">{item.note}</p>}
          </li>
        ))}
      </ul>
    </nav>
  );
}
