// 사주로 읽은 "인연의 경향" — 상대가 아니라 내 원국의 배우자 자리(일지)를 전통 해석으로 읽은 것이다 (운영자 결정 2026-10-15).
// AI가 쓰지 않는다: 문장은 아래 고정 문구이고, 어떤 문장이 나오는지는 계산 결과(일지의 십신 그룹 · 성별을 입력했다면 배우자 별의 개수)로만 정한다.
//
// 이 파일이 말하는 것 — 편하게 느끼기 쉬운 상대의 "분위기", 나이 차의 "큰 방향"(연상 · 또래 · 연하 쪽), 인연 주제가 눈에 띄는 달(월 단위 달력에서 가져온다)
// 이 파일이 말하지 않는 것 — 상대의 구체적인 나이 · 직업 · 마음 · 만나는 날짜, 결혼 여부와 시기. 통계 · 조사 결과를 쓰지 않는다(이 규칙에는 그런 근거가 없다).
// 규칙은 검증된 사실이 아니라 전통 해석을 정리한 초안이며 전문가 검토 전이다 (PARTNER_RULE_META에 출처 · 조건 · 예외 · 검토 상태를 기록).
import type { SajuOk } from "../engine.ts";
import { PILLAR_LABEL } from "../engine.ts";
import { GROUP_OF, spousePalace, type Group } from "./rules.ts";

export const PARTNER_RULE_VERSION = "saju-partner-rules-0.1-draft";

export type AgeTilt = "elder" | "peer" | "younger";

/** 편하게 느끼기 쉬운 상대의 분위기 — 일지 십신 그룹별 */
const MOOD: Record<Group, { title: string; line: string }> = {
  비겁: { title: "친구처럼 편하고 동등한 사람", line: "각자의 영역을 존중하면서 함께 있어도 눈치 보지 않는, 친구처럼 동등한 분위기의 사람에게 마음이 편해지기 쉬워요." },
  식상: { title: "말이 잘 통하고 함께 즐거운 사람", line: "마음을 표현하고 함께 즐길 줄 아는, 대화가 풍부한 분위기의 사람에게 끌리기 쉬워요." },
  재성: { title: "생활이 단단하고 현실적인 사람", line: "일상을 현실적으로 챙기고 꾸려 갈 줄 아는 분위기의 사람에게 믿음이 가기 쉬워요." },
  관성: { title: "믿음직하고 중심이 잡힌 사람", line: "책임감 있고 약속을 지키는, 안정감을 주는 분위기의 사람에게 마음이 편해지기 쉬워요." },
  인성: { title: "이해해 주고 보살펴 주는 사람", line: "내 마음을 알아주고 따뜻하게 받아 주는, 차분한 분위기의 사람에게 마음이 열리기 쉬워요." },
};

/** 나이 차의 큰 방향 — 육친의 세대 비유(인성 · 관성은 위, 식상 · 재성은 아래, 비겁은 같은 세대)로 읽는 초안 규칙. 몇 살 차이라는 뜻이 아니다 */
const TILT_OF: Record<Group, AgeTilt> = { 인성: "elder", 관성: "elder", 비겁: "peer", 식상: "younger", 재성: "younger" };
const TILT_LABEL: Record<AgeTilt, string> = {
  elder: "나보다 연상으로 느껴지는 사람 쪽",
  peer: "나와 비슷한 또래로 느껴지는 사람 쪽",
  younger: "나보다 어리게 느껴지는 사람 쪽",
};

