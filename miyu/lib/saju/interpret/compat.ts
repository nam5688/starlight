// 사주 궁합 엔진 — 두 사람의 사주 원국에서 관계를 읽는 규칙(코드 계산 · AI 미사용).
// 간단 궁합(무료)과 사주 궁합(유료)은 같은 엔진의 같은 결과를 쓴다 — 무료는 이 결과의 대표 한 장(커플 유형 · 총점 · 핵심 한 줄)이고, 유료는 같은 결과의 근거 전체를 풀어 쓴다.
// 그래서 무료에서 본 것과 유료에서 읽는 것이 어긋나지 않는다(운영자 방향 2026-10-16).
//
// 규칙은 검증된 사실이 아니라 전통 해석을 단순화한 초안이며 전문가 검토 전이다(COMPAT_RULE_META에 출처 · 조건 · 예외 · 검토 상태를 기록).
// 총점 · 커플 유형은 재미와 공유를 위한 정리이고 관계의 성공 확률 · 궁합의 정확도가 아니다 — 계산 근거(어떤 재료를 어떻게 점수로 옮겼는지)는 parts로 남기고 화면에서 설명한다.
// 상대의 속마음 · 성격 단정 · 구체적 나이 · 날짜 · 사건은 만들지 않는다. 상대의 응답(기질 · 성격 · 애착)은 쓰지 않는다 — 사주 원국만 쓴다.
import type { Evidence } from "../../report/evidence.ts";
import type { FiveElement, PillarKey, SajuOk, YinYang } from "../engine.ts";
import { FIVE_ELEMENTS } from "../engine.ts";
import { GROUP_OF, type Group } from "./structure.ts";
import { branchRelations, stemRelation, type Relation } from "./relations.ts";

export const COMPAT_RULE_VERSION = "compat-rules-0.1-draft";

export type Lean = "go" | "careful" | "even";
export type DayElementRelation = "same" | "generate" | "control";
export type PairPace = "go-go" | "careful-careful" | "mixed" | "even";

export type CompatPerson = {
  dayStem: string;
  dayStemHanja: string;
  dayBranch: string;
  dayBranchHanja: string;
  element: FiveElement;
  yinYang: YinYang;
  /** 먼저 움직이는 쪽(비겁 · 식상)과 확인하고 움직이는 쪽(인성 · 관성)의 기울기 — 십신 자리 수의 차이 */
  lean: Lean;
  drive: number;
  steady: number;
  counts: Record<FiveElement, number>;
  hourKnown: boolean;
};

export type CompatPart = { id: string; label: string; points: number; reason: string };

export type CoupleType = {
  id: string;
  /** "액션 로봇 커플" · "찰떡 커플"처럼 화면에 그대로 쓰는 이름 */
  name: string;
  /** 한 줄 설명 */
  line: string;
  /** 두 문장 — 잘 맞는 모습 · 조율이 필요한 모습 (조건형) */
  explain: [string, string];
  /** 우리 커플 핵심 한 줄 */
  core: string;
};

export type CompatResult = {
  version: string;
  a: CompatPerson;
  b: CompatPerson;
  levels: { pull: 0 | 1 | 2; friction: 0 | 1 | 2; pace: PairPace; dayElement: DayElementRelation; pullPoints: number; frictionPoints: number };
  /** 총점을 이룬 재료 — 무엇으로 계산했는지 설명하는 데 쓴다 */
  parts: CompatPart[];
  score: number;
  /** 점수 구간의 뜻 — 높고 낮음이 좋고 나쁨이 되지 않게 쓴다 */
  scoreMeaning: string;
  coupleType: CoupleType;
  /** 화면에 쓰는 쉬운 말 한 줄들 — 잘 맞는 곳 · 조율할 곳 · 속도 */
  highlights: { good: string[]; care: string[]; pace: string };
  /** 사주 궁합(유료)이 같은 결과를 풀어 쓸 때 쓰는 근거 목록 — 개인 리포트와 같은 Evidence 형식(source는 saju) */
  evidence: Evidence[];
  /** 결과가 달라질 수 있다는 안내(시각을 모르거나 절기 · 자시 경계) */
  cautions: string[];
};

// ───── 기본 표 ─────

const GENERATES: Record<FiveElement, FiveElement> = { 목: "화", 화: "토", 토: "금", 금: "수", 수: "목" };
const CONTROLS: Record<FiveElement, FiveElement> = { 목: "토", 토: "수", 수: "화", 화: "금", 금: "목" };
const ELEMENT_HANJA: Record<FiveElement, string> = { 목: "木", 화: "火", 토: "土", 금: "金", 수: "水" };
const ELEMENT_NAME: Record<FiveElement, string> = { 목: "나무", 화: "불", 토: "흙", 금: "쇠", 수: "물" };
/** 기둥의 무게 — 일지(배우자 자리)가 가장 크고 월지 · 년지 · 시지 순이다. 두 기둥 사이의 무게는 둘 중 작은 쪽 */
const IMPORTANCE: Record<PillarKey, number> = { day: 3, month: 2, year: 1, hour: 1 };
const PILLAR_NAME: Record<PillarKey, string> = { year: "년지", month: "월지", day: "일지", hour: "시지" };
/** 천간끼리의 합은 일간 · 월간 사이만 본다 — 소수 오차로 A · B 순서에 따라 결과가 달라지지 않도록 모든 점수는 10배한 정수로 센다 */
const STEM_PAIR_WEIGHT10: Record<string, number> = { "day-day": 30, "day-month": 15, "month-day": 15, "month-month": 10 };
/** 끌림 · 부딪힘 정도를 가르는 기준(10배한 값) — 무작위 두 사람의 분포에서 세 구간이 비슷하게 나오도록 정한 임의의 값이다(compat.test.ts · scripts/measure-compat.ts) */
export const LEVEL_CUTS10 = { pull: [25, 55], friction: [25, 55] } as const;
/** 먼저 움직이는 쪽(비겁 · 식상)과 확인하고 움직이는 쪽(인성 · 관성)의 자리 수 차이가 이 값 이상이면 그쪽으로 기울었다고 본다 — 한 자리 차이는 약한 근거이며 재미를 위한 구분이다 */
export const LEAN_MIN_DIFF = 1;

