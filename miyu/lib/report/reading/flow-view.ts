// "앞으로의 운과 변화"(6번 장)를 보이는 방식 — 저장된 글을 시기별 칸으로 나누고 시간축 그래프를 만드는 순수 계산(React · Next 없음, AI 호출 없음).
// 표시 계층이다. 저장된 리포트의 글 · 근거 · 계산값은 바꾸지 않고, 글의 문장을 그대로 시기 칸에 나눠 담을 뿐 새 문장을 쓰지 않는다.
//  · 칸을 나누는 기준은 이 리포트에 저장된 값이다: 글에 적힌 "만 N~M세 무렵" · "YYYY년" 표지, 코드가 계산한 대운 목록(report.timeline), 저장된 가까운 세 해(report.flow.years),
//    근거 목록(generated.evidence)의 시기 근거(period · ageWindows). 한 사람의 글을 베껴 둔 표가 아니라서 사람이 달라지면 칸도 달라진다.
//  · 출생 시각을 모르면 대운이 바뀌는 달이 달라질 수 있어 연도 "무렵"으로만 보이고 달 · 지난 개월 수는 쓰지 않는다(근거 `saju.hour.unknown`).
//  · 막대의 길이는 기간일 뿐이다. 높이 · 색으로 좋고 나쁨 · 점수를 나타내지 않는다.
//  · 개운(색 · 방향 · 숫자 · 장소) 문단은 근거 `saju.fortify`가 정한 보완 후보로 카드를 만들어 대신 보인다. 후보가 동점이면 하나를 앞세우지 않는다.
//  · 시간축은 사주에서 읽은 시기(근거가 있는 기간)만 막대로 놓고, 끝에 "앞으로 만들어 갈 변화"를 점선으로 따로 구분해 덧붙인다(운영자 2026-10-19: 희망적인 마무리).
//    이 마무리는 점수 · 높이 · 확률이 아니고 막대(시기)도 아니다 — 시기를 읽은 값이 올라간다는 뜻이 아니라, 저장된 조언(report.actions)의 제목을 "지금부터 해 볼 수 있는 준비"로 다시 가리킬 뿐이다.
import type { Evidence } from "../evidence.ts";
import type { FiveElement } from "../../saju/engine.ts";
import { FORTUNE_WORDS, fortifyCandidatesOf } from "../../saju/interpret/fortune.ts";
import { periodPlain } from "../../saju/interpret/period-plain.ts";
import { FLOW_HIT_PX, FLOW_MIN_BAR_PCT } from "./flow-metrics.ts";
import { isHourUnknown, softenMonths } from "./hour-text.ts";
import type { IntegratedReadingReport, LuckSlot } from "./types.ts";

export { FLOW_HIT_PX, FLOW_MIN_BAR_PCT, isHourUnknown, softenMonths };

export type FlowKind = "past" | "now" | "year" | "next";

export type FlowItem = {
  key: string;
  kind: FlowKind;
  /** 칸 제목 — "만 7~16세 무렵" · "지금 지나는 큰 시기" · "2026년" · "그다음 큰 시기" */
  title: string;
  /** 제목 아래 기간 줄 — 시각을 모르면 연도 "무렵"만, 알면 연-월 */
  caption: string;
  /** 접힌 채로 보이는 핵심 주제 한 줄 — 코드가 계산한 시기 이름 또는 저장된 해별 한 줄 (없으면 비운다) */
  theme?: string;
  /** 펼치면 보이는 풀이 — 저장된 글의 문장을 그대로 이은 것 */
  text: string;
  /** 코드가 채운 쉬운 말 설명(지금 · 다음 큰 시기) — 저장된 글과 구분해 보인다 */
  plain?: { meaning: string; example: string };
  /** 막대 안의 짧은 이름 */
  short: string;
};

export type FlowBar = { key: string; kind: FlowKind; short: string; label: string; left: number; width: number; lane: number };

export type FlowAxis = {
  bars: FlowBar[];
  laneCount: number;
  /** 눈금 — 연도 */
  ticks: { year: number; left: number }[];
  /** 지금 위치(%) — 오늘 날짜 기준이라 출생 시각과 상관없다 */
  nowLeft: number;
};

