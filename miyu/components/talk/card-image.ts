// 분석 카드를 PNG 이미지로 그린다 — 브라우저(Canvas)에서만 쓴다. 배치는 lib/report/reading/talk-card.ts가 정하고 여기서는 그리기만 한다.
// 이미지는 이 기기 안에서 만들어지며 서버로 보내지 않는다 (카드의 글은 이미 이 화면에 보이던 리포트 문장이다).
import { type CardColor, layoutCard, type CardLayoutOptions } from "@/lib/report/reading/talk-card";
import type { TalkCard } from "@/lib/report/reading/talk";

type Options = Omit<CardLayoutOptions, "measure" | "width">;

export async function renderCardPng(card: TalkCard, options: Options): Promise<Blob> {
  // 화면에 쓰는 글꼴과 같은 글꼴로 그린다 (아직 받는 중이면 기다린다)
  await document.fonts.ready;
  const root = getComputedStyle(document.documentElement);
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const colorOf = (name: CardColor) => root.getPropertyValue(`--color-${name}`).trim() || "#252936";
  const font = (size: number, weight: number) => `${weight} ${size}px ${family}`;

  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) throw new Error("이 브라우저에서는 이미지를 만들 수 없어요.");
  const layout = layoutCard(card, {
    ...options,
    measure: (text, size, weight) => {
      probe.font = font(size, weight);
      return probe.measureText(text).width;
    },
  });

  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이 브라우저에서는 이미지를 만들 수 없어요.");
  ctx.textBaseline = "top";
  for (const op of layout.ops) {
    if (op.type === "rect") {
      ctx.fillStyle = colorOf(op.color);
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else {
      ctx.font = font(op.size, op.weight);
      ctx.fillStyle = colorOf(op.color);
      ctx.textAlign = op.align ?? "left";
      ctx.fillText(op.text, op.x, op.y);
    }
  }
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지를 만들지 못했어요."))), "image/png"));
}
