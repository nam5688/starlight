// 안내 캐릭터 "미유"의 모양 데이터 — 화면(SVG, miyu-character.tsx)과 저장용 카드 이미지(Canvas, card-image.ts)가 같은 값을 쓴다.
// 작은 둥근 조약돌: 크림색 몸 · 작은 눈과 입 · 연보라 볼 · 작은 노트. 수정구슬이나 무당 복장 같은 소품은 쓰지 않는다. 표정은 셋뿐이다(미소 · 생각 중 · 듣는 중).
// 색은 globals.css의 토큰(pebble · pebble-edge · pebble-point · ink · accent)만 쓴다.

/**
 * 캐릭터 그림 파일을 바꾸는 곳 (운영자가 사진 · 그림을 보내 주면 여기만 고친다).
 * 1) 파일을 `miyu/public/miyu/character.png`처럼 넣고 2) 아래 값을 `"/miyu/character.png"`로 바꾼다. 정사각형 배경 투명 PNG · WebP · SVG를 권장한다.
 * null이면 기본 조약돌 그림을 쓴다. 파일을 못 불러와도 저장용 카드 이미지는 기본 그림으로 그려진다.
 */
export const CHARACTER_IMAGE: string | null = null;

export type MiyuMood = "smile" | "thinking" | "listening";

/** 48 × 48 칸 안의 좌표 */
export const PEBBLE_BODY = "M24 5C34 5 42 12 42 23c0 11-8 19-18 19S6 34 6 23C6 12 14 5 24 5Z";

export const FACE: Record<MiyuMood, { eyes: [number, number][]; eyeR: number; mouth: string }> = {
  smile: { eyes: [[17, 23], [31, 23]], eyeR: 1.9, mouth: "M20.5 29.2q3.5 3.2 7 0" },
  // 눈이 살짝 위쪽(생각하는 쪽)을 본다
  thinking: { eyes: [[18.4, 21.6], [32.4, 21.6]], eyeR: 1.9, mouth: "M21.8 30h4.4" },
  // 눈이 조금 더 크고 입이 작다
  listening: { eyes: [[17, 23.4], [31, 23.4]], eyeR: 2.3, mouth: "M22.6 29.8q1.4 1.5 2.8 0" },
};

/** 볼(연보라 포인트) */
export const CHEEKS: { cx: number; cy: number; rx: number; ry: number }[] = [
  { cx: 11.6, cy: 28.4, rx: 3.1, ry: 2 },
  { cx: 36.4, cy: 28.4, rx: 3.1, ry: 2 },
];

/** 작은 노트 소품(몸 오른쪽 아래, 살짝 기울임) */
export const NOTEBOOK = { x: 31, y: 31, w: 12, h: 10, r: 1.8, rotate: -10, pivotX: 37, pivotY: 36, lines: ["M34 34.6h6", "M34 37.6h4"] };
