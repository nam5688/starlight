import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChatExample } from "@/components/home/chat-example";
import { CompareSection } from "@/components/home/compare-section";
import { Faq } from "@/components/home/faq";
import { ReportPreview } from "@/components/home/report-preview";
import { RoomCards } from "@/components/home/room-cards";
import { RoomCardsLive } from "@/components/home/room-cards-live";
import { SignalRow } from "@/components/home/signal-row";
import { MiyuAvatar } from "@/components/talk/miyu-character";
import { CheckIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonPrimary, buttonSecondary, pageWide } from "@/components/ui/styles";
import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import { formatKrw, PERSONAL_REPORT, REPORT_SCOPE } from "@/lib/config/product";

export const metadata: Metadata = { alternates: { canonical: "/" } };

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
  { title: "MY에서 다시보기 · 대화로 풀어보기", desc: "저장된 같은 버전을 다시 확인하고, 주제별 상담방에서 한 번에 하나씩 이어 읽기" },
];

const FLOW = [
  { title: "무료 분석", desc: `생년월일과 질문 ${QUESTION_COUNT}개에 답하면 내 맛보기 분석이 카드 한 장으로 나와요. 이미지로 저장할 수 있어요.` },
  { title: "주제별 맛보기", desc: "궁금한 주제의 미유 채팅방에서, 공감 가는 부분을 먼저 풀어 줘요. 어려운 사주 용어 대신 생활 장면으로 말해요." },
  { title: "깊은 풀이는 리포트에서", desc: `더 깊은 풀이와 월별 흐름은 리포트(${formatKrw(PERSONAL_REPORT.priceKrw)})에서 이어져요. 눌러 준 답이 풀이를 바꾸지는 않아요.` },
];