export type FlowFortifyCard = {
  element: FiveElement;
  title: string;
  place: string;
  colors: { name: string; css: string }[];
  numbers: string;
  tip: string;
};

export type FlowFortify = { lead: string; tied: boolean; cards: FlowFortifyCard[] };

/**
 * 시간축 끝의 "앞으로 만들어 갈 변화" — 사주에서 읽은 시기(막대)와 구분되는 행동형 마무리. 문구는 코드가 고정하고(조건형 · 가능성의 말, 확정 · 보장 · 상승을 말하지 않는다),
 * points만 이 리포트에 저장된 조언(7번 장의 실천 행동)의 제목에서 온다. 점수 · 확률 · 막대 높이는 없다.
 */
export type FlowClosing = { title: string; axisLabel: string; lead: string; listLabel: string; points: string[]; pointsNote: string };

export type FlowView = {
  hourUnknown: boolean;
  /** 시기 칸에 들어가지 않은 앞머리 문장 */
  lead: string[];
  items: FlowItem[];
  /** 지나온 / 지금 / 앞으로 묶음 전체에 걸리는 문장 (한 칸에 속하지 않는다) */
  notes: { past: string[]; now: string[]; next: string[] };
  axis: FlowAxis | null;
  /** 시간축 끝의 행동형 마무리 — 시간축이 있을 때만 */
  closing: FlowClosing | null;
  fortify: FlowFortify | null;
  /** 개운 문단인데 카드로 만들 수 없을 때(근거 없음) 그대로 보이는 문단 */
  rest: string[];
};

/** 마무리의 고정 문구 — 사건 · 상승 · 보장을 말하지 않고, 시기는 읽은 가능성이고 앞으로의 모습은 내가 만들어 가는 몫이라는 구분만 한다 */
export const FLOW_CLOSING_COPY = {
  title: "앞으로 만들어 갈 변화",
  axisLabel: "앞으로 만들어 갈 변화",
  lead: "여기까지는 사주에서 읽은 시기의 흐름이에요. 어떻게 보낼지는 정해져 있지 않아서, 시기마다 준비를 하나씩 해 두면 앞으로의 모습은 내가 만들어 갈 수 있어요.",
  listLabel: "지금부터 해 볼 수 있는 준비",
  pointsNote: "자세한 방법은 아래 7번 조언에서 이어서 읽을 수 있어요.",
} as const;

// ───────────── 작은 도구 ─────────────

const AGE_RE_G = /만\s*(\d{1,3})\s*(?:[~∼–-]\s*(\d{1,3}))?\s*세/g;
const YEAR_RE_G = /(\d{4})\s*년/g;
const AGE_AHEAD = String.raw`만\s*\d{1,3}\s*(?:[~∼–-]\s*\d{1,3})?\s*세`;

const yearOf = (ym: string) => Number(ym.slice(0, 4));
const monthOf = (ym: string) => Number(ym.slice(5, 7));
const ymNum = (ym: string) => yearOf(ym) + (monthOf(ym) - 1) / 12;

const ageLabel = (a: number, b: number) => (b > a ? `만 ${a}~${b}세 무렵` : `만 ${a}세 무렵`);
const ageShort = (a: number, b: number) => (b > a ? `${a}~${b}세` : `${a}세`);

function yearLabel(ym: string, hourUnknown: boolean): string {
  return hourUnknown ? `${yearOf(ym)}년 무렵` : ym.replace("-", ".");
}

// ───────────── 글을 칸으로 나누기 ─────────────

/** 문장 단위로 자른다 — 마침표 · 물음표 · 느낌표 뒤의 공백에서 */
export function splitSentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

