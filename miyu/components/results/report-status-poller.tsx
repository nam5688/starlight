"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReportStatusResult } from "@/app/results/[id]/actions";
import { reportStatusAction } from "@/app/results/[id]/actions";

/**
 * 리포트가 만들어지는 동안 몇 초마다 상태를 확인하고, 끝나면 화면을 새로 그린다.
 * (확인 요청이 멈춘 작업을 이어받기도 한다 — 서버의 reportStatusAction)
 */
export function ReportStatusPoller({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);
  const [info, setInfo] = useState<Pick<ReportStatusResult, "waiting" | "delayed">>({ waiting: null, delayed: false });
  const started = useRef<number | null>(null);

  useEffect(() => {
    let stopped = false;
    started.current ??= Date.now();
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      const elapsed = Date.now() - (started.current ?? Date.now());
      setSeconds(Math.floor(elapsed / 1000));
      try {
        const { status, waiting, delayed } = await reportStatusAction(assessmentId);
        if (stopped) return;
        setInfo({ waiting, delayed });
        if (status === "ready" || status === "failed") {
          router.refresh();
          return;
        }
      } catch {
        // 네트워크가 잠시 끊겨도 계속 확인한다
      }
      // 처음 3분은 3초마다, 그 뒤에는 10초마다
      timer = setTimeout(tick, elapsed < 180_000 ? 3000 : 10_000);
    }
    timer = setTimeout(tick, 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [assessmentId, router]);

  return (
    <div role="status" aria-live="polite" className="space-y-2 text-[15px] leading-relaxed text-ink-2">
      <p>
        {info.waiting === "capacity"
          ? "지금 리포트를 준비하는 주문이 많아 순서를 기다리고 있어요. 순서가 되면 바로 만들기 시작하며, 결제는 정상 처리되었습니다."
          : "리포트를 만들고 있어요. 보통 1분 안팎 걸리며, 끝나면 이 화면에 바로 나타납니다."}
        {seconds >= 60 && " 이 화면을 닫아도 만들기는 계속되고, MY에서 다시 열 수 있습니다."}
      </p>
      {info.delayed && (
        <p className="font-medium text-ink">
          평소보다 오래 걸리고 있습니다. 결제는 정상 처리되어 있고 다시 결제하지 않아도 됩니다. 계속 기다리셔도 되고, 원하시면 환불을 문의하실 수 있습니다 (MY &gt; 주문 상세의 주문번호를 알려 주세요).
        </p>
      )}
    </div>
  );
}
