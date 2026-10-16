// 개발용 — 사주 궁합 리포트(compat-v1)를 가상 인물 세 쌍으로 읽는다. 공개 배포에서는 쓰지 않는다(화면이 production에서 notFound).
// 글은 두 가지다: ① docs/samples/compat-v1-proxy/prompt-0.2/<쌍>-first-response.json — 시험용 대리 작성기(AI 하위 작업자)가 지시문 0.2와 근거만으로 쓴 첫 글. 읽을 때마다 제품 검사를 다시 거쳐 통과하지 못하면 보여 주지 않고 이유를 알린다.
// ② 저장된 글이 없으면 모의 작성기의 자리 표시 글("판매할 수 없는 글"). 실제 서비스 AI는 한 번도 부르지 않았다. 입력은 가상 인물이며 아무것도 저장하지 않는다.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { calculateSaju } from "@/lib/saju/manseryeok-engine";
import { compatOf } from "@/lib/saju/interpret/compat";
import type { SajuOk } from "@/lib/saju/engine";
import { assembleCompatReport } from "@/lib/report/compat/assemble";
import { composeMockCompat } from "@/lib/report/compat/mock-model";
import { buildCompatUserMessage } from "@/lib/report/compat/prompt";
import type { CompatReport } from "@/lib/report/compat/types";
import { validateCompatDraft } from "@/lib/report/compat/validate";

type Birth = [year: number, month: number, day: number, time: string | null];
export const DEV_PAIRS: Record<string, { names: { a: string; b: string }; a: Birth; b: Birth }> = {
  C1: { names: { a: "슬기", b: "남수" }, a: [1996, 3, 29, "09:30"], b: [1994, 11, 2, "09:30"] },
  C2: { names: { a: "하늘", b: "도윤" }, a: [1990, 5, 17, "09:30"], b: [1991, 8, 8, null] },
  C3: { names: { a: "지우", b: "서연" }, a: [2001, 1, 9, "09:30"], b: [1999, 12, 24, "09:30"] },
};
const PAIR_ID = /^C\d$/;

const sajuOf = ([year, month, day, birthTime]: Birth): SajuOk => {
  const r = calculateSaju({ year, month, day, calendar: "solar", isLeapMonth: false, birthTime, gender: "female" });
  if (r.status !== "ok") throw new Error("가상 인물의 사주를 계산하지 못했습니다.");
  return r as SajuOk;
};

export type DevCompatView =
  | { ok: true; report: CompatReport; source: "proxy" | "mock"; repeats: number }
  | { ok: false; reason: string; errors: string[] };

export async function devCompatView(id: string): Promise<DevCompatView | null> {
  if (!PAIR_ID.test(id) || !DEV_PAIRS[id]) return null;
  const pair = DEV_PAIRS[id];
  const result = compatOf(sajuOf(pair.a), sajuOf(pair.b));
  const at = new Date().toISOString();
  let raw: unknown = null;
  try {
    raw = JSON.parse(await readFile(join(process.cwd(), "docs", "samples", "compat-v1-proxy", "prompt-0.2", `${id}-first-response.json`), "utf8"));
  } catch {
    raw = null;
  }
  if (raw) {
    const check = validateCompatDraft(raw, result.evidence);
    if (!check.ok) return { ok: false, reason: "저장된 대리 작성기 글이 지금의 제품 검사를 통과하지 못했어요.", errors: check.errors };
    return { ok: true, source: "proxy", repeats: check.repeats.length, report: assembleCompatReport(check.draft, result, pair.names, { provider: "proxy-writer", model: "ai-subagent", at }) };
  }
  const mock = composeMockCompat(buildCompatUserMessage(result.evidence, result.cautions));
  return { ok: true, source: "mock", repeats: 0, report: assembleCompatReport(mock, result, pair.names, { provider: "mock", model: "mock", at, placeholder: true }) };
}
