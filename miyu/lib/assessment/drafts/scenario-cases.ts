// 장면 질문의 실제 생성 경로 시험 사례 — 같은 사주 + 다른 응답 · 다른 사주 + 같은 응답 · 일부 응답만 변경 · 해당 없음 · 선택지 없음 · 미응답.
// 가상 인물만 쓴다(실제 고객 정보 없음). 사주는 엔진이 계산하고, 응답 근거는 22문항이 아니라 장면 질문(scenario-v1.ts)으로 만든다.
// 이 사례로 만든 근거 목록에 대해 대리 작성기(AI 하위 작업자)가 쓴 초안을 docs/samples/scenario-generation/에 저장하고, scenario-generation.test.ts가 제품 검사로 확인한다.
import { buildEvidence } from "../../report/ai/generator.ts";
import { buildPersonas } from "../../report/ai/compare-personas.ts";
import type { Evidence } from "../../report/evidence.ts";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import { sampleReport } from "../../samples/sample-report.ts";
import type { ScenarioAnswers } from "./scenario-v1.ts";
import { withScenarioEvidence } from "./scenario-evidence.ts";

export const SCENARIO_REFERENCE = { year: 2026, month: 10 };
export const SCENARIO_REFERENCE_DATE = "2026-10-16";

export type ScenarioCase = {
  key: "X" | "Y" | "Z" | "W" | "H" | "V" | "R";
  title: string;
  /** 어느 가상 인물의 사주인가 */
  who: "seoyun" | "p01";
  mbti: string;
  answers: ScenarioAnswers;
  /** 이 사례로 무엇을 확인하나 */
  checks: string;
};

/** 서윤의 기준 응답 — S1 틀 먼저 · S2 빈 곳을 채움 · S3 먼저 해 보고 부탁 · S4 정리된 뒤 · S5 근거부터 · S6 이해받음 · S7 평소처럼 · S8 기대를 낮춤 · S9 내 기준 · S10 부담이 몰림 */
const X_ANSWERS: ScenarioAnswers = { S1: "b", S2: "d", S3: "d", S4: "b", S5: "a", S6: "a", S7: "a", S8: "c", S9: "d", S10: "b" };
/** Y의 응답 — X와 모든 구분이 다르다(S7 평소처럼 · S10 부담이 몰림만 같다) */
const Y_ANSWERS: ScenarioAnswers = { S1: "a", S2: "b", S3: "a", S4: "c", S5: "d", S6: "d", S7: "a", S8: "a", S9: "a", S10: "b" };

export const SCENARIO_CASES: ScenarioCase[] = [
  { key: "X", title: "서윤 · 기준 응답", who: "seoyun", mbti: "INFJ", answers: X_ANSWERS, checks: "기준이 되는 글 — 다른 사례와 비교하는 바탕" },
  {
    key: "Y",
    title: "서윤 · 같은 사주 + 다른 응답",
    who: "seoyun",
    mbti: "INFJ",
    answers: Y_ANSWERS,
    checks: "같은 사주에서 응답만 달라질 때 풀이의 장면이 달라지는가 — S7 평소처럼과 S10 부담이 몰림은 X와 같아 같은 답이 다른 짝과 어떻게 달리 읽히는지도 본다",
  },
  {
    key: "Z",
    title: "서윤 · 일부 응답만 변경",
    who: "seoyun",
    mbti: "INFJ",
    answers: { ...X_ANSWERS, S8: "a" },
    checks: "X에서 S8 하나(기대를 낮춤 → 말로 꺼냄)만 바꿨을 때, 연락 · 기대에 관한 풀이만 달라지고 일 · 돈 · 도움 풀이가 뒤집히지 않는가",
  },
  {
    key: "V",
    title: "서윤 · 첫 반응만 변경(혼자 정리할 시간은 같음)",
    who: "seoyun",
    mbti: "INFJ",
    answers: { ...Y_ANSWERS, S5: "a" },
    checks: "Y에서 S5 하나(먼저 한 발 물러남 → 이유부터 말함)만 바꿨을 때, 풀리는 데 도움이 되는 것(S6 혼자 정리할 시간)이 같아도 의견이 갈린 뒤의 풀이가 달라지는가 — 같은 \"혼자 정리할 시간\"에 첫 반응이 다르면 다른 풀이여야 한다(C3.4)",
  },
  {
    key: "R",
    title: "서윤 · 기준 응답을 독립으로 다시 씀(같은 입력)",
    who: "seoyun",
    mbti: "INFJ",
    answers: X_ANSWERS,
    checks: "X와 입력이 완전히 같다 — 작성기가 같은 입력을 두 번 독립으로 썼을 때 글이 얼마나 다른가(글자 겹침의 바닥). 응답이나 사주가 달라서 생긴 차이와 쓰는 사람이 달라서 생긴 차이를 가르는 기준",
  },
  { key: "W", title: "다른 사주 + 같은 응답", who: "p01", mbti: "INFJ", answers: X_ANSWERS, checks: "서윤과 같은 응답 X를 다른 사주(P01)에 붙였을 때 사주 근거가 달라진 만큼 해석의 중심도 달라지는가" },
  {
    key: "H",
    title: "서윤 · 거의 없었어요 · 선택지 없음 · 미응답",
    who: "seoyun",
    mbti: "INFJ",
    answers: { S1: "b", S2: "x", S3: "y", S4: undefined, S5: "a", S6: "a", S7: "x", S8: "a", S9: "y", S10: "b" },
    checks: "해당 없음 · 선택지 없음 · 미응답이 있어도 그 구분을 임의 성향으로 채우지 않고, 본문에 자료 없음 문장 없이 확보된 사주 근거로 풀이를 완결하는가",
  },
];

/** 사례의 근거 목록 — 사주 근거 + 본인 입력 MBTI + 장면 질문의 근거(22문항 응답 근거는 쓰지 않는다) */
export function scenarioCaseEvidence(c: ScenarioCase): Evidence[] {
  if (c.who === "seoyun") {
    const saju = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" });
    if (saju.status !== "ok") throw new Error("서윤 사주 계산 실패");
    return withScenarioEvidence(buildEvidence({ knownMbti: c.mbti, summary: sampleReport, saju, gender: "female" } as never, SCENARIO_REFERENCE), c.answers);
  }
  const p01 = buildPersonas(2)[0]!;
  return withScenarioEvidence(buildEvidence({ saju: p01.input.saju, gender: p01.input.gender, summary: p01.input.summary, knownMbti: c.mbti }, SCENARIO_REFERENCE), c.answers);
}
