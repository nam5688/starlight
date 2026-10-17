// 사주 궁합 · 리포트 궁합(유료)의 풀이 재료 두 가지 — 두 사람의 오행 분포(compat.chart)와 함께 쓸 수 있는 전통 개운(compat.fortify).
// 순수 계산이다(AI를 쓰지 않는다). **새로운 명리 판정 규칙이 없다** — 이미 계산돼 있는 값(원국 오행 개수 · 개운 보완 후보 fortifyOf · 오행 대응표 ELEMENT_FORTUNE)을 두 사람 몫으로 나란히 놓기만 한다(운영자 2026-10-17: 근거 검증 없이 새 계산 규칙을 만들지 않는다).
// 무료 간단 궁합(compatOf · cardOf)의 점수 · 커플 유형 · 근거 목록에는 들어가지 않는다 — 유료 풀이를 만들 때만 건넨다(compatOf의 결과는 바뀌지 않는다).
// 근거 문장(fact · cue)에는 격국 · 용신 · 희신 · 기신 · 신살 · 십이운성이라는 판정 이름을 쓰지 않는다 — 근거 목록에 그 낱말이 있으면 글에서 이 사람의 판정으로 써도 되는 것으로 읽히기 때문이다(terms.ts).
import type { Evidence } from "../../report/evidence.ts";
import type { FiveElement, SajuOk } from "../engine.ts";
import { FIVE_ELEMENTS } from "../engine.ts";
import { ELEMENT_FORTUNE, fortifyOf } from "./fortune.ts";
import type { CompatResult } from "./compat.ts";

export const COMPAT_EXTRA_VERSION = "compat-extra-0.1-draft";

const NAME = { a: "A님", b: "B님" } as const;
const ELEMENT_HANJA: Record<FiveElement, string> = { 목: "木", 화: "火", 토: "土", 금: "金", 수: "水" };

/** 절기 · 경계 · 자시 관법에 걸려 달라질 수 있는 기둥 — 시주만 걸리면 개수가 조금 달라질 수 있는 정도라 근거 강도만 낮추고(weak), 연 · 월 · 일주가 걸리면 해석에 쓰지 않는다(uncertain) */
const shakyPillars = (s: SajuOk): Set<string> => new Set(s.notes.filter((n) => n.kind === "jeolgi-day" || n.kind === "near-boundary" || n.kind === "jasi-school").flatMap((n) => n.pillars));
const basisOf = (s: SajuOk): string => (s.hourPillarOmitted ? "세 기둥(시주 제외) 기준" : "원국 글자 기준");

/** 한 기운의 전통 대응을 짧게 — 방향 · 색 · 수(數) · 장소 하나 */
const correspondence = (el: FiveElement): string => {
  const f = ELEMENT_FORTUNE[el];
  return `${el}(${f.image}): 방향 ${f.direction}, 색 ${f.colors.slice(0, 2).join(" · ")}, 수(數) ${f.numbers.join(" · ")}, 장소 ${f.places[0]}`;
};

/**
 * 두 사람의 오행 분포와 개운 근거. 출생 시각을 모르는 사람이 있으면 그 사람의 개수는 세 기둥 기준이라고 적고 근거 강도를 weak로 낮춘다
 * (시주에 있을 수 있는 글자는 세지 못한다 — hour-unknown.ts와 같은 이유). 절기 · 자시 경계에 걸린 기둥이 있으면 uncertain으로 표시해 해석에 쓰지 않는다.
 */
