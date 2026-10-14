// 분석 카드 이미지의 배치 계산 — 글자 폭을 재는 함수(measure)만 받아 "무엇을 어디에 그릴지"를 데이터(CardOp)로 돌려준다.
// 실제로 그리는 곳은 브라우저(components/talk/card-image.ts, Canvas)이고, 이 파일은 브라우저를 쓰지 않아 테스트할 수 있다.
// 저장용(save)에는 이름 · 분석일 · 사용한 정보가 들어가고, 공유용(share)은 이름을 기본으로 빼며 분석일 · 사용한 정보도 넣지 않는다.
// 카드에는 생년월일 · 고민 · 응답 점수가 들어갈 자리가 없다 (TalkCard에 그런 값이 없다). 점수 그래프 · 정확도도 그리지 않는다.
import { CARD_DISCLAIMER, type TalkCard } from "./talk.ts";

export type CardColor = "canvas" | "ink" | "ink-2" | "ink-3" | "accent" | "accent-strong" | "accent-soft" | "positive" | "positive-fill" | "positive-soft" | "caution" | "caution-soft" | "line";

/** r은 모서리 둥글기(px), mark는 안내 캐릭터 "미유"를 그리는 자리(size는 한 변의 길이) — 그림은 브라우저(card-image.ts)가 그린다 */
export type CardOp =
  | { type: "rect"; x: number; y: number; w: number; h: number; color: CardColor; r?: number }
  | { type: "text"; x: number; y: number; text: string; size: number; weight: 400 | 600 | 700; color: CardColor; align?: "left" | "right" }
  | { type: "mark"; x: number; y: number; size: number };

/** 글자 폭(px)을 재는 함수 — 브라우저에서는 Canvas가, 테스트에서는 가짜 함수가 맡는다 */
export type Measure = (text: string, size: number, weight: number) => number;

export type CardLayoutOptions = {
  variant: "save" | "share";
  measure: Measure;
  name?: string;
  /** 저장용에만 쓴다 (예: 2026. 10. 13.) */
  dateLabel?: string;
  /** 공유용에서 이름을 넣을지 (기본: 넣지 않는다) */
  includeName?: boolean;
  width?: number;
};

export const CARD_WIDTH = 1080;
const MARGIN = 72;
const LH = 1.45;

/** 어절 단위로 줄을 나눈다. 한 어절이 한 줄보다 길면 글자 단위로 끊는다 */
export function wrapText(text: string, maxWidth: number, size: number, weight: number, measure: Measure): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const push = () => {
    if (line) lines.push(line);
    line = "";
  };
  for (const word of words) {
    const joined = line ? `${line} ${word}` : word;
    if (measure(joined, size, weight) <= maxWidth) {
      line = joined;
      continue;
    }
    push();
    if (measure(word, size, weight) <= maxWidth) {
      line = word;
      continue;
    }
    for (const ch of word) {
      if (line && measure(line + ch, size, weight) > maxWidth) push();
      line += ch;
    }
  }
  push();
  return lines;
}

