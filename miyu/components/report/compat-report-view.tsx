import { ChevronIcon, InfoIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/source-badge";
import { headingOf, neutralWording, parseRelationship, RELATIONSHIP_LABEL, relationLensOf, showsCoupleType } from "@/lib/compat/relationship";
import { COMPAT_STEP_GROUPS, type CompatStepGroupId } from "@/lib/report/compat/plan";
import type { CompatReport, PairReport } from "@/lib/report/compat/types";

/** 글을 쓴 곳의 표시 — 모의 작성기 · 시험용 대리 작성기만 "실제 서비스 AI가 아니다"라고 밝히고, 실제 AI가 쓴 글에는 붙이지 않는다 */
export function writerLabelOf(provider: string): string | null {
  if (provider === "mock") return "모의 작성기";
  if (provider === "proxy-writer") return "대리 작성기(실제 서비스 AI 아님)";
  return null;
}

/** 행동 묶음 이름 — 실제 이름이 있으면 이름으로 쓴다("A님이 B님에게 해 볼 행동" → "슬기 님이 남수 님에게 해 볼 행동"). 리포트 궁합은 저장된 글이 "A님 · B님"이라 그대로 쓴다 */
function stepLabel(id: CompatStepGroupId, names: { a: string; b: string } | null): string {
  if (id === "together") return "함께 조율할 방법";
  const from = id === "aToB" ? "A" : "B";
  const to = id === "aToB" ? "B" : "A";
  return names ? `${id === "aToB" ? names.a : names.b} 님이 ${id === "aToB" ? names.b : names.a} 님에게 해 볼 행동` : `${from}님이 ${to}님에게 해 볼 행동`;
}

/** 리포트 궁합에서 이 묶음이 누구 몫인지 — 읽는 사람이 누구인지 알 때만 "내 실천 · 상대 실천" 표시를 붙인다 */
function stepOwner(id: CompatStepGroupId, viewer: "a" | "b" | null | undefined): "mine" | "theirs" | null {
  if (!viewer || id === "together") return null;
  const owner = id === "aToB" ? "a" : "b";
  return owner === viewer ? "mine" : "theirs";
}

/**
 * 사주 궁합 리포트(유료 · 아직 판매하지 않음) 화면 — 위쪽의 커플 유형 · 궁합 지수 · 핵심 한 줄은 무료 간단 궁합과 같은 엔진 결과(코드가 채움)이고, 아래 풀이(7개 대주제 — 사주 궁합은 6번을 뺀 여섯 장)와 추천 질문만 AI가 쓴 본문이다.
 * 지금은 개발용 화면(/dev/compat)에서만 쓴다. 모의 작성기의 자리 표시 글(report.placeholder)이면 그렇다고 표시한다.
 */
export function CompatReportView({ report, viewer }: { report: CompatReport | PairReport; viewer?: "a" | "b" | null }) {
  const s = report.summary;
  // 구매자가 알려 준 사이 — 이 기능 이전에 만든 글에는 없다(그 글은 예전 모양 그대로, 특정 관계로 채우지 않는다)
  const rel = parseRelationship(report.relationship);
  const showType = showsCoupleType(rel);
  const pair = report.kind === "compat-pair-v1" ? report : null;
  const names = report.kind === "compat-saju-v1" ? report.names : null;
  // 리포트 궁합: 읽는 사람의 실천 묶음을 먼저 보인다(두 사람이 같은 글을 보지만 각자 먼저 읽을 곳이 다르다)
  const groups = pair && viewer ? [...COMPAT_STEP_GROUPS].sort((x, y) => Number(stepOwner(y.id, viewer) === "mine") - Number(stepOwner(x.id, viewer) === "mine")) : COMPAT_STEP_GROUPS;
  return (
    <article aria-label={pair ? "리포트 궁합 풀이" : "사주 궁합 풀이"} className="space-y-5">
      {report.placeholder && (
        <p role="note" className="rounded-xl bg-caution-soft px-4 py-3 text-[14px] leading-[1.7] text-caution">
          모의 작성기의 자리 표시 글이에요. 실제 풀이가 아니고 판매할 수 없는 글이에요.
        </p>
      )}

      <div className="rounded-2xl bg-canvas p-6 text-center shadow-soft md:p-8">
        <p className="text-[14px] font-medium text-ink-3">{names ? `${names.a} × ${names.b}` : "A님 × B님"}</p>
        {pair && viewer && <p className="mt-1 text-[13px] text-ink-3">이 글에서 {viewer === "a" ? "A님은 나, B님은 상대" : "B님은 나, A님은 상대"}예요.</p>}
        {rel && <p className="mx-auto mt-2 w-fit rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold text-accent-strong">{RELATIONSHIP_LABEL[rel]} 사이로 읽었어요</p>}
        <h2 className="mt-2 text-[26px] leading-tight font-bold tracking-tight break-keep text-accent-strong md:text-[32px]">{rel ? headingOf(rel, s.typeName) : s.typeName}</h2>
        <p className="mx-auto mt-3 max-w-[30rem] text-[16px] leading-[1.65] text-ink">{showType ? s.typeLine : relationLensOf(rel!)}</p>
        <div className="mt-5 border-t border-line pt-5">
          <p className="text-[13px] font-semibold text-ink-3">궁합 지수</p>
          <p className="mt-1 text-[48px] leading-none font-bold tracking-tight text-ink tabular-nums" aria-label={`궁합 지수 ${s.score}`}>
            {s.score}
          </p>
          <p className="mx-auto mt-3 max-w-[30rem] text-[14px] leading-[1.7] text-ink-2">{s.scoreMeaning}</p>
          <p className="mx-auto mt-2 max-w-[30rem] text-[13px] leading-[1.7] text-ink-3">{s.scoreNotProbability}</p>
        </div>
        {showType && (
          <p className="mx-auto mt-5 max-w-[30rem] rounded-xl bg-accent-soft px-4 py-3 text-[15px] leading-[1.65] font-semibold text-accent-strong">
            <span className="block text-[13px] font-semibold text-accent">우리 커플 핵심</span>
            {s.core}
          </p>
        )}
      </div>

      <div className="px-1">
        <p className="text-[13px] font-semibold text-accent">{pair ? "리포트 궁합 풀이" : "사주 궁합 풀이"}</p>
        <h2 className="mt-1 text-[22px] leading-snug font-bold tracking-tight md:text-[26px]">{report.headline}</h2>
      </div>

      {pair && (
        <p className="rounded-xl bg-canvas px-4 py-3 text-[14px] leading-[1.7] text-ink-2 shadow-soft">
          <span className="block text-[13px] font-semibold text-accent">두 사람의 응답에서 비교한 영역</span>
          {pair.response.comparedLabels.length > 0 ? pair.response.comparedLabels.join(" · ") : "두 사람이 모두 뚜렷하게 답한 영역이 없어 이번에는 비교하지 않았어요."}
        </p>
      )}

      {report.sections.map((sec, i) => (
        <section key={sec.id} aria-labelledby={`compat-sec-${sec.id}`} className="rounded-2xl bg-canvas p-5 shadow-soft md:p-6">
          <p className="text-[13px] font-semibold text-accent">
            {i + 1}. {sec.topic}
          </p>
          <h3 id={`compat-sec-${sec.id}`} className="mt-1 text-[18px] leading-snug font-bold">
            {sec.headline}
          </h3>
          <div className="mt-3 space-y-3 text-[16px] leading-[1.75] text-ink-2">
            {sec.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="compat-steps" className="rounded-2xl bg-canvas p-5 shadow-soft md:p-6">
        <h3 id="compat-steps" className="text-[18px] font-bold">
          두 분이 해 볼 수 있는 것
        </h3>
        <div className="mt-3 space-y-5">
          {groups.map((g) => (
            <div key={g.id}>
              <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-accent">
                {stepLabel(g.id, names)}
                {stepOwner(g.id, pair ? viewer : null) === "mine" && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] text-accent-strong">내가 해 볼 행동</span>}
                {stepOwner(g.id, pair ? viewer : null) === "theirs" && <span className="rounded-full bg-mist px-2 py-0.5 text-[12px] text-ink-3">상대가 해 볼 행동</span>}
              </p>
              <ul className="mt-2 space-y-4">
                {report.steps[g.id].map((a) => (
                  <li key={a.title}>
                    <p className="text-[16px] font-semibold">{a.title}</p>
                    <p className="mt-1 text-[15px] leading-[1.75] text-ink-2">{a.detail}</p>
                    <p className="mt-2 rounded-xl bg-accent-soft px-3 py-2 text-[15px] leading-[1.65] text-accent-strong">
                      <span className="block text-[12px] font-semibold text-accent">건네 볼 수 있는 말</span>“{a.say}”
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {report.questions && report.questions.length > 0 && (
          <div className="mt-5 border-t border-line pt-5">
            <p className="text-[13px] font-semibold text-accent">서로에게 물어보면 좋은 질문</p>
            <ul className="mt-2 space-y-2 text-[15px] leading-[1.7] text-ink-2">
              {report.questions.map((q) => (
                <li key={q} className="rounded-xl bg-accent-soft px-3 py-2 text-accent-strong">
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="rounded-2xl bg-canvas p-5 shadow-soft md:p-6">
        {report.notes.cautions.map((c) => (
          <p key={c} className="mb-3 flex gap-2 text-[13px] leading-[1.7] text-ink-3">
            <InfoIcon className="mt-1 size-4 shrink-0" />
            <span>{c}</span>
          </p>
        ))}
        <ul className="space-y-1.5 text-[13px] leading-[1.7] text-ink-3">
          {report.notes.items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <details className="group mt-4 border-y border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[15px] font-semibold hover:text-accent [&::-webkit-details-marker]:hidden">
            궁합 지수는 이렇게 계산했어요
            <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
          </summary>
          <div className="pb-4 text-[14px] leading-[1.75] text-ink-2">
            <p>{neutralWording(s.scoreBasis, rel)}</p>
            {s.parts.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {s.parts.map((b) => (
                  <li key={b.label}>
                    <span className="font-semibold text-ink">{neutralWording(b.label, rel)}</span> — {b.direction}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
        <p className="mt-4 text-[12px] leading-[1.7] text-ink-3">{report.notes.page}</p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          {writerLabelOf(report.generated.provider) && <StatusBadge>{writerLabelOf(report.generated.provider)}</StatusBadge>}
          <span>
            규칙 {report.ruleVersion} · 지시문 {report.promptVersion}
          </span>
        </p>
      </div>
    </article>
  );
}
