import Link from "next/link";
import { LockIcon } from "@/components/ui/icons";
import { formatKrw, PERSONAL_REPORT } from "@/lib/config/product";
import { StatusBadge } from "@/components/ui/source-badge";
import type { FreePreview } from "@/lib/report/preview";
import { SajuChart } from "./detail-sections";
import { LockedMask, LockedText, LockTag } from "./locked";
import { AxisBar } from "./score-bar";
import { SectionTitle } from "./summary-blocks";

const cta = "inline-flex items-center gap-1.5 text-[14px] font-semibold text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent";

/**
 * 무료 미리보기 본문. 공개 범위만 보여 주고, 잠긴 자리는 "무엇이 있는지"만 알려 준다.
 * ctaHref: 잠긴 자리에서 "전체 보기"로 이동할 곳 (결과 화면은 구매 영역, 검사 직후 화면은 저장 영역)
 */
export function FreePreviewBody({ preview, idPrefix, ctaHref, ctaLabel }: { preview: FreePreview; idPrefix: string; ctaHref: string; ctaLabel?: string }) {
  const id = (name: string) => `${idPrefix}${name}`;
  const { tendency, lead, core, saju, questions, situations, action } = preview;
  // 실제로 제공하는 내용만 약속한다 — 어울리는 관계 조건이 있는 결과에서만 그 문구를 쓴다
  const hasPartner = preview.answers.some((a) => a.id === "partner");
  const primaryLabel = ctaLabel ?? (hasPartner ? "내 관계 패턴과 잘 맞는 상대 확인하기" : "구매하고 전체 보기");

  return (
    <div className="space-y-16">
      {/* 1. 대표 경향 — 이름 앞부분만 */}
      <section aria-labelledby={id("tendency")}>
        <h2 id={id("tendency")} className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-accent">
          대표 경향 <LockTag>이름 전체는 구매 후</LockTag>
        </h2>
        <p className="mt-1 text-[32px] font-bold leading-tight tracking-tight md:text-[38px]">
          <span aria-label={`${tendency.head}로 시작하는 유형`}>{tendency.head}</span>
          <LockedMask chars={2} />
          {tendency.tail}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">후보 유형 · 지금의 응답에서 두드러진 경향이며, 고정된 성격 유형이 아닙니다.</p>
        {lead.kind === "insight" ? (
          <>
            <h3 className="mt-8 text-[15px] font-semibold text-ink-2">내 응답에서 읽은 것</h3>
            <p className="mt-2 border-l-[3px] border-accent pl-4 text-[18px] font-semibold leading-relaxed md:text-[20px]">{lead.text}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{lead.basisNote}</p>
          </>
        ) : (
          <>
            <h3 className="mt-8 text-[15px] font-semibold text-ink-2">한 줄 요약</h3>
            <p className="mt-2 border-l-[3px] border-accent pl-4 text-[19px] font-semibold leading-snug md:text-[21px]">
              {lead.shown} <LockedText chars={16} />
            </p>
          </>
        )}
      </section>

      {/* 2. 핵심 요약 — 4개 중 2개 */}
      <section aria-labelledby={id("core")}>
        <SectionTitle id={id("core")} note="4가지 중 2가지를 보여 드립니다.">
          핵심 요약
        </SectionTitle>
        <dl className="border-t border-ink">
          {core.shown.map((r) => (
            <div key={r.label} className="grid gap-1 border-b border-line px-1 py-4 md:grid-cols-[200px_minmax(0,1fr)] md:gap-6">
              <dt className="text-[14px] font-semibold text-ink-2">{r.label}</dt>
              <dd className="text-[16px] leading-relaxed">{r.text}</dd>
            </div>
          ))}
          {core.locked.map((r) => (
            <div key={r.label} className="grid gap-1 border-b border-line bg-mist/60 px-1 py-4 md:grid-cols-[200px_minmax(0,1fr)] md:gap-6">
              <dt className="flex items-center gap-1.5 text-[14px] font-semibold text-ink-2">
                <LockIcon className="size-3.5 text-ink-3" />
                {r.label}
              </dt>
              <dd className="text-[16px] leading-relaxed">
                <span className="font-semibold">{r.question}</span>
                <span className="mt-0.5 block text-[14px] text-ink-3">답은 구매 후 리포트에 있습니다.</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3">
          <Link href={ctaHref} className={cta}>
            나머지 2가지 보기
          </Link>
        </p>
      </section>

      {/* 3. 사주 — 표 + 오행 뜻 + 쉬운 풀이 */}
      <section aria-labelledby={id("saju")}>
        <SectionTitle id={id("saju")} note="태어난 날짜와 시간으로 만세력에서 계산한 결과입니다.">
          사주 원국
        </SectionTitle>
        {saju.status === "ok" ? (
          <div className="space-y-8">
            <SajuChart saju={saju.section} showGlossary />
            <div>
              <h3 className="text-[15px] font-semibold text-accent">한 줄로 읽으면</h3>
              <p className="mt-2 text-[19px] font-semibold leading-snug">{saju.headline}</p>
              <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
                나를 나타내는 글자(일간)는 <span className="font-semibold text-ink">{saju.dayMaster.label}</span>이고, 전통 해석에서는 <span className="font-semibold text-ink">{saju.dayMaster.image}</span>에
                비유합니다. {saju.dayMaster.trait}
              </p>
            </div>

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
              <p className="mt-2 text-[13px] leading-relaxed text-ink-3">개수는 원국의 천간 · 지지 글자 기준입니다 (지장간 제외). 많고 적음은 좋고 나쁨이 아니라 방향의 차이입니다.</p>
            </div>

            <div>
              <h3 className="text-[15px] font-semibold text-ink-2">일상에서는 이렇게 나타날 수 있어요</h3>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {saju.everyday.shown && <li className="py-3.5 text-[16px] leading-relaxed">{saju.everyday.shown}</li>}
                {saju.everyday.lockedCount > 0 && (
                  <li className="flex items-start gap-2 bg-mist/60 py-3.5 text-[15px] leading-relaxed text-ink-2">
                    <LockIcon className="mt-1 size-3.5 shrink-0 text-ink-3" />
                    <span>이 밖에 내 원국의 기운이 일상에서 나타나는 모습 {saju.everyday.lockedCount}가지가 더 있습니다.</span>
                  </li>
                )}
              </ul>
              <p className="mt-2 text-[14px] text-ink-3">
                일간의 잘하는 점 · 주의할 점과, 각 기운이 관계 · 일 · 선택에서 어떻게 나타나는지는 구매 후 리포트에 있습니다.{" "}
                <Link href={ctaHref} className={cta}>
                  보기
                </Link>
              </p>
            </div>
            {saju.notes.map((n) => (
              <p key={n} className="text-[13px] leading-relaxed text-ink-3">
                {n}
              </p>
            ))}
          </div>
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-[16px] text-ink-2">
            {saju.message}
            <StatusBadge>입력 확인</StatusBadge>
          </p>
        )}
      </section>

      {/* 4. 개인 질문 — 질문은 보이고 답은 잠금 */}
      {(questions.shown.length > 0 || questions.lockedCount > 0) && (
        <section aria-labelledby={id("questions")}>
          <SectionTitle id={id("questions")} note="내 원국에서 나온 질문입니다. 답은 구매 후 쉬운 말로 풀어 드립니다.">
            내 원국이 던지는 질문
          </SectionTitle>
          <ol className="border-t border-ink">
            {questions.shown.map((q, i) => (
              <li key={q} className="border-b border-line py-4">
                <div className="flex gap-3">
                  <span className="w-5 shrink-0 text-[17px] font-bold tabular-nums text-accent">{i + 1}</span>
                  <div>
                    <p className="text-[16px] font-semibold leading-snug">{q}</p>
                    <p className="mt-1.5 flex items-start gap-1.5 text-[14px] leading-relaxed text-ink-3">
                      <LockIcon className="mt-0.5 size-3.5 shrink-0" />
                      <span>답은 구매 후 쉬운 말로 풀어 드립니다.</span>
                    </p>
                  </div>
                </div>
              </li>
            ))}
            {questions.lockedCount > 0 && (
              <li className="flex items-center gap-3 border-b border-line bg-mist/60 py-4 text-[15px] text-ink-2">
                <LockIcon className="size-4 shrink-0 text-ink-3" />
                <span>
                  이 밖에 <span className="font-semibold text-ink">{questions.lockedCount}개의 질문</span>이 더 있습니다.
                </span>
              </li>
            )}
          </ol>
          <p className="mt-3">
            <Link href={ctaHref} className={cta}>
              답 보기
            </Link>
          </p>
        </section>
      )}

      {/* 5. 상황별 잘하는 점 · 주의할 점 */}
      <section aria-labelledby={id("situations")}>
        <SectionTitle id={id("situations")} note="첫 번째 상황의 한 줄만 보여 드립니다. 나머지 상황은 어떤 질문에 답하는지 알려 드리고, 자세한 설명은 구매 후 공개됩니다.">
          상황별 잘하는 점 · 주의할 점
        </SectionTitle>
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
            {situations.map((s) => (
              <tr key={s.title} className="border-b border-line align-top">
                <th scope="row" className="py-3.5 pr-2 text-[14px] font-semibold leading-snug text-ink-2">
                  {s.title}
                </th>
                {s.strengthLabel && s.cautionLabel ? (
                  <>
                    <td className="py-3.5 pr-2 text-[14px] leading-snug">{s.strengthLabel}</td>
                    <td className="py-3.5 text-[14px] leading-snug">{s.cautionLabel}</td>
                  </>
                ) : (
                  <td colSpan={2} className="py-3.5 text-[14px] leading-snug">
                    <span className="flex items-start gap-1.5">
                      <LockIcon className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                      <span>{s.question}</span>
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3">
          <Link href={ctaHref} className={cta}>
            5가지 상황 모두 보기
          </Link>
        </p>
      </section>

      {/* 6. 기질 · 관계(애착) — 잠금 / MBTI — 공개 */}
      <section aria-labelledby={id("scores")}>
        <SectionTitle id={id("scores")} note="0~100은 응답을 환산한 값이며 백분위나 정확도가 아닙니다.">
          항목별 점수
        </SectionTitle>
        <div className="space-y-10">
          {preview.scoreQuestions.map(({ title, question }) => (
            <div key={title}>
              <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-2">
                <h3 className="text-[17px] font-bold">{title}</h3>
                <LockTag />
              </div>
              <p className="pt-4 text-[16px] font-semibold leading-relaxed">{question}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-ink-3">
                {title === "기질" ? "새로움 추구 · 신중함 · 타인 반응 민감도 · 지속성" : "관계 불안 · 거리 두기"}의 점수와 그 의미를 구매 후 리포트에서 보여 드립니다.
              </p>
            </div>
          ))}
          <div>
            <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-2">
              <h3 className="text-[17px] font-bold">MBTI 성향</h3>
              <span className="text-[14px] font-semibold text-ink-2">이번 응답 {preview.mbti.code}</span>
            </div>
            <div className="divide-y divide-line">
              {preview.mbti.axes.map((r) => (
                <AxisBar key={r.id} row={r} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 7. 실천 제안 — 3개 중 1개 */}
      <section aria-labelledby={id("actions")}>
        <SectionTitle id={id("actions")} note="3가지 중 1가지를 보여 드립니다.">
          바로 해볼 실천 제안
        </SectionTitle>
        <ol className="border-t border-ink">
          {action.shown && (
            <li className="flex gap-4 border-b border-line py-4">
              <span className="w-6 shrink-0 text-[17px] font-bold tabular-nums text-accent">1</span>
              <div>
                <p className="text-[16px] font-semibold leading-snug">{action.shown.title}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{action.shown.detail}</p>
              </div>
            </li>
          )}
          {action.lockedCount > 0 && (
            <li className="flex gap-4 border-b border-line bg-mist/60 py-4">
              <span className="w-6 shrink-0 text-[17px] font-bold tabular-nums text-ink-3">2~{action.lockedCount + 1}</span>
              <p className="flex items-start gap-1.5 text-[15px] leading-relaxed text-ink-2">
                <LockIcon className="mt-1 size-3.5 shrink-0 text-ink-3" />
                <span>나머지 {action.lockedCount}가지는 상황별로 바로 써 보는 방법과 함께 구매 후 공개됩니다.</span>
              </p>
            </li>
          )}
        </ol>
      </section>

      {/* 8. 구매하면 답해 드리는 질문 + 구매 안내 */}
      <section aria-labelledby={id("locked")}>
        <SectionTitle id={id("locked")} note="구매한 리포트에는 아래 질문에 대한 답이 실제로 들어 있습니다. 샘플 리포트에서 가상 인물의 완성된 문단을 먼저 읽어 볼 수 있습니다.">
          구매하면 답해 드리는 질문
        </SectionTitle>
        <ul className="divide-y divide-line border-y border-line">
          {preview.answers.map((a) => (
            <li key={a.id} className="flex items-start gap-3 py-3.5">
              <LockIcon className="mt-1 size-4 shrink-0 text-ink-3" />
              <div>
                <p className="text-[16px] font-semibold leading-snug">{a.question}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">리포트의 “{a.where}”에서 답합니다</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-col gap-2">
          <Link href={ctaHref} className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 py-2 text-center text-[16px] font-semibold text-white hover:bg-accent-strong sm:self-start">
            {primaryLabel}
          </Link>
          <p className="text-[14px] leading-relaxed text-ink-2">
            {PERSONAL_REPORT.name} · <span className="font-semibold tabular-nums text-ink">{formatKrw(PERSONAL_REPORT.priceKrw)}</span> ·{" "}
            <Link href={ctaHref} className={cta}>
              포함 내용 보기
            </Link>{" "}
            ·{" "}
            <Link href="/report/sample" className={cta}>
              샘플 리포트 읽어 보기
            </Link>
          </p>
          <p className="text-[13px] leading-relaxed text-ink-3">
            {hasPartner ? "상대의 나이 · 직업 · 만나는 날짜를 맞히는 서비스가 아닙니다. 나에게 편안한 관계의 조건과 확인해 볼 행동을 알려 드립니다." : "점이나 사건을 맞히는 서비스가 아닙니다."}
          </p>
        </div>
      </section>

      <section aria-labelledby={id("status")}>
        <SectionTitle id={id("status")} note="사주와 심리검사 점수는 합산하지 않고 각각 따로 계산합니다.">
          분석에 사용한 정보
        </SectionTitle>
        <p className="text-[15px] leading-relaxed text-ink-2">
          MBTI 성향 문항 {preview.basis.mbtiItems}개 · 기질 문항 {preview.basis.temperamentItems}개 · 관계(애착) 문항 {preview.basis.relationshipItems}개 (모두 개발용 예시 문항)
          {saju.status === "ok" && saju.chartLine && <> · 사주 {saju.chartLine}</>}
        </p>
      </section>
    </div>
  );
}
