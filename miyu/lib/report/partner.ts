// 어울리는 관계 조건 — 배우자 자리(일지)의 해석과 가까운 관계 응답에서, "어떤 사람과 편안한지"의 조건을 규칙으로 쓴다.
// 상대의 나이 · 직업 · 만나는 날짜는 계산하거나 예측하지 않는다 (지어낼 수 없는 정보). 특정 인물 · 사건을 만들지 않는다.
// 시기는 일지와 직접 맞닿는 세운(연 단위) 주제만 알려 준다. 문구는 초안 — 전문가 검토 전.

import type { SituationalSummary } from "../assessment/situational/reading.ts";
import type { Evidence } from "./evidence.ts";
import type { Group } from "./questions.ts";
import type { FreeSummary } from "./types.ts";

export type PartnerConditions = {
  intro: string;
  fits: { title: string; detail: string }[];
  watch: { title: string; detail: string }[];
  timing: { note: string; years: { year: number; label: string; why: string }[] };
  limits: string;
};

const PALACE_FITS: Record<Group, { title: string; detail: string }[]> = {
  비겁: [
    { title: "서로의 영역을 존중하는 사람", detail: "전통 해석에서 배우자 자리가 ‘나와 같은 기운’이라, 동등하게 의견을 나누고 각자의 영역을 인정해 주는 관계에서 편안해지기 쉽다고 봅니다." },
    { title: "경쟁보다 협력으로 가는 사람", detail: "누가 이기는지보다 함께 가는 방향을 중요하게 여기는 사람과 있을 때 마음이 놓인다고 봅니다." },
  ],
  식상: [
    { title: "함께 즐기고 마음을 자주 표현하는 사람", detail: "배우자 자리가 ‘표현하는 기운’이라, 감정과 생각을 말로 나누는 관계에서 힘이 난다고 봅니다." },
    { title: "새로운 것을 같이 해 보는 사람", detail: "취미나 경험을 함께 만들어 가는 사람과 가까워지기 쉽다고 봅니다." },
  ],
  재성: [
    { title: "생활을 현실적으로 꾸려 가는 사람", detail: "배우자 자리가 ‘현실 감각’의 기운이라, 약속과 생활의 기준이 분명한 사람에게서 안정감을 느끼기 쉽다고 봅니다." },
    { title: "말과 행동이 일치하는 사람", detail: "표현보다 실제로 챙겨 주는 행동에서 마음을 확인하는 편으로 봅니다." },
  ],
  관성: [
    { title: "책임감 있고 믿음이 가는 사람", detail: "배우자 자리가 ‘책임 · 신뢰’의 기운이라, 약속을 지키고 일관된 사람과 있을 때 편안하다고 봅니다." },
    { title: "관계의 틀을 존중하는 사람", detail: "연락 방식이나 만남의 리듬 같은 기본 약속이 분명한 관계에서 안정감을 느끼기 쉽다고 봅니다." },
  ],
  인성: [
    { title: "내 이야기를 끝까지 들어 주는 사람", detail: "배우자 자리가 ‘이해 · 보살핌’의 기운이라, 서로 이해하고 돌봐 주는 관계에서 마음이 놓인다고 봅니다." },
    { title: "배우고 성장하는 것을 응원하는 사람", detail: "서로의 배움과 성장을 인정해 주는 사람과 오래 이어지기 쉽다고 봅니다." },
  ],
};

const HI = 60;
const LO = 40;

