"use client";

import { useState } from "react";
import { ChevronIcon, InfoIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonDisabled, buttonSecondary } from "@/components/ui/styles";
import { shareTextOf, type SimpleCompatCard } from "@/lib/compat/simple";

/**
 * 간단 궁합(무료) 결과 — 커플 유형 · 궁합 지수 · 핵심 한 줄 · 읽힌 점. 사주 궁합 엔진 결과의 대표 한 장이다.
 * 총점은 확률이 아니라 재미 · 참고용 지수라는 안내와 계산 재료를 함께 보이고, 사주 궁합 · 리포트 궁합은 아직 열리지 않아 "준비 중"으로만 안내한다(가격 · 이용 범위는 정해지면 안내).
 */
export function CompatResult({ card, onReset }: { card: SimpleCompatCard; onReset: () => void }) {
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");

  const share = async () => {
    const text = shareTextOf(card);
    const url = typeof window !== "undefined" ? `${window.location.origin}/compat` : "";
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: `${card.typeName} · 미유 궁합`, text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareState("copied");
    } catch (e) {
      // 공유 창을 닫은 것은 오류로 보지 않는다
      if (e instanceof DOMException && e.name === "AbortError") return;
      setShareState("failed");
    }
  };

  return (
    <section id="compat-result" aria-labelledby="compat-result-title" className="space-y-5">
      <div className="rounded-2xl bg-canvas p-6 text-center shadow-soft md:p-8">
        <p className="text-[14px] font-medium text-ink-3">
          {card.names.a} × {card.names.b}
        </p>
        <h2 id="compat-result-title" className="mt-2 text-[28px] leading-tight font-bold tracking-tight text-accent-strong md:text-[34px]">
          {card.typeName}
        </h2>
        <p className="mx-auto mt-3 max-w-[30rem] text-[17px] leading-[1.65] text-ink">{card.typeLine}</p>

        <div className="mt-6 border-t border-line pt-6">
          <p className="text-[13px] font-semibold text-ink-3">궁합 지수</p>
          <p className="mt-1 text-[56px] leading-none font-bold tracking-tight text-ink tabular-nums" aria-label={`궁합 지수 ${card.score}`}>
            {card.score}
          </p>
          <p className="mx-auto mt-3 max-w-[30rem] text-[15px] leading-[1.7] text-ink-2">{card.scoreMeaning}</p>
          <p className="mx-auto mt-2 max-w-[30rem] text-[13px] leading-[1.7] text-ink-3">{card.notes.scoreNotProbability}</p>
        </div>

        <p className="mx-auto mt-6 max-w-[30rem] rounded-xl bg-accent-soft px-4 py-3 text-[15px] leading-[1.65] font-semibold text-accent-strong">
          <span className="block text-[13px] font-semibold text-accent">우리 커플 핵심</span>
          {card.core}
        </p>

        <div className="mt-6 flex flex-col items-center gap-2">
          <button type="button" onClick={share} className={`${buttonSecondary} w-full sm:w-auto`}>
            결과 공유하기
          </button>
          <p role="status" className="min-h-5 text-[13px] text-ink-3">
            {shareState === "copied" ? "공유할 글을 복사했어요. 붙여넣어 보내 주세요." : shareState === "failed" ? "공유하지 못했어요. 화면을 캡처해서 보내 주세요." : "이름 · 커플 유형 · 지수만 담겨요. 생년월일은 담기지 않아요."}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-canvas p-5 shadow-soft md:p-6">
        <h3 className="text-[17px] font-bold">두 사주에서 읽힌 점</h3>
        <p className="mt-3 text-[15px] leading-[1.75] text-ink-2">{card.explain[0]}</p>
        <p className="mt-2 text-[15px] leading-[1.75] text-ink-2">{card.explain[1]}</p>
        <dl className="mt-4 space-y-3 text-[15px] leading-[1.7]">
          <div>
            <dt className="text-[13px] font-semibold text-positive">잘 맞는 곳</dt>
            <dd className="mt-1 text-ink-2">{card.good.length ? card.good.join(" · ") : "서로 닿는 부분은 두드러지지 않아요. 맞춰 가며 만들어 가는 모양이에요."}</dd>
          </div>
          <div>
            <dt className="text-[13px] font-semibold text-caution">맞춰 볼 곳</dt>
            <dd className="mt-1 text-ink-2">{card.care.length ? card.care.join(" · ") : "크게 부딪히는 부분은 두드러지지 않아요."}</dd>
          </div>
          <div>
            <dt className="text-[13px] font-semibold text-ink-3">움직이는 속도</dt>
            <dd className="mt-1 text-ink-2">{card.pace}.</dd>
          </div>
        </dl>
        {card.cautions.map((c) => (
          <p key={c} className="mt-4 flex gap-2 text-[13px] leading-[1.7] text-ink-3">
            <InfoIcon className="mt-1 size-4 shrink-0" />
            <span>{c}</span>
          </p>
        ))}

        <details className="group mt-5 border-y border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[15px] font-semibold hover:text-accent [&::-webkit-details-marker]:hidden">
            이 지수는 이렇게 계산했어요
            <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
          </summary>
          <div className="pb-5 text-[14px] leading-[1.75] text-ink-2">
            <p>{card.notes.scoreBasis}</p>
            {card.basis.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {card.basis.map((b) => (
                  <li key={b.label}>
                    <span className="font-semibold text-ink">{b.label}</span> — {b.direction}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-ink-3">{card.notes.tradition}</p>
          </div>
        </details>
      </div>

      <div className="rounded-2xl bg-canvas p-5 shadow-soft md:p-6">
        <h3 className="text-[17px] font-bold">이건 두 사람의 사주만으로 본 간단 궁합이에요</h3>
        <p className="mt-2 text-[15px] leading-[1.75] text-ink-2">왜 잘 맞는지, 어디에서 부딪히는지는 두 사주를 더 자세히 풀어야 알 수 있어요. 두 사람이 각자 답한 성격 · 기질 · 애착까지 함께 보면, 같은 사주 위에서 실제로 어떻게 다르게 반응하는지까지 이야기할 수 있어요.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <li className="rounded-xl bg-page p-4">
            <p className="flex flex-wrap items-center gap-2 text-[16px] font-bold">
              사주 궁합 <StatusBadge>준비 중</StatusBadge>
            </p>
            <p className="mt-2 text-[14px] leading-[1.7] text-ink-2">두 사람의 타고난 관계 흐름을 자세히 풀어요. 같은 계산 위에서 이 결과를 더 길게 읽어요.</p>
            <button type="button" disabled aria-disabled="true" className={`${buttonDisabled} mt-3 w-full`}>
              자세히 보기 · 준비 중
            </button>
          </li>
          <li className="rounded-xl bg-page p-4">
            <p className="flex flex-wrap items-center gap-2 text-[16px] font-bold">
              리포트 궁합 <StatusBadge>준비 중</StatusBadge>
            </p>
            <p className="mt-2 text-[14px] leading-[1.7] text-ink-2">두 사람의 사주에 각자가 직접 답한 성격과 관계 반응까지 함께 비교해요.</p>
            <button type="button" disabled aria-disabled="true" className={`${buttonDisabled} mt-3 w-full`}>
              리포트로 보기 · 준비 중
            </button>
          </li>
        </ul>
        <p className="mt-3 text-[13px] leading-[1.7] text-ink-3">사주 궁합과 리포트 궁합은 개인 심층 리포트와 별도 서비스예요. 아직 열리지 않았고, 이용 범위와 가격은 정해지면 안내해요.</p>
      </div>

      <div className="text-center">
        <button type="button" onClick={onReset} className="text-[15px] font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
          다른 두 사람으로 다시 보기
        </button>
      </div>
    </section>
  );
}
