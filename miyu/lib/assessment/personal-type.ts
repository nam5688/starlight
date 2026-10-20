// 개인 유형명 — 코드에 고정한 직관형 이름 10개 + "혼합 경향"(운영자 확정 2026-10-17, D1: 사주 + 행동 4축 + 기질 · 애착을 기준으로 코드가 정하고 AI가 매번 새로 이름을 만들지 않는다).
// 순수 계산이다(AI · 네트워크 없음). 이름 · 한 줄 설명 · 강점일 때 / 부담일 때 문장은 모두 이 파일에 고정돼 있다.
//
// 분류는 두 단계다.
//  ① 사주가 큰 방향을 정한다 — 원국 일곱 자리(시각을 모르면 다섯 자리)의 십신을 다섯 갈래(나와 같은 기운 · 표현하는 힘 · 현실을 다루는 힘 · 규칙과 책임 · 배우고 돕는 힘)로 세고,
//     월지(태어난 달 자리)는 전통 해석에서 가장 무겁게 보므로 한 자리를 더 센다. 가장 많은 갈래(2 이상)가 하나면 그 갈래, 같은 수로 겹치면 그 갈래들이 후보다.
//  ② 응답이 후보 갈래 안의 두 모습 가운데 어느 쪽인지 가른다 — 갈래마다 두 모습이 있고(총 10유형), 기질 · 가까운 관계 · 평소 행동 방식 네 가지 응답 중 뚜렷한 쪽이 한쪽으로 기울 때만 정한다.
//     후보 갈래가 둘 이상이면 응답이 가장 또렷하게 기운 모습의 갈래를 고른다(사주가 후보를 좁히고 응답이 그 안에서 고르는 보조 역할이며, 둘이 거의 같으면 정하지 않는다).
// 두 단계 중 하나라도 정해지지 않으면 억지로 이름을 붙이지 않고 "혼합 경향"으로 둔다(근거가 부족하면 판정 보류 — 격국에 대해 정한 원칙과 같다).
//
// 한계 — 모두 지켜서 읽는다.
//  · 갈래와 유형 이름을 잇는 표(어느 갈래가 어느 이름으로 이어지는지)는 미유가 정한 설계 가설이다. 전통 해석의 "십신 → 성격" 대응을 가져다 쓴 것이 아니라 rules.ts의 GROUP_RULE 문장(배움 · 표현 · 현실 · 책임 · 독립과 협력)을 이름으로 옮긴 것이고, 전문가 검토 전이다.
//  · 응답 기준(뚜렷한 쪽 · 기울어짐 20)은 임의로 정한 값이며 검증되지 않았다. 입력한 MBTI는 이 분류에 쓰지 않는다(선택 입력이고 자기 인식 참고값이라서).
//  · 진단이나 평생 유형이 아니다. 사주와 응답을 하나의 점수로 합산하지 않는다 — 사주가 갈래를, 응답이 그 안의 모습을 따로 정한다.
//  · 분포는 scripts/measure-personal-type.ts로 직접 센다(가정: 생년월일 균등 · 응답 점수 균등).
import type { SajuOk } from "../saju/engine.ts";
import { analyzeStructure, type Group } from "../saju/interpret/structure.ts";
import type { FreeSummary } from "../report/types.ts";

export const PERSONAL_TYPE_VERSION = "personal-type-0.1-draft";

export type PersonalTypeId =
  | "careful-deep" | "gentle-empathic"
  | "independent-driver" | "relation-balancer"
  | "fast-doer" | "explorer"
  | "steady-builder" | "flexible-adapter"
  | "standard-keeper" | "duty-finisher";

export type PersonalTypeInfo = {
  id: PersonalTypeId;
  name: string;
  /** 첫 화면에 유형명과 함께 보이는 한 줄 */
  line: string;
  /** 같은 특징이 잘 쓰일 때 */
  whenStrength: string;
  /** 같은 특징이 부담이 될 때 — "나쁘다"가 아니라 조절이 필요한 모습으로 쓴다 */
  whenBurden: string;
  /** 사주에서 큰 방향을 정한 갈래 */
  group: Group;
};