function fromResponses(s: Pick<FreeSummary, "relationship">) {
  const r = Object.fromEntries(s.relationship.map((row) => [row.id, row.score]));
  const anxiety = r.anxiety ?? 50;
  const avoidance = r.avoidance ?? 50;
  if (anxiety >= HI && avoidance >= HI)
    return {
      fit: { title: "‘언제 다시 이야기할지’를 정해 두고 기다려 주는 사람", detail: "응답에서 가까워지고 싶은 마음과 거리가 필요한 마음이 함께 나타났어요. 물러서는 시간을 이해하고 다시 이야기할 때를 기다려 주는 사람과 편안할 수 있어요." },
      watch: { title: "반응이 일정하지 않고 속마음을 말하지 않는 사람", detail: "신호가 불분명하면 확인하고 싶은 마음과 거리를 두고 싶은 마음이 함께 커질 수 있어요." },
    };
  if (anxiety >= HI)
    return {
      fit: { title: "연락 리듬과 마음 표현이 일정한 사람", detail: "응답에서 상대의 반응이 신경 쓰이는 경향이 나타났어요. 답이 늦을 때 미리 알려 주고, 마음을 말로 표현해 주는 사람과 있을 때 안정감을 느끼기 쉬워요." },
      watch: { title: "답이 불규칙하고 속마음을 잘 말하지 않는 사람", detail: "확인하고 싶은 마음이 커져 관계가 힘들게 느껴질 수 있어요." },
    };
  if (avoidance >= HI)
    return {
      fit: { title: "각자의 시간과 속도를 존중해 주는 사람", detail: "응답에서 가까워질수록 혼자 정리하는 시간이 필요해지는 경향이 나타났어요. 거리를 두는 것을 거절로 받아들이지 않는 사람과 편안할 수 있어요." },
      watch: { title: "즉각적인 답과 감정 표현을 계속 요구하는 사람", detail: "요구가 이어지면 부담이 커져 더 물러서게 될 수 있어요." },
    };
  if (anxiety <= LO && avoidance <= LO)
    return {
      fit: { title: "문제가 생기면 대화로 풀어 가려는 사람", detail: "응답에서 가까운 관계가 비교적 편안하게 나타났어요. 서로 솔직하게 이야기하는 사람과 오래 안정적으로 이어지기 쉬워요." },
      watch: { title: "문제를 피하거나 가볍게 넘기는 사람", detail: "서로 중요한 이야기를 미루면 쌓이는 것을 놓칠 수 있어요." },
    };
  return {
    fit: { title: "상황에 맞춰 서로 거리를 조절할 수 있는 사람", detail: "응답에서 상대와 상황에 따라 편한 거리가 달라지는 경향이 나타났어요. 서로 속도를 맞추려는 사람과 편안할 수 있어요." },
    watch: { title: "한쪽이 일방적으로 속도를 정하는 관계", detail: "서로 편한 거리를 말하지 못하면 어긋남이 쌓일 수 있어요." },
  };
}

/** 상황형 28문항 결과 — 가까운 사이 장면(확인 방식 · 갈등 뒤 회복)의 읽기에서 편안한 조건을 쓴다. 두 방향이 함께 읽히거나 읽히지 않았으면 방향을 정하지 않는다 */
function fromSituational(s: SituationalSummary) {
  const sideOf = (d: string) => {
    const r = s.readings.find((x) => x.d === d);
    return r?.status === "sufficient" ? r.side : null;
  };
  const c = sideOf("confirm");
  const r = sideOf("repair");
  const direct = c === "ask" || r === "now";
  const space = c === "wait" || r === "later";
  if (direct && !space)
    return {
      fit: { title: "궁금한 것을 편하게 묻고 바로 이야기를 나누는 사람", detail: "가까운 사이 장면의 답에서 달라 보일 때 직접 묻고 갈등은 바로 풀려는 모습이 읽혔어요. 솔직하게 묻고 답해 주는 사람과 있을 때 편안해질 수 있어요." },
      watch: { title: "물어도 답을 미루거나 돌려 말하는 사람", detail: "묻는 쪽과 미루는 쪽의 속도가 어긋나면 서로 답답해질 수 있어요." },
    };
  if (space && !direct)
    return {
      fit: { title: "혼자 정리할 시간을 존중하고 다시 이야기할 때를 알려 주는 사람", detail: "가까운 사이 장면의 답에서 거리를 두고 진정된 뒤에 이야기하려는 모습이 읽혔어요. 기다려 주고 돌아올 시점을 서로 말해 주는 사람과 편안할 수 있어요." },
      watch: { title: "바로 답과 감정 표현을 계속 요구하는 사람", detail: "요구가 이어지면 부담이 커져 더 물러서게 될 수 있어요." },
    };
  if (!direct && !space && r === "sort")
    return {
      fit: { title: "차이를 차분히 정리해서 이야기해 주는 사람", detail: "가까운 사이 장면의 답에서 갈등이 생기면 무엇이 다른지 먼저 정리하려는 모습이 읽혔어요. 정리한 말을 끝까지 들어 주는 사람과 편안할 수 있어요." },
      watch: { title: "마음을 풀기도 전에 결론부터 재촉하는 사람", detail: "정리할 시간이 없으면 하고 싶은 말이 닿지 못한 채 쌓일 수 있어요." },
    };
  return {
    fit: { title: "편한 거리와 속도를 말로 맞춰 가는 사람", detail: "가까운 사이 장면의 답이 한쪽으로 모이지 않고 장면마다 달랐어요. 서로 편한 거리와 속도를 말로 확인해 주는 사람과 편안할 수 있어요." },
    watch: { title: "한쪽이 일방적으로 속도를 정하는 관계", detail: "서로 편한 거리를 말하지 못하면 어긋남이 쌓일 수 있어요." },
  };
}

