// 미유 자체 "심화 검사" 첫 묶음 — 문항 36개 · 세부 항목 12개 · 채점 규칙 (초안 0.1 · 검토 전, 화면 · 저장 · 리포트에 연결하지 않음)
//
// 이 묶음이 하는 일: 지금 검사 화면의 문항(무료 분석 22문항)이 아예 재지 못하는 세부 항목 12개를 서로 다른 장면 3문항씩 묻는다.
// 운영자 요청(2026-10-15): 무료 분석 문항 + 심화 문항을 합쳐 50~60개 — 지금 연결된 22문항 + 36문항 = 58문항이다 (deep-design.ts의 firstBundle이 센다).
// 규칙은 situational-draft.ts(30문항 초안 0.2)와 같다 — 문항 하나는 세부 항목 하나에만 점수를 주고, 선택지는 4개 + 공통 "해당 없음"(점수 제외),
//   같은 행동이어도 이유가 다른 답은 점수에 넣지 않고 이유만 남기며, 서로 다른 문항 3개 이상 응답이 있어야 뚜렷한 방향을 읽고(아니면 "판단 보류"),
//   가운데에서 20 이상이면 뚜렷한 방향, 아니면 "현재 응답만으로 뚜렷하지 않음"이다("약간 ~한 편" · "고르게"를 나누지 않는다).
// 하지 않는 것: 영역(기질 · 성격 · 가까운 관계)을 합친 점수 · 유형 이름 · 사주 점수와의 합산 · 공식 검사 점수로의 환산.
// 이것은 문항 구조의 규칙일 뿐 실제 신뢰도 · 타당도가 아니다 — 시범 인터뷰와 응답을 본 뒤 문항을 고친다.
import type { DeepItem, DeepOption, DeepSubId } from "./deep-item-kit.ts";
import { DEEP_ITEMS_A } from "./deep-items-a.ts";
import { DEEP_ITEMS_B } from "./deep-items-b.ts";
import { DEEP_ITEMS_C } from "./deep-items-c.ts";
import { CLEAR_DISTANCE, HOLD_TEXT, MIN_INDICATORS, UNCLEAR_TEXT, type Strength } from "./situational-draft.ts";

export const DEEP_QUESTIONS_VERSION = "deep-questions-0.1-draft";
export const DEEP_SCORING_VERSION = "deep-scoring-0.1-draft";

export type { DeepItem, DeepOption, DeepSubId };

/** 첫 묶음에 들어가는 세부 항목 12개 — deep-design.ts의 `first` 표시와 같아야 한다(테스트가 확인) */
export const FIRST_BUNDLE_SUB_IDS = [
  "D2-1", "D2-3", "D3-1", "D3-3", "D4-3", "D4-4", "D5-3", "D5-4", "D6-1", "D6-3", "D6-4", "D7-4",
] as const satisfies readonly DeepSubId[];
export type FirstBundleSubId = (typeof FIRST_BUNDLE_SUB_IDS)[number];

export type DeepSubDef = {
  /** deep-design.ts의 세부 항목 이름과 같아야 한다 */
  name: string;
  /** 무엇을 재는가 */
  means: string;
  /** 무엇이 아닌가 */
  notThis: string;
  /** 이웃 항목 · 지금 30문항 관점과의 차이 */
  vs: string;
  /** 높은 쪽 · 낮은 쪽 (좋고 나쁨이 아니다) */
  high: string;
  low: string;
};

