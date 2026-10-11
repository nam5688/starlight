"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { questionSections, scaleLabels, type QuestionSection } from "@/lib/questions";

type Profile = {
  birthDate: string;
  calendar: "양력" | "음력";
  birthTime: string;
  timeUnknown: boolean;
  gender: "" | "여성" | "남성";
};

const steps = ["기본 정보", ...questionSections.map((s) => s.title)];
const questionCount = questionSections.reduce((n, s) => n + s.questions.length, 0);

export function TestFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>({
    birthDate: "",
    calendar: "양력",
    birthTime: "",
    timeUnknown: false,
    gender: "",
  });
  // 미리보기 단계에서는 응답을 어디에도 저장하지 않는다. 결과 화면은 샘플 데이터를 보여준다.
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const profileDone =
    profile.birthDate !== "" &&
    (profile.timeUnknown || profile.birthTime !== "") &&
    profile.gender !== "";
  const section = step > 0 ? questionSections[step - 1] : null;
  const stepDone = section
    ? section.questions.every((q) => answers[q.id] !== undefined)
    : profileDone;
  const isLast = step === steps.length - 1;
  const progress =
    ((profileDone ? 1 : 0) + Object.keys(answers).length) / (1 + questionCount);

  function goTo(next: number) {
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  function handleNext() {
    if (!stepDone) return;
    if (isLast) router.push("/result");
    else goTo(step + 1);
  }

  return (
    <>
      <main className="mx-auto w-full max-w-2xl px-5 pb-32">
        <div className="pt-8">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-sub">
              <span className="tabular-nums">
                {step + 1} / {steps.length}
              </span>{" "}
              · {steps[step]}
            </span>
            <span className="text-faint">샘플 문항</span>
          </div>
          <div className="mt-3 h-1 rounded-full bg-track">
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>

        {section ? (
          <QuestionStep
            section={section}
            answers={answers}
            onAnswer={(id, v) => setAnswers((prev) => ({ ...prev, [id]: v }))}
          />
        ) : (
          <ProfileStep profile={profile} onChange={setProfile} />
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl gap-3 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
          {step > 0 && (
            <button
              type="button"
              onClick={() => goTo(step - 1)}
              className="h-13 rounded-xl border border-line px-6 text-[16px] font-medium hover:bg-wash"
            >
              이전
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={!stepDone}
            className="h-13 flex-1 rounded-xl bg-ink text-[16px] font-semibold text-paper hover:bg-black disabled:bg-track disabled:text-faint"
          >
            {isLast ? "결과 보기" : "다음"}
          </button>
        </div>
      </div>
    </>
  );
}

function ProfileStep({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (p: Profile) => void;
}) {
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    onChange({ ...profile, [key]: value });

  return (
    <section className="pt-10">
      <h1 className="text-2xl font-bold tracking-tight">기본 정보</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-sub">
        사주 분석에 사용합니다. 이 미리보기에서는 입력한 정보를 저장하지 않습니다.
      </p>

      <div className="mt-8 space-y-8">
        <div>
          <label htmlFor="birthDate" className="block font-semibold">
            생년월일
          </label>
          <div className="mt-3">
            <Segmented
              name="calendar"
              legend="양력 또는 음력"
              options={["양력", "음력"] as const}
              value={profile.calendar}
              onChange={(v) => set("calendar", v)}
            />
          </div>
          <input
            id="birthDate"
            type="date"
            min="1900-01-01"
            value={profile.birthDate}
            onChange={(e) => set("birthDate", e.target.value)}
            className="mt-2 h-12 w-full rounded-lg border border-line bg-paper px-4 text-[16px] focus:border-ink focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="birthTime" className="block font-semibold">
            출생 시간
          </label>
          <input
            id="birthTime"
            type="time"
            value={profile.timeUnknown ? "" : profile.birthTime}
            disabled={profile.timeUnknown}
            onChange={(e) => set("birthTime", e.target.value)}
            className="mt-3 h-12 w-full rounded-lg border border-line bg-paper px-4 text-[16px] focus:border-ink focus:outline-none disabled:bg-wash disabled:text-faint"
          />
          <label className="mt-3 flex items-center gap-2 text-[15px] text-sub">
            <input
              type="checkbox"
              checked={profile.timeUnknown}
              onChange={(e) => set("timeUnknown", e.target.checked)}
              className="size-4 accent-ink"
            />
            출생 시간을 모릅니다
          </label>
        </div>

        <div>
          <Segmented
            name="gender"
            legend="성별"
            showLegend
            options={["여성", "남성"] as const}
            value={profile.gender}
            onChange={(v) => set("gender", v)}
          />
          <p className="mt-2 text-sm text-faint">사주의 대운 방향 계산에만 사용합니다.</p>
        </div>
      </div>
    </section>
  );
}

function QuestionStep({
  section,
  answers,
  onAnswer,
}: {
  section: QuestionSection;
  answers: Record<string, number>;
  onAnswer: (id: string, value: number) => void;
}) {
  const answered = section.questions.filter((q) => answers[q.id] !== undefined).length;

  return (
    <section className="pt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{section.title}</h1>
        <span className="text-sm tabular-nums text-faint">
          응답 {answered}/{section.questions.length}
        </span>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-sub">{section.description}</p>

      <div className="mt-4">
        {section.questions.map((q, i) => (
          <fieldset key={q.id} className="border-b border-line py-6 last:border-b-0">
            <legend className="sr-only">{q.text}</legend>
            <p aria-hidden="true" className="text-[16px] font-medium leading-relaxed">
              <span className="mr-2 tabular-nums text-faint">{i + 1}</span>
              {q.text}
            </p>
            <div className="mt-4 grid grid-cols-5 gap-1.5">
              {scaleLabels.map((label, idx) => {
                const value = idx + 1;
                return (
                  <label key={label} className="cursor-pointer">
                    <input
                      type="radio"
                      name={q.id}
                      value={value}
                      checked={answers[q.id] === value}
                      onChange={() => onAnswer(q.id, value)}
                      className="peer sr-only"
                    />
                    <span className="sr-only">{label}</span>
                    <span
                      aria-hidden="true"
                      className="flex h-11 items-center justify-center rounded-lg border border-line text-[15px] tabular-nums text-sub peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink hover:border-faint"
                    >
                      {value}
                    </span>
                  </label>
                );
              })}
            </div>
            <div aria-hidden="true" className="mt-2 flex justify-between text-xs text-faint">
              <span>{scaleLabels[0]}</span>
              <span>{scaleLabels[scaleLabels.length - 1]}</span>
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}

function Segmented<T extends string>({
  name,
  legend,
  showLegend = false,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  showLegend?: boolean;
  options: readonly T[];
  value: T | "";
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className={showLegend ? "mb-3 font-semibold" : "sr-only"}>{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <label key={o} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o}
              checked={value === o}
              onChange={() => onChange(o)}
              className="peer sr-only"
            />
            <span className="flex h-12 items-center justify-center rounded-lg border border-line text-[15px] peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
              {o}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
