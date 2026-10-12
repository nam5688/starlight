// 원국 쉬운 풀이 — "그래서 어떤 사람이라는 건지"를 일상 말로 풀어 쓴다.
// 계산 결과(일간 · 오행 개수)에서 규칙으로만 만든다 (AI 아님, 같은 원국이면 항상 같은 문장).
// 전통 해석을 쉬운 말로 옮긴 것이며 성격을 확정하거나 점수로 환산하지 않는다. 문구는 초안 — 전문가 검토 전.

import { FIVE_ELEMENTS, type FiveElement, type SajuOk } from "./engine.ts";

export type ElementLevel = "none" | "few" | "balanced" | "many";

export const ELEMENT_INFO: Record<FiveElement, { hanja: string; image: string; force: string; many: string; few: string }> = {
  목: {
    hanja: "木",
    image: "나무",
    force: "자라고, 계획하고, 새로 시작하려는 힘",
    many: "시작하고 키우는 일에 마음이 많이 쓰여요. 하고 싶은 일과 계획이 계속 생기지만, 벌려 놓은 일이 늘어 지칠 수 있어요.",
    few: "새로 시작하는 일에 시동이 천천히 걸리거나, 계획을 세우기보다 흐름을 따르는 편일 수 있어요.",
  },
  화: {
    hanja: "火",
    image: "불",
    force: "드러내고, 표현하고, 열정을 내는 힘",
    many: "표현하고 드러내는 힘이 강해요. 열정이 빠르게 붙는 대신 마음이 급해지거나 감정의 높낮이가 커질 수 있어요.",
    few: "감정이나 열정을 겉으로 크게 드러내지 않고 차분한 편일 수 있어요. 마음을 말로 꺼내는 연습이 도움이 된다고 봅니다.",
  },
  토: {
    hanja: "土",
    image: "흙",
    force: "지키고, 중재하고, 안정시키는 힘",
    many: "지키고 버티는 힘이 강해요. 믿음직하고 안정적이지만, 변화에 느리거나 고집으로 보일 때가 있을 수 있어요.",
    few: "한곳에 오래 머무르기보다 옮겨 다니는 편이고, 기준이 흔들린다고 느낄 때가 있을 수 있어요.",
  },
  금: {
    hanja: "金",
    image: "쇠",
    force: "정리하고, 판단하고, 기준을 세우는 힘",
    many: "기준과 원칙이 분명하고 결단이 빨라요. 정리와 판단은 빠른 대신 말이 날카롭게 들릴 수 있어요.",
    few: "딱 잘라 결정하거나 거절하는 일이 어렵게 느껴질 수 있어요. 기준을 미리 적어 두면 편하다고 봅니다.",
  },
  수: {
    hanja: "水",
    image: "물",
    force: "생각하고, 유연하게 흐르고, 쉬어 가는 힘",
    many: "생각과 감정이 깊고 상황에 맞춰 유연하게 흘러요. 다만 생각이 많아 결정을 미루거나 방향이 흩어질 수 있어요.",
    few: "생각을 멈추고 쉬어 가는 일이 서툴 수 있어요. 쉬는 것도 일처럼 계획해야 마음이 놓일 수 있다고 봅니다.",
  },
};

export type ElementReading = {
  element: FiveElement;
  hanja: string;
  image: string;
  count: number;
  level: ElementLevel;
  levelLabel: string;
  /** 이 기운이 무엇인지 */
  force: string;
  /** 내 원국에서 이 수준이 일상에서 어떻게 나타날 수 있는지 (보통이면 빈 문자열) */
  plain: string;
};

type DayMasterInfo = { image: string; trait: string; goodAt: string; watchOut: string };

const DAY_MASTER: Record<string, DayMasterInfo> = {
  갑: { image: "큰 나무", trait: "곧게 위로 뻗어 가는 사람으로 봅니다. 시작하고 앞장서는 힘이 있어요.", goodAt: "목표를 정하면 곧게 밀고 나가는 추진력", watchOut: "굽히기 어려워 고집으로 보일 수 있음" },
  을: { image: "풀 · 덩굴", trait: "환경에 맞춰 유연하게 자라는 사람으로 봅니다. 분위기를 읽고 맞추는 감각이 있어요.", goodAt: "상황에 맞추는 적응력과 관계 감각", watchOut: "눈치를 보느라 속마음을 말하는 게 늦어짐" },
  병: { image: "태양", trait: "밝고 환하게 드러내는 사람으로 봅니다. 곁에 있으면 분위기가 살아나요.", goodAt: "분위기를 밝히고 먼저 나서는 힘", watchOut: "열정이 식으면 급격히 조용해지고 관심이 한쪽으로 쏠림" },
  정: { image: "촛불", trait: "한곳을 오래 비추는 섬세한 온기의 사람으로 봅니다. 집중력과 세심함이 특징이에요.", goodAt: "한 가지에 깊게 집중하고 사람을 세심하게 챙기는 힘", watchOut: "속으로 오래 품고 있다가 예민해질 수 있음" },
  무: { image: "큰 산", trait: "중심을 잡고 버티는 사람으로 봅니다. 곁에 있으면 믿음직하다는 말을 듣기 쉬워요.", goodAt: "흔들리지 않고 중심을 잡아 주는 안정감", watchOut: "변화에 느리고 속마음을 잘 드러내지 않음" },
  기: { image: "논밭", trait: "품어서 키우는 사람으로 봅니다. 실속 있게 챙기고 돌보는 힘이 있어요.", goodAt: "사람과 일을 꼼꼼히 돌보는 배려와 실속", watchOut: "걱정이 많아지고 남에게 맞추다 지침" },
  경: { image: "바위 · 쇠", trait: "결단하고 원칙을 지키는 사람으로 봅니다. 옳고 그름이 분명한 편이에요.", goodAt: "미루지 않고 결단하는 힘과 정의감", watchOut: "말이 직선적이어서 타협이 어려워 보일 수 있음" },
  신: { image: "보석", trait: "섬세하고 완성도를 따지는 사람으로 봅니다. 안목과 정교함이 특징이에요.", goodAt: "세밀한 안목과 완성도를 높이는 힘", watchOut: "예민해지기 쉽고 자존심이 상하면 오래감" },
  임: { image: "큰 강 · 바다", trait: "넓게 흐르며 생각이 큰 사람으로 봅니다. 포용력과 큰 그림을 보는 눈이 있어요.", goodAt: "넓게 받아들이고 큰 그림을 보는 힘", watchOut: "흐름을 따라가다 방향이 흩어질 수 있음" },
  계: { image: "비 · 이슬", trait: "조용히 스며드는 사람으로 봅니다. 직감과 공감하는 힘이 있어요.", goodAt: "분위기와 마음을 읽어 내는 직감과 공감", watchOut: "생각이 많아지고 남의 감정까지 흡수함" },
};

