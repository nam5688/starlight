// 궁합 실제 AI 시험의 계획 — 가상 인물 입력 · 호출 없이 입력 크기와 최악 비용 재기 · 승인 범위 확인. 순수 계산이라 호출하지 않는다(실행은 scripts/run-compat-live.ts).
// 입력은 모두 가상 인물이다(실제 고객 정보 금지). 비용은 환율 · 여유율 가정으로 센 어림이며 실제 청구는 제공사 콘솔에서 확인한다.
import type { CompatLiveStageDef } from "../../config/ai-candidates.ts";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import type { SajuOk } from "../../saju/engine.ts";
import { buildPersonas } from "../ai/compare-personas.ts";
import { createAiReportGenerator } from "../ai/generator.ts";
import { estimateInputTokens, worstCaseKrw, costKrw, type BudgetSettings, type ModelPrice } from "../ai/budget.ts";
import { createMockModel } from "../ai/mock-model.ts";
import type { CompatInput, PairInput } from "../generator.ts";
import { COMPAT_WRITE_LIMITS } from "./writer.ts";

/** 시기를 읽는 기준 시점 — 시험 글이 날짜에 따라 달라지지 않게 고정한다 */
export const LIVE_REFERENCE = { year: 2026, month: 10 } as const;

const sajuOf = (y: number, m: number, d: number, time: string | null, gender: "male" | "female"): SajuOk => {
  const r = calculateSaju({ year: y, month: m, day: d, calendar: "solar", isLeapMonth: false, birthTime: time, gender });
  if (r.status !== "ok") throw new Error("가상 인물의 사주를 계산하지 못했습니다.");
  return r as SajuOk;
};

/** 사주 궁합 시험 입력 — 가상 쌍 C1(개발용 화면 /dev/compat과 같은 쌍) */
export const liveCompatInput = (): CompatInput => ({ names: { a: "슬기", b: "남수" }, a: sajuOf(1996, 3, 29, "09:30", "female"), b: sajuOf(1994, 11, 2, "09:30", "male"), reference: { ...LIVE_REFERENCE } });

/** 리포트 궁합 시험 입력 — 비교 시험의 가상 인물 P01 · P02(사주 + 개발용 문항 응답 요약). 이름 · 생년월일 원문은 AI에 가지 않는다 */
export function livePairInput(): PairInput {
  const [p1, p2] = buildPersonas(2);
  const person = (p: (typeof p1)) => ({ saju: p.input.saju as SajuOk, summary: p.input.summary, knownMbti: p.input.knownMbti });
  return { a: person(p1), b: person(p2), reference: { ...LIVE_REFERENCE } };
}

export type LiveEstimate = {
  inputTokens: number;
  /** 첫 호출 하나의 최악(출력 최대) */
  firstWorstKrw: number;
  /** 고쳐 쓰기 호출 하나의 최악 — 첫 초안(출력 최대)이 입력에 다시 들어간다 */
  rewriteWorstKrw: number;
  /** 한 번 실행이 생성 1회 + 고쳐 쓰기 1회까지 가는 최악 */
  twoRoundWorstKrw: number;
  /** 평소 수준(재지 않은 어림: 입력이 추정의 절반 · 출력 5천 토큰) */
  typicalKrw: number;
  systemChars: number;
  userChars: number;
};

/** 호출하지 않고 실제 요청의 크기를 잰다 — 모의 모델에 같은 요청을 보내 시스템 지시문과 사용자 메시지를 받아 센다 */
export async function estimateLiveRun(kind: "saju" | "pair", price: ModelPrice, settings: Pick<BudgetSettings, "fxKrwPerUsd" | "surcharge">): Promise<LiveEstimate> {
  const seen: { system: string; user: string }[] = [];
  const mock = createMockModel();
  const recorder = { provider: mock.provider, model: mock.model, async complete(req: Parameters<typeof mock.complete>[0]) { seen.push({ system: req.system, user: req.messages.map((m) => m.content).join("\n") }); return mock.complete(req); } };
  const gen = createAiReportGenerator({ model: recorder, now: () => new Date("2026-10-17T00:00:00Z"), sleep: async () => {} });
  if (kind === "saju") await gen.generateCompat!(liveCompatInput());
  else await gen.generatePair!(livePairInput());
  const first = seen[0];
  if (!first) throw new Error("요청의 크기를 잴 수 없었습니다.");
  const inputTokens = estimateInputTokens([first.system, first.user]);
  const out = COMPAT_WRITE_LIMITS.maxOutputTokens;
  const firstWorst = worstCaseKrw(price, { inputTokens, maxOutputTokens: out }, settings);
  // 고쳐 쓰기 입력 = 첫 입력 + 첫 응답 + 고쳐 쓰기 안내 약 400토큰. 승인 가드는 한글을 글자당 2토큰으로 보수적으로 세므로 첫 응답을 출력 최대의 두 배로 잡는다(실제 응답은 보통 이보다 훨씬 짧다)
  const rewriteWorst = worstCaseKrw(price, { inputTokens: inputTokens + out * 2 + 400, maxOutputTokens: out }, settings);
  const typical = costKrw(price, { inputTokens: Math.round(inputTokens / 2), outputTokens: 5000 }, settings);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { inputTokens, firstWorstKrw: r2(firstWorst), rewriteWorstKrw: r2(rewriteWorst), twoRoundWorstKrw: r2(firstWorst + rewriteWorst), typicalKrw: r2(typical), systemChars: first.system.length, userChars: first.user.length };
}

/** 승인 범위 확인 — 어긋나면 이유 목록(드라이런에서도 보인다). 비어 있으면 통과 */
export function checkCompatLiveRestriction(stage: CompatLiveStageDef, ctx: { alreadySpentGiven: boolean; twoRoundWorstKrw: number; execute: boolean }): string[] {
  const issues: string[] = [];
  if (!ctx.alreadySpentGiven) issues.push("--already-spent-krw(같은 승인 총액에서 이미 쓴 금액)를 적어야 합니다 — 빠뜨리면 총액을 처음부터 쓰는 것처럼 계산됩니다.");
  const r = stage.restrict;
  if (ctx.execute) {
    if (r.runsApproved <= r.runsDone) issues.push(r.runsApproved === 0 ? "이 시험은 아직 운영자 승인이 없습니다(승인된 실행 0회). 운영자가 모델 · 호출 수 · 최대 비용을 정해 승인한 뒤에만 실행합니다." : `승인된 ${r.runsApproved}회를 모두 마쳤습니다${r.lastRun ? ` (${r.lastRun})` : ""} — 새 실행은 운영자가 다시 승인해야 합니다.`);
    if (!(r.runCeilingKrw > 0)) issues.push("1회 실행 상한(원)이 정해지지 않았습니다 — 승인 때 운영자가 정합니다.");
  }
  if (r.runCeilingKrw > 0 && ctx.twoRoundWorstKrw > r.runCeilingKrw) issues.push(`생성 + 고쳐 쓰기까지 가는 최악 비용 ${ctx.twoRoundWorstKrw}원이 승인한 상한 ${r.runCeilingKrw}원을 넘습니다. 실행하지 않고 운영자가 상한을 다시 확인해야 합니다.`);
  return issues;
}
