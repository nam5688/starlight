// 사주 계산 엔진 — manseryeok(MIT) 라이브러리를 미유의 계산 기준(policy.ts)에 맞춰 감싼다.
// - 음력은 한국천문연구원(KASI) 기준 한국 음력으로 양력 변환 후 계산
// - 연주는 입춘, 월주는 절기(節) 절입 순간 기준
// - 출생시간을 모르면 시주를 만들지 않는다 (임의의 시간을 넣지 않음)
// - 학파 · 경계에 따라 달라질 수 있는 기둥은 notes로 남긴다
// 독립 교차 검증: engine.check.ts (npm run test:saju)

import {
  calculateFourPillars,
  getEarthlyBranchElement,
  getHeavenlyStemElement,
  isValidSolarDate,
  lunarToSolar,
  solarToLunar,
} from "manseryeok";
import type { FiveElement, LuckInfo, PillarKey, SajuEngine, SajuInput, SajuNote, SajuOk, SajuOptions, SajuPillarData, SajuResult, YinYang } from "./engine.ts";
import { FIVE_ELEMENTS, PILLAR_LABEL } from "./engine.ts";
import { BOUNDARY_MARGIN_MINUTES, SAJU_POLICY } from "./policy.ts";

export const ENGINE_INFO = { name: "manseryeok", version: "2.0.0" } as const;

type Raw = ReturnType<typeof calculateFourPillars>;
type Ymd = { year: number; month: number; day: number };
type Wall = Ymd & { hour: number; minute: number };

const KEYS: PillarKey[] = ["year", "month", "day", "hour"];
const gz = (raw: Raw, key: PillarKey) => raw[key].heavenlyStem + raw[key].earthlyBranch;

function compute(wall: Wall, options: SajuOptions, dayBoundary = options.dayBoundary, gender?: "male" | "female"): Raw {
  const useClock = options.longitude !== null || options.historicalClock || options.equationOfTime;
  return calculateFourPillars({
    ...wall,
    dayBoundary,
    gender,
    trueSolarTime: useClock
      ? {
          longitude: options.longitude ?? 135,
          applyEquationOfTime: options.longitude !== null && options.equationOfTime,
          applyHistoricalDst: options.historicalClock,
        }
      : undefined,
  });
}

/** 벽시계 시각을 분 단위로 옮긴다 (날짜가 넘어가도 정확하게) */
function shift(wall: Wall, minutes: number): Wall {
  const d = new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) + minutes * 60000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

const offsetFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", timeZoneName: "longOffset" });

/** 그 시각 한국 시계의 UTC 차이(분). 1954~61년 510, 서머타임 600 또는 570, 평소 540 */
export function seoulOffsetMinutes(wall: Wall): number {
  const guess = new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) - 9 * 3600000);
  const name = offsetFormat.formatToParts(guess).find((p) => p.type === "timeZoneName")?.value ?? "GMT+09:00";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 540;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

function pillarData(raw: Raw, key: PillarKey): SajuPillarData {
  const p = raw[key];
  const hanja = raw.toHanjaObject()[key].hanja;
  return {
    key,
    stem: p.heavenlyStem,
    branch: p.earthlyBranch,
    stemHanja: hanja[0],
    branchHanja: hanja[1],
    stemElement: raw[`${key}Element`].stem as FiveElement,
    branchElement: raw[`${key}Element`].branch as FiveElement,
    stemYinYang: raw[`${key}YinYang`].stem as YinYang,
    branchYinYang: raw[`${key}YinYang`].branch as YinYang,
    tenGod: raw.tenGods[key],
  };
}

const HANJA_STEM: Record<string, string> = Object.fromEntries([..."갑을병정무기경신임계"].map((c, i) => [c, "甲乙丙丁戊己庚辛壬癸"[i]]));
const HANJA_BRANCH: Record<string, string> = Object.fromEntries([..."자축인묘진사오미신유술해"].map((c, i) => [c, "子丑寅卯辰巳午未申酉戌亥"[i]]));
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

