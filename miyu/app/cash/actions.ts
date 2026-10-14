"use server";

import { redirect } from "next/navigation";
import { startCashCharge } from "@/lib/services/cash-service";
import { readAcquisition } from "@/server/acquisition";
import { saleGateCheck } from "@/server/capacity";
import { paymentConfig, paymentEnvOf } from "@/server/env";
import { getMember } from "@/server/member";
import { now, writeRepository } from "@/server/services";

/**
 * 충전하기: 서버가 개수로 금액 · 보너스를 계산해 주문을 만들고 결제 화면으로 보낸다.
 * 브라우저가 보낸 금액은 쓰지 않는다 — 개수(10의 배수)만 받고 나머지는 서버가 정한다.
 */
export async function startCashChargeAction(assessmentId: string, formData: FormData) {
  const back = (error?: string) => `/cash?a=${encodeURIComponent(assessmentId)}${error ? `&error=${error}` : ""}`;
  const member = await getMember();
  if (!member || member.needsConsent) redirect(back());
  const config = paymentConfig();
  if (!config.ok) redirect(back("payments"));

  const raw = formData.get("cash");
  const cash = typeof raw === "string" && /^[0-9]{1,6}$/.test(raw) ? Number(raw) : null;
  const result = await startCashCharge({ repo: writeRepository(), now, gate: saleGateCheck }, { userId: member.userId, assessmentId, cash, paymentEnv: paymentEnvOf(config), acquisition: await readAcquisition() });
  if (result.kind === "not-found") redirect("/cash");
  if (result.kind === "invalid-amount") redirect(back("amount"));
  if (result.kind === "sales-closed") redirect(back("closed"));
  if (result.kind === "unavailable") redirect(back("unavailable"));
  redirect(`/checkout/${result.order.orderNumber}`);
}
