// 자유 질문(채팅에서 직접 적는 질문) 처리 — 소유자 확인 → 입력 정리 → 방마다 무료 질문 수 · 미유캐시 · 예산 확인 → AI 답(검사 통과분만) → 사용 기록.
// 질문 내용은 어떤 기록에도 남기지 않는다: 횟수 표(chat_questions)에는 누가 · 언제 · 어느 방만, AI 사용 기록(ai_usage)에는 토큰 수만 남는다.
// 질문과 답은 대화 저장(talk-service)에 담기며, 그건 회원이 방마다 지울 수 있고 탈퇴하면 함께 삭제된다.
// 이미 결제한 고객의 리포트는 이 한도와 무관하다 — 한도는 자유 질문에만 건다.
import type { GenerateContext } from "../report/generator.ts";
import { ChatAnswerError, type ChatAnswerer } from "../report/chat/answer.ts";
import { CHAT_LIMITS } from "../report/chat/plan.ts";
import { CARE_NOTE, CRISIS_REPLY, cleanQuestion, crisisLevel } from "../report/chat/question.ts";
import { shorten, SUMMARY_LIMITS } from "../report/chat/summary.ts";
import type { ChatAsk, ChatContext, ChatExchange } from "../report/chat/types.ts";
import { MIYU_CASH, REPORT_TIER_NAMES } from "../config/product.ts";
import { roomPolicy } from "../report/chat/quota.ts";
import { QUESTION_MAX } from "../report/reading/talk.ts";
import type { RoomAction } from "../report/reading/talk-room.ts";
import { estimateCostKrw, seoulDayStart, type CapacityConfig } from "./capacity-service.ts";
import type { MiyuRepository } from "./ports.ts";
import { memoryFor } from "./summary-service.ts";
import { loadTalkRoom, owns, TALK_ROOM_KEY } from "./talk-service.ts";

export type ChatServiceConfig = {
  /** 시험 중에만: 열린 방마다 무료 질문을 이만큼 더 준다 (기본 0 — 방마다 무료 질문 수는 lib/config/product.ts의 CHAT_ROOMS) */
  extraQuestions: number;
};

export const DEFAULT_EXTRA_QUESTIONS = 0;
/** "처음부터 세기" 위한 아주 오래된 시각 */
export const COUNT_ALL_SINCE = "1970-01-01T00:00:00.000Z";

export type AskReason =
  | "closed"
  | "limit"
  | "free-used"
  | "no-cash"
  | "room-locked"
  | "deep-only"
  | "no-material"
  | "budget"
  | "empty"
  | "too-long"
  | "too-long-free"
  | "not-found"
  | "not-ready"
  | "failed";

export const ASK_MESSAGES: Record<AskReason, string> = {
  closed: "자유 질문은 아직 준비 중이에요.",
  limit: "이 방에서 물어볼 수 있는 질문을 모두 썼어요.",
  "free-used": "무료 질문을 모두 썼어요. 유료 질문은 글자 수 제한이 1,000자로 늘어나요.",
  "no-cash": "미유캐시가 부족해요. 충전하면 이어서 질문할 수 있어요.",
  "room-locked": `이 방은 ${REPORT_TIER_NAMES.deep}로 열려요.`,
  "deep-only": `자세한 이야기는 ${REPORT_TIER_NAMES.deep}에서 이어져요.`,
  budget: "지금은 질문이 많아 잠시 쉬고 있어요. 조금 뒤에 다시 물어봐 주세요.",
  empty: "궁금한 것을 한두 문장으로 적어 주세요.",
  "too-long": `질문은 ${QUESTION_MAX.paid.toLocaleString("ko-KR")}자 이하로 적어 주세요.`,
  "too-long-free": `무료 질문은 ${QUESTION_MAX.free.toLocaleString("ko-KR")}자까지예요. 줄여서 적어 주세요. 유료 질문은 ${QUESTION_MAX.paid.toLocaleString("ko-KR")}자까지 쓸 수 있어요.`,
  "no-material": "이 방의 무료 풀이에는 아직 이야기 나눌 내용이 없어요.",
  "not-found": "이 대화를 찾지 못했어요. 화면을 새로 열어 주세요.",
  "not-ready": "이야기를 이어 가는 건 아직 준비 중이에요.",
  failed: "이번에는 답을 만들지 못했어요. 잠시 뒤에 다시 물어봐 주세요.",
};

export type AskResult =
  /** question: 개인정보를 가린 질문 글 — 대화에는 이 글을 저장한다 · remaining: 이 방에 남은 무료 질문 수 · cash: 미유캐시로 물었다면 지금 잔액 */
  | { ok: true; kind: "answer"; question: string; paragraphs: string[]; remaining: number; cash?: { balance: number } }
  /** 마음이 많이 힘든 글 — 풀이로 답하지 않는 고정 안내. 저장하지 않고 횟수에도 세지 않는다 */
  | { ok: true; kind: "safety"; paragraphs: string[] }
  | { ok: false; reason: AskReason; message: string };

