import { timingSafeEqual } from "node:crypto";
import { cronSecret } from "@/server/env";
import { logError, recordOps } from "@/server/ops";
import { reconcileAllNow } from "@/server/reconcile";
import { drainQueuedReports, sweepReports } from "@/server/report-sweep";
import { purgeExpiredReferenceRecords } from "@/lib/services/summary-service";
import { benefitRepository, now as clock, writeRepository } from "@/server/services";

/**
 * 정기 실행 주소 — 결제 재확인(결제한 지 오래돼도 남은 질문이 있는 묶음 포함) + 리포트 지연 · 실패 점검 + 보관 기간이 지난 채팅 참고 기록 정리.
 * CRON_SECRET이 설정돼 있고 요청의 Authorization: Bearer 값이 같을 때만 실행한다 (Vercel Cron은 이 헤더를 자동으로 붙인다).
 * 응답에는 개수만 담는다 (고객 정보 없음).
 */
// 리포트를 이어서 만들 수 있으므로 실행 시간을 넉넉히 둔다 (플랫폼이 허용하는 범위 안에서)
export const maxDuration = 300;

async function run(request: Request) {
  const secret = cronSecret();
  if (!secret) return new Response("not configured", { status: 503 });
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("unauthorized", { status: 401 });

  try {
    const summary = await reconcileAllNow({}, "inline");
    const drained = await drainQueuedReports();
    const reports = await sweepReports();
    // 저장하지 않은 대화의 참고 기록은 90일 뒤 지운다 — 삭제 한 번이라 실행할 때마다 한다.
    // (예전에는 "매시 처음 10분 안의 실행에서만" 했지만, Vercel Hobby는 하루 한 번만 실행하고 정해진 시(時) 안의 아무 때나 불러서 그 조건이 거의 맞지 않았다)
    // 정리 실패가 결제 점검을 막지 않는다
    let purgedReferenceRecords = 0;
    try {
      purgedReferenceRecords = await purgeExpiredReferenceRecords(writeRepository(), new Date());
    } catch (e) {
      logError("cron.purge-reference", e);
    }
    // 혜택 정기 점검 — 만료 포인트 · 질문권 정리, 추천 가입 확정 조건 확인, 구매 적립 누락 보정, 오래된 추천 방문 기록 정리. 혜택 표가 아직 없는 DB(19~22번 전)에서는 건너뛰고 결제 점검을 막지 않는다
    let benefitMaintenance: Record<string, number | string> | null = null;
    try {
      benefitMaintenance = { ...(await benefitRepository().runMaintenance()) };
    } catch (e) {
      if ((e as { code?: string } | null)?.code !== "42P01") logError("cron.benefits", e);
    }
    // 정기 점검이 실제로 돌았다는 흔적 — /admin이 "마지막 실행"으로 보여 준다(개수만, 고객 정보 없음). 5분마다 도는 곳에서는 운영 기록이 쌓이지 않게 50분에 한 번만 남긴다
    try {
      const heartbeatCutoff = new Date(clock().getTime() - 50 * 60_000).toISOString();
      if (!(await writeRepository().hasOpsEventSince("cron.heartbeat", heartbeatCutoff))) {
        const c = summary.counts;
        await recordOps({ kind: "cron.heartbeat", severity: "info", dedupeKey: "cron.heartbeat", message: `정기 점검 실행 — 확인 ${summary.checked}건 · 결제 반영 ${c.paid}건 · 질문 환불 반영 ${c["partial-refund"]}건 · 환불 ${c.refunded}건 · 확인 필요 ${c.anomaly}건 · 조회 실패 ${c.error}건` });
      }
    } catch (e) {
      logError("cron.heartbeat", e);
    }
    return Response.json({ ok: true, checked: summary.checked, counts: summary.counts, drained: drained.attempted, reports, purgedReferenceRecords, benefits: benefitMaintenance });
  } catch (e) {
    logError("cron.reconcile", e);
    return new Response("error", { status: 500 });
  }
}

export const GET = run;
export const POST = run;
