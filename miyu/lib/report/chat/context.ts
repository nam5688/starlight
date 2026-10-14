// 자유 질문에 AI가 읽는 근거를 만든다 — 저장된 리포트(또는 코드가 계산한 풀이)의 글만 쓰고, 이름은 "이 분"으로 바꾼다.
// 새 글 · 새 사실을 더하지 않는다. 무료 맛보기(구매 전)의 모델에는 잠긴 내용이 없으므로 그 모델로 만든 근거에도 맛보기에 보이는 글뿐이다(taste).
import type { TalkModel, TalkPiece, TalkTopic } from "../reading/talk.ts";
import { ROOMS, roomTopic, type RoomId } from "../reading/talk-room.ts";
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

/**
 * 방마다 답변이 향할 곳 — 진로 방과 재무 방은 같은 저장된 "일과 돈" 풀이를 쓰므로 AI가 묻는 말의 초점을 지시문으로 구분한다.
 * 새 사실을 더하는 말이 아니라 같은 근거 안에서 어디를 중심으로 답할지 정하는 말이다.
 */
export const ROOM_AI_FOCUS: Record<RoomId, string> = {
  main: "나를 알아보기: 전체 풀이 중 질문과 가장 가까운 한 주제를 중심으로 답한다.",
  daily: "오늘의 운세: 오늘 하루의 분위기와 해 볼 작은 행동 하나. 좋고 나쁨 · 사건 예언 · 점수 없이.",
  year: "올해의 흐름: 시기의 분위기와 살펴볼 점. 시기 이름 · 달은 reading에 있는 범위에서만 말한다.",
  love: "연애 · 관계: 내 반응과 선택을 중심으로. 상대의 속마음 · 나이 · 직업 · 만날 날짜는 말하지 않는다.",
  marriage: "결혼: 오래 가는 관계에서 내가 중요하게 보는 것을 중심으로. 결혼 여부 · 시기 · 상대의 조건은 정하지 않는다.",
  career: "일 · 진로: 일하는 방식, 힘이 나는 환경, 일을 고를 때 확인해 볼 기준 질문을 중심으로. 업종 · 직무 이름 추천이나 이직 · 퇴사 결정은 대신 내리지 않고, 돈 이야기는 일의 구조까지만 한다.",
  money: "돈 · 재무: 돈을 대하는 방식, 소비 · 저축 습관, 관리 방법 하나를 중심으로. 수익 · 투자 · 대출 · 보험 · 부동산 판단이나 특정 상품 추천은 하지 않고, 그런 결정은 해당 전문가에게 확인하라고 안내한다.",
  concern: "고민 상담: 사용자가 알려 준 상황을 먼저 받아 주고, 리포트에서 읽은 경향 한두 가지를 조건으로 이어 준다.",
};

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
  // 이 방에서 보이는 풀이(진로 · 재무 방은 같은 풀이에서 고른 소단락)만 근거로 쓴다
  const found = opts.topicId && (roomId === "main" || here.has(opts.topicId)) ? roomTopic(model, roomId, opts.topicId) : undefined;
  const topic = found ? topicContext(found) : null;

  const option = room.intake && opts.intakeId ? [...room.intake.options, room.intake.skip].find((o) => o.id === opts.intakeId) : undefined;
  const intake = room.intake && option && option.id !== room.intake.skip.id ? { question: room.intake.question, answer: option.label } : null;

  const c = model.card;
  return {
    room: { label: room.label, mode: room.mode, focus: ROOM_AI_FOCUS[roomId] },
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
    taste: model.tier === "free",
  };
}
