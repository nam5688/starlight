// 상황형 28문항의 무료 결과 만들기 — 읽기 결과(reading.ts)에서 고객용 종합 풀이 · 상황별 표 · 해 볼 것 · AI 근거를 코드가 만든다.
// 점수를 만들지 않는다(요약의 점수 줄은 비어 있다). 고른 선택지를 그대로 읽어 주지 않고 구분마다의 판정을 가로로 엮어 풀어 쓴다.
// 사주 계산 · 22문항 · 저장된 결과는 건드리지 않는다. 같은 응답이면 늘 같은 문장이다(AI 미사용).
import type { Evidence, Topic } from "../../report/evidence.ts";
import type { FreeInsight, InsightBasis } from "../../report/free-insight.ts";
import { SITUATION_PLAN, type Situation, type SituationId } from "../../report/situations.ts";
import type { StarterAction } from "../../report/starter-actions.ts";
import type { CoreSummary, FreeSummary } from "../../report/types.ts";
import type { Answers } from "../types.ts";
import { CONTRAST_COPY, FALLBACK_TIPS, NOTHING_CLEAR, SIDE_COPY, SUBJECT, crossNote, type SideCopy } from "./copy.ts";
import {
  DISTINCTIONS,
  SITUATIONAL_CONTENT_VERSION,
  SCENE_IDS,
  itemOf,
  pickSceneAnswers,
  readSituational,
  type DistinctionId,
  type DistinctionReading,
  type SituationalSummary,
} from "./reading.ts";

export const SITUATIONAL_SUMMARY_RULE_VERSION = "situational-summary-0.1";
/** 옛 4개 후보 이름 자리에 들어가는 중립 이름 — 28문항 결과는 옛 후보 이름(안정지향형 등)을 만들지 않는다. 유형 표시가 켜져 있으면 화면에 나오지 않는다 */
export const SITUATIONAL_TENDENCY_NAME = "상황별 읽기";

/** 저장된 응답의 질문 버전 — 키가 장면 id(s01~s28)이면 상황형 28문항, 아니면 지금까지의 22문항(예전 저장본) */
export function answerVersionOf(answers: Answers | null | undefined): "situational-28" | "likert-22" | null {
  const keys = Object.keys(answers ?? {});
  if (keys.length === 0) return null;
  const scene = keys.filter((k) => /^s\d{2}$/.test(k)).length;
  if (scene === keys.length) return "situational-28";
  if (scene === 0) return "likert-22";
  return null;
}

/** 28문항 응답 검증 — 28장면 모두에 1~4 정수, 모르는 키 없음 */
export function validateSceneAnswers(answers: Answers): { ok: true } | { ok: false; missing: string[]; invalid: string[] } {
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const id of SCENE_IDS) {
    const v = answers[id];
    if (v === undefined) missing.push(id);
    else if (!Number.isInteger(v) || v < 1 || v > 4) invalid.push(id);
  }
  for (const id of Object.keys(answers)) if (!SCENE_IDS.includes(id)) invalid.push(id);
  return missing.length === 0 && invalid.length === 0 ? { ok: true } : { ok: false, missing, invalid };
}

/** 알려진 장면의 응답만 남긴다 (모르는 키는 저장하지 않는다) */
export function pickKnownSceneAnswers(raw: Answers): Answers {
  const out: Answers = {};
  const sheet = pickSceneAnswers(raw);
  for (const id of SCENE_IDS) if (sheet[id] !== undefined && sheet[id] !== null) out[id] = sheet[id] as number;
  return out;
}

// ───────────── 읽기 → 말 ─────────────

const PRIORITY: DistinctionId[] = ["first", "energy", "basis", "structure", "explore", "repair", "confirm", "help"];
const orderOf = (d: DistinctionId) => PRIORITY.indexOf(d);

const copyOf = (r: Pick<DistinctionReading, "d" | "side">): SideCopy | null => (r.side ? (SIDE_COPY[r.d]?.[r.side] ?? null) : null);

