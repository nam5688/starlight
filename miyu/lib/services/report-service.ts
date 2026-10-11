// 리포트 생성과 조회. 결제가 확인된 주문에만 만들고, 완성된 리포트는 다시 만들지 않는다.

import { REPORT_GENERATING_STALE_MS, REPORT_MAX_ATTEMPTS } from "../commerce/report.ts";
import type { ReportGenerator } from "../report/generator.ts";
import { formatAssessmentBirth } from "./assessment-service.ts";
import type { AssessmentRecord, MiyuRepository, OrderRecord, ReportRecord } from "./ports.ts";

/**
 * 결제된 주문의 리포트를 준비한다.
 * - 이미 완성됐으면 저장된 것을 그대로 돌려준다 (다시 생성하지 않음)
 * - 다른 요청이 생성 중이면 기다리지 않고 현재 상태를 돌려준다
 * - 실패하면 failed로 남기고, 다시 시도할 수 있다
 */
export async function ensureReport(
  deps: { repo: MiyuRepository; generator: ReportGenerator; now: () => Date },
  order: OrderRecord,
): Promise<ReportRecord | null> {
  const { repo, generator } = deps;
  if (order.status !== "paid") return null;

  let report = await repo.getReportByOrder(order.id);
  if (report?.status === "ready") return report;

  if (!report) {
    const inserted = await repo.insertReport({
      userId: order.userId,
      orderId: order.id,
      assessmentId: order.assessmentId,
      status: "generating",
      attempts: 1,
    });
    if (!inserted.ok) return repo.getReportByOrder(order.id);
    report = inserted.value;
  } else {
    const stale = deps.now().getTime() - new Date(report.updatedAt).getTime() > REPORT_GENERATING_STALE_MS;
    if (report.status === "generating" && !stale) return report;
    if (report.attempts >= REPORT_MAX_ATTEMPTS) return report;
    const taken = await repo.updateReport(
      report.id,
      [report.status],
      { status: "generating", attempts: report.attempts + 1, lastError: null },
      report.attempts,
    );
    if (!taken) return repo.getReportByOrder(order.id);
    report = taken;
  }

  const assessment = await repo.getAssessment(order.assessmentId);
  try {
    if (!assessment) throw new Error("검사 결과를 찾을 수 없습니다.");
    const content = await generator.generate(reportInputOf(assessment));
    const ready = await repo.updateReport(report.id, ["generating"], {
      status: "ready",
      content,
      generator: generator.name,
      generatorVersion: generator.version,
      readyAt: deps.now().toISOString(),
    });
    return ready ?? repo.getReportByOrder(order.id);
  } catch (error) {
    const failed = await repo.updateReport(report.id, ["generating"], {
      status: "failed",
      lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
    });
    return failed ?? repo.getReportByOrder(order.id);
  }
}

export function reportInputOf(a: AssessmentRecord) {
  return {
    nickname: a.nickname,
    knownMbti: a.knownMbti,
    birthText: formatAssessmentBirth(a),
    summary: a.summary,
    saju: a.saju,
  };
}

export type ResultView = {
  assessment: AssessmentRecord;
  /** 결제가 끝난 주문 (없으면 null) */
  paidOrder: OrderRecord | null;
  refunded: boolean;
  report: ReportRecord | null;
};

/** 결과 화면용 조회. 본인 것이 아니면 null (화면에서는 '찾을 수 없음'으로 처리) */
export async function getResultView(
  repo: MiyuRepository,
  input: { userId: string; assessmentId: string },
): Promise<ResultView | null> {
  const assessment = await repo.getAssessment(input.assessmentId);
  if (!assessment || assessment.userId !== input.userId) return null;
  const orders = await repo.listOrdersForAssessment(assessment.id);
  const paidOrder = orders.find((o) => o.status === "paid") ?? null;
  const refunded = !paidOrder && orders.some((o) => o.status === "refunded");
  const report = paidOrder ? await repo.getReportByOrder(paidOrder.id) : null;
  return { assessment, paidOrder, refunded, report };
}

export type MyItem = {
  assessment: Pick<AssessmentRecord, "id" | "nickname" | "createdAt" | "source"> & { tendencyName: string };
  purchase: "none" | "paid" | "refunded";
  reportStatus: ReportRecord["status"] | null;
};

/** MY 목록 */
export async function listMyItems(repo: MiyuRepository, userId: string): Promise<MyItem[]> {
  const [assessments, orders, reports] = await Promise.all([
    repo.listAssessments(userId),
    repo.listOrdersForUser(userId),
    repo.listReportStatuses(userId),
  ]);
  return assessments
    .filter((a) => a.userId === userId)
    .map((a) => {
      const mine = orders.filter((o) => o.assessmentId === a.id);
      const paid = mine.find((o) => o.status === "paid");
      const report = paid ? reports.find((r) => r.orderId === paid.id) : undefined;
      return {
        assessment: {
          id: a.id,
          nickname: a.nickname,
          createdAt: a.createdAt,
          source: a.source,
          tendencyName: a.summary.tendency.name,
        },
        purchase: paid ? "paid" : mine.some((o) => o.status === "refunded") ? "refunded" : "none",
        reportStatus: report?.status ?? null,
      };
    });
}
