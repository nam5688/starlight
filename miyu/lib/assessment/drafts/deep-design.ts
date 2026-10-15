// 출처 점검(2026-10-15, docs/assessment-source-audit.md): 이 파일의 방향 구성은 기존 이론의 구성과 닮았다 — 7영역 25항목이 같은 7방향의 세부 항목이다.
// 문장 · 채점표 · 규준 · 유형 이름은 가져오지 않았지만, "자체 개발"이라는 이름만으로 구성이 독립이 되지는 않는다.
// 그래서 화면에 연결하지 않고(또는 개발용 예시로만 두고), 생활 행동에서 출발한 독립 설계(drafts/life-behavior-v1.ts)와 검사 저작권 전문가 검토를 거치기 전에는 쓰지 않는다.
//
// 미유 자체 "심화 검사" 설계안 — 7개 영역 · 세부 항목 25개 (운영자 제안 2026-10-15, 초안 · 검토 전, 화면 · 저장 · 리포트에 연결하지 않음)
//
// 목적: "한 성향 안에서도 무엇이 다른가"를 구분하는 것 — 예) 같은 "불안"이라도 걱정이 많은 것 · 낯선 곳에서 긴장하는 것 · 관계에서 확인받고 싶은 것은 다르다.
// 규칙(제품 원칙과 같다)
//  - TCI · MBTI · 애착검사 등 공식 검사의 문항 · 채점표 · 척도 이름을 가져오지 않는다. 세부 항목 이름과 문항은 모두 미유가 새로 쓴다. 자기초월은 이번 설계에서 뺀다.
//  - 기질 · 성격 · 관계는 영역별로 따로 설명하고 하나의 점수로 합치지 않는다. 사주 점수와 합산하지 않고, 검사 점수를 사주로 바꾸지 않는다.
//  - 세부 항목은 서로 다른 장면의 문항이 3개 이상 있어야 "뚜렷한 방향"을 읽는다(지금 초안의 규칙 MIN_INDICATORS). 모자라면 "판단 보류"로 두고 AI가 채우지 않는다.
//  - 지금 초안(situational-draft.ts 13관점)과 얼마나 겹치는지는 아래 `fit`으로 적는다 — "직접": 같은 것을 재는 관점이 있다 · "같은 축": 같은 관점의 반대쪽 끝이라 별도 항목으로 둘지 정해야 한다
//    · "부분": 비슷하지만 같지 않아 그 관점의 점수로 읽지 않는다 · "없음": 지금 문항으로는 재지 못한다.

import { ASSESSMENT_MODULES } from "../modules/index.ts";
import { MIN_INDICATORS, PERSPECTIVES, indicatorCounts, type PerspectiveId } from "./situational-draft.ts";

export const DEEP_DESIGN_VERSION = "deep-design-0.1-draft";

export type Fit = "직접" | "같은 축" | "부분" | "없음";

export type DeepSubItem = {
  name: string;
  /** 지금 초안에서 가장 가까운 관점 (없으면 null) */
  perspective: PerspectiveId | null;
  fit: Fit;
  /** 왜 그렇게 봤는지 (한 줄) */
  note: string;
  /** 첫 심화 묶음에 넣는 세부 항목 — 지금 검사 화면의 문항이 아예 못 재는 것을 먼저 묻는다(전체 문항 수가 50~60개를 넘지 않게, 운영자 2026-10-15) */
  first?: true;
};

export type DeepDomain = {
  id: string;
  name: string;
  /** 리포트에서 어느 쪽 설명으로 묶는가 — 서로 합치지 않는다 */
  group: "기질" | "성격" | "가까운 관계";
  subs: DeepSubItem[];
};