const groupBetween = (me: { element: FiveElement }, other: { element: FiveElement }): Group => {
  if (me.element === other.element) return "비겁";
  if (GENERATES[me.element] === other.element) return "식상";
  if (CONTROLS[me.element] === other.element) return "재성";
  if (CONTROLS[other.element] === me.element) return "관성";
  return "인성";
};

function personOf(s: SajuOk): CompatPerson {
  const day = s.pillars.find((p) => p.key === "day")!;
  let drive = 0;
  let steady = 0;
  for (const p of s.pillars) {
    for (const tg of [p.tenGod.stem, p.tenGod.branch]) {
      const g = GROUP_OF[tg];
      if (g === "비겁" || g === "식상") drive += 1;
      else if (g === "인성" || g === "관성") steady += 1;
    }
  }
  const diff = drive - steady;
  return {
    dayStem: day.stem,
    dayStemHanja: day.stemHanja,
    dayBranch: day.branch,
    dayBranchHanja: day.branchHanja,
    element: s.dayMaster.element,
    yinYang: s.dayMaster.yinYang,
    lean: diff >= LEAN_MIN_DIFF ? "go" : diff <= -LEAN_MIN_DIFF ? "careful" : "even",
    drive,
    steady,
    counts: s.elementCounts,
    hourKnown: !s.hourPillarOmitted,
  };
}

const paceOf = (a: Lean, b: Lean): PairPace => (a === "go" && b === "go" ? "go-go" : a === "careful" && b === "careful" ? "careful-careful" : (a === "go" && b === "careful") || (a === "careful" && b === "go") ? "mixed" : "even");

const uncertainPillarsOf = (s: SajuOk): Set<PillarKey> => new Set(s.notes.filter((n) => n.kind === "jeolgi-day" || n.kind === "near-boundary" || n.kind === "jasi-school").flatMap((n) => n.pillars));

type Cross = { aKey: PillarKey; bKey: PillarKey; weight: number; relation: Relation };

/** 두 사람의 지지 사이 합 · 충 · 형 — 한 쌍에 여러 관계가 있을 수 있다 */
function crossBranches(a: SajuOk, b: SajuOk): Cross[] {
  const out: Cross[] = [];
  for (const pa of a.pillars) for (const pb of b.pillars) {
    const weight = Math.min(IMPORTANCE[pa.key], IMPORTANCE[pb.key]);
    for (const relation of branchRelations(pa.branch, pb.branch)) out.push({ aKey: pa.key, bKey: pb.key, weight, relation });
  }
  return out;
}

function crossStems(a: SajuOk, b: SajuOk): { aKey: PillarKey; bKey: PillarKey; weight10: number; forms: string }[] {
  const out: { aKey: PillarKey; bKey: PillarKey; weight10: number; forms: string }[] = [];
  for (const pa of a.pillars) for (const pb of b.pillars) {
    const weight = STEM_PAIR_WEIGHT10[`${pa.key}-${pb.key}`];
    if (!weight) continue;
    const r = stemRelation(pa.stem, pb.stem);
    if (r) out.push({ aKey: pa.key, bKey: pb.key, weight10: weight, forms: r.forms ?? "" });
  }
  return out;
}

// ───── 커플 유형 20 ─────
// 끌림(pull) · 부딪힘(friction) · 속도(pace) · 일간 사이(dayElement)의 구분표로 정한다. 재미를 위한 분류이며 사주에서 검증된 유형이 아니다.

const T = (id: string, name: string, line: string, explain: [string, string], core: string): CoupleType => ({ id, name, line, explain, core });

