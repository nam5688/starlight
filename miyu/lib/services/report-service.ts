// 리포트 생성과 조회. 결제가 확인된 주문에만 만들고, 완성된 리포트는 다시 만들지 않는다.

import { REPORT_GENERATING_STALE_MS, REPORT_MAX_ATTEMPTS } from "../commerce/report.ts";
import type { ReportGenerator, ReportInput } from "../report/generator.ts";
import { formatAssessmentBirth } from "./assessment-service.ts";
import type { AssessmentRecord, MiyuRepository, OrderRecord, ReportRecord } from "./ports.ts";

type ReportDeps = { repo: MiyuRepository; generator: ReportGenerator; now: () => Date };

/**
 * 1) 대기열에 올린다 — 결제 확인 직후 바로 부른다 (AI를 기다리지 않음).
 * 이미 리포트 행이 있으면 그대로 돌려준다.
 */
export async function queueReport(deps: { repo: MiyuRepository }, order: OrderRecord): Promise<ReportRecord | null> {
  if (order.status !== "paid") return null;
  const existing = await deps.repo.getReportByOrder(order.id);
  if (existing) return existing;
  const inserted = await deps.repo.insertReport({
    userId: order.userId,
    orderId: order.id,
    assessmentId: order.assessmentId,
    status: "queued",
    attempts: 0,
  });
  return inserted.ok ? inserted.value : deps.repo.getReportByOrder(order.id);
}

export type ClaimResult = { report: ReportRecord | null; claimed: boolean };

/**
 * 2) 생성할 권리를 가져간다. 동시에 여러 요청이 와도 한 곳만 가져간다 (상태 + 시도 횟수로 확인).
 * - 대기 중이면 가져간다
 * - 생성 중인데 멈춘 지 오래되면(서버 재시작 등) 가져간다
 * - 실패한 리포트는 retryFailed일 때만 (고객의 "다시 만들기")
 * - 시도 횟수 상한을 넘으면 운영자 확인 대상으로 남긴다
 */
export async function claimReport(deps: ReportDeps, order: OrderRecord, opts: { retryFailed?: boolean } = {}): Promise<ClaimResult> {
  const { repo } = deps;
  if (order.status !== "paid") return { report: null, claimed: false };
  const report = (await repo.getReportByOrder(order.id)) ?? (await queueReport(deps, order));
  if (!report || report.status === "ready") return { report, claimed: false };
  if (report.attempts >= REPORT_MAX_ATTEMPTS) return { report, claimed: false };

  const stale = deps.now().getTime() - new Date(report.updatedAt).getTime() > REPORT_GENERATING_STALE_MS;
  if (report.status === "generating" && !stale) return { report, claimed: false };
  if (report.status === "failed" && !opts.retryFailed) return { report, claimed: false };

  const taken = await repo.updateReport(
    report.id,
    [report.status],
    { status: "generating", attempts: report.attempts + 1, lastError: null },
    report.attempts,
  );
  return taken ? { report: taken, claimed: true } : { report: await repo.getReportByOrder(order.id), claimed: false };
}

/** 3) 가져간 리포트를 실제로 만든다. 실패하면 failed로 남기고 결제 상태는 건드리지 않는다. */
export async function completeReport(deps: ReportDeps, order: OrderRecord, report: ReportRecord): Promise<ReportRecord | null> {
  const { repo, generator } = deps;
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

/** 가져가기 + 만들기를 한 번에 (백그라운드 작업에서 쓴다) */
export async function runReport(deps: ReportDeps, order: OrderRecord, opts: { retryFailed?: boolean } = {}): Promise<ReportRecord | null> {
  const { report, claimed } = await claimReport(deps, order, opts);
  return claimed && report ? completeReport(deps, order, report) : report;
}

/**
 * 결제된 주문의 리포트를 기다려서 준비한다 (테스트 · 즉시 생성용).
 * 웹 화면에서는 queueReport → 백그라운드 runReport를 쓴다.
 * - 이미 완성됐으면 저장된 것을 그대로 돌려준다 (다시 생성하지 않음)
 * - 실패한 리포트는 다시 시도한다
 */
export async function ensureReport(deps: ReportDeps, order: OrderRecord): Promise<ReportRecord | null> {
  await queueReport(deps, order);
  return runReport(deps, order, { retryFailed: true });
}

/** 다시 만들기를 더 할 수 있는지 (상한을 넘으면 운영자 확인) */
export const canRetryReport = (report: Pick<ReportRecord, "attempts"> | null) => !report || report.attempts < REPORT_MAX_ATTEMPTS;

export function reportInputOf(a: AssessmentRecord): ReportInput {
  return {
    nickname: a.nickname,
    knownMbti: a.knownMbti,
    birthText: formatAssessmentBirth(a),
    summary: a.summary,
    saju: a.saju,
    gender: null,
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
