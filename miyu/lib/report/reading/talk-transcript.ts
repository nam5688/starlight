// 읽기용 대화 기록 — 리포트 기록을 삭제하기 전에 채팅 방에 "이미 표시된" 말(내가 한 말 · 미유가 한 말)을 줄 단위 글로 옮긴 것.
// 리포트 전체 본문을 옮기는 것이 아니다: 대화 중에 열어 본 부분만이고(열어 보지 않은 풀이는 들어 있지 않다), 새로 만든 글도 없다 — 기존 렌더러(replayRoom)가 그린 줄을 글로 바꿀 뿐이다.
// 그림 · 표(특징 카드 · 시기 그림 · 관계 반응 단계 · 분석 카드)는 같은 내용을 글로만 적는다. 채널 독립 코드다(React · Next · 브라우저 API를 쓰지 않는다).
import type { TalkLine } from "./talk-room.ts";
import type { TalkModel } from "./talk.ts";

/** 읽기용 한 줄 — system: 가운데 알림(예: 연애 상담을 시작할게요) */
export type TranscriptLine = { from: "me" | "miyu"; text: string; label?: string; system?: boolean };

/** 한 방에 저장하는 줄 수 · 한 줄의 글자 수 한도 (DB 검사와 같은 크기 안에서) */
export const TRANSCRIPT_LINES_MAX = 500;
export const TRANSCRIPT_TEXT_MAX = 4000;
export const TRANSCRIPT_LABEL_MAX = 80;

const ROLE_LABEL = { previous: "이전 시기", current: "지금 시기", next: "다음 시기" } as const;

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);
const line = (text: string, label?: string): TranscriptLine => ({ from: "miyu", text: clip(text.trim(), TRANSCRIPT_TEXT_MAX), ...(label ? { label: clip(label, TRANSCRIPT_LABEL_MAX) } : {}) });

/** 미유의 말 하나를 읽을 수 있는 글 줄(들)로 — 글이 없는 말(기반 자료 · 잠금 안내)은 빈 목록 */
function sayLines(say: Extract<TalkLine, { from: "miyu" }>["say"], model: TalkModel): TranscriptLine[] {
  switch (say.kind) {
    case "text":
      return say.text.trim() ? [line(say.text, say.label)] : [];
    case "answer":
      return [line(say.headline, say.title), ...say.paragraphs.map((p) => line(p))];
    case "traits":
      return say.traits.map((t) => line(`강한 포인트: ${t.shinesShort} · 힘들 수 있는 포인트: ${t.burdenShort}`, t.name));
    case "timeline":
      return say.slots.map((s) => line(`${s.label} · ${s.from}~${s.to}${s.themes.length > 0 ? ` · ${s.themes.join(", ")}` : ""}`, ROLE_LABEL[s.role]));
    case "flow":
      return [line(say.when, "반응 단계"), ...say.steps.map((s) => line(s.text, s.label)), ...(say.helpful ? [line(say.helpful)] : [])];
    case "comfort":
      return [
        ...(say.comfortable.length > 0 ? [line(say.comfortable.join(" · "), "이런 관계에서 마음이 편해져요")] : []),
        ...(say.clash.length > 0 ? [line(say.clash.join(" · "), "이럴 땐 마음이 부딪히기 쉬워요")] : []),
        ...(say.note ? [line(say.note)] : []),
      ];
    case "card": {
      const c = model.card;
      return [
        line(c.headline, "나의 분석 한 장"),
        ...(c.typeName ? [line(c.typeName, "나의 유형")] : []),
        ...(c.tendency ? [line(c.tendency)] : []),
        line(`${c.strength.keyword} — ${c.strength.note}`, c.strength.label),
        line(`${c.caution.keyword} — ${c.caution.note}`, c.caution.label),
        line(`${c.flow.keyword} — ${c.flow.note}${c.flow.foot ? ` (${c.flow.foot})` : ""}`, c.flow.label),
      ];
    }
    case "link":
      return say.text.trim() ? [line(say.text, say.label)] : [];
    case "system":
      return [{ from: "miyu", system: true, text: clip((say.sub ? `${say.text} — ${say.sub}` : say.text).trim(), TRANSCRIPT_TEXT_MAX) }];
    case "basis": // 분석 근거 화면은 어디서도 보이지 않는 구역이라 옮기지 않는다
    case "lock": // 구매 안내(질문 목록)는 대화가 아니다
      return [];
  }
}

/** 대화방이 그린 줄(RoomState.lines)을 읽기용 줄로 옮긴다 — 화면에 표시된 말만, 순서 그대로 */
export function transcriptOf(lines: readonly TalkLine[], model: TalkModel): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const l of lines) {
    if (l.from === "me") {
      if (l.text.trim()) out.push({ from: "me", text: clip(l.text.trim(), TRANSCRIPT_TEXT_MAX) });
    } else {
      out.push(...sayLines(l.say, model));
    }
  }
  return out.slice(0, TRANSCRIPT_LINES_MAX);
}

/** 저장소에서 읽은 값을 줄 목록으로 다시 확인한다 — 모양이 어긋난 줄은 버린다 */
export function readTranscriptLines(raw: unknown): TranscriptLine[] {
  if (!Array.isArray(raw)) return [];
  const out: TranscriptLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if ((r.from !== "me" && r.from !== "miyu") || typeof r.text !== "string" || !r.text.trim()) continue;
    out.push({
      from: r.from,
      text: clip(r.text, TRANSCRIPT_TEXT_MAX),
      ...(typeof r.label === "string" && r.label ? { label: clip(r.label, TRANSCRIPT_LABEL_MAX) } : {}),
      ...(r.system === true ? { system: true } : {}),
    });
    if (out.length >= TRANSCRIPT_LINES_MAX) break;
  }
  return out;
}
