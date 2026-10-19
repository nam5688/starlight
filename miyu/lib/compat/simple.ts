// 간단 궁합(무료) — 두 사람의 출생정보로 사주 궁합 엔진(lib/saju/interpret/compat.ts)을 한 번 돌려, 같은 결과의 대표 한 장(커플 유형 · 총점 · 핵심 한 줄 · 읽힌 점)만 만든다.
// 무료와 유료(사주 궁합)가 같은 엔진의 같은 결과를 쓰므로 무료에서 본 것과 유료에서 읽는 것이 어긋나지 않는다 — 이 카드는 그 결과의 일부일 뿐 따로 계산하지 않는다.
// 입력한 생년월일 · 닉네임은 계산하는 동안만 쓰고 저장하지 않는다. 카드에는 생년월일이 없다(닉네임은 사용자가 보려고 쓴 이름이라 결과 제목에만 쓴다).
import type { SajuOk } from "../saju/engine.ts";
import { COMPAT_EXPLAIN, compatOf, type CompatResult } from "../saju/interpret/compat.ts";
import { birthDateError, calculateSaju } from "../saju/manseryeok-engine.ts";
import {
  GENDER_REQUIRED_MESSAGE,
  RELATIONSHIP_LABEL,
  RELATIONSHIP_REQUIRED_MESSAGE,
  headingOf,
  isCompatGender,
  neutralWording,
  parseRelationship,
  relationFrameOf,
  showsCoupleType,
  type CompatGender,
  type CompatRelationship,
  type RelationFrame,
} from "./relationship.ts";

export const COMPAT_NICKNAME_MAX = 10;

export type CompatPersonInput = {
  nickname: string;
  /** 남자 · 여자 중 직접 고른 값. 고르기 전에는 빈 문자열 — 기본 선택도, 이름으로 하는 추정도 없다 */
  gender: "" | CompatGender;
  calendar: "solar" | "lunar";
  isLeapMonth: boolean;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  birthTime: string;
  birthTimeUnknown: boolean;
};

export const EMPTY_COMPAT_PERSON: CompatPersonInput = { nickname: "", gender: "", calendar: "solar", isLeapMonth: false, birthYear: "", birthMonth: "", birthDay: "", birthTime: "", birthTimeUnknown: false };

export type CompatPersonErrors = Partial<Record<"nickname" | "gender" | "birthDate" | "birthTime", string>>;

const isString = (v: unknown): v is string => typeof v === "string";

/** 브라우저에서 온 값을 입력 형식으로 읽는다 — 형식이 다르면 null */
export function parseCompatPerson(raw: unknown): CompatPersonInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isString(r.nickname) || !isString(r.birthYear) || !isString(r.birthMonth) || !isString(r.birthDay) || !isString(r.birthTime)) return null;
  if (r.calendar !== "solar" && r.calendar !== "lunar") return null;
  // 성별: 빈 값(고르지 않음)은 검사에서 안내하고, 정해진 두 값이 아닌 다른 값은 형식 오류다
  const gender = r.gender === undefined || r.gender === "" ? "" : isCompatGender(r.gender) ? r.gender : null;
  if (gender === null) return null;
  if (typeof r.isLeapMonth !== "boolean" || typeof r.birthTimeUnknown !== "boolean") return null;
  return {
    nickname: r.nickname.slice(0, 40),
    gender,
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
  // 성별은 10년 시기(대운) 계산에만 쓴다 — 고르지 않은 입력은 검사에서 걸러져 여기까지 오지 않는다
  ...(p.gender ? { gender: p.gender } : {}),
});

/** today는 호출하는 쪽이 넘긴다 — 날짜가 없거나 존재하지 않거나 미래이면 이유를 알려 준다 */
export function validateCompatPerson(p: CompatPersonInput, today: Date): CompatPersonErrors {
  const errors: CompatPersonErrors = {};
  if ([...p.nickname.trim()].length > COMPAT_NICKNAME_MAX) errors.nickname = `이름은 ${COMPAT_NICKNAME_MAX}자 이내로 입력해 주세요.`;
  if (!p.gender) errors.gender = GENDER_REQUIRED_MESSAGE;
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
  /**
   * 사용자가 알려 준 사이로 읽은 결과(무료 간단 궁합) — 관점 · 표현 · 조언만 바꾸고 위의 점수 · 유형 · 근거는 바꾸지 않는다.
   * 없으면(예전 방식의 카드) 중립 표시다. showType가 false인 사이(썸 · 친구 · 기타)는 커플 유형 이름을 보이지 않고 heading을 대신 쓴다.
   */
  relation?: { id: CompatRelationship; label: string; heading: string; showType: boolean; frame: RelationFrame };
};

