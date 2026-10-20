"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { checkBirthAction, scoreDevAnswers } from "@/app/analyze/actions";
import { trackOnce } from "@/components/analytics/track";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import { SITUATIONAL_V2_PARTS } from "@/lib/assessment/drafts/situational-v2-draft";
import type { Answers } from "@/lib/assessment/types";
import { ASSESSMENT } from "@/lib/config/product";
import {
  EMPTY_BASIC_INFO,
  hasRequiredBasicInfo,
  validateBasicInfo,
  type BasicInfo,
  type BasicInfoErrors,
} from "@/lib/profile/basic-info";
import { DRAFT_KEY, hasContent, parseDraft, serializeDraft } from "@/lib/profile/draft";
import type { IdentityTypeView } from "@/lib/report/identity";
import type { FreePreview } from "@/lib/report/preview";
import { BasicInfoStep } from "./basic-info-step";
import { FreeSummaryView } from "./free-summary";
import { QuestionStep } from "./question-step";
import { SceneStep, sceneItemsOfPart } from "./scene-step";

// 지금 화면이 보여 주는 질문(lib/config/product.ts의 ASSESSMENT.active) — 상황형 28문항(질문 묶음 4개 × 장면 7개) 또는 예전 22문항(검사 모듈 3개)
const SCENE_MODE = ASSESSMENT.active === "situational-28";
/** 질문 단계마다 그 단계의 문항 id — 끝까지 답했는지 확인하는 데 쓴다 */
const QUESTION_STEP_IDS: string[][] = SCENE_MODE ? SITUATIONAL_V2_PARTS.map((p) => sceneItemsOfPart(p.id).map((i) => i.id)) : ASSESSMENT_MODULES.map((m) => m.items.map((i) => i.id));
// 단계 이름은 무엇을 재는지 알려 주지 않는 중립 이름만 쓴다 — "평소 행동 방식 · 기질 · 관계" 같은 이름을 미리 보면 답을 예측해서 고르게 된다(운영자 2026-10-15)
const STEPS = [
  { key: "basic", label: "기본 정보" },
  ...QUESTION_STEP_IDS.map((_, i) => ({ key: `q${i + 1}`, label: `질문 ${i + 1}` })),
  { key: "summary", label: "결과" },
];
const SUMMARY_STEP = STEPS.length - 1;
const LAST_QUESTION_STEP = SUMMARY_STEP - 1;
const TOTAL_ITEMS = QUESTION_STEP_IDS.reduce((n, ids) => n + ids.length, 0);

/**
 * 기본 정보 → 검사 응답(모듈별) → 무료 미리보기.
 * 단계 이동은 브라우저 기록에도 남겨서, 휴대폰의 뒤로 가기로도 이전 단계로 돌아갈 수 있다.
 * 입력값은 서버에 저장하지 않는다. 새로고침 · 앱 전환(카카오 로그인 등) · 뒤로 가기로 사라지지 않도록 이 브라우저 탭에만
 * 임시 보관하고(sessionStorage, 탭을 닫으면 삭제), 결과를 저장하면 지운다 (lib/profile/draft.ts).
 */