/** 대운 10개. 시작 시점은 출생일 + (절기까지 날수 ÷ 3)년으로 환산한 대략적 시점 */
function luckOf(raw: Raw, birth: Ymd): LuckInfo | null {
  const l = raw.luckPillars;
  if (!l) return null;
  const startMonth = birth.year * 12 + (birth.month - 1) + l.startYears * 12 + l.startMonths;
  return {
    forward: l.forward,
    startAfter: { years: l.startYears, months: l.startMonths, days: l.startDays },
    periods: l.pillars.map((p, i) => {
      const from = startMonth + i * 120;
      const to = from + 120 - 1;
      return {
        age: p.age,
        stem: p.pillar.heavenlyStem,
        branch: p.pillar.earthlyBranch,
        stemHanja: HANJA_STEM[p.pillar.heavenlyStem],
        branchHanja: HANJA_BRANCH[p.pillar.earthlyBranch],
        stemElement: getHeavenlyStemElement(p.pillar.heavenlyStem) as FiveElement,
        branchElement: getEarthlyBranchElement(p.pillar.earthlyBranch) as FiveElement,
        from: ym(Math.floor(from / 12), (from % 12) + 1),
        to: ym(Math.floor(to / 12), (to % 12) + 1),
      };
    }),
  };
}

/** 같은 입력을 다른 조건으로 계산했을 때 달라지는 기둥 */
function diff(main: Raw, other: Raw, keys: PillarKey[]): Partial<Record<PillarKey, string>> {
  const out: Partial<Record<PillarKey, string>> = {};
  for (const k of keys) if (gz(main, k) !== gz(other, k)) out[k] = gz(other, k);
  return out;
}

const listPillars = (alt: Partial<Record<PillarKey, string>>) =>
  KEYS.filter((k) => alt[k]).map((k) => `${PILLAR_LABEL[k]} ${alt[k]}`).join(", ");

/** 입력 날짜를 양력으로 확정한다. 존재하지 않는 음력 날짜는 이유를 알려준다 */
export function resolveSolarDate(input: Pick<SajuInput, "year" | "month" | "day" | "calendar" | "isLeapMonth">): { ok: true; date: Ymd } | { ok: false; message: string } {
  const { year, month, day } = input;
  if (input.calendar === "solar") {
    return isValidSolarDate(year, month, day) ? { ok: true, date: { year, month, day } } : { ok: false, message: "존재하지 않는 날짜입니다." };
  }
  const leap = input.isLeapMonth;
  try {
    return { ok: true, date: lunarToSolar(year, month, day, leap) };
  } catch {
    try {
      lunarToSolar(year, month, 1, leap);
    } catch {
      return {
        ok: false,
        message: leap ? `${year}년에는 음력 윤${month}월이 없습니다. 윤달이 아니라면 ‘윤달’ 선택을 해제해 주세요.` : "음력 날짜를 확인해 주세요.",
      };
    }
    let last = 29;
    try {
      lunarToSolar(year, month, 30, leap);
      last = 30;
    } catch {
      /* 29일까지 있는 달 */
    }
    return { ok: false, message: `음력 ${year}년 ${leap ? "윤" : ""}${month}월은 ${last}일까지 있습니다.` };
  }
}

