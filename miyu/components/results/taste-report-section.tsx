import { SectionTitle } from "@/components/report/summary-blocks";
import { tasteSectionLabel } from "@/lib/report/taste/plan";
import type { TasteViewState } from "@/lib/services/taste-service";
import { TasteReportButton } from "./taste-report-button";

/**
 * 내 맛보기 리포트(무료 · 로그인한 회원 · 한 계정당 1번) — 사주를 읽고 이 사람에게 어떻게 나타나는지 풀어 준 완결된 짧은 풀이(운영자 2026-10-16).
 * 풀이 안에 자물쇠 · "구매 후" 예고 · 질문만 늘어놓는 목록을 두지 않는다 — 구매 안내는 화면 아래 한곳(PurchasePanel)이다.
 * state: 받기 전(none) · 쓰는 중(pending) · 받음(ready) · 다른 결과에서 받음(used-elsewhere) · 준비 중(unavailable — 표(DB 변경 17번)가 없거나 AI가 연결되지 않았다).
 * connected: 맛보기 리포트를 쓰는 AI가 연결돼 있는가.
 */
export function TasteReportSection({ id, assessmentId, state, connected }: { id: string; assessmentId: string; state: TasteViewState; connected: boolean }) {
  const note = "사주와 내가 고른 응답을 함께 엮어 AI가 써 드려요. 로그인한 회원은 한 계정에 한 번 무료로 받을 수 있어요.";

  if (state.kind === "ready") {
    const { report } = state;
    return (
      <section id={id} aria-labelledby={`${id}-title`} className="mx-auto w-full max-w-[720px] px-5 pt-8">
        <SectionTitle id={`${id}-title`} note="사주를 읽고, 내가 고른 응답으로 이 사람에게 어떻게 나타나는지 풀었어요. 전통 해석과 응답에서 읽은 경향이며 성격을 확정하는 말이 아니에요.">
          내 맛보기 리포트
        </SectionTitle>
        <p className="text-[22px] leading-snug font-bold tracking-tight md:text-[26px]">{report.headline}</p>
        <div className="mt-6 space-y-8">
          {report.sections.map((s) => (
            <article key={s.id}>
              <p className="text-[13px] font-semibold text-accent">{tasteSectionLabel(s.id, report.version)}</p>
              <h3 className="mt-1 text-[18px] leading-snug font-bold">{s.title}</h3>
              <p className="mt-2 text-[16px] leading-[1.75] text-ink-2">{s.body}</p>
            </article>
          ))}
        </div>
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
          <p className="text-[16px] leading-[1.7] text-ink-2">사주를 읽고 내 응답을 더해, 나는 어떤 사람인지 · 일에서는 어떤지 · 가까운 관계에서는 어떤지 · 지금 필요한 한 가지는 무엇인지를 한 줄 제목과 함께 풀어 드려요.</p>
          {state.kind === "pending" && <p className="text-[14px] leading-relaxed text-ink-3">다른 화면에서 쓰는 중일 수 있어요. 잠시 뒤에도 안 보이면 다시 눌러 주세요.</p>}
          <TasteReportButton assessmentId={assessmentId} />
        </div>
      )}
    </section>
  );
}
