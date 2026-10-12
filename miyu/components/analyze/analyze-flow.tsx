"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { checkBirthAction, scoreDevAnswers } from "@/app/analyze/actions";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import type { Answers } from "@/lib/assessment/types";
import {
  EMPTY_BASIC_INFO,
  hasRequiredBasicInfo,
  validateBasicInfo,
  type BasicInfo,
  type BasicInfoErrors,
} from "@/lib/profile/basic-info";
import type { FreePreview } from "@/lib/report/preview";
import { BasicInfoStep } from "./basic-info-step";
import { FreeSummaryView } from "./free-summary";
import { QuestionStep } from "./question-step";

const STEPS = [
  { key: "basic", label: "기본 정보" },
  ...ASSESSMENT_MODULES.map((m) => ({ key: m.id, label: m.title })),
  { key: "summary", label: "무료 미리보기" },
];
const SUMMARY_STEP = STEPS.length - 1;
const LAST_QUESTION_STEP = SUMMARY_STEP - 1;
const TOTAL_ITEMS = ASSESSMENT_MODULES.reduce((n, m) => n + m.items.length, 0);

/**
 * 기본 정보 → 검사 응답(모듈별) → 무료 미리보기.
 * 단계 이동은 브라우저 기록에도 남겨서, 휴대폰의 뒤로 가기로도 이전 단계로 돌아갈 수 있다.
 * 입력값은 이 화면의 메모리에만 있고 저장하지 않는다 (새로고침하면 처음부터).
 */