/** 갈래마다 두 모습: [A, B] — 응답이 어느 쪽인지 가른다 */
export const PERSONAL_TYPES: Record<PersonalTypeId, PersonalTypeInfo> = {
  "careful-deep": { id: "careful-deep", name: "신중 몰입형", group: "인성", line: "시작은 신중하게, 한번 잡으면 깊게 파고드는 사람", whenStrength: "충분히 살펴보고 정한 일은 흔들리지 않고 깊이 있게 끝까지 이끌어 가요.", whenBurden: "살펴보는 시간이 길어져 시작이 늦어지거나, 혼자 오래 고민하는 때가 생길 수 있어요." },
  "gentle-empathic": { id: "gentle-empathic", name: "섬세 공감형", group: "인성", line: "분위기와 마음의 결을 먼저 읽고, 그 위에서 움직이는 사람", whenStrength: "상대의 상태를 빨리 알아채서 필요한 말과 배려를 적절한 때에 건넬 수 있어요.", whenBurden: "다른 사람의 반응을 오래 담아 두면 내 마음이 지치거나 결정이 늦어질 수 있어요." },
  "independent-driver": { id: "independent-driver", name: "독립 추진형", group: "비겁", line: "내 기준으로 방향을 정하고 혼자서도 밀고 나가는 사람", whenStrength: "방향이 서면 주변의 속도와 상관없이 스스로 책임지고 일을 앞으로 밀어 가요.", whenBurden: "혼자 끌고 가다 도움을 청할 타이밍을 놓치거나, 함께하는 사람이 소외감을 느낄 수 있어요." },
  "relation-balancer": { id: "relation-balancer", name: "관계 조율형", group: "비겁", line: "사람 사이의 온도를 맞추며 함께 가는 길을 찾는 사람", whenStrength: "서로 다른 입장을 이어 주고 함께 움직이는 분위기를 만들어 일을 부드럽게 풀어 가요.", whenBurden: "모두의 입장을 맞추느라 내 몫의 말을 미루게 되면 속으로 부담이 쌓일 수 있어요." },
  "fast-doer": { id: "fast-doer", name: "빠른 실행형", group: "식상", line: "생각이 서면 바로 움직여 결과로 보여 주는 사람", whenStrength: "일단 해 보며 길을 찾는 속도가 빨라서 눈에 보이는 결과를 일찍 만들어 내요.", whenBurden: "속도가 앞서 세부 확인이 빠지거나, 다른 사람이 따라올 시간을 놓칠 수 있어요." },
  "explorer": { id: "explorer", name: "탐색 확장형", group: "식상", line: "새로운 가능성을 찾아 시선과 활동을 넓혀 가는 사람", whenStrength: "아직 정해지지 않은 길에서 새로운 연결과 아이디어를 발견해 판을 넓혀 가요.", whenBurden: "관심이 여러 곳으로 퍼져 하나를 끝까지 마무리하기 전에 다음으로 넘어갈 수 있어요." },
  "steady-builder": { id: "steady-builder", name: "안정 구축형", group: "재성", line: "한 칸씩 확실하게 쌓아 단단한 기반을 만드는 사람", whenStrength: "확인한 만큼 쌓아 가기 때문에 시간이 지날수록 믿고 맡길 수 있는 기반이 만들어져요.", whenBurden: "익숙한 방식을 지키려다 새로운 시도에 몸이 무거워질 수 있어요." },
  "flexible-adapter": { id: "flexible-adapter", name: "유연 적응형", group: "재성", line: "상황에 맞춰 방향을 바꾸며 길을 만들어 가는 사람", whenStrength: "환경이 바뀌어도 현실에 맞게 방식을 조정해서 기회를 놓치지 않고 이어 가요.", whenBurden: "맞추는 데 익숙해 내가 원하는 방향이 흐려지거나 우선순위가 자주 바뀔 수 있어요." },
  "standard-keeper": { id: "standard-keeper", name: "기준 중심형", group: "관성", line: "원칙과 기준이 서야 마음이 놓이고, 그 기준으로 판단하는 사람", whenStrength: "기준이 분명해서 선택이 흔들릴 때 중심을 잡아 주고 공정하게 정리해 줘요.", whenBurden: "기준이 맞지 않는 상황이나 사람에게 엄격해져 거리감이 생길 수 있어요." },
  "duty-finisher": { id: "duty-finisher", name: "책임 완수형", group: "관성", line: "맡은 일과 관계를 끝까지 책임지려는 사람", whenStrength: "한번 맡은 일은 끝까지 챙겨서 주변이 믿고 기대는 사람이 되기 쉬워요.", whenBurden: "책임을 혼자 안고 가며 쉬는 때를 놓치면 지치기 쉬워요." },
};