export const COUPLE_TYPES: CoupleType[] = [
  T("charmed", "찰떡 커플", "말하지 않아도 결이 맞는 순간이 많은 조합이에요.", ["타고난 결에서 서로를 끌어당기는 부분이 여럿 읽히고 부딪히는 부분은 적게 읽혀요.", "편하다고 서로의 속도를 확인하지 않고 지나가면 작은 어긋남이 늦게 드러날 수 있어요."], "편안함이 큰 힘인 만큼, 편안할 때 마음을 말로 한 번 더 확인해 주는 게 열쇠예요."),
  T("magnet", "자석 커플", "끌리는 힘이 큰데, 가까워질수록 서로 밀어내는 순간도 있는 조합이에요.", ["끌어당기는 부분이 뚜렷하고 조금씩 부딪히는 부분도 함께 읽혀요.", "끌림이 클 때일수록 서로의 속도 차이를 말로 맞춰 두면 가까워지는 힘이 더 오래 가요."], "끌림이 큰 만큼, 거리를 조절하는 말이 필요해요."),
  T("coaster", "롤러코스터 커플", "가까워질 때 크게 가까워지고, 어긋날 때도 크게 느끼는 조합이에요.", ["끌어당기는 부분과 부딪히는 부분이 모두 뚜렷하게 읽혀서 감정의 폭이 큰 편일 수 있어요.", "크게 흔들린 뒤 서로 어떻게 돌아오는지가 이 관계의 모양을 정해요."], "감정의 폭이 클수록, 돌아오는 방법을 미리 정해 두면 든든해요."),
  T("straight", "직진 커플", "둘 다 마음이 서면 바로 움직이는 조합이에요.", ["서로 닿는 부분이 있고 둘 다 먼저 움직이는 쪽으로 읽혀서 추진력이 잘 맞아요.", "속도가 빠른 만큼 같은 방향을 보고 있는지 중간에 한 번씩 확인하면 좋아요."], "속도가 빠른 만큼, 방향을 확인하는 말이 열쇠예요."),
  T("oneteam", "한팀 커플", "둘 다 확인하고 움직여서 차근차근 쌓아 가는 조합이에요.", ["서로 닿는 부분이 있고 둘 다 신중하게 확인하는 쪽으로 읽혀서 약속과 기준이 잘 맞아요.", "둘 다 신중하면 시작이 늦어질 수 있어서, 먼저 작게 해 보는 쪽을 정해 두면 좋아요."], "차근차근 쌓는 힘이 크고, 시작은 작게 해 보는 게 좋아요."),
  T("puzzle", "퍼즐 커플", "한 명이 먼저 움직이고, 한 명이 받쳐 주며 맞춰지는 조합이에요.", ["서로 닿는 부분이 있고 한 명은 먼저 움직이고 한 명은 확인하고 움직이는 쪽으로 읽혀요.", "각자 맡는 역할이 분명해질수록 편하고, 역할이 한쪽으로 굳으면 한 사람이 지칠 수 있어요."], "서로 다른 모양이 오히려 서로를 채워 줄 수 있어요."),
  T("buddy", "단짝 커플", "특별히 맞추지 않아도 편하게 이어지는 조합이에요.", ["서로 닿는 부분이 있고 속도도 크게 다르지 않게 읽혀요.", "편한 만큼 서로에게 기대하는 것을 말로 꺼내 두면 오래 가기 쉬워요."], "편한 사이일수록, 기대를 말로 꺼내 두는 게 좋아요."),
  T("tikitaka", "티키타카 커플", "대화로 서로의 속도를 주고받으며 맞춰 가는 조합이에요.", ["서로 닿는 부분과 조금 부딪히는 부분이 함께 있고, 한 명은 먼저 움직이고 한 명은 확인하고 움직이는 쪽으로 읽혀요.", "다른 속도를 말로 주고받을 때 오히려 관계가 가까워지는 모양이에요."], "다른 속도를 대화의 재료로 삼으면 가까워져요."),
  T("pingpong", "핑퐁 커플", "둘 다 빠르게 반응해서 주고받는 속도가 빠른 조합이에요.", ["서로 닿는 부분과 조금 부딪히는 부분이 함께 있고 둘 다 먼저 움직이는 쪽으로 읽혀요.", "속도가 같아서 신나지만 같은 때에 부딪히면 불이 붙기 쉬워서, 쉬어 가는 신호를 정해 두면 좋아요."], "빠른 만큼, 쉬어 가는 신호가 필요해요."),
  T("brake", "브레이크 커플", "둘 다 신중해서 서로 속도를 늦춰 주는 조합이에요.", ["서로 닿는 부분과 조금 부딪히는 부분이 함께 있고 둘 다 확인하고 움직이는 쪽으로 읽혀요.", "신중함이 안전장치가 되지만 결정이 길어질 수 있어서, 정하는 기준을 함께 세워 두면 좋아요."], "서로의 안전장치가 되려면, 결정의 기준을 함께 세워 두는 게 좋아요."),
  T("seesaw", "시소 커플", "한쪽이 올라가면 한쪽이 균형을 잡으며 맞춰 가는 조합이에요.", ["서로 닿는 부분과 조금 부딪히는 부분이 함께 있고 속도는 비슷하거나 한쪽으로 뚜렷하지 않게 읽혀요.", "균형이 잘 맞을 때는 편하지만 한쪽이 계속 맞추는 모양이 되면 지치기 쉬워요."], "번갈아 맞추는 규칙이 균형을 지켜 줘요."),
  T("tugofwar", "줄다리기 커플", "서로 끌어당기는 힘이 있는데 방식이 부딪히기 쉬운 조합이에요.", ["끌어당기는 부분과 부딪히는 부분이 함께 뚜렷하게 읽혀요.", "누가 이기느냐가 아니라 어떤 기준으로 정하느냐를 함께 정해 두면, 당기는 힘이 같은 방향으로 모여요."], "이기고 지는 대신, 기준을 함께 정해 보세요."),
  T("actionrobot", "액션 로봇 커플", "한 명은 먼저 움직이고, 한 명은 한 번 더 생각해요.", ["서로 크게 끌리거나 부딪히는 부분은 두드러지지 않고 움직이는 속도가 다르게 읽혀요.", "잘 맞을 때는 실행력과 안정감을 서로 채워 주고, 어긋날 때는 서로 답답하게 느낄 수 있어요."], "다른 속도가 오히려 서로의 빈틈을 채워 줄 수 있어요."),
  T("mirror", "거울 커플", "서로 닮아서 말하지 않아도 이해되는 부분이 많은 조합이에요.", ["타고난 중심 성향이 같은 결이고 크게 끌리거나 부딪히는 부분은 두드러지지 않게 읽혀요.", "닮은 만큼 같은 곳에서 같이 막힐 수 있어서, 서로 다른 시선을 한 번씩 빌려 오면 좋아요."], "닮은 점이 큰 만큼, 다른 시선이 필요한 순간을 알아 두세요."),
  T("glue", "딱풀 커플", "한쪽이 다른 쪽을 받쳐 주며 자연스럽게 붙어 가는 조합이에요.", ["타고난 중심 성향이 서로 돕는 관계로 읽히고 크게 부딪히는 부분은 두드러지지 않아요.", "받쳐 주는 쪽이 지치지 않도록 받는 쪽이 고마움을 말로 돌려주면 오래 가기 쉬워요."], "받쳐 주는 쪽의 마음을, 말로 돌려주세요."),
  T("myway", "마이웨이 커플", "각자 자기 방식이 뚜렷해서 서로의 영역을 존중할 때 편한 조합이에요.", ["타고난 중심 성향이 서로 다스리는 관계로 읽혀 각자의 기준이 분명해지기 쉽고, 크게 끌리거나 부딪히는 부분은 두드러지지 않아요.", "같이 정할 것과 각자 정할 것을 나눠 두면 부딪힘이 줄어요."], "각자의 영역을 존중하되, 같이 정할 것은 정해 두세요."),
  T("rubberband", "고무줄 커플", "가까워졌다 멀어졌다 하면서 거리를 맞춰 가는 조합이에요.", ["타고난 중심 성향이 같은 결이고 조금 부딪히는 부분이 함께 읽혀요.", "닮은 만큼 같은 곳에서 부딪힐 수 있어서, 거리를 두는 시간을 서로 미리 이해해 두면 좋아요."], "멀어지는 시간도 관계의 일부로 약속해 두세요."),
  T("hideseek", "숨바꼭질 커플", "마음은 있는데 표현하는 때가 어긋나기 쉬운 조합이에요.", ["타고난 중심 성향이 서로 돕는 관계로 읽히지만 조금 부딪히는 부분도 함께 읽혀요.", "서로 어디쯤인지 짧게 알려 주는 말이 있으면 어긋나는 시간이 줄어요."], "어디쯤인지 짧게 알려 주는 말이 열쇠예요."),
  T("parallel", "평행선 커플", "각자의 길이 뚜렷해서 같은 곳을 보는 시간이 필요한 조합이에요.", ["타고난 중심 성향이 서로 다스리는 관계로 읽히고 조금 부딪히는 부분이 함께 읽혀요.", "같이 하는 시간을 일부러 만들면 나란히 가던 길이 같은 방향으로 모여요."], "같이 보는 곳을 정하면, 나란히 가던 길이 모여요."),
  T("tempgap", "온도차 커플", "같은 일을 느끼는 온도가 달라서 맞춰 가는 말이 중요한 조합이에요.", ["끌어당기는 부분은 두드러지지 않고 부딪히는 부분이 뚜렷하게 읽혀요.", "온도 차이를 잘못이 아니라 느끼는 방식의 차이로 이야기하면 부딪힘이 줄어요."], "온도 차이를 잘못이 아니라, 차이로 말해 보세요."),
];

