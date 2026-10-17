// 주문이 끝난 뒤 고객이 돌아갈 화면 — 사주 궁합은 그 주문의 궁합 리포트, 유료 질문은 질문했던 채팅방(결제가 끝났으면 이어서 보내라는 표시 paid를 함께), 개인 통합 리포트는 결과 화면(다시 받은 리포트는 그 주문의 리포트), 고민 반영 리포트는 나의 고민 기록소(결제 완료 뒤에는 그 기록의 리포트).
// (비밀값을 다루지 않는 순수 함수라 "server-only" 없이 두고 테스트한다)

import { isCashProduct, isCompatProduct, parseConcernProductId, parsePersonalSeq } from "../lib/config/product.ts";
import { questionRoomOf } from "../lib/commerce/cash.ts";
import { ROOMS } from "../lib/report/reading/talk-room.ts";

export function resultPathOf(order: { assessmentId: string; productId: string; orderNumber?: string }, opts: { paid?: boolean } = {}): string {
  // 유료 질문은 질문했던 채팅방으로 돌아간다 (결제가 끝났으면 paid로 알려, 결제 전에 적어 둔 질문을 이어서 보낸다).
  // 방 이름은 돌아갈 화면을 고르는 데만 쓰고(권한 판단 아님), 없는 방이거나 예전 선불 충전 주문이면 기본 채팅방으로 간다
  if (isCashProduct(order.productId)) {
    const room = questionRoomOf(order.productId);
    const base = room && room in ROOMS && room !== "main" ? `/results/${order.assessmentId}/talk/${room}` : `/results/${order.assessmentId}/talk`;
    return opts.paid && order.orderNumber ? `${base}?paid=${encodeURIComponent(order.orderNumber)}` : base;
  }
  // 사주 궁합은 그 주문의 궁합 리포트 화면으로(결제 전에 돌아갈 때는 궁합 입구로)
  if (isCompatProduct(order.productId)) return order.orderNumber && opts.paid ? `/compat/report/${encodeURIComponent(order.orderNumber)}` : "/compat";
  const recordId = parseConcernProductId(order.productId);
  if (!recordId) {
    // 같은 결과로 다시 받은 리포트(2번째부터)는 그 주문의 리포트를 바로 연다 — 이미 받은 리포트가 먼저 보이지 않게
    const seq = parsePersonalSeq(order.productId);
    return seq !== null && seq > 1 && order.orderNumber ? `/results/${order.assessmentId}?r=${encodeURIComponent(order.orderNumber)}` : `/results/${order.assessmentId}`;
  }
  return opts.paid ? `/results/${order.assessmentId}/context/${recordId}` : `/results/${order.assessmentId}/context`;
}