export type SimpleCompatOutcome =
  | { ok: true; card: SimpleCompatCard }
  | { ok: false; errors: { a: CompatPersonErrors; b: CompatPersonErrors }; relationship?: string; message?: string };

/** 엔진 결과(변경 없음)에 사이에 맞는 풀이를 얹는다 — 사이에 맞지 않는 말("배우자 자리")만 표시용으로 바꾸고 점수 · 유형 · 근거 순서는 그대로다 */
export function withRelation(card: SimpleCompatCard, rel: CompatRelationship, levels: CompatResult["levels"]): SimpleCompatCard {
  const n = (t: string) => neutralWording(t, rel);
  return {
    ...card,
    good: card.good.map(n),
    care: card.care.map(n),
    basis: card.basis.map((b) => ({ ...b, label: n(b.label) })),
    notes: { ...card.notes, scoreBasis: n(card.notes.scoreBasis), tradition: n(card.notes.tradition) },
    relation: { id: rel, label: RELATIONSHIP_LABEL[rel], heading: headingOf(rel, card.typeName), showType: showsCoupleType(rel), frame: relationFrameOf(rel, levels) },
  };
}

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
export function computeSimpleCompat(rawA: unknown, rawB: unknown, today: Date, rawRelationship?: unknown): SimpleCompatOutcome {
  const a = parseCompatPerson(rawA);
  const b = parseCompatPerson(rawB);
  if (!a || !b) return { ok: false, errors: { a: {}, b: {} }, message: "입력 형식이 올바르지 않아요." };
  // 사이: 비어 있으면 고르라고 안내하고, 정해진 여섯 값이 아닌 다른 값은 형식 오류다 — 어떤 값도 대신 채우지 않는다
  if (rawRelationship !== undefined && rawRelationship !== null && rawRelationship !== "" && !parseRelationship(rawRelationship)) return { ok: false, errors: { a: {}, b: {} }, message: "입력 형식이 올바르지 않아요." };
  const relationship = parseRelationship(rawRelationship);
  const errors = { a: validateCompatPerson(a, today), b: validateCompatPerson(b, today) };
  if (Object.keys(errors.a).length || Object.keys(errors.b).length || !relationship) return { ok: false, errors, ...(relationship ? {} : { relationship: RELATIONSHIP_REQUIRED_MESSAGE }) };
  const sa = calculateSaju(sajuInputOf(a));
  const sb = calculateSaju(sajuInputOf(b));
  if (sa.status !== "ok" || sb.status !== "ok") {
    const msg = (r: typeof sa) => (r.status === "invalid" ? r.message : "계산하지 못했어요.");
    return { ok: false, errors: { a: sa.status !== "ok" ? { birthDate: msg(sa) } : {}, b: sb.status !== "ok" ? { birthDate: msg(sb) } : {} } };
  }
  const names = { a: cleanNickname(a.nickname, "나"), b: cleanNickname(b.nickname, "상대") };
  const result = compatOf(sa as SajuOk, sb as SajuOk);
  return { ok: true, card: withRelation(cardOf(result, names), relationship, result.levels) };
}

/** 공유할 글 — 이름 · 커플 유형 · 총점과 이 서비스 이름만 담고 생년월일은 담지 않는다 */
export function shareTextOf(card: Pick<SimpleCompatCard, "names" | "typeName" | "score" | "relation">): string {
  const title = card.relation ? card.relation.heading : card.typeName;
  return `${card.names.a} × ${card.names.b} — ${title} · 궁합 지수 ${card.score}\n재미로 보는 사주 궁합, 미유(ME:U)에서 우리도 해 볼래?`;
}
