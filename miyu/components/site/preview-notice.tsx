/** 개발 중 미리보기 안내. 정식 문항·결제가 연결되면 제거한다. */
export function PreviewNotice() {
  return (
    <div className="border-b border-line bg-mist">
      <p className="mx-auto w-full max-w-6xl px-5 py-2 text-[13px] leading-relaxed text-ink-2 md:px-8">
        개발 중인 미리보기입니다. 문항과 결과는 개발용 예시이며, 로그인·결제·저장은 아직 연결되지 않았습니다.
      </p>
    </div>
  );
}