/** 충분으로 읽힌 구분 — 일관되고 장면이 많은 것 먼저, 같으면 우선순위(막혔을 때 · 에너지 · 판단 · 구조 · 시도 · 회복 · 확인) 순. 문장이 없는 쪽은 뺀다 */
function sufficientOf(s: SituationalSummary): DistinctionReading[] {
  return s.readings
    .filter((r) => r.status === "sufficient" && copyOf(r))
    .sort((a, b) => Number(b.strength === "strong") - Number(a.strength === "strong") || Number(a.leaning === true) - Number(b.leaning === true) || orderOf(a.d) - orderOf(b.d));
}

/** 장면에 따라 갈린 구분 — 일상 구분 먼저, 그다음 가까운 관계의 방식 */
function contrastOf(s: SituationalSummary): DistinctionReading[] {
  return s.readings.filter((r) => r.status === "contrast").sort((a, b) => Number(!!DISTINCTIONS[a.d].attachmentWay) - Number(!!DISTINCTIONS[b.d].attachmentWay) || orderOf(a.d) - orderOf(b.d));
}

const attachmentLike = (d: DistinctionId) => !!DISTINCTIONS[d].attachmentWay;

/** 고객용 종합 풀이 문단 — 구분마다 따로 읽어 주지 않고 둘 이상이 함께 나타난 모습은 교차 한 문장으로 잇는다 */
export function leadTextOf(s: SituationalSummary): string {
  const suf = sufficientOf(s);
  const contrasts = contrastOf(s);
  const parts: string[] = [];
  if (suf.length === 0) {
    parts.push(NOTHING_CLEAR);
    for (const r of contrasts.slice(0, 2)) parts.push(CONTRAST_COPY[r.d]);
    return parts.join(" ");
  }
  const [a, b] = suf;
  parts.push(copyOf(a)!.trait);
  if (b) parts.push(crossNote({ d: a.d, side: a.side! }, { d: b.d, side: b.side! }) ?? copyOf(b)!.trait);
  const first = contrasts[0];
  if (first) parts.push(`같은 주제라도 장면에 따라 달라지는 부분도 있어요. ${CONTRAST_COPY[first.d]}`);
  return parts.join(" ");
}

/** 읽지 못한 부분 한 줄 — 이번 답만으로 한쪽으로 말하기 어려웠던 구분(도움 받는 방식처럼 이 질문으로는 읽을 수 없는 구분 포함). 고객 글에서 "읽은 것처럼" 쓰지 않기 위한 안내 */
export function notReadLineOf(s: SituationalSummary): string | null {
  const names = s.readings.filter((r) => r.status === "insufficient").map((r) => SUBJECT[r.d].replace(/(은|는)$/, ""));
  if (names.length === 0) return null;
  return `이번 답만으로는 한쪽으로 말하기 어려워 풀이에 쓰지 않은 부분: ${names.slice(0, 4).join(" · ")}.`;
}

function firstCopy(s: SituationalSummary, order: DistinctionId[]): { r: DistinctionReading; c: SideCopy } | null {
  const suf = s.readings.filter((r) => r.status === "sufficient" && copyOf(r));
  for (const d of order) {
    const r = suf.find((x) => x.d === d);
    if (r) return { r, c: copyOf(r)! };
  }
  return null;
}

/** 무료 요약의 core 네 칸 — 읽힌 구분에서 고르고, 없으면 상황별 차이로 말한다 */
export function coreOf(s: SituationalSummary): CoreSummary {
  const contrast = contrastOf(s)[0];
  const env = firstCopy(s, ["energy", "structure", "first", "explore", "basis", "confirm", "repair"]);
  const react = firstCopy(s, ["first", "repair", "confirm", "explore", "basis", "structure", "energy"]);
  const stress = firstCopy(s, ["first", "structure", "energy", "explore", "basis", "repair", "confirm"]);
  const tips = starterActionsOf(s);
  return {
    comfortableEnvironment: env?.c.comfy ?? "그때그때 상황에 맞춰 방식을 고를 수 있는 여지가 있는 환경",
    repeatedReaction: react?.c.reaction ?? (contrast ? CONTRAST_COPY[contrast.d] : "한 가지로 정해지기보다 장면에 따라 다르게 반응할 수 있어요."),
    stressTrigger: stress?.c.stress ?? "상황에 맞는 방식을 고를 여지 없이 한 가지만 요구받을 때",
    tryNow: tips[0].title,
  };
}

