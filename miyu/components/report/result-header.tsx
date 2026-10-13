import { SourceBadge } from "@/components/ui/source-badge";

/**
 * 결과 · 리포트 화면 머리글 — 출처 표시와 메타 한 줄 → 제목(모바일 24px) → 한 줄 설명.
 * 읽는 줄(720px)과 맞추고, 별도 바탕 띠를 두지 않는다.
 */
export function ResultHeader({
  title,
  subtitle,
  kicker,
  source,
  meta,
}: {
  title: string;
  subtitle?: string;
  kicker?: string;
  source?: "sample" | "dev-scoring";
  meta: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pt-5 pb-4 md:pt-10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {source && <SourceBadge source={source} />}
        <span className="text-[13px] text-ink-3">{meta}</span>
      </div>
      {kicker && <p className="mt-3 text-[13px] font-semibold text-accent">{kicker}</p>}
      <h1 className={`${kicker ? "mt-1" : "mt-3"} text-[24px] leading-snug font-bold tracking-tight md:text-[28px]`}>{title}</h1>
      {subtitle && <p className="mt-1 text-[14px] leading-[1.6] text-ink-2">{subtitle}</p>}
    </div>
  );
}
