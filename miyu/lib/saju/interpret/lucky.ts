// ME:U 럭키 지수 — 사주 원국만으로 계산하는 고정 콘텐츠 지수(운영자 확정 2026-10-17, D2: 점수 금지 규칙의 두 번째 예외).
// 순수 계산이다(AI · 네트워크 없음). 총점도 하위 지수 네 개도 코드가 계산하고 AI는 숫자를 만들지 않는다. 문구는 모두 이 파일에 고정돼 있다.
//
// 뜻: "타고난 사주 구조에서 도움 · 기회 · 재물 연결 · 회복이 얼마나 자연스럽게 생기는지를 미유식으로 센 고정 콘텐츠 지수"다.
//     성공 확률 · 정확도 · 사람의 가치가 아니고, 낮은 점수는 "운이 나쁘다"가 아니라 "운이 먼저 굴러오기보다 행동으로 흐름을 만드는 힘이 중요한 타입"이다(점수대별 문구는 아래에 고정).
//
// 지킬 조건(CLAUDE.md의 두 번째 예외):
//  ① 계산 재료와 방향을 함께 보인다(LUCKY_METHOD) ② "예측이 아니며 보장하지 않는다"를 지수 옆에 적는다(LUCKY_NOTE) ③ 사주 원국에서만 계산한다 — 응답 · MBTI · 성향 점수와 합산하지 않는다(입력에 saju만 받는다)
//  ④ 숫자는 AI가 쓰는 리포트 본문에 쓰지 않고 코드가 그리는 카드에만 보인다(지금 화면 스위치 LUCKY_INDEX.visible은 꺼 둔다) ⑤ 임의로 정한 규칙이라 "전문가 검토 전 초안 · 검증되지 않았다"를 표시한다
//  ⑥ 분포를 직접 센다(scripts/measure-lucky.ts — 가정: 생년월일 균등) ⑦ 시기(대운 · 세운)는 넣지 않는다 — "올해의 럭키 흐름"은 v1 이후다.
//
// 한계 — 지켜서 읽는다.
//  · 아래 점수표(어떤 원국 모양에 몇 점을 주는지)와 점수를 옮기는 눈금은 미유가 정한 설계 가설이다. 전통 해석의 서술(인성 = 돕는 기운, 식상 = 표현, 재성 = 현실 · 재물, 관성 = 책임, 합 = 맞춰 감, 충 = 움직임)에서 방향만 가져왔고
//    문헌에서 점수를 확인한 것이 아니며, 어떤 원국이 실제로 운이 좋다는 증거도 없다. 전문가 검토 전이다.
//  · 신살(천을귀인 등)은 계산하지 않았으므로 쓰지 않는다. 격국 · 용신도 쓰지 않는다.
//  · 눈금은 무작위 원국의 분포를 먼저 센 뒤 점수가 한쪽에 몰리지 않게 정했다(측정 뒤 정한 값 — 점수의 의미가 아니라 보기 좋은 분포를 위한 값이다).
import { branchRelations, stemRelation } from "./relations.ts";
import type { SajuOk } from "../engine.ts";
import { analyzeStructure, type Group } from "./structure.ts";

export const LUCKY_VERSION = "lucky-index-0.1-draft";

export type LuckySubId = "people" | "chance" | "wealth" | "recovery";
export const LUCKY_SUB_IDS: LuckySubId[] = ["people", "chance", "wealth", "recovery"];

export type LuckyItem = { label: string; points: number };
export type LuckySub = {
  id: LuckySubId;
  /** 화면 이름 */
  name: string;
  /** 0~100, 점수 눈금을 거친 값 */
  score: number;
  /** 눈금 전 점수표의 합 */
  raw: number;
  band: "high" | "mid" | "low";
  /** 이 지수에 들어간 원국의 모양 — 적용된 것만(내부 확인 · 시험용, 화면에 점수표를 보이지 않는다) */
  items: LuckyItem[];
  /** 이 구간의 고정 문구 */
  text: string;
};

export type LuckyIndex = {
  version: string;
  total: number;
  totalBand: "high" | "mid" | "low";
  totalText: string;
  subs: LuckySub[];
  /** 가장 강한 럭키 포인트 — 하위 지수 가운데 가장 높은 것(동점이면 사람 → 기회 → 재물 → 회복 순). 모두 비슷하거나 낮으면 null */
  strongest: { id: LuckySubId; name: string; line: string } | null;
  /** 모두 비슷하거나 높은 것이 뚜렷하지 않을 때의 한 줄 */
  fallbackLine: string | null;
  /** 시각을 몰라 시주 없이 계산했거나 절기 · 자시 경계에 걸려 달라질 수 있을 때의 안내 */
  caveat: string | null;
};

