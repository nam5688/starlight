import { CheckIcon, InfoIcon } from "@/components/ui/icons";
import type { BenefitFormState } from "@/app/my/benefits/actions";

/** 서버 동작의 결과 — 성공은 role="status", 실패는 role="alert". 색만으로 구분하지 않고 아이콘 · 글자를 함께 쓴다 */
export function FormMessage({ state, id }: { state: BenefitFormState; id?: string }) {
  if (!state) return null;
  return state.ok ? (
    <p id={id} role="status" className="mt-3 flex items-start gap-2 text-[15px] leading-[1.6] font-medium text-positive">
      <CheckIcon className="mt-1 size-4 shrink-0" />
      <span>{state.message}</span>
    </p>
  ) : (
    <p id={id} role="alert" className="mt-3 flex items-start gap-2 text-[15px] leading-[1.6] font-medium text-danger">
      <InfoIcon className="mt-1 size-4 shrink-0" />
      <span>{state.message}</span>
    </p>
  );
}

/** 서버 동작을 prop으로 받는다 — 실제 화면은 app/my/benefits/actions.ts의 동작을, 개발용 미리보기는 아무것도 바꾸지 않는 동작을 넘긴다 */
export type BenefitAction = (prev: BenefitFormState, formData: FormData) => Promise<BenefitFormState>;