const TYPE_BY_ID = new Map(COUPLE_TYPES.map((t) => [t.id, t]));
const type = (id: string): CoupleType => TYPE_BY_ID.get(id)!;

/** 끌림 · 부딪힘 · 속도 · 일간 사이로 커플 유형을 정한다 — 모든 입력이 정확히 한 유형이 된다 */
export function coupleTypeOf(l: CompatResult["levels"]): CoupleType {
  const { pull, friction, pace, dayElement } = l;
  if (pull === 2) return type(friction === 0 ? "charmed" : friction === 1 ? "magnet" : "coaster");
  if (friction === 2) return type(pull === 1 ? "tugofwar" : "tempgap");
  if (pull === 1) {
    if (friction === 0) return type(pace === "go-go" ? "straight" : pace === "careful-careful" ? "oneteam" : pace === "mixed" ? "puzzle" : "buddy");
    return type(pace === "mixed" ? "tikitaka" : pace === "go-go" ? "pingpong" : pace === "careful-careful" ? "brake" : "seesaw");
  }
  if (friction === 0) {
    if (pace === "mixed") return type("actionrobot");
    return type(dayElement === "same" ? "mirror" : dayElement === "generate" ? "glue" : "myway");
  }
  return type(dayElement === "same" ? "rubberband" : dayElement === "generate" ? "hideseek" : "parallel");
}

