// 프레임 평가와 이야기 선택 — 코드가 근거를 정하고 AI는 그 근거로 쓴다(운영자 2026-10-18).
// 응답은 프레임이 있고 없음을 바꾸지 않는다. 응답이 정하는 것은 어느 얼굴(좋은 면 · 어려운 면)을 앞세울지와 "일치 · 차이 · 보완" 표시뿐이다.
import { FRAME_HIT_RATE, FRAMES } from "./catalog.ts";
import type { FrameContext, FrameDef, FrameHit, FrameInstance, ResponseLink, Strand } from "./types.ts";

export type EvaluatedHit = {
  frame: FrameDef;
  hit: FrameHit;
  /** 근거 수준 — 사실 셋 이상이면 중간, 둘이면 약함(단정하지 않는다). 강함은 없다(전문가 검토 전 초안) */
  level: "moderate" | "weak";
};

export type Evaluation = {
  hits: EvaluatedHit[];
  /** 필요한 데이터가 없어 발동하지 못한 프레임 — 거짓 근거를 만들지 않고 이유만 남긴다 */
  unavailable: { frameId: string; reason: string }[];
  /** 절기 경계 · 야자시 관법으로 흔들리는 기둥에 기대서 뺀 프레임 · 시기 */
  excluded: { frameId: string; reason: string }[];
};

const PILLAR_NAME: Record<string, string> = { year: "년주", month: "월주", day: "일주", hour: "시주" };

/** 모든 프레임을 평가한다. 같은 입력이면 늘 같은 결과(응답과 무관) */
export function evaluateFrames(c: FrameContext): Evaluation {
  const hits: EvaluatedHit[] = [];
  const unavailable: Evaluation["unavailable"] = [];
  const excluded: Evaluation["excluded"] = [];
  for (const frame of FRAMES) {
    if (frame.needs.includes("gender") && !c.gender) {
      unavailable.push({ frameId: frame.id, reason: "성별 정보가 없어 배우자 별을 쓰는 프레임은 발동하지 않음" });
      continue;
    }
    if (frame.needs.includes("luck") && !c.luck.length) {
      unavailable.push({ frameId: frame.id, reason: "대운 계산이 없어 시기 프레임은 발동하지 않음" });
      continue;
    }
    const raw = frame.check(c);
    if (!raw) continue;
    const shaky = [...new Set(raw.uses)].filter((k) => c.uncertain.includes(k));
    if (shaky.length && !raw.instances) {
      excluded.push({ frameId: frame.id, reason: `${shaky.map((k) => PILLAR_NAME[k]).join(" · ")}가 절기 경계 · 야자시 관법으로 달라질 수 있어 근거에서 뺌` });
      continue;
    }
    // 시기 프레임은 흔들리는 기둥에 기댄 시기만 뺀다
    let hit = raw;
    if (raw.instances) {
      const keep = raw.instances.filter((i) => !i.uses.some((k) => c.uncertain.includes(k)));
      if (keep.length !== raw.instances.length) excluded.push({ frameId: frame.id, reason: `흔들리는 기둥에 기댄 시기 ${raw.instances.length - keep.length}곳을 뺌` });
      if (!keep.length) continue;
      hit = { ...raw, instances: keep };
    }
    hits.push({ frame, hit, level: hit.facts.length >= 3 ? "moderate" : "weak" });
  }
  return { hits, unavailable, excluded };
}

/** 응답 연결 — 프레임의 설문 연결 중 응답에서 뚜렷하게 읽힌 첫 항목. 없으면 null(관련 없는 응답을 억지로 넣지 않는다) */
export function responseLinkOf(c: FrameContext, frame: FrameDef): ResponseLink {
  for (const h of frame.hooks) if (c.survey[h.axis] === h.side) return { axis: h.axis, side: h.side, mode: h.mode, face: h.face, note: h.note };
  return null;
}

/** 어느 얼굴을 앞세울지 — 일치 · 보완이면 응답이 닿는 얼굴, 차이면 사주 쪽(반대) 얼굴을 앞세우고 차이를 설명한다. 응답이 없으면 좋은 면부터 */
export function leadFaceOf(link: ResponseLink): "bright" | "hard" {
  if (!link) return "bright";
  if (link.mode === "differ") return link.face === "bright" ? "hard" : "bright";
  return link.face;
}