export function AnalyzeFlow({ authReady }: { authReady: boolean }) {
  const [step, setStep] = useState(0);
  const [info, setInfo] = useState<BasicInfo>(EMPTY_BASIC_INFO);
  const [infoErrors, setInfoErrors] = useState<BasicInfoErrors>({});
  const [answers, setAnswers] = useState<Answers>({});
  const [showMissing, setShowMissing] = useState(false);
  const [preview, setPreview] = useState<FreePreview | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const summaryRef = useRef<FreePreview | null>(null);
  const stepRef = useRef(0);
  const firstRender = useRef(true);

  useEffect(() => {
    summaryRef.current = preview;
  }, [preview]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // 브라우저 뒤로/앞으로 가기를 단계 이동과 연결한다.
  // (Next.js는 다른 화면에 다녀와도 이 화면의 상태를 유지하므로, 현재 단계를 기록에 다시 적는다)
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, meuStep: stepRef.current }, "");
    function onPopState(e: PopStateEvent) {
      let target = typeof e.state?.meuStep === "number" ? e.state.meuStep : 0;
      // 요약 결과가 없는데 앞으로 가기로 요약 단계에 오면 마지막 검사 단계를 보여준다
      if (target === SUMMARY_STEP && !summaryRef.current) {
        target = LAST_QUESTION_STEP;
        window.history.replaceState({ ...window.history.state, meuStep: target }, "");
      }
      setShowMissing(false);
      setStep(target);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // 단계가 바뀌면 맨 위로 이동하고 제목에 초점을 둔다 (키보드·화면낭독기 사용자용)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    document.getElementById("step-heading")?.focus({ preventScroll: true });
  }, [step]);

  function pushStep(next: number) {
    // meuPrev: 바로 앞 기록도 이 검사 흐름의 단계라는 표시
    window.history.pushState({ ...window.history.state, meuStep: next, meuPrev: true }, "");
    setShowMissing(false);
    setStep(next);
  }

  function goBack() {
    if (window.history.state?.meuPrev) {
      window.history.back();
      return;
    }
    // 앞 기록이 다른 화면이면 (새로 들어온 경우 등) 기록을 바꾸지 않고 이전 단계만 보여준다
    const prev = Math.max(0, step - 1);
    window.history.replaceState({ ...window.history.state, meuStep: prev }, "");
    setShowMissing(false);
    setStep(prev);
  }

  function handleInfoChange(next: BasicInfo) {
    setInfo(next);
    // 이미 표시된 오류는 값을 고치면 바로 사라지게 한다 (입력 중에 새 오류를 띄우지는 않는다)
    if (Object.keys(infoErrors).length > 0) {
      const now = validateBasicInfo(next, new Date());
      const remaining: BasicInfoErrors = {};
      for (const key of Object.keys(infoErrors) as (keyof BasicInfoErrors)[]) {
        if (now[key]) remaining[key] = now[key];
      }
      setInfoErrors(remaining);
    }
  }

  function handleAnswer(id: string, value: number) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    // 답을 고치면 이전 요약은 더 이상 맞지 않으므로 지운다
    setPreview(null);
  }

  function handleNext() {
    if (step === 0) {
      const errors = validateBasicInfo(info, new Date());
      setInfoErrors(errors);
      const first = (["nickname", "birthDate", "birthTime"] as const).find((k) => errors[k]);
      if (first) {
        document.getElementById(first === "birthDate" ? "birthYear" : first)?.focus();
        return;
      }
      if (info.calendar === "solar") {
        pushStep(1);
        return;
      }
      // 음력은 그 해의 윤달 · 달 길이를 만세력으로 확인한 뒤 넘어간다
      startTransition(async () => {
        const problem = await checkBirthAction(info);
        if (problem) {
          setInfoErrors({ birthDate: problem });
          document.getElementById("birthYear")?.focus();
          return;
        }
        pushStep(1);
      });
      return;
    }

    const current = ASSESSMENT_MODULES[step - 1];
    const missing = current.items.find((i) => answers[i.id] === undefined);
    if (missing) {
      setShowMissing(true);
      document.querySelector<HTMLInputElement>(`input[name="${missing.id}"]`)?.focus();
      return;
    }

    if (step < LAST_QUESTION_STEP) {
      pushStep(step + 1);
      return;
    }

    setServerError(null);
    startTransition(async () => {
      const result = await scoreDevAnswers({ info, answers });
      if (result.ok) {
        setPreview(result.preview);
        summaryRef.current = result.preview;
        pushStep(SUMMARY_STEP);
      } else {
        setServerError(result.message);
      }
    });
  }

  function restart() {
    setInfo(EMPTY_BASIC_INFO);
    setInfoErrors({});
    setAnswers({});
    setPreview(null);
    summaryRef.current = null;
    pushStep(0);
  }

  const answered = Object.keys(answers).length;
  const basicDone = hasRequiredBasicInfo(info);
  const progress = step === SUMMARY_STEP ? 1 : ((basicDone ? 1 : 0) + answered) / (1 + TOTAL_ITEMS);
  const currentModule = step > 0 && step <= LAST_QUESTION_STEP ? ASSESSMENT_MODULES[step - 1] : null;

  return (
    <>
      <div className="border-b border-line">
        <div className="mx-auto w-full max-w-3xl px-5 py-4 md:px-8">
          <ol className="hidden items-center gap-6 text-[14px] md:flex">
            {STEPS.map((s, i) => (
              <li
                key={s.key}
                aria-current={i === step ? "step" : undefined}
                className={i === step ? "font-semibold text-ink" : i < step ? "text-ink-2" : "text-ink-3"}
              >
                <span className={`mr-1.5 tabular-nums ${i === step ? "text-accent" : ""}`}>{i + 1}</span>
                {s.label}
              </li>
            ))}
          </ol>
          <div className="flex items-baseline justify-between text-[14px] md:hidden">
            <span className="font-semibold">
              <span className="tabular-nums text-accent">
                {step + 1}/{STEPS.length}
              </span>{" "}
              {STEPS[step].label}
            </span>
            {step !== SUMMARY_STEP && (
              <span className="tabular-nums text-ink-3">
                응답 {answered}/{TOTAL_ITEMS}
              </span>
            )}
          </div>
          <div
            className="mt-3 h-1.5 rounded-full bg-track"
            role="progressbar"
            aria-label="진행 상태"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {step === SUMMARY_STEP && preview ? (
        <FreeSummaryView
          preview={preview}
          info={info}
          answers={answers}
          authReady={authReady}
          onEdit={goBack}
          onRestart={restart}
        />
      ) : (
        <div className="flex flex-1 flex-col">
          <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-8 pb-12 md:px-8 md:pt-12">
            {currentModule ? (
              <QuestionStep
                module={currentModule}
                answers={answers}
                showMissing={showMissing}
                onAnswer={handleAnswer}
              />
            ) : (
              <BasicInfoStep info={info} errors={infoErrors} onChange={handleInfoChange} />
            )}
            {serverError && (
              <p role="alert" className="mt-6 rounded-md border border-danger/40 px-4 py-3 text-[15px] text-danger">
                {serverError}
              </p>
            )}
          </main>

          {/* 화면 아래에 붙어 있다가, 끝까지 내리면 본문 바로 아래에 멈춘다 (푸터를 가리지 않음) */}
          <div className="sticky bottom-0 z-20 border-t border-line bg-canvas/95 backdrop-blur">
            <div className="mx-auto flex w-full max-w-3xl gap-3 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] md:px-8">
              {step > 0 && (
                <button type="button" onClick={goBack} className={`${buttonSecondary} px-5`}>
                  이전
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                disabled={pending}
                aria-busy={pending}
                className={`${buttonPrimary} flex-1 disabled:cursor-wait disabled:opacity-70`}
              >
                {pending ? "채점 중…" : step === LAST_QUESTION_STEP ? "내 결과 미리보기" : "다음"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