type Pos = { key: "year" | "month" | "day" | "hour"; kind: "stem" | "branch"; group: Group; tenGod: string };

const scaleOf = (positions: number) => 7 / positions;
const cap = (n: number, max: number) => Math.min(n, max);

type Material = {
  /** 7자리로 환산한 갈래별 자리 수(시각을 모르면 5자리를 7자리로 늘려 센다) */
  cnt: Record<Group, number>;
  godCnt: Record<string, number>;
  monthGroup: Group;
  combineAll: number;
  combineDay: number;
  stemCombine: number;
  clashAll: number;
  clashDay: number;
  exposed: number;
  strongRoots: number;
  deukRyeong: boolean;
  strength: "받는 쪽" | "덜 받는 쪽" | "갈림";
  hourKnown: boolean;
};

export function luckyMaterial(saju: SajuOk): Material {
  const st = analyzeStructure({ dayMaster: saju.dayMaster.stem, pillars: saju.pillars.map((p) => ({ key: p.key, stem: p.stem, branch: p.branch })) });
  const poses: Pos[] = [];
  for (const p of st.pillars) {
    poses.push({ key: p.key, kind: "branch", group: p.branch.group, tenGod: p.branch.tenGod });
    if (p.key !== "day" && p.stem.group) poses.push({ key: p.key, kind: "stem", group: p.stem.group, tenGod: p.stem.tenGod });
  }
  const k = scaleOf(poses.length);
  const cnt: Record<Group, number> = { 비겁: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 };
  const godCnt: Record<string, number> = {};
  for (const p of poses) {
    cnt[p.group] += k;
    godCnt[p.tenGod] = (godCnt[p.tenGod] ?? 0) + k;
  }
  const branches = saju.pillars.map((p) => ({ key: p.key, branch: p.branch }));
  let combineAll = 0, combineDay = 0, clashAll = 0, clashDay = 0;
  for (let i = 0; i < branches.length; i++) {
    for (let j = i + 1; j < branches.length; j++) {
      const rel = branchRelations(branches[i].branch, branches[j].branch);
      const hasCombine = rel.some((r) => r.kind === "육합" || r.kind === "반합");
      const hasClash = rel.some((r) => r.kind === "충");
      const withDay = branches[i].key === "day" || branches[j].key === "day";
      if (hasCombine) { combineAll++; if (withDay) combineDay++; }
      if (hasClash) { clashAll++; if (withDay) clashDay++; }
    }
  }
  const stems = saju.pillars.map((p) => p.stem);
  let stemCombine = 0;
  for (let i = 0; i < stems.length; i++) for (let j = i + 1; j < stems.length; j++) if (stemRelation(stems[i], stems[j]) || stemRelation(stems[j], stems[i])) stemCombine++;
  const monthP = st.pillars.find((p) => p.key === "month")!;
  return {
    cnt, godCnt, monthGroup: monthP.branch.group, combineAll, combineDay, stemCombine, clashAll, clashDay,
    exposed: st.exposed.length, strongRoots: st.roots.strong.length, deukRyeong: st.month.deukRyeong, strength: st.strength.candidate, hourKnown: st.hourKnown,
  };
}

// ───────────── 점수표(설계 가설) ─────────────

type Rule = { label: string; points: (m: Material) => number };
const rule = (label: string, points: (m: Material) => number): Rule => ({ label, points });

