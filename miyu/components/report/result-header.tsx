import { MiyuAvatar } from "@/components/talk/miyu-character";
import type { MiyuTone } from "@/components/talk/miyu-moods";
import { SourceBadge } from "@/components/ui/source-badge";

/**
 * 결과 · 리포트 화면 머리글 — 출처 표시와 메타 한 줄 → 제목(모바일 24px) → 한 줄 설명.
 * 읽는 줄(720px)과 맞추고, 별도 바탕 띠를 두지 않는다.
 * tone을 주면 제목 줄 왼쪽에 안내 캐릭터 "미유"의 그 색 프로필을 작게 둔다 — 개인 리포트는 대표 연두(main), 궁합 결과는 핑크(love, 연애 · 결혼 · 궁합 영역 전용). 장식이라 글 흐름 · 높이는 그대로다.
 */
export function ResultHeader({
  title,
  subtitle,
  kicker,
  source,
  meta,
  tone,
}: {
  title: string;
  subtitle?: string;
  kicker?: string;
  source?: "sample" | "dev-scoring";
  meta: string;
  tone?: MiyuTone;
}) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pt-5 pb-4 md:pt-10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {source && <SourceBadge source={source} />}
        <span className="text-[13px] text-ink-3">{meta}</span>
      </div>
      {kicker && <p className="mt-3 text-[13px] font-semibold text-accent">{kicker}</p>}
      <div className={`${kicker ? "mt-1" : "mt-3"} flex items-center gap-3`}>
        {tone && <MiyuAvatar tone={tone} className="size-11 md:size-12" />}
        <h1 className="min-w-0 text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">{title}</h1>
      </div>
      {subtitle && <p className="mt-1 text-[14px] leading-[1.6] text-ink-2">{subtitle}</p>}
    </div>
  );
}
