import Link from "next/link";
import { Faq } from "@/components/home/faq";
import { ReportPreview } from "@/components/home/report-preview";
import { CheckIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonPrimary, buttonSecondary, pageWide } from "@/components/ui/styles";
import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import { formatKrw, PERSONAL_REPORT, REPORT_SCOPE } from "@/lib/config/product";

const PERSPECTIVES = [
  {
    name: "MBTI 성향",
    sees: "에너지 방향, 정보 인식, 판단 기준, 생활 방식의 선호",
    limit: "선호 경향이며 능력이나 성격 전체를 판정하지 않습니다.",
  },
  {
    name: "기질",
    sees: "새로운 일, 불확실함, 타인의 반응, 오래 걸리는 일에 대한 평소 반응",
    limit: "현재 응답 기준의 경향이며, 높고 낮음이 좋고 나쁨이 아닙니다.",
  },
  {
    name: "애착",
    sees: "가까운 관계에서의 불안과 거리 두기",
    limit: "임상 진단이 아니며 관계와 시기에 따라 달라질 수 있습니다.",
  },
  {
    name: "사주",
    sees: "생년월일·출생시간으로 계산한 원국과 오행 분포",
    limit: "전통 해석 체계이며, 심리검사 점수와 합산하지 않습니다.",
  },
];

const QUESTION_COUNT = ASSESSMENT_MODULES.reduce((n, m) => n + m.items.length, 0);

const STEPS = [
  { title: "기본 정보 입력", desc: "닉네임, 생년월일, 출생시간(몰라도 됨)" },
  { title: "검사 응답", desc: "MBTI 성향 · 기질 · 관계 문항. 이전 단계로 돌아가 답을 고칠 수 있습니다." },
  { title: "무료 미리보기 확인", desc: "대표 경향 일부, 사주 원국과 오행의 뜻, 내 원국이 던지는 질문" },
  { title: "카카오 로그인", desc: "결과를 회원 정보에 저장" },
  { title: "개인 통합 리포트 구매", desc: "질문의 답, 상황별 잘하는 점 · 주의할 점, 어울리는 관계 조건, 보완 아이템" },
  { title: "MY에서 다시보기", desc: "저장된 같은 버전을 언제든 다시 확인" },
];