const RELATION_WHY: Record<string, string> = {
  천간합: "배우자 자리와 기운이 묶이는 해로, 관계에 대한 생각이 서로 영향을 주고받는 주제가 두드러질 수 있어요.",
  육합: "배우자 자리와 끌어당기는 해로, 관계에서 맞춰 가려는 주제가 두드러질 수 있어요.",
  반합: "배우자 자리와 같은 기운이 모이는 해로, 관계의 분위기가 커지는 주제가 두드러질 수 있어요.",
  충: "배우자 자리와 부딪히는 해로, 관계의 방식이 흔들리거나 다시 정해지는 조정의 주제가 두드러질 수 있어요. 나쁜 일이 생긴다는 뜻이 아니에요.",
  형: "배우자 자리와 조정이 필요한 해로, 익숙한 관계 방식이 다듬어지는 주제가 두드러질 수 있어요. 나쁜 일이 생긴다는 뜻이 아니에요.",
};

export function buildPartnerConditions(input: {
  summary: Pick<FreeSummary, "relationship" | "situational">;
  spouseGroup: Group;
  evidence: Evidence[];
}): PartnerConditions {
  const resp = input.summary.situational ? fromSituational(input.summary.situational) : fromResponses(input.summary);
  const years = input.evidence
    .filter((e) => /^saju\.seun\.\d{4}\.day\./.test(e.id))
    .map((e) => {
      const [, , yearStr, , kind] = e.id.split(".");
      return { year: Number(yearStr), label: e.period?.label ?? `${yearStr}년`, why: RELATION_WHY[kind] ?? e.cue };
    });
  return {
    intro:
      "관계는 사람마다 편안한 조건이 달라요. 아래는 사주의 배우자 자리(일지) 해석과 가까운 관계에 대한 응답에서 본 ‘나에게 편안한 관계의 조건’이며, 특정한 사람을 가리키지 않아요.",
    fits: [...PALACE_FITS[input.spouseGroup], resp.fit],
    watch: [resp.watch],
    timing: {
      note: years.length
        ? "가까운 3년 중 배우자 자리와 직접 맞닿는 해예요. 사건이나 만남을 예언하는 것이 아니라, 관계에 대한 주제가 두드러질 수 있는 해를 연 단위로 알려 드려요."
        : "가까운 3년 중 배우자 자리와 직접 맞닿는 해는 없어요. 이 기준에서는 관계 주제가 유난히 두드러지는 해가 보이지 않는다는 뜻이며, 관계가 없다는 뜻이 아니에요.",
      years,
    },
    // 대운을 계산해 다른 곳(시기 풀이)에서 쓰고 있으면 "반영하지 않았다"고 쓰지 않는다 — 성별이 없어 계산하지 못한 경우에만 밝힌다
    limits: input.evidence.some((e) => e.id === "saju.daeun.current")
      ? "상대의 나이 · 직업 · 만나는 날짜는 계산하거나 예측하지 않아요. 문구는 초안으로 전문가 검토 전이에요."
      : "상대의 나이 · 직업 · 만나는 날짜는 계산하거나 예측하지 않아요. 사주의 대운(10년 단위의 시기)은 성별 정보가 있어야 계산되는데 이번에는 계산하지 못해 반영하지 않았어요. 문구는 초안으로 전문가 검토 전이에요.",
  };
}