export function compatExtraEvidence(sa: SajuOk, sb: SajuOk, result: CompatResult): Evidence[] {
  const people = [{ key: "a" as const, s: sa, p: result.a }, { key: "b" as const, s: sb, p: result.b }];
  const unknownHour = people.some((x) => x.s.hourPillarOmitted);
  const uncertain = people.some((x) => [...shakyPillars(x.s)].some((k) => k !== "hour"));
  const hourShaky = people.some((x) => shakyPillars(x.s).has("hour"));
  const weak = unknownHour || hourShaky;
  const out: Evidence[] = [];

  // 1) 두 사람의 오행 분포
  const row = (x: (typeof people)[number]) =>
    `${NAME[x.key]} 일간 ${x.p.dayStem}(${x.p.dayStemHanja}, ${x.p.element}) 오행 개수(${basisOf(x.s)}, 지장간 제외): ${FIVE_ELEMENTS.map((e) => `${e} ${x.p.counts[e]}`).join(" · ")}`;
  out.push({
    id: "compat.chart",
    source: "saju",
    topics: ["relationship", "personality"],
    strength: weak ? "weak" : "moderate",
    fact: people.map(row).join(" / "),
    cue: `두 사람의 오행 분포를 나란히 놓은 것입니다. 한쪽에 적은 기운을 다른 쪽이 갖고 있으면 서로 채워 주는 조합으로(compat.element.fill), 같은 기운이 둘 다 많으면 닮은 면이 큰 조합으로(compat.element.overlap) 읽습니다. 개수는 지장간을 세지 않은 값이고 좋고 나쁨을 정하지 않습니다.${unknownHour ? " 출생 시각을 모르는 사람의 개수는 시주를 뺀 세 기둥 기준이라 없음 · 적음이 시주에 있을 수 있어 전체에 없다고 읽지 않습니다." : ""}${hourShaky ? " 시주가 바뀌는 시각에 가까운 사람이 있어 개수가 조금 달라질 수 있습니다." : ""}`,
    ...(uncertain ? { uncertain: true } : {}),
  });

  // 2) 함께 쓸 수 있는 개운 — 각자의 보완 후보(오행 개수 + 태어난 계절의 단순화)와 그 기운의 전통 대응. 개인별 계산 없이 임의로 배정하지 않는다
  const fa = fortifyOf(sa);
  const fb = fortifyOf(sb);
  const ea = fa.primary.element;
  const eb = fb.primary.element;
  const cnt = (n: number) => (n === 0 ? "없음" : `${n}개로 가장 적음`);
  const tag = (x: (typeof people)[number]) => (x.s.hourPillarOmitted ? "(세 기둥 기준)" : "");
  const elements = [...new Set([ea, eb])];
  out.push({
    id: "compat.fortify",
    source: "saju",
    topics: ["relationship", "personality"],
    strength: weak ? "weak" : "moderate",
    fact: `보완 후보 1순위(오행 개수와 태어난 계절로 정한 단순화): ${NAME.a} ${ea}(${ELEMENT_HANJA[ea]}, ${cnt(fa.primary.count)})${tag(people[0])} / ${NAME.b} ${eb}(${ELEMENT_HANJA[eb]}, ${cnt(fb.primary.count)})${tag(people[1])} / ${ea === eb ? `두 사람의 1순위가 같아 함께 보태기 좋은 기운: ${ea}` : "두 사람의 1순위가 달라 각자의 기운을 함께 쓸 수 있음"}`,
    cue: `전통 오행 대응 — ${elements.map(correspondence).join(" / ")}. 부족한 기운을 생활에서 보태는 상징적인 개운법으로, 두 사람이 함께 머무는 공간 · 만나는 장소 · 소품의 색 · 산책하는 방향 · 즐겨 쓰는 번호로 옮겨 소개하는 경우가 많습니다. 필요한 기운을 판정한 것이 아니며 실제 효과나 관계의 변화를 보장하지 않고, 이미 가진 것으로 가볍게 먼저 해 볼 수 있습니다.${unknownHour ? " 출생 시각을 모르는 사람의 후보는 세 기둥 기준이라 시주에 따라 달라질 수 있어 가볍게 곁들입니다." : ""}${hourShaky ? " 시주가 바뀌는 시각에 가까운 사람이 있어 후보가 달라질 수 있습니다." : ""}`,
    ...(uncertain ? { uncertain: true } : {}),
  });
  return out;
}

/** 근거 목록의 개운 근거에서 두 사람의 1순위 기운을 꺼낸다(중복 제거) — 검사가 본문이 그 기운의 대응을 말하는지 확인할 때 쓴다 */
export function compatFortifyElementsOf(evidence: Pick<Evidence, "id" | "fact" | "uncertain">[]): FiveElement[] {
  const e = evidence.find((x) => x.id === "compat.fortify" && !x.uncertain);
  if (!e) return [];
  const found = [...e.fact.matchAll(/(?:A님|B님) ([목화토금수])\(/g)].map((m) => m[1] as FiveElement);
  return [...new Set(found)];
}

export const COMPAT_EXTRA_ID = /^compat\.(chart|fortify)$/;
