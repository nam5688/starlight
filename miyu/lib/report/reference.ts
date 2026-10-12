// 시기 해석의 기준 날짜 — 한국 날짜 기준 연 · 월
export function seoulReference(d: Date): { year: number; month: number; iso: string } {
  const s = new Date(d.getTime() + 9 * 3600000);
  return { year: s.getUTCFullYear(), month: s.getUTCMonth() + 1, iso: s.toISOString().slice(0, 10) };
}
