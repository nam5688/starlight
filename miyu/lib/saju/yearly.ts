// 세운(해마다의 간지)과 월운(절기 기준 달의 간지). 연간 · 오늘 운세의 기준 자료.
// 같은 기간을 다시 열어도 결과가 바뀌지 않도록 날짜만으로 정해지는 값만 계산한다 (한국 시간 기준).

import { calculateFourPillars, getEarthlyBranchElement, getHeavenlyStemElement, getSolarTermsOfYear } from "manseryeok";
import type { FiveElement } from "./engine.ts";

export type Ganji = { stem: string; branch: string; stemElement: FiveElement; branchElement: FiveElement };

type Stem = Parameters<typeof getHeavenlyStemElement>[0];
type Branch = Parameters<typeof getEarthlyBranchElement>[0];

const ganji = (p: { heavenlyStem: Stem; earthlyBranch: Branch }): Ganji => ({
  stem: p.heavenlyStem,
  branch: p.earthlyBranch,
  stemElement: getHeavenlyStemElement(p.heavenlyStem) as FiveElement,
  branchElement: getEarthlyBranchElement(p.earthlyBranch) as FiveElement,
});

/** 그 해의 세운 (입춘 이후 기준) */
export function yearGanji(year: number): Ganji {
  return ganji(calculateFourPillars({ year, month: 7, day: 1, hour: 12, minute: 0 }).year);
}

/** 그 날의 일진 (한국 날짜 기준) */
export function dayGanji(date: { year: number; month: number; day: number }): Ganji {
  return ganji(calculateFourPillars({ ...date, hour: 12, minute: 0 }).day);
}

export type MonthPeriod = Ganji & {
  /** 절입 시각 (UTC ISO) — 이 시각부터 다음 절입 전까지가 그 달 */
  starts: string;
  termName: string;
};

/** 그 해 입춘부터 다음 해 입춘 전까지 12개 달의 월운 */
export function monthPeriods(year: number): MonthPeriod[] {
  const jie = [...getSolarTermsOfYear(year), ...getSolarTermsOfYear(year + 1)]
    .filter((t) => t.index % 2 === 0)
    .filter((t) => new Date(t.date) >= new Date(getSolarTermsOfYear(year)[2].date))
    .slice(0, 12);
  return jie.map((t) => {
    const at = new Date(new Date(t.date).getTime() + 9 * 3600000 + 60 * 60000); // 절입 1시간 뒤 (한국 시각)
    const p = calculateFourPillars({ year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate(), hour: at.getUTCHours(), minute: at.getUTCMinutes() });
    return { ...ganji(p.month), starts: new Date(t.date).toISOString(), termName: t.name };
  });
}
