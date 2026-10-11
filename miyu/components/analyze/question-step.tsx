"use client";

import { LIKERT_OPTIONS, type Answers, type AssessmentModule } from "@/lib/assessment/types";

/**
 * 한 검사 모듈의 문항 목록. 응답 도중에는 해석을 보여주지 않는다.
 * 라디오 버튼이라 키보드로 Tab(문항 이동) · 방향키(선택 변경)를 쓸 수 있다.
 */
export function QuestionStep({
  module,
  answers,
  showMissing,
  onAnswer,
}: {
  module: AssessmentModule;
  answers: Answers;
  showMissing: boolean;
  onAnswer: (id: string, value: number) => void;
}) {
  const answered = module.items.filter((i) => answers[i.id] !== undefined).length;
  const firstMissing = module.items.findIndex((i) => answers[i.id] === undefined);

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 id="step-heading" tabIndex={-1} className="text-[26px] font-bold tracking-tight outline-none md:text-[30px]">
          {module.title}
        </h1>
        <span className="text-[14px] tabular-nums text-ink-3">
          이 단계 응답 {answered}/{module.items.length}
        </span>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{module.intro}</p>
      {module.status === "dev-example" && (
        <p className="mt-3 inline-flex rounded-md border border-line-strong bg-mist px-2 py-0.5 text-[13px] font-medium text-ink-2">
          개발용 예시 문항 · {module.version}
        </p>
      )}

      {showMissing && firstMissing >= 0 && (
        <p role="alert" className="mt-6 text-[15px] font-medium text-danger">
          {firstMissing + 1}번 문항에 아직 답하지 않았어요.
        </p>
      )}

      <ol className="mt-6 border-t border-line">
        {module.items.map((item, index) => {
          const value = answers[item.id];
          const missing = showMissing && value === undefined;
          return (
            <li key={item.id} className="border-b border-line">
              <fieldset className={`py-6 ${missing ? "-mx-3 border-l-[3px] border-danger pl-[9px] pr-3" : ""}`}>
                <legend className="float-left w-full text-[17px] font-medium leading-relaxed">
                  <span className="mr-2 tabular-nums text-ink-3">{index + 1}</span>
                  {item.text}
                </legend>
                <div className="clear-both grid grid-cols-5 gap-1.5 pt-4 md:gap-2">
                  {LIKERT_OPTIONS.map((opt) => (
                    <label key={opt.value} className="cursor-pointer">
                      <input
                        type="radio"
                        name={item.id}
                        value={opt.value}
                        checked={value === opt.value}
                        onChange={() => onAnswer(item.id, opt.value)}
                        className="peer sr-only"
                      />
                      <span className="flex h-14 items-center justify-center rounded-lg border border-line-strong px-1 text-center text-[13px] leading-tight text-ink-2 transition-colors hover:border-ink-3 peer-checked:border-accent peer-checked:bg-accent peer-checked:font-semibold peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent md:text-[14px]">
                        {opt.label}
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
