// 운영자 본인 입력으로 "개인 유형명(10개 + 혼합 경향)"이 어떻게 계산되는지만 화면(터미널)에 보여 준다 — 읽기 전용 · AI 호출 0 · 파일을 만들지도 고치지도 않는다.
// 스위치(PERSONAL_TYPE)는 켜지 않는다. 화면에 보이는 유형명은 지금도 옛 후보 이름 4개(안정지향형 등)이고, 여기 나오는 값은 "켠다면 이렇게 계산된다"는 확인용이다.
//
// 사용 (miyu 폴더, PowerShell):
//   node scripts/own-identity.ts <결과 폴더 경로> [--birth-time-unknown]
//   · 결과 폴더의 input.json(그 실행의 입력 사본)만 읽는다. 어떤 파일도 만들지 않고 네트워크도 쓰지 않는다.
//   · --birth-time-unknown: 그 실행을 같은 옵션으로 했다면 똑같이 적는다(시주 없이 다섯 자리로 센다).
// 이 출력에는 본인의 사주 계산값이 있으므로 저장소 문서 · 채팅에 그대로 붙이지 않는다(유형 이름과 한 줄 근거만 옮긴다).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ownReportInput, parseOwnCapture } from "../lib/report/ai/own-run.ts";
import { FLAVOR_RULES, PERSONAL_TYPES, PERSONAL_TYPE_VERSION, personalTypeOf, personalTypeView, responseScores, sajuTilt } from "../lib/assessment/personal-type.ts";
import { TENDENCY_NAMES } from "../lib/assessment/dev-rules.ts";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const birthTimeUnknown = args.includes("--birth-time-unknown");

function stop(message: string): never {
  console.error(`\n중단: ${message}\n(이 스크립트는 읽기 전용입니다. 아무것도 만들거나 바꾸지 않았고 AI를 호출하지 않았습니다.)`);
  process.exit(1);
}
if (!dir) stop("결과 폴더 경로가 필요합니다(예: pilot-data\\ai-compare\\story7-own-20261019-025234).");

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(join(dir, "input.json"), "utf8"));
} catch {
  stop(`${join(dir, "input.json")}을 읽지 못했습니다.`);
}
const parsed = parseOwnCapture(raw);
if (!parsed) stop("input.json의 모양이 올바르지 않습니다.");
const capture = birthTimeUnknown ? { ...parsed, info: { ...parsed.info, birthTimeUnknown: true, birthTime: "" } } : parsed;

const stamp = dir.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})[\\/]?$/);
const stamped = stamp ? new Date(`${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`) : null;
const now = stamped && !Number.isNaN(stamped.getTime()) ? stamped : new Date();
const built = await ownReportInput(capture, now);
if (!built.ok) stop(built.message);
const { saju, summary } = built.input;
if (saju.status !== "ok") stop("사주가 계산되지 않은 입력이라 유형을 정할 수 없습니다(만세력 결과 없음).");

const tilt = sajuTilt(saju);
const scores = responseScores(summary);
const result = personalTypeOf({ saju, summary });
const view = personalTypeView(result);

const line = (s = "") => console.log(s);
line(`개인 유형 계산 확인 — ${PERSONAL_TYPE_VERSION} (읽기 전용 · 스위치 꺼짐 상태 그대로 · AI 호출 0)`);
line();
line(`① 사주 갈래 세기 (${saju.hourPillarOmitted ? "시주 없이 다섯 자리" : "일곱 자리"} · 월지는 한 자리 더): ${Object.entries(tilt.counts).map(([g, n]) => `${g} ${n}`).join(" · ")}`);
line(`   가장 많은 갈래(2 이상): ${tilt.candidates.length ? tilt.candidates.join(" · ") : "없음"} · 판정: ${tilt.reason}`);
line();
line("② 응답 점수(0~100, 유형 계산에 쓰는 것만)");
const rows = new Set(Object.values(FLAVOR_RULES).flatMap((r) => [...r.aParts, ...r.bParts].map((p) => p.row)));
for (const row of rows) line(`   ${row}: ${typeof scores[row] === "number" ? Math.round(scores[row]) : "(없음)"}`);
line("   (입력한 MBTI 네 글자는 이 계산에 쓰지 않는다)");
line();
line("③ 후보 갈래별 두 모습 비교");
for (const g of tilt.candidates) {
  const r = FLAVOR_RULES[g];
  line(`   ${g}: ${PERSONAL_TYPES[r.a].name} ↔ ${PERSONAL_TYPES[r.b].name}`);
}
line();
line(`④ 결과: ${view.name}${result.kind === "mixed" ? `  (혼합 경향 이유: ${result.reason})` : ""}`);
line(`   한 줄: ${view.line}`);
line();
line(`⑤ 지금 화면에 보이는 옛 후보 이름(4개): ${summary.tendency.name} — 저장된 결과 · 심층 리포트 맨 위 줄은 이 이름을 쓴다`);
line(`   (옛 후보 이름 목록: ${Object.values(TENDENCY_NAMES).join(" · ")})`);
line();
line("표시 위치(켠다면): 무료 미리보기 결과 화면(/results/<번호>) 맨 위 제목 아래의 개인 유형 카드. 심층 리포트 본문에는 나오지 않는다.");
