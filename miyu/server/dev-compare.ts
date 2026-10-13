// 개발용 — AI 비교 실행 결과(pilot-data/ai-compare, 저장소에 올라가지 않는 폴더)를 읽는다. 공개 배포에서는 쓰지 않는다(화면이 production에서 notFound).
// 경로 조작을 막기 위해 폴더 이름 · 파일 이름 형식을 엄격히 검사한다. 파일에는 후보(AI) 이름이 없다.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(process.cwd(), "pilot-data", "ai-compare");
const RUN = /^[A-Za-z0-9-]{3,60}$/;
const ITEM = /^P\d{1,2}-[XY]$/;

export async function listRuns(): Promise<{ id: string; items: string[] }[]> {
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
      .map(async (id) => {
        try {
          const files = await readdir(join(ROOT, id, "reports"));
          return { id, items: files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).filter((n) => ITEM.test(n)).sort() };
        } catch {
          return { id, items: [] };
        }
      }),
  );
  return runs.filter((r) => r.items.length > 0);
}

export async function readRunReport(run: string, item: string): Promise<unknown | null> {
  if (!RUN.test(run) || !ITEM.test(item)) return null;
  try {
    return JSON.parse(await readFile(join(ROOT, run, "reports", `${item}.json`), "utf8"));
  } catch {
    return null;
  }
}