/** 점수 구간의 뜻 — 높고 낮음을 좋고 나쁨으로 읽지 않게, 구간마다 그 조합이 어떤 모양인지만 말한다 */
export const SCORE_MEANINGS: { min: number; text: string }[] = [
  { min: 85, text: "서로의 결이 자연스럽게 겹치는 부분이 많은 조합이에요." },
  { min: 70, text: "잘 맞는 결이 여럿 읽히는 조합이에요." },
  { min: 55, text: "맞는 곳과 다른 곳이 함께 읽혀서, 알아 갈수록 모양이 달라지는 조합이에요." },
  { min: 40, text: "다른 점이 뚜렷해서, 맞춰 가는 방식이 관계의 모양을 정하는 조합이에요." },
  { min: 0, text: "차이가 크게 읽혀서, 서로의 방식을 이해하는 대화가 큰 힘이 되는 조합이에요." },
];
export const scoreMeaningOf = (score: number): string => SCORE_MEANINGS.find((m) => score >= m.min)!.text;

/** 총점의 바탕값 — 재료의 점수를 더하기 전의 기준. 정해진 하한 · 상한은 없고 0~100으로만 자른다. 임의로 정한 값이며 분포는 compat.test.ts가 센다 */
export const SCORE_BASE = 60;
/** 재료 점수 합계에 곱하는 폭(10배한 값, 14 = 1.4배) — 합계가 좁은 범위에 몰려 점수가 대부분 비슷해 보이지 않도록 넓힌 임의의 값이다. 높은 점수를 더 주려는 값이 아니다(중앙값은 거의 그대로) */
export const SCORE_SPREAD10 = 14;

// ───── 계산 ─────

