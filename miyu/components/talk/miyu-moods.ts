// 안내 캐릭터 "미유"의 그림 — 운영자가 보낸 구름 모양 캐릭터(2026-10-17)를 상담 주제마다 색만 다르게 쓴다.
// 형태 · 눈 · 질감 · 몸 크기는 다섯 장 모두 같고 색(과 보내 준 그대로의 눈 모양)만 다르다. 다시 그리거나 색을 고치지 않는다.
//   main    연두(대표) — 종합 분석 · 메인 · MY · 안내 화면
//   love    핑크(윙크 + 하트) — 연애 · 결혼 · 궁합 전용. 다른 영역에서는 쓰지 않는다
//   counsel 라벤더(웃는 눈) — 고민 상담
//   work    버터 옐로 — 일 · 진로 · 재물
//   flow    하늘 · 민트 — 오늘의 운세 · 올해의 흐름
// 그림 파일은 `miyu/public/miyu/char-<이름>.png`(100px 정사각형, 흰 바탕 — 운영자가 보낸 128px 그림을 같은 자리로 잘랐다). 원본 해상도 파일이 오면 같은 이름으로 덮어쓴다.
// 이전 여우 캐릭터 그림(표정 9가지)은 `docs/samples/character-fox-v1/`에 보관했다(쓰지 않는다).
// 새 캐릭터는 주제(색)마다 그림이 하나뿐이라 표정(mood)이 그림을 바꾸지 않는다 — 표정 그림을 더 받으면 이 파일에서 (tone, mood)로 고르게 넓힌다.
import type { RoomId, TalkMood } from "@/lib/report/reading/talk-room";

export type MiyuMood = TalkMood;
export type MiyuTone = "main" | "love" | "counsel" | "work" | "flow";

export const MIYU_IMAGES: Record<MiyuTone, string> = {
  main: "/miyu/char-main.png",
  love: "/miyu/char-love.png",
  counsel: "/miyu/char-counsel.png",
  work: "/miyu/char-work.png",
  flow: "/miyu/char-flow.png",
};

/** 상담방마다 쓰는 캐릭터 색 — 결혼 방은 연애와 같은 가까운 관계 영역이라 핑크로 묶었다(운영자 확인 항목) */
export const ROOM_TONE: Record<RoomId, MiyuTone> = {
  main: "main",
  daily: "flow",
  year: "flow",
  love: "love",
  marriage: "love",
  career: "work",
  money: "work",
  concern: "counsel",
};

export const toneOfRoom = (room: RoomId): MiyuTone => ROOM_TONE[room];
