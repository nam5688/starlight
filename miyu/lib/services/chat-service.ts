// 자유 질문(채팅에서 직접 적는 질문) 처리 — 소유자 확인 → 입력 정리 → 하루 횟수 · 예산 확인 → AI 답(검사 통과분만) → 사용 기록.
// 질문 내용은 어떤 기록에도 남기지 않는다: 횟수 표(chat_questions)에는 누가 · 언제 · 어느 방만, AI 사용 기록(ai_usage)에는 토큰 수만 남는다.
// 질문과 답은 대화 저장(talk-service)에 담기며, 그건 회원이 방마다 지울 수 있고 탈퇴하면 함께 삭제된다.
// 이미 결제한 고객의 리포트는 이 한도와 무관하다 — 한도는 자유 질문에만 건다.
import type { GenerateContext } from "../report/generator.ts";
import { ChatAnswerError, type ChatAnswerer } from "../report/chat/answer.ts";
import { CHAT_LIMITS } from "../report/chat/plan.ts";
import { CARE_NOTE, CRISIS_REPLY, cleanQuestion, crisisLevel } from "../report/chat/question.ts";
import type { ChatAsk, ChatContext, ChatExchange } from "../report/chat/types.ts";
import { QUESTION_MAX } from "../report/reading/talk.ts";
import type { RoomAction } from "../report/reading/talk-room.ts";
import { estimateCostKrw, seoulDayStart, type CapacityConfig } from "./capacity-service.ts";
import type { MiyuRepository } from "./ports.ts";
import { loadTalkRoom, owns, TALK_ROOM_KEY } from "./talk-service.ts";

export type ChatServiceConfig = {
  /** 리포트를 받은 회원이 하루(한국 날짜)에 보낼 수 있는 자유 질문 수. 0이면 닫힘 */
  dailyLimit: number;
  /** 무료 맛보기(리포트를 받기 전)의 로그인한 회원이 평생 보낼 수 있는 자유 질문 수 — 기본 2번. 0이면 무료 질문은 닫힘 */
  freeLimit: number;
};

export const DEFAULT_DAILY_LIMIT = 10;
/** 무료 맛보기의 로그인한 회원이 평생 보낼 수 있는 질문 수 — 운영자 결정(2026-10-15): 2번까지 무료, 3번째부터는 리포트(유료) */
export const DEFAULT_FREE_LIMIT = 2;
/** "처음부터 세기" 위한 아주 오래된 시각 — 무료 질문은 평생 횟수라 날짜로 나누지 않는다 */
export const COUNT_ALL_SINCE = "1970-01-01T00:00:00.000Z";

export type AskReason = "closed" | "limit" | "free-used" | "no-material" | "budget" | "empty" | "too-long" | "too-long-free" | "not-found" | "not-ready" | "failed";

export const ASK_MESSAGES: Record<AskReason, string> = {
  closed: "자유 질문은 아직 준비 중이에요.",
  limit: "오늘 물어볼 수 있는 질문을 모두 썼어요. 내일 다시 이어서 물어봐 주세요.",
  "free-used": "무료 질문을 모두 썼어요. 이어서 묻고 깊은 풀이를 보려면 리포트에서 이어져요.",
  budget: "지금은 질문이 많아 잠시 쉬고 있어요. 조금 뒤에 다시 물어봐 주세요.",
  empty: "궁금한 것을 한두 문장으로 적어 주세요.",
  "too-long": `질문은 ${QUESTION_MAX.paid.toLocaleString("ko-KR")}자 이하로 적어 주세요.`,
  "too-long-free": `무료 질문은 ${QUESTION_MAX.free.toLocaleString("ko-KR")}자까지예요. 줄여서 적어 주세요. 리포트를 받으면 ${QUESTION_MAX.paid.toLocaleString("ko-KR")}자까지 쓸 수 있어요.`,
  "no-material": "이 방의 무료 풀이에는 아직 이야기 나눌 내용이 없어요. 리포트를 받으면 이어서 물어볼 수 있어요.",
  "not-found": "이 대화를 찾지 못했어요. 화면을 새로 열어 주세요.",
  "not-ready": "이야기를 이어 가는 건 리포트가 준비된 분께 열려 있어요.",
  failed: "이번에는 답을 만들지 못했어요. 잠시 뒤에 다시 물어봐 주세요.",
};

