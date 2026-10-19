"use client";

import { FieldError } from "@/components/ui/form-controls";
import { COMPAT_GENDERS, COMPAT_RELATIONSHIPS, GENDER_HELP, GENDER_LABEL, RELATIONSHIP_LABEL, RELATIONSHIP_QUESTION, type CompatGender, type CompatRelationship } from "@/lib/compat/relationship";

const choiceClass =
  "flex min-h-12 items-center justify-center rounded-lg border border-line-strong px-2 py-2 text-center text-[16px] leading-snug break-keep peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent";

/** 성별(남자 · 여자) — 기본 선택이 없고, 이름으로 짐작하지 않는다. 고르기 전에는 두 칸 모두 비어 있다 */
export function GenderField({
  prefix,
  legend,
  value,
  error,
  onChange,
  help = GENDER_HELP,
}: {
  prefix: string;
  legend: string;
  value: "" | CompatGender;
  error?: string;
  onChange: (next: CompatGender) => void;
  help?: string;
}) {
  const id = (n: string) => `${prefix}-${n}`;
  return (
    <fieldset className="mt-5 min-w-0">
      <legend className="text-[15px] font-semibold">
        {legend} <span className="text-[13px] font-normal text-ink-3">필수</span>
      </legend>
      <div role="radiogroup" aria-label={legend} aria-invalid={!!error} aria-describedby={error ? `${id("gender-error")} ${id("gender-help")}` : id("gender-help")} className="mt-2 grid grid-cols-2 gap-2">
        {COMPAT_GENDERS.map((g) => (
          <label key={g} className="cursor-pointer">
            <input id={id(`gender-${g}`)} type="radio" name={id("gender")} value={g} checked={value === g} onChange={() => onChange(g)} className="peer sr-only" />
            <span className={choiceClass}>{GENDER_LABEL[g]}</span>
          </label>
        ))}
      </div>
      <p id={id("gender-help")} className="mt-1 text-[13px] leading-relaxed text-ink-3">
        {help}
      </p>
      <FieldError id={id("gender-error")} message={error} />
    </fieldset>
  );
}

/** "무슨 사이인가요?" — 연인 / 결혼준비중 / 썸타는중 / 결혼함 / 친구 / 기타, 이 순서 그대로. 기본 선택이 없다 */
export function RelationshipField({ prefix = "rel", value, error, onChange }: { prefix?: string; value: "" | CompatRelationship; error?: string; onChange: (next: CompatRelationship) => void }) {
  const helpId = `${prefix}-help`;
  const errorId = `${prefix}-error`;
  return (
    <fieldset className="min-w-0 rounded-2xl bg-canvas p-5 shadow-soft md:p-6" data-relationship-field>
      <legend className="float-left w-full px-0 text-[17px] font-bold">
        {RELATIONSHIP_QUESTION} <span className="text-[13px] font-normal text-ink-3">필수</span>
      </legend>
      <div role="radiogroup" aria-label={RELATIONSHIP_QUESTION} aria-invalid={!!error} aria-describedby={error ? `${errorId} ${helpId}` : helpId} className="clear-both grid grid-cols-2 gap-2 pt-3 sm:grid-cols-3">
        {COMPAT_RELATIONSHIPS.map((r) => (
          <label key={r} className="cursor-pointer">
            <input id={`${prefix}-${r}`} type="radio" name={`${prefix}-relationship`} value={r} checked={value === r} onChange={() => onChange(r)} className="peer sr-only" />
            <span className={choiceClass}>{RELATIONSHIP_LABEL[r]}</span>
          </label>
        ))}
      </div>
      <p id={helpId} className="mt-3 text-[13px] leading-relaxed text-ink-3">
        지금의 사이를 직접 알려 주세요. 이 선택은 풀이를 읽는 관점과 표현, 조언에만 쓰이고 궁합 지수와 사주 계산은 바꾸지 않아요.
      </p>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}