/** 바로 해볼 실천 제안 3가지 — 읽힌 구분의 제안이 먼저, 모자라면 공통 제안으로 채운다(무료는 첫 번째만 보인다) */
export function starterActionsOf(s: SituationalSummary): StarterAction[] {
  const out: StarterAction[] = [];
  const seen = new Set<string>();
  for (const r of sufficientOf(s)) {
    const t = copyOf(r)!.tip;
    if (!seen.has(t.title)) {
      seen.add(t.title);
      out.push({ title: t.title, detail: t.detail });
    }
    if (out.length === 3) return out;
  }
  for (const t of FALLBACK_TIPS) {
    if (out.length === 3) break;
    out.push({ ...t });
  }
  return out;
}

const SITUATION_ORDER: Record<SituationId, DistinctionId[]> = {
  work: ["first", "structure", "basis", "explore"],
  close: ["confirm", "repair", "energy", "basis"],
  decision: ["explore", "basis", "structure"],
  conflict: ["repair", "first", "confirm"],
};

const GENERIC_SITUATION = {
  strengthLabel: "상황에 맞춰 방식을 고름",
  cautionLabel: "기준이 약하면 흔들릴 수 있음",
  scenario: "장면마다 다르게 반응하는 모습이 있다면 이 경향 때문일 수 있어요.",
  strength: "한 가지 방식에 갇히지 않고 상황에 맞춰 달리 움직여요.",
  caution: "무엇을 기준으로 고르는지 분명하지 않으면 우선순위가 그때그때 달라질 수 있어요.",
  tip: "이번 주 가장 중요한 일 하나를 정해 가장 먼저 처리해 보세요.",
} as const;

/** 상황별 잘하는 점 · 주의할 점 — 읽힌 구분(없으면 상황별 차이 · 없으면 일반 문장)에서 만든다. 한 구분이 두 상황에 겹치지 않게 아직 쓰지 않은 구분을 먼저 고른다 */
export function situationsOf(s: SituationalSummary): Situation[] {
  const used = new Set<DistinctionId>();
  return SITUATION_PLAN.map((plan) => {
    const order = SITUATION_ORDER[plan.id];
    const readable = (d: DistinctionId) => s.readings.find((r) => r.d === d && r.status === "sufficient" && copyOf(r));
    const pick = order.find((d) => readable(d) && !used.has(d)) ?? order.find((d) => readable(d));
    if (pick) {
      used.add(pick);
      const c = copyOf(readable(pick)!)!;
      return { id: plan.id, title: plan.title, strengthLabel: c.strengthLabel, cautionLabel: c.cautionLabel, scenario: c.reaction, strength: c.strength, caution: c.burden, tip: `${c.tip.title}. ${c.tip.detail}` };
    }
    const contrast = order.find((d) => s.readings.find((r) => r.d === d && r.status === "contrast"));
    if (contrast) {
      return {
        id: plan.id,
        title: plan.title,
        strengthLabel: "상황에 따라 방식을 바꿈",
        cautionLabel: "한 가지로 정해 말하기 어려움",
        scenario: `${SUBJECT[contrast]} 장면에 따라 다르게 움직이는 모습이 있어요.`,
        strength: "한 가지 방식에 갇히지 않고 상황에 맞춰 달리 움직여요.",
        caution: "어떤 장면에서 어느 방식이 나오는지 알아 두지 않으면 나도 내 반응이 헷갈릴 수 있어요.",
        tip: "방식이 달랐던 장면 두 가지를 골라 무엇이 달랐는지 적어 보세요.",
      };
    }
    return { id: plan.id, title: plan.title, ...GENERIC_SITUATION };
  });
}

function insightOf(s: SituationalSummary): FreeInsight {
  const suf = sufficientOf(s);
  const basis: InsightBasis[] = [];
  for (const r of suf.slice(0, 2)) {
    for (const h of r.hits.filter((x) => x.side === r.side).slice(0, 3)) {
      const item = itemOf(h.scene);
      if (item) basis.push({ itemId: h.scene, text: item.scene, answer: h.option });
    }
  }
  return { version: SITUATIONAL_SUMMARY_RULE_VERSION, text: leadTextOf(s), basisModule: suf[0] && attachmentLike(suf[0].d) ? "relationship" : "temperament", basis };
}

