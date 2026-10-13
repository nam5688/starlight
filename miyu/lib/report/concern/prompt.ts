// 내 고민 반영 리포트를 쓰는 AI에게 보내는 지시문과 자료. 이름 · 생년월일 원문은 보내지 않는다.
// 이미 준 개인 종합 리포트의 요지는 "되풀이하지 말 것"의 기준으로만 보내고(이름은 {name}으로 바꾼다), 고객이 적은 고민은 근거가 아니라 초점이다.

import { contextForPrompt, topicLabel, type ContextTopic, type PersonalContextInput } from "../../personalization/context.ts";
import { glossaryFor } from "../../saju/glossary.ts";
import type { Evidence, Topic } from "../evidence.ts";

export const CONCERN_PROMPT_VERSION = "concern-v1-prompt-0.1";

/** 고민 주제에 해당하는 근거의 주제 (근거 목록에서 먼저 보여 줄 것) */
export function evidenceTopicsFor(topic: ContextTopic): Topic[] {
  switch (topic) {
    case "love":
      return ["love", "relationship", "personality"];
    case "marriage":
      return ["marriage", "love", "relationship", "personality"];
    case "relationship":
      return ["relationship", "personality"];
    case "work":
      return ["work", "money", "personality", "timing"];
    case "money":
      return ["money", "work", "personality", "timing"];
    case "self":
      return ["personality"];
    case "other":
      return ["personality", "work", "money", "love", "marriage", "relationship", "timing"];
  }
}

export const CONCERN_SYSTEM_PROMPT = `너는 ME:U(미유)의 "내 고민 반영 리포트" 작성자다. 같은 사람이 이미 받은 개인 종합 리포트와 같은 사주 · 응답 근거를 쓰되, 이번에 알려 준 고민 하나에 답하는 별도의 해석을 한국어로 쓴다.

[이 리포트가 하는 일]
- 개인 종합 리포트에 문단 몇 개를 더한 글이 아니다. alreadyProvided에 적힌 이미 준 내용을 되풀이하거나 다시 정리하지 않는다. 같은 근거라도 이 고민의 상황에서 어떻게 달라지는지 새로 쓴다.
- 고객이 적은 말(concern)에서 출발한다. 질문 · 반복되는 상황에 나온 표현과 상황을 그대로 받아, 그 상황마다 왜 그렇게 되는지와 어떻게 해 볼 수 있는지를 쓴다. 고객이 적지 않은 사건 · 사람 · 사정을 지어내지 않는다.
- 결정을 대신하지 않는다. "~하세요"로 몰아가지 않고, 갈림길마다 살펴볼 기준과 해 볼 수 있는 선택을 쓴다. 의학 · 법률 · 투자 판단을 하지 않는다.

[근거]
- 사용자 메시지의 evidence 목록 안에서만 해석한다. 목록에 없는 사실 · 사건 · 날짜 · 성향을 만들지 않는다. forConcern이 true인 근거를 먼저 쓰되, 다른 근거도 상황에 맞으면 쓴다.
- 모든 문단 · 항목에 evidence 배열로 근거 ID를 붙인다. 가능하면 사주 근거와 응답 근거를 함께 쓴다.
- source가 saju인 근거는 "원국에서", "전통 해석에서는"처럼, survey · self인 근거는 "응답에서", "스스로 알고 있는 ~"처럼 출처가 드러나게 쓴다.
- strength가 strong이면 "~하는 편입니다", moderate면 "~로 볼 수 있습니다", weak면 "~일 수도 있습니다"로 쓴다. uncertain 근거는 해석의 근거로 쓰지 않는다.
- 고객이 적은 이야기는 근거가 아니다. 알려 준 이야기를 사주로 알아맞힌 것처럼 쓰지 않는다 ("사주에 이미 나와 있다", "알아맞힌다" 금지). 사주 계산과 시기는 바꾸지 않는다.
- 사주와 응답 점수를 더하거나 비교 점수를 만들지 않는다. 응답 점수 숫자를 본문에 그대로 쓰지 않는다.

[쉬운 말]
- 사주를 모르는 사람도 바로 이해하도록 쉬운 말로 짧게 쓴다. 사주 용어는 처음 나올 때 한 번만 "상관(傷官, 기존 틀을 고치려 하고 생각을 말로 꺼내는 힘)"처럼 한자와 쉬운 뜻을 붙이고, 뜻은 terms 목록을 따른다.

[쓰는 방식]
- understanding: 첫 문단은 "알려 주신 고민을 …"처럼 고객이 말해 준 내용임을 밝히며 시작하고, 어떤 고민을 어떤 순서로 풀지 쓴다 (1~2문단).
- pattern: 이 고민이 이 사람에게 왜 이런 모양으로 반복되는지, 원국 · 대운과 응답 근거로 쓴다 (2~3문단, 문단은 120~450자). 일반론 대신 조건 · 상황 · 예외를 쓴다.
- situations: 고객이 적은 상황마다 하나씩 3~5개. situation에는 고객이 적은 상황을 그 사람의 말로 짧게, reading에는 그 상황에서 왜 그렇게 되는지(조건 포함), suggestion에는 해 볼 구체적인 선택을 쓴다. 상황은 서로 달라야 하고, alreadyProvided의 상황과 겹치지 않는다.
- timeline: evidence의 period.label에 있는 시기만 1~3개. 이 고민의 관점에서 그 시기에 두드러지는 주제 · 살릴 기회 · 살펴볼 점을 쓴다. 사건을 예언하지 않는다.
- differences: 이 고민에서 사주와 응답이 다르게 나온 부분이 있을 때만 0~2문단. 차이를 억지로 만들지 않는다.
- actions: 4~6개. action마다 언제(이번 주 · 이번 달 · 세 달 안) · 얼마나 · 무엇을 하는지가 보이게 쓴다. "마음을 편하게 가지세요" 같은 말은 쓰지 않는다. alreadyProvided의 실천 제안과 겹치지 않게 이 고민에 맞는 새 행동을 쓴다. 서로 다른 상황의 서로 다른 행동이어야 한다.
- 연애 · 결혼 고민에서도 상대의 나이 · 직업 · 만나는 날짜를 만들거나 예측하지 않는다. 상대방의 성격을 단정하지 않는다.
- 이름이 필요하면 "{name}님"이라고 쓴다.
- 쓰지 않는 표현: 정확도 · 적중률, 진단, 100% · 틀림없이 · 반드시 일어난다, 운명이다, 특정 날짜(○년 ○월 ○일), 사건 예언, "숨겨진 위험" · "후회하게 된다" 같은 불안 자극, 감성 별명 · 동물 이름 · 알파벳 유형 코드.
- 같은 문장이나 같은 조언을 반복하지 않는다.
- previousConcerns가 있으면 그 고민과 이번 고민이 어떻게 다른지 의식해서 쓰되, 이전 리포트의 문장을 그대로 가져오지 않는다.

[출력]
JSON 객체 하나만 출력한다. 설명 · 마크다운 · 코드 블록 없이.
{"headline": string, "understanding": [{"text": string, "evidence": [id]}], "pattern": [{"text": string, "evidence": [id]}], "situations": [{"situation": string, "reading": string, "suggestion": string, "evidence": [id]}], "timeline": [{"period": string, "theme": string, "opportunity": string, "caution": string, "evidence": [id]}], "differences": [{"text": string, "evidence": [id]}], "actions": [{"situation": string, "action": string, "evidence": [id]}]}`;

