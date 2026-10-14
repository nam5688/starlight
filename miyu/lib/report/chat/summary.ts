// 채팅 요약 — 방에서 나눈 대화(눌렀던 행동 목록)를 짧은 "질문 → 답변"으로 줄인다. 코드가 규칙대로 줄이며 AI를 부르지 않는다.
// 요약에는 리포트 글을 옮겨 담지 않는다: 읽은 풀이의 이름표 · 먼저 묻는 질문에 고른 답 · 내 경험 답장 · 직접 적은 질문과 미유 답의 앞부분만 담는다.
// 저장하지 않고 끝낸 대화의 요약(참고 기록)도 같은 모양이며 다음 질문에서 AI가 이전 이야기를 참고하는 데만 쓴다(chat-service.ts).
// 채널 독립 코드다(React · Next · 브라우저 API를 쓰지 않는다).
import { TALK_COPY, type TalkModel } from "../reading/talk.ts";
import { ROOMS, roomTopic, type RoomAction, type RoomId } from "../reading/talk-room.ts";

/** fixed: 방이 먼저 묻는 질문 · 내 경험 답장처럼 고정 문구의 질문 (직접 적은 질문이 아니다) */
export type SummaryQa = { q: string; a: string; fixed?: boolean };
/** 저장되는 요약 — read: 읽은 풀이 이름표, qa: 질문 → 답변 */
export type SummaryItems = { read: string[]; qa: SummaryQa[] };

/** 글자 수 · 개수 한도 — DB의 크기 검사(32KB)보다 훨씬 작게 둔다 */
export const SUMMARY_LIMITS = {
  readMax: 12,
  qaMax: 30,
  readChars: 30,
  questionChars: 120,
  answerChars: 170,
  /** 한 회원이 직접 저장해 둘 수 있는 요약 수 — 넘으면 MY에서 지우고 다시 저장한다 */
  visiblePerUser: 100,
  /** 저장하지 않은 대화의 참고 기록을 방마다 몇 개까지 남기나 — 넘으면 오래된 것부터 지운다 */
  hiddenPerRoom: 12,
  /** 다음 질문에서 AI가 참고하는 이전 이야기 */
  memory: { pairs: 4, questionChars: 100, answerChars: 140 },
} as const;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * 글을 문장 끝에서 줄인다 — max자 안에서 마지막으로 끝난 문장까지, 문장이 끝나지 않으면 max자에서 자르고 …을 붙인다.
 * 줄인 글은 새 글이 아니라 앞부분이므로 말을 바꾸지 않는다.
 */
export function shorten(text: string, max: number): string {
  const t = clean(text);
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  let cut = -1;
  for (const m of head.matchAll(/[.?!](?=\s|$)/g)) cut = (m.index ?? 0) + 1;
  if (cut >= Math.floor(max * 0.45)) return head.slice(0, cut).trim();
  return `${head.trimEnd()}…`;
}

const FEEL_QUESTION = (chip: string) => `“${chip}” 이야기가 내 경험과 맞나요?`;

/**
 * 행동 목록(actions)의 from번째부터 요약한다 — 이전 저장 이후의 대화만 담는다.
 * 읽은 풀이는 이름표만(같은 풀이는 한 번), 먼저 묻는 질문은 고른 답, 내 경험 답장은 고른 말, 직접 적은 질문은 질문과 미유 답의 앞부분.
 * 풀이 이름 · 선택지 이름은 방 정의(고정 문구)와 이 리포트의 풀이 이름표에서 가져온다.
 */
