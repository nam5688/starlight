import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import { CHECKED, DEVELOPMENT, NOT_CHECKED, PROVENANCE_UPDATED, SOURCES, STANCE_NOTE, versionRows } from "@/lib/assessment/provenance";

export const metadata: Metadata = {
  title: "미유 성향 질문은 어떻게 만들었나요? · ME:U 미유",
  description: "미유 성향 질문이 무엇을 살펴보는지, 어떻게 만들었는지, 참고한 자료와 이용 허락 범위, 실제로 확인한 것과 아직 확인하지 못한 것을 알려 드려요.",
  alternates: { canonical: "/assessment-basis" },
};

const h2 = "border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight";
const list = "mt-3 list-disc space-y-2 pl-5 text-[15px] leading-[1.7] text-ink-2";

/**
 * 성향 질문 안내(공개) — 다섯 가지만 보여 준다(운영자 2026-10-15): 어떤 성향을 보는지 · 어떻게 개발했는지 · 참고 자료와 이용 허락 범위 · 확인한 것과 못 한 것 · 검사 버전과 수정일.
 * 문항별 상세 기록은 내부에 둔다(docs/assessment-item-records.md). 하지 않은 전문가 검토 · 검증은 했다고 쓰지 않는다.
 * 개발 과정을 알리는 글이며 법적으로 문제가 없다는 확인이나 검사의 정확도 · 타당도 보증이 아니다.
 */
export default function AssessmentBasisPage() {
  const versions = versionRows();
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge>개발용 예시 문항</StatusBadge>
        <span className="text-[13px] text-ink-3">{PROVENANCE_UPDATED} 수정</span>
      </div>
      <h1 className="mt-3 text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">미유 성향 질문은 어떻게 만들었나요?</h1>
      <p className="mt-3 text-[16px] leading-[1.7] text-ink-2">
        지금 화면의 질문은 모두 <strong>개발용 예시</strong>이고 정식 검사가 아니에요. 무엇을 살펴보는지, 어떻게 만들었는지, 어디까지 확인했는지를 있는 그대로 알려 드려요.
      </p>
      <p className="mt-3 rounded-md bg-mist px-4 py-3 text-[14px] leading-relaxed text-ink-2">
        이 글은 개발 과정을 알리는 글이에요. 법적으로 문제가 없다는 확인이나 검사의 정확도 · 타당도를 보증하는 글이 아니고, 공식 검사의 결과를 대신하지 않아요.
      </p>

      <section aria-labelledby="b-what" className="mt-10">
        <h2 id="b-what" className={h2}>
          1. 어떤 성향을 살펴보나요?
        </h2>
        <div className="mt-3 space-y-4 text-[15px] leading-[1.7] text-ink-2">
          {ASSESSMENT_MODULES.map((m) => (
            <div key={m.id}>
              <h3 className="font-semibold text-ink">
                {m.title} · 문항 {m.items.length}개
              </h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {m.dimensions.map((d) => (
                  <li key={d.id}>{d.label}</li>
                ))}
              </ul>
            </div>
          ))}
          <p>{STANCE_NOTE}</p>
        </div>
      </section>

      <section aria-labelledby="b-how" className="mt-10">
        <h2 id="b-how" className={h2}>
          2. 문항은 어떻게 만들었나요?
        </h2>
        <ul className={list}>
          {DEVELOPMENT.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="b-sources" className="mt-10">
        <h2 id="b-sources" className={h2}>
          3. 참고한 자료와 이용 허락 범위
        </h2>
        <ul className="mt-3 space-y-5 text-[15px] leading-[1.7] text-ink-2">
          {SOURCES.map((s) => (
            <li key={s.name}>
              <p className="font-semibold text-ink">{s.name}</p>
              <p className="mt-0.5">
                <span className="font-semibold text-ink">쓴 것 </span>
                {s.used}
              </p>
              <p className="mt-0.5">
                <span className="font-semibold text-ink">이용 허락 범위 </span>
                {s.scope}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="b-checked" className="mt-10">
        <h2 id="b-checked" className={h2}>
          4. 확인한 것과 아직 확인하지 못한 것
        </h2>
        <div className="mt-3 space-y-5 text-[15px] leading-[1.7] text-ink-2">
          <div>
            <h3 className="font-semibold text-ink">확인한 것</h3>
            <ul className="mt-1 list-disc space-y-2 pl-5">
              {CHECKED.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-ink">아직 확인하지 못한 것</h3>
            <ul className="mt-1 list-disc space-y-2 pl-5">
              {NOT_CHECKED.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="b-version" className="mt-10">
        <h2 id="b-version" className={h2}>
          5. 검사 버전과 수정일
        </h2>
        <dl className="mt-3 divide-y divide-line border-y border-line text-[15px] leading-relaxed text-ink-2">
          {versions.map((v) => (
            <div key={v.label} className="py-3">
              <dt className="font-semibold text-ink">{v.label}</dt>
              <dd>
                <span className="tabular-nums">{v.version}</span> · {v.note}
              </dd>
            </div>
          ))}
          <div className="py-3">
            <dt className="font-semibold text-ink">이 안내 글</dt>
            <dd className="tabular-nums">{PROVENANCE_UPDATED} 수정</dd>
          </div>
        </dl>
      </section>

      <p className="mt-10 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-ink-3">
        <Link href="/analyze" className={textLink}>
          내 분석 시작하기
        </Link>
        <Link href="/privacy" className={textLink}>
          개인정보 처리방침
        </Link>
      </p>
    </main>
  );
}
