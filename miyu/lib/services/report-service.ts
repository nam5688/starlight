// 리포트 생성과 조회. 결제가 확인된 주문에만 만들고, 완성된 리포트는 다시 만들지 않는다.

import { REPORT_GENERATING_STALE_MS, REPORT_GENERATION_TIMEOUT_MS, REPORT_MAX_ATTEMPTS, REPORT_RETRY_COOLDOWN_MS } from "../commerce/report.ts";
import { isPersonalProduct, parseConcernProductId } from "../config/product.ts";
import { concernInputOf } from "../personalization/concern.ts";
import type { AiUsageSample, ConcernInput, ReportGenerator, ReportInput } from "../report/generator.ts";
import { reportTexts } from "../report/concern/texts.ts";
import { isConcernReport } from "../report/concern/types.ts";
import { genderOfSaju } from "../saju/engine.ts";
import { formatAssessmentBirth } from "./assessment-service.ts";
import type { PersonalContext } from "../personalization/context.ts";
import { estimateCostKrw, type CapacityConfig } from "./capacity-service.ts";
import type { AssessmentRecord, MiyuRepository, OrderRecord, ReportRecord } from "./ports.ts";

type ReportDeps = {
  repo: MiyuRepository;
  generator: ReportGenerator;
  now: () => Date;
  /** 동시 생성 수 · 단가 설정 (없으면 제한 없음 · 비용 계산 없음) */
  capacity?: CapacityConfig;
  /** 한 번의 생성 시도에 허용하는 시간 (기본 REPORT_GENERATION_TIMEOUT_MS) */
  timeoutMs?: number;
};

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

export type ClaimResult = {
  report: ReportRecord | null;
  claimed: boolean;
  /** 가져가지 못한 이유 (고객 안내용) — capacity: 동시 생성 한도 · cooldown: 다시 만들기 간격 */
  waiting?: "capacity" | "cooldown";
};

/**
 * 2) 생성할 권리를 가져간다. 동시에 여러 요청이 와도 한 곳만 가져간다 (상태 + 시도 횟수로 확인).
 * - 대기 중이면 가져간다
 * - 생성 중인데 멈춘 지 오래되면(서버 재시작 등) 가져간다
 * - 실패한 리포트는 retryFailed일 때만 (고객의 "다시 만들기")
 * - 시도 횟수 상한을 넘으면 운영자 확인 대상으로 남긴다
 * - 동시에 생성하는 수가 한도(capacity.maxConcurrent)에 차 있으면 대기열에 둔다 (이미 결제한 고객의 리포트를 취소하지 않는다)
 * - 고객의 "다시 만들기"는 마지막 시도 후 REPORT_RETRY_COOLDOWN_MS가 지나야 한다 (운영자 · 테스트는 ignoreCooldown)
 */
export async function claimReport(deps: ReportDeps, order: OrderRecord, opts: { retryFailed?: boolean; ignoreCooldown?: boolean } = {}): Promise<ClaimResult> {
  const { repo } = deps;
  if (order.status !== "paid") return { report: null, claimed: false };
  const report = (await repo.getReportByOrder(order.id)) ?? (await queueReport(deps, order));
  if (!report || report.status === "ready") return { report, claimed: false };
  if (report.attempts >= REPORT_MAX_ATTEMPTS) return { report, claimed: false };

  const stale = deps.now().getTime() - new Date(report.updatedAt).getTime() > REPORT_GENERATING_STALE_MS;
  if (report.status === "generating" && !stale) return { report, claimed: false };
  if (report.status === "failed" && !opts.retryFailed) return { report, claimed: false };
  if (report.status === "failed" && !opts.ignoreCooldown && deps.now().getTime() - new Date(report.updatedAt).getTime() < REPORT_RETRY_COOLDOWN_MS) {
    return { report, claimed: false, waiting: "cooldown" };
  }
  const max = deps.capacity?.maxConcurrent ?? 0;
  if (max > 0) {
    const staleBefore = new Date(deps.now().getTime() - REPORT_GENERATING_STALE_MS).toISOString();
    if ((await repo.countActiveGenerations(staleBefore)) >= max) return { report, claimed: false, waiting: "capacity" };
  }

  const taken = await repo.updateReport(
    report.id,
    [report.status],
    { status: "generating", attempts: report.attempts + 1, lastError: null },
    report.attempts,
  );
  return taken ? { report: taken, claimed: true } : { report: await repo.getReportByOrder(order.id), claimed: false };
}