/** 오래 가는 관계에서 중요하게 여기기 쉬운 것 — 배우자 자리의 십신 그룹별 (결혼박사 방) */
const LONG_TERM: Record<Group, { headline: string; line: string }> = {
  비겁: { headline: "오래 가는 관계에서는 서로의 영역을 존중하는 동등함이 중요한 편이에요", line: "함께 살아도 각자의 시간과 영역이 지켜질 때 마음이 편한 쪽으로 읽어요." },
  식상: { headline: "오래 가는 관계에서는 마음을 표현하고 함께 즐기는 것이 중요한 편이에요", line: "대화가 끊기지 않고 같이 웃을 거리가 있을 때 관계가 오래 편한 쪽으로 읽어요." },
  재성: { headline: "오래 가는 관계에서는 생활을 현실적으로 꾸려 가는 것이 중요한 편이에요", line: "돈 · 시간 · 살림 같은 현실의 약속이 맞을 때 마음이 놓이는 쪽으로 읽어요." },
  관성: { headline: "오래 가는 관계에서는 책임과 신뢰, 안정감이 중요한 편이에요", line: "말한 것을 지키고 흔들리지 않는 모습을 볼 때 마음이 놓이는 쪽으로 읽어요." },
  인성: { headline: "오래 가는 관계에서는 서로 이해받고 보살피는 것이 중요한 편이에요", line: "내 마음을 알아주고 돌봐 주는 느낌이 있을 때 관계가 오래 편한 쪽으로 읽어요." },
};

/** 배우자 별(여성 원국은 관성, 남성 원국은 재성)이 원국에 몇 자리 있는가에 따른 한 줄 — 성별을 입력했을 때만 */
const STAR_LINE = {
  none: "원국에 인연과 관련해 보는 기운이 따로 보이지 않아, 그 기운이 들어오는 시기에 관계 이야기가 크게 느껴질 수 있다고 읽어요.",
  some: "원국에 인연과 관련해 보는 기운이 적당히 있는 편으로 읽어요.",
  many: "원국에 인연과 관련해 보는 기운이 많은 편이라, 관계에서 기대와 생각이 많아질 수 있다고 읽어요.",
} as const;

export const PARTNER_NOTES = {
  /** 이 풀이에 항상 붙는 아주 작은 안내 (해요체) */
  limit: "전통 해석이고 100% 정확하거나 검증된 사실이 아니에요.",
  /** 나이 · 직업 · 날짜에 대한 선 (해요체) */
  scope: "상대의 정확한 나이 · 직업 · 마음, 만나는 날짜는 말하지 않고, 큰 방향과 눈에 띄는 달까지만 읽어요.",
  noStats: "통계나 조사 결과를 쓰지 않았어요. 전통 해석 규칙을 그대로 정리한 초안이에요.",
  months: "달은 ‘이 달에 만난다’는 뜻이 아니라 인연 · 결속 이야기에 마음이 열리기 쉬운 달로 읽는 표시예요.",
  /** 규칙의 출처를 있는 그대로 — 작은 주의 문구가 아니라 어디서 왔는지를 밝힌다 */
  source: "이 규칙은 고전 문헌에서 확인한 것이 아니라, 일지(배우자 자리)로 상대의 분위기를 읽는 대중적인 명리 서술을 단순화한 임시 규칙이에요. 나이 방향은 그중에서도 근거가 가장 약한 부분이에요.",
  /** 나이 방향을 보여 주지 않을 때의 출처 문구 (스위치 PARTNER_AGE_DIRECTION이 꺼져 있을 때) */
  sourceNoAge: "이 규칙은 고전 문헌에서 확인한 것이 아니라, 일지(배우자 자리)로 상대의 분위기를 읽는 대중적인 명리 서술을 단순화한 임시 규칙이에요.",
  /** 일주가 기준에 따라 달라질 수 있을 때 */
  dayUncertain: "태어난 날의 기준(출생 시각 · 절기 · 자시)에 따라 달라질 수 있어, 이 풀이는 참고로만 봐 주세요.",
  compat: "두 사람을 비교하는 궁합은 준비 중이에요. 상대의 생년월일을 받는 기능을 만든 뒤에 열어요.",
} as const;

export type PartnerReading = {
  /** 일주가 출생 시각 · 절기 경계 · 자시 관법에 따라 달라질 수 있는가 — 그러면 일지(배우자 자리) 풀이를 참고로만 봐야 한다 */
  dayUncertain: boolean;
  palace: { branch: string; tenGod: string; group: Group };
  mood: { title: string; line: string };
  ageTilt: { tilt: AgeTilt; label: string; line: string };
  longTerm: { headline: string; line: string };
  /** 성별을 입력한 경우에만 */
  star: { group: Group; count: number; line: string } | null;
};