export const DEEP_DOMAINS: DeepDomain[] = [
  {
    id: "D1",
    name: "새로움과 행동",
    group: "기질",
    subs: [
      { name: "새로운 것에 대한 관심", perspective: "T1", fit: "직접", note: "처음 해 보는 것에 먼저 마음이 가는 정도" },
      { name: "즉흥적으로 움직임", perspective: "T2", fit: "부분", note: "'대비하지 않고 부딪힘'(T2 낮은 쪽)과 가깝지만 즉흥(그때그때 정함)과 같지는 않다" },
      { name: "익숙한 방식 선호", perspective: "T1", fit: "같은 축", note: "T1의 반대쪽 끝이다 — 새로움 관심과 하나의 축으로 둘지, 따로 물을지 정해야 한다" },
    ],
  },
  {
    id: "D2",
    name: "걱정과 대비",
    group: "기질",
    subs: [
      { name: "미리 걱정함", perspective: "T3", fit: "부분", note: "감정이 올라오는 크기(T3)는 있지만 '일이 벌어지기 전에 하는 걱정'은 묻지 않았다", first: true },
      { name: "불확실함을 견디기 어려움", perspective: "T2", fit: "부분", note: "대비하는 행동(T2)은 있지만 '견디기 어려운 마음'은 묻지 않았다" },
      { name: "낯선 상황에서의 긴장", perspective: null, fit: "없음", note: "낯선 자리 장면은 사교성과 섞여 시범 인터뷰에서 확인하기로 한 상태다", first: true },
    ],
  },
  {
    id: "D3",
    name: "관계 민감성",
    group: "기질",
    subs: [
      { name: "상대 감정을 알아챔", perspective: null, fit: "없음", note: "지금 문항에는 없다 (공감과 다르다 — 알아채는 것과 같이 느끼는 것은 별개)", first: true },
      { name: "인정 · 반응에 영향을 받음", perspective: "T4", fit: "직접", note: "주변 반응이 의욕과 방향을 움직이는 정도" },
      { name: "마음을 드러내는 편안함", perspective: "R4", fit: "부분", note: "말로 표현하는 정도(R4)는 문항이 1개뿐이고, '드러내도 편한가'라는 편안함은 묻지 않았다", first: true },
    ],
  },
  {
    id: "D4",
    name: "지속과 목표",
    group: "성격",
    subs: [
      { name: "반복되는 일을 견딤", perspective: "T5", fit: "부분", note: "흥미가 식은 뒤 이어 가기(T5)와 비슷하지만, 같은 일의 반복을 견디는 것은 따로 확인해야 한다" },
      { name: "어려워도 이어 감", perspective: "T5", fit: "직접", note: "재미가 줄어도 정한 것을 이어 가는 정도" },
      { name: "성취하고 싶은 마음", perspective: null, fit: "없음", note: "지금 문항에는 없다", first: true },
      { name: "완벽하게 하려는 마음", perspective: null, fit: "없음", note: "지금 문항에는 없다 (대비 · 신중함과 다르다)", first: true },
    ],
  },
  {
    id: "D5",
    name: "자기관리와 기준",
    group: "성격",
    subs: [
      { name: "스스로 결정함", perspective: "C1", fit: "직접", note: "방향을 누가 정하는가" },
      { name: "목표를 세움", perspective: "C1", fit: "부분", note: "C1은 결정과 목표를 한 관점으로 묶었다 — 둘을 나눌지 정해야 한다" },
      { name: "행동을 조절함", perspective: "C2", fit: "직접", note: "마음이 올라온 뒤 한 박자 쉬고 고르는 정도", first: true },
      { name: "자신을 받아들임", perspective: null, fit: "없음", note: "지금 문항에는 없다", first: true },
    ],
  },
  {
    id: "D6",
    name: "협력과 경계",
    group: "성격",
    subs: [
      { name: "공감", perspective: null, fit: "없음", note: "C3는 배려의 동기(상대의 필요를 함께 놓는가)이고 공감(같이 느낌)은 아니다", first: true },
      { name: "협력", perspective: "C3", fit: "직접", note: "결정에서 상대의 사정을 내 것과 같은 무게로 놓는 정도" },
      { name: "거절 · 경계 세우기", perspective: null, fit: "없음", note: "'거절하기 어려워서 따름'은 이유로만 기록하고 점수에 넣지 않았다 — 경계는 따로 물어야 한다", first: true },
      { name: "갈등에서 의견을 말함", perspective: "R3", fit: "부분", note: "불편함을 꺼내는 속도(R3)는 있지만 갈등 한가운데서 의견을 말하는 것과 같지는 않다", first: true },
    ],
  },
  {
    id: "D7",
    name: "가까운 관계",
    group: "가까운 관계",
    subs: [
      { name: "확인받고 싶은 마음", perspective: "R1", fit: "직접", note: "불확실할 때 확인으로 안심하고 싶은 마음" },
      { name: "혼자 필요한 시간", perspective: "R2", fit: "직접", note: "가까워도 개인 시간이 필요한 정도" },
      { name: "애정 표현", perspective: "R4", fit: "직접", note: "마음을 말로 전하는 정도 (문항이 1개뿐이라 읽지 못한다)" },
      { name: "갈등 뒤 회복", perspective: null, fit: "없음", note: "지금 문항에는 없다 (불편함을 꺼내는 속도와 다르다)", first: true },
    ],
  },
];

export const DEEP_SUB_COUNT = DEEP_DOMAINS.reduce((n, d) => n + d.subs.length, 0);

export type DeepRow = DeepSubItem & {
  domain: DeepDomain;
  /** 지금 초안 문항 중 이 세부 항목으로 인정하는 수 — "직접"일 때만, 같은 관점을 여러 세부 항목이 쓰면 앞의 하나만 인정한다 */
  have: number;
  /** 읽으려면 더 써야 하는 문항 수 (서로 다른 장면 3개 기준) */
  short: number;
};

