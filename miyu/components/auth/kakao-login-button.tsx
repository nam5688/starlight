// 카카오 로그인 버튼 — 카카오 디자인 가이드의 색(노랑 바탕, 검정 심볼)을 따른다.
// 서비스 포인트 컬러(딥블루) 규칙의 예외다.

import { signInWithKakao } from "@/app/auth/actions";

export function KakaoSymbol() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="size-[18px] shrink-0">
      <path
        fill="#000000"
        d="M9 1.5C4.58 1.5 1 4.28 1 7.71c0 2.2 1.47 4.13 3.69 5.23l-.94 3.45c-.08.3.26.54.52.37l4.12-2.72c.2.02.4.03.61.03 4.42 0 8-2.78 8-6.21C17 4.28 13.42 1.5 9 1.5z"
      />
    </svg>
  );
}

export const kakaoButtonClass =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-kakao px-6 text-[16px] font-semibold text-kakao-ink transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";

/** 로그인만 할 때 (MY, 결과 화면 등). 로그인 뒤 next로 돌아온다. */
export function KakaoLoginForm({ next, label = "카카오로 로그인" }: { next: string; label?: string }) {
  return (
    <form action={signInWithKakao}>
      <input type="hidden" name="next" value={next} />
      <button type="submit" className={`${kakaoButtonClass} w-full sm:w-auto`}>
        <KakaoSymbol />
        {label}
      </button>
    </form>
  );
}