// ───────────── 시기 인스턴스 고르기 ─────────────

/** 이 주제에서 사람들이 가장 흔히 기억하는 나이 — 같은 점수일 때 어느 시기를 앞세울지 정하는 설계 가설(정답이 아니다) */
const PRIME_AGE: Record<Strand, number> = { love: 26, work: 30, family: 14, growth: 18 };

const midAge = (i: FrameInstance) => (i.ageFrom + i.ageTo) / 2;

/** 시기의 두드러짐 — 천간 · 지지가 모두 맞으면 더 두드러지고, 대운(10년 창)은 세운(한 해)보다 조금 약한 대신 넓게 본다 */
function salience(frame: FrameDef, i: FrameInstance, c: FrameContext): number {
  const target = frame.id === "L6" ? c.star : frame.id === "W8" ? "재성" : null;
  let s = 0;
  if (target) {
    if (i.unit.stemGroup === target) s += 1;
    if (i.unit.branchGroup === target) s += 1;
  } else {
    s += 1;
  }
  if (i.unit.kind === "luck") s += 0.5;
  return s;
}

export type PickedInstance = { frame: FrameDef; instance: FrameInstance; score: number };

const rarity = (id: string) => -Math.log(FRAME_HIT_RATE[id] ?? 0.5);

/** 시기 프레임이 아닌 과거 회고 프레임의 인스턴스는 모두 "지난 시기"다. 연애 · 재물 시기 프레임은 시기 위치(지난 · 지금 · 앞으로)를 따른다 */
export function timeOf(frame: FrameDef, i: FrameInstance): "past" | "now" | "future" {
  if (frame.id !== "L6" && frame.id !== "W8") return "past";
  return i.unit.position === "past" ? "past" : i.unit.position === "current" ? "now" : "future";
}

export function candidatesOf(ev: Evaluation, ids: string[]): PickedInstance[] {
  return ev.hits.filter((h) => ids.includes(h.frame.id)).flatMap((h) => (h.hit.instances ?? []).map((instance) => ({ frame: h.frame, instance, score: 0 })));
}

/** 과거 시기 하나 — 두드러짐을 먼저, 같으면 이 주제에서 흔히 기억하는 나이에 가까운 쪽 */
export function pickPast(c: FrameContext, pool: PickedInstance[], used: Set<string>): PickedInstance | null {
  const scored = pool
    .filter((p) => timeOf(p.frame, p.instance) === "past" && !used.has(p.instance.unit.label))
    .map((p) => ({ ...p, score: salience(p.frame, p.instance, c) * 10 + rarity(p.frame.id) - Math.abs(midAge(p.instance) - PRIME_AGE[p.instance.strand]) / 5 }))
    .sort((a, b) => b.score - a.score || a.instance.id.localeCompare(b.instance.id));
  return scored[0] ?? null;
}

/** "앞으로"로 말하는 범위 — 지금 시기와 열 해 안에 시작하는 시기까지(현재 · 다음 대운과 가까운 세운). 그보다 먼 시기는 쓰지 않는다 */
export const AHEAD_YEARS = 10;

/** 앞으로(지금 포함) 시기 하나 — 두드러짐을 먼저, 같으면 가까운 쪽 */
export function pickAhead(c: FrameContext, pool: PickedInstance[], used: Set<string>): PickedInstance | null {
  const startYear = c.reference.year;
  const dist = (i: FrameInstance) => Math.max(0, Number(i.unit.from.slice(0, 4)) - startYear);
  const scored = pool
    .filter((p) => timeOf(p.frame, p.instance) !== "past" && dist(p.instance) <= AHEAD_YEARS && !used.has(p.instance.unit.label))
    .map((p) => ({ ...p, score: salience(p.frame, p.instance, c) * 10 - dist(p.instance) }))
    .sort((a, b) => b.score - a.score || a.instance.id.localeCompare(b.instance.id));
  return scored[0] ?? null;
}

// ───────────── 이야기 선택 ─────────────

