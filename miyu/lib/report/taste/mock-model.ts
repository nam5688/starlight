// 맛보기 리포트용 모의 AI — 시험과 로컬 확인에서만 쓴다. 고정된 글(검사를 통과하는 모양)을 돌려주며 실제 AI의 글이 아니다.
import type { ModelRequest, ModelResult, TextModel } from "../ai/model.ts";
import { TASTE_PROMPT_MARK } from "./prompt.ts";

/** 검사(validate.ts)를 통과하는 고정 글 — 사람이 쓴 예시다. 특정 사람의 근거에서 나온 글이 아니라 시험 · 로컬 확인용 고정 글이다 */
export const TASTE_SAMPLE = {
  headline: "맡은 일은 끝까지, 그래서 부담도 혼자 지는 사람",
  sections: [
    {
      id: "self",
      title: "잘 해내는 만큼, 책임도 혼자 크게 져요",
      body: "이 사주는 맡은 일을 적당히 넘기기보다 내가 책임질 수 있는 상태로 만들어 두려는 쪽으로 읽혀요. 시작하기 전에 위험과 변수를 먼저 살피는 신중함이 더해지면, 겉으로는 차분해 보여도 속으로는 여러 경우를 미리 따져 보고 있었던 때가 많았을 거예요. 일을 잘 마친 뒤에도 안도하기 전에 빠뜨린 것이 없는지 한 번 더 돌아보는 쪽에 가까워요. 그 과정에서 문제가 생길 만한 곳을 미리 살피고 한 번 맡은 일을 흔들림 없이 안정적으로 이어 가는 힘이 길러졌어요. 다만 그 힘이 지나치게 쓰이면 남이 맡아야 할 몫까지 내가 확인하고 정리하게 되기 쉬워요.",
    },
    {
      id: "work",
      title: "능력보다 부담 때문에 시작이 늦어질 때가 있어요",
      body: "새로운 일을 못해서 망설인다기보다 시작한 뒤에 생길 문제까지 미리 책임지려는 마음이 앞설 수 있어요. 특히 기준은 모호한데 결과에 대한 책임만 큰 상황에서 많이 지쳤을 거예요. 반대로 역할과 결정 권한이 분명한 일에서는 준비해 온 힘이 잘 드러나요. 이럴 때는 더 대담해지는 것보다 어디까지 확인하면 시작해도 되는지가 분명한 것이 훨씬 도움이 돼요.",
    },
    {
      id: "love",
      title: "마음을 주면 관계도 잘 지키고 싶어요",
      body: "좋아하는 사람과 가까워지는 것 자체보다 가까워진 관계를 잘 이어 가야 한다는 부담이 커지기 쉬워요. 서운함이 생기면 멀어지기보다 대화로 맞추려는 쪽이라서, 관계를 정리하는 역할까지 혼자 맡았던 때도 있었을 거예요. 상대가 함께 풀어야 할 문제까지 내가 먼저 해결하려 하지 않을 때 관계가 더 편해지는 쪽이에요.",
    },
    {
      id: "action",
      title: "시작 전 확인을 늘리기보다 책임의 범위를 먼저 정해요",
      body: "지금 부담스러운 일 하나를 골라 내가 결정할 것, 상대에게 확인할 것, 시작한 뒤 조정할 것으로 나눠 보세요. 모든 문제를 미리 해결해 두지 않아도 움직일 수 있다는 기준을 만드는 연습이에요.",
    },
  ],
} as const;

export const composeMockTaste = (): string => JSON.stringify(TASTE_SAMPLE);

/** 맛보기 요청이면 고정 글을, 아니면 빈 JSON을 돌려주는 모의 모델 */
export function createMockTasteModel(): TextModel {
  return {
    provider: "mock",
    model: "mock-taste",
    async complete(request: ModelRequest): Promise<ModelResult> {
      const isTaste = request.system.includes(TASTE_PROMPT_MARK);
      return { text: isTaste ? composeMockTaste() : "{}", model: "mock-taste", usage: { inputTokens: 1400, outputTokens: 900 } };
    },
  };
}