export const DEEP_SUB_DEFS: Record<FirstBundleSubId, DeepSubDef> = {
  "D2-1": {
    name: "미리 걱정함",
    means: "아직 일어나지 않은 일에 대해 안 좋은 경우를 미리 떠올리는 정도",
    notThis: "대비하는 행동(계획 · 준비)이 아니고, 일이 어긋난 직후의 감정 크기도 아니다",
    vs: "T2(대비하는 행동)는 걱정 없이도 준비할 수 있고 걱정이 커도 준비하지 않을 수 있어 따로 둔다. T3(감정 크기)는 일이 어긋난 직후의 감정이고 이것은 일이 생기기 전의 생각이다",
    high: "일이 생기기 전부터 안 좋은 경우를 자주 떠올림",
    low: "일이 닥칠 때까지 크게 생각하지 않음",
  },
  "D2-3": {
    name: "낯선 상황에서의 긴장",
    means: "처음 겪는 절차 · 환경 · 어려움 앞에서 몸과 마음이 긴장하는 정도",
    notThis: "사람을 만나는 것이 좋은지 싫은지(사교성)가 아니고, 새로운 것에 끌리는 마음도 아니다",
    vs: "T1(새로움에 끌림)은 낯선 것에 마음이 가는가이고 이것은 낯선 앞에서 몸이 얼마나 굳는가다 — 끌리면서 긴장할 수도, 끌리지 않아도 편안할 수도 있다. 낯선 자리 문항을 사람 모임이 아니라 절차 · 장소 · 첫날로 두어 사교성과 섞이지 않게 했다",
    high: "처음 겪는 상황에서 몸과 마음이 크게 긴장함",
    low: "처음 겪는 상황에서도 편안함",
  },
  "D3-1": {
    name: "상대 감정을 알아챔",
    means: "말하지 않은 상대의 기분 변화를 표정 · 말투 · 분위기로 알아채는 정도",
    notThis: "상대와 같이 느끼는 것(공감)이 아니고, 알아챈 뒤 어떻게 하는가도 아니다",
    vs: "D6-1(공감)은 같이 마음이 움직이는가이고 이것은 알아채는가다 — 알아채지만 마음이 크게 움직이지 않을 수도, 같이 느끼지만 알아채는 것이 느릴 수도 있다. 어느 쪽이 더 좋다고 쓰지 않는다",
    high: "말하지 않아도 상대의 변화가 금방 눈에 들어옴",
    low: "상대가 말해 주어야 알게 되는 편",
  },
  "D3-3": {
    name: "마음을 드러내는 편안함",
    means: "속마음을 말로 드러낼 때 편안한지 어색한지",
    notThis: "얼마나 자주 말하는가(표현의 양)가 아니고, 말을 잘하는가도 아니다",
    vs: "R4(애정 표현)는 마음을 전하는 정도이고 D7-3과 가깝다. 이것은 드러낼 때의 편안함이라 상대(친구 · 연인 · 가족)를 바꿔 물어 장면마다 달라지는지 본다",
    high: "마음을 말로 드러내는 것이 편안함",
    low: "마음을 드러내는 것이 어색하거나 불편함",
  },
  "D4-3": {
    name: "성취하고 싶은 마음",
    means: "이미 잘된 뒤에도 더 높은 수준에 오르고 싶은 마음",
    notThis: "흠을 없애려는 마음(완벽)이 아니고, 꾸준히 이어 가는 힘(T5)도 아니다",
    vs: "D4-4(완벽하게 하려는 마음)는 흠에 대한 것이고 이것은 높이에 대한 것이다. T5는 이어 가는 정도이고 이것은 더 올라가고 싶은 정도다 — 이만하면 충분하다는 답이 낮은 쪽이며 나쁜 것이 아니다",
    high: "더 높은 수준을 바라는 마음이 큼",
    low: "지금 수준으로 충분하다고 느끼는 편",
  },
  "D4-4": {
    name: "완벽하게 하려는 마음",
    means: "작은 흠이 남았을 때 고칠 때까지 놓지 못하는 정도",
    notThis: "대비 · 신중함(T2)이 아니고, 더 높은 성과를 바라는 마음(D4-3)도 아니다",
    vs: "마감 압박으로 그대로 내는 경우와 섞이지 않게 시간이 충분하다고 문항에 적었다. 신중하게 확인하는 것은 T2에 가깝고 이것은 흠 하나가 마음에서 떠나지 않는 정도다",
    high: "작은 흠도 마음에서 떠나지 않아 고칠 때까지 붙잡음",
    low: "작은 흠은 넘기고 다음으로 감",
  },
  "D5-3": {
    name: "행동을 조절함",
    means: "마음이 올라온 뒤 바로 행동하지 않고 한 박자 쉬고 고르는 정도",
    notThis: "감정이 작은 것이 아니고, 참고 쌓아 두는 것도 아니다",
    vs: "C2(행동을 늦춰 고름)와 같은 것을 재지만 지금 30문항은 2개뿐이라 읽지 못한다. 장면을 말 · 소비 · 연인 메시지로 달리해 3개를 채운다",
    high: "마음이 올라와도 시간을 두고 고름",
    low: "마음이 올라오면 바로 행동으로 나옴",
  },
  "D5-4": {
    name: "자신을 받아들임",
    means: "부족한 점도 좋은 점도 나의 모습으로 받아들이는 정도",
    notThis: "자신감의 크기가 아니고, 고치려는 의지가 없다는 뜻도 아니며, 심리 상태의 진단이 아니다",
    vs: "T3(감정 크기)는 감정이 올라오는 크기이고 이것은 나를 대하는 태도다. 실수 · 부족한 점 · 칭찬 세 장면에서 묻고, 방향 해석은 \"그런 경향이 있어 보인다\"까지만 쓴다",
    high: "부족한 점도 좋은 점도 내 모습으로 받아들임",
    low: "부족한 점이 떠오르면 나를 못마땅해하거나 좋은 점을 믿기 어려움",
  },
  "D6-1": {
    name: "공감",
    means: "상대의 감정에 같이 마음이 움직이는 정도",
    notThis: "상대의 사정을 내 결정에 놓는 것(C3 배려)이 아니고, 알아채는 것(D3-1)도 아니다",
    vs: "D3-1(상대 감정을 알아챔)은 알아채는가이고 이것은 같이 마음이 움직이는가다. C3는 결정에서 상대의 필요를 함께 놓는가이고 이것은 감정이 같이 움직이는가다. 마음이 크게 움직이지 않는 답이 낮은 쪽이며 차갑다는 뜻이 아니다",
    high: "상대의 감정에 같이 마음이 크게 움직임",
    low: "상대의 상황은 이해해도 감정은 따로인 편",
  },
  "D6-3": {
    name: "거절 · 경계 세우기",
    means: "원하지 않을 때 분명히 선을 긋고 요청을 거절하는 정도",
    notThis: "협력하지 않는다는 뜻이 아니고, 도와주고 싶어서 돕는 것도 아니다",
    vs: "C3 문항에서는 '거절하기 어려워서 따름'을 이유로만 기록했다. 여기서는 쉬고 싶다고 문항에 못 박아 '여유가 있어서 받음'과 섞이지 않게 했고, 좋아서 돕는 답(점수에 넣지 않는 답)은 점수에 넣지 않는다",
    high: "원하지 않으면 분명히 선을 긋고 말함",
    low: "원하지 않아도 말을 꺼내기 어려워 받아들임",
  },
  "D6-4": {
    name: "갈등에서 의견을 말함",
    means: "갈등이 한창일 때 내 입장과 이유를 말로 이어 가는 정도",
    notThis: "갈등을 일으키는 것이 아니고, 불편함을 처음 꺼내는 속도(R3)도 아니다",
    vs: "R3는 불편함을 처음 꺼내는 속도이고 이것은 이미 부딪힌 한가운데서 입장을 말하는가다. 상대 말에 설득돼서 의견을 접은 답(점수에 넣지 않는 답)은 점수에 넣지 않는다",
    high: "분위기가 날카로워도 내 입장을 말로 이어 감",
    low: "분위기가 날카로워지면 말수를 줄이거나 따라감",
  },
  "D7-4": {
    name: "갈등 뒤 회복",
    means: "갈등이 지나간 뒤 마음과 관계가 평소로 돌아오는 속도",
    notThis: "갈등을 피하는 정도가 아니고, 불편함을 꺼내는 속도(R3)도 아니다",
    vs: "R3는 갈등 앞의 속도이고 이것은 갈등 뒤의 회복이다. 마음이 오래 남는 쪽이 낮은 쪽이며 나쁜 것이 아니라 회복에 시간이 걸린다는 뜻이다. 친구 · 연인 · 일 세 장면에서 묻는다",
    high: "갈등이 지난 뒤 비교적 빨리 평소로 돌아옴",
    low: "갈등이 지난 뒤에도 마음에 오래 남음",
  },
};

