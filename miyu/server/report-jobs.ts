import "server-only";
import { after } from "next/server";
import { isCashProduct } from "@/lib/config/product";
import type { OrderRecord } from "@/lib/services/ports";
import { claimReport, completeReport, queueReport, runReport } from "@/lib/services/report-service";
import { capacityConfig } from "./env";
import { now, pairRepository, reportGenerator, writeRepository } from "./services";

// 리포트 생성은 응답을 보낸 뒤 백그라운드에서 한다 (AI 생성이 길어도 결제 화면이 멈추지 않게).
// 서버가 중간에 꺼지면 결과 화면의 상태 확인이 멈춘 작업을 이어받는다 (report-service의 claimReport).

const deps = () => {
  const capacity = capacityConfig();
  return { repo: writeRepository(), pairs: pairRepository(), generator: reportGenerator(), now, capacity, ...(capacity.generationTimeoutMs > 0 ? { timeoutMs: capacity.generationTimeoutMs } : {}) };
};

function log(where: string, e: unknown) {
  // 리포트 내용 · 개인정보는 남기지 않는다
  console.error(`[report] ${where}`, e instanceof Error ? e.message : e);
}

/** 결제 확인 직후: 대기열에 올리고 백그라운드 생성을 예약한다 */
export async function queueAndScheduleReport(order: OrderRecord) {
  if (isCashProduct(order.productId)) return; // 미유캐시 충전은 리포트가 없다
  try {
    await queueReport({ repo: writeRepository() }, order);
  } catch (e) {
    log("대기열 등록 실패", e); // 결과 화면의 상태 확인에서 다시 시도된다
  }
  after(async () => {
    try {
      await runReport(deps(), order);
    } catch (e) {
      log("백그라운드 생성 오류", e);
    }
  });
}

/**
 * 지금 생성 권리를 가져오고(동기), 실제 생성은 백그라운드로 넘긴다.
 * - retryFailed: 고객이 "다시 만들기"를 눌렀을 때
 * - 그 밖: 대기 중이거나 멈춘 작업만 이어받는다
 */
export async function claimAndSchedule(order: OrderRecord, opts: { retryFailed?: boolean; ignoreCooldown?: boolean } = {}) {
  const d = deps();
  const { report, claimed, waiting } = await claimReport(d, order, opts);
  if (claimed && report) {
    after(async () => {
      try {
        await completeReport(d, order, report);
      } catch (e) {
        log("백그라운드 생성 오류", e);
      }
    });
  }
  return { report, waiting };
}

/**
 * 지금 이 자리에서 생성까지 끝낸다 (이미 응답 뒤 백그라운드 · 정기 점검처럼 기다려도 되는 곳에서 쓴다).
 * after() 안에서 다시 after()를 부르면 실행되지 않을 수 있어, 그런 곳에서는 예약하지 않고 직접 실행한다.
 */
export async function runReportInline(order: OrderRecord) {
  try {
    await queueReport({ repo: writeRepository() }, order);
    return await runReport(deps(), order);
  } catch (e) {
    log("직접 생성 오류", e);
    return null;
  }
}
