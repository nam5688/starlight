// 자유 질문(채팅에서 직접 적는 질문) 처리 — 소유자 확인 → 입력 정리 → 방마다 무료 질문 수 · 결제한 질문 · 예산 확인 → AI 답(검사 통과분만) → 사용 기록.
// 질문 내용은 어떤 기록에도 남기지 않는다: 횟수 표(chat_questions)에는 누가 · 언제 · 어느 방만, AI 사용 기록(ai_usage)에는 토큰 수만 남는다.
// 질문과 답은 대화 저장(talk-service)에 담기며, 그건 회원이 방마다 지울 수 있고 탈퇴하면 함께 삭제된다.
// 이미 결제한 고객의 리포트는 이 한도와 무관하다 — 한도는 자유 질문에만 건다.
import type { GenerateContext } from "../report/generator.ts";
import { ChatAnswerError, type ChatAnswerer } from "../report/chat/answer.ts";
import { CHAT_LIMITS } from "../report/chat/plan.ts";
import { CARE_NOTE, CRISIS_REPLY, cleanQuestion, crisisLevel } from "../report/chat/question.ts";
import { shorten, SUMMARY_LIMITS } from "../report/chat/summary.ts";
import type { ChatAsk, ChatContext, ChatExchange } from "../report/chat/types.ts";
import { formatKrw, MIYU_CASH, QUESTION_PACK_PRICE_KRW, QUESTION_PACK_SIZE, REPORT_TIER_NAMES } from "../config/product.ts";
import { roomPolicy } from "../report/chat/quota.ts";
import { QUESTION_MAX } from "../report/reading/talk.ts";
import type { RoomAction } from "../report/reading/talk-room.ts";
import { estimateCostKrw, seoulDayStart, type CapacityConfig } from "./capacity-service.ts";
import type { ChatReservation, MiyuRepository } from "./ports.ts";
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
  | "need-payment"
  | "pay-unavailable"
  | "pay-closed"
  | "pay-policy"
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
  "free-used": "무료 질문을 모두 썼어요.",
  "need-payment": `유료 질문은 질문 ${QUESTION_PACK_SIZE}개에 ${formatKrw(QUESTION_PACK_PRICE_KRW)}이에요. 결제하면 이어서 질문할 수 있어요.`,
  "pay-unavailable": "유료 질문 결제를 지금은 열 수 없어요. 잠시 뒤에 다시 시도해 주세요.",
  "pay-closed": "지금은 새 결제를 받지 않아요. 잠시 뒤에 다시 시도해 주세요.",
  "pay-policy": "유료 질문은 아직 준비 중이에요. 환불 · 이용 기준을 정한 뒤에 열 수 있어요.",
  "room-locked": `이 방은 ${REPORT_TIER_NAMES.deep}로 열려요.`,
  "deep-only": `자세한 이야기는 ${REPORT_TIER_NAMES.deep}에서 이어져요.`,
  budget: "지금은 질문이 많아 잠시 쉬고 있어요. 조금 뒤에 다시 물어봐 주세요.",
  empty: "궁금한 것을 한두 문장으로 적어 주세요.",
  "too-long": `질문은 ${QUESTION_MAX.paid.toLocaleString("ko-KR")}자 이하로 적어 주세요.`,
  "too-long-free": `무료 질문은 ${QUESTION_MAX.free.toLocaleString("ko-KR")}자까지예요. 줄여서 적어 주세요.`,
  "no-material": "이 방의 무료 풀이에는 아직 이야기 나눌 내용이 없어요.",
  "not-found": "이 대화를 찾지 못했어요. 화면을 새로 열어 주세요.",
  "not-ready": "이야기를 이어 가는 건 아직 준비 중이에요.",
  failed: "이번에는 답을 만들지 못했어요. 잠시 뒤에 다시 물어봐 주세요.",
};

export type AskResult =
  /** question: 개인정보를 가린 질문 글 — 대화에는 이 글을 저장한다 · remaining: 이 방에 남은 무료 질문 수 · cash: 결제한 질문으로 물었다면 지금 장부 잔액(0이면 다 썼다) */
  | { ok: true; kind: "answer"; question: string; paragraphs: string[]; remaining: number; cash?: { balance: number } }
  /** 마음이 많이 힘든 글 — 풀이로 답하지 않는 고정 안내. 저장하지 않고 횟수에도 세지 않는다 */
  | { ok: true; kind: "safety"; paragraphs: string[] }
  | { ok: false; reason: AskReason; message: string };

