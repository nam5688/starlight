// 간단 궁합(무료) — 두 사람의 출생정보로 사주 궁합 엔진(lib/saju/interpret/compat.ts)을 한 번 돌려, 같은 결과의 대표 한 장(커플 유형 · 총점 · 핵심 한 줄 · 읽힌 점)만 만든다.
// 무료와 유료(사주 궁합)가 같은 엔진의 같은 결과를 쓰므로 무료에서 본 것과 유료에서 읽는 것이 어긋나지 않는다 — 이 카드는 그 결과의 일부일 뿐 따로 계산하지 않는다.
// 입력한 생년월일 · 닉네임은 계산하는 동안만 쓰고 저장하지 않는다. 카드에는 생년월일이 없다(닉네임은 사용자가 보려고 쓴 이름이라 결과 제목에만 쓴다).
import type { SajuOk } from "../saju/engine.ts";
import { COMPAT_EXPLAIN, compatOf, type CompatResult } from "../saju/interpret/compat.ts";
import { birthDateError, calculateSaju } from "../saju/manseryeok-engine.ts";

export const COMPAT_NICKNAME_MAX = 10;

export type CompatPersonInput = {
  nickname: string;
  calendar: "solar" | "lunar";
  isLeapMonth: boolean;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  birthTime: string;
  birthTimeUnknown: boolean;
};

export const EMPTY_COMPAT_PERSON: CompatPersonInput = { nickname: "", calendar: "solar", isLeapMonth: false, birthYear: "", birthMonth: "", birthDay: "", birthTime: "", birthTimeUnknown: false };

export type CompatPersonErrors = Partial<Record<"nickname" | "birthDate" | "birthTime", string>>;

const isString = (v: unknown): v is string => typeof v === "string";

/** 브라우저에서 온 값을 입력 형식으로 읽는다 — 형식이 다르면 null */
export function parseCompatPerson(raw: unknown): CompatPersonInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isString(r.nickname) || !isString(r.birthYear) || !isString(r.birthMonth) || !isString(r.birthDay) || !isString(r.birthTime)) return null;
  if (r.calendar !== "solar" && r.calendar !== "lunar") return null;
  if (typeof r.isLeapMonth !== "boolean" || typeof r.birthTimeUnknown !== "boolean") return null;
  return {
    nickname: r.nickname.slice(0, 40),
    calendar: r.calendar,
    isLeapMonth: r.isLeapMonth,
    birthYear: r.birthYear.slice(0, 8),
    birthMonth: r.birthMonth.slice(0, 4),
    birthDay: r.birthDay.slice(0, 4),
    birthTime: r.birthTime.slice(0, 8),
    birthTimeUnknown: r.birthTimeUnknown,
  };
}

/** 제어 문자 · 보이지 않는 글자(너비 없는 공백 · 줄 구분자)는 이름에 남기지 않는다 */
const isInvisible = (ch: string): boolean => {
  const c = ch.codePointAt(0)!;
  return c <= 0x1f || c === 0x7f || (c >= 0x200b && c <= 0x200f) || c === 0x2028 || c === 0x2029;
};

/** 제목에 보이는 이름 — 제어 문자를 지우고 글자 수를 제한한다. 비어 있으면 fallback */
export function cleanNickname(raw: string, fallback: string): string {
  const visible = [...raw].filter((ch) => !isInvisible(ch)).join("").trim();
  const cleaned = [...visible].slice(0, COMPAT_NICKNAME_MAX).join("").trim();
  return cleaned || fallback;
}

const sajuInputOf = (p: CompatPersonInput) => ({
  year: Number(p.birthYear),
  month: Number(p.birthMonth),
  day: Number(p.birthDay),
  calendar: p.calendar,
  isLeapMonth: p.calendar === "lunar" && p.isLeapMonth,
  birthTime: p.birthTimeUnknown ? null : p.birthTime,
});

/** today는 호출하는 쪽이 넘긴다 — 날짜가 없거나 존재하지 않거나 미래이면 이유를 알려 준다 */
export function validateCompatPerson(p: CompatPersonInput, today: Date): CompatPersonErrors {
  const errors: CompatPersonErrors = {};
  if ([...p.nickname.trim()].length > COMPAT_NICKNAME_MAX) errors.nickname = `이름은 ${COMPAT_NICKNAME_MAX}자 이내로 입력해 주세요.`;
  const y = Number(p.birthYear);
  const m = Number(p.birthMonth);
  const d = Number(p.birthDay);
  if (!p.birthYear || !p.birthMonth || !p.birthDay) errors.birthDate = "생년월일을 모두 입력해 주세요.";
  else if (!/^\d{4}$/.test(p.birthYear) || y < 1900 || y > today.getFullYear()) errors.birthDate = `태어난 해는 1900년부터 ${today.getFullYear()}년 사이로 입력해 주세요.`;
  else if (!/^\d{1,2}$/.test(p.birthMonth) || !/^\d{1,2}$/.test(p.birthDay) || m < 1 || m > 12 || d < 1 || d > 31) errors.birthDate = "존재하지 않는 날짜예요.";
  else if (p.calendar === "lunar" && d > 30) errors.birthDate = "음력 날짜는 30일까지 입력할 수 있어요.";
  else {
    const e = birthDateError(sajuInputOf(p), today);
    if (e) errors.birthDate = e;
  }
  if (!p.birthTimeUnknown && !/^\d{2}:\d{2}$/.test(p.birthTime)) errors.birthTime = "출생시간을 입력하거나 ‘출생시간을 몰라요’를 선택해 주세요.";
  return errors;
}