export const DEEP_ITEMS: DeepItem[] = [...DEEP_ITEMS_A, ...DEEP_ITEMS_B, ...DEEP_ITEMS_C];
export const DEEP_ITEM_BY_ID: Record<string, DeepItem> = Object.fromEntries(DEEP_ITEMS.map((i) => [i.id, i]));

/** 세부 항목별 지표 수 — 그 세부 항목을 보는 문항 수 */
export function deepIndicatorCounts(items: readonly DeepItem[] = DEEP_ITEMS): Record<FirstBundleSubId, number> {
  const out = Object.fromEntries(FIRST_BUNDLE_SUB_IDS.map((s) => [s, 0])) as Record<FirstBundleSubId, number>;
  for (const item of items) out[item.sub as FirstBundleSubId] += 1;
  return out;
}

// ───────────────────────── 채점 (초안 규칙) ─────────────────────────

export type DeepAnswers = Record<string, "a" | "b" | "c" | "d" | "na">;

export type DeepSubResult =
  | { status: "hold"; reason: "too-few-indicators"; answered: number }
  | {
      status: "ok";
      /** 0~100 응답 환산값 (50이 가운데). 백분위 · 정확도가 아니다. 화면에는 숫자보다 방향을 쓴다 */
      score: number;
      strength: Strength;
      /** high · low는 뚜렷할 때만. 뚜렷하지 않으면 "현재 응답만으로 뚜렷하지 않음" */
      direction: "high" | "low" | "unclear";
      answered: number;
    };

