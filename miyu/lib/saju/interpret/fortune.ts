// 사주 풀이 재료 보강 — 십성 분포 · 일의 계열 · 재물 · 육친(인복 · 가족) · 인연의 경향 · 개운(색 · 방향 · 숫자 · 장소)
// (운영자 2026-10-17: "미유는 사주풀이가 중심이고 성격 · 기질 · 애착 · MBTI는 그 풀이를 개인화하는 보조 정보" — 직업운 · 재물복 · 연애운 · 인복 · 개운법을 응답이 없어도 사주 근거로 끝까지 풀 수 있게 재료를 더한다).
// 이 모듈은 순수 계산이다(AI를 쓰지 않고, 만세력 엔진이 계산한 원국의 글자 · 오행 개수 · 십신만 입력으로 받는다). 문장은 전통 해석을 "~로 봅니다" 수준으로 정리한 초안이며 **전문가 검토 전**이다.
//
// 하지 않은 것: 격국 · 용신 · 희신 · 기신 · 신살 · 십이운성 · 공망 밖의 살(煞) 판정. "보완 후보"는 원국 오행 개수와 태어난 계절(조후)만으로 정한 단순화이며 이 사람에게 꼭 필요한 기운을 판정한 것이 아니다.
// 근거 문장(fact · cue)에는 그 판정 이름을 쓰지 않는다 — 근거 목록에 그 낱말이 있으면 글에서 이 사람의 판정으로 써도 되는 것으로 읽히기 때문이다(terms.ts의 "근거 없는 판정" 검사).
// 근거 ID: saju.sipsung · saju.career · saju.wealth · saju.kin · saju.partner · saju.fortify — 규칙 이력은 rule-meta.ts의 fortune-* 항목.
import type { Evidence } from "../../report/evidence.ts";
import type { FiveElement, PillarKey, SajuOk } from "../engine.ts";
import { FIVE_ELEMENTS, PILLAR_LABEL } from "../engine.ts";
import { analyzeStructure, GROUP_OF, type Group } from "./structure.ts";
import { partnerReading } from "./partner.ts";

export const FORTUNE_RULE_VERSION = "saju-fortune-rules-0.1-draft";

// ───────────── 개운(오행 대응) ─────────────

export type ElementFortune = {
  /** 오행의 이미지 */
  image: string;
  direction: string;
  season: string;
  colors: string[];
  /** 수(數) — 하도(河圖)의 생수 · 성수 */
  numbers: [number, number];
  places: string[];
  habits: string[];
  /** 이 기운의 느낌 한 줄 — 개운 근거 문구가 특정 행동 대신 쓰는 말(리포트가 습관 하나를 가볍게 고를 때의 방향, 같은 행동 조언이 장마다 되풀이되지 않게) */
  feel: string;
  /** 이 기운의 성향을 가진 사람 — "가까이 두면 균형이 맞는다"고 읽는 전통 해석 */
  people: string;
};

/**
 * 오행 대응표 — 방향(목 동 · 화 남 · 토 중앙 · 금 서 · 수 북) · 계절 · 색(청 · 적 · 황 · 백 · 흑)은 전통 오행 대응의 일반적인 서술이고, 수(數)는 하도의 생수 · 성수(목 3 · 8, 화 2 · 7, 토 5 · 10, 금 4 · 9, 수 1 · 6)다.
 * 장소 · 습관 · 사람의 성향은 이 대응을 생활에 옮긴 미유의 정리(초안)다. 색 · 소재 · 습관은 보완 아이템(lib/saju/items.ts)과 같은 말을 쓴다.
 */
