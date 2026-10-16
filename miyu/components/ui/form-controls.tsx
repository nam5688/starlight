// 입력 화면 공통 조각 — 기본 정보(analyze)와 간단 궁합(compat)이 같은 입력 모양을 쓴다.
const inputBase =
  "h-12 w-full rounded-lg border bg-canvas px-4 text-[16px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:bg-mist disabled:text-ink-3";

export function inputClass(invalid?: boolean) {
  return `${inputBase} ${invalid ? "border-danger" : "border-line-strong"}`;
}

export const selectClass = (invalid?: boolean) => `${inputClass(invalid)} appearance-none bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10`;

/** select 오른쪽 화살표 (CSS 배경) */
export const chevronBg = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5.5 7.5L10 12l4.5-4.5' stroke='%235f666e' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
};

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-[14px] font-medium text-danger">
      {message}
    </p>
  );
}
