"use client";

import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useEffect, useId, useRef, useState } from "react";
import { reportWidgetIssueAction } from "@/app/checkout/[orderNumber]/widget-actions";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { formatKrw } from "@/lib/config/product";
import {
  classifyBrowser,
  errorCodeOf,
  startWidgetSession,
  tidyMessage,
  USER_ACTION_CODES,
  WIDGET_READY_TIMEOUT_MS,
  WIDGET_REPORT_LIMIT,
  widgetIssueMessage,
  WidgetSessionError,
  type SdkLike,
  type WidgetEnv,
  type WidgetIssue,
  type WidgetSession,
} from "@/lib/commerce/widget-session";

/** 브라우저에서 읽을 수 있는 환경 사실만 모은다(사용자 에이전트 원문은 보내지 않고 앱 안 브라우저 종류로만 분류한다) */
function collectEnv(selector: string): WidgetEnv {
  let storage: WidgetEnv["storage"] = "blocked";
  try {
    const k = "miyu-widget-probe";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    storage = "ok";
  } catch {
    storage = "blocked";
  }
  const vis = document.visibilityState as string;
  return {
    browser: classifyBrowser(navigator.userAgent),
    secureContext: window.isSecureContext,
    storage,
    cookies: navigator.cookieEnabled,
    online: navigator.onLine,
    topLevel: window.top === window.self,
    containers: document.querySelectorAll(selector).length,
    visibility: vis === "visible" || vis === "hidden" || vis === "prerender" ? vis : "unknown",
  };
}

/**
 * 토스페이먼츠 주문서형 결제 화면.
 * 보여줄 결제수단은 토스페이먼츠 어드민의 결제위젯 설정(기능 > 결제수단 목록 · 결제 UI 설정)에서 정한다 — 출시 초기에는 카드만 보여야 한다(docs/setup-guide.md).
 * 금액·주문번호는 서버가 만든 값을 그대로 쓰고, 승인은 서버에서 다시 확인한다.
 *
 * 준비 과정(lib/commerce/widget-session.ts)은 단계마다 시간을 재고 토스의 오류 코드를 잃지 않으며, 30초 안에 준비되지 않으면 멈추고 [다시 불러오기]를 보인다.
 * 막히면 단계 · 코드 · 환경 사실을 운영 기록으로 보낸다(주문번호 외 개인정보 없음, 한 번 열 때 최대 3번). 결제 금액 · 승인은 이 화면이 정하지 않는다.
 * 결제수단 · 약관 칸의 id는 이 화면마다 다르다 — Next.js는 떠난 화면을 숨긴 채 문서에 남기므로 id가 겹치면 토스가 숨겨진 옛 칸에 그릴 수 있다.
 */
export function TossCheckout({
  clientKey,
  customerKey,
  orderId,
  orderName,
  amount,
  methodsVariantKey = "DEFAULT",
  onIssue,
}: {
  clientKey: string;
  customerKey: string;
  orderId: string;
  orderName: string;
  amount: number;
  /** 결제수단 화면(결제 UI) 이름 — 서버가 환경변수에서 읽어 준다 */
  methodsVariantKey?: string;
  /** 시험 · 미리보기에서 막힘 보고를 서버 대신 받는다(없으면 서버 동작으로 운영 기록에 남긴다) */
  onIssue?: (issue: WidgetIssue) => void;
}) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const methodsId = `toss-methods-${uid}`;
  const agreementId = `toss-agreement-${uid}`;
  const [status, setStatus] = useState<"loading" | "ready" | "requesting" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(1);
  const sessionRef = useRef<WidgetSession | null>(null);
  const reports = useRef(0);

  function report(issue: WidgetIssue) {
    if (reports.current >= WIDGET_REPORT_LIMIT) return;
    reports.current += 1;
    if (onIssue) onIssue(issue);
    else void reportWidgetIssueAction(orderId, issue).catch(() => undefined);
  }

  useEffect(() => {
    const signal = { aborted: false };
    // 개발 모드가 효과를 두 번 돌려도(만들었다 지우고 다시 만듦) 위젯은 한 번만 그리도록 한 틱 뒤에 시작한다
    const started = Date.now();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const session = await startWidgetSession({
            loadSdk: async (key) => (await loadTossPayments(key)) as unknown as SdkLike,
            clientKey,
            customerKey,
            amount,
            methodsSelector: `#${methodsId}`,
            agreementSelector: `#${agreementId}`,
            variantKey: methodsVariantKey,
            timeoutMs: WIDGET_READY_TIMEOUT_MS,
            signal,
          });
          if (signal.aborted) {
            await session.destroy();
            return;
          }
          sessionRef.current = session;
          setStatus("ready");
        } catch (e) {
          if (signal.aborted) return;
          const err = e instanceof WidgetSessionError ? e : new WidgetSessionError("render", errorCodeOf(e), tidyMessage(e), Date.now() - started);
          if (err.code === "ABORTED") return;
          const issue: WidgetIssue = { phase: err.phase, code: err.code, message: err.message, elapsedMs: err.elapsedMs, attempt, env: collectEnv("[data-toss-methods]") };
          setStatus("error");
          setMessage(widgetIssueMessage(issue));
          report(issue);
        }
      })();
    }, 0);
    return () => {
      clearTimeout(timer);
      signal.aborted = true;
      const s = sessionRef.current;
      sessionRef.current = null;
      void s?.destroy();
    };
    // report는 매 렌더 새로 만들어지지만 reports(ref)와 onIssue만 쓰므로 다시 시작할 이유가 아니다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientKey, customerKey, amount, methodsVariantKey, attempt, methodsId, agreementId]);

  async function pay() {
    const widgets = sessionRef.current?.widgets as unknown as { requestPayment: (o: { orderId: string; orderName: string; successUrl: string; failUrl: string }) => Promise<unknown> } | undefined;
    if (!widgets) return;
    setStatus("requesting");
    setMessage(null);
    try {
      await widgets.requestPayment({
        orderId,
        orderName,
        successUrl: `${window.location.origin}/payments/success`,
        failUrl: `${window.location.origin}/payments/fail`,
      });
    } catch (error) {
      // 약관 미동의, 결제창 닫기 등 — 다시 시도할 수 있게 둔다. 구매자가 직접 한 행동은 막힘으로 기록하지 않는다
      setStatus("ready");
      const code = errorCodeOf(error);
      setMessage(error instanceof Error && error.message ? error.message : "결제를 진행하지 못했어요.");
      if (!USER_ACTION_CODES.has(code)) report({ phase: "pay", code, message: tidyMessage(error), elapsedMs: 0, attempt, env: collectEnv("[data-toss-methods]") });
    }
  }

  return (
    <div>
      <div id={methodsId} data-toss-methods="" />
      <div id={agreementId} />
      {status === "loading" && <p className="py-6 text-[15px] text-ink-2">결제 수단을 불러오고 있어요.</p>}
      {message && (
        <p role="alert" className="mt-3 text-[15px] font-medium text-danger" data-testid="widget-message">
          {message}
        </p>
      )}
      {status === "error" && (
        <button type="button" onClick={() => {
            setStatus("loading");
            setMessage(null);
            setAttempt((n) => n + 1);
          }} className={`${buttonSecondary} mt-3 w-full`} data-testid="widget-retry">
          결제 화면 다시 불러오기
        </button>
      )}
      <button
        type="button"
        onClick={pay}
        disabled={status !== "ready"}
        aria-busy={status === "requesting"}
        className={`${buttonPrimary} mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {status === "requesting" ? "결제 진행 중…" : `${formatKrw(amount)} 결제하기`}
      </button>
    </div>
  );
}