export const ELEMENT_FORTUNE: Record<FiveElement, ElementFortune> = {
  목: { image: "나무", direction: "동쪽", season: "봄", colors: ["초록", "청록", "연두"], numbers: [3, 8], places: ["숲길 · 공원 · 식물이 많은 곳", "나무가 보이는 창가"], habits: ["아침에 10분 걷기", "새로 배우고 싶은 것을 한 줄 적기"], feel: "뻗어 나가고 새로 시작하는 느낌", people: "새로운 시도를 응원하고 성장 · 계획을 함께 이야기해 주는 사람" },
  화: { image: "불", direction: "남쪽", season: "여름", colors: ["빨강", "주황", "따뜻한 노랑"], numbers: [2, 7], places: ["햇볕이 잘 드는 곳", "따뜻한 조명이 있는 공간 · 사람 소리가 있는 활기 있는 곳"], habits: ["하루에 한 번 마음을 말로 표현하기", "땀이 나는 운동"], feel: "밝고 드러내는 느낌", people: "밝고 표현이 풍부해 분위기를 따뜻하게 만드는 사람" },
  토: { image: "흙", direction: "중앙(가운데)", season: "환절기(늦여름)", colors: ["베이지", "황토", "갈색"], numbers: [5, 10], places: ["흙길 · 낮은 산 · 텃밭처럼 안정감 있는 곳", "정돈된 집과 책상"], habits: ["같은 시간에 식사하고 자기", "하루 일정에 쉬는 시간 넣기"], feel: "안정되고 중심을 잡는 느낌", people: "차분하고 중심이 잡혀 서로의 사이를 중재해 주는 사람" },
  금: { image: "쇠", direction: "서쪽", season: "가을", colors: ["흰색", "은색", "회색"], numbers: [4, 9], places: ["탁 트이고 정돈된 공간", "물건이 제자리에 있는 깔끔한 곳 · 높은 곳의 전망"], habits: ["마감 시간 정하기", "거절할 때 쓸 문장 하나 정해 두기"], feel: "정돈되고 매듭짓는 느낌", people: "기준이 분명하고 약속과 정리를 잘 지키는 사람" },
  수: { image: "물", direction: "북쪽", season: "겨울", colors: ["검정", "남색", "짙은 파랑"], numbers: [1, 6], places: ["강 · 호수 · 바다처럼 물가가 가까운 곳", "조용하고 차분한 공간"], habits: ["잠들기 전 10분 읽기나 명상", "충분히 자고 쉬는 날 정해 두기"], feel: "고요하고 쉬어 가는 느낌", people: "생각이 깊고 차분하게 들어 주는 사람" },
};

/** 본문이 그 기운의 대응을 실제로 말하는지 알아보는 낱말 — 방향 · 색 · 장소는 낱말로, 수(數)는 숫자(앞뒤에 다른 숫자가 없는 것)로 센다 */
export const FORTUNE_WORDS: Record<FiveElement, { direction: RegExp; color: RegExp; place: RegExp; numbers: [RegExp, RegExp] }> = {
  목: { direction: /동쪽|동향|동녘|동쪽 방향/, color: /초록|청록|연두|녹색|푸른|푸르/, place: /숲|공원|나무|식물|화분|정원|산책로/, numbers: [/(?<![\d.])3(?![\d])/, /(?<![\d.])8(?![\d])/] },
  화: { direction: /남쪽|남향|남녘|남쪽 방향/, color: /빨강|빨간|붉|주황|따뜻한 노랑|노란/, place: /햇볕|햇빛|양지|조명|밝은 곳|활기/, numbers: [/(?<![\d.])2(?![\d])/, /(?<![\d.])7(?![\d])/] },
  토: { direction: /중앙|가운데|한가운데/, color: /베이지|황토|갈색|브라운|노란/, place: /흙|도자기|텃밭|정돈|낮은 산|안정감/, numbers: [/(?<![\d.])5(?![\d])/, /(?<![\d.])10(?![\d])/] },
  금: { direction: /서쪽|서향|서녘|서쪽 방향/, color: /흰색|하얀|흰 |은색|회색|실버/, place: /탁 트인|정돈|깔끔|높은 곳|전망|제자리/, numbers: [/(?<![\d.])4(?![\d])/, /(?<![\d.])9(?![\d])/] },
  수: { direction: /북쪽|북향|북녘|북쪽 방향/, color: /검정|검은|남색|짙은 파랑|네이비|검푸른/, place: /물가|강|바다|호수|해안|수변|계곡|분수/, numbers: [/(?<![\d.])1(?![\d])/, /(?<![\d.])6(?![\d])/] },
};

export type Fortify = {
  counts: Record<FiveElement, number>;
  primary: { element: FiveElement; count: number };
  /** 1순위와 개수가 같은 기운(동점) — 1순위는 같은 입력이 늘 같은 결과를 내도록 TIE_ORDER로 정한 값이라 동점이면 어느 쪽이 먼저라고 말하지 않는다(운영자 2026-10-18). 동점이 없으면 빈 배열 */
  tied: FiveElement[];
  /** 그다음 후보 — 개수가 적은 쪽 하나와 계절 보완(조후) 후보, 합쳐 둘까지 */
  others: { element: FiveElement; count: number; reason: "적음" | "계절" }[];
};

/** 일간 오행 기준 십성 그룹별 오행 — 비겁 = 같은 오행, 인성 = 나를 생하는 오행, 식상 = 내가 생하는 오행, 재성 = 내가 극하는 오행, 관성 = 나를 극하는 오행 */
function elementsByGroup(dm: FiveElement): Record<Group, FiveElement> {
  const next = (e: FiveElement): FiveElement => FIVE_ELEMENTS[(FIVE_ELEMENTS.indexOf(e) + 1) % 5];
  const prev = (e: FiveElement): FiveElement => FIVE_ELEMENTS[(FIVE_ELEMENTS.indexOf(e) + 4) % 5];
  return { 비겁: dm, 식상: next(dm), 재성: next(next(dm)), 관성: prev(prev(dm)), 인성: prev(dm) };
}

