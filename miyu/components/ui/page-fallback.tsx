/**
 * 화면 내용이 서버에서 이어서 도착하는 동안 보여 주는 자리.
 * 높이를 화면 대부분으로 잡아, 내용이 도착할 때 푸터가 밀려 내려오며 화면이 흔들리는 것(CLS)을 막는다.
 */
export function PageFallback({ text = "불러오고 있어요.", className = "", tall = false }: { text?: string; className?: string; /** 긴 화면(결과 · 리포트)은 화면 높이의 1.5배로 잡는다 */ tall?: boolean }) {
  return (
    <div className={tall ? "min-h-[150vh]" : "min-h-[80vh]"}>
      <p role="status" className={`text-[16px] text-ink-2 ${className}`}>
        {text}
      </p>
    </div>
  );
}