/** 배우자 별이 원국(일간 제외 천간 · 지지)에 몇 자리 있는가 */
function starCount(saju: SajuOk, star: Group): number {
  let n = 0;
  for (const p of saju.pillars) for (const tg of [p.tenGod.stem, p.tenGod.branch]) if (GROUP_OF[tg] === star) n += 1;
  return n;
}

/** 원국 · 성별(선택) → 인연의 경향. 같은 입력은 항상 같은 결과다 */
export function partnerReading(saju: SajuOk): PartnerReading {
  const palace = spousePalace(saju);
  const tilt = TILT_OF[palace.group];
  const star: Group | null = saju.gender ? (saju.gender === "female" ? "관성" : "재성") : null;
  const count = star ? starCount(saju, star) : 0;
  const dayUncertain = saju.notes.some((n) => (n.kind === "jeolgi-day" || n.kind === "near-boundary" || n.kind === "jasi-school") && n.pillars.includes("day"));
  return {
    dayUncertain,
    palace,
    mood: MOOD[palace.group],
    ageTilt: {
      tilt,
      label: TILT_LABEL[tilt],
      line: `나이 차는 ${TILT_LABEL[tilt]}으로 기울기 쉬운 경향으로 읽어요. 몇 살 차이라는 뜻이 아니라 큰 방향만 본 거예요.`,
    },
    longTerm: LONG_TERM[palace.group],
    star: star ? { group: star, count, line: count === 0 ? STAR_LINE.none : count >= 3 ? STAR_LINE.many : STAR_LINE.some } : null,
  };
}

/** 접어 두는 "분석 근거" — 계산 결과 · 전통 해석 규칙 · 모르는 것을 나눠 적는다 */
export function partnerBasis(saju: SajuOk, ageDirection = true): { computed: string[]; tradition: string[]; answers: string[]; unknown: string[] } {
  const r = partnerReading(saju);
  const day = saju.pillars.find((p) => p.key === "day");
  const computed = [
    `${PILLAR_LABEL.day} 일지 ${r.palace.branch}${day ? `(${day.branchHanja})` : ""} — 일간 ${saju.dayMaster.stem}${saju.dayMaster.element} 기준 ${r.palace.tenGod}(${r.palace.group}), 전통에서 배우자 자리로 보는 곳`,
    ...(r.star ? [`배우자 별(${saju.gender === "female" ? "여성 원국: 관성" : "남성 원국: 재성"}) ${r.star.count}자리`] : []),
  ];
  const tradition = [
    ageDirection ? PARTNER_NOTES.source : PARTNER_NOTES.sourceNoAge,
    `배우자 자리의 십신 그룹(${r.palace.group})으로 편하게 느끼기 쉬운 분위기를 읽는 규칙(${PARTNER_RULE_VERSION}, 전문가 검토 전 초안)`,
    ...(ageDirection
      ? ["육친의 세대 비유 — 인성 · 관성은 위, 식상 · 재성은 아래, 비겁은 같은 세대 — 로 나이 차의 큰 방향(연상 · 또래 · 연하 쪽)을 읽는 초안 규칙. 검증된 사실이 아니다"]
      : []),
    ...(r.star ? ["배우자 별의 개수는 관계의 좋고 나쁨이나 시기를 말하는 데 쓰지 않고 참고로만 읽는다"] : []),
  ];
  const unknown = [
    "상대의 실제 나이 · 직업 · 마음은 알 수 없어요",
    "이 규칙은 통계나 조사로 확인된 것이 아니에요",
    ...(saju.gender ? [] : ["성별 정보가 없어 배우자 별은 보지 않았어요"]),
    ...(r.dayUncertain ? [PARTNER_NOTES.dayUncertain] : []),
  ];
  return { computed, tradition, answers: [], unknown };
}
