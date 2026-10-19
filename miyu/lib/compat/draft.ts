// 궁합 입력 임시 보관 — 새로고침 · 뒤로 가기로 입력이 사라지지 않게 이 브라우저 탭(sessionStorage)에만 둔다(기존 분석 입력과 같은 방식, lib/profile/draft.ts).
// 서버로 보내지 않고, 탭을 닫으면 지워지며, "입력 지우기" · "다른 두 사람으로 다시 보기" · 결제로 넘어갈 때 지운다.
// 이름 · 생년월일 · 성별 · 사이가 들어 있으므로 분석 입력(6시간)보다 짧게 1시간만 둔다. 오래된 것과 형식이 맞지 않는 것은 읽을 때 버린다.
import { isCompatGender, parseRelationship, type CompatGender, type CompatRelationship } from "./relationship.ts";
import { EMPTY_COMPAT_PERSON, parseCompatPerson, type CompatPersonInput } from "./simple.ts";

export const COMPAT_DRAFT_KEY = "miyu-compat-draft";
export const COMPAT_BUY_DRAFT_KEY = "miyu-compat-buy-draft";
export const COMPAT_DRAFT_VERSION = 1;
export const COMPAT_DRAFT_MAX_AGE_MS = 3600_000;

export type CompatFormDraft = { a: CompatPersonInput; b: CompatPersonInput; relationship: "" | CompatRelationship };
export type CompatBuyDraft = { partner: CompatPersonInput; myGender: "" | CompatGender; relationship: "" | CompatRelationship };

const same = (p: CompatPersonInput) => (Object.keys(EMPTY_COMPAT_PERSON) as (keyof CompatPersonInput)[]).every((k) => p[k] === EMPTY_COMPAT_PERSON[k]);

/** 무엇이든 입력했는지 — 빈 상태는 보관하지 않는다 */
export const hasCompatDraftContent = (d: CompatFormDraft): boolean => !same(d.a) || !same(d.b) || d.relationship !== "";
export const hasBuyDraftContent = (d: CompatBuyDraft): boolean => !same(d.partner) || d.myGender !== "" || d.relationship !== "";

const envelope = (data: unknown, now: number) => JSON.stringify({ v: COMPAT_DRAFT_VERSION, savedAt: now, data });

function open(raw: string | null, now: number): Record<string, unknown> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const e = parsed as Record<string, unknown>;
  if (e.v !== COMPAT_DRAFT_VERSION || typeof e.savedAt !== "number" || now - e.savedAt > COMPAT_DRAFT_MAX_AGE_MS || e.savedAt > now + 60_000) return null;
  return typeof e.data === "object" && e.data !== null ? (e.data as Record<string, unknown>) : null;
}

/** 형식이 맞지 않는 사람은 빈 입력으로 — 알 수 없는 값을 특정 값으로 바꾸지 않는다 */
const personOf = (raw: unknown): CompatPersonInput => parseCompatPerson(raw) ?? { ...EMPTY_COMPAT_PERSON };
const genderOf = (raw: unknown): "" | CompatGender => (isCompatGender(raw) ? raw : "");
const relOf = (raw: unknown): "" | CompatRelationship => parseRelationship(raw) ?? "";

export const serializeCompatDraft = (d: CompatFormDraft, now: number): string => envelope(d, now);
export function parseCompatDraft(raw: string | null, now: number): CompatFormDraft | null {
  const d = open(raw, now);
  if (!d) return null;
  const out: CompatFormDraft = { a: personOf(d.a), b: personOf(d.b), relationship: relOf(d.relationship) };
  return hasCompatDraftContent(out) ? out : null;
}

export const serializeBuyDraft = (d: CompatBuyDraft, now: number): string => envelope(d, now);
export function parseBuyDraft(raw: string | null, now: number): CompatBuyDraft | null {
  const d = open(raw, now);
  if (!d) return null;
  const out: CompatBuyDraft = { partner: personOf(d.partner), myGender: genderOf(d.myGender), relationship: relOf(d.relationship) };
  return hasBuyDraftContent(out) ? out : null;
}