export const LUCKY_RULES: Record<LuckySubId, { name: string; max: number; rules: Rule[] }> = {
  // 귀인 · 사람복 — 도와주는 기운 · 믿을 만한 사람 · 동료 · 가까운 자리의 합(맞춰 가려는 힘)
  people: {
    name: "귀인 · 사람복",
    max: 8.5,
    rules: [
      rule("나를 돕는 기운(인성)이 원국에 있음", (m) => cap(m.cnt.인성, 3)),
      rule("안정적인 책임의 기운(정관)이 원국에 있음", (m) => cap(m.godCnt["정관"] ?? 0, 2)),
      rule("나와 같은 기운(비겁)이 있음 — 동료와 친구", (m) => cap(m.cnt.비겁, 2) * 0.5),
      rule("가까운 자리(일지)가 다른 자리와 합을 이룸", (m) => cap(m.combineDay, 2)),
      rule("천간끼리 합을 이룸", (m) => cap(m.stemCombine, 1) * 0.5),
      rule("가까운 자리(일지)가 다른 자리와 충을 이룸", (m) => (m.clashDay > 0 ? -1 : 0)),
    ],
  },
  // 기회 연결 — 표현하고 드러내는 힘 · 현실의 기회 · 지지의 합(연결) · 충(움직임) · 숨은 기운이 겉으로 쓰임(투간)
  chance: {
    name: "기회 연결",
    max: 7.5,
    rules: [
      rule("표현하고 만들어 내는 기운(식상)이 있음", (m) => cap(m.cnt.식상, 3)),
      rule("현실을 다루는 기운(재성)이 있음", (m) => cap(m.cnt.재성, 2) * 0.5),
      rule("지지끼리 합을 이룸 — 연결", (m) => cap(m.combineAll, 3) * 0.5),
      rule("지지끼리 충을 이룸 — 움직임", (m) => cap(m.clashAll, 2) * 0.5),
      rule("월지 속 숨은 기운이 천간에 드러남(투간)", (m) => (m.exposed > 0 ? 1 : 0)),
    ],
  },
  // 재물 흐름 — 재성 · 표현이 현실로 이어지는 구조 · 월지의 재성 · 재성을 감당할 힘 · 같은 기운이 너무 많을 때의 부담
  wealth: {
    name: "재물 흐름",
    max: 5.5,
    rules: [
      rule("현실을 다루는 기운(재성)이 있음", (m) => cap(m.cnt.재성, 3)),
      rule("표현하는 기운(식상)이 재성으로 이어지는 구조", (m) => (m.cnt.식상 >= 1 && m.cnt.재성 >= 1 ? 1 : 0)),
      rule("태어난 달 자리(월지)가 재성", (m) => (m.monthGroup === "재성" ? 1 : 0)),
      rule("나의 힘이 받는 쪽이라 재성을 감당할 힘이 있음", (m) => (m.strength === "받는 쪽" && m.cnt.재성 >= 1 ? 0.5 : 0)),
      rule("나와 같은 기운(비겁)이 많고 재성이 적음 — 부담", (m) => (m.cnt.비겁 >= 4 && m.cnt.재성 <= 1 ? -1 : 0)),
    ],
  },
  // 회복 · 반전 — 돕는 기운 · 버티는 힘(같은 기운 · 뿌리) · 태어난 달의 도움 · 부딪힘이 계기가 되는 구조 · 압박이 크고 받쳐 줄 기운이 없을 때의 부담
  recovery: {
    name: "회복 · 반전",
    max: 6.5,
    rules: [
      rule("나를 돕는 기운(인성)이 있음", (m) => cap(m.cnt.인성, 2)),
      rule("나와 같은 기운(비겁)이 있음 — 버티는 힘", (m) => cap(m.cnt.비겁, 2) * 0.5),
      rule("일간과 같은 오행이 지지의 중심 기운에 뿌리내림", (m) => cap(m.strongRoots, 2)),
      rule("태어난 달의 도움을 받음(득령)", (m) => (m.deukRyeong ? 1 : 0)),
      rule("지지끼리 충을 이룸 — 반전의 계기", (m) => (m.clashAll > 0 ? 0.5 : 0)),
      rule("규칙 · 책임의 기운(관성)이 많은데 돕는 기운(인성)이 없음 — 부담", (m) => (m.cnt.관성 >= 3 && m.cnt.인성 === 0 ? -1 : 0)),
    ],
  },
};

/**
 * 점수표의 합(raw)을 0~100으로 옮기는 눈금: score = floor + span × clamp(raw / max). 무작위 원국의 분포를 센 뒤 정한 값이다(scripts/measure-lucky.ts) — 점수의 의미가 아니라 분포를 위한 값.
 * raw가 음수이면 floor 밑으로 내려가지 않는다.
 */
export const LUCKY_SCALE: Record<LuckySubId, { floor: number; span: number }> = {
  people: { floor: 35, span: 70 },
  chance: { floor: 28, span: 70 },
  wealth: { floor: 40, span: 55 },
  recovery: { floor: 28, span: 70 },
};

/** 총점 = 네 지수의 평균을 중심(60)에서 이만큼 늘린 값. 네 지수를 평균 내면 한가운데에 몰려 구간이 갈리지 않아 분포를 센 뒤 늘렸다(측정 뒤 정한 값) */
export const LUCKY_TOTAL_STRETCH = { center: 60, factor: 1.8, min: 20, max: 99 } as const;

