import { StatusBadge } from "@/components/ui/source-badge";
import { buttonDisabled, pageWide } from "@/components/ui/styles";
import { ChevronIcon } from "@/components/ui/icons";

/**
 * 홈의 궁합 구역(운영자 방향 2026-10-16: 나의 사주에서 우리의 관계로 — 궁합은 여러 상담 카드 중 하나가 아니라 별도 주요 입구).
 * **궁합은 아직 만들지 않았다** — 두 입구 모두 "준비 중"으로 보이고 누를 수 없다. 서비스 소개는 접어 둔 설명으로만 둔다.
 * 사주 궁합 = 한 사람이 두 사람의 출생정보를 입력하는 경로(상대의 심리 응답을 대신 만들지 않는다), 리포트 궁합 = 각자의 분석 결과를 동의 아래 연결하는 경로(`docs/compat-proposal.md`).
 * "무료 궁합" · 가격 · "더 정확하다" · 심층 리포트에 포함된다는 말은 정해지기 전에 쓰지 않는다. 궁합은 개인 심층 리포트와 별도 서비스다.
 */
const WAYS = [
  {
    name: "사주 궁합",
    lines: ["두 사람의 생년월일로 시작해요.", "두 사주에서 읽히는 관계의 특징을 풀어봐요."],
    cta: "출생정보로 시작하기",
  },
  {
    name: "리포트 궁합",
    lines: ["각자의 분석 결과를 연결해요.", "두 사주에 성격 · 기질 · 애착과 입력한 MBTI까지 함께 반영해요."],
    cta: "상대와 결과 연결하기",
  },
];

export function CompatSection() {
  return (
    <section id="home-compat" aria-labelledby="home-compat-title" className="border-y border-line bg-canvas py-12 md:py-16">
      <div className={pageWide}>
        <h2 id="home-compat-title" className="text-[22px] leading-snug font-bold tracking-tight md:text-[28px]">
          그리고, 우리의 궁합까지.
        </h2>
        <p className="mt-2 max-w-[40rem] text-[15px] leading-[1.7] text-ink-2">
          생년월일로 보는 사주 궁합부터, 각자의 성향까지 함께 보는 리포트 궁합까지. 어디서 잘 맞고, 어떤 부분을 맞춰 가야 할지 원하는 방식으로 알아보세요.
        </p>

        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {WAYS.map((w) => (
            <li key={w.name} className="flex flex-col rounded-2xl bg-page p-5 shadow-soft md:p-6">
              <p className="flex flex-wrap items-center gap-2 text-[18px] font-bold">
                {w.name}
                <StatusBadge>준비 중</StatusBadge>
              </p>
              <ul className="mt-3 space-y-1.5 text-[15px] leading-[1.65] text-ink-2">
                {w.lines.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <button type="button" disabled aria-disabled="true" className={`${buttonDisabled} mt-5 w-full sm:w-auto`}>
                {w.cta} · 준비 중
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[13px] leading-[1.7] text-ink-3">궁합은 개인 심층 리포트와 별도 서비스예요. 아직 열리지 않았고, 이용 범위와 가격은 정해지면 안내해요.</p>

        <details className="group mt-4 border-y border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[15px] font-semibold hover:text-accent [&::-webkit-details-marker]:hidden">
            궁합은 어떤 방식으로 준비하고 있나요?
            <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="space-y-2.5 pb-5 text-[14px] leading-[1.7] text-ink-2">
            <li>
              <span className="font-semibold text-ink">사주 궁합</span> — 한 사람이 두 사람의 출생정보를 입력해 시작하는 방식으로 준비하고 있어요. 상대의 성격이나 애착을 대신 입력해 검사한 것처럼 만들지 않고, 두 사주에서 읽히는 관계의 특징까지만 풀어요.
            </li>
            <li>
              <span className="font-semibold text-ink">리포트 궁합</span> — 두 사람이 각자 분석한 결과를 서로 동의한 뒤에만 연결하는 방식이에요. 더 정확해진다는 뜻이 아니라, 사주에 각자가 직접 답한 내용이 더해져 풀이의 재료가 늘어난다는 뜻이에요. 문항별 답변이나 개인 리포트 전체는 상대에게 자동으로 보이지 않아요.
            </li>
            <li>궁합 결과는 총점 하나가 아니라 영역별 풀이로 준비하고 있어요. 관계가 이어질 확률은 계산하지 않아요.</li>
          </ul>
        </details>
      </div>
    </section>
  );
}