export type AskResult =
  /** question: 개인정보를 가린 질문 글 — 대화에는 이 글을 저장한다 */
  | { ok: true; kind: "answer"; question: string; paragraphs: string[]; remaining: number }
  /** 마음이 많이 힘든 글 — 풀이로 답하지 않는 고정 안내. 저장하지 않고 횟수에도 세지 않는다 */
  | { ok: true; kind: "safety"; paragraphs: string[] }
  | { ok: false; reason: AskReason; message: string };

const fail = (reason: AskReason): AskResult => ({ ok: false, reason, message: ASK_MESSAGES[reason] });
const missingTable = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";

export type AskDeps = {
  repo: MiyuRepository;
  /** 연결된 AI가 없으면 null (자유 질문은 닫힘) */
  answerer: ChatAnswerer | null;
  now: () => Date;
  config: ChatServiceConfig;
  capacity?: CapacityConfig;
  /**
   * 이 질문에 쓸 자료와 기준 날짜. tier는 구매해 준비된 리포트가 있으면 paid(하루 한도), 없으면 free(무료 맛보기의 첫 질문 — 평생 한도).
   * 분석 결과를 찾지 못하면 null.
   */
  loadAsk: () => Promise<{ context: ChatContext; referenceDate: string; tier: "paid" | "free"; /** 무료 맛보기에서 이 방의 풀이에 내 자료로 읽은 내용이 없다(무료 질문을 열지 않는다) */ noMaterial?: boolean } | null>;
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
  if (free && loaded.noMaterial) return fail("no-material");
  // 글자 수 한도는 무료 500자 · 리포트를 받은 분 1,000자 (위기 표현 확인 · 소유자 확인 뒤에 센다 — 힘든 글은 길어도 안내가 먼저다)
  if (free && q.length > QUESTION_MAX.free) return fail("too-long-free");
  const limit = free ? deps.config.freeLimit : deps.config.dailyLimit;
  if (limit <= 0) return fail(free ? "not-ready" : "closed");

  const dayStart = seoulDayStart(deps.now());
  let used: number;
  try {
    // 무료 맛보기의 질문은 평생 횟수, 리포트를 받은 회원은 오늘 횟수
    used = await repo.countChatQuestionsSince(input.userId, free ? COUNT_ALL_SINCE : dayStart);
  } catch (e) {
    // 12번 DB 변경 전 — 횟수를 셀 수 없으면 열지 않는다
    if (missingTable(e)) return fail("not-ready");
    throw e;
  }
  if (used >= limit) return fail(free ? "free-used" : "limit");
  const budget = deps.capacity?.dailyBudgetKrw ?? 0;
  if (budget > 0 && (await repo.sumAiCostSince(dayStart)) >= budget) return fail("budget");

  const ask: ChatAsk = {
    context: loaded.context,
    question: q.text,
    referenceDate: loaded.referenceDate,
    recent: recentExchanges(await loadTalkRoom(repo, { userId: input.userId, assessmentId: input.assessmentId, roomKey: input.roomKey })),
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
  // 답을 받은 질문만 횟수에 센다. 무료 질문은 검사에 걸려 답을 받지 못했다면(운영자 결정 2026-10-15) 차감하지 않는다 — 다시 물을 수 있다.
  // 리포트를 받은 분의 하루 한도는 모델이 응답한 질문(검사에 걸린 글도)이 비용이 들었으므로 센다. 호출 자체가 실패한 질문은 어느 쪽도 세지 않는다.
  // (검사에 걸린 호출 비용은 하루 AI 예산 · 승인 가드가 막는다. 질문별 한도를 우회하는 반복은 이 두 장치 안에서만 일어난다)
  const count = () => repo.addChatQuestion({ userId: input.userId, assessmentId: input.assessmentId, roomKey: input.roomKey }).catch(() => {});
  try {
    const answer = await deps.answerer.answer(ask, ctx);
    await count();
    const paragraphs = level === "soft" ? [...answer.paragraphs, CARE_NOTE] : answer.paragraphs;
    return { ok: true, kind: "answer", question: q.text, paragraphs, remaining: Math.max(0, limit - used - 1) };
  } catch (e) {
    if (!(e instanceof ChatAnswerError)) throw e;
    if (e.code === "INVALID" && !free) await count();
    return fail("failed");
  } finally {
    await Promise.allSettled(pending);
  }
}
