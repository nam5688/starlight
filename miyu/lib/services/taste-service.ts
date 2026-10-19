// 맛보기 리포트(무료 · 로그인한 회원 · 한 계정당 1번) 처리 — 소유자 확인 → 이미 받았는지 → 하루 AI 예산 → DB에서 자리 예약 → AI가 쓰기(검사 통과분만) → 저장(실패하면 예약을 풀어 다시 받을 수 있게).
// 글에 이름 · 생년월일은 없고, 사용 기록(ai_usage)에는 토큰 수만 남는다. 이미 결제한 리포트와는 상관없다 — 무료 맛보기 전용이다.
import type { GenerateContext } from "../report/generator.ts";
import type { TasteInput, TasteReport } from "../report/taste/types.ts";
import { readTasteReport } from "../report/taste/validate.ts";
import { TasteWriteError, type TasteWriter } from "../report/taste/writer.ts";
import { estimateCostKrw, seoulDayStart, type CapacityConfig } from "./capacity-service.ts";
import type { MiyuRepository } from "./ports.ts";
import { owns, ownsActive } from "./talk-service.ts";

export type TasteReason = "closed" | "owned" | "budget" | "busy" | "used-elsewhere" | "not-ready" | "not-found" | "failed" | "deleted";

export const TASTE_MESSAGES: Record<TasteReason, string> = {
  closed: "맛보기 리포트는 아직 준비 중이에요.",
  owned: "심층 리포트를 받으신 결과예요. 심층 리포트에서 전체 풀이를 볼 수 있어요.",
  budget: "지금은 요청이 많아 잠시 쉬고 있어요. 조금 뒤에 다시 눌러 주세요.",
  busy: "맛보기 리포트를 쓰는 중이에요. 잠시 뒤 화면을 새로 열어 주세요.",
  "used-elsewhere": "맛보기 리포트는 한 계정에 한 번만 받을 수 있어요. 다른 결과에서 이미 받으셨어요.",
  "not-ready": "맛보기 리포트는 아직 준비 중이에요.",
  "not-found": "이 결과를 찾지 못했어요. 화면을 새로 열어 주세요.",
  failed: "이번에는 맛보기 리포트를 만들지 못했어요. 한 번으로 세지 않았으니 잠시 뒤에 다시 눌러 주세요.",
  deleted: "삭제한 기록에서는 맛보기 리포트를 받을 수 없어요.",
};

export type TasteResult = { ok: true; report: TasteReport; alreadyHad: boolean } | { ok: false; reason: TasteReason; message: string };

const fail = (reason: TasteReason): TasteResult => ({ ok: false, reason, message: TASTE_MESSAGES[reason] });
const missingTable = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";

/** 결과 화면이 보는 상태 — ready: 이 결과의 맛보기 리포트가 있다 · pending: 쓰는 중 · none: 아직 받지 않았다(받을 수 있다) · used-elsewhere: 다른 결과에서 받았다 · unavailable: DB 변경 17번 전이다 */
export type TasteViewState = { kind: "ready"; report: TasteReport } | { kind: "pending" } | { kind: "none" } | { kind: "used-elsewhere" } | { kind: "unavailable" };

export async function tasteStateFor(repo: MiyuRepository, userId: string, assessmentId: string): Promise<TasteViewState> {
  let row: Awaited<ReturnType<MiyuRepository["getTasteReport"]>>;
  try {
    row = await repo.getTasteReport(userId);
  } catch (e) {
    if (missingTable(e)) return { kind: "unavailable" };
    throw e;
  }
  if (!row) return { kind: "none" };
  if (row.status === "pending") return row.assessmentId === assessmentId ? { kind: "pending" } : { kind: "none" };
  if (row.assessmentId !== assessmentId) return { kind: "used-elsewhere" };
  const report = readTasteReport(row.content);
  return report ? { kind: "ready", report } : { kind: "unavailable" };
}

/** 이 결과에서 AI가 읽을 근거 — 결과를 찾지 못하면 not-found, 이미 심층 리포트를 받은 결과면 owned */
export type TasteLoad = { ok: true; input: TasteInput } | { ok: false; reason: "not-found" | "owned" };

export type TasteDeps = {
  repo: MiyuRepository;
  /** 연결된 AI가 없으면 null (맛보기 리포트는 닫힘) */
  writer: TasteWriter | null;
  now: () => Date;
  capacity?: CapacityConfig;
  /**
   * 이 결과에서 AI가 읽을 근거 — 서버가 저장된 결과에서 다시 만든다(브라우저가 보낸 글을 믿지 않는다).
   * 결과를 찾지 못하면 not-found, 이미 심층 리포트를 받은 결과면 owned.
   */
  loadInput: () => Promise<TasteLoad>;
};

