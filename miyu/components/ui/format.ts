// 화면에 쓰는 날짜 · 시간 표시 (한국 시간 기준).

/** 예: 2026년 10월 13일 14:05 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}년 ${get("month")} ${get("day")}일 ${get("hour")}:${get("minute")}`;
}

/** 예: 2026. 10. 13. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}
