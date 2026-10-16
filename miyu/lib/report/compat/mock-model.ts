// 사주 궁합 리포트의 모의 작성기 — 실제 AI를 부르지 않고, 받은 근거 목록의 ID로 형식 검사를 통과하는 초안을 만든다.
// 단위 테스트와 개발용 화면(/dev/compat)에서만 쓴다. 문장은 근거를 풀어 쓴 글이 아니라 자리 표시이며 "[모의 생성]"이 붙는다 — 판매할 수 없는 글이다.
import { COMPAT_SECTIONS } from "./plan.ts";
import type { CompatDraftV1 } from "./types.ts";

type MockPayload = { evidence: { id: string; uncertain?: boolean }[] };

const M = "[모의 생성]";
const ORD = ["첫 번째", "두 번째", "세 번째"];

export function composeMockCompat(userMessage: string): CompatDraftV1 {
  const payload = JSON.parse(userMessage.slice(userMessage.indexOf("{"))) as MockPayload;
  const ids = payload.evidence.filter((e) => !e.uncertain).map((e) => e.id);
  const pick = (i: number, n = 2) => Array.from({ length: n }, (_, k) => ids[(i + k) % ids.length]);

  const sections = COMPAT_SECTIONS.map((plan, i) => ({
    id: plan.id,
    headline: `${plan.topic}의 모의 결론 ${i + 1}번째입니다`,
    paragraphs: Array.from({ length: plan.paragraphs.min }, (_, n) => `${M} ${plan.topic}의 ${ORD[n]} 문단을 쓰는 자리입니다. ${plan.topic}의 ${ORD[n]} 문단은 실제 AI가 두 사람의 근거를 읽고 조건과 함께 이어서 씁니다.`),
    evidence: pick(i),
  }));
  const areas = ["fit", "friction", "love"] as const;
  return {
    headline: `${M} 두 사람의 근거 안에서 쓴 풀이 초안`,
    sections,
    actions: areas.map((area, i) => ({
      title: `${M} ${ORD[i]} 상황에서`,
      detail: ["서로에게 바라는 것을 한 줄씩 적어 두고 같이 읽어 봅니다.", "마음에 걸린 점을 한 가지만 짧게 묻고 답을 기록해 둡니다.", "함께 하는 일의 속도를 정해서 서로에게 말해 둡니다."][i],
      area,
      evidence: pick(i + 1, 1),
    })),
  };
}
