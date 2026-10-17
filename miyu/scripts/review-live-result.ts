// 궁합 실제 AI 시험 결과를 읽기 전에 수치로 보는 도구 — 호출 없음 · 저장소에 올라가지 않는 폴더(pilot-data/ai-compare)의 결과를 읽기만 한다.
// 반복 · 영역별 새 정보량 · 근거 사용 · 없는 사건 단정 · 응답 재진술 · 행동의 겹침 · 제품 검사 결과를 표로 보여 준다. 합격 판정이 아니다 — 글 전문은 /dev/live 또는 readable.md로 직접 읽는다.
// 실행 (miyu 폴더): node scripts/review-live-result.ts pilot-data/ai-compare/<폴더>
//   마지막 원문(attempts/round<N>.txt)을 우선 본다 — 검사에 걸려 저장되지 않은 글도 돈을 쓰고 받은 글이라 같은 지표로 본다. 원문이 없으면 report.json.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { compatOf } from "../lib/saju/interpret/compat.ts";
import { compatTimingOf } from "../lib/saju/interpret/compat-timing.ts";
import { extractJson } from "../lib/report/ai/generator.ts";
import { liveCompatInput, livePairInput, LIVE_REFERENCE } from "../lib/report/compat/live-plan.ts";
import { pairEvidenceOf } from "../lib/report/compat/pair-evidence.ts";
import { renderLiveReview, reviewLive, type LiveReviewShape } from "../lib/report/compat/live-review.ts";

const dir = process.argv[2];
if (!dir) {
  console.error("사용: node scripts/review-live-result.ts pilot-data/ai-compare/<결과 폴더>");
  process.exit(1);
}
const name = basename(dir);
const pair = name.includes("compat-pair-p1");
if (!pair && !name.includes("compat-saju-p1")) {
  console.error("compat-saju-p1 · compat-pair-p1 결과 폴더만 읽습니다(개인 리포트는 scripts/review-saved-draft.ts).");
  process.exit(1);
}

// 마지막 원문(attempts)이 있으면 그것을 본다 — 검사를 통과해 저장된 글도 같은 원문에서 조립되고, 원문에는 근거 ID가 있어 근거 사용 지표와 제품 검사까지 볼 수 있다.
// (저장된 report.json은 근거 ID를 뺀 조립본이라 글 지표만 본다.) 원문이 없으면 report.json을 본다.
let shape: LiveReviewShape | null = null;
let source = "";
try {
  const rounds = readdirSync(join(dir, "attempts")).filter((f) => /^round\d+\.txt$/.test(f)).sort();
  const last = rounds[rounds.length - 1];
  if (last) {
    shape = extractJson(readFileSync(join(dir, "attempts", last), "utf8")) as LiveReviewShape;
    source = `attempts/${last} (모델이 마지막으로 돌려준 원문 — ${existsSync(join(dir, "report.json")) ? "이 글이 검사를 통과해 저장됨" : "검사에 걸려 저장되지 않음"})`;
  }
} catch {
  shape = null;
}
if (!shape) {
  try {
    shape = JSON.parse(readFileSync(join(dir, "report.json"), "utf8")) as LiveReviewShape;
    source = "report.json (검사를 통과해 저장된 조립본 — 근거 ID 없음)";
  } catch {
    console.error("읽을 글이 없습니다(attempts · report.json 모두 없음).");
    process.exit(1);
  }
}

// 근거는 시험 입력(가상 인물)에서 다시 만든다 — 시험을 돌릴 때와 같은 기준 시점
let evidence;
if (pair) {
  const input = livePairInput();
  const c = compatOf(input.a.saju, input.b.saju);
  evidence = [...c.evidence, ...compatTimingOf(input.a.saju, input.b.saju, LIVE_REFERENCE).evidence, ...pairEvidenceOf({ summary: input.a.summary, mbti: input.a.knownMbti }, { summary: input.b.summary, mbti: input.b.knownMbti }).evidence];
} else {
  const input = liveCompatInput();
  evidence = [...compatOf(input.a, input.b).evidence, ...compatTimingOf(input.a, input.b, LIVE_REFERENCE).evidence];
}

console.log(`# ${name}\n- 읽은 글: ${source}\n- 입력: ${pair ? "가상 인물 P01 · P02(사주 + 응답 비교 근거)" : "가상 쌍 C1"} · 근거 ${evidence.length}개(시험 입력에서 다시 계산)\n`);
console.log(renderLiveReview(reviewLive(shape, { evidence, pair })));
console.log("\n※ 이 표는 읽기 전의 보조 지표입니다. 말만 바꿔 되풀이한 문장 · 근거를 제대로 풀었는가 · 돈을 내고 읽을 만한가는 낱말로 셀 수 없어 글 전문을 직접 읽고 판단해야 합니다(docs/real-ai-evaluation-rubric.md).");
