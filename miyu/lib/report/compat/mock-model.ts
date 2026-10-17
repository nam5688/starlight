// 사주 궁합 리포트의 모의 작성기 — 실제 AI를 부르지 않고, 받은 근거 목록의 ID로 형식 검사를 통과하는 초안을 만든다.
// 단위 테스트와 개발용 화면(/dev/compat)에서만 쓴다. 문장은 근거를 풀어 쓴 글이 아니라 자리 표시이며 "[모의 생성]"이 붙는다 — 판매할 수 없는 글이다.
// 사주 궁합은 6번(view)을 뺀 여섯 장, 리포트 궁합(payload.mode가 pair)은 일곱 장을 모두 만든다(검사와 같은 규칙). 근거 목록에 compat.timing.* · compat.fortify · compat.chart · pair.*가 있으면 맡은 장이 그 근거를 단다.
import { compatFortifyElementsOf } from "../../saju/interpret/compat-extra.ts";
import { ELEMENT_FORTUNE } from "../../saju/interpret/fortune.ts";
import { COMPAT_STEP_GROUPS, pairSectionsFor, sectionsFor } from "./plan.ts";
import type { CompatDraftV1, CompatStepDraft } from "./types.ts";

type MockPayload = { mode?: string; evidence: { id: string; fact: string; uncertain?: boolean }[] };

const M = "[모의 생성]";

/** 자리 표시 문장 — 서로 겹치는 토막이 없게 따로따로 쓴 것(실제 풀이가 아니다) */
const FILLERS = [
  "여기에는 실제 AI가 근거를 읽고 두 사람이 함께 있는 장면부터 풀어 쓰게 돼요.",
  "이 자리는 사주의 관계 근거를 쉬운 말로 옮긴 조건형 문장으로 채워져요.",
  "작성기가 연결되면 이곳에 한 가지 이유와 그 이유가 만드는 하루의 모습이 들어가요.",
  "지금은 모양만 보여 주는 칸이라서 읽을 내용이 아니에요.",
  "이 문단이 실제 글이 되면 부딪히기 쉬운 순간과 그때 쓸 수 있는 말투가 이어져요.",
  "사주 용어는 뒤쪽 문단에서만 풀이와 함께 등장하도록 비워 둔 자리예요.",
  "근거 목록에 있는 계산 결과만 골라서 쓰는 칸으로, 아직 비어 있어요.",
  "두 분이 서로의 속도를 알아차리는 장면이 들어오게 될 문단이에요.",
  "한쪽이 먼저 움직이고 다른 쪽이 확인하는 모습은 실제 글에서 구체적으로 적혀요.",
  "이 칸은 시험을 위해 만든 임시 문장이며 판매하는 글에 쓰이지 않아요.",
  "표현 방식의 차이가 오해로 번지는 순간을 짚는 자리로 남겨 둬요.",
  "장기적으로 편안해지는 조건은 실제 풀이에서 근거와 함께 설명돼요.",
  "이어지는 줄에는 조율 방법과 건넬 말이 사람 손으로 확인된 뒤 들어가요.",
  "자리 표시이므로 어떤 사실이나 성격도 이 문장에서 읽어 낼 수 없어요.",
  "시기와 관련된 안내는 시기 근거가 목록에 있을 때만 별도 영역에 적혀요.",
  "여기서는 합과 충을 길흉으로 가르지 않는 설명이 나올 예정이에요.",
  "일상 속 작은 약속을 정하는 방법이 실제 글에서 한 가지씩 제안돼요.",
  "비교한 응답 방향이 있다면 같은 쪽 또는 다른 쪽으로 풀어 쓰는 칸이에요.",
  "지어낸 사건이나 인물 없이 근거 안에서만 쓰도록 만든 안내 칸이에요.",
  "이 문장은 형식 검사를 통과시키기 위해 길이만 맞춘 안내 문구예요.",
  "읽는 분이 자신의 상황에 맞춰 해 볼 만한 행동으로 마무리되는 자리예요.",
  "두 사람 중 누구의 탓도 아닌 방식의 차이를 설명하는 문단이 놓여요.",
  "화면에서는 이 칸이 모의 작성기의 결과임을 따로 알려 줘요.",
  "실제 글에서는 한 문단마다 하나의 연결만 풀어 쓰도록 되어 있어요.",
  "마지막 칸에는 건네 볼 말 한 문장과 함께 상황이 정리돼요.",
  "개발 중에는 이렇게 서로 다른 안내 문장으로 자리를 채워 둬요.",
  "조건을 붙인 예측과 공감이 들어올 수 있는 여유를 남겨 둔 문단이에요.",
  "근거가 약한 부분은 늘려 쓰지 않고 짧게 다루도록 정해져 있어요.",
  "작성기가 바뀌어도 이 칸의 모양과 길이는 같은 규칙으로 검사돼요.",
  "여기에 적힌 내용은 모두 시험용이므로 두 사람과 관계가 없어요.",
  "영역마다 서로 다른 연결을 앞세우는 규칙도 이 칸에서 확인돼요.",
  "맨 끝 줄은 실제 글에서 두 사람이 함께 정해 볼 일로 이어져요.",
  "이 영역의 본문은 승인된 시험이 끝난 다음에야 실제 모델이 쓰게 돼요.",
];
const filler = (i: number) => FILLERS[i % FILLERS.length];