export default function Home() {
  return (
    <main className="bg-page">
      {/* 핵심 소개 */}
      <section className={`${pageWide} grid gap-10 py-10 md:py-16 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:gap-16 lg:py-20`}>
        <div>
          <p className="text-[14px] font-semibold text-accent">ME:U 미유 · 개인 통합 분석</p>
          <h1 className="mt-3 text-[28px] leading-[1.35] font-bold tracking-tight md:text-[42px]">
            내 분석은 한 장으로,
            <br />
            궁금한 건 대화로.
          </h1>
          <p className="mt-3 max-w-[34rem] text-[16px] leading-[1.7] text-ink-2 md:text-[18px]">사주만 보지 않아요. 내가 직접 답한 질문까지 더해 종합해요.</p>
          <div className="mt-6">
            <SignalRow />
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/analyze" className={buttonPrimary}>
              무료 분석 해보기
            </Link>
            <Link href="/report/sample" className={buttonSecondary}>
              리포트 예시 보기
            </Link>
          </div>
          <p className="mt-4 text-[14px] leading-[1.65] text-ink-2">
            미리보기 무료 · {PERSONAL_REPORT.name} <span className="font-semibold tabular-nums text-ink">{formatKrw(PERSONAL_REPORT.priceKrw)}</span> · 문항 {QUESTION_COUNT}개
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14px] leading-[1.6] text-ink-3">
            내 분석은 이어서
            <span className="inline-flex items-center gap-1.5">
              궁합 비교 <StatusBadge>준비 중</StatusBadge>
            </span>
            으로 이어집니다.
          </p>
        </div>
        <MiyuHello />
      </section>

      <Suspense fallback={<RoomCards chatReady={false} />}>
        <RoomCardsLive />
      </Suspense>

      {/* 분석 한 장 → 풀이 → 내 경우 확인, 그리고 대화 예시 (후기 자리에는 가상 인물 예시만 둔다) */}
      <section aria-labelledby="home-flow" className={`${pageWide} py-10 md:py-14`}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-start lg:gap-16">
          <div>
            <h2 id="home-flow" className="text-[22px] leading-snug font-bold tracking-tight md:text-[28px]">
              분석 한 장에서 시작해 대화로 이어져요
            </h2>
            <ol className="mt-6 space-y-5">
              {FLOW.map((f, i) => (
                <li key={f.title} className="flex gap-4">
                  <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[14px] font-bold text-accent-strong tabular-nums">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-[16px] font-semibold">{f.title}</p>
                    <p className="mt-0.5 text-[15px] leading-[1.7] text-ink-2">{f.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-[13px] leading-[1.7] text-ink-3">
              오른쪽의 대화는 가상 인물 서윤의 리포트로 만든 예시이며 실제 이용 후기가 아니에요. 이용 후기는 이용자의 동의를 받은 뒤에만 싣겠습니다. 미유는 분석을 풀어 주는 안내이고, 결과를 보장하거나 진단하지 않아요.
            </p>
          </div>
          <ChatExample />
        </div>
      </section>

      <CompareSection />

      {/* 무료 미리보기 예시 */}
      <section aria-labelledby="home-preview" className={`${pageWide} py-12 md:py-16`}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_480px] lg:items-start lg:gap-16">
          <div>
            <h2 id="home-preview" className="text-[22px] leading-snug font-bold tracking-tight md:text-[28px]">
              무료 미리보기는 이렇게 보입니다
            </h2>
            <p className="mt-2 text-[15px] leading-[1.7] text-ink-2">
              검사를 마치면 구매 전에 아래 범위까지 무료로 볼 수 있습니다. 잠긴 내용은 화면에서 가리는 것이 아니라 구매 후에만 내려받습니다.
            </p>
            <dl className="mt-6 border-t border-line text-[14px]">
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-b border-line py-3">
                <dt className="font-semibold text-ink-2">무료로 보는 것</dt>
                <dd className="leading-[1.65] text-ink-2">원국 표 · 오행이 뜻하는 것 · 쉬운 한 줄 풀이 · 내 원국이 던지는 질문</dd>
              </div>
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-b border-line py-3">
                <dt className="font-semibold text-accent-strong">구매하면 더</dt>
                <dd className="leading-[1.65] text-ink-2">질문의 답 · 상황별 잘하는 점과 주의할 점 · 어울리는 관계 조건 · 보완 아이템</dd>
              </div>
            </dl>
          </div>
          <ReportPreview />
        </div>
      </section>

      {/* 제공 항목 */}
      <section className="border-y border-line bg-canvas py-12 md:py-16">
        <div className={pageWide}>
          <h2 className="text-[24px] font-bold tracking-tight md:text-[28px]">리포트에 담기는 항목</h2>
          <p className="mt-2 text-[16px] text-ink-2">검사 후 무료 미리보기를 먼저 보고, 필요할 때 개인 통합 리포트를 구매합니다.</p>

          <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
            <table className="w-full border-collapse text-left">
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

/** 홈 첫 화면 오른쪽의 미유 인사 — 큰 화면에서만 보인다. 대화 예시 · 후기가 아니라 안내 인사이다 */
function MiyuHello() {
  return (
    <div className="hidden rounded-3xl bg-canvas p-6 shadow-soft lg:block" aria-label="미유의 인사">
      <MiyuAvatar className="size-28" mood="wave" />
      <div className="mt-4 space-y-2">
        <p className="w-fit max-w-full rounded-2xl rounded-tl-md bg-page px-4 py-2.5 text-[16px] leading-[1.6]">안녕하세요, 미유예요.</p>
        <p className="w-fit max-w-full rounded-2xl rounded-tl-md bg-page px-4 py-2.5 text-[16px] leading-[1.6]">분석은 한 장으로 정리해 두고, 궁금한 건 대화로 이어서 풀어 줄게요.</p>
        <p className="w-fit max-w-full rounded-2xl rounded-tl-md bg-page px-4 py-2.5 text-[16px] leading-[1.6]">어떤 이야기부터 해 볼까요?</p>
      </div>
    </div>
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
