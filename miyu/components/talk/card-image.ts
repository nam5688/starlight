// 분석 카드를 PNG 이미지로 그린다 — 브라우저(Canvas)에서만 쓴다. 배치는 lib/report/reading/talk-card.ts가 정하고 여기서는 그리기만 한다.
// 이미지는 이 기기 안에서 만들어지며 서버로 보내지 않는다 (카드의 글은 이미 이 화면에 보이던 리포트 문장이다).
import { layoutCard, type CardLayoutOptions } from "@/lib/report/reading/talk-card";
import type { TalkCard } from "@/lib/report/reading/talk";
import { MIYU_IMAGES } from "./miyu-moods";

type Options = Omit<CardLayoutOptions, "measure" | "width">;

export async function renderCardPng(card: TalkCard, options: Options): Promise<Blob> {
  // 화면에 쓰는 글꼴과 같은 글꼴로 그린다 (아직 받는 중이면 기다린다)
  await document.fonts.ready;
  const root = getComputedStyle(document.documentElement);
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const colorOf = (name: string) => root.getPropertyValue(`--color-${name}`).trim() || "#30313b";
  const font = (size: number, weight: number) => `${weight} ${size}px ${family}`;

  // 캐릭터 그림 파일이 정해져 있으면 먼저 불러온다 — 못 불러오면 기본 조약돌 그림으로 그린다
  const character = await loadImage(MIYU_IMAGES.happy);
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
      if (op.r) {
        ctx.beginPath();
        ctx.roundRect(op.x, op.y, op.w, op.h, op.r);
        ctx.fill();
      } else ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.type === "mark") {
      // 운영자가 보낸 그림 그대로 둥근 정사각형으로 — 못 불러오면 "미" 글자 프로필로 대신한다
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(op.x, op.y, op.size, op.size, op.size * 0.26);
      ctx.clip();
      if (character) ctx.drawImage(character, op.x, op.y, op.size, op.size);
      else {
        ctx.fillStyle = colorOf("accent-soft");
        ctx.fillRect(op.x, op.y, op.size, op.size);
        ctx.fillStyle = colorOf("accent-strong");
        ctx.font = font(op.size * 0.5, 700);
        ctx.textAlign = "center";
        ctx.fillText("미", op.x + op.size / 2, op.y + op.size * 0.24);
      }
      ctx.restore();
    } else {
      ctx.font = font(op.size, op.weight);
      ctx.fillStyle = colorOf(op.color);
      ctx.textAlign = op.align ?? "left";
      ctx.fillText(op.text, op.x, op.y);
    }
  }
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지를 만들지 못했어요."))), "image/png"));
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
