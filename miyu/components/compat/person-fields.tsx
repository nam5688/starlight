"use client";

import { chevronBg, FieldError, inputClass, selectClass } from "@/components/ui/form-controls";
import { COMPAT_NICKNAME_MAX, type CompatPersonErrors, type CompatPersonInput } from "@/lib/compat/simple";

/** 간단 궁합의 한 사람 입력 — id가 겹치지 않게 prefix(a / b)를 붙인다 */
export function PersonFields({
  prefix,
  title,
  placeholderName,
  value,
  errors,
  onChange,
}: {
  prefix: string;
  title: string;
  placeholderName: string;
  value: CompatPersonInput;
  errors: CompatPersonErrors;
  onChange: (next: CompatPersonInput) => void;
}) {
  const id = (n: string) => `${prefix}-${n}`;
  const set = <K extends keyof CompatPersonInput>(key: K, v: CompatPersonInput[K]) => onChange({ ...value, [key]: v });
  const maxDay = value.calendar === "lunar" ? 30 : 31;

  return (
    <fieldset className="rounded-2xl bg-canvas p-5 shadow-soft md:p-6">
      <legend className="float-left w-full px-0 text-[17px] font-bold">{title}</legend>

      <div className="clear-both pt-3">
        <label htmlFor={id("nickname")} className="block text-[15px] font-semibold">
          이름 <span className="text-[13px] font-normal text-ink-3">선택 · 결과 제목에만 써요</span>
        </label>
        <input
          id={id("nickname")}
          type="text"
          maxLength={COMPAT_NICKNAME_MAX}
          placeholder={placeholderName}
          value={value.nickname}
          onChange={(e) => set("nickname", e.target.value)}
          aria-invalid={!!errors.nickname}
          aria-describedby={errors.nickname ? id("nickname-error") : undefined}
          className={`mt-2 ${inputClass(!!errors.nickname)}`}
        />
        <FieldError id={id("nickname-error")} message={errors.nickname} />
      </div>

      <div className="mt-5">
        <p className="text-[15px] font-semibold">생년월일</p>
        <div role="radiogroup" aria-label={`${title} 양력 또는 음력`} className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              ["solar", "양력"],
              ["lunar", "음력"],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className="cursor-pointer">
              <input type="radio" name={id("calendar")} value={v} checked={value.calendar === v} onChange={() => onChange({ ...value, calendar: v, isLeapMonth: false })} className="peer sr-only" />
              <span className="flex h-12 items-center justify-center rounded-lg border border-line-strong text-[16px] peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                {label}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <div className="relative">
            <label htmlFor={id("year")} className="sr-only">
              태어난 해
            </label>
            <input
              id={id("year")}
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="1995"
              value={value.birthYear}
              onChange={(e) => set("birthYear", e.target.value.replace(/\D/g, ""))}
              aria-invalid={!!errors.birthDate}
              aria-describedby={errors.birthDate ? id("date-error") : undefined}
              className={`${inputClass(!!errors.birthDate)} pr-9`}
            />
            <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[15px] text-ink-3">년</span>
          </div>
          <div>
            <label htmlFor={id("month")} className="sr-only">
              태어난 달
            </label>
            <select id={id("month")} value={value.birthMonth} onChange={(e) => set("birthMonth", e.target.value)} aria-invalid={!!errors.birthDate} aria-describedby={errors.birthDate ? id("date-error") : undefined} className={selectClass(!!errors.birthDate)} style={chevronBg}>
              <option value="">월</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {i + 1}월
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={id("day")} className="sr-only">
              태어난 날
            </label>
            <select id={id("day")} value={value.birthDay} onChange={(e) => set("birthDay", e.target.value)} aria-invalid={!!errors.birthDate} aria-describedby={errors.birthDate ? id("date-error") : undefined} className={selectClass(!!errors.birthDate)} style={chevronBg}>
              <option value="">일</option>
              {Array.from({ length: maxDay }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {i + 1}일
                </option>
              ))}
            </select>
          </div>
        </div>
        {value.calendar === "lunar" && (
          <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
            <input type="checkbox" checked={value.isLeapMonth} onChange={(e) => set("isLeapMonth", e.target.checked)} className="size-5 accent-accent" />
            <span>
              윤달이에요 <span className="text-ink-3">· 음력 생일이 윤달이면 선택해요</span>
            </span>
          </label>
        )}
        <FieldError id={id("date-error")} message={errors.birthDate} />
      </div>

      <div className="mt-5">
        <label htmlFor={id("time")} className="block text-[15px] font-semibold">
          출생시간
        </label>
        <input
          id={id("time")}
          type="time"
          value={value.birthTimeUnknown ? "" : value.birthTime}
          disabled={value.birthTimeUnknown}
          onChange={(e) => set("birthTime", e.target.value)}
          aria-invalid={!!errors.birthTime}
          aria-describedby={errors.birthTime ? id("time-error") : id("time-help")}
          className={`mt-2 ${inputClass(!!errors.birthTime)}`}
        />
        <p id={id("time-help")} className="mt-1 text-[13px] leading-relaxed text-ink-3">
          모르면 태어난 시간의 기둥(시주)을 빼고 읽어요. 임의의 시간을 넣어 계산하지 않아요.
        </p>
        <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
          <input type="checkbox" checked={value.birthTimeUnknown} onChange={(e) => onChange({ ...value, birthTimeUnknown: e.target.checked, birthTime: "" })} className="size-5 accent-accent" />
          출생시간을 몰라요
        </label>
        <FieldError id={id("time-error")} message={errors.birthTime} />
      </div>
    </fieldset>
  );
}
