// 사주(만세력) 계산 모듈의 약속.
// AI가 생년월일만 보고 원국을 지어내지 않도록, 원국은 반드시 이 엔진의 계산 결과만 사용한다.
// 구현: manseryeok-engine.ts (엔진 선택 근거와 계산 기준은 docs/saju-engine.md)

export type SajuInput = {
  /** 입력한 그대로의 날짜 (음력이면 음력 날짜) */
  year: number;
  month: number;
  day: number;
  calendar: "solar" | "lunar";
  isLeapMonth: boolean;
  /** "HH:MM" (한국 시계 기준). 모르면 null — 임의의 시간을 넣지 않는다 */
  birthTime: string | null;
  /** 대운 방향을 정하는 전통 규칙에 필요. 없으면 대운을 계산하지 않는다 */
  gender?: "male" | "female" | null;
};

export type FiveElement = "목" | "화" | "토" | "금" | "수";
export type YinYang = "양" | "음";
export type PillarKey = "year" | "month" | "day" | "hour";

export const PILLAR_LABEL: Record<PillarKey, string> = { year: "년주", month: "월주", day: "일주", hour: "시주" };
export const FIVE_ELEMENTS: FiveElement[] = ["목", "화", "토", "금", "수"];

export type SajuPillarData = {
  key: PillarKey;
  /** 한글 읽기 (예: 갑, 자) */
  stem: string;
  branch: string;
  /** 한자 (예: 甲, 子) */
  stemHanja: string;
  branchHanja: string;
  stemElement: FiveElement;
  branchElement: FiveElement;
  stemYinYang: YinYang;
  branchYinYang: YinYang;
  /** 일간 기준 십신. 일주 천간은 "일간" */
  tenGod: { stem: string; branch: string };
};

/**
 * 계산 기준에 따라 결과가 달라질 수 있는 경우의 안내.
 * 확실하지 않은 기둥을 확실한 것처럼 보여주지 않기 위해 남긴다.
 */
export type SajuNote = {
  kind: "hour-unknown" | "jeolgi-day" | "near-boundary" | "jasi-school" | "historical-clock";
  /** 영향을 받는 기둥 */
  pillars: PillarKey[];
  message: string;
  /** 다른 경우의 간지 (한글) */
  alternative?: Partial<Record<PillarKey, string>>;
};

export type SajuOptions = {
  /** 밤 11시~자정(보정 후) 출생의 일주: jasi=다음 날, splitJasi=당일(야자시), midnight=당일 */
  dayBoundary: "jasi" | "splitJasi" | "midnight";
  /** 지방시 보정 경도(동경). null이면 보정하지 않는다 (한국 표준시 그대로) */
  longitude: number | null;
  /** 균시차 보정 여부 */
  equationOfTime: boolean;
  /** 과거 표준시(1954~61 UTC+8:30)·서머타임 반영 여부 */
  historicalClock: boolean;
};

/** 대운 — 10년 단위 흐름. 순행/역행은 연간 음양과 성별로 정해지고, 시작 시점은 가까운 절기까지의 날수로 정한다 */
export type LuckPeriod = {
  /** 대운수 (전통 표기) */
  age: number;
  stem: string;
  branch: string;
  stemHanja: string;
  branchHanja: string;
  stemElement: FiveElement;
  branchElement: FiveElement;
  /** 시작 · 끝 (양력 연-월, 대략적 시점) */
  from: string;
  to: string;
};

export type LuckInfo = {
  forward: boolean;
  /** 출생부터 첫 대운까지 (3일 = 1년 환산) */
  startAfter: { years: number; months: number; days: number };
  periods: LuckPeriod[];
};

export type SajuOk = {
  status: "ok";
  engine: { name: string; version: string };
  options: SajuOptions;
  solarDate: { year: number; month: number; day: number };
  lunarDate: { year: number; month: number; day: number; isLeapMonth: boolean };
  birthTime: string | null;
  /** 년 · 월 · 일 · (시) 순서. 출생시간을 모르면 시주 없이 세 개 */
  pillars: SajuPillarData[];
  hourPillarOmitted: boolean;
  dayMaster: { stem: string; stemHanja: string; element: FiveElement; yinYang: YinYang };
  /** 원국 글자(천간·지지)의 오행 개수. 지장간은 학파마다 달라 넣지 않는다 */
  elementCounts: Record<FiveElement, number>;
  /** 공망 (일주 기준) */
  voidBranches: string[];
  /** 입력한 성별 — 대운 순서와 전통 해석의 배우자 별(여성 관성 · 남성 재성) 기준으로 쓴다. 입력하지 않았거나 답하지 않았으면 없다(이전에 저장된 결과도 없다) */
  gender?: "male" | "female";
  /** 성별을 받은 경우에만 */
  luck: LuckInfo | null;
  notes: SajuNote[];
};

/** 저장된 계산 결과에서 입력한 성별을 꺼낸다 (이전에 저장된 결과 · 답하지 않은 경우는 null) */
export const genderOfSaju = (saju: SajuResult): "male" | "female" | null => (saju.status === "ok" ? saju.gender ?? null : null);

export type SajuResult =
  | { status: "not-connected" }
  /** 존재하지 않는 음력 날짜 등 계산할 수 없는 입력 */
  | { status: "invalid"; message: string }
  | SajuOk;

export interface SajuEngine {
  calculate(input: SajuInput): Promise<SajuResult>;
}

/** 엔진을 쓰지 않는 자리(테스트 등)용 — 항상 "not-connected" */
export const notConnectedSajuEngine: SajuEngine = {
  async calculate() {
    return { status: "not-connected" };
  },
};
