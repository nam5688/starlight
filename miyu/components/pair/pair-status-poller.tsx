"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { pairStatusAction } from "@/app/pair/actions";
import { buttonSecondary } from "@/components/ui/styles";

/**
 * 리포트 궁합이 만들어지는 동안 몇 초마다 상태를 확인하고 끝나면 화면을 새로 그린다 — 확인 요청이 멈춘 작업을 이어받기도 한다(다시 결제하지 않는다).
 * 실패하면 [다시 만들기](같은 주문으로 추가 결제 없음)를 보인다. 결제한 사람도 상대도 같은 화면을 본다.
 */
export function PairStatusPoller({ pairId, initial }: { pairId: string; initial: "generating" | "failed" }) {
  const router = useRouter();
  const [state, setState] = useState<"generating" | "failed">(initial);
  const [seconds, setSeconds] = useState(0);
  const [pending, startTransition] = useTransition();
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (state === "failed") return;
    let stopped = false;
    started.current ??= Date.now();
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      const elapsed = Date.now() - (started.current ?? Date.now());
      setSeconds(Math.floor(elapsed / 1000));
      try {
        const r = await pairStatusAction(pairId);
        if (stopped) return;
        if (r.status === "ready") {
          router.refresh();
          return;
        }
        if (r.status === "failed") {
          setState("failed");
          return;
        }
      } catch {
        // 네트워크가 잠시 끊겨도 계속 확인한다
      }
      timer = setTimeout(tick, elapsed < 180_000 ? 3000 : 10_000);
    }
    timer = setTimeout(tick, 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pairId, router, state]);

  const retry = () =>
    startTransition(async () => {
      started.current = Date.now();
      setSeconds(0);
      setState("generating");
      await pairStatusAction(pairId, true).catch(() => null);
    });

  if (state === "failed") {
    return (
      <div role="alert" className="space-y-3 text-[15px] leading-relaxed text-ink-2">
        <p>궁합 풀이를 만들지 못했어요. 결제는 정상 처리되었고 다시 결제하지 않아도 돼요. 같은 주문으로 다시 만들 수 있어요.</p>
        <button type="button" onClick={retry} disabled={pending} className={`${buttonSecondary} disabled:opacity-60`}>
          {pending ? "다시 만드는 중이에요" : "다시 만들기"}
        </button>
        <p className="text-[13px] text-ink-3">계속 만들어지지 않으면 문의해 주세요. 두 사람 중 누가 눌러도 같은 주문으로 이어서 만들어요.</p>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className="space-y-2 text-[15px] leading-relaxed text-ink-2">
      <p>
        두 사람의 사주와 응답 방향을 함께 읽고 있어요. 보통 1~2분 걸리며, 끝나면 이 화면에 바로 나타나요.
        {seconds >= 60 && " 이 화면을 닫아도 만들기는 계속되고, MY에서 다시 열 수 있어요."}
      </p>
    </div>
  );
}
