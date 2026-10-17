"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { trackOnce } from "@/components/analytics/track";

/**
 * 메인 후기 영역이 화면에 보이면 방문 단계 `review_section_view`를 한 번 기록한다(익명 방문 번호 · 화면 경로만, 추적 거부 신호가 있으면 기록하지 않는다 — `trackOnce`).
 * 영역이 화면보다 길어도(휴대폰에서 카드가 세로로 쌓일 때) 위쪽 일부가 화면 안에 들어오면 센다 — 그래서 보이는 비율이 아니라 "아래 35%를 뺀 화면 안에 닿았는가"로 본다.
 * 기록은 참고용 숫자이며 후기가 결제에 준 영향을 뜻하지 않는다.
 */
export function ReviewViewTracker({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          trackOnce("review_section_view");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -35% 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return <div ref={ref}>{children}</div>;
}

/** [전체 후기 보기] — 눌렀을 때 `review_all_click`을 한 번 기록하고 전체 후기 화면으로 간다 */
export function ReviewAllLink({ href, className, children, enabled = true }: { href: string; className: string; children: ReactNode; enabled?: boolean }) {
  return (
    <Link href={href} className={className} onClick={() => enabled && trackOnce("review_all_click")}>
      {children}
    </Link>
  );
}