/** 개수가 같을 때만 쓰는 순서(일간을 돕는 쪽부터) — 학파의 기준이 아니라 같은 입력이 늘 같은 결과를 내게 하는 단순화다 */
const TIE_ORDER: Group[] = ["인성", "비겁", "식상", "재성", "관성"];

/**
 * 보완 후보 기운 — 원국 오행 개수(지장간 제외)에서 없거나 1개뿐인 기운을 개수가 적은 순서로 고르고(모두 2개 이상이면 가장 적은 기운), 겨울 · 여름 태생이면 계절을 보완하는 기운(조후 후보)을 더한다.
 * 보완 아이템(items.ts)이 "적게 나타난 기운"을 고르는 기준과 같아서 무료 화면의 보완 아이템과 어긋나지 않는다. 월주가 절기 경계에 걸려 달라질 수 있으면 계절은 보지 않는다.
 */
export function fortifyOf(saju: SajuOk): Fortify {
  const counts = saju.elementCounts;
  const dm = saju.dayMaster.element;
  const byGroup = elementsByGroup(dm);
  const rank = (e: FiveElement) => TIE_ORDER.findIndex((g) => byGroup[g] === e);
  const min = Math.min(...FIVE_ELEMENTS.map((e) => counts[e]));
  const few = FIVE_ELEMENTS.filter((e) => counts[e] <= 1);
  const pool = (few.length ? few : FIVE_ELEMENTS.filter((e) => counts[e] === min)).sort((a, b) => counts[a] - counts[b] || rank(a) - rank(b));
  const primary = pool[0];
  const others: Fortify["others"] = pool.slice(1, 2).map((element) => ({ element, count: counts[element], reason: "적음" as const }));
  const monthUncertain = saju.notes.some((n) => (n.kind === "jeolgi-day" || n.kind === "near-boundary" || n.kind === "jasi-school") && n.pillars.includes("month"));
  if (!monthUncertain) {
    const johu = analyzeStructure({ dayMaster: saju.dayMaster.stem, pillars: saju.pillars.map((p) => ({ key: p.key, stem: p.stem, branch: p.branch })) }).johu;
    if (johu && johu.need !== primary && !others.some((o) => o.element === johu.need) && counts[johu.need] <= 1) others.push({ element: johu.need, count: counts[johu.need], reason: "계절" });
  }
  const tied = pool.filter((e) => e !== primary && counts[e] === counts[primary]);
  return { counts, primary: { element: primary, count: counts[primary] }, tied, others };
}

/** 보완 후보 기운들 — 동점이면 동점인 기운 모두(대응을 같은 무게로 소개), 아니면 1순위 하나 */
export const fortifyCandidates = (f: Pick<Fortify, "primary" | "tied">): FiveElement[] => [f.primary.element, ...f.tied];

/**
 * 근거 목록의 개운 근거(fact)에서 보완 후보를 꺼낸다 — "보완 후보 1순위: X(" 하나, 또는 동점이면 "보완 후보 동점(…): X(…) · Y(…)" 모두.
 * 검사가 본문이 그 기운의 대응(방향 · 색 · 숫자 · 장소)을 말하는지 확인할 때 쓴다.
 */
