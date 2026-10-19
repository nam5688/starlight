"use client";

import { MiyuAvatar } from "@/components/talk/miyu-character";
import { useEffect, useRef, useState } from "react";
import { ChevronIcon, InfoIcon } from "@/components/ui/icons";
import { renderCompatCardPng } from "@/components/talk/card-image";
import { Prose } from "@/components/ui/prose";
import { buttonSecondary } from "@/components/ui/styles";
import { shareTextOf, type SimpleCompatCard } from "@/lib/compat/simple";

/**
 * 간단 궁합(무료) 결과 — 커플 유형 · 궁합 지수 · 핵심 한 줄 · 읽힌 점. 사주 궁합 엔진 결과의 대표 한 장이다.
 * 총점은 확률이 아니라 재미 · 참고용 지수라는 안내와 계산 재료를 함께 보인다. 아래 "다음 단계"(사주 궁합 · 리포트 궁합 안내)는 판매 스위치를 읽는 서버 컴포넌트(nextSteps)가 그려서 실제 열림 상태와 어긋나지 않는다.
 * 본문 글은 `Prose`로 문장마다 줄을 바꾸고 짧은 두 문장만 묶는다(저장 · 계산 값은 그대로, 보이는 방식만).
 */
export function CompatResult({ card, onReset, nextSteps }: { card: SimpleCompatCard; onReset: () => void; nextSteps?: React.ReactNode }) {
  const rel = card.relation;
  const showType = !rel || rel.showType;
  const heading = rel ? rel.heading : card.typeName;
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  const [imageState, setImageState] = useState<"idle" | "busy" | "saved" | "failed">("idle");
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const placed = useRef(false);

  // 결과가 화면에 그려진 뒤(이 컴포넌트가 붙은 뒤) 한 번만 결과 맨 위로 옮긴다 — 입력 칸이 사라지고 결과로 바뀌면 문서 길이가 달라져
  // 이전 위치가 결과 중간이 되므로 제출 직후에 옮기면(렌더 전에 실행될 수 있다) 어긋난다.
  // 고정 머리글은 html의 scroll-padding-top이 비켜 준다. 전체 스크롤을 건드리지 않고 이 결과만 옮기며, 초점도 제목으로 옮겨 키보드 · 보조기기가 결과부터 읽는다(스크롤 없이).
  useEffect(() => {
    if (placed.current) return;
    placed.current = true;
    sectionRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  // 공유 이미지(생년월일 없음) — 이 기기 안에서 만들고 서버로 보내지 않는다. 파일 공유를 지원하면 공유 창을, 아니면 저장한다
  const shareImage = async () => {
    setImageState("busy");
    try {
      const blob = await renderCompatCardPng(card);
      const file = new File([blob], "miyu-compat-card.png", { type: "image/png" });
      if (typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `${heading} · 미유 궁합` });
        setImageState("idle");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "miyu-compat-card.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setImageState("saved");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return setImageState("idle");
      setImageState("failed");
    }
  };

  const share = async () => {
    const text = shareTextOf(card);
    const url = typeof window !== "undefined" ? `${window.location.origin}/compat` : "";
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: `${heading} · 미유 궁합`, text, url });
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
    <section ref={sectionRef} id="compat-result" aria-labelledby="compat-result-title" className="space-y-5">
      <div className="rounded-2xl bg-canvas p-6 text-center shadow-soft md:p-8">
        <MiyuAvatar tone="love" className="mx-auto mb-3 size-14" />
        <p className="text-[14px] font-medium text-ink-3">
          {card.names.a} × {card.names.b}
        </p>
        {rel && <p className="mx-auto mt-2 w-fit rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold text-accent-strong">{rel.label} 사이로 읽었어요</p>}
        <h2 ref={titleRef} id="compat-result-title" tabIndex={-1} className="mt-2 text-[28px] leading-tight font-bold tracking-tight break-keep text-accent-strong outline-none md:text-[34px]">
          {heading}
        </h2>
        <p className="mx-auto mt-3 max-w-[30rem] text-[17px] leading-[1.65] text-ink">{showType ? card.typeLine : rel!.frame.lens}</p>

        <div className="mt-6 border-t border-line pt-6">
          <p className="text-[13px] font-semibold text-ink-3">궁합 지수</p>
          <p className="mt-1 text-[56px] leading-none font-bold tracking-tight text-ink tabular-nums" aria-label={`궁합 지수 ${card.score}`}>
            {card.score}
          </p>
          <p className="mx-auto mt-3 max-w-[30rem] text-[15px] leading-[1.7] text-ink-2">{card.scoreMeaning}</p>
          <p className="mx-auto mt-2 max-w-[30rem] text-[13px] leading-[1.7] text-ink-3">{card.notes.scoreNotProbability}</p>
        </div>

        {showType && (
          <p className="mx-auto mt-6 max-w-[30rem] rounded-xl bg-accent-soft px-4 py-3 text-[15px] leading-[1.65] font-semibold text-accent-strong">
            <span className="block text-[13px] font-semibold text-accent">우리 커플 핵심</span>
            {card.core}
          </p>
        )}

        <div className="mt-6 flex flex-col items-center gap-2">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button type="button" onClick={shareImage} disabled={imageState === "busy"} className={`${buttonSecondary} w-full sm:w-auto`}>
              {imageState === "busy" ? "이미지 만드는 중…" : "이미지로 공유하기"}
            </button>
            <button type="button" onClick={share} className={`${buttonSecondary} w-full sm:w-auto`}>
              글로 공유하기
            </button>
          </div>
          <p role="status" className="min-h-5 text-[13px] text-ink-3">
            {imageState === "saved"
              ? "이미지를 저장했어요. 사진첩(또는 다운로드 폴더)을 확인해 보세요."
              : imageState === "failed"
                ? "이미지를 만들지 못했어요. 글로 공유하거나 화면을 캡처해 주세요."
                : shareState === "copied"
                  ? "공유할 글을 복사했어요. 붙여넣어 보내 주세요."
                  : shareState === "failed"
                    ? "공유하지 못했어요. 화면을 캡처해서 보내 주세요."
                    : showType ? "이름 · 커플 유형 · 지수만 담겨요. 생년월일은 담기지 않아요." : "이름 · 사이 · 지수만 담겨요. 생년월일은 담기지 않아요."}
          </p>
        </div>
      </div>

      {rel && (
        <div className="rounded-2xl bg-canvas p-5 shadow-soft md:p-6" data-relation-frame={rel.id}>
          <h3 className="text-[17px] font-bold">{rel.frame.title}</h3>
          <Prose text={rel.frame.lens} className="mt-3 text-[15px] leading-[1.75] text-ink-2" />
          <dl className="mt-4 space-y-4 text-[15px] leading-[1.75]">
            <div>
              <dt className="text-[13px] font-semibold text-positive">잘 맞는 모습</dt>
              <dd className="mt-1 space-y-2 text-ink-2">
                <Prose text={rel.frame.fit} />
                {rel.frame.goodScenes.map((t) => (
                  <Prose key={t} text={t} />
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-caution">차이가 나타나는 상황</dt>
              <dd className="mt-1 space-y-2 text-ink-2">
                <Prose text={rel.frame.friction} />
                {rel.frame.careScenes.map((t) => (
                  <Prose key={t} text={t} />
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-ink-3">서로 이해해 볼 점</dt>
              <dd className="mt-1 text-ink-2">
                <Prose text={rel.frame.understand} />
              </dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-accent">지금 해 볼 행동</dt>
              <dd className="mt-1 space-y-2 text-ink-2">
                {rel.frame.doNow.map((t) => (
                  <Prose key={t} text={t} />
                ))}
              </dd>
            </div>
          </dl>
          <p className="mt-4 flex gap-2 text-[13px] leading-[1.7] text-ink-3">
            <InfoIcon className="mt-1 size-4 shrink-0" />
            <span>{rel.frame.note}</span>
          </p>
        </div>
      )}

      <div className="rounded-2xl bg-canvas p-5 shadow-soft md:p-6">
        <h3 className="text-[17px] font-bold">두 사람이 함께 있을 때</h3>
        <Prose text={card.explain[0]} className="mt-3 text-[15px] leading-[1.75] text-ink-2" />
        <Prose text={card.explain[1]} className="mt-2 text-[15px] leading-[1.75] text-ink-2" />
        {!rel && (
          <dl className="mt-4 space-y-3 text-[15px] leading-[1.7]">
            <div>
              <dt className="text-[13px] font-semibold text-positive">잘 맞는 모습</dt>
              <dd className="mt-1 space-y-1.5 text-ink-2">
                {card.good.length ? card.good.map((t) => <Prose key={t} text={t} />) : <Prose text="서로 닿는 부분은 두드러지지 않아요. 맞춰 가며 만들어 가는 모양이에요." />}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-caution">차이가 나타나는 상황</dt>
              <dd className="mt-1 space-y-1.5 text-ink-2">
                {card.care.length ? card.care.map((t) => <Prose key={t} text={t} />) : <Prose text="크게 부딪히는 부분은 두드러지지 않아요." />}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-ink-3">움직이는 속도</dt>
              <dd className="mt-1 text-ink-2">
                <Prose text={`${card.pace}.`} />
              </dd>
            </div>
          </dl>
        )}
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

      {nextSteps}

      <div className="text-center">
        <button type="button" onClick={onReset} className="text-[15px] font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
          다른 두 사람으로 다시 보기
        </button>
      </div>
    </section>
  );
}
