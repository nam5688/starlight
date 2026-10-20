import { StatusBadge } from "@/components/ui/source-badge";
import { PERSONAL_TYPE, REPORT_BASIS } from "@/lib/config/product";
import { ChevronIcon } from "@/components/ui/icons";
import type { FreePreview } from "@/lib/report/preview";
import { SajuChart } from "./detail-sections";
import { Prose } from "./reading-parts";
import { AxisBar } from "./score-bar";
import { SectionTitle } from "./summary-blocks";

/**
 * 무료 리포트 본문(운영자 방향 2026-10-16) — 공개 범위의 내용을 한 사람의 풀이로 이어서 끝까지 보여 준다.
 * ① 핵심 문장(대표 경향) → ② 내 성향과 지나온 모습 → ③ 일과 가까운 관계 → ④ 지금 필요한 한 가지 → ⑤ 원국 · 분석 근거(접힘).
 * 개인 유형(PERSONAL_TYPE)이 켜져 있으면 유형 이름 · 한 줄은 이 화면을 쓰는 페이지 맨 위의 IdentityCard가 보이고, ①의 옛 대표 경향 이름(4개 후보)은 보이지 않는다 — 두 이름이 한 화면에 겹치지 않는다.
 * 풀이 중간에 자물쇠 · "답은 구매 후" · 질문만 늘어놓는 구매 예고를 두지 않는다 — 구매 안내는 이 화면을 쓰는 페이지가 아래 한곳에서 한다.
 * 공개 범위는 그대로다(잠긴 내용은 서버가 만들지 않고, 이 화면에 보이지 않는 것을 새로 공개하지도 않는다).
 */