export type PlainReading = {
  /** "촛불처럼 한곳을 오래 비추는 섬세한 사람" 같은 한 줄 */
  headline: string;
  dayMaster: { label: string; image: string; trait: string; goodAt: string; watchOut: string };
  /** 원국 글자 수 (출생시간을 모르면 6) */
  charCount: number;
  elements: ElementReading[];
  /** 일상에서 이렇게 나타날 수 있어요 — 없는 기운 → 많은 기운 순 */
  everyday: string[];
  limits: string;
};

const LEVEL_LABEL: Record<ElementLevel, string> = { none: "없음", few: "적음", balanced: "보통", many: "많음" };

export function levelOf(count: number): ElementLevel {
  if (count === 0) return "none";
  if (count === 1) return "few";
  if (count === 2) return "balanced";
  return "many";
}

const SHORT_TRAIT: Record<string, string> = {
  갑: "곧게 뻗어 가는",
  을: "유연하게 맞춰 가는",
  병: "밝게 드러내는",
  정: "한곳을 오래 비추는 섬세한",
  무: "중심을 잡고 버티는",
  기: "품고 키우는",
  경: "원칙대로 결단하는",
  신: "섬세하게 다듬는",
  임: "넓게 흐르는",
  계: "조용히 스며드는",
};

const name = (e: FiveElement) => `${e}(${ELEMENT_INFO[e].image})`;

export function plainSajuReading(saju: SajuOk): PlainReading {
  const dm = saju.dayMaster;
  const info = DAY_MASTER[dm.stem];
  const charCount = saju.pillars.length * 2; // 출생시간을 모르면 기둥 3개(글자 6개)

  const elements: ElementReading[] = FIVE_ELEMENTS.map((element) => {
    const count = saju.elementCounts[element];
    const level = levelOf(count);
    const e = ELEMENT_INFO[element];
    return {
      element,
      hanja: e.hanja,
      image: e.image,
      count,
      level,
      levelLabel: LEVEL_LABEL[level],
      force: e.force,
      plain: level === "many" ? e.many : level === "none" || level === "few" ? e.few : "",
    };
  });

  const many = elements.filter((e) => e.level === "many").map((e) => e.element);
  const none = elements.filter((e) => e.level === "none").map((e) => e.element);
  const manyText = many.length ? `${many.map(name).join("·")} 기운이 많고` : "";
  const noneText = none.length ? `${none.map(name).join("·")} 기운이 없는` : "";
  const shape =
    many.length && none.length
      ? `원국에는 ${manyText} ${noneText} 구성입니다.`
      : many.length
        ? `원국에는 ${many.map(name).join("·")} 기운이 많습니다.`
        : none.length
          ? `원국에는 ${none.map(name).join("·")} 기운이 없습니다.`
          : "원국에 다섯 기운이 비교적 고르게 들어 있습니다.";

  const everyday = [
    ...elements.filter((e) => e.level === "none").map((e) => `${name(e.element)} 기운이 없어요 — ${e.plain}`),
    ...elements.filter((e) => e.level === "many").map((e) => `${name(e.element)} 기운이 많아요 — ${e.plain}`),
    ...elements.filter((e) => e.level === "few").map((e) => `${name(e.element)} 기운이 적어요 — ${e.plain}`),
  ].slice(0, 4);

  return {
    headline: `${info.image}처럼 ${SHORT_TRAIT[dm.stem]} 사람 — ${shape}`,
    dayMaster: { label: `${dm.stem}${dm.element}(${dm.stemHanja})`, ...info },
    charCount,
    elements,
    everyday,
    limits:
      "전통 해석을 쉬운 말로 옮긴 것으로, 성격을 확정하지 않습니다. 오행 개수는 원국의 천간 · 지지 글자 기준이며(지장간 제외) 실제 모습은 환경과 시기에 따라 달라집니다.",
  };
}
