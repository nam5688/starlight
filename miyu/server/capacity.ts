import "server-only";
import { saleGate, type SaleGate } from "@/lib/services/capacity-service";
import type { SaleGateCheck } from "@/lib/services/order-service";
import { capacityConfig } from "./env";
import { alert } from "./ops";
import { now, writeRepository } from "./services";

/** 새 구매를 받아도 되는지 — 결제 시작 전 · 승인 요청 직전에 같은 함수를 쓴다. 용량 · 예산은 사용자 데이터가 아니므로 서버 저장소로 센다 */
export const saleGateCheck: SaleGateCheck = async (stage) => {
  const gate = await saleGate(writeRepository(), capacityConfig(), now(), stage);
  if (!gate.open) await notifyClosed(gate, stage);
  else if (gate.budgetUsedPct !== null && gate.budgetUsedPct >= 80) await notifyBudget(gate);
  return gate;
};

// 결과 화면을 열 때마다 DB를 세지 않도록, 화면 표시용 상태는 이 서버 안에서 20초 동안 재사용한다.
// (표시용일 뿐이다 — 결제를 시작하기 직전 · 승인 요청 직전의 확인(saleGateCheck)은 항상 새로 센다. 개인 정보가 없는 전체 상태라 사용자 간에 나눠 써도 된다)
const DISPLAY_TTL_MS = 20_000;
let displayCache: { at: number; gate: SaleGate } | null = null;

/** 화면 표시용 (알림 없이 상태만, 20초 재사용) */
export async function currentSaleGate(): Promise<SaleGate> {
  const t = now().getTime();
  if (displayCache && t - displayCache.at < DISPLAY_TTL_MS) return displayCache.gate;
  const gate = await saleGate(writeRepository(), capacityConfig(), now(), "start");
  displayCache = { at: t, gate };
  return gate;
}

async function notifyClosed(gate: SaleGate, stage: "start" | "confirm") {
  await alert({
    kind: "sales.paused",
    severity: "warn",
    title: gate.reason === "budget" ? "하루 AI 예산에 가까워 새 구매를 멈췄습니다" : "리포트 준비가 밀려 새 구매를 멈췄습니다",
    dedupeKey: `sales-paused:${gate.reason}:${stage}`,
    lines: [`대기 ${gate.queued}건 · 생성 중 ${gate.generating}건 · 오늘 예상 비용 ${gate.todayCostKrw}원`, "이미 결제한 고객의 리포트는 계속 준비됩니다"],
  });
}

async function notifyBudget(gate: SaleGate) {
  await alert({ kind: "budget.warn", severity: "warn", title: `하루 AI 예산의 ${gate.budgetUsedPct}%를 쓰거나 예약했습니다`, dedupeKey: `budget-warn:${new Date().toISOString().slice(0, 10)}` });
}
