// 읽기 구조 리포트의 모의 작성기 — 실제 AI를 부르지 않고, 받은 근거 목록의 ID로 형식 검사를 통과하는 초안을 만든다.
// 단위 테스트와 로컬 전체 흐름 검사(가짜 AI 서버)에서만 쓴다. 문장은 근거를 풀어 쓴 글이 아니라 자리 표시이며 "[모의 생성]"이 붙는다.
// 깊이 검사(depth.ts)는 이 표시가 남은 글을 판매할 수 없다고 본다.
import type { Evidence } from "../evidence.ts";
import { BLOCK_PLAN } from "./plan.ts";
import type { ReadingBlockDraft, ReadingDraftV1 } from "./types.ts";

type MockPayload = {
  evidence: Evidence[];
  periods: { ref: string; label: string; evidence: string[] }[];
  context?: { topic: string; focusGuide: string };
};

const M = "[모의 생성]";

export function composeMockReading(userMessage: string): ReadingDraftV1 {
  const payload = JSON.parse(userMessage.slice(userMessage.indexOf("{"))) as MockPayload;
  const usable = payload.evidence.filter((e) => !e.uncertain && !e.period);
  const saju = usable.filter((e) => e.source === "saju");
  const answers = usable.filter((e) => e.source !== "saju");
  const ids = (i: number) => [saju[i % saju.length].id, ...(answers.length ? [answers[i % answers.length].id] : [])];

  const blocks: ReadingBlockDraft[] = BLOCK_PLAN.map((plan, i) => {
    const t = plan.topic;
    const b: ReadingBlockDraft = {
      id: plan.id,
      headline: `${t}의 모의 결론입니다`,
      summary: `${M} ${t}의 요약 자리입니다. ${t} 요약은 실제 AI가 근거를 읽고 두 문장으로 씁니다.`,
      details: plan.traits ? [] : [`${M} ${t}의 자세한 풀이 자리입니다. ${t} 풀이는 실제 AI가 연결되면 근거에 맞춰 들어옵니다.`],
      watch: `${M} ${t}에서 살펴볼 점을 쓰는 자리입니다. ${t}의 이 자리는 실제 AI가 연결되면 채워집니다.`,
      evidence: ids(i),
    };
    if (plan.example) b.example = `${M} ${t}의 예시 자리입니다. ${t} 예시는 실제 AI가 가상의 장면 하나로 씁니다.`;
    if (plan.traits) {
      b.traits = ["하나", "둘", "셋"].map((n) => ({
        name: `모의 특징 ${n}`,
        shinesShort: `${n}번 특징이 쓰일 때`,
        burdenShort: `${n}번 특징이 힘들 때`,
        shines: `${M} ${n}번째 특징이 강하게 쓰이는 때를 쓰는 자리입니다.`,
        burden: `${M} ${n}번째 특징이 힘들어지는 때를 쓰는 자리입니다.`,
        example: `${M} ${n}번째 특징의 장면 하나를 쓰는 자리입니다.`,
      }));
    }
    if (plan.relation) {
      b.comfort = {
        comfortable: ["편안한 조건을 쓰는 자리입니다 (하나)", "편안한 조건을 쓰는 자리입니다 (둘)", "편안한 조건을 쓰는 자리입니다 (셋)"],
        clash: ["부딪히는 방식을 쓰는 자리입니다 (하나)", "부딪히는 방식을 쓰는 자리입니다 (둘)", "부딪히는 방식을 쓰는 자리입니다 (셋)"],
      };
      b.reactionFlow = {
        when: "관계가 불확실해 보일 때",
        steps: [
          { label: "상황", text: "모의 상황 자리" },
          { label: "마음", text: "모의 마음 자리" },
          { label: "행동", text: "모의 행동 자리" },
          { label: "도움이 되는 것", text: "모의 도움 자리" },
        ],
        helpful: `${M} 관계 부분에서 도움이 되는 것을 쓰는 자리입니다. 반응 단계의 마지막 칸은 실제 AI가 채웁니다.`,
      };
    }
    return b;
  });

  const years = payload.periods.filter((p) => p.ref.startsWith("y")).slice(0, 3);
  const periods = payload.periods.slice(0, 3);
  const periodIds = periods.flatMap((p) => p.evidence.slice(0, 1));
  const flow: ReadingDraftV1["flow"] = {
    headline: "앞으로의 시기 모의 결론입니다",
    summary: `${M} 앞으로의 시기 요약 자리입니다. 시기 요약은 실제 AI가 계산된 시기를 읽고 씁니다.`,
    cardText: `${M} 지금 지나는 시기의 설명 자리입니다. 이 설명은 실제 AI가 연결되면 쉬운 말로 채워집니다.`,
    years: years.map((p) => ({ year: p.ref.slice(1), theme: `${M} ${p.label} 한 줄 자리` })),
    periods: periods.map((p) => ({ ref: p.ref, theme: `${M} ${p.label}에 두드러지는 주제를 쓰는 자리입니다.`, watch: `${M} ${p.label}에 살펴볼 점 자리입니다.` })),
    scenarios: [
      { when: `${M} 지금의 모습이 그대로 이어지면`, then: "이어지는 전개를 가능성으로 쓰는 자리입니다. 지금 모습이 이어지면 비슷하게 흘러갈 수 있습니다." },
      { when: `${M} 이렇게 달라지면 어떨까요`, then: "달라지는 전개를 가능성으로 쓰는 자리입니다. 방식을 바꾸면 다른 전개가 열릴 수 있습니다." },
    ],
    evidence: [saju[0].id, ...periodIds.slice(0, 1)],
  };

  const draft: ReadingDraftV1 = {
    headline: `${M} 근거 안에서 쓴 통합 해석 초안`,
    cards: {
      strength: { keyword: `${M} 강점`, note: `${M} 장점을 쓰는 자리입니다.` },
      caution: { keyword: `${M} 주의`, note: `${M} 단점이 될 수 있는 부분을 쓰는 자리입니다.` },
      flow: { keyword: `${M} 시기` },
    },
    blocks,
    flow,
    actions: [
      { title: `${M} 첫 번째 상황에서`, detail: "확인할 것을 한 줄로 적어 두고, 모두 확인되면 다음으로 넘어갑니다.", evidence: ids(0) },
      { title: `${M} 두 번째 상황에서`, detail: "마음에 걸리는 점을 한 가지만 짧게 묻고, 답을 기록해 둡니다.", evidence: ids(1) },
      { title: `${M} 세 번째 상황에서`, detail: "작은 단계부터 정해 시작하고, 끝난 뒤 느낀 점을 메모합니다.", evidence: ids(2) },
    ],
  };
  if (payload.context) {
    draft.focus = [{ text: `${M} 알려 주신 고민(${payload.context.topic})을 반영하면, ${payload.context.focusGuide}을 중심으로 봅니다. 실제 AI가 연결되면 이 자리에 고민에 맞춘 해석이 들어갑니다.`, evidence: ids(0) }];
  }
  return draft;
}