const fail = (reason: AskReason): AskResult => ({ ok: false, reason, message: ASK_MESSAGES[reason] });
const missingTable = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";
/** 질문 한 번을 가리키는 참조번호 — 캐시 차감과 되돌림이 같은 번호를 쓴다 */
const defaultRef = () => `q-${globalThis.crypto.randomUUID()}`;

export type AskDeps = {
  repo: MiyuRepository;
  /** 연결된 AI가 없으면 null (자유 질문은 닫힘) */
  answerer: ChatAnswerer | null;
  now: () => Date;
  config: ChatServiceConfig;
  capacity?: CapacityConfig;
  /** 테스트용: 캐시 차감 참조번호를 정한다 */
  newRef?: () => string;
  /**
   * 이 질문에 쓸 자료와 기준 날짜. tier는 구매해 준비된 리포트가 있으면 paid(심층 리포트), 없으면 free(무료 리포트).
   * room · roomKey는 서버가 정한 값이다(오늘의 운세 방은 날짜별 방). 분석 결과를 찾지 못하면 null.
   */
  loadAsk: () => Promise<{
    context: ChatContext;
    referenceDate: string;
    tier: "paid" | "free";
    room: string;
    roomKey: string;
    /** 무료 리포트에서 이 방의 풀이에 내 자료로 읽은 내용이 없다(무료 질문을 열지 않는다) */
    noMaterial?: boolean;
  } | null>;
};

export type AskInput = { userId: string; assessmentId: string; roomKey: string; question: unknown };

/** 이 방에서 앞서 나눈 질문과 답 중 최근 것 — 이어지는 질문이 이전 말을 이어받게 한다 */
export function recentExchanges(actions: RoomAction[]): ChatExchange[] {
  const { count, chars } = CHAT_LIMITS.recent;
  return actions
    .flatMap((a) => (a.t === "free" ? [{ q: a.q.slice(0, chars), a: a.a.join(" ").slice(0, chars) }] : []))
    .slice(-count);
}

