"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveResultAndContinue } from "@/app/analyze/actions";
import { KakaoSymbol, kakaoButtonClass } from "@/components/auth/kakao-login-button";
import { FreePreviewBody } from "@/components/report/free-preview-body";
import { IdentityCard } from "@/components/results/identity-card";
import { CheckIcon } from "@/components/ui/icons";
import { SourceBadge, StatusBadge } from "@/components/ui/source-badge";
import { buttonSecondary, textLink } from "@/components/ui/styles";
import type { Answers } from "@/lib/assessment/types";
import { formatKrw, PERSONAL_REPORT } from "@/lib/config/product";
import type { BasicInfo } from "@/lib/profile/basic-info";
import type { IdentityTypeView } from "@/lib/report/identity";
import type { FreePreview } from "@/lib/report/preview";

/**
 * 검사 직후의 무료 미리보기. 공개 범위만 서버에서 내려오고, 잠긴 내용은 이 화면에 없다 (가림 처리가 아니라 아예 없음).
 * 카카오 로그인으로 결과를 저장한 뒤, 결과 화면에서 구매한다.
 */
export function FreeSummaryView({
  preview,
  identityType,
  info,
  answers,
  authReady,
  onEdit,
  onRestart,
}: {
  preview: FreePreview;
  /** 저장 후 결과 화면 맨 위와 같은 "나의 유형" 카드(개인 유형 표시가 꺼져 있으면 null) */
  identityType: IdentityTypeView | null;
  info: BasicInfo;
  answers: Answers;
  authReady: boolean;
  onEdit: () => void;
  onRestart: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(via: "kakao" | "email" = "kakao") {
    setError(null);
    startTransition(async () => {
      // 성공하면 서버가 로그인 화면(또는 결과 화면)으로 이동시킨다
      const result = await saveResultAndContinue({ info, answers }, via);
      if (result && !result.ok) setError(result.message);
    });
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 md:px-8 md:py-14">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SourceBadge source={preview.source} />
        <span className="text-[13px] text-ink-3">개발용 예시 문항과 임시 규칙으로 계산 · 실제 분석 결과가 아니에요</span>
      </div>
      <h1 id="step-heading" tabIndex={-1} className="mt-3 text-[26px] font-bold tracking-tight outline-none md:text-[30px]">
        {info.nickname.trim()} 님의 무료 미리보기
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">내 결과의 일부를 먼저 보여 드려요. 결과를 저장하면 결과 화면에서 이어서 볼 수 있고, 심층 리포트는 그곳에서 구매할 수 있어요.</p>

      <div className="mt-10 space-y-16">
        {/* 저장 전에도 저장 후와 같은 순서로: 나의 유형 → 풀이 (같은 입력이면 같은 이름 · 설명) */}
        <div className="space-y-12">
          {identityType && <IdentityCard identity={{ type: identityType, lucky: null }} showType showLucky={false} idPrefix="free-id-" inline />}
          <FreePreviewBody preview={preview} idPrefix="free-" />
        </div>

        <section id="free-locked" aria-labelledby="free-locked-title" className="overflow-hidden rounded-xl border border-line-strong">
          <div className="border-b border-line px-5 py-5 md:px-7">
            <h2 id="free-locked-title" className="text-[20px] font-bold tracking-tight">
              {PERSONAL_REPORT.name}에서 이어지는 내용
            </h2>
            <ul className="mt-4 space-y-2.5">
              {preview.locked.map((item) => (
                <li key={item.id} className="flex gap-2.5 text-[15px] leading-relaxed">
                  <CheckIcon className="mt-1 size-4 shrink-0 text-accent" />
                  {item.title}
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
              <Step index={1} title="로그인하고 결과 저장" detail="이 결과가 회원 정보에 저장돼요." />
              {authReady ? (
                <div className="flex flex-col items-stretch gap-2 md:items-end">
                  <button type="button" onClick={() => save("kakao")} disabled={pending} aria-busy={pending} className={`${kakaoButtonClass} w-full md:w-auto`}>
                    <KakaoSymbol />
                    {pending ? "이동 중…" : "카카오로 로그인하고 저장"}
                  </button>
                  <button type="button" onClick={() => save("email")} disabled={pending} className={`${textLink} min-h-11 text-center text-[15px] disabled:opacity-50`}>
                    이메일로 로그인 · 가입하고 저장
                  </button>
                </div>
              ) : (
                <p className="text-[14px] text-ink-3 md:text-right">
                  <StatusBadge>로그인 설정 전</StatusBadge>
                </p>
              )}
            </li>
            <li className="px-5 py-5 md:px-7">
              <Step index={2} title="결과 화면에서 리포트 구매" detail="결제가 서버에서 확인된 뒤에 상세 리포트를 제공해요." />
            </li>
          </ol>
          {error && (
            <p role="alert" className="border-t border-line px-5 py-3 text-[15px] font-medium text-danger md:px-7">
              {error}
            </p>
          )}
          <p className="border-t border-line bg-mist px-5 py-4 text-[14px] leading-relaxed text-ink-2 md:px-7">
            {authReady
              ? "로그인하는 동안 검사 결과는 암호화해 30분만 보관하고, 저장이 끝나면 지워요. "
              : "로그인이 아직 설정되지 않아 저장할 수 없어요. "}
            구매하면 어떤 리포트를 받는지는{" "}
            <Link href="/report/sample" className={textLink}>
              리포트 예시
            </Link>
            에서 확인할 수 있어요.
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
          <p className="text-[14px] leading-relaxed text-ink-3">저장하지 않으면 새로고침하거나 페이지를 벗어날 때 이 결과가 사라져요.</p>
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