/** 구간 경계 — 이 점수 이상이면 high, 이 점수 미만이면 low(그 사이가 mid). 분포를 센 뒤 정한 값 */
export const LUCKY_BANDS = { high: 72, low: 48 } as const;
/** 하위 지수 가운데 가장 높은 것이 이 점수 이상이고 둘째와 이만큼 이상 차이가 날 때만 "가장 강한 럭키 포인트"로 말한다 */
export const LUCKY_STRONGEST = { minScore: 65, minLead: 5 } as const;

/** 총점의 구간 경계 — 총점은 눈금을 늘린 값이라 하위 지수와 경계를 따로 둔다(분포를 센 뒤 정한 값) */
export const LUCKY_TOTAL_BANDS = { high: 72, low: 52 } as const;

const bandOf = (score: number, b: { high: number; low: number } = LUCKY_BANDS): "high" | "mid" | "low" => (score >= b.high ? "high" : score < b.low ? "low" : "mid");

// ───────────── 고정 문구 ─────────────

/** 하위 지수별 구간 문구 — 낮은 구간도 "운이 나쁘다"가 아니라 행동으로 흐름을 만드는 쪽이라고 쓴다 */
export const LUCKY_SUB_TEXT: Record<LuckySubId, Record<"high" | "mid" | "low", string>> = {
  people: {
    high: "필요한 때 도움이 되는 사람이 곁에 나타나기 쉬운 구조예요.",
    mid: "도움을 주고받는 인연이 무리 없이 이어지는 구조예요.",
    low: "도움이 먼저 찾아오기보다, 내가 먼저 손을 내밀어 인연을 만들 때 힘이 생기는 타입이에요.",
  },
  chance: {
    high: "내가 드러내고 움직이면 기회가 이어지기 쉬운 구조예요.",
    mid: "기회가 꾸준히 오가는 구조라 움직인 만큼 연결돼요.",
    low: "기회가 먼저 굴러오기보다, 내가 먼저 움직이고 드러낼 때 흐름이 생기는 타입이에요.",
  },
  wealth: {
    high: "재물과 자원이 현실로 이어지는 길이 비교적 자연스러운 구조예요.",
    mid: "재물 흐름이 무리 없이 이어지는 구조라 관리하는 만큼 쌓여요.",
    low: "재물이 저절로 쌓이기보다, 계획하고 관리하는 행동으로 흐름을 만드는 타입이에요.",
  },
  recovery: {
    high: "힘든 일이 있어도 회복하고 다시 일어서는 바탕이 단단한 구조예요.",
    mid: "흔들려도 시간을 두고 회복해 가는 구조예요.",
    low: "회복이 자동으로 되기보다, 쉬고 정리하는 행동을 스스로 챙길 때 반전이 만들어지는 타입이에요.",
  },
};

/** 가장 강한 럭키 포인트 한 줄 */
export const LUCKY_STRONGEST_LINE: Record<LuckySubId, string> = {
  people: "사람을 통해 도움이 연결되는 운이 강한 편",
  chance: "움직이면 기회가 이어지는 운이 강한 편",
  wealth: "재물이 현실로 이어지는 운이 강한 편",
  recovery: "다시 일어서는 회복의 운이 강한 편",
};

export const LUCKY_FALLBACK_LINE = "한쪽으로 크게 치우치지 않은 고른 구조예요. 필요한 쪽을 행동으로 채워 가는 타입이에요.";

export const LUCKY_TOTAL_TEXT: Record<"high" | "mid" | "low", string> = {
  high: "타고난 구조에서 도움 · 기회 · 재물 · 회복이 비교적 자연스럽게 이어지는 편이에요.",
  mid: "도움 · 기회 · 재물 · 회복이 고르게 이어지는 구조예요. 움직인 만큼 연결돼요.",
  low: "운이 먼저 굴러오기보다, 행동으로 흐름을 만드는 힘이 중요한 타입이에요.",
};

/** 지수 옆에 항상 적는 안내 */
export const LUCKY_NOTE = "럭키 지수는 타고난 사주 구조에서 도움 · 기회 · 재물 · 회복의 연결이 얼마나 자연스럽게 생기는지를 미유 규칙으로 센 고정 콘텐츠 지수예요. 성공 확률이나 정확도, 사람의 가치를 말하는 숫자가 아니고 점수가 낮다고 운이 나쁜 것도 아니에요. 예측이 아니며 결과를 보장하지 않아요. 임의로 정한 규칙이라 전문가 검토 전 초안이고 검증되지 않았어요.";

