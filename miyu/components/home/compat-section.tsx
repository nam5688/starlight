import Link from "next/link";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonDisabled, buttonPrimary, pageWide } from "@/components/ui/styles";
import { ChevronIcon } from "@/components/ui/icons";

/**
 * 홈의 궁합 구역(운영자 방향 2026-10-16: 나의 사주에서 우리의 관계로 — 궁합은 여러 상담 카드 중 하나가 아니라 별도 주요 입구).
 * 세 단계다(운영자 전달 2026-10-16): **간단 궁합**(무료, 지금 이용 가능 — `/compat`) · **사주 궁합**(두 사람의 사주만으로 관계를 길게 풀이, 준비 중) · **리포트 궁합**(각자의 분석 결과를 동의 아래 연결, 준비 중).
 * 간단 궁합과 사주 궁합은 같은 계산 엔진(`lib/saju/interpret/compat.ts`)을 쓰고, 리포트 궁합은 그 위에 각자의 응답 비교가 더해지는 별도 상품이다(`docs/compat-proposal.md`).
 * 만들지 않은 두 단계는 "준비 중"으로 보이고 누를 수 없다. 가격 · "더 정확하다" · 심층 리포트에 포함된다는 말은 정해지기 전에 쓰지 않는다.
 */
const WAYS = [
  {
    name: "간단 궁합",
    badge: "무료",
    lines: ["두 사람의 생년월일과 성별, 지금의 사이를 알려 줘요.", "두 사주에서 읽힌 궁합 지수와 그 사이에 맞춘 풀이를 한 장으로 보여 줘요."],
    href: "/compat",
    cta: "무료로 궁합 보기",
  },
  {
    name: "사주 궁합",
    badge: "준비 중",
    lines: ["간단 궁합과 같은 계산을 길게 읽어요.", "어디서 잘 맞고, 어디서 부딪히기 쉬운지 영역별로 풀어봐요."],
    cta: "자세히 보기",
  },
  {
    name: "리포트 궁합",
    badge: "준비 중",
    lines: ["각자의 분석 결과를 연결해요.", "두 사주에 성격 · 기질 · 애착과 입력한 MBTI까지 함께 반영해요."],
    cta: "상대와 결과 연결하기",
  },
] as const;

export function CompatSection() {
  return (
    <section id="home-compat" aria-labelledby="home-compat-title" className="border-y border-line bg-canvas py-12 md:py-16">
      <div className={pageWide}>
        <h2 id="home-compat-title" className="text-[22px] leading-snug font-bold tracking-tight md:text-[28px]">
          그리고, 우리의 궁합까지.
        </h2>
        <p className="mt-2 max-w-[40rem] text-[15px] leading-[1.7] text-ink-2">
          가볍게 보는 간단 궁합부터, 두 사주를 깊게 읽는 사주 궁합, 각자의 성향까지 함께 보는 리포트 궁합까지. 어디서 잘 맞고, 어떤 부분을 맞춰 가야 할지 원하는 만큼 알아보세요.
        </p>

        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {WAYS.map((w) => (
            <li key={w.name} className="flex flex-col rounded-2xl bg-page p-5 shadow-soft md:p-6">
              <p className="flex flex-wrap items-center gap-2 text-[18px] font-bold">
                {w.name}
                <StatusBadge>{w.badge}</StatusBadge>
              </p>
              <ul className="mt-3 flex-1 space-y-1.5 text-[15px] leading-[1.65] text-ink-2">
                {w.lines.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {"href" in w ? (
                <Link href={w.href} className={`${buttonPrimary} mt-5 w-full`}>
                  {w.cta}
                </Link>
              ) : (
                <button type="button" disabled aria-disabled="true" className={`${buttonDisabled} mt-5 w-full`}>
                  {w.cta} · 준비 중
                </button>
              )}
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[13px] leading-[1.7] text-ink-3">간단 궁합은 지금 무료로 볼 수 있어요. 사주 궁합과 리포트 궁합은 개인 심층 리포트와 별도 서비스이고, 아직 열리지 않았어요. 이용 범위와 가격은 정해지면 안내해요.</p>

        <details className="group mt-4 border-y border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[15px] font-semibold hover:text-accent [&::-webkit-details-marker]:hidden">
            궁합은 어떤 방식으로 나뉘나요?
            <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="space-y-2.5 pb-5 text-[14px] leading-[1.7] text-ink-2">
            <li>
              <span className="font-semibold text-ink">간단 궁합</span> — 한 사람이 두 사람의 생년월일(출생 시간은 선택)과 성별, 지금의 사이를 넣어 보는 가벼운 화면이에요. 입력한 정보는 서버에 저장하지 않고, 궁합 지수와 그 사이에 맞춘 풀이까지만 보여 줘요.
            </li>
            <li>
              <span className="font-semibold text-ink">사주 궁합</span> — 간단 궁합과 같은 계산을 영역별로 길게 풀어 주는 방식으로 준비하고 있어요. 상대의 성격이나 애착을 대신 입력해 검사한 것처럼 만들지 않고, 두 사주에서 읽히는 관계의 특징까지만 풀어요.
            </li>
            <li>
              <span className="font-semibold text-ink">리포트 궁합</span> — 두 사람이 각자 분석한 결과를 서로 동의한 뒤에만 연결하는 방식이에요. 더 정확해진다는 뜻이 아니라, 사주에 각자가 직접 답한 내용이 더해져 풀이의 재료가 늘어난다는 뜻이에요. 문항별 답변이나 개인 리포트 전체는 상대에게 자동으로 보이지 않아요.
            </li>
            <li>궁합 지수는 재미로 보는 참고용이고, 관계가 이어질 확률이나 정확도가 아니에요. 사주 궁합부터는 총점 하나가 아니라 영역별 풀이로 보여 줘요.</li>
          </ul>
        </details>
      </div>
    </section>
  );
}