export function fortifyCandidatesOf(evidence: Pick<Evidence, "id" | "fact" | "uncertain">[]): FiveElement[] {
  const e = evidence.find((x) => x.id === "saju.fortify" && !x.uncertain);
  if (!e) return [];
  const tie = /보완 후보 동점\([^)]*\): ((?:[목화토금수]\([^)]*\)(?: · )?)+)/.exec(e.fact);
  if (tie) return [...tie[1].matchAll(/([목화토금수])\(/g)].map((m) => m[1] as FiveElement);
  const one = /보완 후보 1순위: ([목화토금수])\(/.exec(e.fact);
  return one ? [one[1] as FiveElement] : [];
}

/** 보완 후보 가운데 앞의 하나 — 동점이면 그중 첫 기운(우선순위가 아니라 표시 순서). 후보를 모두 봐야 하는 검사는 fortifyCandidatesOf를 쓴다 */
export function fortifyPrimaryOf(evidence: Pick<Evidence, "id" | "fact" | "uncertain">[]): FiveElement | null {
  return fortifyCandidatesOf(evidence)[0] ?? null;
}

/** 본문이 1순위 보완 기운의 대응을 말하는가 — 방향 · 색 · 수(數) · 장소 각각 */
export function fortuneMentions(text: string, element: FiveElement): { direction: boolean; color: boolean; number: boolean; place: boolean } {
  const w = FORTUNE_WORDS[element];
  return { direction: w.direction.test(text), color: w.color.test(text), number: w.numbers.some((re) => re.test(text)), place: w.place.test(text) };
}

// ───────────── 십성 분포 · 일 · 재물 · 육친 ─────────────

type GroupCount = { n: number; names: Record<string, number>; where: string[] };

function groupCounts(saju: SajuOk): Record<Group, GroupCount> {
  const out = Object.fromEntries((["비겁", "식상", "재성", "관성", "인성"] as Group[]).map((g) => [g, { n: 0, names: {}, where: [] } as GroupCount])) as Record<Group, GroupCount>;
  for (const p of saju.pillars) {
    for (const [part, tg] of [["천간", p.tenGod.stem], ["지지", p.tenGod.branch]] as const) {
      const g = GROUP_OF[tg];
      if (!g) continue; // 일간 자신
      out[g].n += 1;
      out[g].names[tg] = (out[g].names[tg] ?? 0) + 1;
      out[g].where.push(`${PILLAR_LABEL[p.key]} ${part}`);
    }
  }
  return out;
}

const NAMES: Record<Group, [string, string]> = { 비겁: ["비견", "겁재"], 식상: ["식신", "상관"], 재성: ["편재", "정재"], 관성: ["편관", "정관"], 인성: ["편인", "정인"] };
const nameText = (g: Group, c: GroupCount) => (c.n === 0 ? `${g} 0자리` : `${g} ${c.n}자리(${NAMES[g].filter((x) => c.names[x]).map((x) => `${x} ${c.names[x]}`).join(" · ")})`);

const WORK_LINE: Record<Group, string> = {
  식상: "표현 · 기술 · 창작 · 콘텐츠 · 가르침처럼 내가 만들어 낸 결과물로 인정받는 일",
  관성: "조직 · 공공 · 규칙과 책임이 분명한 일, 관리 · 운영 · 평가 기준이 있는 일",
  재성: "현실 실무 · 영업 · 사업 · 자산이나 자원을 다루는 일, 성과가 숫자로 보이는 일",
  인성: "배움 · 연구 · 자격 · 교육 · 전문 지식이 쌓일수록 힘이 나는 일",
  비겁: "독립적으로 움직이는 일 · 동료와 함께 나누거나 경쟁하는 일 · 내 기준이 중요한 일",
};

const monthOf = (saju: SajuOk) => saju.pillars.find((p) => p.key === "month");
const pillarText = (saju: SajuOk, key: PillarKey) => {
  const p = saju.pillars.find((x) => x.key === key);
  return p ? `${PILLAR_LABEL[key]} ${p.stem}${p.branch} — 천간 ${p.tenGod.stem} · 지지 ${p.tenGod.branch}` : null;
};

/** 근거 목록에 더하는 사주 풀이 재료 여섯 가지. 성별 · 출생 시각이 없어도 만든다(시각을 모르면 시주 없이 센다) */
export function fortuneEvidence(saju: SajuOk, opts: { ageDirection?: boolean } = {}): Evidence[] {
  const counts = groupCounts(saju);
  const total = (["비겁", "식상", "재성", "관성", "인성"] as Group[]).reduce((n, g) => n + counts[g].n, 0);
  const dm = saju.dayMaster;
  const uncertain = new Set(saju.notes.filter((n) => n.kind === "jeolgi-day" || n.kind === "near-boundary" || n.kind === "jasi-school").flatMap((n) => n.pillars));
  const structure = analyzeStructure({ dayMaster: dm.stem, pillars: saju.pillars.map((p) => ({ key: p.key, stem: p.stem, branch: p.branch })) });
  const groups: Group[] = ["비겁", "식상", "재성", "관성", "인성"];
  const ordered = [...groups].sort((a, b) => counts[b].n - counts[a].n || TIE_ORDER.indexOf(a) - TIE_ORDER.indexOf(b));
  const top = ordered[0];
  /** 가장 많은 자리 수가 같은 갈래들 — 동점을 한 갈래만 "가장 많다"고 하지 않는다(2026-10-18 실제 AI 글에서 비겁 · 재성이 같은 2자리인데 비겁만 가장 많다고 쓴 일) */
  const tops = ordered.filter((g) => counts[g].n === counts[top].n);
  const none = groups.filter((g) => counts[g].n === 0);
  const month = monthOf(saju);
  const hu = saju.hourPillarOmitted;
  /** "없는 쪽"을 말하는 범위 — 시각을 모르면 세 기둥 기준이다(시주에 있을 수 있어 사주 전체에 없다는 뜻이 아니다) */
  const noneLabel = hu ? "세 기둥(시주 제외) 기준 없는 쪽(시주에 있을 수 있음)" : "원국에 없는 쪽";
  const out: Evidence[] = [];

  // 1) 십성 분포 한눈에
  out.push({
    id: "saju.sipsung",
    source: "saju",
    topics: ["personality", "work"],
    strength: "moderate",
    fact: `십성 분포(일간 ${dm.stem}${dm.element} 기준, 일간을 뺀 ${total}자리, 지지는 정기 기준${hu ? ", 시주 없음 — 세 기둥 기준" : ""}): ${groups.map((g) => nameText(g, counts[g])).join(" / ")} / 가장 많은 쪽: ${tops.join(" · ")} ${counts[top].n}자리${tops.length > 1 ? "(같은 수 — 한쪽만 가장 많다고 말하지 않음)" : ""} / ${noneLabel}: ${none.length ? none.join(" · ") : "없음"}${month ? ` / ${pillarText(saju, "month")}` : ""}`,
    cue: `십성은 일간과 다른 글자의 관계를 다섯 갈래로 읽는 전통 방식입니다 — 비겁은 나와 같은 기운(자기 기준 · 독립 · 동료), 식상은 내가 만들어 내는 기운(표현 · 기술 · 결과물), 재성은 내가 다루는 기운(현실 감각 · 돈과 자원), 관성은 나를 다스리는 기운(규칙 · 책임 · 조직), 인성은 나를 돕는 기운(배움 · 보살핌 · 자격)으로 봅니다. 많은 쪽은 이 사람이 힘을 쓰는 방식의 바탕으로, 월주에 놓인 십성은 사회 · 일에서 처음 드러나는 모습으로, 없는 쪽은 그 기운이 들어오는 시기에 그 주제가 크게 느껴지는 것으로 읽습니다. 개수만으로 좋고 나쁨 · 성패를 정하지 않으며, 없는 기운을 이 사람의 능력 부족으로 풀지 않습니다.${hu ? " 출생 시각을 몰라 시주를 뺀 세 기둥 기준이므로 없는 쪽을 사주 전체에 없다고 읽지 않습니다." : ""}`,
  });

  // 2) 일의 계열
  const second = ordered[1];
  const combos: string[] = [];
  if (counts.식상.n >= 1 && counts.재성.n >= 1) combos.push("식상이 재성으로 이어짐(만든 결과물이 성과 · 수입으로 이어지는 구조)");
  if (counts.관성.n >= 1 && counts.인성.n >= 1) combos.push("관성과 인성이 함께 있음(조직 안에서 배움 · 자격으로 인정받는 구조)");
  if (counts.인성.n >= 1 && counts.식상.n >= 1) combos.push("인성과 식상이 함께 있음(배운 것을 표현 · 결과물로 내는 구조)");
  if (counts.비겁.n > counts.재성.n && counts.재성.n >= 1) combos.push("비겁이 재성보다 많음(나누거나 경쟁하는 몫이 큰 구조)");
  out.push({
    id: "saju.career",
    source: "saju",
    topics: ["work"],
    strength: "moderate",
    fact: `일의 계열 읽기 재료: ${tops.length > 1 ? `가장 두드러진 쪽 ${tops.join(" · ")}(같은 ${counts[top].n}자리 — 한쪽만 앞선다고 말하지 않음) — ${tops.map((g) => `${g}: ${WORK_LINE[g]}`).join(" / ")}` : `가장 두드러진 쪽 ${top}(${counts[top].n}자리) — ${WORK_LINE[top]} / 그다음 ${second}(${counts[second].n}자리) — ${WORK_LINE[second]}`} / ${month ? `월주(사회 · 일의 자리) 천간 ${month.tenGod.stem} · 지지 ${month.tenGod.branch}` : "월주 없음"} / 조합: ${combos.length ? combos.join(", ") : "눈에 띄는 조합 없음"} / ${noneLabel}: ${none.length ? none.join(" · ") : "없음"}`,
    cue: "전통에서 일의 방향은 십성 분포로 읽습니다 — 식상은 표현 · 기술 · 창작 · 가르침, 관성은 조직 · 공공 · 규칙과 책임, 재성은 현실 실무 · 영업 · 사업 · 자산, 인성은 배움 · 연구 · 자격 · 전문직, 비겁은 독립 · 협업 · 경쟁이 있는 일의 계열로 봅니다. 가장 많은 쪽과 월주의 십성이 일하는 방식의 바탕이고 없는 쪽은 그 기운이 들어오는 시기에 주제로 커진다고 봅니다. 직업 하나를 정하거나 성공을 보장하지 않고, 일의 계열 · 어울리는 환경 · 일하는 방식까지 읽습니다. 응답에서 읽은 평소 행동은 이 계열이 이 사람에게 어떻게 나타나는지 구체화하는 데만 씁니다.",
  });

  // 3) 재물
  const jaeNames = counts.재성.names;
  const support = structure.power.support.length;
  const drain = structure.power.drain.length;
  const wealthReads: string[] = [];
  if (counts.재성.n === 0) wealthReads.push(hu ? "세 기둥(시주 제외) 기준 재성이 없음(시주에 있을 수 있어 재성이 없다고 읽지 않고, 재성 운이 들어오는 시기에 돈 주제가 크게 느껴질 수 있다고만 읽음)" : "재성이 원국에 없음(재성 운이 들어오는 시기에 돈 주제가 크게 느껴질 수 있다고 읽음)");
  else {
    if ((jaeNames["정재"] ?? 0) > (jaeNames["편재"] ?? 0)) wealthReads.push("정재가 편재보다 많음(꾸준히 모으고 지키는 쪽으로 읽음)");
    else if ((jaeNames["편재"] ?? 0) > (jaeNames["정재"] ?? 0)) wealthReads.push("편재가 정재보다 많음(여러 갈래로 움직이거나 한 번에 크게 움직이는 돈 · 사람과 얽히는 돈으로 읽음)");
    else wealthReads.push("정재와 편재가 비슷함(꾸준한 돈과 움직이는 돈이 함께 읽힘)");
    if (counts.재성.n > support) wealthReads.push(`재성 ${counts.재성.n}자리가 일간을 돕는 자리 ${support}곳보다 많음(들어오는 돈을 감당하는 힘이 모자라면 나가기 쉽다고 읽는 구조)`);
  }
  if (counts.식상.n >= 1 && counts.재성.n >= 1) wealthReads.push("식상이 재성으로 이어짐(만든 결과물이 돈으로 이어지는 흐름으로 읽음)");
  if (counts.비겁.n > counts.재성.n) wealthReads.push("비겁이 재성보다 많음(같이 쓰고 나누는 돈 · 체면과 경쟁으로 나가는 돈의 주제가 큰 구조로 읽음)");
  if (counts.관성.n >= 1 && counts.재성.n >= 1) wealthReads.push("관성이 재성과 함께 있음(조직 안에서 받는 안정적인 수입 쪽으로 읽힘)");
  out.push({
    id: "saju.wealth",
    source: "saju",
    topics: ["money", "work"],
    strength: "moderate",
    fact: `재물 읽기 재료${hu ? "(시주 없음 — 세 기둥 기준)" : ""}: ${nameText("재성", counts.재성)}(위치: ${counts.재성.where.join(", ") || "없음"}) / ${nameText("식상", counts.식상)} / ${nameText("비겁", counts.비겁)} / ${nameText("관성", counts.관성)} / 일간을 돕는 자리 ${support}곳 · 덜어내는 자리 ${drain}곳 / 읽히는 구조: ${wealthReads.join(", ")}`,
    cue: "전통 재물 해석은 재성을 돈의 길로 보고, 정재는 꾸준한 수입 · 모으고 지키는 돈, 편재는 여러 갈래의 돈 · 한 번에 움직이는 큰 돈 · 사람을 통해 생기는 돈으로 읽습니다. 식상이 재성을 이어 주면 만든 결과물이 돈이 되는 흐름, 비겁이 많으면 같이 쓰고 나누는 돈 · 경쟁으로 나가는 돈이 커지기 쉬운 구조, 재성이 많은데 일간을 돕는 쪽이 적으면 들어오는 돈을 감당하기 어려워 나가기 쉬운 구조로 읽습니다. 돈이 들어오고 나가는 양상을 읽을 수 있지만 재성 개수 하나로 부자 · 가난을 정하지 않고, 실제 소득 · 소비 습관 · 저축은 입력받지 않았습니다. 투자 · 대출 · 부동산 같은 금융 결정의 근거로 쓰지 않습니다.",
  });

  // 4) 육친 — 인복 · 가족 · 친구 · 동료. 년주 · 월주는 절기 경계에 걸려 달라질 수 있으면 uncertain
  const fortify = fortifyOf(saju);
  const helperTop = counts.인성.n + counts.비겁.n;
  const exposedHelpers = saju.pillars.filter((p) => ["인성", "비겁"].includes(GROUP_OF[p.tenGod.stem] ?? "")).length;
  const kinUncertain = uncertain.has("year") || uncertain.has("month");
  out.push({
    id: "saju.kin",
    source: "saju",
    topics: ["relationship"],
    strength: "weak",
    fact: `관계 자리(전통 육친 대응, 일간 기준 십성${hu ? ", 시주 없음 — 년주 · 월주 · 일주 기준이며 시주(자녀와 이어지는 자리)는 읽지 않음" : ""}): 인성 ${counts.인성.n}자리(어머니 · 윗사람 · 스승 — ${nameText("인성", counts.인성)}) / 비겁 ${counts.비겁.n}자리(형제 · 친구 · 동료) / 재성 ${counts.재성.n}자리(아버지 · 현실의 지원 — 편재 ${jaeNames["편재"] ?? 0} · 정재 ${jaeNames["정재"] ?? 0}) / 관성 ${counts.관성.n}자리(직장 상사 · 조직의 윗사람) / 식상 ${counts.식상.n}자리(후배 · 아랫사람) / ${pillarText(saju, "year") ?? "년주 없음"}(조상 · 어린 시절 바깥 환경 자리) / ${pillarText(saju, "month") ?? "월주 없음"}(부모 · 형제 · 성장 환경 자리) / 도움을 주는 쪽(인성 + 비겁) ${helperTop}자리, 천간에 드러난 것 ${exposedHelpers}곳 / 가까이 두면 균형이 맞는 사람의 분위기(${fortify.tied.length ? `보완 후보 동점 ${fortifyCandidates(fortify).join(" · ")} 기운의 성향` : `보완 후보 ${fortify.primary.element} 기운의 성향`}): ${fortify.tied.length ? fortifyCandidates(fortify).map((e) => `${e} — ${ELEMENT_FORTUNE[e].people}`).join(" / ") : ELEMENT_FORTUNE[fortify.primary.element].people}`,
    cue: "전통 육친론은 십성을 사람 사이의 관계로도 읽습니다 — 인성은 어머니 · 윗사람 · 스승, 재성(특히 편재)은 아버지 · 현실의 지원, 비겁은 형제 · 친구 · 동료, 관성은 직장 상사 · 조직의 윗사람, 식상은 후배 · 아랫사람으로 대응합니다. 월주를 부모 · 형제와 성장 환경의 자리로, 년주를 조상과 어린 시절 바깥 환경의 자리로 보기도 합니다. 도움을 주는 쪽(인성 · 비겁)이 천간에 드러나거나 자리가 든든하면 도움 받는 인연(인복) 이야기로 읽고, 보완 후보 기운의 성향을 가진 사람을 가까이 두면 균형이 맞는다고 읽습니다. 개수와 자리만으로 가족 관계의 좋고 나쁨 · 실제 있었던 일 · 가족 구성을 정하지 않으며 입력받은 가족 정보는 없습니다. 자녀 · 출산에 관한 이야기는 하지 않습니다.",
    ...(kinUncertain ? { uncertain: true } : {}),
  });

  // 5) 인연의 경향 — 배우자 자리(일지)로 읽는 편한 상대의 분위기 · 큰 방향 · 오래 가는 관계의 조건(partner.ts와 같은 규칙)
  const partner = partnerReading(saju);
  const tilt = opts.ageDirection !== false;
  out.push({
    id: "saju.partner",
    source: "saju",
    topics: ["love", "marriage", "relationship"],
    strength: "moderate",
    fact: `배우자 자리(일지) ${partner.palace.branch} — ${partner.palace.tenGod}(${partner.palace.group}) → 편하게 느끼기 쉬운 상대의 분위기: ${partner.mood.title}${tilt ? ` / 나이 차의 큰 방향: ${partner.ageTilt.label}(몇 살 차이라는 뜻이 아님)` : ""} / 오래 가는 관계에서 중요하게 여기기 쉬운 것: ${partner.longTerm.headline}${partner.star ? ` / 배우자 별 ${partner.star.count}자리` : ""}`,
    cue: `${partner.mood.line} ${partner.longTerm.line}${tilt ? ` ${partner.ageTilt.line}` : ""} 상대의 구체적인 나이 · 직업 · 마음 · 만나는 날짜는 말하지 않고 분위기와 큰 방향, 관계에서 편해지는 조건까지만 읽습니다. 상대가 실제로 어떤 사람인지는 알 수 없으며 전통 해석을 정리한 초안으로 검증된 사실이 아닙니다.`,
    ...(partner.dayUncertain ? { uncertain: true } : {}),
  });

  // 6) 개운 — 보완 후보 기운과 전통 오행 대응(방향 · 색 · 수 · 장소). 개수가 같은 후보가 있으면(동점) 어느 쪽이 먼저라고 하지 않고 같은 무게의 후보로 둘 다 싣는다(운영자 2026-10-18)
  const cands = fortifyCandidates(fortify);
  const tie = fortify.tied.length > 0;
  const nonTied = fortify.others.filter((o) => !cands.includes(o.element));
  const otherText = nonTied.map((o) => `${o.element}(${o.count}개 — ${o.reason === "계절" ? "계절 보완" : "적음"})`).join(", ");
  const countText = (e: FiveElement) => (fortify.counts[e] === 0 ? (hu ? "세 기둥에 없음 — 시주에 있을 수 있음" : "원국에 없음") : `${fortify.counts[e]}개로 가장 적음`);
  const mapping = (e: FiveElement) => {
    const m = ELEMENT_FORTUNE[e];
    return `${e}(${m.image}) 기운은 방향 ${m.direction}, 계절 ${m.season}, 색 ${m.colors.join(" · ")}, 수(數) ${m.numbers.join(" · ")}, 어울리는 장소와 환경 ${m.places.join(" · ")}에 해당한다고 봅니다.`;
  };
  const feelText = cands.map((e) => `${e}은(는) ${ELEMENT_FORTUNE[e].feel}`).join(", ");
  const habitNote = `생활 속 습관은 이 사람의 일상에 맞춰 한 가지를 가볍게 곁들이는 정도로 소개하고(${feelText}), 특정 행동을 정해 주거나 다른 장에서 한 행동 조언을 되풀이하지 않습니다.`;
  out.push({
    id: "saju.fortify",
    source: "saju",
    topics: ["personality"],
    strength: hu ? "weak" : "moderate",
    fact: `오행 개수(${hu ? "세 기둥(시주 제외) 글자 기준" : "원국 글자 기준"}, 지장간 제외): ${FIVE_ELEMENTS.map((e) => `${e} ${fortify.counts[e]}`).join(" · ")} / 일간 ${dm.stem}${dm.element} / ${tie ? `보완 후보 동점(개수가 같아 우선순위를 가릴 수 없는 같은 후보): ${cands.map((e) => `${e}(${countText(e)})`).join(" · ")}` : `보완 후보 1순위: ${fortify.primary.element}(${countText(fortify.primary.element)})`}${otherText ? ` · 그다음 후보: ${otherText}` : ""} / 보완 후보는 ${hu ? "세 기둥 " : "원국 "}개수와 태어난 계절만으로 정한 단순화이며 이 사람에게 꼭 필요한 기운을 판정한 것이 아님${tie ? " — 동점인 후보를 최우선 · 가장 필요한 기운처럼 하나로 정해 말하지 않음" : ""}${hu ? " / 시주를 몰라 시주를 알면 후보가 달라질 수 있음 — 후보로 가볍게 곁들임" : ""}`,
    cue: `전통 오행 대응에서 ${tie ? `${cands.join(" · ")} 기운은 개수가 같아 어느 쪽이 먼저라고 가릴 수 없는 같은 후보입니다(하나를 가장 필요한 기운으로 정하지 않고 둘 다 후보로 소개합니다). ${cands.map(mapping).join(" ")}` : mapping(fortify.primary.element)} 부족한 기운을 생활에서 보태는 상징적인 개운법으로, 색은 옷 · 소품 · 화면 배경으로, 방향은 산책이나 앉는 자리로, 수(數)는 즐겨 쓰는 번호로, 장소는 자주 머무는 환경으로 옮겨 소개하는 경우가 많습니다. ${habitNote}${nonTied.map((o) => ` 그다음 후보 ${o.element}(${ELEMENT_FORTUNE[o.element].image}) 기운은 방향 ${ELEMENT_FORTUNE[o.element].direction}, 색 ${ELEMENT_FORTUNE[o.element].colors.join(" · ")}, 수(數) ${ELEMENT_FORTUNE[o.element].numbers.join(" · ")}에 해당합니다.`).join("")} 이 대응은 전통의 상징이며 실제 효과나 재물 · 건강의 변화를 보장하지 않고, 물건을 새로 사야 한다는 뜻도 아닙니다. 이미 가진 것으로 가볍게 먼저 해 볼 수 있습니다.${hu ? " 출생 시각을 모르는 사람의 보완 후보는 세 기둥 기준이라 시주에 따라 달라질 수 있어 확정하지 않고 가볍게 곁들입니다." : ""}`,
  });

  return out;
}

export const FORTUNE_EVIDENCE_ID = /^saju\.(sipsung|career|wealth|kin|partner|fortify)$/;
