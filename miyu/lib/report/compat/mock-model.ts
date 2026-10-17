// 사주 궁합 리포트의 모의 작성기 — 실제 AI를 부르지 않고, 받은 근거 목록의 ID로 형식 검사를 통과하는 초안을 만든다.
// 단위 테스트와 개발용 화면(/dev/compat)에서만 쓴다. 문장은 근거를 풀어 쓴 글이 아니라 자리 표시이며 "[모의 생성]"이 붙는다 — 판매할 수 없는 글이다.
// 근거 목록에 compat.timing.*이 있으면 timing 영역까지, 없으면 다섯 영역만 만든다(검사와 같은 규칙). 리포트 궁합(payload.mode가 pair)은 비교한 응답 근거(pair.*)가 있을 때 응답 영역을 더한다.
import { COMPAT_STEP_GROUPS, pairSectionsFor, sectionsFor } from "./plan.ts";
import type { CompatDraftV1, CompatStepDraft } from "./types.ts";

type MockPayload = { mode?: string; evidence: { id: string; uncertain?: boolean }[] };

const M = "[모의 생성]";
const ORD = ["첫 번째", "두 번째", "세 번째"];

export function composeMockCompat(userMessage: string): CompatDraftV1 {
  const payload = JSON.parse(userMessage.slice(userMessage.indexOf("{"))) as MockPayload;
  const usable = payload.evidence.filter((e) => !e.uncertain).map((e) => e.id);
  const pair = payload.mode === "pair";
  const timingIds = usable.filter((id) => id.startsWith("compat.timing."));
  const pairIds = usable.filter((id) => id.startsWith("pair.") && id !== "pair.mbti");
  const baseIds = usable.filter((id) => !id.startsWith("compat.timing.") && !id.startsWith("pair."));
  const pick = (i: number, n = 2) => Array.from({ length: n }, (_, k) => baseIds[(i + k) % baseIds.length]);

  const sections = (pair ? pairSectionsFor(payload.evidence) : sectionsFor(payload.evidence)).map((plan, i) => ({
    id: plan.id,
    headline: `${plan.topic}의 모의 결론 ${i + 1}번째입니다`,
    paragraphs: Array.from({ length: plan.paragraphs.min }, (_, n) => `${M} ${plan.topic}의 ${ORD[n]} 문단을 쓰는 자리입니다. ${plan.topic}의 ${ORD[n]} 문단은 실제 AI가 두 사람의 근거를 읽고 조건과 함께 이어서 씁니다.`),
    evidence: plan.id === "timing" ? timingIds : plan.id === "response" ? pairIds : pick(i),
  }));

  const stepBodies: Record<string, { title: string; detail: string; say: string }> = {
    aToB: { title: `${M} 확인이 필요해 보일 때`, detail: "한 번 더 확인하고 싶어 하는 쪽의 속도를 기다리며 필요한 것을 먼저 물어봅니다.", say: "천천히 정해도 괜찮아요, 필요한 걸 말해 줘요" },
    bToA: { title: `${M} 먼저 움직이고 싶을 때`, detail: "바로 움직이고 싶은 쪽에 생각하는 시간이 필요하다는 사실을 짧게 알려 줍니다.", say: "잠깐 생각하고 답할게요, 곧 말해 줄게요" },
    together: { title: `${M} 약속을 정할 때`, detail: "서로 편한 연락 방식과 속도를 한 줄씩 적어 두고 같이 읽어 봅니다.", say: "우리가 편한 방식을 한 줄씩 적어 봐요" },
  };
  const steps = Object.fromEntries(
    COMPAT_STEP_GROUPS.map((g, i): [string, CompatStepDraft[]] => [g.id, [{ ...stepBodies[g.id], evidence: pick(i + 1, 1) }]]),
  ) as CompatDraftV1["steps"];

  return {
    headline: `${M} 두 사람의 근거 안에서 쓴 풀이 초안`,
    sections,
    steps,
  };
}
