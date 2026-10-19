// 출생 시각을 모르는 리포트의 시기 표기 — 가벼운 도구 모음(React · Next · 만세력 엔진을 불러오지 않는다. 대화 화면 같은 클라이언트 코드도 쓴다).
// 시각을 모르면 대운이 바뀌는 달이 달라질 수 있어(근거 `saju.hour.unknown`) 고객에게는 연도 "무렵"만 보이고 달 · 시작한 지 몇 개월은 단정하지 않는다.
// 저장된 글 · 근거 · 내부 계산값은 바꾸지 않는다. 보이는 방식만 정한다.
import type { IntegratedReadingReport } from "./types.ts";

/** 출생 시각을 모르는 리포트인가 — 원국 표의 시주가 "모름"이거나 근거에 시각 미상 안내가 있으면 */
export function isHourUnknown(report: Pick<IntegratedReadingReport, "saju" | "generated">): boolean {
  const s = report.saju;
  if (s && s.status === "computed" && s.pillars.some((p) => p.position === "시주" && p.unknown)) return true;
  return (report.generated?.evidence ?? []).some((e) => e.id === "saju.hour.unknown");
}

/** "2022.12" · "2022-12" 꼴의 연-월 표기를 연도 무렵으로 바꾼다(글 전체에서 찾아 바꾼다) — 이미 저장된 요약 카드의 기간 줄에도 쓴다 */
export function softenMonths(text: string): string {
  return text.replace(/(\d{4})[.-](0[1-9]|1[0-2])(?!\d)/g, "$1년 무렵");
}
