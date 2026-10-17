import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IdentityCard } from "@/components/results/identity-card";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow } from "@/components/ui/styles";
import { LUCKY_INDEX, PERSONAL_TYPE } from "@/lib/config/product";
import { devIdentityRows } from "@/server/dev-identity";

export const metadata: Metadata = { title: "유형명 · 럭키 지수 확인 · ME:U 미유", robots: { index: false } };

/** 개발용 — 내 컴퓨터에서만 열린다(공개 배포에서는 열리지 않는다). 개인 유형명 · 럭키 지수의 실제 화면 모양을 가상 인물로 확인한다. 아무것도 저장하지 않는다 */
export default function DevIdentityPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const rows = devIdentityRows();
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <StatusBadge>개발용 · 내 컴퓨터에서만 열림</StatusBadge>
      <h1 className="mt-3 text-[26px] font-bold tracking-tight md:text-[30px]">유형명 · 럭키 지수 확인</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-2">
        결과 화면에 들어갈 카드의 모양입니다. 가상 인물(생년월일 · 응답을 직접 정한 값)이며 아무것도 저장하지 않습니다. 유형 이름 · 규칙 · 점수표 · 분포는 운영자 확인 전 초안이라 <b>실제 결과 화면에는 아직 켜지 않았습니다</b>(지금 스위치:
        유형명 {String(PERSONAL_TYPE.visible)} · 럭키 지수 {String(LUCKY_INDEX.visible)}). 같은 응답이라도 사주가 다르면 유형이 달라질 수 있고, 럭키 지수는 응답과 상관없이 사주만으로 정해집니다. 규칙은 <code>docs/personal-type-v1.md</code> · <code>docs/lucky-index-v1.md</code>에 있습니다.
      </p>
      <div className="mt-8 space-y-10">
        {rows.map((r) => (
          <section key={r.id} aria-label={r.id}>
            <p className="text-[14px] font-semibold text-ink-2">
              {r.id} · {r.label}
            </p>
            <p className="mt-0.5 text-[13px] text-ink-3">{r.note}</p>
            <div className="-mx-5 md:mx-0">{r.identity ? <IdentityCard identity={r.identity} showType showLucky idPrefix={`${r.id}-`} /> : <p className="px-5 text-[14px]">사주 계산 결과가 없어 만들지 않았어요.</p>}</div>
          </section>
        ))}
      </div>
    </main>
  );
}