/** 3) 가져간 리포트를 실제로 만든다. 실패하면 failed로 남기고 결제 상태는 건드리지 않는다. 시간 초과도 완성으로 저장하지 않는다. */
export async function completeReport(deps: ReportDeps, order: OrderRecord, report: ReportRecord): Promise<ReportRecord | null> {
  const { repo, generator } = deps;
  const assessment = await repo.getAssessment(order.assessmentId);
  const limit = deps.timeoutMs ?? REPORT_GENERATION_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // AI 호출 기록은 쌓는 동안 생성 흐름을 막지 않는다 (기록 실패가 리포트 제공을 막지 않게)
  const pending: Promise<void>[] = [];
  const onUsage = (u: AiUsageSample) => {
    pending.push(
      repo
        .addAiUsage({
          reportId: report.id,
          provider: u.provider,
          model: u.model,
          promptVersion: u.promptVersion,
          inputTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          estCostKrw: deps.capacity ? estimateCostKrw(deps.capacity, u) : null,
          latencyMs: u.latencyMs,
          outcome: u.outcome,
          errorCode: u.errorCode,
        })
        .catch(() => {}),
    );
  };
  try {
    if (!assessment) throw new Error("검사 결과를 찾을 수 없습니다.");
    // 고민 반영 리포트는 발급할 때 저장해 둔 고민 기록으로 쓴다 (지금의 고민이 아니다). 개인 종합은 생성을 시작하는 시점의 고민을 쓴다 (반영하는 생성기일 때만 읽는다)
    const recordId = parseConcernProductId(order.productId);
    const concernInput = recordId ? await concernInputFor(repo, generator, order, assessment, recordId) : null;
    const context = !recordId && generator.usesContext ? await repo.getContext(assessment.id) : null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // 실패 사유를 먼저 확정하고(경쟁에서 이기도록) 그다음 남은 AI 호출을 멈춘다
        reject(new Error(`리포트 생성 시간 초과 (제한 ${Math.max(1, Math.round(limit / 1000))}초) — 중단했습니다.`));
        controller.abort();
      }, limit);
    });
    const run = concernInput ? generator.generateConcern!(concernInput, { signal: controller.signal, onUsage }) : generator.generate(reportInputOf(assessment, context), { signal: controller.signal, onUsage });
    const content = await Promise.race([run, timeout]);
    const ready = await repo.updateReport(report.id, ["generating"], {
      status: "ready",
      content,
      generator: generator.name,
      generatorVersion: generator.version,
      readyAt: deps.now().toISOString(),
    });
    return ready ?? repo.getReportByOrder(order.id);
  } catch (error) {
    controller.abort();
    const failed = await repo.updateReport(report.id, ["generating"], {
      status: "failed",
      lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
    });
    return failed ?? repo.getReportByOrder(order.id);
  } finally {
    if (timer) clearTimeout(timer);
    await Promise.allSettled(pending);
  }
}

/**
 * 고민 반영 리포트를 쓰는 데 필요한 값을 모은다 — 발급 당시의 고민 기록, 이미 준 개인 통합 리포트의 글, 이전에 발급한 고민 리포트.
 * 모을 수 없으면(기록이 없거나 지워졌거나, 고민을 반영하지 못하는 생성기) 오류로 실패 처리한다 — 같은 발급 건으로 다시 시도할 수 있다.
 */
