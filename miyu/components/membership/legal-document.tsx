import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow } from "@/components/ui/styles";
import { TERMS_VERSION } from "@/lib/membership/terms";

export type LegalSection = { title: string; body: (string | string[])[] };

/** 약관·처리방침 공통 틀. 초안임을 항상 표시한다. */
export function LegalDocument({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge>초안 · {TERMS_VERSION}</StatusBadge>
      </div>
      <h1 className="mt-3 text-[26px] font-bold tracking-tight md:text-[30px]">{title}</h1>
      <p className="mt-3 rounded-md bg-mist px-4 py-3 text-[14px] leading-relaxed text-ink-2">
        개발 중인 초안입니다. 사업자 정보·보관 기간·위탁 업체 등은 출시 전 법률 검토를 거쳐 확정하며, 확정본이 게시되면 회원에게
        다시 동의를 받습니다.
      </p>
      <div className="mt-8 space-y-8">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-[17px] font-bold">{section.title}</h2>
            <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-2">
              {section.body.map((part, i) =>
                Array.isArray(part) ? (
                  <ul key={i} className="list-disc space-y-1 pl-5">
                    {part.map((li) => (
                      <li key={li}>{li}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={i}>{part}</p>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