function parseTime(t: string | null): { hour: number; minute: number } | null {
  const m = t ? /^(\d{2}):(\d{2})$/.exec(t) : null;
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

export function calculateSaju(input: SajuInput, options: SajuOptions = SAJU_POLICY): SajuResult {
  const resolved = resolveSolarDate(input);
  if (!resolved.ok) return { status: "invalid", message: resolved.message };
  const solar = resolved.date;
  const time = parseTime(input.birthTime);
  const gender = input.gender === "male" || input.gender === "female" ? input.gender : undefined;
  const notes: SajuNote[] = [];

  let main: Raw;
  let keys: PillarKey[];
  try {
    if (time) {
      const wall: Wall = { ...solar, ...time };
      main = compute(wall, options, options.dayBoundary, gender);
      keys = KEYS;

      // 자시 관법: 다른 관법으로 계산했을 때 일주·시주가 달라지면 알린다
      const otherSchool = options.dayBoundary === "jasi" ? "splitJasi" : "jasi";
      const school = diff(main, compute(wall, options, otherSchool), ["day", "hour"]);
      if (Object.keys(school).length > 0) {
        notes.push({
          kind: "jasi-school",
          pillars: KEYS.filter((k) => school[k]),
          message: `밤 11시~자정(보정 후)에 태어나 학파에 따라 일주가 달라집니다. 미유는 ${
            options.dayBoundary === "jasi" ? "자시부터 다음 날로" : "자정부터 다음 날로"
          } 보며, 다른 관법으로는 ${listPillars(school)}입니다.`,
          alternative: school,
        });
      }

      // 시주 · 절기 경계 근처: 몇 분만 달라도 바뀌는 기둥
      const near: Partial<Record<PillarKey, string>> = {};
      for (const delta of [-BOUNDARY_MARGIN_MINUTES, BOUNDARY_MARGIN_MINUTES]) {
        Object.assign(near, diff(main, compute(shift(wall, delta), options), KEYS));
      }
      for (const k of Object.keys(school) as PillarKey[]) if (near[k] === school[k]) delete near[k];
      if (Object.keys(near).length > 0) {
        const jeolgi = near.month || near.year;
        notes.push({
          kind: "near-boundary",
          pillars: KEYS.filter((k) => near[k]),
          message: `${jeolgi ? "절기가 바뀌는 시각" : "시주가 바뀌는 시각"}과 ${BOUNDARY_MARGIN_MINUTES}분 이내라, 출생시간이 조금만 달라도 ${listPillars(near)}이 될 수 있습니다.`,
          alternative: near,
        });
      }

      // 당시 한국 시계가 지금과 달랐던 기간 (서머타임, UTC+8:30)
      const offset = seoulOffsetMinutes(wall);
      if (options.historicalClock && offset !== 540) {
        notes.push({
          kind: "historical-clock",
          pillars: [],
          message:
            offset > 540
              ? `${solar.year}년 당시 서머타임이 시행돼 시계가 ${offset - 540}분 빨랐던 기간이라, 이를 빼고 계산했습니다.`
              : `${solar.year}년 당시 한국 표준시가 지금과 달랐던(UTC+${Math.floor(offset / 60)}:${String(offset % 60).padStart(2, "0")}) 기간이라, 이를 반영해 계산했습니다.`,
        });
      }
    } else {
      // 출생시간 모름: 날짜 기준 일주, 시주 없음. 태어난 날에 절기가 바뀌면 연주·월주 후보를 함께 남긴다
      main = compute({ ...solar, hour: 12, minute: 0 }, options, "midnight", gender);
      keys = ["year", "month", "day"];
      notes.push({ kind: "hour-unknown", pillars: ["hour"], message: "출생시간을 몰라 시주 없이 연주 · 월주 · 일주 세 기둥으로 계산했습니다." });
      const early = compute({ ...solar, hour: 0, minute: 0 }, options, "midnight");
      const late = compute({ ...solar, hour: 23, minute: 59 }, options, "midnight");
      const alt = { ...diff(main, early, ["year", "month"]), ...diff(main, late, ["year", "month"]) };
      if (Object.keys(alt).length > 0) {
        notes.push({
          kind: "jeolgi-day",
          pillars: KEYS.filter((k) => alt[k]),
          message: `태어난 날에 절기가 바뀌어, 태어난 시각에 따라 ${listPillars(alt)}일 수 있습니다. 출생시간을 알면 확정할 수 있습니다.`,
          alternative: alt,
        });
      }
    }
  } catch {
    return { status: "invalid", message: "계산할 수 없는 날짜입니다. 생년월일을 확인해 주세요." };
  }

  const pillars = keys.map((k) => pillarData(main, k));
  const elementCounts = Object.fromEntries(FIVE_ELEMENTS.map((e) => [e, 0])) as Record<FiveElement, number>;
  for (const p of pillars) {
    elementCounts[p.stemElement] += 1;
    elementCounts[p.branchElement] += 1;
  }
  const day = pillars.find((p) => p.key === "day")!;
  const lunar = solarToLunar(solar.year, solar.month, solar.day);

  const result: SajuOk = {
    status: "ok",
    engine: { ...ENGINE_INFO },
    options: { ...options },
    solarDate: solar,
    lunarDate: { year: lunar.year, month: lunar.month, day: lunar.day, isLeapMonth: lunar.isLeapMonth },
    birthTime: time ? input.birthTime : null,
    pillars,
    hourPillarOmitted: !time,
    dayMaster: { stem: day.stem, stemHanja: day.stemHanja, element: day.stemElement, yinYang: day.stemYinYang },
    elementCounts,
    voidBranches: [...main.voidBranches],
    luck: luckOf(main, solar),
    notes,
  };
  return result;
}

export const manseryeokEngine: SajuEngine = {
  async calculate(input) {
    return calculateSaju(input);
  },
};

/** 입력 단계용: 존재하지 않는 음력 날짜 · 미래 날짜를 미리 알려준다 (문제가 없으면 null) */
export function birthDateError(input: Pick<SajuInput, "year" | "month" | "day" | "calendar" | "isLeapMonth">, today: Date): string | null {
  const resolved = resolveSolarDate(input);
  if (!resolved.ok) return resolved.message;
  const { year, month, day } = resolved.date;
  return new Date(year, month - 1, day) > today ? "오늘 이후 날짜는 입력할 수 없습니다." : null;
}