/** 한 문장에 시기 표지가 쉼표로 이어진 곳은 쉼표에서 나눈다 — "…있고, 만 16~26세 무렵에는 …" 글자는 그대로이고 쉼표만 빠진다 */
export function splitClauses(sentence: string): string[] {
  const parts = sentence.split(new RegExp(String.raw`,\s+(?=${AGE_AHEAD}|\d{4}\s*년)`));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * 한 문장을 쉼표에서 나눠 다른 시기 칸에 담을 때 앞쪽 절 끝에 남는 이어 주는 어미("…가능성이 있고")를 같은 뜻의 끝맺음("…가능성이 있어요.")으로 바꾼다 — 표시용 칸에서만.
 * 바꾸는 어미는 아래 여섯 가지뿐이고(새 내용을 더하지 않는다) 그 밖의 절은 그대로 둔다. 저장된 글 · 원문 파일은 바꾸지 않는다.
 */
const CLAUSE_ENDINGS: [RegExp, string][] = [
  [/있고$/, "있어요."],
  [/없고$/, "없어요."],
  [/이었고$/, "이었어요."],
  [/였고$/, "였어요."],
  [/했고$/, "했어요."],
  [/됐고$/, "됐어요."],
];
export function completeClauseEnding(clause: string): string {
  const t = clause.trimEnd();
  if (/[.!?]$/.test(t)) return clause;
  for (const [re, to] of CLAUSE_ENDINGS) if (re.test(t)) return t.replace(re, to);
  return clause;
}

type Slot = LuckSlot | undefined;

type Draft = {
  key: string;
  kind: FlowKind;
  title: string;
  captionBase: string;
  theme?: string;
  plain?: { meaning: string; example: string };
  short: string;
  /** 글에 적힌 나이 구간(지나온 시기 칸) — 칸 정렬 기준 */
  age?: { from: number; to: number };
  /** 축에 놓는 구간(연도, 소수 가능) */
  span?: { from: number; to: number };
  /** 풀이에 담을 글 조각 */
  texts: string[];
};

type Cl = { text: string; item: string | null };

type Win = { id: string; age: { from: number; to: number }; from: string; to: string };

function evidenceWindows(evidence: Evidence[]): Win[] {
  return evidence
    .filter((e) => e.period && e.ageWindows && e.ageWindows.length === 1 && !e.uncertain)
    .map((e) => ({ id: e.id, age: e.ageWindows![0], from: e.period!.from, to: e.period!.to }));
}

/**
 * 근거의 기간과 나이 범위가 서로 맞는가 — 대운 하나가 통째로(기간 10년 · 나이 범위 10년), 세운 하나가 통째로(기간 1년 · 나이 범위 0~1년).
 * 프레임은 나이의 하한(예: 연애는 만 16세 이후)에 맞춰 나이 범위만 좁게 자를 수 있고 그때도 기간(period)은 대운 전체를 그대로 담는다 —
 * 그런 근거의 기간을 그 나이 칸의 기간으로 쓰면 만 16세 하나가 10년으로 보인다. 맞지 않는 근거는 연도를 정하는 데 쓰지 않는다(배경 범위일 뿐).
 */
const periodMatchesAge = (w: Win) => Math.abs(ymNum(w.to) - ymNum(w.from) - (w.age.to - w.age.from)) <= 2.2;

/**
 * 출생 연도와의 차이(만 나이 + 이 값 = 그 무렵의 연도) — 기간과 나이가 맞는 근거에서만 센다. 안전하게 정할 수 없으면 null이라 나이 칸에 연도를 붙이지 않는다:
 * ① 맞는 근거가 하나도 없다 ② 맞는 근거끼리 한 해보다 더 어긋난다 ③ 나이 범위만 잘린 근거의 나이가 그 근거의 기간 밖(± 한 해)으로 나온다.
 */
function safeBirthOffset(wins: Win[]): number | null {
  const whole = wins.filter(periodMatchesAge);
  if (whole.length === 0) return null;
  const offs = whole.map((w) => yearOf(w.from) - w.age.from);
  if (Math.max(...offs) - Math.min(...offs) > 1) return null;
  const counts = new Map<number, number>();
  for (const o of offs) counts.set(o, (counts.get(o) ?? 0) + 1);
  let best = offs[0];
  for (const [o, n] of counts) if (n > (counts.get(best) ?? 0) || (n === counts.get(best) && o < best)) best = o;
  for (const w of wins.filter((x) => !periodMatchesAge(x))) {
    if (best + w.age.from < yearOf(w.from) - 1 || best + w.age.to > yearOf(w.to) + 1) return null;
  }
  return best;
}

/**
 * 6번 장을 시기별 칸과 시간축으로 나눈다. 칸으로 나눌 표지(글의 나이 · 연도, 대운 목록)가 하나도 없으면 null이라 호출하는 쪽이 예전 모양으로 보인다.
 */
export function buildFlowView(report: IntegratedReadingReport): FlowView | null {
  const hourUnknown = isHourUnknown(report);
  const evidence = report.generated?.evidence ?? [];
  const wins = evidenceWindows(evidence);
  const offset = safeBirthOffset(wins);

  const slot = (role: LuckSlot["role"]): Slot => report.timeline.find((s) => s.role === role);
  const cur = slot("current");
  const next = slot("next");
  const prev = slot("previous");
  const spanOfSlot = (s: LuckSlot) => ({ from: hourUnknown ? yearOf(s.from) : ymNum(s.from), to: hourUnknown ? yearOf(s.to) : ymNum(s.to) });

  const drafts = new Map<string, Draft>();
  const order: string[] = [];
  const add = (d: Draft) => {
    if (!drafts.has(d.key)) {
      drafts.set(d.key, d);
      order.push(d.key);
    }
    return drafts.get(d.key)!;
  };

  // 코드가 계산한 시기 — 글에 문장이 없어도 칸은 있다
  const ageOfSlot = (s: LuckSlot) => wins.find((w) => periodMatchesAge(w) && Math.abs(yearOf(w.from) - yearOf(s.from)) <= 1 && w.age.to - w.age.from >= 5)?.age ?? null;
  const slotAge = (s: LuckSlot) => {
    const a = ageOfSlot(s);
    return a ? ` · ${ageLabel(a.from, a.to)}` : "";
  };
  if (cur) {
    const p = periodPlain(cur.stemGroup, cur.branchGroup);
    add({ key: "now", kind: "now", title: "지금 지나는 큰 시기", captionBase: `${yearLabel(cur.from, hourUnknown)} ~ ${yearLabel(cur.to, hourUnknown)}${slotAge(cur)}`, theme: p.title, plain: { meaning: p.meaning, example: p.example }, short: "지금", span: spanOfSlot(cur), texts: [] });
  }
  const yearsRaw = (report.flow.years ?? []).map((y) => ({ year: Number(String(y.year).replace(/\D/g, "").slice(0, 4)), theme: y.theme })).filter((y) => y.year >= 1900);
  for (const y of yearsRaw) add({ key: `year-${y.year}`, kind: "year", title: `${y.year}년`, captionBase: "그해의 분위기", theme: y.theme, short: String(y.year), span: { from: y.year, to: y.year + 1 }, texts: [] });
  if (next) {
    const p = periodPlain(next.stemGroup, next.branchGroup);
    add({ key: "next", kind: "next", title: "그다음 큰 시기", captionBase: `${yearLabel(next.from, hourUnknown)} ~ ${yearLabel(next.to, hourUnknown)}${slotAge(next)}`, theme: p.title, plain: { meaning: p.meaning, example: p.example }, short: "다음", span: spanOfSlot(next), texts: [] });
  }

  const nowFrom = cur ? yearOf(cur.from) : null;
  const nowTo = cur ? yearOf(cur.to) : null;
  const nextFrom = next ? yearOf(next.from) : null;
  const near = (a: number, b: number | null) => b !== null && Math.abs(a - b) <= 1;

  /**
   * 나이 구간을 연도 구간으로. 안전하게 정한 출생 연도 차이(offset)가 없으면 연도를 붙이지 않는다(null). 있으면 순서는
   * ① 명시된 해 — 근거 하나가 한 해(세운)를 통째로 가리키고 그 나이 범위가 이 칸과 같으면 근거에 적힌 그 해 그대로,
   *   또는 같은 문장에 적힌 단일 연도가 이 나이 범위의 연도 안에 있으면 그 해 (출생 연도 차이로 어림한 값이 명시된 해를 덮어쓰지 않는다)
   * ② 출생 연도 차이로 어림(근거의 넓은 기간을 그대로 옮기지 않는다).
   * 명시된 해가 나이 범위와 어긋나면 쓰지 않고 ②로 간다 — 새 연도를 지어내지 않는다.
   */
  const windowSpan = (a: number, b: number, hintYear?: number): { from: number; to: number } | null => {
    if (offset === null) return null;
    const lo = offset + a;
    const hi = offset + (b > a ? b : a + 1);
    const wholeYear = wins.find((w) => periodMatchesAge(w) && ymNum(w.to) - ymNum(w.from) <= 1.2 && w.age.from === a && w.age.to === b);
    if (wholeYear) {
      const y = yearOf(wholeYear.from);
      if (y >= lo - 1 && y <= hi) return { from: y, to: y + 1 };
    }
    if (hintYear !== undefined && hintYear >= lo && hintYear <= hi) return { from: hintYear, to: hintYear + 1 };
    return { from: lo, to: hi };
  };

  // 글을 문단 → 문장 → 쉼표로 이어진 시기 표지 단위로 나눠 칸에 담는다
  const paragraphs = [report.flow.summary, ...(report.flow.paragraphs ?? [])].filter((p) => p && p.trim());
  const candidates = fortifyCandidatesOf(evidence);
  const isFortifyPara = (p: string) => {
    if (candidates.length === 0) return false;
    if (/^개운/.test(p.trim())) return true;
    return candidates.some((e) => {
      const w = FORTUNE_WORDS[e];
      return [w.direction.test(p), w.color.test(p), w.place.test(p), w.numbers[0].test(p) && w.numbers[1].test(p)].filter(Boolean).length >= 3;
    });
  };

  const lead: string[] = [];
  const notes = { past: [] as string[], now: [] as string[], next: [] as string[] };
  const rest: string[] = [];
  let fortifyParas = 0;
  let last = null as string | null; // 마지막으로 글을 받은 칸

  const place = (c: string, paraFirstSeen: Map<string, true>): Cl => {
    const ages = [...c.matchAll(AGE_RE_G)];
    const years = [...c.matchAll(YEAR_RE_G)].map((m) => Number(m[1]));
    // ① 문장이 해(年)로 시작 — 가까운 세 해
    const startYear = /^(\d{4})\s*년/.exec(c.trim());
    if (startYear && drafts.has(`year-${startYear[1]}`)) return { text: c, item: `year-${startYear[1]}` };
    // ② 지금 지나는 큰 시기의 연도 범위
    if (cur && years.length > 0 && near(years[0], nowFrom) && ((years.length >= 2 && near(years[1], nowTo)) || /지금|현재/.test(c))) return { text: c, item: "now" };
    // ③ 다음 큰 시기의 시작 연도
    if (next && years.length > 0 && near(years[0], nextFrom)) return { text: c, item: "next" };
    // ④ 나이 구간
    if (ages.length > 0) {
      const a = Number(ages[0][1]);
      const b = ages[0][2] ? Number(ages[0][2]) : a;
      const distinctYears = [...new Set(years)];
      const sp = windowSpan(a, b, distinctYears.length === 1 ? distinctYears[0] : undefined);
      if (sp && nowFrom !== null && nowTo !== null) {
        const mid = (sp.from + sp.to) / 2;
        if (mid < nowFrom) return { text: c, item: ensurePast(a, b, sp) };
        if (mid >= nowTo) return { text: c, item: next ? "next" : ensurePast(a, b, sp) };
        return { text: c, item: cur ? "now" : ensurePast(a, b, sp) };
      }
      // 연도로 놓을 수 없으면 글 순서로: 지금 칸이 이미 나왔으면 앞으로, 아니면 지나온 시기
      const seenNow = paraFirstSeen.has("now") || last === "now" || last?.startsWith("year-") || last === "next";
      return { text: c, item: seenNow && next ? "next" : ensurePast(a, b, sp) };
    }
    // ⑤ 글에 적힌 해(年)가 지나온 시기이거나 다른 해
    if (years.length > 0 && nowFrom !== null && nowTo !== null) {
      const y = years[0];
      if (y < nowFrom - 1) return { text: c, item: ensurePastYear(y) };
      if (y >= nowFrom - 1 && y < nowTo) {
        if (!drafts.has(`year-${y}`)) add({ key: `year-${y}`, kind: "year", title: `${y}년`, captionBase: "그해의 분위기", short: String(y), span: { from: y, to: y + 1 }, texts: [] });
        return { text: c, item: `year-${y}` };
      }
      if (next) return { text: c, item: "next" };
    }
    return { text: c, item: null };
  };

  const ensurePast = (a: number, b: number, sp: { from: number; to: number } | null): string => {
    const key = `age-${a}-${b}`;
    if (!drafts.has(key)) {
      // 부제(핵심 주제)는 이 나이 구간이 계산된 이전 큰 시기(대운) 하나와 나이 · 연도로 맞아떨어질 때만 그 시기의 이름을 쓴다
      const matchesPrev = prev && sp && b - a >= 5 && Math.abs(sp.from - yearOf(prev.from)) <= 1 && Math.abs(sp.to - yearOf(prev.to)) <= 1.5;
      const p = matchesPrev ? periodPlain(prev.stemGroup, prev.branchGroup) : null;
      const cap = sp ? `${Math.round(sp.from)}년 무렵${sp.to - sp.from >= 2 ? ` ~ ${Math.round(sp.to)}년 무렵` : ""}` : "나이로만 읽은 지나온 시기";
      add({ key, kind: "past", title: ageLabel(a, b), captionBase: cap, ...(p ? { theme: p.title } : {}), short: ageShort(a, b), age: { from: a, to: b }, ...(sp ? { span: sp } : {}), texts: [] });
    }
    return key;
  };
  const ensurePastYear = (y: number): string => {
    const key = `py-${y}`;
    if (!drafts.has(key)) add({ key, kind: "past", title: `${y}년 무렵`, captionBase: "지나온 시기", short: String(y), span: { from: y, to: y + 1 }, texts: [] });
    return key;
  };

  for (const para of paragraphs) {
    if (isFortifyPara(para)) {
      fortifyParas += 1;
      continue;
    }
    const entries: Cl[] = [];
    const seenInPara = new Map<string, true>();
    const lastAtStart = last;
    for (const sentence of splitSentences(para)) {
      const clauses = splitClauses(sentence);
      for (const [ci, clause] of clauses.entries()) {
        const placed: Cl = place(clause, seenInPara);
        const item: string | null = placed.item ?? last;
        // 쉼표에서 나뉘어 다른 칸으로 갈 수 있는 앞쪽 절은 이어 주는 어미 대신 끝맺음으로 보인다(마지막 절은 원문 그대로)
        entries.push({ text: ci < clauses.length - 1 ? completeClauseEnding(clause) : clause, item: placed.item });
        if (item) {
          seenInPara.set(item, true);
          last = item;
        }
      }
    }
    // 이 문단에서 칸이 둘 이상 나왔고 끝이 표지 없는 문장이면 한 칸이 아니라 묶음 전체에 걸리는 말로 둔다
    const distinct = new Set(entries.filter((e) => e.item).map((e) => e.item));
    let tail = entries.length;
    while (tail > 0 && entries[tail - 1].item === null && distinct.size >= 2) tail -= 1;
    const tailEntries = entries.slice(tail);
    // 칸을 정하지 못한 앞머리 문장은 lead, 나머지는 직전 칸으로
    let holder: string | null = lastAtStart;
    for (let i = 0; i < tail; i += 1) {
      const e = entries[i];
      if (e.item) holder = e.item;
      if (!holder) {
        lead.push(e.text);
        continue;
      }
      drafts.get(holder)!.texts.push(e.text);
    }
    if (tailEntries.length > 0 && holder) {
      const kind = drafts.get(holder)!.kind;
      const group = kind === "past" ? notes.past : kind === "next" ? notes.next : notes.now;
      for (const t of tailEntries) group.push(t.text);
    }
  }

  // 칸이 코드가 만든 것뿐이고 글에서 나뉜 문장이 하나도 없으면 — 나눌 표지가 없는 글이라 예전 모양으로
  const anyText = [...drafts.values()].some((d) => d.texts.length > 0);
  if (!anyText && !fortifyParas) return null;
  if (drafts.size === 0) return null;

  // 정렬: 시간 순서(지나온 → 지금 → 가까운 해 → 다음). 지나온 칸끼리는 나이 구간(시작 나이 → 끝 나이)순 — 연도 위치가 아니라 글에 적힌 나이가 기준이다
  const rank = (d: Draft) => (d.kind === "past" ? 0 : d.kind === "now" ? 1 : d.kind === "year" ? 2 : 3);
  const seq = new Map(order.map((k, i) => [k, i]));
  const sortedKeys = [...order].sort((x, y) => {
    const a = drafts.get(x)!;
    const b = drafts.get(y)!;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.age && b.age) return a.age.from - b.age.from || a.age.to - b.age.to;
    return (a.span?.from ?? 0) - (b.span?.from ?? 0) || seq.get(x)! - seq.get(y)!;
  });

  // 같은 부제(시기 이름)를 다른 시기 칸에서 되풀이하지 않는다 — 인접한 큰 시기의 천간 · 지지 그룹이 같으면 계산된 이름도 같아지는데, 그대로 두면 한 시기의 설명이 다른 시기에 복사된 것처럼 보인다.
  // 지금 칸을 기준으로 두고 나머지(지나온 · 다음)는 이미 나온 이름이면 부제와 쉬운 말 설명을 뺀다(글 문장은 그대로).
  const seenThemes = new Set<string>();
  const nowDraft = drafts.get("now");
  if (nowDraft?.theme) seenThemes.add(nowDraft.theme);
  for (const k of sortedKeys) {
    const d = drafts.get(k)!;
    if (d.kind === "now" || d.kind === "year" || !d.theme) continue;
    if (seenThemes.has(d.theme)) {
      delete d.theme;
      delete d.plain;
    } else seenThemes.add(d.theme);
  }

  const sortedItems: FlowItem[] = sortedKeys
    .map((k) => drafts.get(k)!)
    .map((d) => ({
      key: d.key,
      kind: d.kind,
      title: d.title,
      caption: d.captionBase,
      ...(d.theme ? { theme: d.theme } : {}),
      text: d.texts.join(" "),
      ...(d.plain ? { plain: d.plain } : {}),
      short: d.short,
    }));

  const axis = buildAxis(
    sortedKeys.map((k) => drafts.get(k)!),
    report.timelineReference,
  );
  const fortify = fortifyParas > 0 ? buildFortify(candidates) : null;
  if (fortifyParas > 0 && !fortify) {
    // 후보 기운을 카드로 만들 수 없으면 개운 문단을 그대로 보인다
    for (const para of paragraphs) if (isFortifyPara(para)) rest.push(para);
  }

  // 마무리의 준비 목록은 저장된 조언(7번 장 실천 행동)의 제목만 가져온다 — 새 문장을 쓰지 않는다
  const points = (report.actions ?? []).map((a) => a.title.trim()).filter(Boolean).slice(0, 3);
  const closing: FlowClosing | null = axis ? { ...FLOW_CLOSING_COPY, points } : null;

  return { hourUnknown, lead, items: sortedItems, notes, axis, closing, fortify, rest };
}

