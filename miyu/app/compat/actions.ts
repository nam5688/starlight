"use server";

import { computeSimpleCompat, type SimpleCompatOutcome } from "@/lib/compat/simple";

/**
 * 간단 궁합(무료) — 두 사람의 출생정보로 계산한 결과 카드를 돌려준다.
 * 입력한 생년월일 · 이름은 이 계산에만 쓰고 저장하거나 기록하지 않는다(로그 · 운영 기록 · 알림에도 남기지 않는다). 로그인 없이 쓸 수 있다.
 */
export async function simpleCompatAction(input: { a: unknown; b: unknown }): Promise<SimpleCompatOutcome> {
  return computeSimpleCompat(input?.a, input?.b, new Date());
}
