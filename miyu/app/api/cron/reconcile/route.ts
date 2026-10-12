import { timingSafeEqual } from "node:crypto";
import { cronSecret } from "@/server/env";
import { logError } from "@/server/ops";
import { reconcileAllNow } from "@/server/reconcile";
import { drainQueuedReports, sweepReports } from "@/server/report-sweep";

/**
 * 정기 실행 주소 — 결제 재확인 + 리포트 지연 · 실패 점검.
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
    return Response.json({ ok: true, checked: summary.checked, counts: summary.counts, drained: drained.attempted, reports });
  } catch (e) {
    logError("cron.reconcile", e);
    return new Response("error", { status: 500 });
  }
}

export const GET = run;
export const POST = run;
