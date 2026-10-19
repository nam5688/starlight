"use server";

import { normalizeWidgetIssue, widgetIssueLines } from "@/lib/commerce/widget-session";
import { getMember } from "@/server/member";
import { alert } from "@/server/ops";
import { readRepository } from "@/server/services";

/**
 * 결제 화면(토스 결제위젯)이 준비되지 못했을 때 브라우저가 보내는 막힘 보고를 운영 기록으로 남긴다.
 * 2026-10-19 테스트 결제에서 결제수단 · 약관 화면이 뜬 뒤 약 60초 만에 일반 오류가 나는데 어느 단계의 어떤 오류인지 남지 않았던 문제의 진단용이다(원인은 확정하지 않았다).
 *
 * 안전: 로그인한 회원 본인의 주문에 대해서만 받는다. 값은 열거형 · 범위로 다시 확인하고(normalizeWidgetIssue) 모르는 값이면 기록하지 않는다.
 * 담는 것은 주문번호 · 단계 · 오류 코드 · 걸린 시간 · 시도 횟수 · 브라우저 종류(앱 안 브라우저 여부 정도) · 저장소/쿠키 사용 가능 여부뿐이다 — 이름 · 생년월일 · 키 · 사용자 에이전트 원문은 없다.
 * 같은 주문 · 같은 단계 · 같은 코드는 6시간 동안 한 번만 알린다(기록은 매번 남지 않고 알림 중복 방지 규칙을 따른다). 이 보고는 결제를 막지도 열지도 않는다.
 */
export async function reportWidgetIssueAction(orderNumber: string, raw: unknown): Promise<void> {
  try {
    if (typeof orderNumber !== "string" || orderNumber.length < 8 || orderNumber.length > 64) return;
    const member = await getMember();
    if (!member || member.needsConsent) return;
    const issue = normalizeWidgetIssue(raw);
    if (!issue) return;
    const order = await (await readRepository()).getOrderByNumber(orderNumber);
    if (!order || order.userId !== member.userId) return;
    await alert({
      kind: "checkout.widget",
      severity: "warn",
      title: `결제 화면이 준비되지 않았어요 (${issue.phase} · ${issue.code})`,
      orderNumber: order.orderNumber,
      dedupeKey: `checkout.widget:${order.orderNumber}:${issue.phase}:${issue.code}`,
      lines: widgetIssueLines(issue),
    });
  } catch {
    // 진단용 보고가 결제 화면을 깨뜨리지 않는다
  }
}