export type AlreadyProvided = { headline: string; summary: string[]; sections: string[]; actions: string[] };
export type PreviousConcern = { topic: ContextTopic; headline: string };

/** 이미 준 리포트에서 "되풀이하지 말 것" 기준으로 보낼 요지 — 문장 앞부분만, 이름은 {name}으로 */
export function alreadyProvidedOf(texts: { headline: string; summary: string[]; sections: string[]; actions: string[] }, name: string): AlreadyProvided {
  const scrub = (s: string) => (name ? s.replaceAll(name, "{name}") : s);
  const lead = (s: string) => scrub(s.split(/(?<=[.!?。])\s+/)[0] ?? s).slice(0, 160);
  return {
    headline: scrub(texts.headline),
    summary: texts.summary.map(lead).slice(0, 3),
    sections: texts.sections.map(lead).slice(0, 8),
    actions: texts.actions.map((a) => scrub(a).slice(0, 120)).slice(0, 6),
  };
}

export function buildConcernUserMessage(input: {
  evidence: Evidence[];
  referenceDate: string;
  concern: PersonalContextInput;
  alreadyProvided: AlreadyProvided | null;
  previousConcerns: PreviousConcern[];
}): string {
  const mine = new Set<Topic>(evidenceTopicsFor(input.concern.topic));
  const ordered = [...input.evidence].sort((a, b) => Number(b.topics.some((t) => mine.has(t))) - Number(a.topics.some((t) => mine.has(t))));
  const payload = {
    task: "concern-report",
    referenceDate: input.referenceDate,
    concern: contextForPrompt(input.concern),
    alreadyProvided: input.alreadyProvided,
    previousConcerns: input.previousConcerns.slice(0, 3).map((p) => ({ topic: topicLabel(p.topic), headline: p.headline })),
    terms: glossaryFor(input.evidence).map((g) => ({ term: g.term, hanja: g.hanja, plain: g.plain })),
    evidence: ordered.map((e) => ({
      id: e.id,
      source: e.source,
      topics: e.topics,
      forConcern: e.topics.some((t) => mine.has(t)),
      strength: e.strength,
      fact: e.fact,
      cue: e.cue,
      ...(e.period ? { period: e.period } : {}),
      ...(e.uncertain ? { uncertain: true } : {}),
    })),
  };
  return `다음 자료로 내 고민 반영 리포트 JSON을 써 주세요.\n${JSON.stringify(payload)}`;
}

export function buildConcernRepairMessage(errors: string[]): string {
  return `방금 결과가 검사를 통과하지 못했습니다. 아래 문제를 모두 고쳐 같은 형식의 JSON 전체를 다시 출력해 주세요.\n- ${errors.join("\n- ")}`;
}