export async function askFreeQuestion(deps: AskDeps, input: AskInput): Promise<AskResult> {
  const { repo } = deps;
  if (!TALK_ROOM_KEY.test(input.roomKey)) return fail("not-found");
  if (!(await owns(repo, input.userId, input.assessmentId))) return fail("not-found");

  const q = cleanQuestion(input.question);
  if (!q.ok) return fail(q.reason);
  // 스스로를 해치겠다는 분명한 표현은 운세 풀이로 답하지 않는다 — AI를 부르지 않고 횟수에도 세지 않는다.
  // 힘든 마음의 표현(soft)이나 일반적인 슬픔 · 연애 고민은 막지 않고 답한다(soft는 답 뒤에 안내 한 문단을 붙인다)
  const level = crisisLevel(q.text);
  if (level === "hard") return { ok: true, kind: "safety", paragraphs: CRISIS_REPLY };

  if (!deps.answerer) return fail("closed");
  const loaded = await deps.loadAsk();
  if (!loaded) return fail("not-ready");
  const free = loaded.tier === "free";
  // 방 이름은 브라우저가 보낸 값이 아니라 서버가 정한 값(loaded.roomKey)으로 센다 — 방마다 무료 질문 수를 우회하지 못하게
  const roomKey = loaded.roomKey;
  const policy = roomPolicy(loaded.tier, loaded.room, deps.config.extraQuestions);
  if (!policy.open) return fail("room-locked");
  if (policy.needsDeep && policy.freeQuestions === 0) return fail("deep-only");
  if (free && loaded.noMaterial) return fail("no-material");

  let used: number;
  try {
    used = await repo.countChatQuestionsInRoom(input.userId, roomKey);
  } catch (e) {
    // 12번 DB 변경 전 — 횟수를 셀 수 없으면 열지 않는다
    if (missingTable(e)) return fail("not-ready");
    throw e;
  }
  const inQuota = used < policy.freeQuestions;

  // 글자 수 한도: 무료 리포트의 무료 질문은 500자, 그 밖(심층 리포트의 무료 질문 · 미유캐시 질문)은 1,000자 (위기 표현 확인 뒤에 센다 — 힘든 글은 길어도 안내가 먼저다)
  const max = inQuota && free ? QUESTION_MAX.free : QUESTION_MAX.paid;
  if (q.length > max) return fail(max === QUESTION_MAX.free ? "too-long-free" : "too-long");

  if (!inQuota && !policy.cashAllowed) return fail(free ? "free-used" : "limit");

  const dayStart = seoulDayStart(deps.now());
  const budget = deps.capacity?.dailyBudgetKrw ?? 0;
  if (budget > 0 && (await repo.sumAiCostSince(dayStart)) >= budget) return fail("budget");

  // 무료 질문을 다 썼으면 미유캐시로 이어 간다 — 질문 한 번에 MIYU_CASH.perQuestion개. 차감은 AI를 부르기 전에 한 번에(원자적으로) 하고,
  // 답을 받지 못하면 같은 참조번호로 되돌린다 (보이지 않은 답에 캐시를 쓰게 하지 않는다)
  let cashRef: string | null = null;
  let balance: number | null = null;
  if (!inQuota) {
    const ref = (deps.newRef ?? defaultRef)();
    try {
      balance = await repo.spendCash({ userId: input.userId, amount: MIYU_CASH.perQuestion, ref });
    } catch (e) {
      // 13번 DB 변경 전 — 캐시를 쓸 수 없으면 무료 질문이 끝난 것으로만 안내한다
      if (missingTable(e)) return fail(free ? "free-used" : "limit");
      throw e;
    }
    if (balance === null) {
      // 캐시가 아예 없으면(처음이거나 다 썼으면) "무료 질문을 모두 썼어요", 조금 남았지만 한 번에 모자라면 "미유캐시가 부족해요"
      const held = await repo.getCashBalance(input.userId).catch(() => 0);
      return fail(held > 0 ? "no-cash" : free ? "free-used" : "limit");
    }
    cashRef = ref;
  }
  const restoreCash = async () => {
    if (!cashRef) return;
    // 되돌리기에 실패해도 오류를 감추지 않는다 — 호출한 쪽이 운영 기록에 남긴다 (캐시가 사라지지 않게 check-cash.sql이 이상 징후를 찾는다)
    await repo.restoreCashSpend({ userId: input.userId, ref: cashRef });
  };

  // 이 대화에서 앞서 나눈 질문 · 답(recent)과, 이 방에서 이미 끝낸 이전 대화의 요약(memory) — 이번 대화에 아직 있는 것은 memory에서 뺀다(같은 말을 두 번 보내지 않는다)
  const recent = recentExchanges(await loadTalkRoom(repo, { userId: input.userId, assessmentId: input.assessmentId, roomKey }));
  const seen = new Set(recent.map((r) => shorten(r.q, SUMMARY_LIMITS.memory.questionChars)));
  const memory = (await memoryFor(repo, { userId: input.userId, assessmentId: input.assessmentId, room: loaded.room }, deps.now())).filter((m) => !seen.has(m.q));
  const ask: ChatAsk = {
    context: loaded.context,
    question: q.text,
    referenceDate: loaded.referenceDate,
    recent,
    ...(memory.length > 0 ? { memory } : {}),
    ...(level === "soft" ? { care: true } : {}),
  };

  // 사용 기록은 쌓는 동안 답을 막지 않는다 (기록 실패가 답을 막지 않게). 질문 · 답 내용은 담지 않는다
  const pending: Promise<void>[] = [];
  const ctx: GenerateContext = {
    signal: AbortSignal.timeout(deps.answerer.totalTimeoutMs ?? CHAT_LIMITS.totalTimeoutMs),
    onUsage: (u) =>
      pending.push(
        repo
          .addAiUsage({ reportId: null, provider: u.provider, model: u.model, promptVersion: u.promptVersion, inputTokens: u.inputTokens, outputTokens: u.outputTokens, estCostKrw: deps.capacity ? estimateCostKrw(deps.capacity, u) : null, latencyMs: u.latencyMs, outcome: u.outcome, errorCode: u.errorCode })
          .catch(() => {}),
      ),
  };
  // 답을 받은 질문만 횟수에 센다 — 무료 질문도 미유캐시 질문도 답을 받지 못했다면(호출 실패 · 검사에 걸림 모두) 차감하지 않는다(운영자 결정 2026-10-15).
  // 검사에 걸린 호출의 비용은 승인 가드 · 하루 AI 예산이 막는다(검사에 걸리도록 질문을 꾸며 비용을 쓰게 하는 길이 열려 있으므로 하루 예산을 정해 둔다).
  const count = () => repo.addChatQuestion({ userId: input.userId, assessmentId: input.assessmentId, roomKey }).catch(() => {});
  try {
    const answer = await deps.answerer.answer(ask, ctx);
    await count();
    const paragraphs = level === "soft" ? [...answer.paragraphs, CARE_NOTE] : answer.paragraphs;
    return {
      ok: true,
      kind: "answer",
      question: q.text,
      paragraphs,
      remaining: inQuota ? Math.max(0, policy.freeQuestions - used - 1) : 0,
      ...(balance !== null ? { cash: { balance } } : {}),
    };
  } catch (e) {
    await restoreCash();
    if (!(e instanceof ChatAnswerError)) throw e;
    return fail("failed");
  } finally {
    await Promise.allSettled(pending);
  }
}
