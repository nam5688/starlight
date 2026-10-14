// 안내 캐릭터 "미유"의 표정 그림 — 운영자가 보낸 캐릭터 시트(시트의 이름은 포비였지만 서비스에서는 "미유")에서
// 표정 시트 6가지(기본 · 웃는 얼굴 · 놀람 · 생각 중 · 장난기 · 걱정)와 액션 포즈 3가지(손 흔들기 · 안경을 올리는 자세 · 아하! 이해했어요!)를
// 그림 그대로 잘라 쓴다(`miyu/public/miyu/*.webp`, 256px 정사각형). 다시 그리거나 고치지 않는다.
// 어떤 상황에 어떤 표정을 짓는지는 lib/report/reading/talk-room.ts가 이름으로 정하고, 이 파일은 이름 → 그림 파일만 안다.
// 원본 그림으로 바꾸려면 같은 이름의 파일을 public/miyu/에 덮어쓴다(정사각형 · WebP/PNG 권장).
import type { TalkMood } from "@/lib/report/reading/talk-room";

export type MiyuMood = TalkMood;

export const MIYU_IMAGES: Record<MiyuMood, string> = {
  basic: "/miyu/basic.webp",
  happy: "/miyu/happy.webp",
  surprised: "/miyu/surprised.webp",
  thinking: "/miyu/thinking.webp",
  playful: "/miyu/playful.webp",
  worried: "/miyu/worried.webp",
  wave: "/miyu/wave.webp",
  glasses: "/miyu/glasses.webp",
  aha: "/miyu/aha.webp",
};