export function compatOf(sa: SajuOk, sb: SajuOk): CompatResult {
  const a = personOf(sa);
  const b = personOf(sb);
  const parts: CompatPart[] = [];
  const evidence: Evidence[] = [];
  const good: string[] = [];
  const care: string[] = [];
  const unc = { a: uncertainPillarsOf(sa), b: uncertainPillarsOf(sb) };
  const uncertainOf = (aKey: PillarKey | null, bKey: PillarKey | null) => Boolean((aKey && unc.a.has(aKey)) || (bKey && unc.b.has(bKey)));
  const push = (e: Omit<Evidence, "source"> & { uncertain?: boolean }) => evidence.push({ source: "saju", ...e, ...(e.uncertain ? { uncertain: true } : {}) });

  // 1. 일간(타고난 중심 성향) 사이
  const dayElement: DayElementRelation = a.element === b.element ? "same" : GENERATES[a.element] === b.element || GENERATES[b.element] === a.element ? "generate" : "control";
  const stemCombine = stemRelation(a.dayStem, b.dayStem);
  const stemPts = stemCombine ? 10 : dayElement === "same" ? 3 : dayElement === "generate" ? 5 : -4;
  parts.push({
    id: "day-stem",
    label: "타고난 중심 성향 사이",
    points: stemPts,
    reason: stemCombine ? "두 일간이 짝을 이루는 천간합" : dayElement === "same" ? "두 일간이 같은 오행" : dayElement === "generate" ? "두 일간이 서로 돕는 상생 관계" : "두 일간이 서로 다스리는 상극 관계",
  });
  const roleA = groupBetween(a, b);
  const roleB = groupBetween(b, a);
  push({
    id: "compat.day-stem",
    topics: ["relationship", "love", "personality"],
    strength: stemCombine ? "strong" : "moderate",
    fact: `A님의 일간은 ${a.dayStem}(${a.dayStemHanja}, ${a.element} · ${ELEMENT_NAME[a.element]}), B님의 일간은 ${b.dayStem}(${b.dayStemHanja}, ${b.element} · ${ELEMENT_NAME[b.element]}) — ${stemCombine ? `두 일간은 천간합(${stemCombine.forms}으로 변하는 짝)` : dayElement === "same" ? "같은 오행" : dayElement === "generate" ? "한쪽이 다른 쪽을 키우는 상생 관계" : "한쪽이 다른 쪽을 다스리는 상극 관계"}`,
    cue: stemCombine
      ? "일간끼리 합이 되면 서로에게 끌려 들어가는 힘이 있는 관계로 봅니다. 합이 있다고 늘 편하다는 뜻은 아닙니다."
      : dayElement === "same"
        ? "같은 오행의 일간은 닮은 결로 서로를 이해하기 쉽지만, 같은 부분에서 같이 막힐 수도 있다고 봅니다."
        : dayElement === "generate"
          ? "상생 관계의 일간은 한쪽이 다른 쪽을 받쳐 주고 키우는 모양으로 읽는 경우가 많다고 봅니다. 받쳐 주는 쪽이 지치기 쉬운 면도 함께 봅니다."
          : "상극 관계의 일간은 한쪽의 기준이 다른 쪽을 눌러 긴장이 생기기 쉽지만, 서로를 단련시키는 관계로도 읽는다고 봅니다.",
  });
  push({
    id: "compat.role",
    topics: ["relationship", "love"],
    strength: "weak",
    fact: `A님 기준으로 B님의 일간은 ${roleA} 자리, B님 기준으로 A님의 일간은 ${roleB} 자리`,
    cue: "전통 해석에서는 한 사람의 일간을 기준으로 상대의 일간이 어느 십신 자리인지로 관계에서 서로가 어떤 역할로 느껴지기 쉬운지를 읽는 경우가 있습니다. 기준이 된 사람 입장에서 상대가 비겁이면 닮은 동료, 식상이면 내가 표현하고 베푸는 것을 상대가 받아 주는 자리, 재성이면 내가 챙기고 다루는 자리, 관성이면 상대가 기준을 세우고 나를 이끄는 자리, 인성이면 상대가 나를 이해하고 돌보는 자리로 읽습니다(방향은 기준이 된 사람에서 상대 쪽입니다). 한 가지 서술이며 상대의 성격을 단정하는 근거가 아닙니다.",
  });
  if (stemCombine) good.push("타고난 중심 성향끼리 짝을 이루는 관계로 읽혀요");
  else if (dayElement === "generate") good.push("타고난 중심 성향이 서로를 받쳐 주는 관계로 읽혀요");
  else if (dayElement === "same") good.push("타고난 중심 성향이 같은 결이라 서로를 이해하기 쉬워요");
  else care.push("타고난 중심 성향이 서로 다스리는 관계라 각자의 기준이 부딪힐 때가 있을 수 있어요");

  // 2. 일지(배우자 자리) 사이
  const dayDay = branchRelations(a.dayBranch, b.dayBranch);
  const dayDayUncertain = uncertainOf("day", "day");
  let dayPts = 0;
  const dayKinds: string[] = [];
  for (const r of dayDay) {
    if (r.kind === "육합") dayPts += 10;
    else if (r.kind === "반합") dayPts += 5;
    else if (r.kind === "충") dayPts -= 9;
    else dayPts -= 5;
    dayKinds.push(r.kind);
  }
  const sameBranch = a.dayBranch === b.dayBranch && !dayDay.some((r) => r.kind === "형");
  if (sameBranch) dayPts += 2;
  if (dayDay.length > 0 || sameBranch) {
    parts.push({ id: "day-branch", label: "배우자 자리(일지) 사이", points: dayPts, reason: dayKinds.length ? `일지끼리 ${dayKinds.join(" · ")}` : "일지가 같은 글자" });
    push({
      id: "compat.day-branch",
      topics: ["relationship", "love", "marriage"],
      strength: dayDayUncertain ? "weak" : "strong",
      fact: `A님의 일지 ${a.dayBranch}(${a.dayBranchHanja})와 B님의 일지 ${b.dayBranch}(${b.dayBranchHanja}) — ${dayKinds.length ? dayKinds.join(" · ") : "같은 글자"}`,
      cue: "전통 해석에서 일지는 가까운 관계 · 배우자 자리를 보는 곳입니다. 두 일지가 합이면 가까이 있을 때 편안하게 이어지기 쉽고, 충이면 방식이 크게 달라 조정할 일이 생기기 쉽다고 봅니다. 충이 있다고 관계가 어렵다는 뜻은 아니며, 합이 있다고 늘 편하다는 뜻도 아닙니다.",
      uncertain: dayDayUncertain,
    });
    if (dayDay.some((r) => r.kind === "육합" || r.kind === "반합")) good.push("배우자 자리끼리 서로 끌어당기는 관계로 읽혀요");
    if (dayDay.some((r) => r.kind === "충" || r.kind === "형")) care.push("배우자 자리끼리 방식이 달라 조율이 필요한 관계로 읽혀요");
  }

  // 3. 그 밖의 지지 · 천간 사이(월지 · 년지 · 시지, 월간)
  const cross = crossBranches(sa, sb).filter((c) => !(c.aKey === "day" && c.bKey === "day"));
  let crossPull10 = 0;
  let crossClash10 = 0;
  const crossPullList: string[] = [];
  const crossClashList: string[] = [];
  for (const c of cross) {
    const place = `A님 ${PILLAR_NAME[c.aKey]} · B님 ${PILLAR_NAME[c.bKey]}`;
    if (c.relation.kind === "육합") {
      crossPull10 += c.weight * 10;
      crossPullList.push(`${place}(합)`);
    } else if (c.relation.kind === "반합") {
      crossPull10 += c.weight * 6;
      crossPullList.push(`${place}(반합)`);
    } else if (c.relation.kind === "충") {
      crossClash10 += c.weight * 10;
      crossClashList.push(`${place}(충)`);
    } else {
      crossClash10 += c.weight * 7;
      crossClashList.push(`${place}(형)`);
    }
  }
  const stems = crossStems(sa, sb).filter((s) => !(s.aKey === "day" && s.bKey === "day"));
  for (const s of stems) {
    crossPull10 += s.weight10;
    crossPullList.push(`A님 ${PILLAR_NAME[s.aKey].replace("지", "간")} · B님 ${PILLAR_NAME[s.bKey].replace("지", "간")}(천간합)`);
  }
  // 끌림 · 부딪힘의 점수는 합계 × 1.5 (정수 연산: 10배한 값 × 3 ÷ 20)를 반올림해 한쪽 8점까지만 센다
  const crossPullPts = Math.min(8, Math.round((crossPull10 * 3) / 20));
  const crossClashPts = -Math.min(8, Math.round((crossClash10 * 3) / 20));
  if (crossPullPts > 0) {
    parts.push({ id: "cross-pull", label: "그 밖의 자리끼리 끌어당기는 관계", points: crossPullPts, reason: `${crossPullList.length}곳에서 합` });
    push({ id: "compat.cross.pull", topics: ["relationship"], strength: "moderate", fact: `두 사주의 다른 자리에서 합이 ${crossPullList.length}곳: ${crossPullList.join(", ")}`, cue: "일지 말고도 월지 · 년지 · 월간 사이에 합이 있으면 일과 바깥 생활에서도 서로 호흡이 맞는 면이 있다고 봅니다. 자리마다 무게가 달라 일지보다 작게 읽습니다." });
    good.push("다른 자리에서도 서로 끌어당기는 관계가 읽혀요");
  }
  if (crossClashPts < 0) {
    parts.push({ id: "cross-clash", label: "그 밖의 자리끼리 부딪히는 관계", points: crossClashPts, reason: `${crossClashList.length}곳에서 충 · 형` });
    push({ id: "compat.cross.clash", topics: ["relationship"], strength: "moderate", fact: `두 사주의 다른 자리에서 충 · 형이 ${crossClashList.length}곳: ${crossClashList.join(", ")}`, cue: "일지 말고도 월지 · 년지 사이에 충이나 형이 있으면 일 · 생활 방식 · 가족과 바깥 환경에서 서로 다른 기준이 부딪히기 쉬운 면이 있다고 봅니다. 자리마다 무게가 달라 일지보다 작게 읽습니다." });
    care.push("다른 자리에서도 방식이 부딪히는 관계가 읽혀요");
  }

  // 4. 오행 보완 — 한쪽에 없는(0개) 오행을 다른 쪽이 두 개 이상 가진 경우
  const fillsA = FIVE_ELEMENTS.filter((el) => a.counts[el] === 0 && b.counts[el] >= 2);
  const fillsB = FIVE_ELEMENTS.filter((el) => b.counts[el] === 0 && a.counts[el] >= 2);
  const fillPts = Math.min(9, (fillsA.length + fillsB.length) * 3);
  const overlap = FIVE_ELEMENTS.filter((el) => a.counts[el] >= 3 && b.counts[el] >= 3);
  const overlapPts = overlap.length > 0 ? -3 : 0;
  if (fillPts > 0) {
    parts.push({ id: "element-fill", label: "서로 비어 있는 기운을 채우는 관계", points: fillPts, reason: `보완 ${fillsA.length + fillsB.length}가지` });
    const bits = [...fillsA.map((el) => `A님에게 없는 ${el} 기운(${ELEMENT_HANJA[el]})을 B님이 가짐`), ...fillsB.map((el) => `B님에게 없는 ${el} 기운(${ELEMENT_HANJA[el]})을 A님이 가짐`)];
    push({ id: "compat.element.fill", topics: ["relationship", "personality"], strength: "moderate", fact: `${bits.join(", ")} (지장간 제외 원국 글자 기준)`, cue: "전통 해석에서는 한쪽에 없는 오행을 상대가 갖고 있으면 서로의 빈 곳을 채워 주는 조합으로 읽는 경우가 많습니다. 없다는 것이 결함이라는 뜻은 아니며, 채워 준다고 늘 편하다는 뜻도 아닙니다." });
    good.push("서로 비어 있는 기운을 채워 줄 수 있는 조합으로 읽혀요");
  }
  if (overlap.length > 0) {
    parts.push({ id: "element-overlap", label: "같은 기운이 겹쳐 두드러짐", points: overlapPts, reason: `${overlap.join(" · ")} 기운이 둘 다 두드러짐` });
    push({ id: "compat.element.overlap", topics: ["relationship", "personality"], strength: "weak", fact: `두 사람 모두 ${overlap.join(" · ")} 기운이 3개 이상 (지장간 제외 원국 글자 기준)`, cue: "같은 오행이 둘 다 두드러지면 닮은 면이 크고 같은 부분이 함께 강해지는 조합으로 봅니다. 같은 곳에서 같이 막힐 수 있다는 면도 함께 봅니다." });
    care.push(`${overlap.join(" · ")} 기운이 둘 다 두드러져서 같은 곳에서 같이 막힐 수 있어요`);
  }

  // 5. 속도 — 먼저 움직이는 쪽(비겁 · 식상)과 확인하고 움직이는 쪽(인성 · 관성)
  const pace = paceOf(a.lean, b.lean);
  push({
    id: "compat.pace",
    topics: ["relationship", "personality", "work"],
    strength: "weak",
    fact: `A님은 ${a.lean === "go" ? "먼저 움직이는 쪽" : a.lean === "careful" ? "확인하고 움직이는 쪽" : "어느 한쪽으로 기울지 않음"}(비겁 · 식상 ${a.drive}자리 · 인성 · 관성 ${a.steady}자리), B님은 ${b.lean === "go" ? "먼저 움직이는 쪽" : b.lean === "careful" ? "확인하고 움직이는 쪽" : "어느 한쪽으로 기울지 않음"}(비겁 · 식상 ${b.drive}자리 · 인성 · 관성 ${b.steady}자리)`,
    cue: "비겁 · 식상(자기 주도 · 표현 · 새로운 시도)이 많으면 먼저 움직이는 쪽, 인성 · 관성(배움 · 검토 · 책임 · 기준)이 많으면 확인하고 움직이는 쪽으로 읽는 한 가지 서술입니다. 두 쪽의 자리 수 차이가 1자리 이상이면 그쪽으로 기울었다고 보는 단순한 구분이라 차이가 작을수록 약한 근거이고, 속도에 대한 실제 행동은 응답으로 확인해야 하며 이 근거만으로 단정하지 않습니다.",
  });
  const paceText =
    pace === "mixed"
      ? "한 명은 먼저 움직이고 한 명은 확인하고 움직이는 쪽으로 읽혀요"
      : pace === "go-go"
        ? "둘 다 먼저 움직이는 쪽으로 읽혀서 속도가 빠른 편이에요"
        : pace === "careful-careful"
          ? "둘 다 확인하고 움직이는 쪽으로 읽혀서 차분하게 쌓아 가는 편이에요"
          : "움직이는 속도는 한쪽으로 뚜렷하게 기울지 않아요";

  // 끌림 · 부딪힘 정도 — 10배한 정수로 센다
  const pull10 = (stemCombine ? STEM_PAIR_WEIGHT10["day-day"] : 0) + dayDay.reduce((s, r) => s + (r.kind === "육합" ? 30 : r.kind === "반합" ? 18 : 0), 0) + crossPull10;
  const friction10 = dayDay.reduce((s, r) => s + (r.kind === "충" ? 30 : r.kind === "형" ? 21 : 0), 0) + crossClash10 + (dayElement === "control" && !stemCombine ? 10 : 0);
  const pull = pull10 >= LEVEL_CUTS10.pull[1] ? 2 : pull10 >= LEVEL_CUTS10.pull[0] ? 1 : 0;
  const friction = friction10 >= LEVEL_CUTS10.friction[1] ? 2 : friction10 >= LEVEL_CUTS10.friction[0] ? 1 : 0;
  const levels = { pull, friction, pace, dayElement, pullPoints: pull10 / 10, frictionPoints: friction10 / 10 } as CompatResult["levels"];

  const total = parts.reduce((s, p) => s + p.points, 0);
  const score = Math.max(0, Math.min(100, SCORE_BASE + Math.round((total * SCORE_SPREAD10) / 10)));

  const cautions: string[] = [];
  if (!a.hourKnown || !b.hourKnown) cautions.push("출생 시각을 모르는 사람은 시주 없이 읽었어요. 이 결과는 일지 · 월지 · 년지를 중심으로 읽어서 시각의 영향이 크지 않아요.");
  if (unc.a.size > 0 || unc.b.size > 0) cautions.push("출생 시각이 절기나 자시 경계에 가까운 사람이 있어서 일부 관계는 달라질 수 있어요. 참고로만 봐 주세요.");

  const coupleType = coupleTypeOf(levels);
  // 무료 간단 궁합에서 보여 준 커플 유형 · 총점과 같은 계산을 사주 궁합(유료)이 같이 인용할 수 있게 근거에도 넣는다
  push({
    id: "compat.type",
    topics: ["relationship"],
    strength: "weak",
    fact: `커플 유형: ${coupleType.name} — 끌림 ${pull}단계 · 부딪힘 ${friction}단계(각 0~2) · 속도 ${paceText}`,
    cue: `재미 · 공유를 위한 분류입니다. "${coupleType.line}" 사주에서 검증된 유형이 아니며 좋고 나쁨을 뜻하지 않습니다. 이 유형의 이름만으로 두 사람을 설명하지 않고, 아래 근거가 말하는 범위에서 풀어 씁니다.`,
  });
  push({
    id: "compat.score",
    topics: ["relationship"],
    strength: "weak",
    fact: `궁합 지수 ${score} — 재료: ${parts.map((p) => `${p.label} ${p.points > 0 ? "+" : ""}${p.points}`).join(", ") || "뚜렷한 합 · 충 없음"} (바탕 ${SCORE_BASE}, 합계에 ${SCORE_SPREAD10 / 10}배)`,
    cue: `${scoreMeaningOf(score)} 관계가 이어질 확률이나 정확도가 아니라 두 사주에서 읽힌 합 · 충 · 오행 보완을 규칙대로 정리한 재미 · 참고용 지수입니다. 숫자의 높고 낮음을 좋고 나쁨으로 풀지 않습니다.`,
  });

  return {
    version: COMPAT_RULE_VERSION,
    a,
    b,
    levels,
    parts,
    score,
    scoreMeaning: scoreMeaningOf(score),
    coupleType,
    highlights: { good, care, pace: paceText },
    evidence,
    cautions,
  };
}

/** 화면 · 안내문이 같은 문장을 쓰도록 한곳에 둔다 */
export const COMPAT_EXPLAIN = {
  /** 총점을 설명하는 한 문장 — 화면 · 안내문이 같은 문장을 쓴다 */
  scoreBasis: "타고난 중심 성향 사이 · 배우자 자리(일지) 사이 · 그 밖의 자리끼리의 합과 충 · 서로 비어 있는 기운을 채우는지를 미유의 규칙으로 점수로 옮긴 값이에요.",
  scoreNotProbability: "관계가 이어질 확률이나 궁합의 정확도가 아니라, 두 사주에서 읽힌 조화와 차이를 정리한 재미 · 참고용 지수예요.",
  tradition: "전통 사주 해석을 단순하게 정리한 규칙이고, 검증된 사실이 아니에요. 두 사람의 사주만 본 결과이고 실제 성격이나 마음을 말해 주지는 않아요.",
} as const;