// ───────────── 시간축 ─────────────

const MIN_BAR = FLOW_MIN_BAR_PCT;

function buildAxis(drafts: Draft[], reference: { year: number; month: number }): FlowAxis | null {
  const placed = drafts.filter((d) => d.span);
  if (placed.length === 0) return null;
  const nowYear = reference.year + (reference.month - 1) / 12;
  const lo = Math.min(...placed.map((d) => d.span!.from), nowYear);
  const hi = Math.max(...placed.map((d) => d.span!.to), nowYear);
  const min = Math.floor(lo) - 1;
  const max = Math.ceil(hi) + 1;
  const total = max - min;
  const pct = (y: number) => ((y - min) / total) * 100;

  const raw = placed
    .map((d) => ({ d, left: pct(d.span!.from), width: ((d.span!.to - d.span!.from) / total) * 100 }))
    .sort((a, b) => a.left - b.left || b.width - a.width);
  const laneEnd: number[] = [];
  const bars: FlowBar[] = raw.map(({ d, left, width }) => {
    const w = Math.max(width, MIN_BAR);
    const l = Math.min(left, 100 - w);
    let lane = laneEnd.findIndex((end) => end <= l - 0.8);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(0);
    }
    laneEnd[lane] = l + w;
    return { key: d.key, kind: d.kind, short: d.short, label: d.title, left: l, width: w, lane };
  });

  const step = total <= 30 ? 5 : 10;
  const ticks: { year: number; left: number }[] = [];
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) ticks.push({ year: y, left: pct(y) });
  return { bars, laneCount: laneEnd.length, ticks, nowLeft: pct(nowYear) };
}

