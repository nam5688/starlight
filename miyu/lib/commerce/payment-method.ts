// 결제수단 확인 — 출시 초기에는 카드만 운영한다(lib/config/product.ts의 LAUNCH_PAYMENT_METHODS).
// 토스페이먼츠 Payment 객체의 method 값은 "카드" · "가상계좌" · "간편결제" · "휴대폰" · "계좌이체" · "문화상품권" 같은 한국어 이름이다.

import { LAUNCH_PAYMENT_METHODS } from "../config/product.ts";

/** 카드로 결제됐는가 ("간편결제"는 카드를 거치더라도 결제사가 카드와 따로 분류하므로 카드가 아니다) */
export const isCardMethod = (method: string | null | undefined): boolean => method === "카드";

/**
 * 카드만 운영하는 동안 카드가 아닌 결제수단으로 승인된 주문이 있으면 운영자에게 알릴 안내 줄을 돌려준다. 문제가 없으면 null.
 * 이유: 결제수단마다 취소 가능 기간이 달라(계좌이체 180일 · 가상계좌 보통 365일 · 휴대폰 결제는 결제한 달에만) 환불 절차가 달라진다 — 결제위젯 설정에서 카드만 보이게 했는지 확인한다.
 * 결제를 막거나 취소하지는 않는다(승인된 결제는 정상 처리하고, 환불은 운영자가 토스 관리자에서 한다).
 */
export function nonCardNotice(method: string | null | undefined, cardOnly: boolean = LAUNCH_PAYMENT_METHODS.cardOnly): string[] | null {
  if (!cardOnly || isCardMethod(method)) return null;
  return [
    `결제수단 ${method ? `"${method}"` : "확인되지 않음"} — 지금은 카드만 운영합니다`,
    "토스 개발자센터의 결제위젯 설정에서 카드만 보이게 되어 있는지 확인해 주세요",
    "카드가 아닌 결제수단은 취소 가능 기간이 달라(계좌이체 180일 · 가상계좌 보통 365일 · 휴대폰 결제는 결제한 달에만) 환불 절차가 달라집니다",
  ];
}
