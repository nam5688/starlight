import Link from "next/link";
import { LockedMask, LockedText, LockTag } from "@/components/report/locked";
import { ArrowIcon } from "@/components/ui/icons";
import { SourceBadge } from "@/components/ui/source-badge";
import { maskOneLiner, maskTendencyName } from "@/lib/report/preview";
import { sampleReport } from "@/lib/samples/sample-report";

/**
 * 메인의 실제 리포트 예시 — 무료 미리보기와 같은 규칙으로 잠그고, 예시 인물(가상)의 실제 계산 결과를 보여 준다.
 * 어디까지 무료이고 무엇이 구매 후인지 첫 화면에서 바로 보이게 한다.
 */
export function ReportPreview() {
  const r = sampleReport;
  const mask = maskTendencyName(r.tendency.name);
  const plain = r.extras?.plain;
  const question = r.extras?.questions[0];
  const section = r.details.saju.saju;
  return (
    <figure className="overflow-hidden rounded-xl border border-line-strong bg-canvas">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line bg-mist px-5 py-3">
        <span className="text-[14px] font-semibold text-ink-2">무료 미리보기 예시 · {r.personName} 님</span>
        <SourceBadge source={r.source} />
      </figcaption>

      <div className="px-5 pt-5 pb-5 md:px-6">
        <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-accent">
          대표 경향 <LockTag>이름 전체는 구매 후</LockTag>
        </p>
        <p className="mt-0.5 text-[28px] font-bold tracking-tight">
          {mask.head}
          <LockedMask chars={2} />
          {mask.tail}
        </p>
        {r.insight ? (
          <p className="mt-3 border-l-[3px] border-accent pl-3 text-[16px] font-semibold leading-relaxed">{r.insight.text}</p>
        ) : (
          <p className="mt-3 border-l-[3px] border-accent pl-3 text-[17px] font-semibold leading-snug">
            {maskOneLiner(r.oneLiner)} <LockedText chars={16} />
          </p>
        )}

        {section.status !== "not-connected" && plain && (
          <div className="mt-6 border-t border-line pt-5">
            <p className="text-[13px] font-semibold text-ink-2">사주 원국</p>
            <p className="mt-1 font-mono text-[15px] tracking-wide text-ink-2">
              {section.pillars.map((p) => `${p.stem}${p.branch}`).join("  ")}
            </p>
            <ul className="mt-3 grid grid-cols-5 gap-1.5 text-center text-[13px]" aria-label="오행 분포">
              {plain.elements.map((e) => (
                <li key={e.element} className={`rounded border py-1.5 ${e.level === "many" || e.level === "none" ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line text-ink-2"}`}>
                  {e.element} {e.count}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[15px] font-semibold leading-snug">{plain.headline}</p>
          </div>
        )}

        {question && (
          <div className="mt-5 border-t border-line pt-5">
            <p className="text-[13px] font-semibold text-ink-2">내 원국이 던지는 질문</p>
            <p className="mt-1 text-[15px] font-semibold leading-snug">{question.question}</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-3">답은 구매 후 쉬운 말로 풀어 드립니다.</p>
          </div>
        )}
      </div>

      <Link
        href="/report/sample"
        className="flex items-center justify-between border-t border-line px-5 py-4 text-[15px] font-semibold text-accent hover:bg-accent-soft md:px-6"
      >
        구매 후 받는 리포트 예시 보기
        <ArrowIcon />
      </Link>
    </figure>
  );
}