// ───────────── 개운 카드 ─────────────

const SWATCH: Record<string, string> = {
  회색: "#9ca3af",
  은색: "#c7ccd4",
  흰색: "#ffffff",
  초록: "#43a047",
  청록: "#1a9e94",
  연두: "#a5d66b",
  빨강: "#e5484d",
  주황: "#f08c3a",
  "따뜻한 노랑": "#f4c04a",
  베이지: "#e6d3b3",
  황토: "#c8a45c",
  갈색: "#8b5e3c",
  검정: "#1f2328",
  남색: "#243b6b",
  "짙은 파랑": "#1d3f8f",
};

/** 카드에 보이는 말 — 금 · 목은 운영자가 정한 문구이고 나머지 기운도 같은 모양으로 맞췄다(전통 오행 대응표 `ELEMENT_FORTUNE`와 같은 방향 · 색 · 수) */
const CARD: Record<FiveElement, { place: string; colors: string[]; numbers: [number, number]; direction: string; tipColor: string; walk: string }> = {
  금: { place: "서쪽, 탁 트이고 정돈된 곳", colors: ["회색", "은색", "흰색"], numbers: [4, 9], direction: "서쪽", tipColor: "흰색", walk: "서쪽으로 산책하거나" },
  목: { place: "동쪽, 초록색 나무가 보이는 창가", colors: ["초록", "청록", "연두"], numbers: [3, 8], direction: "동쪽", tipColor: "초록색", walk: "동쪽으로 산책하거나" },
  화: { place: "남쪽, 햇볕이 잘 드는 곳", colors: ["빨강", "주황", "따뜻한 노랑"], numbers: [2, 7], direction: "남쪽", tipColor: "주황색", walk: "남쪽으로 산책하거나" },
  토: { place: "중앙(가운데), 정돈된 집과 책상", colors: ["베이지", "황토", "갈색"], numbers: [5, 10], direction: "중앙", tipColor: "베이지색", walk: "집 한가운데 정돈된 자리에서 쉬거나" },
  수: { place: "북쪽, 조용하고 차분한 공간", colors: ["검정", "남색", "짙은 파랑"], numbers: [1, 6], direction: "북쪽", tipColor: "남색", walk: "북쪽으로 산책하거나" },
};