export function AnalyzeFlow({ authReady }: { authReady: boolean }) {
  const [step, setStep] = useState(0);
  const [info, setInfo] = useState<BasicInfo>(EMPTY_BASIC_INFO);
  const [infoErrors, setInfoErrors] = useState<BasicInfoErrors>({});
  const [answers, setAnswers] = useState<Answers>({});
  const [showMissing, setShowMissing] = useState(false);
  const [preview, setPreview] = useState<FreePreview | null>(null);
  /** 저장 후 결과 화면과 같은 개인 유형 카드 — 서버가 같은 함수로 계산해 보낸 값 */
  const [identityType, setIdentityType] = useState<IdentityTypeView | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** 이전에 입력하던 내용을 복원했을 때의 안내 */
  const [restored, setRestored] = useState(false);
  const draftReady = useRef(false);

  const summaryRef = useRef<FreePreview | null>(null);
  const stepRef = useRef(0);
  const firstRender = useRef(true);

  useEffect(() => {
    summaryRef.current = preview;
  }, [preview]);

  // 이 탭에 임시 보관된 입력이 있으면 이어서 쓸 수 있게 복원한다 (화면을 그린 뒤 한 번만).
  // 저장소는 브라우저에서만 읽을 수 있어 서버가 그린 화면과 맞추려고 그린 직후에 불러온다.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const draft = parseDraft(window.sessionStorage.getItem(DRAFT_KEY), Date.now(), LAST_QUESTION_STEP, ASSESSMENT.active);
        if (draft) {
          setInfo(draft.info);
          setAnswers(draft.answers);
          setStep(draft.step);
          stepRef.current = draft.step;
          window.history.replaceState({ ...window.history.state, meuStep: draft.step }, "");
          setRestored(true);
        }
      } catch {
        // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 그냥 처음부터
      }
      draftReady.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // 입력이 바뀔 때마다 이 탭에 임시 보관한다
  useEffect(() => {
    if (!draftReady.current) return;
    try {
      if (hasContent(info, answers)) {
        window.sessionStorage.setItem(DRAFT_KEY, serializeDraft({ step: Math.min(step, LAST_QUESTION_STEP), info, answers, assessment: ASSESSMENT.active }, Date.now()));
      } else {
        window.sessionStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      // 저장 실패는 무시한다 (입력 자체에는 영향이 없다)
    }
  }, [info, answers, step]);

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
    trackOnce("analyze_start");
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
    setIdentityType(null);
  }

  function handleNext() {
    if (step === 0) {
      const errors = validateBasicInfo(info, new Date());
      setInfoErrors(errors);
      const first = (["nickname", "birthDate", "birthTime", "gender"] as const).find((k) => errors[k]);
      if (first) {
        document.getElementById(first === "birthDate" ? "birthYear" : first === "gender" ? "gender-female" : first)?.focus();
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

    const missingId = QUESTION_STEP_IDS[step - 1].find((id) => answers[id] === undefined);
    if (missingId) {
      setShowMissing(true);
      document.querySelector<HTMLInputElement>(`input[name="${missingId}"]`)?.focus();
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
        trackOnce("analyze_complete");
        setPreview(result.preview);
        setIdentityType(result.identityType);
        summaryRef.current = result.preview;
        pushStep(SUMMARY_STEP);
      } else {
        setServerError(result.message);
      }
    });
  }

  function restart() {
    setRestored(false);
    try {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // 무시
    }
    setInfo(EMPTY_BASIC_INFO);
    setInfoErrors({});
    setAnswers({});
    setPreview(null);
    setIdentityType(null);
    summaryRef.current = null;
    pushStep(0);
  }

  const answered = Object.keys(answers).length;
  const basicDone = hasRequiredBasicInfo(info);
  const progress = step === SUMMARY_STEP ? 1 : ((basicDone ? 1 : 0) + answered) / (1 + TOTAL_ITEMS);
  const questionStep = step > 0 && step <= LAST_QUESTION_STEP ? step - 1 : null;

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
          identityType={identityType}
          info={info}
          answers={answers}
          authReady={authReady}
          onEdit={goBack}
          onRestart={restart}
        />
      ) : (
        <div className="flex flex-1 flex-col">
          <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-8 pb-12 md:px-8 md:pt-12">
            {restored && (
              <p role="status" className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md bg-mist px-4 py-3 text-[14px] leading-relaxed text-ink-2">
                <span>이 탭에서 입력하던 내용을 이어서 불러왔어요.</span>
                <button type="button" onClick={restart} className="font-semibold text-accent underline underline-offset-4">
                  처음부터 다시
                </button>
              </p>
            )}
            {questionStep !== null ? (
              SCENE_MODE ? (
                <SceneStep items={sceneItemsOfPart(SITUATIONAL_V2_PARTS[questionStep].id)} heading={STEPS[step].label} answers={answers} showMissing={showMissing} onAnswer={handleAnswer} />
              ) : (
                <QuestionStep module={ASSESSMENT_MODULES[questionStep]} heading={STEPS[step].label} answers={answers} showMissing={showMissing} onAnswer={handleAnswer} />
              )
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
