// 분석 카드를 PNG 이미지로 그린다 — 브라우저(Canvas)에서만 쓴다. 배치는 lib/report/reading/talk-card.ts가 정하고 여기서는 그리기만 한다.
// 이미지는 이 기기 안에서 만들어지며 서버로 보내지 않는다 (카드의 글은 이미 이 화면에 보이던 리포트 문장이다).
import { layoutCard, type CardLayoutOptions } from "@/lib/report/reading/talk-card";
import type { TalkCard } from "@/lib/report/reading/talk";
import { CHARACTER_IMAGE, CHEEKS, FACE, NOTEBOOK, PEBBLE_BODY } from "./miyu-shape";

type Options = Omit<CardLayoutOptions, "measure" | "width">;

export async function renderCardPng(card: TalkCard, options: Options): Promise<Blob> {
  // 화면에 쓰는 글꼴과 같은 글꼴로 그린다 (아직 받는 중이면 기다린다)
  await document.fonts.ready;
  const root = getComputedStyle(document.documentElement);
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const colorOf = (name: string) => root.getPropertyValue(`--color-${name}`).trim() || "#30313b";
  const font = (size: number, weight: number) => `${weight} ${size}px ${family}`;

  // 캐릭터 그림 파일이 정해져 있으면 먼저 불러온다 — 못 불러오면 기본 조약돌 그림으로 그린다
  const character = CHARACTER_IMAGE ? await loadImage(CHARACTER_IMAGE) : null;
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
      if (character) ctx.drawImage(character, op.x, op.y, op.size, op.size);
      else drawPebble(ctx, op.x, op.y, op.size, colorOf);
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

/** 기본 조약돌 "미유"를 Canvas로 그린다 — 화면의 SVG(miyu-character.tsx)와 같은 좌표(48 × 48 칸)를 쓴다 */
function drawPebble(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, c: (name: string) => string) {
  const face = FACE.smile;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 48, size / 48);
  const body = new Path2D(PEBBLE_BODY);
  ctx.fillStyle = c("pebble");
  ctx.fill(body);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = c("pebble-edge");
  ctx.stroke(body);
  ctx.fillStyle = c("pebble-point");
  ctx.globalAlpha = 0.8;
  for (const k of CHEEKS) {
    ctx.beginPath();
    ctx.ellipse(k.cx, k.cy, k.rx, k.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = c("ink");
  for (const [ex, ey] of face.eyes) {
    ctx.beginPath();
    ctx.arc(ex, ey, face.eyeR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  ctx.strokeStyle = c("ink");
  ctx.stroke(new Path2D(face.mouth));
  // 작은 노트
  ctx.save();
  ctx.translate(NOTEBOOK.pivotX, NOTEBOOK.pivotY);
  ctx.rotate((NOTEBOOK.rotate * Math.PI) / 180);
  ctx.translate(-NOTEBOOK.pivotX, -NOTEBOOK.pivotY);
  ctx.beginPath();
  ctx.roundRect(NOTEBOOK.x, NOTEBOOK.y, NOTEBOOK.w, NOTEBOOK.h, NOTEBOOK.r);
  ctx.fillStyle = c("pebble-point");
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = c("accent");
  ctx.stroke();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = c("accent-strong");
  for (const d of NOTEBOOK.lines) ctx.stroke(new Path2D(d));
  ctx.restore();
  ctx.restore();
}
