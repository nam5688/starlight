"use client";

import {
  GENDER_OPTIONS,
  MBTI_TYPES,
  NICKNAME_MAX,
  PROVINCES,
  type BasicInfo,
  type BasicInfoErrors,
} from "@/lib/profile/basic-info";
import { FREE_ANALYSIS_TIME } from "@/lib/config/product";
import { chevronBg, FieldError, inputClass, selectClass } from "@/components/ui/form-controls";

export function BasicInfoStep({
  info,
  errors,
  onChange,
}: {
  info: BasicInfo;
  errors: BasicInfoErrors;
  onChange: (info: BasicInfo) => void;
}) {
  const set = <K extends keyof BasicInfo>(key: K, value: BasicInfo[K]) => onChange({ ...info, [key]: value });
  const maxDay = info.calendar === "lunar" ? 30 : 31;

  return (
    <section>
      <h1 id="step-heading" tabIndex={-1} className="text-[26px] font-bold tracking-tight outline-none md:text-[30px]">
        기본 정보
      </h1>
      <p className="mt-2 text-[15px] font-semibold text-accent-strong">검사는 {FREE_ANALYSIS_TIME} 걸려요.</p>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
        사주 계산과 결과 화면에 사용합니다. 저장하기 전에는 서버에 보내 두지 않고, 새로고침이나 로그인 이동에 대비해 이 브라우저 탭에만 임시 보관합니다 (탭을 닫으면 지워집니다).
      </p>

      <div className="mt-10 space-y-10">
        {/* 닉네임 */}
        <div>
          <label htmlFor="nickname" className="block text-[16px] font-semibold">
            닉네임 <span className="text-[14px] font-normal text-ink-3">필수</span>
          </label>
          <p id="nickname-help" className="mt-1 text-[14px] text-ink-3">
            결과 화면에서 부를 이름입니다. 실명이 아니어도 됩니다.
          </p>
          <input
            id="nickname"
            type="text"
            autoComplete="nickname"
            maxLength={NICKNAME_MAX}
            placeholder="예: 지민"
            value={info.nickname}
            onChange={(e) => set("nickname", e.target.value)}
            aria-invalid={!!errors.nickname}
            aria-describedby={errors.nickname ? "nickname-error nickname-help" : "nickname-help"}
            className={`mt-3 ${inputClass(!!errors.nickname)}`}
          />
          <FieldError id="nickname-error" message={errors.nickname} />
        </div>

        {/* 생년월일 */}
        <fieldset>
          <legend className="text-[16px] font-semibold">
            생년월일 <span className="text-[14px] font-normal text-ink-3">필수</span>
          </legend>
          <div role="radiogroup" aria-label="양력 또는 음력" className="mt-3 grid grid-cols-2 gap-2">
            {(
              [
                ["solar", "양력"],
                ["lunar", "음력"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="cursor-pointer">
                <input
                  type="radio"
                  name="calendar"
                  value={value}
                  checked={info.calendar === value}
                  onChange={() => onChange({ ...info, calendar: value, isLeapMonth: false })}
                  className="peer sr-only"
                />
                <span className="flex h-12 items-center justify-center rounded-lg border border-line-strong text-[16px] peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                  {label}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-[1.3fr_1fr_1fr] gap-2">
            <div>
              <label htmlFor="birthYear" className="sr-only">
                태어난 해
              </label>
              <div className="relative">
                <input
                  id="birthYear"
                  type="text"
                  inputMode="numeric"
                  autoComplete="bday-year"
                  maxLength={4}
                  placeholder="1995"
                  value={info.birthYear}
                  onChange={(e) => set("birthYear", e.target.value.replace(/\D/g, ""))}
                  aria-invalid={!!errors.birthDate}
                  aria-describedby={errors.birthDate ? "birthDate-error" : undefined}
                  className={`${inputClass(!!errors.birthDate)} pr-9`}
                />
                <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[15px] text-ink-3">년</span>
              </div>
            </div>
            <div>
              <label htmlFor="birthMonth" className="sr-only">
                태어난 달
              </label>
              <select
                id="birthMonth"
                autoComplete="bday-month"
                value={info.birthMonth}
                onChange={(e) => set("birthMonth", e.target.value)}
                aria-invalid={!!errors.birthDate}
                aria-describedby={errors.birthDate ? "birthDate-error" : undefined}
                className={selectClass(!!errors.birthDate)}
                style={chevronBg}
              >
                <option value="">월</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {i + 1}월
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="birthDay" className="sr-only">
                태어난 날
              </label>
              <select
                id="birthDay"
                autoComplete="bday-day"
                value={info.birthDay}
                onChange={(e) => set("birthDay", e.target.value)}
                aria-invalid={!!errors.birthDate}
                aria-describedby={errors.birthDate ? "birthDate-error" : undefined}
                className={selectClass(!!errors.birthDate)}
                style={chevronBg}
              >
                <option value="">일</option>
                {Array.from({ length: maxDay }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {i + 1}일
                  </option>
                ))}
              </select>
            </div>
          </div>

          {info.calendar === "lunar" && (
            <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
              <input
                type="checkbox"
                checked={info.isLeapMonth}
                onChange={(e) => set("isLeapMonth", e.target.checked)}
                className="size-5 accent-accent"
              />
              <span>
                윤달입니다 <span className="text-ink-3">· 음력 생일이 윤달이면 선택하세요</span>
              </span>
            </label>
          )}
          <FieldError id="birthDate-error" message={errors.birthDate} />
        </fieldset>

        {/* 출생시간 */}
        <div>
          <label htmlFor="birthTime" className="block text-[16px] font-semibold">
            출생시간
          </label>
          <p id="birthTime-help" className="mt-1 text-[14px] leading-relaxed text-ink-3">
            모르면 태어난 시간의 기둥인 시주를 빼고 분석합니다. 임의의 시간을 넣어 계산하지 않습니다.
          </p>
          <input
            id="birthTime"
            type="time"
            value={info.birthTimeUnknown ? "" : info.birthTime}
            disabled={info.birthTimeUnknown}
            onChange={(e) => set("birthTime", e.target.value)}
            aria-invalid={!!errors.birthTime}
            aria-describedby={errors.birthTime ? "birthTime-error birthTime-help" : "birthTime-help"}
            className={`mt-3 ${inputClass(!!errors.birthTime)}`}
          />
          <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
            <input
              id="birthTimeUnknown"
              type="checkbox"
              checked={info.birthTimeUnknown}
              onChange={(e) => onChange({ ...info, birthTimeUnknown: e.target.checked, birthTime: "" })}
              className="size-5 accent-accent"
            />
            출생시간을 몰라요
          </label>
          <FieldError id="birthTime-error" message={errors.birthTime} />
        </div>

        {/* 성별 (필수) — 대운 · 배우자 별 · 월 달력 계산에만 쓴다 */}
        <fieldset>
          <legend className="text-[16px] font-semibold">
            성별 <span className="text-[14px] font-normal text-ink-3">필수</span>
          </legend>
          <p id="gender-help" className="mt-1 text-[14px] leading-relaxed text-ink-3">
            전통 사주 계산에서 10년 단위의 시기(대운)의 순서와 배우자와 관련해 보는 기운, 월별 달력이 성별에 따라 달라서 묻습니다. 다른 곳에는 쓰지 않아요.
          </p>
          <div role="radiogroup" aria-label="성별" aria-describedby={errors.gender ? "gender-error gender-help" : "gender-help"} aria-invalid={!!errors.gender} className="mt-3 grid grid-cols-2 gap-2">
            {GENDER_OPTIONS.map(([value, label]) => (
              <label key={label} className="cursor-pointer">
                <input
                  id={`gender-${value}`}
                  type="radio"
                  name="gender"
                  value={value}
                  checked={(info.gender ?? "") === value}
                  onChange={() => set("gender", value)}
                  className="peer sr-only"
                />
                <span className="flex h-12 items-center justify-center rounded-lg border border-line-strong px-1 text-center text-[15px] peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                  {label}
                </span>
              </label>
            ))}
          </div>
          <FieldError id="gender-error" message={errors.gender} />
        </fieldset>

        {/* 알고 있는 MBTI */}
        <div>
          <label htmlFor="knownMbti" className="block text-[16px] font-semibold">
            알고 있는 MBTI <span className="text-[14px] font-normal text-ink-3">선택</span>
          </label>
          <p id="knownMbti-help" className="mt-1 text-[14px] leading-relaxed text-ink-3">
            참고값으로 따로 표시합니다. 입력해도 이어지는 질문은 그대로 진행합니다.
          </p>
          <select
            id="knownMbti"
            value={info.knownMbti}
            onChange={(e) => set("knownMbti", e.target.value)}
            aria-describedby="knownMbti-help"
            className={`mt-3 ${selectClass()}`}
            style={chevronBg}
          >
            <option value="">모름 / 입력 안 함</option>
            {MBTI_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* 지역 */}
        <fieldset>
          <legend className="text-[16px] font-semibold">
            거주·활동 지역 <span className="text-[14px] font-normal text-ink-3">선택</span>
          </legend>
          <p id="region-help" className="mt-1 text-[14px] leading-relaxed text-ink-3">
            성향 분석에는 사용하지 않습니다. 이후 장소 추천 기능에만 사용할 예정입니다.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="regionProvince" className="sr-only">
                시·도
              </label>
              <select
                id="regionProvince"
                value={info.regionProvince}
                onChange={(e) => set("regionProvince", e.target.value)}
                aria-describedby="region-help"
                className={selectClass()}
                style={chevronBg}
              >
                <option value="">시·도 선택</option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="regionDistrict" className="sr-only">
                시·군·구
              </label>
              <input
                id="regionDistrict"
                type="text"
                maxLength={20}
                placeholder="시·군·구 (예: 마포구)"
                value={info.regionDistrict}
                onChange={(e) => set("regionDistrict", e.target.value)}
                aria-describedby="region-help"
                className={inputClass()}
              />
            </div>
          </div>
        </fieldset>
      </div>
    </section>
  );
}
