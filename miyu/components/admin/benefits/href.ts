// 혜택 관리자 화면의 주소 · 입력 값 읽기 — 순수 함수(React · Next 없음).
// 서버 동작(app/admin/benefits/actions.ts)이 돌아올 때 쓰는 `tab` 값은 탭 이름이거나 설정 그룹 이름이다.

export const BENEFIT_TABS = [
  { key: "overview", label: "개요" },
  { key: "switch", label: "스위치 · 설정" },
  { key: "coupons", label: "쿠폰" },
  { key: "referral", label: "추천" },
  { key: "finance", label: "손익" },
] as const;

export type BenefitTabKey = (typeof BENEFIT_TABS)[number]["key"];

/** 설정 화면(스위치 · 설정 탭) 하나에 묶어 보이는 그룹 이름들 — 설정을 바꾼 뒤 서버 동작이 이 이름으로 돌아온다 */
const SETTINGS_TAB_NAMES = ["switch", "earn", "point", "credit", "risk", "review", "retention"];

/**
 * `?tab=` 값을 탭으로 바꾼다. 설정 그룹 이름(earn · point · credit · risk · review · retention)은 설정 화면으로 보낸다.
 * 단 `referral`은 탭 이름이자 설정 그룹 이름이라 추천 탭으로 열리고, 그 탭 아래에도 추천 설정을 같이 둔다.
 */
export function resolveTab(raw: string | undefined): BenefitTabKey {
  if (raw === "overview" || raw === "coupons" || raw === "referral" || raw === "finance" || raw === "switch") return raw;
  if (raw && SETTINGS_TAB_NAMES.includes(raw)) return "switch";
  return "overview";
}

export type SearchParamsLike = Record<string, string | string[] | undefined>;

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** 화면 안의 링크를 만들 때 쓰는 현재 주소 정보 */
export type BenefitsNav = {
  /** 이 화면의 주소(예: /admin/benefits) */
  basePath: string;
  /** 모든 링크에 늘 붙는 값(개발용 미리보기의 state 같은 것) */
  carry: Record<string, string>;
  /** 지금 주소의 값(tab · days · month · buyers · refShare · other) — 탭 링크에는 붙지 않는다 */
  query: Record<string, string>;
};

/** 현재 주소 값에 patch를 덮어 만든 링크(null이면 그 값을 뺀다) */
export function hrefTo(nav: BenefitsNav, patch: Record<string, string | number | null>): string {
  const merged: Record<string, string> = { ...nav.carry, ...nav.query };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete merged[k];
    else merged[k] = String(v);
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `${nav.basePath}?${qs}` : nav.basePath;
}

export function tabHref(nav: BenefitsNav, key: BenefitTabKey): string {
  const qs = new URLSearchParams({ ...nav.carry, tab: key }).toString();
  return `${nav.basePath}?${qs}`;
}

export const DAY_CHOICES = [7, 30, 90] as const;

export function parseDays(v: string | undefined): number {
  const n = Number(v);
  return (DAY_CHOICES as readonly number[]).includes(n) ? n : 30;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 한국 시간 기준 이번 달(YYYY-MM) */
export function monthOfKst(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

export function parseMonth(v: string | undefined, fallback: string): string {
  return v && MONTH_RE.test(v) && Number(v.slice(0, 4)) >= 2020 ? v : fallback;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export type ScenarioInput = { monthlyBuyers: number; referralShare: number; otherIncomeKrw: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 연 세후 전망 입력 읽기 — 비었거나 잘못된 값은 기본값, 범위를 넘으면 범위 안으로 맞춘다 */
export function parseScenario(params: { buyers?: string; refShare?: string; other?: string }, defaults: ScenarioInput): ScenarioInput {
  const num = (raw: string | undefined, fallback: number) => {
    if (raw === undefined || raw.trim() === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    monthlyBuyers: Math.round(clamp(num(params.buyers, defaults.monthlyBuyers), 0, 100_000)),
    referralShare: clamp(num(params.refShare, defaults.referralShare), 0, 1),
    otherIncomeKrw: Math.round(clamp(num(params.other, defaults.otherIncomeKrw), 0, 100_000_000_000)),
  };
}