export function FreePreviewBody({ preview, idPrefix }: { preview: FreePreview; idPrefix: string }) {
  const id = (name: string) => `${idPrefix}${name}`;
  const { tendency, lead, core, saju, situations, action } = preview;
  const openSituations = situations.filter((s) => s.strengthLabel && s.cautionLabel);

  return (
    <div className="space-y-12">
      {/* ① 핵심 문장 — 대표 경향의 이름과 한 줄 요약은 가리지 않고 완성된 문장으로 (개인 유형이 꺼져 있을 때의 옛 후보 이름. 켜져 있으면 맨 위 IdentityCard가 유형을 보인다) */}
      {!PERSONAL_TYPE.visible ? (
        <section aria-labelledby={id("tendency")}>
          <h2 id={id("tendency")} className="scroll-mt-[44px] text-[13px] font-semibold text-accent md:scroll-mt-[52px]">
            대표 경향
          </h2>
          <p className="mt-1 text-[26px] leading-tight font-bold tracking-tight md:text-[32px]">{tendency.name}</p>
          <p className="mt-3 border-l-[3px] border-accent pl-4 text-[18px] font-semibold leading-relaxed md:text-[20px]">{tendency.line}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">후보 유형 · 지금의 응답에서 두드러진 경향이며, 고정된 성격 유형이 아니에요.</p>
        </section>
      ) : (
        <span id={id("tendency")} className="block scroll-mt-[44px] md:scroll-mt-[52px]" />
      )}

      {/* ② 내 성향과 지나온 모습 */}
      <section aria-labelledby={id("self")}>
        <SectionTitle id={id("self")}>내 성향과 지나온 모습</SectionTitle>
        <div className="space-y-8">
          {lead.kind === "insight" && (
            <div>
              <Prose text={lead.text} className="text-[18px] font-semibold leading-relaxed md:text-[20px]" />
              <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{lead.basisNote}</p>
            </div>
          )}

          {saju.status === "ok" ? (
            <div>
              <h3 className="text-[15px] font-semibold text-accent">사주에서 읽으면</h3>
              {/* 생활 말로 옮긴 문장이 앞에 읽히고, 사주 용어로 부르는 이름은 아래 접힌 보조 영역에만 둔다(운영자 승인 2026-10-20) */}
              <Prose text={saju.life.headline.join(" ")} className="mt-2 text-[19px] font-semibold leading-snug" />
              <Prose text={saju.life.dayMaster.lines.join(" ")} className="mt-3 text-[16px] leading-relaxed text-ink-2" />
              {saju.life.everyday && <Prose text={saju.life.everyday.lines.join(" ")} className="mt-4 text-[16px] leading-relaxed" />}
              <details data-fold className="mt-3 text-[13px] leading-relaxed text-ink-3">
                <summary className="inline-flex min-h-8 cursor-pointer items-center font-semibold text-accent">사주 용어로는 이렇게 불러요</summary>
                <div className="mt-1.5 space-y-1.5">
                  <p>
                    나를 나타내는 글자(일간)는 <span className="font-semibold text-ink-2">{saju.dayMaster.label}</span>이고, 전통 해석에서는 <span className="font-semibold text-ink-2">{saju.dayMaster.image}</span>에 비유해요.
                  </p>
                  <p>{saju.life.dayMaster.term}</p>
                  {saju.life.everyday && <p>{saju.life.everyday.term}</p>}
                  <p>{saju.headline}</p>
                </div>
              </details>
            </div>
          ) : (
            <p className="flex flex-wrap items-center gap-2 text-[16px] text-ink-2">
              {saju.message}
              <StatusBadge>입력 확인</StatusBadge>
            </p>
          )}

          {core.shown.length > 0 && (
            <dl className="border-t border-ink">
              {core.shown.map((r) => (
                <div key={r.label} className="grid gap-1 border-b border-line px-1 py-4 md:grid-cols-[200px_minmax(0,1fr)] md:gap-6">
                  <dt className="text-[14px] font-semibold text-ink-2">{r.label}</dt>
                  <dd className="text-[16px] leading-relaxed">
                    <Prose as="div" text={r.text} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {/* ③ 일과 가까운 관계 */}
      {(openSituations.length > 0 || (saju.status === "ok" && saju.relation)) && (
        <section aria-labelledby={id("situations")}>
          <SectionTitle id={id("situations")}>일과 가까운 관계에서는</SectionTitle>
          <div className="space-y-8">
            {openSituations.length > 0 && (
              <table className="w-full table-fixed border-collapse text-left">
                <thead>
                  <tr className="border-y border-ink text-[13px] text-ink-3">
                    <th scope="col" className="w-[28%] py-2 pr-2 font-medium">
                      상황
                    </th>
                    <th scope="col" className="w-[36%] py-2 pr-2 font-medium">
                      잘하는 점
                    </th>
                    <th scope="col" className="w-[36%] py-2 font-medium">
                      주의할 점
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {openSituations.map((s) => (
                    <tr key={s.title} className="border-b border-line align-top">
                      <th scope="row" className="py-3.5 pr-2 text-[14px] font-semibold leading-snug text-ink-2">
                        {s.title}
                      </th>
                      <td className="py-3.5 pr-2 text-[14px] leading-snug">{s.strengthLabel}</td>
                      <td className="py-3.5 text-[14px] leading-snug">{s.cautionLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {saju.status === "ok" && saju.relation && (
              <div>
                <h3 className="text-[15px] font-semibold text-ink-2">가까운 관계에서는 이렇게 나타날 수 있어요</h3>
                <Prose text={(saju.life.relation?.lines ?? [`${saju.relation.lead} — ${saju.relation.text}`]).join(" ")} className="mt-2 text-[16px] leading-relaxed" />
                <p className="mt-2 text-[14px] text-ink-3">전통 해석을 쉬운 말로 옮긴 한 가지이고, 성격을 확정하는 말이 아니에요.</p>
                {saju.life.relation && (
                  <details data-fold className="mt-2 text-[13px] leading-relaxed text-ink-3">
                    <summary className="inline-flex min-h-8 cursor-pointer items-center font-semibold text-accent">사주 용어로는 이렇게 불러요</summary>
                    <p className="mt-1.5">{saju.life.relation.term}</p>
                  </details>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ④ 지금 필요한 한 가지 */}
      {action.shown && (
        <section aria-labelledby={id("actions")}>
          <SectionTitle id={id("actions")}>지금 나에게 필요한 한 가지</SectionTitle>
          <p className="text-[18px] font-semibold leading-snug md:text-[20px]">{action.shown.title}</p>
          <Prose text={action.shown.detail} className="mt-2 text-[16px] leading-relaxed text-ink-2" />
        </section>
      )}

      {/* ⑤ 원국 · 분석 근거 — 펼쳐 보기. 분석 근거 화면 노출 스위치(lib/config/product.ts)가 꺼져 있으면 "내 사주 원국"(계산 결과 표)만 남기고
          오행 해설 · 응답 환산 막대 · 분석에 사용한 정보는 그리지 않는다 */}
      {(REPORT_BASIS.visible || saju.status === "ok") && (
        <section aria-labelledby={id("basis")}>
          <h2 id={id("basis")} className="sr-only">
            {REPORT_BASIS.visible ? "원국 · 분석 근거" : "내 사주 원국"}
          </h2>
          <details data-fold className="group min-w-0 rounded-lg border border-line-strong bg-canvas">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{REPORT_BASIS.visible ? "원국 · 분석 근거 보기" : "내 사주 원국 보기"}</span>
                <span className="mt-0.5 block text-[13px] leading-[1.5] text-ink-3">{REPORT_BASIS.visible ? "사주 원국 표 · 오행 설명 · 평소 행동 방식 · 분석에 사용한 정보" : "태어난 날짜와 시간으로 계산한 여덟 글자"}</span>
              </span>
              <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-10 border-t border-line px-4 py-5">
              {saju.status === "ok" && (
                <>
                  <div>
                    <h3 className="text-[15px] font-semibold text-ink-2">사주 원국</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-3">태어난 날짜와 시간으로 만세력에서 계산한 결과예요.</p>
                    <div className="mt-4">
                      <SajuChart saju={saju.section} showGlossary />
                    </div>
                    {!REPORT_BASIS.visible &&
                      saju.notes.map((n) => (
                        <p key={n} className="mt-2 text-[13px] leading-relaxed text-ink-3">
                          {n}
                        </p>
                      ))}
                  </div>
                  {REPORT_BASIS.visible && (
                    <div>
                      <h3 className="text-[15px] font-semibold text-ink-2">오행은 각각 무엇을 뜻하나요</h3>
                      <ul className="mt-2 divide-y divide-line border-y border-line">
                        {saju.elements.map((e) => (
                          <li key={e.element} className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1 py-3.5 sm:grid-cols-[104px_minmax(0,1fr)_72px]">
                            <p className="text-[16px] font-semibold">
                              {e.element}
                              <span className="ml-1 text-[13px] font-normal text-ink-3">
                                {e.hanja} · {e.image}
                              </span>
                            </p>
                            <p className="col-span-1 text-[15px] leading-relaxed text-ink-2 sm:col-span-1">
                              <span className="font-semibold text-ink">{e.keywords}</span>
                              <span className="block text-[14px] text-ink-3">{e.force}</span>
                            </p>
                            <p className={`col-start-2 text-[14px] sm:col-start-3 sm:text-right ${e.level === "many" || e.level === "none" ? "font-semibold text-accent" : "text-ink-3"}`}>
                              {e.count}개 · {e.levelLabel}
                            </p>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[13px] leading-relaxed text-ink-3">개수는 원국의 천간 · 지지 글자 기준이에요 (지장간 제외). 많고 적음은 좋고 나쁨이 아니라 방향의 차이예요.</p>
                    </div>
                  )}
                </>
              )}
              {REPORT_BASIS.visible && (
                <>
                <div>
                  <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-2">
                    <h3 className="text-[15px] font-semibold text-ink-2">평소 행동 방식</h3>
                    <span className="text-[14px] font-semibold text-ink-2">이번 응답</span>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-3">0~100은 응답을 환산한 값이며 백분위나 정확도가 아니에요.</p>
                  <div className="divide-y divide-line">
                    {preview.mbti.axes.map((r) => (
                      <AxisBar key={r.id} row={r} />
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-ink-2">분석에 사용한 정보</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                    {preview.basis.scenes
                      ? `상황형 질문 ${preview.basis.scenes}장면 (개발용 예시 문항)`
                      : `평소 행동 방식 문항 ${preview.basis.mbtiItems}개 · 기질 문항 ${preview.basis.temperamentItems}개 · 관계(애착) 문항 ${preview.basis.relationshipItems}개 (모두 개발용 예시 문항)`}
                    {saju.status === "ok" && saju.chartLine && <> · 사주 {saju.chartLine}</>}
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-3">사주와 심리검사 점수는 합산하지 않고 각각 따로 계산해요.</p>
                  {saju.status === "ok" &&
                    saju.notes.map((n) => (
                      <p key={n} className="mt-2 text-[13px] leading-relaxed text-ink-3">
                        {n}
                      </p>
                    ))}
                </div>

                </>
              )}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