export default function Home() {
  return (
    <main>
      {/* 핵심 소개 + 실제 리포트 예시 */}
      <section className={`${pageWide} grid gap-12 py-12 md:py-16 lg:grid-cols-[minmax(0,1fr)_480px] lg:items-center lg:gap-16 lg:py-20`}>
        <div>
          <p className="text-[15px] font-semibold text-accent">ME:U 개인 통합 리포트</p>
          <h1 className="mt-3 text-[32px] font-bold leading-[1.3] tracking-[-0.02em] md:text-[44px]">
            내 사주,
            <br />쉬운 말로 풀어 드립니다.
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-ink-2 md:text-[19px]">
            생년월일로 계산한 <span className="font-semibold text-ink">사주 원국</span>에 내 행동 응답을 더해,
            <br className="hidden md:block" /> 일 · 가까운 사람 · 선택 · 돈 · 갈등에서 어떤 점이 강하고 어떤 점을 조심하면 좋은지 알려 드려요.
          </p>
          <p className="mt-3 text-[15px] text-ink-3">한자는 뜻과 함께, 어려운 용어는 일상의 말로 풀어 씁니다.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/analyze" className={buttonPrimary}>
              내 분석 시작하기
            </Link>
            <Link href="/report/sample" className={buttonSecondary}>
              리포트 예시 보기
            </Link>
          </div>
          <p className="mt-4 text-[15px] text-ink-2">
            미리보기 무료 · {PERSONAL_REPORT.name} <span className="font-semibold tabular-nums text-ink">{formatKrw(PERSONAL_REPORT.priceKrw)}</span> · 문항 {QUESTION_COUNT}개
          </p>
          <dl className="mt-8 border-t border-line text-[14px]">
            <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-b border-line py-3">
              <dt className="font-semibold text-ink-2">무료로 보는 것</dt>
              <dd className="text-ink-2">원국 표 · 오행이 뜻하는 것 · 쉬운 한 줄 풀이 · 내 원국이 던지는 질문</dd>
            </div>
            <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-b border-line py-3">
              <dt className="font-semibold text-accent">구매하면 더</dt>
              <dd className="text-ink-2">질문의 답 · 상황별 잘하는 점과 주의할 점 · 어울리는 관계 조건 · 보완 아이템</dd>
            </div>
          </dl>
        </div>
        <ReportPreview />
      </section>

      {/* 제공 항목 */}
      <section className="border-y border-line bg-mist py-14 md:py-20">
        <div className={pageWide}>
          <h2 className="text-[24px] font-bold tracking-tight md:text-[28px]">리포트에 담기는 항목</h2>
          <p className="mt-2 text-[16px] text-ink-2">검사 후 무료 미리보기를 먼저 보고, 필요할 때 개인 통합 리포트를 구매합니다.</p>

          <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
            <table className="w-full border-collapse bg-canvas text-left">
              <thead>
                <tr className="border-b border-ink text-[13px] text-ink-2">
                  <th scope="col" className="px-3 py-3 font-semibold md:px-4">
                    항목
                  </th>
                  <th scope="col" className="w-[104px] px-1 py-3 text-center font-semibold md:w-40">
                    무료 미리보기
                  </th>
                  <th scope="col" className="w-[104px] px-1 py-3 text-center font-semibold text-accent md:w-40">
                    통합 리포트
                  </th>
                </tr>
              </thead>
              <tbody>
                {REPORT_SCOPE.map((row) => (
                  <tr key={row.name} className="border-b border-line align-top">
                    <th scope="row" className="px-3 py-3.5 font-normal md:px-4">
                      <span className="block text-[15px] font-semibold">{row.name}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{row.desc}</span>
                    </th>
                    <td className="px-1 py-3.5 text-center text-[13px] leading-snug text-ink-2">
                      {row.free ?? <NotIncluded />}
                    </td>
                    <td className="px-1 py-3.5 text-center text-[13px] font-semibold leading-snug text-accent">{row.paid}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div>
              <h3 className="text-[18px] font-bold">네 가지 관점의 근거와 한계</h3>
              <dl className="mt-4 border-t border-ink">
                {PERSPECTIVES.map((p) => (
                  <div key={p.name} className="border-b border-line py-4">
                    <dt className="text-[16px] font-semibold">{p.name}</dt>
                    <dd className="mt-1 text-[15px] leading-relaxed text-ink-2">{p.sees}</dd>
                    <dd className="mt-1 text-[13px] leading-relaxed text-ink-3">한계 · {p.limit}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* 이용 방법 · 가격 */}
      <section className={`${pageWide} py-14 md:py-20`}>
        <h2 className="text-[24px] font-bold tracking-tight md:text-[28px]">이용 방법과 가격</h2>
        <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
          <ol className="border-t border-ink">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 border-b border-line py-4">
                <span className="w-6 shrink-0 text-[16px] font-bold tabular-nums text-accent">{i + 1}</span>
                <div>
                  <p className="text-[16px] font-semibold">{s.title}</p>
                  <p className="mt-0.5 text-[14px] leading-relaxed text-ink-3">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="self-start rounded-xl border border-line-strong p-6">
            <p className="text-[15px] font-semibold text-ink-2">{PERSONAL_REPORT.name}</p>
            <p className="mt-2 flex flex-wrap items-baseline gap-2">
              <span className="text-[34px] font-bold tracking-tight tabular-nums">{formatKrw(PERSONAL_REPORT.priceKrw)}</span>
              <StatusBadge>가격 {PERSONAL_REPORT.priceNote}</StatusBadge>
            </p>
            <p className="mt-1 text-[14px] text-ink-3">단건 구매 · 구독 아님 · 카드 결제</p>
            <ul className="mt-5 space-y-2 border-t border-line pt-5 text-[15px]">
              {REPORT_SCOPE.filter((row) => row.free !== row.paid).map((row) => row.name).map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <CheckIcon className="size-4 shrink-0 text-accent" />
                  {t}
                </li>
              ))}
            </ul>
            <Link href="/analyze" className={`${buttonPrimary} mt-6 w-full`}>
              내 분석 시작하기
            </Link>
          </div>
        </div>
      </section>

      {/* 자주 묻는 질문 */}
      <section className="border-t border-line py-14 md:py-20">
        <div className={`${pageWide} grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16`}>
          <h2 className="text-[24px] font-bold tracking-tight md:text-[28px]">자주 묻는 질문</h2>
          <Faq />
        </div>
      </section>
    </main>
  );
}

function NotIncluded() {
  return (
    <span className="text-ink-3">
      <span aria-hidden="true">—</span>
      <span className="sr-only">포함 안 됨</span>
    </span>
  );
}
