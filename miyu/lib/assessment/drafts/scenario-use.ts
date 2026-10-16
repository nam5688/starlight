// 장면 질문의 답 → 제품 검사 answer-use.ts의 입력 — 시험 · 테스트 화면에서만 쓴다(실제 리포트 생성에는 연결하지 않았다).
//
// 어떤 선택지를 "고른 것"으로 세는가: **읽힌 구분(두 장면 모두 선택지를 고른 구분)의 선택지만** 고른 것으로 본다.
// 한 장면만 답한 구분은 읽을 수 없어(근거가 만들어지지 않는다) 그 답을 근거로 삼아 쓰면 INVENTED가 된다 — 읽을 수 없는 구분의 장면 행동은 사실처럼 쓰지 않는다는 규칙과 같다.
import type { AnswerUseInput } from "../../report/reading/answer-use.ts";
import { OPTION_CUES, THREAD_SITUATION, THREAD_TOPIC } from "./scenario-cues.ts";
import { SCENES, readScenarios, type ScenarioAnswers, type ThreadId } from "./scenario-v1.ts";

export function scenarioAnswerUse(answers: ScenarioAnswers): AnswerUseInput {
  const readings = readScenarios(answers);
  const readable = new Set<ThreadId>(readings.filter((r) => r.kind === "read").map((r) => r.thread));
  const options = SCENES.flatMap((s) =>
    s.options.map((o) => ({
      scene: s.id,
      label: s.label,
      chosen: readable.has(s.thread) && answers[s.id] === o.id,
      texts: [o.text, o.plain, o.shows],
      cues: OPTION_CUES[`${s.id}.${o.id}`] ?? [],
    })),
  );
  const threads = (Object.keys(THREAD_TOPIC) as ThreadId[]).map((id) => ({ id, evidenceId: `scene.${id}`, readable: readable.has(id), topic: THREAD_TOPIC[id], situation: THREAD_SITUATION[id] }));
  return { options, threads };
}
