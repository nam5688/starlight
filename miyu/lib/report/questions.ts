// 개인 질문과 답 — 이 사람의 원국에서 나온 "궁금해질 만한 지점"을 질문으로 만들고, 쉬운 말 답을 붙인다.
// 질문은 무료 미리보기에 보이고, 답은 구매 후에만 보인다. 규칙으로만 만든다 (AI 아님, 같은 원국이면 같은 결과).
// 답은 전통 해석을 쉬운 말로 옮긴 것이며 단정하지 않는다. 문구는 초안 — 전문가 검토 전.

import type { Evidence } from "./evidence.ts";
import { ELEMENT_INFO } from "../saju/plain.ts";
import type { FiveElement } from "../saju/engine.ts";

export type PersonalQA = {
  id: string;
  question: string;
  answer: string;
  /** 근거가 된 계산 결과 한 줄 (예: "원국에 관성이 없음") */
  basis: string;
};

export type Group = "비겁" | "식상" | "재성" | "관성" | "인성";

const GROUP_PLAIN: Record<Group, { hanja: string; meaning: string; none: string; many: string }> = {
  비겁: {
    hanja: "比劫",
    meaning: "나와 같은 기운으로, 자기 기준 · 독립심 · 동료와의 관계를 뜻합니다",
    none: "누군가와 같은 편이 되어 경쟁하거나 협력하는 일에 덜 끌리고, 혼자 판단해 움직이는 모습으로 나타날 수 있어요.",
    many: "자기 기준과 자존심이 강해 양보가 어렵게 느껴지고, 동료와 경쟁 구도가 자주 생길 수 있어요.",
  },
  식상: {
    hanja: "食傷",
    meaning: "내가 만들어 내는 기운으로, 표현 · 재능 · 결과물을 뜻합니다",
    none: "마음이나 생각을 말과 결과물로 내놓는 일이 낯설거나 늦게 나올 수 있어요.",
    many: "표현하고 만들어 내는 힘이 커서 말과 아이디어가 많지만, 정리 없이 쏟아내면 쉽게 지칠 수 있어요.",
  },
  재성: {
    hanja: "財星",
    meaning: "내가 다스리는 기운으로, 현실 감각 · 성과 · 돈과 자원을 뜻합니다",
    none: "돈이나 성과를 계획적으로 다루는 일이 몸에 덜 붙어 있어, 기준을 적어 두면 훨씬 편해질 수 있어요.",
    many: "현실을 챙기는 힘이 강해 성과와 돈에 민감한 편이에요. 지나치면 여유가 없어진다고 느낄 수 있어요.",
  },
  관성: {
    hanja: "官星",
    meaning: "나를 다스리는 기운으로, 규칙 · 책임 · 평판 · 조직 안의 역할을 뜻합니다",
    none: "정해진 틀에 맞추기보다 내 방식대로 하려는 모습으로 나타나기 쉬워요. 조직의 규칙이나 평가가 갑자기 크게 느껴질 때 부담스러울 수 있어요.",
    many: "책임감이 강하고 평판에 신경을 쓰는 편이에요. 스스로를 틀에 가두어 부담을 크게 느낄 수 있어요.",
  },
  인성: {
    hanja: "印星",
    meaning: "나를 돕는 기운으로, 배움 · 검토 · 보살핌을 뜻합니다",
    none: "충분히 배우고 검토하기 전에 움직이는 편이거나, 도움을 요청하는 일이 서툴 수 있어요.",
    many: "충분히 이해하고 배운 뒤에 움직이는 편이에요. 준비가 길어지면 시작이 늦어질 수 있어요.",
  },
};

/** 질문으로 만들 우선순위 — 일 · 연애 · 돈과 가까운 주제부터 */
const GROUPS: Group[] = ["관성", "재성", "인성", "식상", "비겁"];

const SPOUSE_PLAIN: Record<Group, string> = {
  비겁: "가까운 관계에서 동등함과 각자의 영역을 중요하게 여기는 편으로 봅니다.",
  식상: "가까운 관계에서 함께 즐기고 마음을 표현하는 것을 중요하게 여기는 편으로 봅니다.",
  재성: "가까운 관계를 현실적으로 꾸려 가려는 기대가 큰 편으로 봅니다.",
  관성: "가까운 관계에서 책임 · 신뢰 · 안정감을 중요하게 여기는 편으로 봅니다.",
  인성: "가까운 관계에서 이해받고 서로 돌봐 주는 것을 중요하게 여기는 편으로 봅니다.",
};