/** 한 줄 소개 — 가장 뚜렷하게 읽힌 모습 한 줄(없으면 상황별 차이) */
export function oneLinerOf(s: SituationalSummary): string {
  const top = sufficientOf(s)[0];
  return top ? copyOf(top)!.trait : "한 가지로 모이기보다 상황에 따라 다르게 반응하는 편이에요.";
}

/** 28문항 응답으로 무료 요약을 만든다 — 점수 줄은 비어 있고(점수 환산 없음) 읽기 결과가 situational에 담긴다 */
export function buildSituationalFreeSummary(answers: Answers): FreeSummary {
  const situational = readSituational(pickSceneAnswers(answers));
  return {
    source: "dev-scoring",
    contentVersion: SITUATIONAL_CONTENT_VERSION,
    tendency: { id: "stability", name: SITUATIONAL_TENDENCY_NAME },
    oneLiner: oneLinerOf(situational),
    insight: insightOf(situational),
    core: coreOf(situational),
    temperament: [],
    relationship: [],
    mbti: { axes: [] },
    situational,
  };
}

// ───────────── AI 근거 ─────────────

const TOPICS: Record<DistinctionId, Topic[]> = {
  energy: ["personality", "relationship", "work"],
  basis: ["personality", "relationship", "work"],
  structure: ["personality", "work", "money"],
  first: ["personality", "work"],
  explore: ["personality", "work", "money"],
  confirm: ["love", "relationship"],
  repair: ["love", "relationship"],
  help: ["relationship", "love"],
};

const GUARD = "고른 선택지를 그대로 읽어 주거나 장면을 되풀이하지 않고, 사주에서 읽은 성향이 이 사람에게 어떤 장면으로 나타나는지 구체화하는 데 씁니다. 점수가 아니라 여러 장면의 답을 가로로 읽은 결과이며 원인을 단정하지 않습니다.";
const ATTACH_GUARD = " 가까운 관계의 방식은 애착 유형 이름으로 부르지 않고 어떤 장면에서 그렇게 나타나는지로만 씁니다.";

/**
 * 28문항 읽기에서 AI에 건네는 응답 근거 — 충분으로 읽힌 구분은 쪽과 함께, 장면마다 갈린 구분은 "상황별 차이"로, 읽지 못한 구분은 만들지 않는다.
 * id는 survey.s28.<구분>.<쪽>이라 22문항의 점수 근거(survey.<행>.high|low)와 섞이지 않는다. 점수 · 선택지 문장 · 유형 이름을 담지 않는다.
 */
export function situationalEvidence(s: SituationalSummary): Evidence[] {
  const out: Evidence[] = [];
  for (const r of s.readings) {
    const dist = DISTINCTIONS[r.d];
    const guard = GUARD + (dist.attachmentWay ? ATTACH_GUARD : "");
    if (r.status === "sufficient" && r.side && copyOf(r)) {
      const c = copyOf(r)!;
      out.push({
        id: `survey.s28.${r.d}.${r.side}`,
        source: "survey",
        topics: TOPICS[r.d],
        strength: r.strength === "strong" && !r.leaning ? "strong" : "moderate",
        fact: `상황형 질문 읽기 · ${dist.name}: ${dist.sides[r.side].label} 쪽으로 읽힘 (서로 다른 장면 ${r.hits.filter((h) => h.side === r.side).length}곳, 점수 아님)${r.leaning ? " — 다른 쪽으로 답한 장면도 있었어요" : ""}`,
        cue: `응답에서 읽은 행동 경향: ${c.trait.replace(/요\.$/, "요")}. 잘 쓰일 때: ${c.strength} 부담이 될 때: ${c.burden}${r.leaning ? " 다른 쪽으로 답한 장면이 있었으니 상황별 차이로 함께 씁니다." : ""} ${guard}`,
      });
    } else if (r.status === "contrast") {
      const sides = Object.entries(r.counts).filter(([, n]) => n > 0).map(([k]) => dist.sides[k].label);
      out.push({
        id: `survey.s28.${r.d}.mixed`,
        source: "survey",
        topics: TOPICS[r.d],
        strength: "moderate",
        fact: `상황형 질문 읽기 · ${dist.name}: 장면에 따라 다른 쪽으로 읽힘 (${sides.join(" / ")}, 점수 아님)`,
        cue: `응답에서 읽은 상황별 차이: ${CONTRAST_COPY[r.d]} 하나로 평균 내거나 한쪽으로 정해 쓰지 않고, 어떤 장면에서 어느 쪽이 나오는지 상황별 차이로만 씁니다. ${guard}`,
      });
    }
  }
  return out;
}