export const PERSONAL_TYPE_IDS = Object.keys(PERSONAL_TYPES) as PersonalTypeId[];

/** 사주의 방향이 정해져도 응답이 기울지 않았을 때(또는 방향 자체가 정해지지 않았을 때) — 이름을 억지로 붙이지 않는다 */
export const MIXED_TYPE = {
  name: "혼합 경향",
  line: "한 가지 유형으로 묶기보다 여러 경향이 함께 보이는 사람",
  note: "지금의 사주 구조와 응답만으로는 한 가지 이름으로 정하기 어려워요. 이름을 억지로 붙이지 않고 여러 경향이 섞여 있는 것으로 읽어요.",
} as const;

/** 유형을 보이는 화면마다 함께 적는 안내 */
export const PERSONAL_TYPE_NOTE = "진단이나 평생 유형이 아니라, 지금의 사주 구조와 응답에서 가장 두드러진 경향에 붙인 이름이에요. 상황에 따라 다른 모습도 얼마든지 나와요. 미유가 정한 규칙으로 계산한 것이며 전문가 검토 전이에요.";

/** 갈래의 쉬운 말 — 사주 용어 없이 "무엇이 두드러지는지"만 */
export const GROUP_PLAIN: Record<Group, string> = {
  비겁: "자기 기준과 독립 · 협력",
  식상: "표현하고 만들어 내는 힘",
  재성: "현실을 다루고 성과를 쌓는 힘",
  관성: "규칙 · 책임 · 평판",
  인성: "배우고 검토하며 도움을 받는 힘",
};

export type TiltResult = {
  /** 갈래별 자리 수(월지는 한 자리를 더 센 값) */
  counts: Record<Group, number>;
  /** 가장 많은 갈래(2 이상) — 같은 수로 겹치면 여럿, 없으면 빈 배열 */
  candidates: Group[];
  /** 후보가 하나일 때 그 갈래 */
  dominant: Group | null;
  /** 후보가 정해지지 않은 이유 */
  reason: "ok" | "balanced" | "month-uncertain";
};

const GROUPS: Group[] = ["비겁", "식상", "재성", "관성", "인성"];
export const TILT_RULE = { monthBonus: 1, minTop: 2 } as const;

function tiltCounts(saju: SajuOk, withMonthBonus: boolean): Record<Group, number> {
  const st = analyzeStructure({ dayMaster: saju.dayMaster.stem, pillars: saju.pillars.map((p) => ({ key: p.key, stem: p.stem, branch: p.branch })) });
  const counts: Record<Group, number> = { 비겁: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 };
  for (const p of st.pillars) {
    counts[p.branch.group] += 1;
    if (p.key === "month" && withMonthBonus) counts[p.branch.group] += TILT_RULE.monthBonus;
    if (p.key !== "day" && p.stem.group) counts[p.stem.group] += 1;
  }
  return counts;
}

function candidatesOf(counts: Record<Group, number>): Group[] {
  const top = Math.max(...GROUPS.map((g) => counts[g]));
  return top >= TILT_RULE.minTop ? GROUPS.filter((g) => counts[g] === top) : [];
}

/**
 * 사주에서 큰 방향(갈래 후보)을 정한다. 월주가 절기 경계에 걸려 달라질 수 있으면(월주 uncertain) 월지의 가중치를 넣었을 때와 뺐을 때 후보가 같을 때만 정한다.
 */