export function summarizeActions(model: TalkModel, room: RoomId, actions: readonly RoomAction[], from = 0): SummaryItems {
  const def = ROOMS[room];
  const read: string[] = [];
  const qa: SummaryQa[] = [];
  const addRead = (name: string | undefined) => {
    const n = name ? shorten(name, SUMMARY_LIMITS.readChars) : "";
    if (n && !read.includes(n)) read.push(n);
  };
  const chipOf = (id: string) => roomTopic(model, room, id)?.chip;

  for (const a of actions.slice(Math.max(0, from))) {
    switch (a.t) {
      case "group": {
        const g = model.groups.find((x) => x.id === a.id);
        addRead(g?.chip);
        break;
      }
      case "topic":
        addRead(chipOf(a.id));
        break;
      case "intake": {
        if (!def.intake) break;
        const opt = a.option === "skip" ? def.intake.skip : def.intake.options.find((o) => o.id === a.option);
        if (opt) qa.push({ q: shorten(def.intake.question, SUMMARY_LIMITS.questionChars), a: shorten(opt.label, SUMMARY_LIMITS.answerChars), fixed: true });
        break;
      }
      case "feel": {
        const chip = chipOf(a.topic);
        if (chip) qa.push({ q: shorten(FEEL_QUESTION(chip), SUMMARY_LIMITS.questionChars), a: TALK_COPY.feel[a.kind].label, fixed: true });
        break;
      }
      case "free": {
        const q = shorten(a.q, SUMMARY_LIMITS.questionChars);
        const answer = shorten(a.a.join(" "), SUMMARY_LIMITS.answerChars);
        if (q && answer) qa.push({ q, a: answer });
        break;
      }
      case "extra":
        break;
    }
  }
  return { read: read.slice(0, SUMMARY_LIMITS.readMax), qa: qa.slice(0, SUMMARY_LIMITS.qaMax) };
}

/** 저장할 만한 내용이 없는가 (읽은 풀이도 질문도 없다) */
export const isEmptySummary = (s: SummaryItems) => s.read.length === 0 && s.qa.length === 0;

/** 저장된 jsonb를 읽는다 — 모양이 어긋나거나 한도를 넘으면 걸러 낸다 (DB의 값이라도 화면에 그대로 믿고 쓰지 않는다) */
export function parseSummaryItems(raw: unknown): SummaryItems {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim().length > 0 ? clean(v).slice(0, max) : null);
  const read = (Array.isArray(obj.read) ? obj.read : []).map((v) => text(v, SUMMARY_LIMITS.readChars)).filter((v): v is string => v !== null).slice(0, SUMMARY_LIMITS.readMax);
  const qa = (Array.isArray(obj.qa) ? obj.qa : [])
    .map((v) => {
      const r = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
      const q = text(r.q, SUMMARY_LIMITS.questionChars + 1);
      const a = text(r.a, SUMMARY_LIMITS.answerChars + 1);
      return q && a ? { q, a, ...(r.fixed === true ? { fixed: true } : {}) } : null;
    })
    .filter((v): v is SummaryQa => v !== null)
    .slice(0, SUMMARY_LIMITS.qaMax);
  return { read, qa };
}

/**
 * 다음 질문에서 AI가 참고하는 이전 이야기 — 같은 방의 지난 요약에서 직접 적은 질문과 미유 답만(먼저 묻는 질문 · 내 경험 답장은 이미 이번 대화에서 다시 고를 수 있다), 최근 것 몇 쌍.
 * summaries는 최근 것이 먼저 오는 목록이다.
 */
export function memoryPairs(summaries: readonly SummaryItems[]): SummaryQa[] {
  const { pairs, questionChars, answerChars } = SUMMARY_LIMITS.memory;
  const out: SummaryQa[] = [];
  for (const s of summaries) {
    // 한 요약 안에서는 마지막에 나눈 것이 먼저 — 최근 이야기가 더 이어지기 쉽다. 먼저 묻는 질문 · 내 경험 답장은 이번 대화에서 다시 고를 수 있어 직접 적은 질문만 쓴다
    for (const p of [...s.qa].reverse()) {
      if (out.length >= pairs) return out.reverse();
      if (p.fixed) continue;
      out.push({ q: shorten(p.q, questionChars), a: shorten(p.a, answerChars) });
    }
  }
  return out.reverse();
}
