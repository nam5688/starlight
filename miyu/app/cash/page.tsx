import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "ME:U 미유", robots: { index: false } };

/**
 * 예전 "미유캐시 충전" 주소 — 선불 충전은 없어지고(운영자 2026-10-15) 무료 질문을 다 쓴 뒤 질문 한 개당 결제로 이어 간다.
 * 예전에 받은 링크나 즐겨찾기가 막히지 않게 MY로 보낸다.
 */
export default function CashPage() {
  redirect("/my");
}