export function sajuTilt(saju: SajuOk): TiltResult {
  const monthUncertain = saju.notes.some((n) => (n.kind === "jeolgi-day" || n.kind === "near-boundary" || n.kind === "jasi-school") && n.pillars.includes("month"));
  const counts = tiltCounts(saju, true);
  const candidates = candidatesOf(counts);
  if (monthUncertain) {
    const other = candidatesOf(tiltCounts(saju, false));
    if (candidates.length === 0 || candidates.join() !== other.join()) return { counts, candidates: [], dominant: null, reason: "month-uncertain" };
  }
  return candidates.length ? { counts, candidates, dominant: candidates.length === 1 ? candidates[0] : null, reason: "ok" } : { counts, candidates: [], dominant: null, reason: "balanced" };
}

// ───────────── 응답으로 갈래 안의 두 모습 가르기 ─────────────

type Part = { row: string; /** 이 모습일 때 점수가 높은가(high) 낮은가(low) */ toward: "high" | "low" };
/** 갈래마다 [A 모습, B 모습] — A와 B는 가능하면 같은 응답의 반대쪽이다 */
export const FLAVOR_RULES: Record<Group, { a: PersonalTypeId; b: PersonalTypeId; aParts: Part[]; bParts: Part[] }> = {
  인성: { a: "careful-deep", b: "gentle-empathic", aParts: [{ row: "caution", toward: "high" }, { row: "tf", toward: "low" }], bParts: [{ row: "sensitivity", toward: "high" }, { row: "tf", toward: "high" }] },
  비겁: { a: "independent-driver", b: "relation-balancer", aParts: [{ row: "avoidance", toward: "high" }, { row: "ei", toward: "high" }], bParts: [{ row: "avoidance", toward: "low" }, { row: "ei", toward: "low" }] },
  식상: { a: "fast-doer", b: "explorer", aParts: [{ row: "persistence", toward: "high" }, { row: "sn", toward: "low" }], bParts: [{ row: "novelty", toward: "high" }, { row: "sn", toward: "high" }] },
  재성: { a: "steady-builder", b: "flexible-adapter", aParts: [{ row: "caution", toward: "high" }, { row: "jp", toward: "low" }], bParts: [{ row: "caution", toward: "low" }, { row: "jp", toward: "high" }] },
  관성: { a: "standard-keeper", b: "duty-finisher", aParts: [{ row: "tf", toward: "low" }, { row: "sensitivity", toward: "low" }], bParts: [{ row: "tf", toward: "high" }, { row: "persistence", toward: "high" }] },
};

/** 두 모습의 차이가 이만큼(0~50 기준, 가운데에서 벗어난 정도의 평균 차이) 이상이어야 한쪽으로 정한다 — 임의로 정한 값, 검증되지 않음 */
export const FLAVOR_MIN_DIFF = 20;
/** 한 응답이 "뚜렷하다"고 읽는 가운데에서의 거리(survey-evidence.ts의 65 · 35와 같은 기준) */
export const CLEAR_DISTANCE = 15;

/** 응답 점수를 id → 0~100으로 모은다(기질 · 가까운 관계 · 평소 행동 방식) */
export function responseScores(summary: Pick<FreeSummary, "temperament" | "relationship" | "mbti">): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of [...summary.temperament, ...summary.relationship]) out[r.id] = r.score;
  for (const r of summary.mbti?.axes ?? []) out[r.id] = r.score;
  return out;
}

export type FlavorRead = { a: number | null; b: number | null; diff: number | null; winner: "a" | "b" | null; reason: "ok" | "no-data" | "unclear" };

/** 한 모습의 기울기: 뚜렷한 응답(가운데에서 15 이상)만 골라 그 모습 쪽으로 얼마나 벗어났는지의 평균. 뚜렷한 응답이 없으면 null */
function partsLean(scores: Record<string, number>, parts: Part[]): number | null {
  const leans: number[] = [];
  for (const p of parts) {
    const s = scores[p.row];
    if (typeof s !== "number") continue;
    const dev = p.toward === "high" ? s - 50 : 50 - s;
    if (Math.abs(s - 50) >= CLEAR_DISTANCE) leans.push(dev);
  }
  return leans.length ? leans.reduce((x, y) => x + y, 0) / leans.length : null;
}

