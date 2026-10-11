"use client";

import Link from "next/link";
import { CoreSummaryTable, SCORE_NOTE, ScoreGroups, SectionTitle, TendencyBlock } from "@/components/report/summary-blocks";
import { LockIcon } from "@/components/ui/icons";
import { SourceBadge, StatusBadge } from "@/components/ui/source-badge";
import { buttonDisabled, buttonSecondary, textLink } from "@/components/ui/styles";
import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import { INTEGRATIONS } from "@/lib/config/integrations";
import { formatKrw, PERSONAL_REPORT } from "@/lib/config/product";
import { formatBirth, type BasicInfo } from "@/lib/profile/basic-info";
import type { FreeSummary } from "@/lib/report/types";

const LOCKED_ITEMS = [
  "네 가지 상세 분석 — MBTI · 기질 · 애착 · 사주를 근거와 한계와 함께",
  "통합 해석 — 공통점과 서로 다른 관점",
  "실천 제안",
  "MY에 저장하고 같은 버전으로 다시보기",
];

/**
 * 무료 요약. 상세 리포트 내용은 이 화면에 내려오지 않는다 (가림 처리가 아니라 아예 없음).
 * 로그인·구매는 연결 전이라 버튼이 동작하지 않는다.
 */
export function FreeSummaryView({
  summary,
  info,
  onEdit,
  onRestart,
}: {
  summary: FreeSummary;
  info: BasicInfo;
  onEdit: () => void;
  onRestart: () => void;
}) {
  const itemCount = (id: string) => ASSESSMENT_MODULES.find((m) => m.id === id)?.items.length ?? 0;
  const region = [info.regionProvince, info.regionDistrict.trim()].filter(Boolean).join(" ");

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 md:px-8 md:py-14">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SourceBadge source={summary.source} />
        <span className="text-[13px] text-ink-3">개발용 예시 문항과 임시 규칙으로 계산 · 실제 분석 결과가 아닙니다</span>
      </div>
      <h1 id="step-heading" tabIndex={-1} className="mt-3 text-[26px] font-bold tracking-tight outline-none md:text-[30px]">
        {info.nickname.trim()} 님의 무료 요약
      </h1>

      <div className="mt-10 space-y-16">
        <section aria-labelledby="free-tendency">
          <TendencyBlock summary={summary} headingId="free-tendency" />
        </section>

        <section aria-labelledby="free-core">
          <SectionTitle id="free-core">핵심 요약</SectionTitle>
          <CoreSummaryTable core={summary.core} />
        </section>

        <section aria-labelledby="free-scores">
          <SectionTitle id="free-scores" note={SCORE_NOTE}>
            항목별 점수
          </SectionTitle>
          <ScoreGroups summary={summary} />
        </section>

        <section aria-labelledby="free-status">
          <SectionTitle id="free-status" note="네 가지 관점은 각각 따로 계산하며, 사주와 심리검사 점수를 합산하지 않습니다.">
            분석에 사용한 정보
          </SectionTitle>
          <table className="w-full border-collapse text-left text-[15px]">
            <thead className="sr-only">
              <tr>
                <th scope="col">관점</th>
                <th scope="col">상태</th>
              </tr>
            </thead>
            <tbody className="border-t border-ink">
              <StatusRow name="MBTI 성향">
                개발용 예시 문항 {itemCount("mbti")}개로 계산
                {info.knownMbti && (
                  <span className="mt-1 block text-ink-3">본인이 입력한 MBTI {info.knownMbti} — 참고값으로 따로 보관</span>
                )}
              </StatusRow>
              <StatusRow name="기질">개발용 예시 문항 {itemCount("temperament")}개로 계산</StatusRow>
              <StatusRow name="관계(애착)">개발용 예시 문항 {itemCount("relationship")}개로 계산</StatusRow>
              <StatusRow name="사주">
                <span className="flex flex-wrap items-center gap-2">
                  만세력 계산 연결 전
                  <StatusBadge>{INTEGRATIONS.sajuEngine.stage}단계</StatusBadge>
                </span>
                <span className="mt-1 block text-ink-3">입력값: {formatBirth(info)}</span>
              </StatusRow>
              {region && (
                <StatusRow name="활동 지역">
                  {region}
                  <span className="mt-1 block text-ink-3">성향 분석에 사용하지 않음 · 장소 추천용</span>
                </StatusRow>
              )}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="free-locked" className="overflow-hidden rounded-xl border border-line-strong">
          <div className="border-b border-line px-5 py-5 md:px-7">
            <h2 id="free-locked" className="text-[20px] font-bold tracking-tight">
              {PERSONAL_REPORT.name}에서 이어지는 내용
            </h2>
            <ul className="mt-4 space-y-2.5">
              {LOCKED_ITEMS.map((item) => (
                <li key={item} className="flex gap-2.5 text-[15px] leading-relaxed">
                  <LockIcon className="mt-1 size-4 shrink-0 text-ink-3" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[24px] font-bold tabular-nums">{formatKrw(PERSONAL_REPORT.priceKrw)}</span>
              <StatusBadge>가격 {PERSONAL_REPORT.priceNote}</StatusBadge>
              <span className="text-[14px] text-ink-3">단건 구매</span>
            </p>
          </div>

          <ol className="divide-y divide-line">
            <PurchaseStep
              index={1}
              title="카카오 로그인"
              detail="결과를 회원 정보에 저장합니다."
              stage={INTEGRATIONS.kakaoLogin.stage}
              action="카카오로 로그인"
            />
            <PurchaseStep
              index={2}
              title="리포트 구매"
              detail="결제가 서버에서 확인된 뒤에 상세 리포트를 제공합니다."
              stage={INTEGRATIONS.payments.stage}
              action={`${formatKrw(PERSONAL_REPORT.priceKrw)} 결제하기`}
            />
          </ol>
          <p className="border-t border-line bg-mist px-5 py-4 text-[14px] leading-relaxed text-ink-2 md:px-7">
            로그인과 결제는 아직 연결되지 않아 버튼이 동작하지 않습니다. 상세 리포트가 어떻게 보이는지는{" "}
            <Link href="/report/sample" className={textLink}>
              리포트 예시
            </Link>
            에서 확인할 수 있습니다.
          </p>
        </section>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={onEdit} className={buttonSecondary}>
              답변 수정하기
            </button>
            <button type="button" onClick={onRestart} className={buttonSecondary}>
              처음부터 다시
            </button>
          </div>
          <p className="text-[14px] leading-relaxed text-ink-3">
            이 결과는 저장되지 않습니다. 새로고침하거나 페이지를 벗어나면 사라집니다.
          </p>
        </div>
      </div>
    </main>
  );
}

function StatusRow({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-line align-top">
      <th scope="row" className="w-28 py-4 pr-4 text-[14px] font-semibold text-ink-2 md:w-40">
        {name}
      </th>
      <td className="py-4">{children}</td>
    </tr>
  );
}

function PurchaseStep({
  index,
  title,
  detail,
  stage,
  action,
}: {
  index: number;
  title: string;
  detail: string;
  stage: number;
  action: string;
}) {
  return (
    <li className="grid gap-3 px-5 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-7">
      <div className="flex gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-[13px] font-semibold tabular-nums text-ink-2">
          {index}
        </span>
        <div>
          <p className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
            {title} <StatusBadge>연결 전 · {stage}단계</StatusBadge>
          </p>
          <p className="mt-0.5 text-[14px] text-ink-3">{detail}</p>
        </div>
      </div>
      <button type="button" disabled className={`${buttonDisabled} w-full md:w-auto`}>
        {action}
      </button>
    </li>
  );
}

