// 영역별 이야기(story-v1)의 모의 작성기 — 실제 AI를 부르지 않고, 받은 근거 목록의 ID로 형식 검사를 통과하는 초안을 만든다.
// 단위 테스트와 로컬 전체 흐름 검사(가짜 AI 서버)에서만 쓴다. 문장은 근거를 풀어 쓴 글이 아니라 자리 표시이며 "[모의 생성]"이 붙는다. 내용 검사(depth.ts)는 이 표시가 남은 글을 판매할 수 없다고 본다.
import type { Evidence } from "../evidence.ts";
import { STORY_AREAS, STORY_FLOW_TOPIC } from "./story-plan.ts";
import type { StoryActionArea, StoryAreaId, StoryDraftV1 } from "./types.ts";

type MockPayload = {
  evidence: Evidence[];
  areas: { id: StoryAreaId; personalEvidence: string[] }[];
  periods: { ref: string; label: string; evidence: string[] }[];
  context?: { topic: string; focusGuide: string };
};

const M = "[모의 생성]";
const ORD = ["첫 번째", "두 번째", "세 번째", "네 번째", "다섯 번째"];

export function composeMockStory(userMessage: string): StoryDraftV1 {
  const payload = JSON.parse(userMessage.slice(userMessage.indexOf("{"))) as MockPayload;
  const usable = payload.evidence.filter((e) => !e.uncertain && !e.period);
  const saju = usable.filter((e) => e.source === "saju");
  const hasMbti = usable.some((e) => e.id === "self.mbti");
  // 입력한 MBTI는 시기를 뺀 영역 가운데 두 곳 이상에 연결해야 한다 — 영역 순서대로 앞의 둘에 단다
  let mbtiLeft = hasMbti ? 2 : 0;

  const areas = STORY_AREAS.map((plan, i) => {
    const mine = payload.areas.find((a) => a.id === plan.id)?.personalEvidence ?? [];
    const personal = mine.filter((id) => id !== "self.mbti").slice(0, plan.personalMin);
    const mbti = mine.includes("self.mbti") && mbtiLeft > 0;
    if (mbti) mbtiLeft--;
    const t = plan.topic;
    const count = plan.id === "core" ? 3 : 3;
    const paragraphs = Array.from({ length: count }, (_, n) => {
      const mention = mbti && n === 0 ? ` 입력해 주신 성향까지 함께 보면 ${t}의 ${ORD[n]} 자리에서 다르게 나타날 수 있습니다.` : "";
      return `${M} ${t}의 ${ORD[n]} 문단을 쓰는 자리입니다. ${t}의 ${ORD[n]} 문단은 실제 AI가 근거를 읽고 조건과 함께 이어서 씁니다.${mention}`;
    });
    return {
      id: plan.id,
      headline: `${t}의 모의 결론 ${i + 1}번째입니다`,
      paragraphs,
      evidence: [saju[i % saju.length].id, ...personal, ...(mbti ? ["self.mbti"] : [])],
    };
  });

  const years = payload.periods.filter((p) => p.ref.startsWith("y")).slice(0, 3);
  const periodIds = payload.periods.slice(0, 2).flatMap((p) => p.evidence.slice(0, 1));
  const f = STORY_FLOW_TOPIC;
  const flow: StoryDraftV1["flow"] = {
    headline: `${f}의 모의 결론입니다`,
    paragraphs: [
      `${M} ${f}의 첫 번째 문단을 쓰는 자리입니다. 시기 풀이는 실제 AI가 계산된 시기를 읽고 이 사람이 받아들이는 방식까지 이어서 씁니다.`,
      `${M} ${f}의 두 번째 문단을 쓰는 자리입니다. 두 번째 문단은 시기가 두드러지게 하는 주제와 살릴 점을 실제 AI가 씁니다.`,
    ],
    years: years.map((p) => ({ year: p.ref.slice(1), theme: `${M} ${p.label} 한 줄 자리` })),
    scenarios: [{ when: `${M} 지금의 모습이 그대로 이어지면`, then: "이어지는 전개를 가능성으로 쓰는 자리입니다. 지금 모습이 이어지면 비슷하게 흘러갈 수 있습니다." }],
    evidence: [saju[0].id, ...periodIds.slice(0, 1)],
  };

  const order: StoryActionArea[] = ["core", "relation", "work-money"];
  const draft: StoryDraftV1 = {
    headline: `${M} 근거 안에서 쓴 통합 해석 초안`,
    cards: {
      strength: { keyword: `${M} 강점`, note: `${M} 내가 강한 포인트를 쓰는 자리입니다.` },
      caution: { keyword: `${M} 주의`, note: `${M} 내가 힘들 수 있는 포인트를 쓰는 자리입니다.` },
      flow: { keyword: `${M} 시기` },
    },
    areas,
    flow,
    actions: order.map((area, i) => ({
      title: `${M} ${ORD[i]} 상황에서`,
      detail: ["확인할 것을 한 줄로 적어 두고, 모두 확인되면 다음으로 넘어갑니다.", "마음에 걸리는 점을 한 가지만 짧게 묻고, 답을 기록해 둡니다.", "작은 단계부터 정해 시작하고, 끝난 뒤 느낀 점을 메모합니다."][i],
      area,
      evidence: [saju[i % saju.length].id],
    })),
  };
  if (payload.context) {
    draft.focus = [{ text: `${M} 알려 주신 고민(${payload.context.topic})을 반영하면, ${payload.context.focusGuide}을 중심으로 봅니다. 실제 AI가 연결되면 이 자리에 고민에 맞춘 풀이가 들어옵니다.`, evidence: [saju[0].id] }];
  }
  return draft;
}
