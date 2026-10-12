"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveResultAndContinue } from "@/app/analyze/actions";
import { KakaoSymbol, kakaoButtonClass } from "@/components/auth/kakao-login-button";
import { FreeSummaryBody } from "@/components/report/free-summary-body";
import { LockIcon } from "@/components/ui/icons";
import { SourceBadge, StatusBadge } from "@/components/ui/source-badge";
import { buttonSecondary, textLink } from "@/components/ui/styles";
import type { Answers } from "@/lib/assessment/types";
import { formatKrw, PERSONAL_REPORT } from "@/lib/config/product";
import { formatBirth, type BasicInfo } from "@/lib/profile/basic-info";
import type { FreeSummary } from "@/lib/report/types";
import type { SajuResult } from "@/lib/saju/engine";

const LOCKED_ITEMS = [
  "네 가지 상세 분석 — MBTI · 기질 · 애착 · 사주를 근거와 한계와 함께",
  "통합 해석 — 공통점과 서로 다른 관점",
  "실천 제안",
  "MY에 저장하고 같은 버전으로 다시보기",
];

/**
 * 검사 직후의 무료 요약. 상세 리포트 내용은 이 화면에 내려오지 않는다 (가림 처리가 아니라 아예 없음).
 * 카카오 로그인으로 결과를 저장한 뒤, 결과 화면에서 구매한다.
 */
export function FreeSummaryView({
  summary,
  saju,
  info,
  answers,
  authReady,
  onEdit,
  onRestart,
}: {
  summary: FreeSummary;
  saju: SajuResult;
  info: BasicInfo;
  answers: Answers;
  authReady: boolean;
  onEdit: () => void;
  onRestart: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const region = [info.regionProvince, info.regionDistrict.trim()].filter(Boolean).join(" ") || null;

  function save() {
    setError(null);
    startTransition(async () => {
      // 성공하면 서버가 카카오 로그인(또는 결과 화면)으로 이동시킨다
      const result = await saveResultAndContinue({ info, answers });
      if (result && !result.ok) setError(result.message);
    });
  }

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
        <FreeSummaryBody
          summary={summary}
          idPrefix="free-"
          knownMbti={info.knownMbti || null}
          birthText={formatBirth(info)}
          region={region}
          saju={saju}
        />

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
            <li className="grid gap-3 px-5 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-7">
              <Step index={1} title="카카오 로그인하고 결과 저장" detail="이 결과가 회원 정보에 저장됩니다." />
              {authReady ? (
                <button type="button" onClick={save} disabled={pending} aria-busy={pending} className={`${kakaoButtonClass} w-full md:w-auto`}>
                  <KakaoSymbol />
                  {pending ? "이동 중…" : "카카오로 로그인하고 저장"}
                </button>
              ) : (
                <p className="text-[14px] text-ink-3 md:text-right">
                  <StatusBadge>로그인 설정 전</StatusBadge>
                </p>
              )}
            </li>
            <li className="px-5 py-5 md:px-7">
              <Step index={2} title="결과 화면에서 리포트 구매" detail="결제가 서버에서 확인된 뒤에 상세 리포트를 제공합니다." />
            </li>
          </ol>
          {error && (
            <p role="alert" className="border-t border-line px-5 py-3 text-[15px] font-medium text-danger md:px-7">
              {error}
            </p>
          )}
          <p className="border-t border-line bg-mist px-5 py-4 text-[14px] leading-relaxed text-ink-2 md:px-7">
            {authReady
              ? "로그인하는 동안 검사 결과는 암호화해 30분만 보관하고, 저장이 끝나면 지웁니다. "
              : "로그인이 아직 설정되지 않아 저장할 수 없습니다. "}
            상세 리포트가 어떻게 보이는지는{" "}
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
            저장하지 않으면 새로고침하거나 페이지를 벗어날 때 이 결과가 사라집니다.
          </p>
        </div>
      </div>
    </main>
  );
}

function Step({ index, title, detail }: { index: number; title: string; detail: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-[13px] font-semibold tabular-nums text-ink-2">
        {index}
      </span>
      <div>
        <p className="text-[16px] font-semibold">{title}</p>
        <p className="mt-0.5 text-[14px] text-ink-3">{detail}</p>
      </div>
    </div>
  );
}