export function readFlavor(group: Group, scores: Record<string, number>): FlavorRead {
  const rule = FLAVOR_RULES[group];
  const a = partsLean(scores, rule.aParts);
  const b = partsLean(scores, rule.bParts);
  if (a === null && b === null) return { a, b, diff: null, winner: null, reason: "no-data" };
  // 한쪽만 뚜렷하면 다른 쪽은 0(기울지 않음)으로 둔다
  const diff = (a ?? 0) - (b ?? 0);
  if (Math.abs(diff) < FLAVOR_MIN_DIFF) return { a, b, diff, winner: null, reason: "unclear" };
  return { a, b, diff, winner: diff > 0 ? "a" : "b", reason: "ok" };
}

export type PersonalType =
  | { kind: "type"; info: PersonalTypeInfo; tilt: TiltResult; flavor: FlavorRead; /** 상황형 28문항 읽기에서만 있다 — 이름의 근거 한 문장 */ why?: string }
  | { kind: "mixed"; tilt: TiltResult; flavor: FlavorRead | null; reason: "saju-balanced" | "month-uncertain" | "response-unclear" | "response-missing"; /** 상황형 28문항 읽기에서만 있다 — 이름을 붙이지 않은 이유 한 문장 */ why?: string };

/** 후보 갈래가 둘 이상일 때, 가장 또렷하게 기운 모습의 갈래가 둘째보다 이만큼 이상 앞서야 고른다 — 임의로 정한 값, 검증되지 않음 */
export const CANDIDATE_MIN_LEAD = 10;

/** 개인 유형을 정한다. 만세력이 계산한 원국(SajuOk)이 있는 결과에만 쓴다 — 계산되지 않은 결과에는 부르지 않는다 */
export function personalTypeOf(input: { saju: SajuOk; summary: Pick<FreeSummary, "temperament" | "relationship" | "mbti"> }): PersonalType {
  const tilt = sajuTilt(input.saju);
  if (tilt.candidates.length === 0) return { kind: "mixed", tilt, flavor: null, reason: tilt.reason === "month-uncertain" ? "month-uncertain" : "saju-balanced" };
  const scores = responseScores(input.summary);
  const reads = tilt.candidates.map((group) => ({ group, flavor: readFlavor(group, scores) }));
  const decided = reads.filter((r) => r.flavor.winner).sort((x, y) => Math.abs(y.flavor.diff ?? 0) - Math.abs(x.flavor.diff ?? 0));
  const best = decided[0];
  const strongestUnclear = reads.find((r) => r.flavor.reason === "unclear") ?? reads[0];
  if (!best) {
    const missing = reads.every((r) => r.flavor.reason === "no-data");
    return { kind: "mixed", tilt, flavor: strongestUnclear.flavor, reason: missing ? "response-missing" : "response-unclear" };
  }
  if (decided[1] && Math.abs(best.flavor.diff ?? 0) - Math.abs(decided[1].flavor.diff ?? 0) < CANDIDATE_MIN_LEAD) return { kind: "mixed", tilt, flavor: best.flavor, reason: "response-unclear" };
  const rule = FLAVOR_RULES[best.group];
  return { kind: "type", info: PERSONAL_TYPES[best.flavor.winner === "a" ? rule.a : rule.b], tilt, flavor: best.flavor };
}

/** 화면에 보일 이름과 한 줄 — 혼합 경향이면 사주에서 두드러진 쪽이 있을 때 그 쪽을 쉬운 말로 덧붙인다 */
export function personalTypeView(t: PersonalType): { name: string; line: string; strength: string | null; burden: string | null; note: string; /** 이름의 근거 · 붙이지 않은 이유 한 문장(상황형 28문항 결과에만) */ why: string | null } {
  if (t.kind === "type") return { name: t.info.name, line: t.info.line, strength: t.info.whenStrength, burden: t.info.whenBurden, note: PERSONAL_TYPE_NOTE, why: t.why ?? null };
  const tilt = t.tilt.candidates.length ? ` 사주에서는 ${t.tilt.candidates.map((g) => `‘${GROUP_PLAIN[g]}’`).join(" · ")} 쪽이 조금 더 두드러져요.` : "";
  return { name: MIXED_TYPE.name, line: MIXED_TYPE.line, strength: null, burden: null, note: MIXED_TYPE.note + tilt + " " + PERSONAL_TYPE_NOTE, why: t.why ?? null };
}