const TIE_TIP = "둘 중 하나를 앞세우지 않고 같은 무게의 후보로 두고, 이미 가진 물건으로 가볍게 해보는걸 추천해요";

const hasBatchim = (word: string) => {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
};
/** 숫자 읽기의 받침 — 1(일) 3(삼) 6(육) 7(칠) 8(팔) 10(십)은 받침이 있고 2 4 5 9는 없다 */
const NUM_BATCHIM = new Set([1, 3, 6, 7, 8, 10]);

function leadSentence(elements: FiveElement[]): string {
  let joined = elements[0] as string;
  for (let i = 1; i < elements.length; i += 1) joined += `${hasBatchim(elements[i - 1]) ? "과" : "와"} ${elements[i]}`;
  return `${joined}${hasBatchim(elements[elements.length - 1]) ? "이" : "가"} 부족한 사주라 일상생활에서 채워주면 균형이 좋아질 수 있어요`;
}

function actionTip(e: FiveElement): string {
  const c = CARD[e];
  const [a, b] = c.numbers;
  return `휴대폰 화면이나 소품을 ${c.tipColor} 계열로 바꾸거나 ${c.walk} 즐겨 쓰는 번호에 ${a}${NUM_BATCHIM.has(a) ? "이나" : "나"} ${b}${NUM_BATCHIM.has(b) ? "을" : "를"} 넣어 보세요.`;
}

function buildFortify(elements: FiveElement[]): FlowFortify | null {
  if (elements.length === 0) return null;
  const tied = elements.length > 1;
  const cards: FlowFortifyCard[] = elements.map((e, i) => {
    const c = CARD[e];
    const isLastOfTie = tied && i === elements.length - 1;
    return {
      element: e,
      title: `${e}${hasBatchim(e) ? "을" : "를"} 채울 수 있는 정보들`,
      place: c.place,
      colors: c.colors.map((name) => ({ name, css: SWATCH[name] ?? "#d1d5db" })),
      numbers: c.numbers.join(", "),
      tip: isLastOfTie ? TIE_TIP : actionTip(e),
    };
  });
  return { lead: leadSentence(elements), tied, cards };
}
