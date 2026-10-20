import { NextResponse, type NextRequest } from "next/server";
import { isAuthConfigured } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { paymentGateway, readRepository } from "@/server/services";
import { getSiteUrl } from "@/server/session";
import { receiptFor, type ReceiptResult } from "@/lib/services/receipt-service";

/**
 * 결제 영수증 열기(/my/orders/<주문번호>/receipt) — 로그인한 구매자 본인의 주문만.
 * 결제사(토스페이먼츠)가 준 공식 영수증 주소를 서버에서 다시 읽어 검사한 뒤 그 주소로만 보낸다(주소는 저장하지 않고, 이 서버가 영수증을 만들지 않는다).
 * 열 수 없으면 주문 상세로 돌아가 이유를 안내한다(?receipt=이유). 응답은 캐시하지 않고 결제키 · 카드 정보는 어디에도 싣지 않는다.
 */
function noStore<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/my/orders/[orderNumber]/receipt">) {
  const { orderNumber } = await ctx.params;
  const site = await getSiteUrl();
  const to = (path: string) => noStore(NextResponse.redirect(new URL(path, site)));
  const detail = `/my/orders/${encodeURIComponent(orderNumber)}`;
  if (!isAuthConfigured()) return to("/my");
  let userId: string;
  try {
    const member = await getMember();
    if (!member) return to("/my");
    if (member.needsConsent) return to(consentPath(detail));
    userId = member.userId;
  } catch {
    return to("/my");
  }
  let result: ReceiptResult;
  try {
    result = await receiptFor({ repo: await readRepository(), gateway: paymentGateway() }, { userId, orderNumber });
  } catch {
    // 결제 설정 전이거나 읽기에 실패 — 오류 내용은 화면에 싣지 않는다
    result = { kind: "unavailable", reason: "lookup-failed" };
  }
  switch (result.kind) {
    case "ok":
      return noStore(NextResponse.redirect(result.url, 302));
    case "not-found":
      return noStore(new NextResponse(null, { status: 404 }));
    case "no-payment":
      return to(`${detail}?receipt=no-payment`);
    case "unavailable":
      return to(`${detail}?receipt=${result.reason}`);
  }
}