async function concernInputFor(repo: MiyuRepository, generator: ReportGenerator, order: OrderRecord, assessment: AssessmentRecord, recordId: string): Promise<ConcernInput> {
  if (!generator.generateConcern) throw new Error("이 리포트 생성기는 고민 반영 리포트를 만들 수 없습니다.");
  const record = await repo.getConcernRecord(recordId);
  if (!record || record.userId !== order.userId || record.assessmentId !== order.assessmentId) throw new Error("고민 기록을 찾을 수 없습니다.");
  if (record.scrubbedAt) throw new Error("고민 기록의 내용이 지워져 리포트를 만들 수 없습니다.");
  const orders = await repo.listOrdersForAssessment(order.assessmentId);
  const basePaid = orders.find((o) => o.status === "paid" && isPersonalProduct(o.productId));
  const baseReport = basePaid ? await repo.getReportByOrder(basePaid.id) : null;
  // 이미 준 개인 통합 리포트가 없어도(환불 등) 발급은 이미 결제된 건이므로 막지 않고, 중복 검사만 건너뛴다
  const base = baseReport?.status === "ready" && baseReport.content ? reportTexts(baseReport.content) : null;

  // 이전에 발급한 고민 리포트 (이번 기록보다 먼저 만든 것, 최근 3건)
  const previous: ConcernInput["previous"] = [];
  const records = await repo.listConcernRecords(order.assessmentId);
  for (const r of records.filter((x) => x.id !== record.id && x.createdAt < record.createdAt)) {
    if (previous.length >= 3) break;
    const paid = orders.find((o) => o.status === "paid" && parseConcernProductId(o.productId) === r.id);
    const rep = paid ? await repo.getReportByOrder(paid.id) : null;
    if (rep?.status === "ready" && rep.content && isConcernReport(rep.content)) previous.push({ topic: r.topic, headline: rep.content.headline, texts: reportTexts(rep.content).all });
  }

  return {
    nickname: assessment.nickname,
    knownMbti: assessment.knownMbti,
    summary: assessment.summary,
    saju: assessment.saju,
    gender: genderOfSaju(assessment.saju),
    concern: concernInputOf(record),
    snapshot: { recordId: record.id, writtenAt: record.writtenAt },
    base,
    previous,
  };
}

/** 가져가기 + 만들기를 한 번에 (백그라운드 작업에서 쓴다) */
export async function runReport(deps: ReportDeps, order: OrderRecord, opts: { retryFailed?: boolean; ignoreCooldown?: boolean } = {}): Promise<ReportRecord | null> {
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
  return runReport(deps, order, { retryFailed: true, ignoreCooldown: true });
}

/** 다시 만들기를 더 할 수 있는지 (상한을 넘으면 운영자 확인) */
export const canRetryReport = (report: Pick<ReportRecord, "attempts"> | null) => !report || report.attempts < REPORT_MAX_ATTEMPTS;

export function reportInputOf(a: AssessmentRecord, context: PersonalContext | null = null): ReportInput {
  return {
    nickname: a.nickname,
    knownMbti: a.knownMbti,
    birthText: formatAssessmentBirth(a),
    summary: a.summary,
    saju: a.saju,
    gender: genderOfSaju(a.saju),
    context: context
      ? {
          topic: context.topic,
          question: context.question,
          situation: context.situation,
          matched: context.matched,
          differed: context.differed,
          excerpt: context.excerpt,
          updatedAt: context.updatedAt,
        }
      : null,
  };
}

export type ResultView = {
  assessment: AssessmentRecord;
  /** 결제가 끝난 주문 (없으면 null) */
  paidOrder: OrderRecord | null;
  refunded: boolean;
  report: ReportRecord | null;
  /** 내 고민 자세히 알려주기에 적은 내용 (없으면 null) */
  context: PersonalContext | null;
};

/** 결과 화면용 조회. 본인 것이 아니면 null (화면에서는 '찾을 수 없음'으로 처리) */
export async function getResultView(
  repo: MiyuRepository,
  input: { userId: string; assessmentId: string },
): Promise<ResultView | null> {
  const assessment = await repo.getAssessment(input.assessmentId);
  if (!assessment || assessment.userId !== input.userId) return null;
  const orders = await repo.listOrdersForAssessment(assessment.id);
  const personal = orders.filter((o) => isPersonalProduct(o.productId));
  const paidOrder = personal.find((o) => o.status === "paid") ?? null;
  const refunded = !paidOrder && personal.some((o) => o.status === "refunded");
  const [report, context] = await Promise.all([paidOrder ? repo.getReportByOrder(paidOrder.id) : null, repo.getContext(assessment.id)]);
  return { assessment, paidOrder, refunded, report, context };
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
      const mine = orders.filter((o) => o.assessmentId === a.id && isPersonalProduct(o.productId));
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
