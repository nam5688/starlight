// 자유 질문에 AI가 읽는 근거를 만든다 — 저장된 리포트(또는 코드가 계산한 풀이)의 글만 쓰고, 이름은 "이 분"으로 바꾼다.
// 새 글 · 새 사실을 더하지 않는다. 무료 맛보기(잠긴 내용이 없는 모델)에서는 쓰지 않는다 — 자유 질문은 리포트를 받은 분께만 열린다.
import type { TalkModel, TalkPiece, TalkTopic } from "../reading/talk.ts";
import { ROOMS, type RoomId } from "../reading/talk-room.ts";
import type { ChatContext } from "./types.ts";

/** 한 풀이에서 AI에게 주는 글의 한도 (글자 수) — 입력이 길어져 비용이 커지지 않게 */
export const CONTEXT_TEXT_MAX = 2600;

const pieceTexts = (p: TalkPiece): string[] => {
  switch (p.kind) {
    case "para":
      return [p.text];
    case "flow":
      return [p.when, ...p.steps.map((s) => `${s.label}: ${s.text}`), p.helpful];
    case "comfort":
      return [...p.comfortable, ...p.clash];
    case "note":
      return [];
  }
};

function topicContext(t: TalkTopic): NonNullable<ChatContext["topic"]> {
  const detail = [...t.detail, ...t.example].flatMap(pieceTexts);
  const picked: string[] = [];
  let used = t.summary.join(" ").length + t.headline.length;
  for (const d of detail) {
    if (used + d.length > CONTEXT_TEXT_MAX) break;
    picked.push(d);
    used += d.length;
  }
  return { title: t.title, headline: t.headline, summary: t.summary, detail: picked };
}

export type ChatContextOptions = {
  /** 지금 이야기 중인 풀이 번호 (리포트 주제 · 코드가 계산한 풀이). 모르거나 이 방에서 열 수 없는 풀이면 쓰지 않는다 */
  topicId?: string | null;
  /** 먼저 묻는 질문에서 고른 답의 번호 */
  intakeId?: string | null;
  followUp?: boolean;
};

export function buildChatContext(model: TalkModel, roomId: RoomId, opts: ChatContextOptions = {}): ChatContext {
  const room = ROOMS[roomId];
  const plain = (s: string) => (model.name ? s.split(model.name).join("이 분") : s);
  const scrub = (v: string[]) => v.map(plain);

  const here = new Set(room.topicIds);
  const found = opts.topicId && (roomId === "main" || here.has(opts.topicId)) ? [...model.topics, ...model.codeTopics].find((t) => t.id === opts.topicId) : undefined;
  const topic = found ? topicContext(found) : null;

  const option = room.intake && opts.intakeId ? [...room.intake.options, room.intake.skip].find((o) => o.id === opts.intakeId) : undefined;
  const intake = room.intake && option && option.id !== room.intake.skip.id ? { question: room.intake.question, answer: option.label } : null;

  const c = model.card;
  return {
    room: { label: room.label, mode: room.mode },
    intake,
    topic: topic ? { title: plain(topic.title), headline: plain(topic.headline), summary: scrub(topic.summary), detail: scrub(topic.detail) } : null,
    overview: {
      headline: plain(c.headline),
      tendency: c.tendency ? plain(c.tendency) : null,
      // 풀이가 있으면 그 풀이를 쓰고, 풀이 없이 이야기만 나누는 방(고민해결소)에서만 카드의 요약을 더한다
      strength: topic ? null : plain(c.strength.note),
      caution: topic ? null : plain(c.caution.note),
      flow: topic ? null : plain(c.flow.note),
    },
    followUp: Boolean(opts.followUp),
  };
}
