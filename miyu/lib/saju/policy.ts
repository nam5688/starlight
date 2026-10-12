// 미유의 사주 계산 기준. 바꾸면 이후에 저장되는 결과부터 적용되고, 저장된 결과에는 당시 기준이 함께 남는다.
// 근거와 대안은 docs/saju-engine.md

import type { SajuOptions } from "./engine.ts";

export const SAJU_POLICY: SajuOptions = {
  // 자시(보정 후 23:00)부터 다음 날 일주로 본다. 학파에 따라 달라지는 경우는 결과에 안내를 남긴다.
  dayBoundary: "jasi",
  // 출생지를 받지 않으므로 한반도 평균 경도(동경 127.5°)로 보정한다 → 한국 표준시보다 30분 늦게 본다.
  longitude: 127.5,
  // 균시차는 국내 만세력에서 잘 쓰지 않아 끈다 (켜면 시기에 따라 ±16분 달라져 다른 만세력과 어긋난다).
  equationOfTime: false,
  // 1954~61년 표준시(UTC+8:30), 1948~51 · 1955~60 · 1987~88년 서머타임을 반영한다 (IANA 시간대 자료).
  historicalClock: true,
};

/** 시주 · 절기 경계 근처로 보는 범위(분). 이 안이면 몇 분 차이로 기둥이 바뀔 수 있다고 안내한다 */
export const BOUNDARY_MARGIN_MINUTES = 10;

export function describePolicy(o: SajuOptions): string[] {
  const lines = [
    o.longitude === null
      ? "한국 표준시 그대로 계산"
      : `지방시 보정: 동경 ${o.longitude}° 기준 (한국 표준시보다 ${Math.round((135 - o.longitude) * 4)}분 늦게)`,
    o.dayBoundary === "jasi"
      ? "밤 11시(보정 후)부터 다음 날 일주"
      : o.dayBoundary === "splitJasi"
        ? "밤 11시~자정(보정 후)은 당일 일주 · 다음 날 시간 천간 (야자시)"
        : "자정부터 다음 날 일주",
  ];
  if (o.historicalClock) lines.push("과거 표준시·서머타임 반영");
  if (o.equationOfTime) lines.push("균시차 보정");
  return lines;
}
