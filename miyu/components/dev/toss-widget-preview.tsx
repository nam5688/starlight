"use client";

import { useState } from "react";
import { TossCheckout } from "@/components/checkout/toss-checkout";
import { widgetIssueLines, type WidgetIssue } from "@/lib/commerce/widget-session";

/**
 * 개발용 — 결제수단 · 약관 화면이 준비되지 않았을 때(막힘 보고 · 다시 불러오기)의 모양을 가상 SDK로 확인한다.
 * 막힘 보고는 서버로 보내지 않고 아래 목록에만 보인다. 실제 토스 서버와 통신하지 않는다(브라우저 시험이 SDK 주소를 가짜 스크립트로 바꿔 놓는다).
 */
export function TossWidgetPreview() {
  const [issues, setIssues] = useState<WidgetIssue[]>([]);
  const [second, setSecond] = useState(false);
  return (
    <div>
      <TossCheckout
        clientKey="test_gck_preview_not_real"
        customerKey="preview-customer"
        orderId="MEU-PREVIEW-0000"
        orderName="미리보기 상품"
        amount={9900}
        onIssue={(issue) => setIssues((list) => [...list, issue])}
      />
      {/* Next.js는 떠난 화면을 숨긴 채 문서에 남긴다 — 같은 화면이 두 개 있어도 결제수단 · 약관 칸이 서로 겹치지 않는지 확인하는 버튼 */}
      <button type="button" data-testid="open-second" onClick={() => setSecond(true)} className="mt-6 text-[14px] underline">
        결제 화면 하나 더 열기(남아 있는 이전 화면 흉내)
      </button>
      {second && (
        <div data-testid="second-instance" className="mt-4 border-t border-line pt-4">
          <TossCheckout clientKey="test_gck_preview_not_real" customerKey="preview-customer" orderId="MEU-PREVIEW-0001" orderName="미리보기 상품 2" amount={9900} onIssue={(issue) => setIssues((list) => [...list, issue])} />
        </div>
      )}
      <section className="mt-8" aria-label="막힘 보고(서버로 보내지 않음)">
        <h2 className="text-[16px] font-bold">막힘 보고 {issues.length}건 (서버로 보내지 않음)</h2>
        <ol data-testid="issue-log" className="mt-2 space-y-2 text-[13px] text-ink-2">
          {issues.map((i, n) => (
            <li key={n} data-testid="issue" data-phase={i.phase} data-code={i.code} data-attempt={i.attempt}>
              {widgetIssueLines(i).join(" / ")}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
