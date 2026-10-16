// 장면 질문 테스트 화면(/dev/scenario)의 순수 규칙 — 입력 확인 · 읽힌 구분 요약 · 저장된 시험 글 찾기. 화면 · 저장 · 실제 리포트 생성에는 연결하지 않았다(이 PC의 개발 화면에서만 쓴다).
// 응답은 점수로 바꾸지 않는다. 사주 계산이나 저장된 회원 결과를 바꾸지 않는다. 가상 인물 또는 직접 넣은 생일(저장하지 않음)만 쓴다.
import { SCENARIO_CASES, type ScenarioCase } from "./scenario-cases.ts";
import { scenarioEvidence } from "./scenario-evidence.ts";
import { readScenarios, SCENE_BY_ID, SCENES, THREAD_BY_ID, THREADS, type ScenarioAnswers, type SceneAnswer, type SceneId } from "./scenario-v1.ts";

export type LabPerson =
  | { kind: "seoyun" }
  | { kind: "p01" }
  | { kind: "own"; year: number; month: number; day: number; time: string | null; gender: "female" | "male" };

export type LabInput = { person: LabPerson; mbti: string | null; answers: ScenarioAnswers };

const SCENE_IDS = new Set<string>(SCENES.map((s) => s.id));
const ANSWER_IDS = new Set(["a", "b", "c", "d", "x", "y"]);
const MBTI = /^[EI][NS][TF][JP]$/;

/** 화면에서 온 값을 확인한다 — 알 수 없는 값은 버리지 않고 거절한다(조용히 다른 답으로 바꾸지 않는다) */
export function parseLabInput(raw: unknown): { ok: true; value: LabInput } | { ok: false; reason: string } {
  const r = raw as { person?: Record<string, unknown>; mbti?: unknown; answers?: Record<string, unknown> } | null;
  if (!r || typeof r !== "object") return { ok: false, reason: "입력 형식이 맞지 않아요" };
  const answers: ScenarioAnswers = {};
  for (const [k, v] of Object.entries(r.answers ?? {})) {
    if (!SCENE_IDS.has(k)) return { ok: false, reason: `알 수 없는 장면 ${k}` };
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string" || !ANSWER_IDS.has(v)) return { ok: false, reason: `${k}: 알 수 없는 답 ${String(v)}` };
    answers[k as SceneId] = v as SceneAnswer;
  }
  const mbti = typeof r.mbti === "string" && r.mbti.trim() ? r.mbti.trim().toUpperCase() : null;
  if (mbti && !MBTI.test(mbti)) return { ok: false, reason: "MBTI는 네 글자(예: INFJ)로 적어 주세요" };
  const p = r.person ?? {};
  if (p.kind === "seoyun" || p.kind === "p01") return { ok: true, value: { person: { kind: p.kind }, mbti, answers } };
  if (p.kind === "own") {
    const year = Number(p.year);
    const month = Number(p.month);
    const day = Number(p.day);
    const gender = p.gender === "male" ? "male" : p.gender === "female" ? "female" : null;
    const time = typeof p.time === "string" && p.time.trim() ? p.time.trim() : null;
    if (!Number.isInteger(year) || year < 1930 || year > 2025) return { ok: false, reason: "출생 연도를 1930~2025 사이로 적어 주세요" };
    if (!Number.isInteger(month) || month < 1 || month > 12) return { ok: false, reason: "출생 월을 확인해 주세요" };
    if (!Number.isInteger(day) || day < 1 || day > 31) return { ok: false, reason: "출생 일을 확인해 주세요" };
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, reason: "시각은 08:40처럼 적어 주세요(모르면 비워 두세요)" };
    if (!gender) return { ok: false, reason: "성별(여성 · 남성)을 골라 주세요" };
    return { ok: true, value: { person: { kind: "own", year, month, day, time, gender }, mbti, answers } };
  }
  return { ok: false, reason: "누구의 사주로 볼지 골라 주세요" };
}

export type LabThread = { id: string; name: string; scenes: string[]; status: "read" | "hold"; reading: string; missing: string[] };

/** 읽힌 구분 · 읽지 못한 구분 — 사용자가 고른 선택지의 사실과, 읽지 못한 이유(어느 장면이 비었나)만 보여 준다 */
export function labThreads(answers: ScenarioAnswers): LabThread[] {
  return readScenarios(answers).map((r) => {
    const t = THREAD_BY_ID[r.thread];
    const scenes = t.scenes.map((s) => SCENE_BY_ID[s].label);
    if (r.kind === "read") return { id: r.thread, name: t.name, scenes, status: "read", reading: r.answered.map((a) => a.plain).join(" / "), missing: [] };
    return { id: r.thread, name: t.name, scenes, status: "hold", reading: "", missing: r.missing.map((s) => SCENE_BY_ID[s].label) };
  });
}

/** 리포트 AI가 받는 응답 근거(구분마다 하나) — 읽을 수 없는 구분은 만들지 않는다 */
export const labEvidence = (answers: ScenarioAnswers) => scenarioEvidence(answers).map((e) => ({ id: e.id, fact: e.fact, cue: e.cue }));

export const labAnsweredCount = (answers: ScenarioAnswers) => SCENES.filter((s) => ["a", "b", "c", "d"].includes(String(answers[s.id]))).length;
export const labThreadCount = THREADS.length;

const same = (a: ScenarioAnswers, b: ScenarioAnswers) => SCENES.every((s) => (a[s.id] ?? undefined) === (b[s.id] ?? undefined));

/** 가상 인물 + 같은 응답이면 저장된 시험 글(대리 작성기가 쓴 글)이 있다 — 사례 키를 돌려준다. 같은 입력의 R은 X와 같은 응답이라 X를 먼저 돌려준다 */
export function savedCaseFor(input: LabInput): ScenarioCase | null {
  if (input.person.kind === "own") return null;
  const who = input.person.kind;
  return SCENARIO_CASES.find((c) => c.who === who && c.mbti === (input.mbti ?? "INFJ") && same(c.answers, input.answers)) ?? null;
}

/** 화면의 "이 응답으로 채우기" 단추 — 저장된 시험 사례의 응답 */
export const LAB_PRESETS = [
  { key: "X", label: "기준 응답(X)" },
  { key: "Y", label: "다른 응답(Y)" },
  { key: "H", label: "일부 없는 응답(H) — 거의 없었어요 · 선택지 없음 · 미응답 섞임" },
] as const;
