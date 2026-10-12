"use client";

import { useState, useTransition } from "react";
import { submitFeedbackAction } from "@/app/results/[id]/feedback-actions";

const LABEL: Record<number, string> = { 1: "아쉬웠어요", 2: "조금 아쉬웠어요", 3: "보통이에요", 4: "도움이 됐어요", 5: "많이 도움이 됐어요" };

/** 구매 후 만족도 — 리포트 개선과 환불 · 품질 점검에만 쓰며 다른 곳에 보내지 않는다 */
export function ReportFeedback({ reportId, initial }: { reportId: string; initial: number | null }) {
  const [rating, setRating] = useState<number | null>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choose = (value: number) =>
    start(async () => {
      setMessage(null);
      try {
        const res = await submitFeedbackAction(reportId, value);
        if (res.ok) {
          setRating(value);
          setMessage("남겨 주셔서 고맙습니다. 언제든 다시 눌러 바꿀 수 있어요.");
        } else setMessage("지금은 저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
      } catch {
        setMessage("연결이 불안정해 저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
      }
    });

  return (
    <section aria-labelledby="feedback-title" className="border-y border-line py-5">
      <h2 id="feedback-title" className="text-[16px] font-semibold">
        이 리포트가 도움이 되었나요?
      </h2>
      <div role="radiogroup" aria-labelledby="feedback-title" className="mt-3 grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={rating === v}
            aria-label={`${v}점 ${LABEL[v]}`}
            disabled={pending}
            onClick={() => choose(v)}
            className={`h-12 rounded-lg border text-[16px] font-semibold tabular-nums transition-colors ${rating === v ? "border-accent bg-accent text-white" : "border-line-strong hover:bg-mist"} disabled:opacity-60`}
          >
            {v}
          </button>
        ))}
      </div>
      <p className="mt-2 flex justify-between text-[13px] text-ink-3">
        <span>1 아쉬웠어요</span>
        <span>5 많이 도움이 됐어요</span>
      </p>
      {message && (
        <p role="status" className="mt-2 text-[14px] text-ink-2">
          {message}
        </p>
      )}
      <p className="mt-2 text-[13px] leading-relaxed text-ink-3">응답은 리포트 품질을 점검하는 데만 쓰며 광고 · 분석 도구에 보내지 않습니다.</p>
    </section>
  );
}
