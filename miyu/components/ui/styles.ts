// 버튼·링크 공통 스타일. <Link>와 <button> 양쪽에 같은 모양을 쓰기 위해 문자열로 둔다.

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg px-6 text-[16px] font-semibold transition-colors";

export const buttonPrimary = `${base} h-12 bg-accent text-white hover:bg-accent-strong`;

export const buttonSecondary = `${base} h-12 border border-line-strong bg-canvas text-ink hover:bg-mist`;

export const buttonDisabled = `${base} h-12 cursor-not-allowed border border-line bg-mist text-ink-3`;

export const textLink =
  "font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent";

/** 페이지 공통 좌우 여백과 최대 너비 */
export const pageWide = "mx-auto w-full max-w-6xl px-5 md:px-8";
export const pageNarrow = "mx-auto w-full max-w-2xl px-5 md:px-8";