export function composeMockCompat(userMessage: string): CompatDraftV1 {
  const payload = JSON.parse(userMessage.slice(userMessage.indexOf("{"))) as MockPayload;
  const usable = payload.evidence.filter((e) => !e.uncertain).map((e) => e.id);
  const pair = payload.mode === "pair";
  const timingIds = usable.filter((id) => id.startsWith("compat.timing."));
  const pairIds = usable.filter((id) => id.startsWith("pair.") && id !== "pair.mbti");
  const baseIds = usable.filter((id) => !id.startsWith("compat.timing.") && !id.startsWith("pair.") && id !== "compat.chart" && id !== "compat.fortify");
  const hasChart = usable.includes("compat.chart");
  const hasFortify = usable.includes("compat.fortify");
  const pick = (i: number, n = 2) => Array.from({ length: n }, (_, k) => baseIds[(i + k) % baseIds.length]);

  let next = 0; // 문단마다 서로 다른 자리 표시 문장 둘을 이어 쓴다(풀이 34문장 = 문단 17개까지 겹치지 않는다)
  // 개운 문단 자리 — 근거(compat.fortify)에 적힌 보완 후보 기운의 대응(방향 · 색 · 숫자 · 장소)을 그대로 옮긴 자리 표시(실제 AI가 이 자리를 풀어 쓴다)
  const fortuneElement = compatFortifyElementsOf(payload.evidence.map((e) => ({ id: e.id, fact: e.fact, uncertain: e.uncertain })))[0];
  const ff = fortuneElement ? ELEMENT_FORTUNE[fortuneElement] : null;
  const fortuneText = ff ? `${M} 개운 문단 자리예요. 방향은 ${ff.direction}, 색은 ${ff.colors[0]}, 숫자는 ${ff.numbers[0]}과 ${ff.numbers[1]}, 장소는 ${ff.places[0]}처럼 실제 AI가 근거를 읽고 풀어 써요.` : null;
  const sections = (pair ? pairSectionsFor(payload.evidence) : sectionsFor(payload.evidence)).map((plan, i) => ({
    id: plan.id,
    headline: `모의 결론 ${i + 1}번째 자리예요`,
    // 자리 표시 글이라도 같은 문장 틀이 영역마다 되풀이되지 않게 문단마다 서로 다른 자리 표시 문장을 쓴다
    paragraphs: plan.id === "advice" && fortuneText ? [fortuneText] : Array.from({ length: plan.paragraphs.min }, () => `${filler(next++)} ${filler(next++)} ${M}`),
    evidence:
      plan.id === "harmony" ? [...(hasChart ? ["compat.chart"] : []), ...pick(i, 1)]
      : plan.id === "love" ? [...pick(i, 1), ...timingIds.slice(0, 1)]
      : plan.id === "view" ? [...(pairIds.length ? pairIds : []), ...pick(i, 1)]
      : plan.id === "advice" ? [...(hasFortify ? ["compat.fortify"] : []), ...pick(i, 1)]
      : pick(i),
  }));

  const stepBodies: Record<string, { title: string; detail: string; say: string }> = {
    aToB: { title: `${M} 확인이 필요해 보일 때`, detail: "한 번 더 확인하고 싶어 하는 쪽의 속도를 기다리며 필요한 것을 먼저 물어봐요.", say: "천천히 정해도 괜찮아요, 필요한 걸 말해 줘요" },
    bToA: { title: `${M} 먼저 움직이고 싶을 때`, detail: "바로 움직이고 싶은 쪽에 생각하는 시간이 필요하다는 사실을 짧게 알려 줘요.", say: "잠깐 생각하고 답할게요, 곧 말해 줄게요" },
    together: { title: `${M} 약속을 정할 때`, detail: "서로 편한 연락 방식과 속도를 한 줄씩 적어 두고 같이 읽어 봐요.", say: "우리가 편한 방식을 한 줄씩 적어 봐요" },
  };
  const steps = Object.fromEntries(
    COMPAT_STEP_GROUPS.map((g, i): [string, CompatStepDraft[]] => [g.id, [{ ...stepBodies[g.id], evidence: pick(i + 1, 1) }]]),
  ) as CompatDraftV1["steps"];

  return {
    headline: `${M} 두 사람의 근거 안에서 쓴 풀이 초안`,
    sections,
    steps,
    questions: [`${M} 요즘 어떤 방식이 서로에게 편한지 물어봐 줄래요?`, `${M} 함께 정해 두면 좋을 약속이 있을까요?`],
  };
}
