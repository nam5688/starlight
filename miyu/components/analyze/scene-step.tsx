"use client";

import type { Answers } from "@/lib/assessment/types";
import { SITUATIONAL_V2_ITEMS, type SituationalItem } from "@/lib/assessment/drafts/situational-v2-draft";
import { SITUATIONAL_CONTENT_VERSION } from "@/lib/assessment/situational/reading";

/**
 * 상황형 질문 한 단계 — 장면마다 선택지 네 개 중 "실제로 가장 먼저 할 것 같은 행동" 하나를 고른다.
 * 좋고 나쁜 답 · 점수 · 어떤 성향을 읽는 문항인지는 화면에 없다(예측해서 답하게 되므로). 장면 · 선택지 문장은 운영자가 보낸 원문 그대로다.
 * 라디오 버튼이라 키보드로 Tab(장면 이동) · 방향키(선택 변경)를 쓸 수 있다. 답은 선택지 번호(1~4)로 보낸다.
 */
const SCENE_INTRO = "각 장면에서 내가 실제로 가장 먼저 할 것 같은 행동을 하나 골라 주세요. 좋고 나쁜 답은 없고, 처음 떠오르는 느낌대로 답하면 돼요.";

/** 한 단계에 보이는 장면들 — 질문 묶음(part)별 */
export const sceneItemsOfPart = (part: SituationalItem["part"]): SituationalItem[] => SITUATIONAL_V2_ITEMS.filter((i) => i.part === part);

export function SceneStep({
  items,
  heading,
  answers,
  showMissing,
  onAnswer,
}: {
  items: SituationalItem[];
  /** 단계 제목 (중립 이름 — "질문 1" 등) */
  heading: string;
  answers: Answers;
  showMissing: boolean;
  onAnswer: (id: string, value: number) => void;
}) {
  const answered = items.filter((i) => answers[i.id] !== undefined).length;
  const firstMissing = items.findIndex((i) => answers[i.id] === undefined);

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 id="step-heading" tabIndex={-1} className="text-[26px] font-bold tracking-tight outline-none md:text-[30px]">
          {heading}
        </h1>
        <span className="text-[14px] tabular-nums text-ink-3">
          이 단계 응답 {answered}/{items.length}
        </span>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{SCENE_INTRO}</p>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex rounded-md border border-line-strong bg-mist px-2 py-0.5 text-[13px] font-medium text-ink-2">미유 성향 질문 · 개발용 예시 · {SITUATIONAL_CONTENT_VERSION}</span>
        <a href="/assessment-basis" target="_blank" rel="noopener" className="text-[13px] text-ink-3 underline underline-offset-2 hover:text-ink">
          어떻게 만들었나요?
        </a>
      </p>

      {showMissing && firstMissing >= 0 && (
        <p role="alert" className="mt-6 text-[15px] font-medium text-danger">
          {firstMissing + 1}번 장면에 아직 답하지 않았어요.
        </p>
      )}

      <ol className="mt-6 border-t border-line">
        {items.map((item, index) => {
          const value = answers[item.id];
          const missing = showMissing && value === undefined;
          return (
            <li key={item.id} className="border-b border-line">
              <fieldset className={`py-6 ${missing ? "-mx-3 border-l-[3px] border-danger pl-[9px] pr-3" : ""}`}>
                <legend className="float-left w-full text-[17px] font-medium leading-relaxed">
                  <span className="mr-2 tabular-nums text-ink-3">{index + 1}</span>
                  {item.scene}
                </legend>
                <div className="clear-both grid gap-2 pt-4">
                  {item.options.map((text, i) => (
                    <label key={i} className="cursor-pointer">
                      <input type="radio" name={item.id} value={i + 1} checked={value === i + 1} onChange={() => onAnswer(item.id, i + 1)} className="peer sr-only" />
                      <span className="flex min-h-12 items-center rounded-lg border border-line-strong px-3.5 py-2.5 text-[15px] leading-snug text-ink-2 transition-colors hover:border-ink-3 peer-checked:border-accent peer-checked:bg-accent peer-checked:font-semibold peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                        {text}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
