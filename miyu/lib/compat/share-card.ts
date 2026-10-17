// 간단 궁합 공유 카드(이미지)의 배치 계산 — 글자 폭을 재는 함수(measure)만 받아 "무엇을 어디에 그릴지"를 데이터(CardOp)로 돌려준다.
// 그리는 곳은 브라우저(components/talk/card-image.ts의 renderLayoutPng)이고 이 파일은 브라우저를 쓰지 않아 테스트할 수 있다(분석 카드와 같은 방식).
// 카드에 담기는 것: 이름(사용자가 보려고 쓴 닉네임) · 커플 유형 · 궁합 지수 · 핵심 한 줄 · 잘 맞는 곳 / 맞춰 볼 곳 · 재미 · 참고용 안내. 생년월일 · 출생시각은 SimpleCompatCard에 없어 카드에도 들어갈 자리가 없다.
// 지수는 확률 · 정확도가 아니라는 안내를 카드 안에 항상 적는다(CLAUDE.md의 궁합 지수 예외 조건 ②).
import { CARD_WIDTH, wrapText, type CardColor, type CardOp, type Measure } from "../report/reading/talk-card.ts";
import type { SimpleCompatCard } from "./simple.ts";

export const COMPAT_CARD_DISCLAIMER = "궁합 지수는 관계가 이어질 확률이나 정확도가 아니라 재미 · 참고용 숫자예요. 두 사람의 생년월일은 이 이미지에 담기지 않아요.";
export const COMPAT_CARD_INVITE = "미유(ME:U)에서 우리도 해 볼래?";

const MARGIN = 72;
const LH = 1.45;

export function layoutCompatCard(card: SimpleCompatCard, o: { measure: Measure; width?: number }): { ops: CardOp[]; width: number; height: number } {
  const width = o.width ?? CARD_WIDTH;
  const inner = width - MARGIN * 2;
  const ops: CardOp[] = [];
  let y = MARGIN;
  const text = (t: string, x: number, at: number, size: number, weight: 400 | 600 | 700, color: CardColor, align?: "left" | "right") => ops.push({ type: "text", x, y: at, text: t, size, weight, color, ...(align ? { align } : {}) });
  const block = (t: string, x: number, maxWidth: number, size: number, weight: 400 | 600 | 700, color: CardColor) => {
    for (const line of wrapText(t, maxWidth, size, weight, o.measure)) {
      text(line, x, y, size, weight, color);
      y += Math.round(size * LH);
    }
  };
  const measureBlock = (t: string, maxWidth: number, size: number, weight: number) => wrapText(t, maxWidth, size, weight, o.measure).length * Math.round(size * LH);

  // 맨 위 연보라 띠 — 작은 캐릭터 · 서비스 이름 · "간단 궁합"
  const MARK = 120;
  const textX = MARGIN + MARK + 36;
  const headTop = 60;
  text("ME:U 미유", textX, headTop + 8, 28, 700, "accent-strong");
  text("간단 궁합", textX, headTop + 52, 40, 700, "ink");
  const bandH = headTop + MARK + 52;
  ops.unshift({ type: "rect", x: 0, y: 0, w: width, h: bandH, color: "accent-soft" }, { type: "mark", x: MARGIN, y: headTop - 4, size: MARK });
  y = bandH + 56;

  // 이름 · 커플 유형
  block(`${card.names.a} × ${card.names.b}`, MARGIN, inner, 34, 600, "ink-3");
  y += 10;
  block(card.typeName, MARGIN, inner, 64, 700, "accent-strong");
  y += 8;
  block(card.typeLine, MARGIN, inner, 36, 400, "ink");
  y += 40;

  // 궁합 지수 — 큰 숫자 + 재미 · 참고용
  text("궁합 지수", MARGIN, y, 28, 600, "ink-3");
  y += Math.round(28 * LH);
  text(String(card.score), MARGIN, y, 132, 700, "ink");
  text("/ 100 · 재미 · 참고용", MARGIN + Math.ceil(o.measure(String(card.score), 132, 700)) + 24, y + 78, 28, 400, "ink-3");
  y += Math.round(132 * 1.1) + 24;

  // 우리 커플 핵심
  const pad = 34;
  const coreW = inner - pad * 2;
  const coreH = pad + Math.round(26 * LH) + measureBlock(card.core, coreW, 36, 700) + pad;
  ops.push({ type: "rect", x: MARGIN, y, w: inner, h: coreH, color: "accent-soft", r: 32 });
  const coreTop = y;
  y += pad;
  text("우리 커플 핵심", MARGIN + pad, y, 26, 700, "accent-strong");
  y += Math.round(26 * LH);
  block(card.core, MARGIN + pad, coreW, 36, 700, "ink");
  y = coreTop + coreH + 30;

  // 잘 맞는 곳 · 맞춰 볼 곳 — 색이 있는 둥근 칸(이름과 색을 함께)
  const box = (label: string, items: string[], face: CardColor, tone: CardColor) => {
    if (!items.length) return;
    const body = items.join(" · ");
    const h = pad + Math.round(26 * LH) + measureBlock(body, coreW, 30, 400) + pad;
    ops.push({ type: "rect", x: MARGIN, y, w: inner, h, color: face, r: 32 });
    const top = y;
    y += pad;
    text(label, MARGIN + pad, y, 26, 700, tone);
    y += Math.round(26 * LH);
    block(body, MARGIN + pad, coreW, 30, 400, "ink-2");
    y = top + h + 22;
  };
  box("잘 맞는 곳", card.good, "positive-soft", "positive");
  box("맞춰 볼 곳", card.care, "caution-soft", "caution");

  // 맺음 — 안내 · 초대 문구
  y += 18;
  block(COMPAT_CARD_DISCLAIMER, MARGIN, inner, 26, 400, "ink-3");
  y += 14;
  block(COMPAT_CARD_INVITE, MARGIN, inner, 30, 700, "accent-strong");

  const height = y + MARGIN;
  ops.unshift({ type: "rect", x: 0, y: 0, w: width, h: height, color: "canvas" });
  return { ops, width, height };
}
