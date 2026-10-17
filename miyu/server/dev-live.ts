// 개발용 — 궁합 실제 AI 시험(scripts/run-compat-live.ts)이 남긴 결과(pilot-data/ai-compare/<단계>-<시각>/, 저장소에 올라가지 않는 폴더)를 읽는다.
// 공개 배포에서는 쓰지 않는다(화면이 production에서 notFound). 폴더 이름 형식을 엄격히 검사해 경로 조작을 막는다.
// 검사에 걸려 저장되지 않은 글(attempts/round*.txt)도 돈을 쓰고 받은 원문이므로 그대로 읽을 수 있게 한다.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CompatReport, PairReport } from "@/lib/report/compat/types";
import { ownReportInput, parseOwnCapture } from "@/lib/report/ai/own-run";
import { buildFreePreview, type FreePreview } from "@/lib/report/preview";
import { seoulReference } from "@/lib/report/reference";
import type { IntegratedReadingReport } from "@/lib/report/reading/types";

const ROOT = join(process.cwd(), "pilot-data", "ai-compare");
const RUN = /^(?:rehearsal-)?(?:compat-saju-p1|compat-pair-p1|story-own|story7-own)-\d{8}-\d{6}$/;

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
  /** 운영자 본인 입력 시험(story-own · story7-own)에서만 — 같은 입력으로 만든 무료 리포트 · 심층 리포트 · 입력 확인 · 읽는 순서 글 · 읽기 전 지표 */
  own: OwnRunDetail | null;
};
export type OwnRunDetail = {
  /** 검사를 통과해 저장된 심층 리포트(없으면 null — 원문만 있다) */
  reading: IntegratedReadingReport | null;
  /** 같은 입력(운영자가 푼 응답 + 사주)으로 만든 무료 리포트 미리보기 — 무료 화면이 보이는 그대로 */
  free: FreePreview | null;
  inputCheck: string | null;
  readable: string | null;
  metrics: string | null;
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
const stageOf = (id: string) => (id.includes("story7-own") ? "story7-own" : id.includes("story-own") ? "story-own" : id.includes("compat-saju-p1") ? "compat-saju-p1" : "compat-pair-p1");
/** 운영자 본인 입력 시험 단계(story-v1 · story-7) — 무료 · 심층 리포트를 나란히 읽는다 */
const isOwnStage = (stage: string) => stage === "story-own" || stage === "story7-own";

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
  const stage = stageOf(id);
  return { id, stage, rehearsal: id.startsWith("rehearsal-"), costAndChecks, report: isOwnStage(stage) ? null : report, attempts, own: isOwnStage(stage) ? await readOwn(id) : null };
}

/** 본인 입력 시험의 읽기 자료 — 무료 리포트는 저장해 둔 입력(input.json, 이 PC의 파일)에서 제품과 같은 코드로 다시 만든다(저장 · 외부 전송 없음) */
async function readOwn(id: string): Promise<OwnRunDetail> {
  const dir = join(ROOT, id);
  const reading = (await json(join(dir, "report.json"))) as IntegratedReadingReport | null;
  let free: FreePreview | null = null;
  const capture = parseOwnCapture(await json(join(dir, "input.json")));
  if (capture) {
    const built = await ownReportInput(capture, new Date());
    if (built.ok && built.input.saju.status === "ok") free = buildFreePreview({ summary: built.input.summary, saju: built.input.saju, reference: seoulReference(new Date()) });
  }
  return { reading, free, inputCheck: await read(join(dir, "input-check.md")), readable: await read(join(dir, "readable.md")), metrics: await read(join(dir, "metrics.md")) };
}
