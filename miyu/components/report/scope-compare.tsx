import Link from "next/link";
import { CheckIcon, ChevronIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonPrimary } from "@/components/ui/styles";
import { CHAT_ROOMS, formatKrw, PERSONAL_REPORT, REPORT_SCOPE, REPORT_TIER_NAMES } from "@/lib/config/product";

/**
 * 무료 리포트 · 심층 리포트의 제공 범위와 상담 이용 조건 — 리포트 예시 페이지(/report/sample)에 모은다(운영자 제안 2026-10-16: 홈에는 기본 가격만 두고 상세 항목은 예시 페이지로).
 * 카드의 줄은 `REPORT_SCOPE`(무료 / 구매 후 범위의 한 곳) · `CHAT_ROOMS`(방마다 무료 질문 수)를 줄여 쓴 것이다. 범위를 바꾸면 이 줄도 같이 고친다.
 * 자세한 항목표는 "전체 제공 항목과 상담 이용 횟수 보기"에 접어 두고, 무료 질문을 다 쓴 뒤 이어 가는 방법은 가격 · 약속을 하지 않고 채팅 화면에서 안내한다고만 밝힌다.
 * 무료는 핵심을 완결해 설명하고 심층은 삶의 영역과 해석의 깊이를 넓힌다 — 예전의 "답을 가렸다가 유료에서 연다"는 비교는 쓰지 않는다.
 */
const FREE_ITEMS = ["나의 유형 이름과 한 줄 · 핵심 요약 일부", "사주 원국 표와 쉬운 풀이", "상황별 해석의 첫 장면 · 내 원국이 던지는 질문", "무료 상담방과 방마다 정해진 무료 질문"];
const DEEP_ITEMS = [
  "핵심 요약 전체 · 상세 분석",
  "상황별 잘하는 점 · 주의할 점",
  "어울리는 관계 조건 · 보완 아이템 · 실천 제안",
  "모든 상담방 열림 · MY 저장 · 다시보기",
];

export function ScopeCompare() {
  return (
    <section aria-labelledby="sample-scope" className="mx-auto w-full max-w-[720px] px-5 py-12 md:py-16">
      <h2 id="sample-scope" className="text-[22px] leading-snug font-bold tracking-tight md:text-[26px]">
        무료와 심층 리포트, 무엇이 다른가요
      </h2>
      <p className="mt-2 text-[15px] leading-[1.7] text-ink-2">무료 리포트는 핵심을 끝까지 풀어 주고, 심층 리포트는 삶의 영역과 해석의 깊이를 넓혀요. 가격과 이용 조건은 아래에서 확인할 수 있어요.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-canvas p-6 shadow-soft">
          <p className="text-[15px] font-semibold text-ink-2">{REPORT_TIER_NAMES.simple}</p>
          <p className="mt-2 text-[30px] font-bold tracking-tight">무료</p>
          <p className="mt-1 text-[14px] text-ink-3">약 7분 · 시작은 로그인 없이</p>
          <ul className="mt-5 space-y-2.5 border-t border-line pt-5 text-[15px]">
            {FREE_ITEMS.map((t) => (
              <li key={t} className="flex gap-2">
                <CheckIcon className="mt-1 size-4 shrink-0 text-ink-3" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl bg-canvas p-6 shadow-soft ring-1 ring-accent/40">
          <p className="text-[15px] font-semibold text-accent-strong">{PERSONAL_REPORT.name}</p>
          <p className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="text-[30px] font-bold tracking-tight tabular-nums">{formatKrw(PERSONAL_REPORT.priceKrw)}</span>
            <StatusBadge>가격 {PERSONAL_REPORT.priceNote}</StatusBadge>
          </p>
          <p className="mt-1 text-[14px] text-ink-3">단건 구매 · 구독 아님 · 카드 결제</p>
          <ul className="mt-5 space-y-2.5 border-t border-line pt-5 text-[15px]">
            {DEEP_ITEMS.map((t) => (
              <li key={t} className="flex gap-2">
                <CheckIcon className="mt-1 size-4 shrink-0 text-accent" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-5 text-[14px] leading-[1.65] text-ink-2">
        <span className="font-semibold">정보 입력 · 질문 응답</span> → <span className="font-semibold">무료 결과 확인</span> → <span className="font-semibold">로그인 · 필요한 경우 구매</span>
      </p>

      <details className="group mt-5 border-y border-line">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-semibold hover:text-accent [&::-webkit-details-marker]:hidden">
          전체 제공 항목과 상담 이용 횟수 보기
          <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
        </summary>
        <div className="pb-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left">
              <thead>
                <tr className="border-b border-ink text-[13px] text-ink-2">
                  <th scope="col" className="px-3 py-3 font-semibold md:px-4">
                    항목
                  </th>
                  <th scope="col" className="w-[120px] px-1 py-3 text-center font-semibold md:w-40">
                    {REPORT_TIER_NAMES.simple}
                  </th>
                  <th scope="col" className="w-[120px] px-1 py-3 text-center font-semibold text-accent md:w-40">
                    {REPORT_TIER_NAMES.deep}
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
                    <td className="px-1 py-3.5 text-center text-[13px] leading-snug text-ink-2">{row.free ?? <NotIncluded />}</td>
                    <td className="px-1 py-3.5 text-center text-[13px] font-semibold leading-snug text-accent">{row.paid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-5 space-y-2 text-[14px] leading-[1.7] text-ink-2">
            <li>
              {REPORT_TIER_NAMES.simple}: 오늘의 운세(하루 무료 질문 {CHAT_ROOMS.simple.daily}번) · 연애(무료 질문 {CHAT_ROOMS.simple.love}번) · 고민 상담(무료 질문 {CHAT_ROOMS.simple.concern}번) 방이 열려요. 나를 알아보기 방은 질문 없이 분석 한 장과 주제별 풀이를 보여 드려요.
            </li>
            <li>
              {REPORT_TIER_NAMES.deep}: 올해의 흐름 · 결혼 · 일 · 진로 · 재무까지 모든 방이 열리고 방마다 무료 질문 {CHAT_ROOMS.deepFreeQuestions}번을 드려요.
            </li>
            <li>무료 질문을 모두 쓴 뒤 이어서 묻는 방법은 채팅 화면에서 안내해요.</li>
          </ul>
        </div>
      </details>

      <div className="mt-6">
        <Link href="/analyze" className={`${buttonPrimary} w-full sm:w-auto sm:px-10`}>
          내 사주 무료로 보기
        </Link>
      </div>
    </section>
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
