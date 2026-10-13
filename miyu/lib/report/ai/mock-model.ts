// 모의 AI 모델 — 실제 AI를 부르지 않고, 받은 근거 목록으로 형식에 맞는 초안을 만든다.
// 단위 테스트와 로컬 전체 흐름 검사(가짜 AI 서버)에서만 쓴다. 문장마다 "[모의 생성]" 표시가 붙는다.

import type { Evidence } from "../evidence.ts";
import { SECTION_PLAN, type ReportDraftV2 } from "../v2/types.ts";
import { composeMockConcernDraft } from "../concern/mock-model.ts";
import { ModelCallError, type TextModel } from "./model.ts";

const TOPIC_FOR: Record<string, string[]> = {
  mechanics: ["personality"],
  "work-money": ["work", "money"],
  relationships: ["relationship", "love", "marriage"],
  conditions: ["personality", "work", "relationship"],
};

/** 사용자 메시지(buildUserMessage 형식)에서 근거 목록을 꺼내 형식에 맞는 초안을 만든다 */
export function composeMockDraft(userMessage: string): ReportDraftV2 {
  const payload = JSON.parse(userMessage.slice(userMessage.indexOf("{"))) as { evidence: Evidence[]; context?: { topic: string; focusGuide: string } };
  const ev = payload.evidence;
  const usable = ev.filter((e) => !e.uncertain && !e.period);
  const saju = usable.filter((e) => e.source === "saju");
  const survey = usable.filter((e) => e.source !== "saju");
  const pick = (topics: string[], from: Evidence[]) => from.find((e) => e.topics.some((t) => topics.includes(t))) ?? from[0];
  const periods = [...new Map(ev.filter((e) => e.period).map((e) => [e.period!.label, e])).values()].slice(0, 3);

  const headline = "[모의 생성] 원국과 응답으로 본 해석 초안";
  const s0 = saju[0];
  const v0 = survey[0] ?? saju[1] ?? s0;
  const summary = [
    {
      text: `[모의 생성] 요약 — 원국에서는 ${s0.fact}이고, ${s0.cue} 응답에서는 ${v0.fact}로 나타났습니다. 실제 AI 연결 전의 모의 문장입니다.`,
      evidence: [s0.id, v0.id],
    },
  ];
  const sections = SECTION_PLAN.map((plan) => {
    const a = pick(TOPIC_FOR[plan.id], saju);
    const b = pick(TOPIC_FOR[plan.id], survey.length ? survey : saju);
    return {
      id: plan.id,
      paragraphs: [
        {
          text: `[모의 생성] ${plan.title}에 대해 원국에서는 ${a.fact}이며 ${a.cue} ${plan.title}와 관련해 응답에서는 ${b.fact}로 나타났고, ${b.cue}`,
          evidence: [...new Set([a.id, b.id])],
        },
      ],
    };
  });
  // 형식 검사는 같은 문장의 반복을 막는다. 시기마다 설명(cue)에 같은 문장이 들어 있을 수 있으므로, 이미 쓴 문장은 빼고 붙인다
  const seenSentences = new Set<string>();
  const freshCue = (cue: string) =>
    cue
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => {
        const key = sentence.replace(/[^\p{L}\p{N}]/gu, "");
        if (seenSentences.has(key)) return false;
        seenSentences.add(key);
        return true;
      })
      .join(" ");
  const timeline = periods.map((p) => {
    const cue = freshCue(p.cue);
    return {
      period: p.period!.label,
      theme: cue ? `[모의 생성] ${p.period!.label}의 주제 — ${cue}` : `[모의 생성] ${p.period!.label}의 주제를 실제 AI가 근거로 정리합니다.`,
      opportunity: `${p.period!.label}에 살릴 점을 실제 AI가 근거로 정리합니다.`,
      caution: `${p.period!.label}에 살펴볼 점을 실제 AI가 근거로 정리합니다.`,
      evidence: [p.id],
    };
  });
  const differences =
    survey.length && saju.length
      ? [{ text: `[모의 생성] 원국의 ${saju[saju.length - 1].fact}와 응답의 ${survey[survey.length - 1].fact}가 상황에 따라 다르게 나타날 수 있습니다.`, evidence: [saju[saju.length - 1].id, survey[survey.length - 1].id] }]
      : [];
  const ids = [s0.id, v0.id];
  const actions = [
    { situation: "[모의 생성] 중요한 결정을 앞두고 있을 때", action: "확인할 항목 세 가지를 먼저 적고, 모두 확인되면 결정합니다", evidence: ids },
    { situation: "[모의 생성] 가까운 사람에게 서운함이 쌓일 때", action: "하루를 넘기지 않고 짧게 이유를 말로 전합니다", evidence: ids },
    { situation: "[모의 생성] 새로운 일을 시작할 때", action: "첫 주 목표를 작게 잡고 결과를 기록해 다음 계획에 씁니다", evidence: ids },
  ];
  const focus = payload.context
    ? [
        {
          text: `[모의 생성] 알려 주신 고민(${payload.context.topic})을 반영하면, ${payload.context.focusGuide}을 중심으로 봅니다. 이 고민에서는 원국의 ${s0.fact}과 응답의 ${v0.fact}를 함께 살핍니다. 실제 AI가 연결되면 이 자리에 고민에 맞춘 해석이 들어갑니다.`,
          evidence: [s0.id, v0.id],
        },
      ]
    : [];
  return { headline, summary, sections, timeline, differences, actions, focus };
}

/** 테스트용 모의 모델: 실패 · 형식 오류 · 지연을 흉내 낼 수 있다 */
export function createMockModel(opts: { failTimes?: number; invalidTimes?: number; delayMs?: number } = {}): TextModel & { calls: number } {
  let fails = opts.failTimes ?? 0;
  let invalid = opts.invalidTimes ?? 0;
  const model = {
    provider: "mock",
    model: "mock-0",
    calls: 0,
    async complete(req: { messages: { role: string; content: string }[] }) {
      model.calls++;
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (fails > 0) {
        fails--;
        throw new ModelCallError("모의 일시 오류", { retryable: true, code: "MOCK_OVERLOADED" });
      }
      if (invalid > 0) {
        invalid--;
        return { text: '{"headline": "짧음"}', model: "mock-0" };
      }
      const user = req.messages[0].content;
      // 고민 반영 리포트 요청(task: concern-report)에는 고민 리포트 형식으로 답한다
      const draft = user.includes('"task":"concern-report"') ? composeMockConcernDraft(user) : composeMockDraft(user);
      return { text: JSON.stringify(draft), model: "mock-0", usage: { inputTokens: 0, outputTokens: 0 } };
    },
  };
  return model;
}