export type TasteRequest = { userId: string; assessmentId: string };

/** 하루 AI 예산에 닿았는가 — 닿으면 새 맛보기 리포트(와 새 질문)만 멈춘다. 이미 결제한 리포트는 영향 없다 */
async function overBudget(deps: TasteDeps): Promise<boolean> {
  const budget = deps.capacity?.dailyBudgetKrw ?? 0;
  return budget > 0 && (await deps.repo.sumAiCostSince(seoulDayStart(deps.now()))) >= budget;
}

/**
 * 맛보기 리포트 받기 — 한 계정에 한 번. 같은 요청이 동시에 와도(두 번 누름 · 탭 두 개) DB의 예약이 한 번에 하나만 통과시킨다.
 * 글을 만들지 못했다면(호출 실패 · 검사에 걸림 · 저장 실패) 예약을 풀어 받은 것으로 세지 않는다.
 */
export async function requestTasteReport(deps: TasteDeps, req: TasteRequest): Promise<TasteResult> {
  const { repo } = deps;
  if (!(await owns(repo, req.userId, req.assessmentId))) return fail("not-found");
  // 삭제한 기록에서는 맛보기 글을 새로 만들지 않는다(이미 받은 줄은 글만 지워져 있고 한 계정 한 번은 그대로다 — DB 트리거도 막는다)
  if (!(await ownsActive(repo, req.userId, req.assessmentId))) return fail("deleted");
  const writer = deps.writer;
  if (!writer) return fail("closed");

  // 이미 받았는지 먼저(AI를 부르기 전에)
  let existing: Awaited<ReturnType<MiyuRepository["getTasteReport"]>>;
  try {
    existing = await repo.getTasteReport(req.userId);
  } catch (e) {
    if (missingTable(e)) return fail("not-ready");
    throw e;
  }
  if (existing?.status === "ready") {
    if (existing.assessmentId !== req.assessmentId) return fail("used-elsewhere");
    const report = readTasteReport(existing.content);
    return report ? { ok: true, report, alreadyHad: true } : fail("failed");
  }

  const loaded = await deps.loadInput();
  if (!loaded.ok) return fail(loaded.reason);
  if (await overBudget(deps)) return fail("budget");

  let reserved: Awaited<ReturnType<MiyuRepository["reserveTasteReport"]>>;
  try {
    reserved = await repo.reserveTasteReport({ userId: req.userId, assessmentId: req.assessmentId });
  } catch (e) {
    if (missingTable(e)) return fail("not-ready");
    throw e;
  }
  if (reserved.state === "busy") return fail("busy");
  if (reserved.state === "ready") {
    if (reserved.record.assessmentId !== req.assessmentId) return fail("used-elsewhere");
    const report = readTasteReport(reserved.record.content);
    return report ? { ok: true, report, alreadyHad: true } : fail("failed");
  }

  const release = () => repo.releaseTasteReport({ userId: req.userId, assessmentId: req.assessmentId }).catch(() => {});
  // 사용 기록은 쌓는 동안 글쓰기를 막지 않는다 (기록 실패가 글을 막지 않게). 글 내용은 담지 않는다
  const pending: Promise<void>[] = [];
  const ctx: GenerateContext = {
    signal: AbortSignal.timeout(writer.totalTimeoutMs),
    onUsage: (u) =>
      pending.push(
        repo
          .addAiUsage({ reportId: null, provider: u.provider, model: u.model, promptVersion: u.promptVersion, inputTokens: u.inputTokens, outputTokens: u.outputTokens, estCostKrw: deps.capacity ? estimateCostKrw(deps.capacity, u) : null, latencyMs: u.latencyMs, outcome: u.outcome, errorCode: u.errorCode })
          .catch(() => {}),
      ),
  };
  try {
    const report = await writer.write(loaded.input, ctx);
    try {
      await repo.saveTasteReport({ userId: req.userId, assessmentId: req.assessmentId, content: report, generator: `${writer.provider}:${writer.model}`, generatorVersion: writer.promptVersion });
    } catch (e) {
      await release();
      throw e;
    }
    return { ok: true, report, alreadyHad: false };
  } catch (e) {
    if (!(e instanceof TasteWriteError)) throw e;
    await release();
    return fail("failed");
  } finally {
    await Promise.allSettled(pending);
  }
}