/** 세부 항목마다 지금 문항이 얼마나 대응하는지 센다 — 어림이며 "문항을 새로 쓰기 전의 설계용 수"다 */
export function deepRows(counts: Record<PerspectiveId, number> = indicatorCounts()): DeepRow[] {
  const credited = new Set<PerspectiveId>();
  const rows: DeepRow[] = [];
  for (const domain of DEEP_DOMAINS) {
    for (const sub of domain.subs) {
      let have = 0;
      if (sub.fit === "직접" && sub.perspective && !credited.has(sub.perspective)) {
        have = counts[sub.perspective];
        credited.add(sub.perspective);
      }
      rows.push({ ...sub, domain, have, short: Math.max(0, MIN_INDICATORS - have) });
    }
  }
  return rows;
}

export type DeepSummary = {
  subItems: number;
  /** 세부 항목마다 문항 3개를 쓸 때의 전체 문항 수 */
  fullItems: number;
  /** 지금 문항으로 읽을 수 있는 세부 항목 수 */
  readableNow: number;
  /** 더 써야 하는 문항 수 합계 */
  toWrite: number;
  byFit: Record<Fit, number>;
  perDomain: { id: string; name: string; group: DeepDomain["group"]; subs: number; fullItems: number; toWrite: number }[];
};

export function deepSummary(rows: DeepRow[] = deepRows()): DeepSummary {
  const byFit: Record<Fit, number> = { 직접: 0, "같은 축": 0, 부분: 0, 없음: 0 };
  for (const r of rows) byFit[r.fit]++;
  return {
    subItems: rows.length,
    fullItems: rows.length * MIN_INDICATORS,
    readableNow: rows.filter((r) => r.have >= MIN_INDICATORS).length,
    toWrite: rows.reduce((n, r) => n + r.short, 0),
    byFit,
    perDomain: DEEP_DOMAINS.map((d) => {
      const own = rows.filter((r) => r.domain.id === d.id);
      return { id: d.id, name: d.name, group: d.group, subs: own.length, fullItems: own.length * MIN_INDICATORS, toWrite: own.reduce((n, r) => n + r.short, 0) };
    }),
  };
}

/** 자체 검사 보완 목록 — 지금 문항으로는 읽지 못하는 세부 항목. 리포트 글 · AI가 이 항목들을 "있는 것처럼" 쓰지 않는다 */
export function supplementList(rows: DeepRow[] = deepRows()): DeepRow[] {
  return rows.filter((r) => r.have < MIN_INDICATORS);
}

export const perspectiveName = (id: PerspectiveId | null) => (id ? `${id} ${PERSPECTIVES[id].name}` : "—");

/**
 * 한 번에 푸는 전체 문항 수의 범위 — 운영자 요청(2026-10-15): *무료 분석 문항 + 심화 문항을 합쳐 50~60개*. 더 길면 중간에 그만두기 쉽다.
 * 세부 항목 25개를 모두 3문항씩 물으면 75문항이라 이 범위를 넘으므로, 지금 문항이 못 재는 12개를 먼저 묻는다(첫 심화 묶음).
 */
export const TOTAL_QUESTION_BUDGET = { min: 50, max: 60 } as const;

/** 한 문항을 읽는 데 걸리는 시간의 어림(초) — 직접 재지 않았다. 시범 응답으로 재면 고친다 */
export const SECONDS_PER_QUESTION = 10;

export type FirstBundle = {
  /** 첫 심화 묶음의 세부 항목 */
  subs: DeepRow[];
  /** 묶음의 문항 수 (세부 항목마다 서로 다른 장면 3문항) */
  items: number;
  /** 지금 검사 화면에 연결된 문항 수 */
  liveItems: number;
  /** 무료 분석 + 심화 */
  total: number;
  /** 심화 문항만 푸는 데 걸리는 시간의 어림(분) */
  deepMinutes: number;
  /** 무료 분석 + 심화를 이어서 푸는 데 걸리는 시간의 어림(분) */
  totalMinutes: number;
  /** 묶음에 넣지 않은 세부 항목 — 다음 단계 */
  later: DeepRow[];
  /** 묶음에 세부 항목이 하나도 없는 영역 */
  domainsWithoutItems: string[];
  /** 전체 문항 수가 상한 범위 안인가 */
  withinBudget: boolean;
};

export function firstBundle(rows: DeepRow[] = deepRows()): FirstBundle {
  const subs = rows.filter((r) => r.first);
  const liveItems = ASSESSMENT_MODULES.reduce((n, m) => n + m.items.length, 0);
  const items = subs.length * MIN_INDICATORS;
  const total = liveItems + items;
  return {
    subs,
    items,
    liveItems,
    total,
    deepMinutes: Math.round((items * SECONDS_PER_QUESTION) / 60),
    totalMinutes: Math.round((total * SECONDS_PER_QUESTION) / 60),
    later: rows.filter((r) => !r.first),
    domainsWithoutItems: DEEP_DOMAINS.filter((d) => !d.subs.some((s) => s.first)).map((d) => d.name),
    withinBudget: total >= TOTAL_QUESTION_BUDGET.min && total <= TOTAL_QUESTION_BUDGET.max,
  };
}
