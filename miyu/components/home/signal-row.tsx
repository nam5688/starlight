import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 홈 첫 화면의 "무엇을 종합하나" 그림 — 사주 · MBTI · 성격 · 기질 · 애착을 선 그림 하나씩으로 보여 주고 종합 분석으로 모은다.
 * 글을 줄이고 한눈에 보이게 하려는 것이며(운영자 2026-10-15), 정확도 · 과학적 검증을 주장하지 않는다:
 * 성격 · 기질 · 애착은 미유가 직접 만든 질문에 답한 내용이고 MBTI는 아는 유형을 입력한 값이다. 공식 검사나 진단이 아니다. 질문을 어떻게 만들었는지는 /assessment-basis에 있다.
 */

type IconProps = { className?: string };
const svg = (children: ReactNode, className = "size-7") => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

/** 사주 — 네 개의 기둥(년 · 월 · 일 · 시) */
export function SajuIcon({ className }: IconProps) {
  return svg(
    <>
      {[3, 8, 13, 18].map((x) => (
        <g key={x}>
          <rect x={x} y="4" width="3.2" height="16" rx="1.2" />
          <path d={`M${x} 12h3.2`} />
        </g>
      ))}
    </>,
    className,
  );
}

/** MBTI — 네 가지 선호 축(줄 위의 점) */
export function MbtiIcon({ className }: IconProps) {
  const rows: [number, number][] = [
    [6, 8],
    [10, 15.5],
    [14, 11],
    [18, 16.5],
  ];
  return svg(
    <>
      {rows.map(([y, x]) => (
        <g key={y}>
          <path d={`M4 ${y}h16`} strokeOpacity="0.45" />
          <circle cx={x} cy={y} r="2" fill="currentColor" stroke="none" />
        </g>
      ))}
    </>,
    className,
  );
}

/** 성격 — 사람 */
export function PersonalityIcon({ className }: IconProps) {
  return svg(
    <>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5 20c0-4 3.1-6.6 7-6.6s7 2.6 7 6.6" />
    </>,
    className,
  );
}

/** 기질 — 타고난 반응의 결(맥박처럼 오르내리는 선) */
export function TemperamentIcon({ className }: IconProps) {
  return svg(<path d="M3 12.5h4l2.2-6 3.6 11 2.4-7 1.2 2H21" />, className);
}

/** 애착 — 가까운 두 사람(겹치는 두 원) */
export function AttachmentIcon({ className }: IconProps) {
  return svg(
    <>
      <circle cx="9" cy="12" r="5.2" />
      <circle cx="15" cy="12" r="5.2" />
    </>,
    className,
  );
}

/** 종합 — 네 방향이 모이는 별 */
export function SynthesisIcon({ className }: IconProps) {
  return svg(<path d="M12 3l2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1z" />, className);
}

const SIGNALS: { label: string; note: string; Icon: (p: IconProps) => ReactNode }[] = [
  { label: "사주", note: "원국 계산", Icon: SajuIcon },
  { label: "MBTI", note: "아는 유형", Icon: MbtiIcon },
  { label: "성격", note: "직접 답해요", Icon: PersonalityIcon },
  { label: "기질", note: "직접 답해요", Icon: TemperamentIcon },
  { label: "애착", note: "직접 답해요", Icon: AttachmentIcon },
];

export function SignalRow() {
  return (
    <div className="max-w-[34rem]">
      <ol className="grid grid-cols-5 gap-1.5" aria-label="종합해서 읽는 다섯 가지">
        {SIGNALS.map(({ label, note, Icon }, i) => (
          <li key={label} className="relative flex flex-col items-center text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-strong sm:size-[76px]">
              <Icon className="size-7 sm:size-10" />
            </span>
            <span className="mt-2 text-[14px] leading-tight font-bold sm:text-[16px]">{label}</span>
            <span className="mt-0.5 text-[11px] leading-tight text-ink-3 sm:text-[13px]">{note}</span>
            {i < SIGNALS.length - 1 && (
              <span aria-hidden="true" className="absolute top-4 -right-[7px] text-[15px] leading-none font-bold text-ink-3 sm:top-7">
                +
              </span>
            )}
          </li>
        ))}
      </ol>

      <div aria-hidden="true" className="mt-3 flex justify-center text-ink-3">
        <svg viewBox="0 0 20 20" fill="none" className="size-5">
          <path d="M10 3v12M5 11l5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="mt-1 flex items-center gap-3 rounded-2xl bg-accent px-4 py-3 text-white shadow-soft">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15">
          <SynthesisIcon className="size-6" />
        </span>
        <p className="min-w-0">
          <span className="block text-[16px] leading-tight font-bold sm:text-[17px]">종합 분석</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-white/90">다섯 가지를 한 사람의 해석으로 읽어요</span>
        </p>
      </div>

      <p className="mt-3 text-[12px] leading-[1.65] text-ink-3">
        성격 · 기질 · 애착은 미유가 직접 만든 질문에 답한 내용이고, MBTI는 아는 유형을 입력해요. 공식 검사나 진단이 아니며 정확도는 검증하지 않았어요.{" "}
        <Link href="/assessment-basis" className="underline underline-offset-2 hover:text-ink">
          질문은 어떻게 만들었나요?
        </Link>
      </p>
    </div>
  );
}
