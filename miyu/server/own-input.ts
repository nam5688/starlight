import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ownInputCaptureEnabled } from "@/lib/config/own-input-guard";
import type { Answers } from "@/lib/assessment/types";
import type { BasicInfo } from "@/lib/profile/basic-info";

// 개발용 — 운영자가 이 PC의 /analyze에서 22문항에 답한 입력을 로컬 파일로만 남긴다(실제 AI 시험 scripts/run-own-story.ts가 읽는다).
// 켜는 조건은 lib/config/own-input-guard.ts: .env.local에 MIYU_OWN_INPUT_CAPTURE=yes를 직접 적고 개발 서버일 때만. DB · 로그 · 외부로는 보내지 않는다.
// 폴더 pilot-data/는 저장소에 올라가지 않는다(.gitignore).

export const OWN_INPUT_DIR = join(process.cwd(), "pilot-data", "own-input");

/** 켜져 있을 때만 파일 하나(latest.json)를 덮어쓴다. 실패해도 화면 흐름에는 영향이 없다 — 켜져 있는데 못 쓰면 false */
export async function captureOwnInput(info: BasicInfo, answers: Answers): Promise<boolean> {
  if (!ownInputCaptureEnabled(process.env)) return false;
  try {
    await mkdir(OWN_INPUT_DIR, { recursive: true });
    await writeFile(join(OWN_INPUT_DIR, "latest.json"), JSON.stringify({ info, answers, capturedAt: new Date().toISOString() }, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}
