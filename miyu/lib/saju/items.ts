// 보완 아이템 — 원국에서 적게 나타난 기운(없거나 1개)을 일상에서 채워 보는 간단한 제안.
// 전통 오행 연상(색 · 소재 · 공간 · 습관)을 옮긴 것이며, 효과를 보장하지 않고 특정 상품을 권하지 않는다.
// 문구는 초안 — 전문가 검토 전. 같은 원국이면 항상 같은 결과.

import { FIVE_ELEMENTS, type FiveElement, type SajuOk } from "./engine.ts";
import { ELEMENT_INFO, levelOf } from "./plain.ts";

const ITEMS: Record<FiveElement, { colors: string[]; materials: string[]; place: string; habits: string[] }> = {
  목: {
    colors: ["초록", "청록"],
    materials: ["식물", "나무", "종이"],
    place: "햇빛이 들어오는 자리에 화분 하나",
    habits: ["아침에 10분 걷기", "새로 배우고 싶은 것을 한 줄 적기"],
  },
  화: {
    colors: ["빨강", "주황", "따뜻한 노랑"],
    materials: ["따뜻한 조명", "촛불", "부드러운 직물"],
    place: "따뜻한 색 조명이 있는 자리",
    habits: ["하루에 한 번 마음을 말로 표현하기", "땀이 나는 운동"],
  },
  토: {
    colors: ["베이지", "황토", "갈색"],
    materials: ["도자기", "흙으로 만든 소품", "면"],
    place: "정리된 책상과 안정감 있는 의자",
    habits: ["같은 시간에 식사하고 자기", "하루 일정에 쉬는 시간 넣기"],
  },
  금: {
    colors: ["흰색", "은색", "회색"],
    materials: ["금속", "유리"],
    place: "물건이 제자리에 있는 깔끔한 공간",
    habits: ["마감 시간 정하기", "거절할 때 쓸 문장 하나 정해 두기"],
  },
  수: {
    colors: ["검정", "남색", "짙은 파랑"],
    materials: ["물", "유리", "매끈한 소재"],
    place: "조용하고 물을 가까이 둘 수 있는 자리",
    habits: ["잠들기 전 10분 읽기나 명상", "충분히 자고 쉬는 날 정해 두기"],
  },
};

export type ItemSuggestion = {
  element: FiveElement;
  hanja: string;
  image: string;
  count: number;
  stateLabel: string;
  colors: string[];
  materials: string[];
  place: string;
  habits: string[];
};

export type ItemSuggestions = {
  intro: string;
  items: ItemSuggestion[];
  limits: string;
};

const LIMITS =
  "전통 오행 연상에 따른 간단한 제안이에요. 효과를 보장하지 않으며, 물건을 새로 사야 한다는 뜻이 아니에요. 이미 가진 것으로 먼저 해 보세요. 문구는 초안으로 전문가 검토 전이에요.";

export function itemSuggestions(saju: SajuOk): ItemSuggestions {
  const counts = FIVE_ELEMENTS.map((e) => [e, saju.elementCounts[e]] as const);
  let target = counts.filter(([, n]) => n <= 1);
  let intro: string;
  if (target.length) {
    intro = `원국에서 ${target.map(([e]) => `${e}(${ELEMENT_INFO[e].image})`).join("·")} 기운이 ${target.some(([, n]) => n === 0) ? "없거나 적게" : "적게"} 나타났어요. 이 기운을 일상에서 가볍게 채워 보는 방법이에요.`;
  } else {
    const min = Math.min(...counts.map(([, n]) => n));
    target = counts.filter(([, n]) => n === min);
    intro = `다섯 기운이 비교적 고르게 있어 크게 부족한 기운은 없어요. 그중 상대적으로 적은 ${target.map(([e]) => `${e}(${ELEMENT_INFO[e].image})`).join("·")} 기운을 가볍게 더해 보는 방법이에요.`;
  }
  return {
    intro,
    items: target.map(([element, count]) => ({
      element,
      hanja: ELEMENT_INFO[element].hanja,
      image: ELEMENT_INFO[element].image,
      count,
      stateLabel: count === 0 ? "없음" : levelOf(count) === "few" ? "적음" : "상대적으로 적음",
      ...ITEMS[element],
    })),
    limits: LIMITS,
  };
}
