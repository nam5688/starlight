// 장면 질문(scenario-v1.ts)의 답을 리포트 AI가 받는 근거 목록으로 바꾼다 — 시험 · 스크립트에서만 쓴다. 화면 · 저장 · 실제 리포트 생성에는 연결하지 않았다.
//
// 운영자 결정(2026-10-16): 리포트 AI에는 "조합의 의미"만 넘기지 않는다. **실제 장면 · 고른 답 + 해석 후보 + 적용 조건 + 붙이면 안 되는 해석**을 함께 넘기고,
// 사용자 본문에서 고른 선택지를 그대로 되풀이하지 않는 것은 글쓰기 규칙(plan.ts의 ANSWER_ECHO)과 이 근거의 "쓰는 법"으로 막는다 — 근거를 빼서 막지 않는다.
//
// 구분 하나(D1~D5) = 근거 하나(id `scene.D4`). 두 장면 중 하나라도 선택지를 고르지 않았으면(거의 없었어요 · 맞는 선택지 없음 · 미응답) 그 구분의 근거는 만들지 않는다 —
// 사용자 글에 "자료 없음"을 쓰지 않고, 그 주제는 사주 근거로 풀이를 끝까지 쓴다. 점수 · 유형 이름 · 원인 확정은 근거에 없다.
import type { Evidence, Topic } from "../../report/evidence.ts";
import { readScenarios, SCENE_BY_ID, THREAD_BY_ID, type ScenarioAnswers, type ThreadId } from "./scenario-v1.ts";

/** 구분이 어느 주제 풀이의 재료가 되는가 */
const TOPICS: Record<ThreadId, Topic[]> = {
  D1: ["personality", "work"],
  D2: ["personality", "relationship"],
  D3: ["relationship", "love"],
  D4: ["love", "relationship"],
  D5: ["work", "personality"],
};

export const SCENE_RULE_VERSION = "scenario-evidence-0.1";

/**
 * "붙이면 안 되는 해석"에 적힌 애착 · 성격 유형 이름은 AI에 넘기지 않는다 — 금지 목록의 이름도 글에 끌려 나올 수 있다.
 * 문서(scenario-v1.ts)에는 무엇을 붙이면 안 되는지 분명히 적어 두고, AI에게는 "유형 이름"이라는 뜻만 준다.
 */
const TYPE_LABEL = /(?:안정|불안|회피|혼란|몰입|독립)형/g;
const plainNot = (text: string) => text.replace(TYPE_LABEL, "정해진 유형 이름");

/** 읽을 수 있는 구분마다 근거 하나. 읽을 수 없는 구분(해당 없음 · 선택지 없음 · 미응답)은 만들지 않는다. */
export function scenarioEvidence(answers: ScenarioAnswers): Evidence[] {
  const out: Evidence[] = [];
  for (const r of readScenarios(answers)) {
    if (r.kind !== "read") continue;
    const thread = THREAD_BY_ID[r.thread];
    const [a1, a2] = r.answered;
    const fact = `[${SCENE_BY_ID[a1.scene].label}] ${a1.plain}. [${SCENE_BY_ID[a2.scene].label}] ${a2.plain}.`;
    const cue = [
      `각 답이 그 장면에서 보여 주는 방식: (1) ${a1.shows}. (2) ${a2.shows}.`,
      `두 답을 함께 볼 때 읽을 수 있는 해석 후보(원인을 단정하지 않는 조건형): ${[...r.pattern.candidates, ...r.nuances].join(" ")}`,
      `쓰는 조건: ${r.pattern.needs ?? "사주 근거가 받쳐 줄 때만 후보를 쓰고, 받쳐 주지 않으면 두 답이 보여 주는 방식만 이 사람의 장면으로 푼다."}`,
      `사주와 짝지을 때: ${thread.sajuPairs.map((p) => `${p.cue}이면 ${p.effect}`).join(" / ")}.`,
      `붙이면 안 되는 해석: ${plainNot(r.pattern.notThis)} / ${plainNot(thread.notThis.join(" · "))}.`,
      "쓰는 법: 고른 말을 그대로 옮기거나 읽어 주지 말고, 사주에서 읽은 성향이 이 사람에게 나타나는 장면으로 풀어 쓴다. 한 답의 이유를 다른 답으로 확정하지 않는다.",
    ].join(" ");
    out.push({ id: `scene.${r.thread}`, source: "survey", topics: TOPICS[r.thread], strength: "moderate", fact, cue });
  }
  return out;
}

/** 지금 22문항에서 만든 응답 근거(source survey)를 빼고 장면 질문의 근거로 바꾼다 — 본인이 입력한 MBTI(self)와 사주 근거는 그대로 둔다. */
export function withScenarioEvidence(base: Evidence[], answers: ScenarioAnswers): Evidence[] {
  return [...base.filter((e) => e.source !== "survey"), ...scenarioEvidence(answers)];
}
