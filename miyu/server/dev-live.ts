// 개발용 — 궁합 실제 AI 시험(scripts/run-compat-live.ts)이 남긴 결과(pilot-data/ai-compare/<단계>-<시각>/, 저장소에 올라가지 않는 폴더)를 읽는다.
// 공개 배포에서는 쓰지 않는다(화면이 production에서 notFound). 폴더 이름 형식을 엄격히 검사해 경로 조작을 막는다.
// 검사에 걸려 저장되지 않은 글(attempts/round*.txt)도 돈을 쓰고 받은 원문이므로 그대로 읽을 수 있게 한다.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CompatReport, PairReport } from "@/lib/report/compat/types";

const ROOT = join(process.cwd(), "pilot-data", "ai-compare");
const RUN = /^(?:rehearsal-)?(?:compat-saju-p1|compat-pair-p1)-\d{8}-\d{6}$/;

export type LiveRunSummary = { id: string; stage: string; rehearsal: boolean; calls: number | null; spentKrw: number | null; result: string | null; hasReport: boolean };
export type LiveRunDetail = {
  id: string;
  stage: string;
  rehearsal: boolean;
  /** cost-and-checks.json 그대로(걸린 이유는 검사 문구이고 글 내용이 아니다) */
  costAndChecks: Record<string, unknown> | null;
  /** 검사를 통과해 조립된 리포트(없으면 저장되지 않은 결과) */
  report: CompatReport | PairReport | null;
  /** 모델이 돌려준 원문 — 검사에 걸린 글 포함 */
  attempts: { round: number; text: string }[];
};

const read = async (path: string) => {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
};
const json = async (path: string) => {
  const text = await read(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};
const stageOf = (id: string) => (id.includes("compat-saju-p1") ? "compat-saju-p1" : "compat-pair-p1");

export async function listLiveRuns(): Promise<LiveRunSummary[]> {
  let names: string[];
  try {
    names = await readdir(ROOT);
  } catch {
    return [];
  }
  const runs = await Promise.all(
    names
      .filter((n) => RUN.test(n))
      .sort()
      .reverse()
      .map(async (id): Promise<LiveRunSummary> => {
        const c = (await json(join(ROOT, id, "cost-and-checks.json"))) as Record<string, unknown> | null;
        return {
          id,
          stage: stageOf(id),
          rehearsal: id.startsWith("rehearsal-"),
          calls: typeof c?.calls === "number" ? c.calls : null,
          spentKrw: typeof c?.spentKrw === "number" ? c.spentKrw : null,
          result: typeof c?.result === "string" ? c.result : null,
          hasReport: (await read(join(ROOT, id, "report.json"))) !== null,
        };
      }),
  );
  return runs;
}

export async function readLiveRun(id: string): Promise<LiveRunDetail | null> {
  if (!RUN.test(id)) return null;
  const costAndChecks = (await json(join(ROOT, id, "cost-and-checks.json"))) as Record<string, unknown> | null;
  const report = (await json(join(ROOT, id, "report.json"))) as CompatReport | PairReport | null;
  let files: string[] = [];
  try {
    files = (await readdir(join(ROOT, id, "attempts"))).filter((f) => /^round\d+\.txt$/.test(f)).sort();
  } catch {
    files = [];
  }
  const attempts = (await Promise.all(files.map(async (f) => ({ round: Number(f.slice(5, -4)), text: (await read(join(ROOT, id, "attempts", f))) ?? "" })))).filter((a) => a.text.length > 0);
  if (!costAndChecks && !report && attempts.length === 0) return null;
  return { id, stage: stageOf(id), rehearsal: id.startsWith("rehearsal-"), costAndChecks, report, attempts };
}
