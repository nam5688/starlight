import { ReadingNav, type ReadingNavItem } from "./reading-nav";
import { Fold, FoldRow } from "./reading-parts";

/**
 * 구매한 리포트 · 고민 리포트 · 예시가 함께 쓰는 틀 — 위에 붙는 주제 이동 막대 + 한 줄 읽기 폭(720px) + 페이지 바탕.
 * 저장된 내용은 그대로이고 보이는 방식(순서 · 접힘 · 구분)만 정한다. 첫 화면은 요약, 자세한 풀이와 분석 근거는 눌러서 본다.
 */
export function ReportShell({ nav, children }: { nav: ReadingNavItem[]; children: React.ReactNode }) {
  return (
    <div className="bg-page pb-16">
      <ReadingNav items={nav} />
      <article className="mx-auto w-full max-w-[720px] space-y-12 px-5 pt-6 md:pt-8">{children}</article>
    </div>
  );
}

/** 문단 묶음 — 첫 문단만 기본으로 보이고 나머지는 "이어서 보기"로 접는다 (문단 내용은 바꾸지 않는다) */
export function FoldedRest({ label = "자세한 풀이 이어서 보기", children, count }: { label?: string; count: number; children: React.ReactNode }) {
  if (count <= 0) return null;
  return (
    <FoldRow>
      <Fold label={`${label} (${count})`} wide>
        <div className="space-y-6">{children}</div>
      </Fold>
    </FoldRow>
  );
}
