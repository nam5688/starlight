// 7개 대주제(story-7)의 모의 작성기 — 실제 AI를 부르지 않고, 받은 근거 목록의 ID로 형식 검사를 통과하는 초안을 만든다.
// 단위 테스트 · 리허설(`scripts/run-own-story.ts --rehearsal`) · 로컬 전체 흐름 검사(가짜 AI 서버)에서만 쓴다. 문장은 근거를 풀어 쓴 글이 아니라 자리 표시이며 "[모의 생성]"이 붙는다. 내용 검사(depth.ts)는 이 표시가 남은 글을 판매할 수 없다고 본다.
import type { Evidence } from "../evidence.ts";
import { STORY7_MBTI_NOS, STORY7_SECTIONS } from "./story7-plan.ts";
import type { Story7DraftV1, Story7SectionDraft } from "./types.ts";

type MockPayload = {
  evidence: Evidence[];
  sections: { no: number; sajuEvidence: string[]; personalEvidence: string[]; maxParagraphs: number }[];
  periods: { ref: string; label: string; evidence: string[] }[];
  context?: { topic: string; focusGuide: string };
};

const M = "[모의 생성]";
const ORD = ["첫 번째", "두 번째", "세 번째", "네 번째"];

export function composeMockStory7(userMessage: string): Story7DraftV1 {
  const payload = JSON.parse(userMessage.slice(userMessage.indexOf("{"))) as MockPayload;
  const usable = payload.evidence.filter((e) => !e.uncertain && !e.period);
  const saju = usable.filter((e) => e.source === "saju");
  const hasMbti = usable.some((e) => e.id === "self.mbti");
  // 입력한 MBTI는 맞닿는 장(1 · 3 · 5번) 가운데 둘 이상에 연결해야 한다 — 번호 순서대로 앞의 둘에 단다
  let mbtiLeft = hasMbti ? 2 : 0;

  const sections: Story7SectionDraft[] = STORY7_SECTIONS.map((plan) => {
    const mine = payload.sections.find((s) => s.no === plan.no);
    const sajuId = mine?.sajuEvidence[0] ?? saju[plan.no % saju.length].id;
    const personal = (mine?.personalEvidence ?? []).filter((id) => id !== "self.mbti").slice(0, plan.personalMin);
    const mbti = (STORY7_MBTI_NOS as readonly number[]).includes(plan.no) && (mine?.personalEvidence ?? []).includes("self.mbti") && mbtiLeft > 0;
    if (mbti) mbtiLeft--;
    const owner = plan.kind === "owner";
    const para = (n: number, label = "") => {
      const mention = mbti && n === 0 ? ` 입력해 주신 성향까지 함께 보면 ${plan.no}번 장의 모습이 다르게 나타날 수 있어요.` : "";
      const money = plan.no === 5 && label === "재물" ? " 돈 앞의 선택은 실제 AI가 근거를 읽고 조건과 함께 써요." : "";
      return `${M} 이 장(${plan.no}번)${label ? ` ${label} 소제목` : ""}의 ${ORD[n]} 문단을 쓰는 자리예요. ${plan.no}번 장의 ${ORD[n]} 문단은 실제 AI가 근거를 읽고 조건과 함께 이어서 써요.${money}${mention}`;
    };
    const base: Story7SectionDraft = {
      no: plan.no,
      headline: `${M} ${plan.title}`,
      evidence: owner ? [sajuId, ...personal, ...(mbti ? ["self.mbti"] : [])] : [],
    };
    if (plan.parts) return { ...base, parts: plan.parts.map((title, i) => ({ title, paragraphs: [para(i, title)] })) };
    if (plan.no === 6) {
      const years = payload.periods.filter((p) => p.ref.startsWith("y")).slice(0, 3);
      const periodIds = payload.periods.slice(0, 2).flatMap((p) => p.evidence.slice(0, 1));
      return {
        ...base,
        paragraphs: [para(0), para(1)],
        years: years.map((p) => ({ year: p.ref.slice(1), theme: `${M} ${p.label} 한 줄 자리` })),
        scenarios: [{ when: `${M} 지금의 모습이 그대로 이어지면`, then: "이어지는 전개를 가능성으로 쓰는 자리예요. 지금 모습이 이어지면 비슷하게 흘러갈 수 있어요." }],
        evidence: [saju[0].id, ...periodIds.slice(0, 1)],
      };
    }
    if (plan.no === 7 && payload.context) {
      return { ...base, paragraphs: [`${M} 알려 주신 고민(${payload.context.topic})을 반영하면, ${payload.context.focusGuide}을 중심으로 봐요. 실제 AI가 연결되면 이 자리에 앞 장의 결론이 만나는 곳의 우선순위가 들어와요.`] };
    }
    return { ...base, paragraphs: Array.from({ length: Math.min(plan.maxParagraphs, plan.no === 1 ? 3 : plan.kind === "owner" ? 2 : 1) }, (_, n) => para(n)) };
  });

  return {
    headline: `${M} 근거 안에서 쓴 통합 해석 초안`,
    cards: {
      strength: { keyword: `${M} 강점`, note: `${M} 내가 강한 포인트를 쓰는 자리예요.` },
      caution: { keyword: `${M} 주의`, note: `${M} 내가 힘들 수 있는 포인트를 쓰는 자리예요.` },
    },
    sections,
    actions: [
      { title: `${M} 첫 번째 상황에서`, detail: "확인할 것을 한 줄로 적어 두고, 모두 확인되면 다음으로 넘어가요.", evidence: [saju[0].id] },
      { title: `${M} 두 번째 상황에서`, detail: "마음에 걸리는 점을 한 가지만 짧게 묻고, 답을 기록해 둬요.", evidence: [saju[1 % saju.length].id] },
    ],
  };
}