export function layoutCard(card: TalkCard, o: CardLayoutOptions): { ops: CardOp[]; width: number; height: number } {
  const width = o.width ?? CARD_WIDTH;
  const inner = width - MARGIN * 2;
  const ops: CardOp[] = [];
  let y = MARGIN;

  const text = (t: string, x: number, at: number, size: number, weight: 400 | 600 | 700, color: CardColor, align?: "left" | "right") => ops.push({ type: "text", x, y: at, text: t, size, weight, color, ...(align ? { align } : {}) });
  /** 여러 줄 글 — 다 쓰고 나면 y가 글 아래로 내려간다 */
  const block = (t: string, x: number, maxWidth: number, size: number, weight: 400 | 600 | 700, color: CardColor) => {
    for (const line of wrapText(t, maxWidth, size, weight, o.measure)) {
      text(line, x, y, size, weight, color);
      y += Math.round(size * LH);
    }
  };
  const measureBlock = (t: string, maxWidth: number, size: number, weight: number) => wrapText(t, maxWidth, size, weight, o.measure).length * Math.round(size * LH);

  const showName = o.variant === "save" || o.includeName === true;
  const name = o.name?.trim();

  // 맨 위 연보라 띠 — 작은 캐릭터 · 이름표 · 이름 · 대표 경향 (저장하고 싶은 카드의 얼굴)
  const MARK = 132;
  const textX = MARGIN + MARK + 36;
  const headTop = 60;
  // 띠와 캐릭터는 글보다 먼저 그려야 글을 덮지 않는다 — 띠 높이는 아래에서 정해지므로 이 자리에 나중에 끼워 넣는다
  const headStart = ops.length;
  text("ME:U 미유", textX, headTop, 28, 700, "accent-strong");
  if (o.variant === "save" && o.dateLabel) text(o.dateLabel, width - MARGIN, headTop + 3, 24, 400, "ink-3", "right");
  text(showName && name ? `${name} 님의 분석 카드` : "나의 분석 카드", textX, headTop + 46, 34, 700, "ink");
  let bandH = headTop + MARK + 56;
  if (card.tendency) {
    const w = Math.ceil(o.measure(card.tendency, 32, 700)) + 48;
    const chipY = headTop + 46 + 34 + 26;
    ops.push({ type: "rect", x: textX, y: chipY, w, h: 56, color: "canvas", r: 28 });
    text(card.tendency, textX + 24, chipY + 10, 32, 700, "accent-strong");
    text("나의 대표 경향", textX + w + 20, chipY + 16, 24, 400, "ink-3");
    bandH = Math.max(bandH, chipY + 56 + 48);
  }
  ops.splice(headStart, 0, { type: "rect", x: 0, y: 0, w: width, h: bandH, color: "accent-soft" }, { type: "mark", x: MARGIN, y: headTop - 8, size: MARK });
  y = bandH + 52;

  // 핵심 해석 한 문장
  block(card.headline, MARGIN, inner, 52, 700, "ink");
  y += 36;

  // 강한 포인트 · 힘들 수 있는 포인트 · 지금 나의 시기 — 색이 있는 둥근 칸 (테두리 · 띠 없이, 이름과 색을 함께)
  const box = (c: { label: string; keyword: string; note: string }, face: CardColor, tone: CardColor) => {
    const pad = 34;
    const textW = inner - pad * 2;
    const h = pad + Math.round(26 * LH) + measureBlock(c.keyword, textW, 38, 700) + 6 + measureBlock(c.note, textW, 30, 400) + pad;
    ops.push({ type: "rect", x: MARGIN, y, w: inner, h, color: face, r: 32 });
    const x = MARGIN + pad;
    const top = y;
    y += pad;
    text(c.label, x, y, 26, 700, tone);
    y += Math.round(26 * LH);
    block(c.keyword, x, textW, 38, 700, "ink");
    y += 6;
    block(c.note, x, textW, 30, 400, "ink-2");
    y = top + h + 22;
  };
  box(card.strength, "positive-soft", "positive");
  box(card.caution, "caution-soft", "caution");
  box(card.flow, "accent-soft", "accent-strong");

  // 사용한 정보 — 저장용에만
  if (o.variant === "save" && card.inputs.length > 0) {
    y += 14;
    text("사용한 정보", MARGIN, y, 26, 600, "ink-3");
    y += Math.round(26 * LH) + 2;
    block(card.inputs.join(" · "), MARGIN, inner, 28, 400, "ink-2");
  }

  // 맺음 — 선 없이 작은 글로
  y += 30;
  block(CARD_DISCLAIMER, MARGIN, inner, 26, 400, "ink-3");

  const height = y + MARGIN;
  // 바탕은 마지막에 정해진 높이로 — 맨 앞에 둔다
  ops.unshift({ type: "rect", x: 0, y: 0, w: width, h: height, color: "canvas" });
  return { ops, width, height };
}
