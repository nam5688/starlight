// 모의 자기 이해 풀이 작성 — 실제 AI를 부르지 않고, 받은 근거 목록(과 고민)으로 형식 검사를 통과하는 초안을 만든다.
// 비교 실행기 · 생성기의 단위 테스트와 호출 없는 점검에서만 쓴다. 문장마다 "[모의 생성]" 표시가 붙으며 내용 차이 검사를 통과하지 못하는 글이다 (판매할 수 없다).
import type { Evidence } from "../evidence.ts";
import { ModelCallError, type ModelResult, type TextModel } from "../ai/model.ts";
import type { PhilosophicalDraftV0 } from "./types.ts";

type Payload = {
  context?: { topic: string; question?: string; situation?: string };
  evidence: (Evidence & { uncertain?: boolean })[];
};

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") : s).trim();

export function composeMockPhilosophicalDraft(userMessage: string): PhilosophicalDraftV0 {
  const payload = JSON.parse(userMessage.slice(userMessage.indexOf("{"))) as Payload;
  const hasConcern = Boolean(payload.context);
  const usable = payload.evidence.filter((e) => !e.uncertain && !e.period);
  const saju = usable.filter((e) => e.source === "saju");
  const survey = usable.filter((e) => e.source !== "saju");
  const s = (i: number) => saju[i % saju.length];
  const v = (i: number) => (survey.length ? survey[i % survey.length] : s(i + 1));
  const period = payload.evidence.find((e) => e.period);
  const told = hasConcern ? "알려 주신 고민을 기준으로 " : "";
  const tag = "[모의 생성] ";
  const pair = (i: number) => [s(i).id, v(i).id];
  // 같은 문장이 반복되지 않도록 문단마다 번호를 단 맺음말을 쓴다
  const tails = ["이 장면에서는 한 번 더 확인해 볼 만합니다", "이런 때에는 조건을 먼저 적어 보는 편이 맞을 수 있습니다", "이 점은 직접 확인해야 알 수 있습니다", "다른 상황에서는 달라질 수 있습니다"];
  const body = (i: number, lead: string) =>
    `${tag}${lead} 원국에서 ${s(i).fact}이라는 점과 응답에서 ${v(i).fact}로 나타난 점을 겹쳐 읽으면, ${told}일할 때와 가까운 사람 앞에서 반응이 갈릴 수 있습니다. ${tails[i % tails.length]} (${i + 1}번째 문단). 이것은 근거에서 읽은 가설이며 단정이 아닙니다 (${i + 1}).`;

  const draft: PhilosophicalDraftV0 = {
    headline: `${tag}근거에서 읽은 자기 이해 풀이`.slice(0, 40),
    intro: { text: `${tag}아래는 근거에서 읽은 가설입니다. 맞는지는 마지막 질문으로 직접 확인해 보세요.${hasConcern ? " 알려 주신 내용은 사주로 알아맞힌 것이 아니라 따로 표시했습니다." : ""}`, evidence: pair(0) },
    values: [
      { title: "중요하게 여기는 것", text: body(0, hasConcern ? `알려 주신 ${payload.context?.topic} 고민에서 중요하게 여기는 것을 읽어 봅니다.` : "중요하게 여기는 것을 읽어 봅니다."), evidence: pair(0) },
      { title: "혼자 맡는 책임의 범위", text: body(1, hasConcern ? "알려 주신 상황에서 혼자 맡는 책임의 범위를 읽어 봅니다." : "혼자 맡는 책임의 범위를 읽어 봅니다."), evidence: pair(1) },
      { title: "고를 때의 기준", text: body(2, "무엇이 확인되면 정할 수 있는지를 읽어 봅니다."), evidence: pair(2) },
    ],
    conflicts: [
      { title: "끌림과 확인", between: ["끌림", "확인"], text: body(3, hasConcern ? "알려 주신 고민에서 끌림과 확인이 부딪히는 장면입니다." : "끌림과 확인이 부딪히는 장면입니다."), evidence: pair(3) },
      { title: "반응과 방향", between: ["반응", "방향"], text: body(4, "반응이 필요한 마음과 방향을 스스로 잡으려는 마음이 부딪히는 장면입니다."), evidence: pair(4) },
    ],
    disagreement: { text: `${tag}원국과 응답이 한 방향으로 모이지 않는 곳이 있습니다. 하나의 결론으로 합치지 않고 나란히 둡니다.`, evidence: pair(5) },
    strengthCost: [0, 1].map((i) => ({
      strength: `${tag}근거에서 읽은 강점 ${i + 1}`,
      when: "비슷한 일이 반복될 때",
      cost: `${tag}대가가 생길 수 있습니다 ${i + 1}`,
      reading: `${tag}원국에서 ${s(i + 6).fact}이라는 점과 응답의 ${clip(v(i + 6).fact, 40)}를 겹쳐 읽었습니다.`,
      evidence: pair(i + 6),
    })),
    ...(hasConcern
      ? {
          choices: [0, 1].map((i) => ({
            option: `${tag}선택지 ${i + 1}`,
            protects: `${tag}이 선택이 지키는 것 ${i + 1}`,
            costs: `${tag}이 선택이 내려놓는 것 ${i + 1}`,
            check: `${tag}조건이 갖춰질 때 부담이 줄어듭니다. 알려 주신 내용에 없어 직접 확인해야 합니다 ${i + 1}.`,
            evidence: pair(i + 8),
          })),
        }
      : {}),
    flow: {
      text: `${tag}계산된 흐름에서 ${period?.period?.label ?? "이번 해"}의 주제가 두드러집니다. 올해 글로 정해 둘 것 두 가지를 적어 두면 덜 흔들릴 수 있습니다. 어떤 일이 일어난다는 뜻은 아닙니다.`,
      evidence: period ? [period.id] : pair(0),
    },
    ...(hasConcern ? { noVerdict: `${tag}이 풀이는 어느 쪽이 맞는지 정하지 않습니다. 정하는 일은 {name}님의 몫입니다.` } : {}),
    questionsActions: [0, 1, 2, 3].map((i) => ({
      when: `${tag}비슷한 일이 반복될 때 ${i + 1}`,
      question: `${tag}지금 무엇을 확인하면 정할 수 있을까요 ${i + 1}?`,
      action: `${tag}이번 주 안에 10분, 확인할 것을 한 줄로 적고 하루 뒤에 읽어 봅니다 ${i + 1}.`,
      evidence: pair(i + 10),
    })),
  };
  return draft;
}


/** 테스트용 모의 모델: 형식 오류 · 일시 오류를 흉내 낼 수 있다 (자기 이해 풀이 요청에만 답한다) */
export function createMockPhilosophyModel(opts: { failTimes?: number; invalidTimes?: number; usage?: { inputTokens: number; outputTokens: number } } = {}): TextModel & { calls: number } {
  let fails = opts.failTimes ?? 0;
  let invalid = opts.invalidTimes ?? 0;
  const model = {
    provider: "mock",
    model: "mock-philosophy-0",
    calls: 0,
    async complete(req: { messages: { role: string; content: string }[] }): Promise<ModelResult> {
      model.calls++;
      if (fails > 0) {
        fails--;
        throw new ModelCallError("모의 일시 오류", { retryable: true, code: "MOCK_OVERLOADED" });
      }
      if (invalid > 0) {
        invalid--;
        return { text: '{"headline": "짧음"}', model: model.model, usage: opts.usage ?? { inputTokens: 20_000, outputTokens: 500 } };
      }
      const draft = composeMockPhilosophicalDraft(req.messages[0].content);
      return { text: JSON.stringify(draft), model: model.model, usage: opts.usage ?? { inputTokens: 20_000, outputTokens: 9_000 } };
    },
  };
  return model;
}
