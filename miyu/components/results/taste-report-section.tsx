import Link from "next/link";
import { SectionTitle } from "@/components/report/summary-blocks";
import { LockIcon } from "@/components/ui/icons";
import { formatKrw, PERSONAL_REPORT } from "@/lib/config/product";
import { TASTE_PLAN } from "@/lib/report/taste/plan";
import type { TasteLockedItem } from "@/lib/report/taste/locked";
import type { TasteViewState } from "@/lib/services/taste-service";
import { TasteReportButton } from "./taste-report-button";

/**
 * 내 맛보기 리포트(무료 · 로그인한 회원 · 한 계정당 1번) — 사주아이처럼 눈길을 끄는 한 줄 제목 아래에 사주와 응답을 엮은 풀이를 보여 주되, 절반쯤만 공개하고 핵심은 심층 리포트에서 풀린다.
 * state: 받기 전(none) · 쓰는 중(pending) · 받음(ready) · 다른 결과에서 받음(used-elsewhere) · 준비 중(unavailable — 표(DB 변경 17번)가 없거나 AI가 연결되지 않았다).
 * connected: 맛보기 리포트를 쓰는 AI가 연결돼 있는가.
 */
export function TasteReportSection({ id, assessmentId, state, connected, locked }: { id: string; assessmentId: string; state: TasteViewState; connected: boolean; locked: TasteLockedItem[] }) {
  const note = "사주와 내가 고른 응답을 함께 엮어 AI가 써 드려요. 로그인한 회원은 한 계정에 한 번 무료로 받을 수 있어요.";

  if (state.kind === "ready") {
    const { report } = state;
    return (
      <section id={id} aria-labelledby={`${id}-title`} className="mx-auto w-full max-w-[720px] px-5 pt-8">
        <SectionTitle id={`${id}-title`} note="사주와 내가 고른 응답을 엮어 쓴 글이에요. 전통 해석과 응답에서 읽은 경향이며 성격을 확정하는 말이 아니에요.">
          내 맛보기 리포트
        </SectionTitle>
        <p className="text-[22px] leading-snug font-bold tracking-tight md:text-[26px]">{report.headline}</p>
        <div className="mt-6 space-y-8">
          {report.sections.map((s) => (
            <article key={s.id}>
              <p className="text-[13px] font-semibold text-accent">{TASTE_PLAN.sections[s.id].label}</p>
              <h3 className="mt-1 text-[18px] leading-snug font-bold">{s.title}</h3>
              <p className="mt-2 text-[16px] leading-[1.75] text-ink-2">{s.body}</p>
            </article>
          ))}
        </div>
        {locked.length > 0 && (
          <div className="mt-10">
            <h3 className="text-[16px] leading-snug font-bold">여기서부터는 심층 리포트에서 이어져요</h3>
            <p className="mt-1 text-[14px] leading-[1.65] text-ink-3">맛보기는 풀이의 절반쯤이에요. 아래 이야기는 구매한 리포트에 실제로 들어 있어요.</p>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {locked.map((l) => (
                <li key={l.title} className="flex items-start gap-2.5 bg-mist/60 px-1 py-3.5">
                  <LockIcon className="mt-1 size-3.5 shrink-0 text-ink-3" />
                  <div>
                    <p className="text-[16px] font-semibold leading-snug">{l.title}</p>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-ink-3">{l.question}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4">
              <Link href="#r-purchase" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
                심층 리포트로 이어 보기 · {formatKrw(PERSONAL_REPORT.priceKrw)}
              </Link>
            </p>
          </div>
        )}
      </section>
    );
  }

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mx-auto w-full max-w-[720px] px-5 pt-8">
      <SectionTitle id={`${id}-title`} note={note}>
        내 맛보기 리포트
      </SectionTitle>
      {state.kind === "unavailable" || !connected ? (
        <p className="text-[15px] leading-[1.65] text-ink-3">맛보기 리포트는 아직 준비 중이에요.</p>
      ) : state.kind === "used-elsewhere" ? (
        <p className="text-[15px] leading-[1.65] text-ink-3">맛보기 리포트는 한 계정에 한 번만 받을 수 있어요. 다른 결과에서 이미 받으셨어요.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-[16px] leading-[1.7] text-ink-2">내 응답과 사주를 함께 읽어, 나는 어떤 사람인지 · 연애에서는 어떤지 · 일하고 공부할 때와 마음이 흔들릴 때는 어떤지를 한 줄 제목과 함께 풀어 드려요.</p>
          {state.kind === "pending" && <p className="text-[14px] leading-relaxed text-ink-3">다른 화면에서 쓰는 중일 수 있어요. 잠시 뒤에도 안 보이면 다시 눌러 주세요.</p>}
          <TasteReportButton assessmentId={assessmentId} />
        </div>
      )}
    </section>
  );
}
