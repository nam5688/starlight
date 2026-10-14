// 모의 AI 모델 — 실제 AI를 부르지 않고, 받은 자료(풀이 제목 · 질문)로 형식에 맞는 답을 만든다.
// 단위 테스트와 개발 화면 확인에서만 쓴다. 문장마다 "[모의 생성]" 표시가 붙는다.
import type { ModelRequest, ModelResult, TextModel } from "../ai/model.ts";

type Payload = { followUp?: boolean; reading?: { headline?: string } | string; overview?: { headline?: string }; question?: string };

/** buildChatUserMessage가 만든 메시지에서 자료를 꺼내 모의 답을 만든다 */
export function composeMockChatAnswer(userMessage: string): string {
  const payload = JSON.parse(userMessage.slice(userMessage.indexOf("{"))) as Payload;
  const headline = (typeof payload.reading === "object" ? payload.reading.headline : null) ?? payload.overview?.headline ?? "";
  const first = payload.followUp ? "[모의 생성] 맞지 않는다고 느낄 수 있어요. 그 상황에서는 다르게 나타날 수 있어요." : "[모의 생성] 리포트에서 읽은 것만 가지고 말해 볼게요.";
  return [first, headline ? `이 풀이에서는 "${headline}"라고 읽었어요. 실제 AI를 연결하기 전의 모의 답이에요.` : "실제 AI를 연결하기 전의 모의 답이에요.", "상황이 달라지는 지점을 한 줄로 적어 보면 어떨까요?"].join("\n\n");
}

export function createMockChatModel(): TextModel {
  return {
    provider: "mock-chat",
    model: "mock-chat",
    async complete(request: ModelRequest): Promise<ModelResult> {
      const user = request.messages.find((m) => m.role === "user");
      return { text: composeMockChatAnswer(user?.content ?? "{}"), model: "mock-chat", usage: { inputTokens: 900, outputTokens: 200 } };
    },
  };
}