// ───────────── 개발용 규칙 리포트(AI 미연결 때의 구매 리포트) ─────────────

const DEV_LIMITS = "한 장면의 답이 아니라 여러 장면의 답을 가로로 읽은 결과예요. 장면에 따라 달라지는 모습은 평균 내지 않고 그대로 두었고, 진단이나 평생 가는 유형이 아니에요. 개발용 예시 질문이라 정확도는 검증하지 않았어요.";

function findingsOf(s: SituationalSummary, dims: DistinctionId[]): string[] {
  const out: string[] = [];
  for (const d of dims) {
    const r = s.readings.find((x) => x.d === d);
    if (!r) continue;
    const name = DISTINCTIONS[d].name;
    if (r.status === "sufficient" && copyOf(r)) out.push(`${name}: ${copyOf(r)!.trait}${r.leaning ? " 다만 다른 쪽으로 답한 장면도 있어서 대체로 그렇다고 읽어요." : ""}`);
    else if (r.status === "contrast") out.push(`${name}: ${CONTRAST_COPY[d]}`);
    else out.push(`${name}: 이번 답만으로는 한쪽으로 읽지 않았어요.`);
  }
  return out;
}

/** 개발용 규칙 리포트의 세부 칸 — 22문항의 점수 칸 대신 읽기 결과에서 만든다 */
export function devDetailsOf(s: SituationalSummary): {
  mbti: { basis: string; findings: string[]; limits: string };
  temperament: { basis: string; findings: string[]; limits: string };
  relationship: { basis: string; findings: string[]; limits: string };
  common: { point: string; basis: string[] }[];
  different: { point: string; explanation: string }[];
} {
  const suf = sufficientOf(s);
  const common: { point: string; basis: string[] }[] = [];
  for (let i = 0; i < suf.length; i++) {
    for (let j = i + 1; j < suf.length; j++) {
      const note = crossNote({ d: suf[i].d, side: suf[i].side! }, { d: suf[j].d, side: suf[j].side! });
      if (note) common.push({ point: note, basis: [DISTINCTIONS[suf[i].d].name, DISTINCTIONS[suf[j].d].name] });
    }
  }
  if (common.length === 0) common.push({ point: "서로 다른 영역에서 함께 두드러지는 모습은 적어요. 영역마다 따로 읽어 보세요.", basis: [] });
  const different = contrastOf(s).map((r) => ({ point: `${DISTINCTIONS[r.d].name}은 장면마다 갈렸어요`, explanation: `${CONTRAST_COPY[r.d]} 어느 쪽이 맞고 틀린 것이 아니라 장면에 따라 다르게 움직이는 모습이에요.` }));
  if (different.length === 0) different.push({ point: "장면마다 크게 갈린 부분은 없었어요.", explanation: "읽힌 모습을 영역별로 함께 참고하세요." });
  return {
    mbti: { basis: "상황형 28문항 읽기 (일상 · 사람들 장면 — 개발용 예시 질문)", findings: findingsOf(s, ["energy", "basis", "structure"]), limits: DEV_LIMITS },
    temperament: { basis: "상황형 28문항 읽기 (막혔을 때 · 시도 장면 — 개발용 예시 질문)", findings: findingsOf(s, ["first", "explore"]), limits: DEV_LIMITS },
    relationship: { basis: "상황형 28문항 읽기 (가까운 사이 장면 — 개발용 예시 질문)", findings: findingsOf(s, ["confirm", "repair", "help"]), limits: DEV_LIMITS },
    common,
    different,
  };
}