/** "이 지수는 이렇게 계산했어요" — 재료와 방향만(점수표의 숫자는 싣지 않는다) */
export const LUCKY_METHOD = [
  "태어난 날짜와 시각으로 계산한 사주만 써요. 설문 응답 · MBTI · 올해의 시기는 넣지 않아요.",
  "귀인 · 사람복은 나를 돕는 기운과 믿을 만한 책임의 기운, 동료의 기운, 가까운 자리가 다른 자리와 맞물리는지를 봐요.",
  "기회 연결은 표현하는 기운, 현실의 기회, 자리끼리 이어지고 움직이는 구조, 숨은 기운이 겉으로 쓰이는지를 봐요.",
  "재물 흐름은 현실을 다루는 기운, 표현이 현실로 이어지는 구조, 태어난 달 자리를 봐요.",
  "회복 · 반전은 돕는 기운, 버티는 힘, 태어난 달의 도움, 부딪힘이 계기가 되는 구조를 봐요.",
  "총점은 네 지수를 평균 낸 뒤 점수가 한가운데에 몰리지 않게 눈금을 늘린 값이에요. 위 재료를 센 값이며 같은 사주면 언제나 같은 값이에요.",
] as const;

// ───────────── 계산 ─────────────

const scoreOf = (id: LuckySubId, raw: number) => {
  const { floor, span } = LUCKY_SCALE[id];
  const ratio = Math.max(0, Math.min(1, raw / LUCKY_RULES[id].max));
  return Math.round(floor + span * ratio);
};

export function luckyIndexOf(saju: SajuOk): LuckyIndex {
  const m = luckyMaterial(saju);
  const subs: LuckySub[] = LUCKY_SUB_IDS.map((id) => {
    const def = LUCKY_RULES[id];
    const items = def.rules.map((r) => ({ label: r.label, points: r.points(m) })).filter((i) => i.points !== 0);
    const raw = items.reduce((a, b) => a + b.points, 0);
    const score = scoreOf(id, raw);
    const band = bandOf(score);
    return { id, name: def.name, score, raw, band, items, text: LUCKY_SUB_TEXT[id][band] };
  });
  const mean = subs.reduce((a, b) => a + b.score, 0) / subs.length;
  const total = Math.max(LUCKY_TOTAL_STRETCH.min, Math.min(LUCKY_TOTAL_STRETCH.max, Math.round(LUCKY_TOTAL_STRETCH.center + (mean - LUCKY_TOTAL_STRETCH.center) * LUCKY_TOTAL_STRETCH.factor)));
  const totalBand = bandOf(total, LUCKY_TOTAL_BANDS);
  const sorted = [...subs].sort((a, b) => b.score - a.score || LUCKY_SUB_IDS.indexOf(a.id) - LUCKY_SUB_IDS.indexOf(b.id));
  const clear = sorted[0].score >= LUCKY_STRONGEST.minScore && sorted[0].score - sorted[1].score >= LUCKY_STRONGEST.minLead;
  const uncertainPillars = new Set(saju.notes.filter((n) => n.kind === "jeolgi-day" || n.kind === "near-boundary" || n.kind === "jasi-school").flatMap((n) => n.pillars));
  const caveat = uncertainPillars.size
    ? [...uncertainPillars].every((k) => k === "hour")
      ? "태어난 시각이 시(時)가 바뀌는 경계에 가까워 시주가 달라질 수 있어요. 그러면 일부 지수가 달라질 수 있어요."
      : "태어난 시각이 절기나 자시 경계에 가까워 사주 계산이 달라질 수 있어요. 이 지수도 달라질 수 있어요."
    : !m.hourKnown
      ? "태어난 시각을 몰라 시주 없이 계산했어요. 시각을 알면 달라질 수 있어요."
      : null;
  return {
    version: LUCKY_VERSION,
    total,
    totalBand,
    totalText: LUCKY_TOTAL_TEXT[totalBand],
    subs,
    strongest: clear ? { id: sorted[0].id, name: sorted[0].name, line: LUCKY_STRONGEST_LINE[sorted[0].id] } : null,
    fallbackLine: clear ? null : LUCKY_FALLBACK_LINE,
    caveat,
  };
}
