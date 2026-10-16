import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { DEV_PAIRS } from "@/server/dev-compat";

export const metadata: Metadata = { title: "사주 궁합 리포트 · ME:U 미유", robots: { index: false } };

/** 개발용 — 내 컴퓨터에서만 열린다(공개 배포에서는 열리지 않는다). 사주 궁합 리포트(compat-v1)를 가상 인물 세 쌍으로 읽는다. 판매하지 않는다 */
export default function DevCompatPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <StatusBadge>개발용 · 내 컴퓨터에서만 열림</StatusBadge>
      <h1 className="mt-3 text-[26px] font-bold tracking-tight md:text-[30px]">사주 궁합 리포트 읽기</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-2">
        간단 궁합(무료)과 같은 계산 결과를 길게 풀어 쓴 사주 궁합 리포트입니다. 위쪽의 커플 유형 · 궁합 지수는 코드가 채우고, 풀이 본문은 <b>시험용 대리 작성기(AI 하위 작업자)</b>가 지시문과 근거만으로 쓴 글입니다(실제 서비스 AI가 아닙니다). 저장된 글이 없는 쌍은 모의 작성기의 자리 표시 글이 나옵니다. 가상 인물이며 아무것도 저장하지 않고, 아직 판매하지 않습니다.
      </p>
      <ul className="mt-8 divide-y divide-line rounded-xl border border-line bg-canvas">
        {Object.entries(DEV_PAIRS).map(([id, p]) => (
          <li key={id} className="px-4 py-4">
            <Link href={`/dev/compat/${id}`} className={`${textLink} text-[16px]`}>
              {id} · {p.names.a} × {p.names.b}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
