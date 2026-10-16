"use server";

import { parseLabInput } from "@/lib/assessment/drafts/scenario-lab";
import { runLab, type LabResult } from "@/server/dev-scenario";

export type LabActionResult = { ok: true; result: LabResult } | { ok: false; reason: string };

/** 장면 질문 테스트 — 이 PC의 개발 화면에서만. source: saved(저장된 시험 글, AI 호출 없음) · live(실제 AI, 별도 승인 스위치가 있을 때만) */
export async function runScenarioLabAction(raw: unknown, source: "saved" | "live"): Promise<LabActionResult> {
  if (process.env.NODE_ENV === "production") return { ok: false, reason: "개발용 화면이에요" };
  const parsed = parseLabInput(raw);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  try {
    return { ok: true, result: await runLab(parsed.value, source === "live" ? "live" : "saved") };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message.slice(0, 300) : "실행하지 못했어요" };
  }
}
