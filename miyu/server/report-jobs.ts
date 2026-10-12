import "server-only";
import { after } from "next/server";
import type { OrderRecord } from "@/lib/services/ports";
import { claimReport, completeReport, queueReport, runReport } from "@/lib/services/report-service";
import { now, reportGenerator, writeRepository } from "./services";

// 리포트 생성은 응답을 보낸 뒤 백그라운드에서 한다 (AI 생성이 길어도 결제 화면이 멈추지 않게).
// 서버가 중간에 꺼지면 결과 화면의 상태 확인이 멈춘 작업을 이어받는다 (report-service의 claimReport).

const deps = () => ({ repo: writeRepository(), generator: reportGenerator(), now });

function log(where: string, e: unknown) {
  // 리포트 내용 · 개인정보는 남기지 않는다
  console.error(`[report] ${where}`, e instanceof Error ? e.message : e);
}

/** 결제 확인 직후: 대기열에 올리고 백그라운드 생성을 예약한다 */
export async function queueAndScheduleReport(order: OrderRecord) {
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
export async function claimAndSchedule(order: OrderRecord, opts: { retryFailed?: boolean } = {}) {
  const d = deps();
  const { report, claimed } = await claimReport(d, order, opts);
  if (claimed && report) {
    after(async () => {
      try {
        await completeReport(d, order, report);
      } catch (e) {
        log("백그라운드 생성 오류", e);
      }
    });
  }
  return report;
}
