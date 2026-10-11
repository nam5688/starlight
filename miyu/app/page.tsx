import Link from "next/link";
import { questionSections } from "@/lib/questions";
import { sampleReport } from "@/lib/report";

const areas = [
  { name: "사주", text: "생년월일과 출생 시간으로 일간과 오행 분포를 봅니다." },
  { name: "MBTI", text: "에너지 방향 · 인식 · 판단 · 생활 방식의 비율을 봅니다." },
  { name: "기질", text: "자극추구 · 위험회피 · 사회적 민감성 · 인내력을 점수로 봅니다." },
  { name: "애착", text: "가까운 관계에서의 불안과 회피 정도를 봅니다." },
];

const resultOrder = [
  { name: "대표 경향", text: "네 영역을 종합한 핵심 경향 한 문장" },
  { name: "한 줄 요약", text: "지금 알아야 할 결론" },
  { name: "항목별 점수", text: "영역마다 수치와 막대로 비교" },
  { name: "해석 근거", text: "결론을 뒷받침하는 지표" },
  { name: "실천 제안", text: "바로 해볼 수 있는 행동 세 가지" },
];

const questionCount = questionSections.reduce((n, s) => n + s.questions.length, 0);

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-20">
      <section className="pt-12 pb-12 sm:pt-16">
        <h1 className="text-[28px] font-bold leading-snug tracking-tight sm:text-[34px]">
          개인 통합 분석 리포트
        </h1>
        <p className="mt-2 text-lg font-medium text-sub">사주 · MBTI · 기질 · 애착</p>
        <p className="mt-6 text-[17px] leading-relaxed">긴 서론 대신, 필요한 결론부터.</p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/test"
            className="flex h-13 items-center justify-center rounded-xl bg-ink px-7 text-[16px] font-semibold text-paper hover:bg-black"
          >
            검사 시작하기
          </Link>
          <Link
            href="/result"
            className="flex h-13 items-center justify-center rounded-xl border border-line px-7 text-[16px] font-medium hover:bg-wash"
          >
            샘플 리포트 보기
          </Link>
        </div>
        <p className="mt-4 text-sm text-faint">
          기본 정보 + 질문 {questionCount}개 · 약 5분
        </p>
      </section>

      <section className="border-t border-line pt-10">
        <h2 className="text-sm font-semibold text-sub">리포트에 담기는 내용</h2>
        <dl className="mt-4">
          {areas.map((a) => (
            <div key={a.name} className="flex gap-4 border-b border-line py-4 last:border-b-0">
              <dt className="w-14 shrink-0 font-semibold">{a.name}</dt>
              <dd className="text-[15px] leading-relaxed text-sub">{a.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-10 border-t border-line pt-10">
        <h2 className="text-sm font-semibold text-sub">결과는 이 순서로 보여드립니다</h2>
        <ol className="mt-4 space-y-3">
          {resultOrder.map((r, i) => (
            <li key={r.name} className="flex items-baseline gap-4">
              <span className="w-6 shrink-0 text-sm tabular-nums text-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-semibold">{r.name}</span>
              <span className="text-[15px] text-sub">{r.text}</span>
            </li>
          ))}
        </ol>

        <div className="mt-8 rounded-xl bg-wash p-5">
          <p className="text-sm text-faint">샘플 · 대표 경향</p>
          <p className="mt-1 text-lg font-semibold leading-snug">{sampleReport.headline}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-sub">{sampleReport.summary}</p>
          <Link href="/result" className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
            샘플 리포트 전체 보기
          </Link>
        </div>
      </section>

      <p className="mt-14 text-xs leading-relaxed text-faint">
        미유 리포트는 자기 이해를 돕는 참고 자료이며, 의학적·심리학적 진단을 대신하지 않습니다.
      </p>
    </main>
  );
}
