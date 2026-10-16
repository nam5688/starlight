// 맛보기 리포트용 모의 AI — 시험과 로컬 확인에서만 쓴다. 고정된 글(검사를 통과하는 모양)을 돌려주며 실제 AI의 글이 아니다.
import type { ModelRequest, ModelResult, TextModel } from "../ai/model.ts";
import { TASTE_PROMPT_MARK } from "./prompt.ts";

/** 검사(validate.ts)를 통과하는 고정 글 — 사람이 쓴 예시다 */
export const TASTE_SAMPLE = {
  headline: "깊은 물처럼 오래 헤아리고, 확인한 뒤에야 움직이는 사람",
  sections: [
    {
      id: "self",
      title: "조용히 깊어지는 물, 그런데 시작은 한 번 더 확인해요",
      body: "사주에서는 물 기운이 많은 구성으로 읽혀서, 생각이 깊고 상황에 맞춰 유연하게 흘러가는 모습이 먼저 보여요. 응답에서도 결과가 불확실한 일은 시작하기 전에 여러 번 따져 보는 편으로 나와서, 마음은 앞서도 몸은 한 박자 늦게 움직인 적이 있을 수 있어요. 나무 기운이 약한 구성이라 새로 시작하는 일에는 시동이 천천히 걸리기 쉬운데, 익숙한 방식을 굳이 바꾸고 싶지 않다는 응답과 같은 방향이에요. 그래서 충분히 알아본 뒤에 움직이자고 하다가 아쉽게 지나간 순간이 한 번쯤은 있었을 수 있어요. 다만 이 신중함은 한번 시작하면 끝까지 이어 가는 힘과 함께 나타나서, 오래 가는 일에서는 믿음직한 사람으로 보이기 쉬워요.",
    },
    {
      id: "love",
      title: "마음은 깊이 헤아리는데, 표현은 한 박자 늦어요",
      body: "사주에서는 물 기운이 많아서 상대의 마음을 깊이 헤아리고 맞춰 주는 쪽으로 읽히고, 그만큼 혼자 여러 가능성을 떠올리다 표현이 늦어질 수 있어요. 응답에서도 가까운 관계에서 상대의 반응을 확인하고 싶은 마음이 보여서, 연락이 뜸하면 이유를 하나씩 따져 보게 되는 날이 있을 수 있어요. 두 가지가 만나면 마음은 이미 충분히 쓰고 있는데 겉으로는 담담해 보여서, 서로 마음을 짐작하느라 어긋나는 장면이 생기기 쉬워요.",
    },
    {
      id: "work",
      title: "끝까지 해내는 힘과, 완벽해질 때까지 미루는 마음",
      body: "사주에서는 나무 기운이 약해서 새로 벌이는 일에는 시동이 천천히 걸리고, 일단 시작하면 정해진 틀 안에서 차분히 해 나가는 쪽으로 읽혀요. 응답에서는 시작하기 전에 위험 요소를 먼저 살피고 시작한 일은 끝까지 해 보는 편이라, 맡은 일을 마무리하는 모습에서 믿음을 얻기 쉬워요. 그런데 두 모습이 겹치면 준비가 충분해질 때까지 첫걸음을 미루게 되는 날도 있을 수 있어요.",
    },
    {
      id: "heart",
      title: "지칠 때는 혼자 정리할 시간이 먼저 필요해요",
      body: "마음이 흔들릴 때는 말부터 꺼내기보다 혼자 생각을 정리하는 시간이 먼저 필요한 사람으로 보여요. 사주에서 물 기운이 많은 구성은 감정이 깊고 오래 남는 쪽으로 읽히는데, 응답에서도 다른 사람의 반응에 영향을 받는 편이라 작은 말 한마디가 하루 종일 머물 수 있어요. 그래서 겉으로는 괜찮아 보여도 속에서는 이미 여러 번 곱씹고 있는 날이 있을 수 있어요.",
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