const COMBOS: Record<string, { q: string; a: string }> = {
  "sanggwan-paein": {
    q: "생각은 깊은데 말은 빠르다 — 인성과 상관이 함께 많은 원국은 어떤 사람일까요?",
    a: "인성(배움 · 검토)이 많아 충분히 이해한 뒤에 움직이려 하고, 상관(기존 틀을 고치려는 표현)도 많아 이해한 것을 말로 꺼내려는 힘이 큽니다. 그래서 결정은 신중한데 의견은 빠르게 나오는 엇갈림이 생길 수 있어요. 생각이 정리되기 전에 말이 앞서면 아쉬움이 남고, 정리한 뒤에 말하면 설득력이 커지는 식으로 갈린다고 봅니다.",
  },
  "siksang-saengjae": {
    q: "내가 만든 것이 돈이나 성과로 이어지려면 어떤 조건이 필요할까요?",
    a: "식상(만들어 내는 힘)과 재성(현실 감각)이 함께 있어, 만든 것을 성과로 연결하기 쉬운 구조로 봅니다. 결과물을 밖으로 내놓을 기회를 자주 만들수록 유리하다고 보며, 만들기만 하고 내놓지 않으면 이 힘이 살아나기 어렵습니다.",
  },
  "jae-in": {
    q: "현실 감각과 배움의 힘이 함께 있는 원국은 어떤 선택을 하게 될까요?",
    a: "재성(현실 감각)과 인성(배움 · 검토)이 함께 있어, 실속을 따지면서도 충분히 알아본 뒤에 움직이는 편으로 봅니다. 두 힘이 부딪히면 이득을 따지다 배움이 얕아지거나, 배우다 실속을 놓친다고 느낄 수 있어요.",
  },
  "gwan-in": {
    q: "책임감과 배움의 힘이 함께 있는 원국은 어떤 환경에서 살아날까요?",
    a: "관성(책임 · 규칙)과 인성(배움 · 보살핌)이 함께 있어, 체계가 있는 환경에서 배우며 역할을 키워 가기 쉬운 구조로 봅니다. 규칙이 없는 곳에서는 스스로 틀을 만들어야 편해질 수 있어요.",
  },
};

const timingText = (e: Evidence) => e.cue.replace(/\s*\(.*?영역\)\s*$/, "");

/** 이 원국에서 나온 개인 질문 (최대 5개, 우선순위순) */
export function personalQuestions(sajuEvidence: Evidence[], opts: { spouseGroup?: Group } = {}): PersonalQA[] {
  const byId = new Map(sajuEvidence.map((e) => [e.id, e]));
  const out: PersonalQA[] = [];
  const add = (qa: PersonalQA) => out.length < 5 && out.push(qa);

  // 1) 없는 십신 무리 — 가장 크게 느껴질 수 있는 지점
  for (const g of GROUPS) {
    const e = byId.get(`saju.tengod.${g}.none`);
    if (!e) continue;
    const p = GROUP_PLAIN[g];
    add({
      id: e.id,
      question: `원국에 ${g}(${p.hanja})이 없다는데, 일상에서는 어떻게 나타날까요?`,
      answer: `${g}은 ${p.meaning}. 원국에 없으면 ${p.none} 대운이나 세운에서 이 기운을 만나는 시기에는 그 주제가 상대적으로 크게 느껴질 수 있다고 봅니다.`,
      basis: e.fact,
    });
    break;
  }

  // 2) 함께 많은 조합
  for (const [key, c] of Object.entries(COMBOS)) {
    const e = byId.get(`saju.combo.${key}`);
    if (e) {
      add({ id: e.id, question: c.q, answer: c.a, basis: e.fact });
      break;
    }
  }

  // 3) 없는 오행
  for (const el of ["목", "화", "토", "금", "수"] as FiveElement[]) {
    const e = byId.get(`saju.element.${el}.none`);
    if (!e) continue;
    const info = ELEMENT_INFO[el];
    add({
      id: e.id,
      question: `${el}(${info.image}) 기운이 없는 원국은 어떤 순간에 가장 크게 느껴질까요?`,
      answer: `${el}(${info.hanja})은 ${info.force}을 뜻합니다. 원국에 없으면 ${info.few} 일상에서 가볍게 채우는 방법은 ‘보완 아이템’에 정리했습니다.`,
      basis: e.fact,
    });
    break;
  }

  // 4) 많은 십신 무리
  for (const g of GROUPS) {
    const e = byId.get(`saju.tengod.${g}.many`);
    if (!e) continue;
    const p = GROUP_PLAIN[g];
    add({
      id: e.id,
      question: `${g}(${p.hanja})이 여러 자리에 있다는 건 어떤 뜻일까요?`,
      answer: `${g}은 ${p.meaning}. 여러 자리에 있으면 ${p.many}`,
      basis: e.fact,
    });
    break;
  }

  // 5) 배우자 자리 (일지의 십신 그룹은 계산 결과에서 받는다)
  const palace = byId.get("saju.spouse-palace");
  if (palace && opts.spouseGroup) {
    add({
      id: palace.id,
      question: "가까운 관계에서 내가 중요하게 여기는 것은 무엇일까요?",
      answer: `${SPOUSE_PLAIN[opts.spouseGroup]} 이 내용을 바탕으로 한 관계 조건은 ‘어울리는 관계 조건’에 정리했습니다.`,
      basis: palace.fact,
    });
  }

  // 6) 가까운 시기의 흐름 (세운)
  const seun = sajuEvidence.filter((e) => /^saju\.seun\.\d{4}$/.test(e.id)).slice(0, 2);
  for (const e of seun) {
    const label = e.period?.label ?? e.id;
    add({
      id: e.id,
      question: `${label}에는 어떤 주제가 두드러질까요?`,
      answer: `${timingText(e)} 특정 사건이나 날짜를 알려 주는 것이 아니라, 그 해에 전통적으로 두드러지는 주제입니다.`,
      basis: e.fact,
    });
  }

  // 7) 공망
  const voidE = byId.get("saju.void");
  if (voidE) {
    add({
      id: voidE.id,
      question: "원국에 공망이 있다는데 무슨 뜻일까요?",
      answer: "공망은 전통 해석에서 그 자리의 힘이 비어 있는 듯 약하게 느껴질 수 있다고 보는 자리입니다. 해당 기둥이 나타내는 영역에서 기대한 만큼 채워지지 않는다는 느낌이 들거나, 반대로 집착이 줄어든다고 보기도 합니다. 학파마다 해석이 다릅니다.",
      basis: voidE.fact,
    });
  }
  return out;
}