const fail = (reason: AskReason): AskResult => ({ ok: false, reason, message: ASK_MESSAGES[reason] });
const missingTable = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";
/** 질문 한 번을 가리키는 참조번호 — 결제한 질문의 사용과 되돌림이 같은 번호를 쓴다 */
const defaultRef = () => `q-${globalThis.crypto.randomUUID()}`;

export type AskDeps = {
  repo: MiyuRepository;
  /** 연결된 AI가 없으면 null (자유 질문은 닫힘) */
  answerer: ChatAnswerer | null;
  now: () => Date;
  config: ChatServiceConfig;
  capacity?: CapacityConfig;
  /** 테스트용: 결제한 질문 사용 참조번호를 정한다 */
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
/** 질문 없이 질문 3개 묶음을 사려는 요청 — 입력칸이 구매 버튼으로 바뀌는 화면이 보낸다(운영자 2026-10-16) */
export type PurchaseInput = Omit<AskInput, "question">;

/** 이 방에서 앞서 나눈 질문과 답 중 최근 것 — 이어지는 질문이 이전 말을 이어받게 한다 */
export function recentExchanges(actions: RoomAction[]): ChatExchange[] {
  const { count, chars } = CHAT_LIMITS.recent;
  return actions
    .flatMap((a) => (a.t === "free" ? [{ q: a.q.slice(0, chars), a: a.a.join(" ").slice(0, chars) }] : []))
    .slice(-count);
}

/** 질문을 받을 수 있는지 먼저 확인한 결과 — 답하기(askFreeQuestion)와 질문 결제 시작(startQuestionPayment)이 같은 규칙을 쓴다 */
export type QuestionGate =
  | {
      ok: true;
      /** 개인정보를 가린 질문 글과 위기 표현 구분 */
      q: { text: string; length: number };
      level: ReturnType<typeof crisisLevel>;
      loaded: NonNullable<Awaited<ReturnType<AskDeps["loadAsk"]>>>;
      roomKey: string;
      /** 이 방의 무료 질문이 남아 있다(결제 없이 묻는다) */
      inQuota: boolean;
      policy: ReturnType<typeof roomPolicy>;
      used: number;
    }
  | { ok: false; result: AskResult };

/** 하루 AI 예산에 닿았는가 — 닿으면 새 질문(과 새 구매)만 멈춘다 */
async function overBudget(deps: AskDeps): Promise<boolean> {
  const budget = deps.capacity?.dailyBudgetKrw ?? 0;
  return budget > 0 && (await deps.repo.sumAiCostSince(seoulDayStart(deps.now()))) >= budget;
}

/** 방 이름 모양 → 본인 결과인지 */
async function gateOwner(deps: AskDeps, input: PurchaseInput): Promise<AskResult | null> {
  if (!TALK_ROOM_KEY.test(input.roomKey)) return fail("not-found");
  if (!(await owns(deps.repo, input.userId, input.assessmentId))) return fail("not-found");
  return null;
}

/** 방을 열 수 있는지 확인한 결과 — 질문 확인(gateQuestion)과 구매 확인(gatePurchase)이 같이 쓴다 */
type RoomGate = { ok: true; loaded: NonNullable<Awaited<ReturnType<AskDeps["loadAsk"]>>>; roomKey: string; policy: ReturnType<typeof roomPolicy> } | { ok: false; result: AskResult };

/** AI 연결 → 자료 → 이 방을 열 수 있는가(잠긴 방 · 심층 리포트 전용 · 자료 없음) */
async function gateRoom(deps: AskDeps): Promise<RoomGate> {
  const no = (result: AskResult) => ({ ok: false as const, result });
  if (!deps.answerer) return no(fail("closed"));
  const loaded = await deps.loadAsk();
  if (!loaded) return no(fail("not-ready"));
  const free = loaded.tier === "free";
  // 방 이름은 브라우저가 보낸 값이 아니라 서버가 정한 값(loaded.roomKey)으로 센다 — 방마다 무료 질문 수를 우회하지 못하게
  const roomKey = loaded.roomKey;
  const policy = roomPolicy(loaded.tier, loaded.room, deps.config.extraQuestions);
  if (!policy.open) return no(fail("room-locked"));
  if (policy.needsDeep && policy.freeQuestions === 0) return no(fail("deep-only"));
  if (free && loaded.noMaterial) return no(fail("no-material"));
  return { ok: true, loaded, roomKey, policy };
}

/**
 * 소유자 → 입력 정리 → 위기 표현 → 방 · 자료 확인 → 무료 질문 수 → 글자 수 → 이어 갈 수 있는 방인가 → 하루 예산.
 * 힘든 글(분명한 위기 표현)은 여기서 안내로 끝난다 — 결제도 AI 호출도 하지 않는다.
 */
/**
 * 소유자 → 입력 정리 → 위기 표현 → 방 · 자료 확인 → 무료 질문 수 → 글자 수 → 이어 갈 수 있는 방인가 → 하루 예산.
 * 힘든 글(분명한 위기 표현)은 여기서 안내로 끝난다 — 결제도 AI 호출도 하지 않는다.
 */
export async function gateQuestion(deps: AskDeps, input: AskInput): Promise<QuestionGate> {
  const { repo } = deps;
  const no = (result: AskResult): QuestionGate => ({ ok: false, result });
  const notMine = await gateOwner(deps, input);
  if (notMine) return no(notMine);

  const q = cleanQuestion(input.question);
  if (!q.ok) return no(fail(q.reason));
  // 스스로를 해치겠다는 분명한 표현은 운세 풀이로 답하지 않는다 — AI를 부르지 않고 횟수에도 세지 않는다.
  // 힘든 마음의 표현(soft)이나 일반적인 슬픔 · 연애 고민은 막지 않고 답한다(soft는 답 뒤에 안내 한 문단을 붙인다)
  const level = crisisLevel(q.text);
  if (level === "hard") return no({ ok: true, kind: "safety", paragraphs: CRISIS_REPLY });

  const room = await gateRoom(deps);
  if (!room.ok) return no(room.result);
  const { loaded, roomKey, policy } = room;
  const free = loaded.tier === "free";

  let used: number;
  try {
    used = await repo.countChatQuestionsInRoom(input.userId, roomKey);
  } catch (e) {
    // 12번 DB 변경 전 — 횟수를 셀 수 없으면 열지 않는다
    if (missingTable(e)) return no(fail("not-ready"));
    throw e;
  }
  const inQuota = used < policy.freeQuestions;

  // 글자 수 한도: 무료 리포트의 무료 질문은 300자, 그 밖(심층 리포트의 질문 · 결제한 질문)은 500자 (위기 표현 확인 뒤에 센다 — 힘든 글은 길어도 안내가 먼저다)
  const max = inQuota && free ? QUESTION_MAX.free : QUESTION_MAX.paid;
  if (q.length > max) return no(fail(max === QUESTION_MAX.free ? "too-long-free" : "too-long"));

  if (!inQuota && !policy.cashAllowed) return no(fail(free ? "free-used" : "limit"));

  if (await overBudget(deps)) return no(fail("budget"));

  return { ok: true, q: { text: q.text, length: q.length }, level, loaded, roomKey, inQuota, policy, used };
}

/** 질문 없이 질문 3개 묶음을 살 수 있는지 먼저 확인한 결과 */
export type PurchaseGate = RoomGate;

/**
 * 질문 3개 구매(질문 없이) 확인 — 소유자 · AI 연결 · 이 방을 열 수 있는가 · 이 방이 결제한 질문으로 이어 갈 수 있는가 · 하루 예산.
 * 무료 질문이 남아 있어도 살 수 있다(입력창 위의 작은 구매 버튼) — 결제한 질문은 무료 질문을 다 쓴 뒤에 쓰인다. 질문 글이 없으므로 글자 수 · 위기 표현 확인은 하지 않는다(질문을 보낼 때 그 확인을 한다).
 */
export async function gatePurchase(deps: AskDeps, input: PurchaseInput): Promise<PurchaseGate> {
  const notMine = await gateOwner(deps, input);
  if (notMine) return { ok: false, result: notMine };
  const room = await gateRoom(deps);
  if (!room.ok) return room;
  if (!room.policy.cashAllowed) return { ok: false, result: fail("pay-unavailable") };
  if (await overBudget(deps)) return { ok: false, result: fail("budget") };
  return room;
}

/**
 * 같은 회원이 같은 방에 질문을 동시에 보내면(두 번 누름 · 탭 두 개) 한 서버 안에서는 순서대로 하나씩 처리한다 — 무료 질문 수를 세는 일(남은 수 확인 → 답 → 횟수 더하기)이 겹치면 둘 다 "아직 남았다"고 보고 무료 질문을 넘겨 줄 수 있기 때문이다.
 * 이 줄 세우기는 한 서버 안에서만 막는다. **서버가 여러 대로 나뉘어 동시에 도착한 요청은 DB가 막는다** — 무료 질문 자리는 DB 변경 16번의 예약(`reserve_chat_question`)으로 한 번에 확인 · 예약하므로
 * 같은 회원 · 같은 방은 서버가 몇 대든 무료 질문 수를 넘지 않는다(16번 전에는 예전 방식이라 최대 1개 더 나갈 수 있다 — docs/question-payment.md).
 * 결제해 둔 질문은 이것과 상관없이 DB가 한 번에 하나씩만 차감한다(`spend_cash`).
 */
const roomQueues = new Map<string, Promise<unknown>>();
async function inRoomQueue<T>(key: string, job: () => Promise<T>): Promise<T> {
  const before = roomQueues.get(key) ?? Promise.resolve();
  const mine = before.then(job, job);
  const tail = mine.catch(() => undefined);
  roomQueues.set(key, tail);
  try {
    return await mine;
  } finally {
    if (roomQueues.get(key) === tail) roomQueues.delete(key);
  }
}

export function askFreeQuestion(deps: AskDeps, input: AskInput): Promise<AskResult> {
  return inRoomQueue(`${input.userId}:${String(input.roomKey)}`, () => askFreeQuestionNow(deps, input));
}

/** 한 서버 안의 줄 세우기를 거치지 않고 처리한다 — 서버가 여러 대로 나뉘어 같은 방에 동시에 도착한 요청을 시험에서 흉내 낼 때만 쓴다 */
export const askFreeQuestionUnqueued = (deps: AskDeps, input: AskInput): Promise<AskResult> => askFreeQuestionNow(deps, input);

async function askFreeQuestionNow(deps: AskDeps, input: AskInput): Promise<AskResult> {
  const { repo } = deps;
  const gate = await gateQuestion(deps, input);
  if (!gate.ok) return gate.result;
  const { q, level, loaded, roomKey, inQuota, policy, used } = gate;
  const answerer = deps.answerer;
  if (!answerer) return fail("closed");
  const free = loaded.tier === "free";

  // 무료 질문 자리는 DB에서 한 번에 확인하고 예약한다(여러 서버가 동시에 와도 무료 질문 수를 넘지 않는다). 답을 받으면 확정하고, 받지 못하면 예약을 푼다.
  let reservation: ChatReservation | null = null;
  let useFree = inQuota;
  if (inQuota) {
    try {
      reservation = await repo.reserveChatQuestion({ userId: input.userId, assessmentId: input.assessmentId, roomKey, max: policy.freeQuestions });
    } catch (e) {
      // 12번 DB 변경 전 — 횟수를 셀 수 없으면 열지 않는다
      if (missingTable(e)) return fail("not-ready");
      throw e;
    }
    if (reservation === null) {
      // 다른 요청이 마지막 무료 질문 자리를 먼저 가져갔다 — 결제한 질문으로 이어 갈 수 있을 때만 이어 간다(질문 글은 이미 500자 안이다)
      if (!policy.cashAllowed) return fail(free ? "free-used" : "limit");
      useFree = false;
    }
  }
  const releaseFree = async () => {
    if (reservation) await repo.releaseChatQuestion(reservation, { userId: input.userId }).catch(() => {});
  };

  // 무료 질문을 다 썼으면 결제한 질문으로 이어 간다 — 질문 한 번에 MIYU_CASH.perQuestion 단위. 사용은 AI를 부르기 전에 한 번에(원자적으로) 하고,
  // 답을 받지 못하면 같은 참조번호로 되돌린다 (보이지 않은 답에 결제한 질문을 쓰게 하지 않는다). 결제한 질문이 없으면 결제부터 해야 한다(need-payment)
  let cashRef: string | null = null;
  let balance: number | null = null;
  if (!useFree) {
    const ref = (deps.newRef ?? defaultRef)();
    try {
      balance = await repo.spendCash({ userId: input.userId, amount: MIYU_CASH.perQuestion, ref });
    } catch (e) {
      // 13번 DB 변경 전 — 결제한 질문을 쓸 수 없으면 무료 질문이 끝난 것으로만 안내한다
      if (missingTable(e)) return fail(free ? "free-used" : "limit");
      throw e;
    }
    if (balance === null) return fail("need-payment");
    cashRef = ref;
  }
  const restoreCash = async () => {
    if (!cashRef) return;
    // 되돌리기에 실패해도 오류를 감추지 않는다 — 호출한 쪽이 운영 기록에 남긴다 (결제한 질문이 사라지지 않게 check-cash.sql이 이상 징후를 찾는다)
    await repo.restoreCashSpend({ userId: input.userId, ref: cashRef });
  };

  // 이 대화에서 앞서 나눈 질문 · 답(recent)과, 이 방에서 이미 끝낸 이전 대화의 요약(memory) — 이번 대화에 아직 있는 것은 memory에서 뺀다(같은 말을 두 번 보내지 않는다)
  let recent: ChatExchange[];
  let memory: Awaited<ReturnType<typeof memoryFor>>;
  try {
    recent = recentExchanges(await loadTalkRoom(repo, { userId: input.userId, assessmentId: input.assessmentId, roomKey }));
    const seen = new Set(recent.map((r) => shorten(r.q, SUMMARY_LIMITS.memory.questionChars)));
    memory = (await memoryFor(repo, { userId: input.userId, assessmentId: input.assessmentId, room: loaded.room }, deps.now())).filter((m) => !seen.has(m.q));
  } catch (e) {
    // 대화를 불러오다 실패하면 방금 잡은 무료 질문 자리와 결제한 질문을 돌려 놓는다 (답을 받지 못한 질문은 쓰이지 않는다)
    await restoreCash().catch(() => {});
    await releaseFree();
    throw e;
  }
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
    signal: AbortSignal.timeout(answerer.totalTimeoutMs ?? CHAT_LIMITS.totalTimeoutMs),
    onUsage: (u) =>
      pending.push(
        repo
          .addAiUsage({ reportId: null, provider: u.provider, model: u.model, promptVersion: u.promptVersion, inputTokens: u.inputTokens, outputTokens: u.outputTokens, estCostKrw: deps.capacity ? estimateCostKrw(deps.capacity, u) : null, latencyMs: u.latencyMs, outcome: u.outcome, errorCode: u.errorCode })
          .catch(() => {}),
      ),
  };
  // 답을 받은 질문만 횟수에 센다 — 무료 질문도 유료 질문도 답을 받지 못했다면(호출 실패 · 검사에 걸림 모두) 차감하지 않는다(운영자 결정 2026-10-15).
  // 검사에 걸린 호출의 비용은 승인 가드 · 하루 AI 예산이 막는다(검사에 걸리도록 질문을 꾸며 비용을 쓰게 하는 길이 열려 있으므로 하루 예산을 정해 둔다).
  const record = { userId: input.userId, assessmentId: input.assessmentId, roomKey };
  const count = () => (reservation ? repo.confirmChatQuestion(reservation, record) : repo.addChatQuestion(record)).catch(() => {});
  try {
    const answer = await answerer.answer(ask, ctx);
    await count();
    const paragraphs = level === "soft" ? [...answer.paragraphs, CARE_NOTE] : answer.paragraphs;
    return {
      ok: true,
      kind: "answer",
      question: q.text,
      paragraphs,
      remaining: useFree ? Math.max(0, policy.freeQuestions - used - 1) : 0,
      ...(balance !== null ? { cash: { balance } } : {}),
    };
  } catch (e) {
    await restoreCash();
    await releaseFree();
    if (!(e instanceof ChatAnswerError)) throw e;
    return fail("failed");
  } finally {
    await Promise.allSettled(pending);
  }
}
