import { ChevronIcon } from "@/components/ui/icons";

export type TocItem = { id: string; label: string };

/** 목차 — PC는 왼쪽에 고정, 모바일은 긴 리포트 맨 위에서 펼쳐 원하는 부분으로 바로 이동한다 */
export function ReportToc({ items }: { items: TocItem[] }) {
  return (
    <>
      <nav aria-label="리포트 목차" className="hidden lg:block">
        <ol className="sticky top-28 space-y-1 border-l border-line text-[14px]">
          {items.map((t, i) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className="-ml-px block border-l border-transparent py-1.5 pl-4 text-ink-3 hover:border-accent hover:text-ink">
                <span className="mr-2 tabular-nums">{i + 1}</span>
                {t.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <details className="group mb-10 border-y border-line lg:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
          <span>
            목차 <span className="font-normal text-ink-3">· 원하는 부분으로 바로 이동 ({items.length})</span>
          </span>
          <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
        </summary>
        <ol className="pb-3 text-[15px]">
          {items.map((t, i) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className="flex min-h-11 items-center gap-3 border-t border-line py-2 text-ink-2">
                <span className="w-5 shrink-0 text-[13px] tabular-nums text-ink-3">{i + 1}</span>
                {t.label}
              </a>
            </li>
          ))}
        </ol>
      </details>
    </>
  );
}