/**
 * 문항 하나가 그 세부 항목에 주는 기여값(−1~1). 점수를 주는 선택지를 같은 확률로 고르는 사람이 0이 되게 맞춘다(situational-draft.ts의 contribution과 같다).
 * 이유가 다른 답(unscored)은 null — 그 문항은 이 세부 항목의 증거가 아니다.
 */
export function deepContribution(item: DeepItem, option: DeepOption["id"]): number | null {
  const chosen = item.options.find((o) => o.id === option);
  if (!chosen || chosen.unscored || chosen.w === undefined) return null;
  const scored = item.options.filter((o) => !o.unscored);
  const values: number[] = scored.map((o) => o.w ?? 0);
  const mean = values.reduce((n, v) => n + v, 0) / values.length;
  const reach = Math.max(...values.map((v) => Math.abs(v - mean)));
  if (reach === 0) return null;
  return (chosen.w - mean) / reach;
}

export type DeepScore = { subs: Record<FirstBundleSubId, DeepSubResult>; skipped: number; answered: number };

/** 문항 36개를 채점한다 — 영역 · 전체로 합치지 않고 세부 항목마다 따로 읽는다 */
export function scoreDeep(answers: DeepAnswers, items: readonly DeepItem[] = DEEP_ITEMS): DeepScore {
  const subs = {} as Record<FirstBundleSubId, DeepSubResult>;
  for (const sub of FIRST_BUNDLE_SUB_IDS) {
    const values: number[] = [];
    for (const item of items) {
      if (item.sub !== sub) continue;
      const a = answers[item.id];
      if (!a || a === "na") continue;
      const c = deepContribution(item, a);
      if (c !== null) values.push(c);
    }
    if (values.length < MIN_INDICATORS) {
      subs[sub] = { status: "hold", reason: "too-few-indicators", answered: values.length };
      continue;
    }
    const mean = values.reduce((n, v) => n + v, 0) / values.length;
    const score = Math.round(50 + 50 * mean);
    const clear = Math.abs(score - 50) >= CLEAR_DISTANCE;
    subs[sub] = { status: "ok", score, strength: clear ? "clear" : "unclear", direction: !clear ? "unclear" : score > 50 ? "high" : "low", answered: values.length };
  }
  const answered = items.filter((i) => answers[i.id] && answers[i.id] !== "na").length;
  return { subs, skipped: items.length - answered, answered };
}

/** 결과를 말로 옮길 때 쓰는 두 표현은 30문항 초안과 같다 */
export { HOLD_TEXT, UNCLEAR_TEXT };