export type StructureStory = { core: EvaluatedHit; side: EvaluatedHit | null };

export type AreaStory = {
  area: "love" | "wealth";
  structure: StructureStory | null;
  timingFrame: FrameDef | null;
  past: PickedInstance | null;
  ahead: PickedInstance | null;
};

export type PastStory = {
  /** chart: 사주에서 읽은 시기 / universal: 사주 근거가 없어 보편적인 인생 경험으로만 연결 */
  basis: "chart" | "universal";
  picks: PickedInstance[];
  universal: string[];
};

export type Selection = { love: AreaStory | null; wealth: AreaStory | null; past: PastStory };

const structureOf = (ev: Evaluation, ids: string[]): StructureStory | null => {
  const ranked = ev.hits
    .filter((h) => ids.includes(h.frame.id) && !h.hit.instances)
    .map((h) => ({ h, score: rarity(h.frame.id) + 0.25 * h.hit.facts.length }))
    .sort((a, b) => b.score - a.score || a.h.frame.id.localeCompare(b.h.frame.id));
  if (!ranked.length) return null;
  return { core: ranked[0].h, side: ranked[1]?.h ?? null };
};

const areaStory = (c: FrameContext, ev: Evaluation, area: "love" | "wealth", used: Set<string>): AreaStory | null => {
  const [structIds, timingId] = area === "love" ? [["L1", "L2", "L3", "L4", "L5"], "L6"] : [["W1", "W2", "W3", "W4", "W5", "W6", "W7"], "W8"];
  const structure = structureOf(ev, structIds);
  const pool = candidatesOf(ev, [timingId]);
  const past = pickPast(c, pool, used);
  if (past) used.add(past.instance.unit.label);
  const ahead = pickAhead(c, pool, used);
  if (ahead) used.add(ahead.instance.unit.label);
  const timingFrame = ev.hits.find((h) => h.frame.id === timingId)?.frame ?? null;
  if (!structure && !past && !ahead) return null;
  return { area, structure, timingFrame, past, ahead };
};

/** 보편적인 인생 경험 연결 — 사주 근거가 없을 때 한 줄로만 쓴다(사주에서 읽었다고 말하지 않는다) */
function universalScenes(age: number): string[] {
  if (age < 20) return [];
  if (age < 30) return ["진로와 관계에서 방향을 찾아 가던 시기는 많은 사람이 겪는다는 점"];
  return ["일과 관계의 기준을 다시 세우던 시기는 많은 사람이 겪는다는 점"];
}

const POSITIVE_FIRST: Tone2 = "positive";
type Tone2 = "positive" | "hard" | "mixed";

/** 과거 회고(6장) — 연애 · 재물 이야기에 이미 쓴 시기는 빼고, 소재 갈래가 다른 시기를 최대 둘 고른다. 첫째가 어려운 쪽이면 둘째는 긍정 시기를 먼저 찾는다 */
export function pastStoryOf(c: FrameContext, ev: Evaluation, used: Set<string>): PastStory {
  const pool = ev.hits.flatMap((h) => (h.hit.instances ?? []).map((instance) => ({ frame: h.frame, instance, score: 0 }))).filter((p) => timeOf(p.frame, p.instance) === "past");
  const first = pickPast(c, pool, used);
  if (!first) return { basis: "universal", picks: [], universal: universalScenes(c.age) };
  const used2 = new Set(used);
  used2.add(first.instance.unit.label);
  const others = pool.filter((p) => p.instance.strand !== first.instance.strand);
  const wantPositive = first.instance.tone !== POSITIVE_FIRST;
  const second = (wantPositive ? pickPast(c, others.filter((p) => p.instance.tone === POSITIVE_FIRST), used2) : null) ?? pickPast(c, others, used2);
  return { basis: "chart", picks: second ? [first, second] : [first], universal: [] };
}

export function selectStories(c: FrameContext, ev: Evaluation): Selection {
  const used = new Set<string>();
  const love = c.gender ? areaStory(c, ev, "love", used) : null;
  const wealth = areaStory(c, ev, "wealth", used);
  const past = pastStoryOf(c, ev, used);
  return { love, wealth, past };
}