export type SimpleCompatCard = {
  version: string;
  names: { a: string; b: string };
  typeName: string;
  typeLine: string;
  score: number;
  scoreMeaning: string;
  /** 우리 커플 핵심 한 줄 */
  core: string;
  /** 커플 유형 설명 두 문장 */
  explain: [string, string];
  /** 읽힌 점 — 잘 맞는 곳 · 맞춰 볼 곳(각 두 줄까지) · 움직이는 속도 */
  good: string[];
  care: string[];
  pace: string;
  /** 총점이 무엇으로 계산됐는지 — 재료 이름과 방향(숫자 없이) */
  basis: { label: string; direction: string }[];
  cautions: string[];
  notes: { scoreBasis: string; scoreNotProbability: string; tradition: string };
};

export type SimpleCompatOutcome = { ok: true; card: SimpleCompatCard } | { ok: false; errors: { a: CompatPersonErrors; b: CompatPersonErrors }; message?: string };

/** 같은 엔진 결과에서 무료 카드를 만든다 — 유료가 같은 결과를 풀어 쓰므로 새로 계산하지 않는다 */
export function cardOf(result: CompatResult, names: { a: string; b: string }): SimpleCompatCard {
  return {
    version: result.version,
    names,
    typeName: result.coupleType.name,
    typeLine: result.coupleType.line,
    score: result.score,
    scoreMeaning: result.scoreMeaning,
    core: result.coupleType.core,
    explain: result.coupleType.explain,
    good: result.highlights.good.slice(0, 2),
    care: result.highlights.care.slice(0, 2),
    pace: result.highlights.pace,
    basis: result.parts.map((p) => ({ label: p.label, direction: p.points > 0 ? "잘 맞는 쪽으로 읽혀요" : p.points < 0 ? "차이가 보이는 쪽으로 읽혀요" : "한쪽으로 기울지 않아요" })),
    cautions: result.cautions,
    notes: { scoreBasis: COMPAT_EXPLAIN.scoreBasis, scoreNotProbability: COMPAT_EXPLAIN.scoreNotProbability, tradition: COMPAT_EXPLAIN.tradition },
  };
}

/** 두 사람의 입력(브라우저에서 온 값)으로 간단 궁합을 만든다. 저장 · 기록하지 않는다 */
export function computeSimpleCompat(rawA: unknown, rawB: unknown, today: Date): SimpleCompatOutcome {
  const a = parseCompatPerson(rawA);
  const b = parseCompatPerson(rawB);
  if (!a || !b) return { ok: false, errors: { a: {}, b: {} }, message: "입력 형식이 올바르지 않아요." };
  const errors = { a: validateCompatPerson(a, today), b: validateCompatPerson(b, today) };
  if (Object.keys(errors.a).length || Object.keys(errors.b).length) return { ok: false, errors };
  const sa = calculateSaju(sajuInputOf(a));
  const sb = calculateSaju(sajuInputOf(b));
  if (sa.status !== "ok" || sb.status !== "ok") {
    const msg = (r: typeof sa) => (r.status === "invalid" ? r.message : "계산하지 못했어요.");
    return { ok: false, errors: { a: sa.status !== "ok" ? { birthDate: msg(sa) } : {}, b: sb.status !== "ok" ? { birthDate: msg(sb) } : {} } };
  }
  const names = { a: cleanNickname(a.nickname, "나"), b: cleanNickname(b.nickname, "상대") };
  return { ok: true, card: cardOf(compatOf(sa as SajuOk, sb as SajuOk), names) };
}

/** 공유할 글 — 이름 · 커플 유형 · 총점과 이 서비스 이름만 담고 생년월일은 담지 않는다 */
export function shareTextOf(card: Pick<SimpleCompatCard, "names" | "typeName" | "score">): string {
  return `${card.names.a} × ${card.names.b} — ${card.typeName} · 궁합 지수 ${card.score}\n재미로 보는 사주 궁합, 미유(ME:U)에서 우리도 해 볼래?`;
}
