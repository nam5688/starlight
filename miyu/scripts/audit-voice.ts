// 미유 문체 점검 — 사용자에게 보이는 고정 문구(화면 · 안내 · 오류 · 코드가 만드는 풀이 문장)에 합쇼체(~입니다 · ~합니다 · ~습니다 · ~됩니다)와 AI 특유의 말이 얼마나 남아 있는지 파일별로 센다.
// 코드 주석 · 시험 파일 · 검사 오류 문구(AI에게 고쳐 쓰기를 부탁하는 안내)는 세지 않는다. 호출 없음 · 파일을 고치지 않는다.
//
// 사용: node scripts/audit-voice.ts            (요약표)
//       node scripts/audit-voice.ts --list <경로 일부>   (해당 파일의 문장 목록)
//       node scripts/audit-voice.ts --json         (기계가 읽는 결과)
// 분류: legal(이용약관 · 개인정보 · 법률 고지 — 정확성 우선이라 해요체로 바꾸지 않는다) · operator(운영자 · 개발용 화면) · user(고객에게 보이는 문구 — 해요체로 통일) · internal(검사 오류 · 로그 — 고객에게 보이지 않는다)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SCAN = ["app", "components", "lib", "server"];
const SKIP_DIR = new Set(["node_modules", ".next", "pilot-data", "docs", "public", "supabase"]);

/** 합쇼체로 끝나는 문장(마침표 · 물음표 · 따옴표 · 문자열 끝) */
const FORMAL = /[가-힣]+(?:습니다|ㅂ니다|입니다|합니다|됩니다|바랍니다|십시오|겠습니다|드립니다|있습니다|없습니다|니까)(?=[.?!"'`<)\s]|$)/;

export type Kind = "legal" | "operator" | "user" | "internal";
export function classify(path: string): Kind {
  if (/(^|\/)(terms|privacy)\//.test(path) || /legal|membership\/terms|withdrawal\.ts|business\.ts/.test(path)) return "legal";
  if (/(^|\/)(admin|setup|dev)\//.test(path) || /(^|\/)server\/(dev-|ops|reconcile|report-sweep)/.test(path) || /components\/(admin|dev)\//.test(path) || /lib\/ops\//.test(path)) return "operator";
  // 검사 오류 문구 · 로그 · 비용 계산처럼 고객에게 보이지 않는 파일 — "preview-body"가 "review-"에 걸리는 식의 오분류를 막으려고 폴더와 파일 이름을 정확히 본다
  if (/(^|\/)(?:validate|depth|repeat|terms|issue-class|semantic-review|answer-use|story-motif|story[0-9]*-validate|own-run|compare-plan|compare-personas|budget|approval|ai-candidates|live-review|live-plan)\.ts$/.test(path) || /(^|\/)lib\/report\/ai\//.test(path) || /(^|\/)lib\/report\/style\//.test(path)) return "internal";
  return "user";
}

/** 소스에서 사용자에게 보일 수 있는 글(문자열 리터럴 · JSX 글)을 줄 번호와 함께 뽑는다 — 주석은 건너뛴다 */
export function extractTexts(src: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const lines = src.split("\n");
  let inBlock = false;
  lines.forEach((raw, i) => {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end < 0) return;
      line = line.slice(end + 2);
      inBlock = false;
    }
    // 블록 주석 시작
    for (;;) {
      const s = line.indexOf("/*");
      if (s < 0) break;
      const e = line.indexOf("*/", s + 2);
      if (e < 0) {
        line = line.slice(0, s);
        inBlock = true;
        break;
      }
      line = line.slice(0, s) + " " + line.slice(e + 2);
    }
    // 줄 주석(문자열 밖의 //)
    let cut = -1;
    let q = "";
    for (let k = 0; k < line.length; k++) {
      const ch = line[k];
      if (q) {
        if (ch === "\\") k++;
        else if (ch === q) q = "";
      } else if (ch === '"' || ch === "'" || ch === "`") q = ch;
      else if (ch === "/" && line[k + 1] === "/" && line[k - 1] !== ":") {
        cut = k;
        break;
      }
    }
    if (cut >= 0) line = line.slice(0, cut);
    for (const m of line.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
      const text = m[1] ?? m[2] ?? m[3] ?? "";
      if (/[가-힣]/.test(text)) out.push({ line: i + 1, text });
    }
    // JSX 글(태그 사이의 한글)
    for (const m of line.matchAll(/>([^<>{}]*[가-힣][^<>{}]*)</g)) out.push({ line: i + 1, text: m[1].trim() });
    // 여러 줄 JSX 글(줄 전체가 글인 경우)
    if (!/["'`]/.test(line) && /^\s+[^<>{}=;()]*[가-힣][^<>{}=;()]*$/.test(line) && !/^\s*(import|export|const|let|type|return|if|for)\b/.test(line)) out.push({ line: i + 1, text: line.trim() });
  });
  return out;
}

export type Hit = { file: string; line: number; text: string; kind: Kind };

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) acc.push(p);
  }
  return acc;
}

export function auditVoice(): Hit[] {
  const hits: Hit[] = [];
  for (const d of SCAN) {
    for (const abs of walk(join(ROOT, d))) {
      const file = relative(ROOT, abs).replaceAll("\\", "/");
      const kind = classify(file);
      for (const t of extractTexts(readFileSync(abs, "utf8"))) if (FORMAL.test(t.text)) hits.push({ file, line: t.line, text: t.text.replace(/\s+/g, " ").slice(0, 120), kind });
    }
  }
  return hits;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("audit-voice.ts")) {
  const hits = auditVoice();
  const args = process.argv.slice(2);
  if (args.includes("--json")) console.log(JSON.stringify(hits));
  else if (args.includes("--list")) {
    const part = args[args.indexOf("--list") + 1] ?? "";
    for (const h of hits.filter((x) => x.file.includes(part))) console.log(`${h.file}:${h.line} [${h.kind}] ${h.text}`);
  } else {
    const by = new Map<string, number>();
    for (const h of hits) by.set(`${h.kind}`, (by.get(`${h.kind}`) ?? 0) + 1);
    console.log("# 합쇼체가 남은 고정 문구 (문자열 · JSX 글, 주석 · 시험 제외)");
    for (const k of ["user", "operator", "legal", "internal"] as const) console.log(`- ${k}: ${by.get(k) ?? 0}문장`);
    for (const k of ["user", "operator", "legal", "internal"] as const) {
      const files = new Map<string, number>();
      for (const h of hits.filter((x) => x.kind === k)) files.set(h.file, (files.get(h.file) ?? 0) + 1);
      console.log(`\n## ${k} — 파일별`);
      for (const [f, n] of [...files].sort((a, b) => b[1] - a[1]).slice(0, k === "user" ? 60 : 12)) console.log(`${String(n).padStart(4)}  ${f}`);
    }
  }
}
