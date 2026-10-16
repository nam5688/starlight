// 장면 질문의 실제 생성 경로 시험 결과 문서(docs/assessment-scenario-generation-check.md)를 만든다.
// 저장된 글(docs/samples/scenario-generation/*.json)을 제품 검사에 다시 넣어 표를 만들고, 비교 판단(scenario-generation-notes.ts)의 인용을 글에서 읽어 와서 문서와 글이 어긋나지 않게 한다.
// 실행: node scripts/render-assessment-scenario-generation.ts   (miyu 폴더에서)
import { readFileSync, writeFileSync } from "node:fs";
import { checkReadingDepth } from "../lib/report/reading/depth.ts";
import { ANSWER_ECHO, NO_DATA_TEXT } from "../lib/report/reading/plan.ts";
import { READING_PROMPT_VERSION } from "../lib/report/reading/prompt.ts";
import { findRepeatedPhrases } from "../lib/report/reading/repeat.ts";
import type { ReadingDraftV1 } from "../lib/report/reading/types.ts";
import { validateReadingDraft } from "../lib/report/reading/validate.ts";
import { SCENARIO_CASES, scenarioCaseEvidence } from "../lib/assessment/drafts/scenario-cases.ts";
import { allText, diffParts, echoedOptionTexts, pickByPath, sceneCitations } from "../lib/assessment/drafts/scenario-generation-compare.ts";
import { CASE_RECORDS, FINDINGS, GENERATION_DATE, GENERATION_WRITER, LIMITS } from "../lib/assessment/drafts/scenario-generation-notes.ts";
import { readScenarios, SCENES, SCENE_BY_ID, type SceneId } from "../lib/assessment/drafts/scenario-v1.ts";

const dir = new URL("../docs/samples/scenario-generation/", import.meta.url);
const load = (key: string): ReadingDraftV1 => JSON.parse(readFileSync(new URL(`${key}.json`, dir), "utf8")) as ReadingDraftV1;
const drafts = Object.fromEntries([...SCENARIO_CASES.map((c) => c.key), "H.v0.9"].map((k) => [k, load(k)])) as Record<string, ReadingDraftV1>;

const letter = { a: "가", b: "나", c: "다", d: "라" } as const;
const answerText = (id: SceneId, a: unknown): string => {
  if (a === undefined) return "답하지 않음";
  if (a === "x") return "이런 일이 거의 없었어요";
  if (a === "y") return "맞는 선택지가 없어요";
  const o = SCENE_BY_ID[id].options.find((x) => x.id === a)!;
  return `${letter[o.id]}. ${o.text}`;
};
const q = (s: string) => s.replace(/\|/g, "\\|").replace(/\n+/g, " ");

// 1. 사례 표
const caseRows = SCENARIO_CASES.map((c) => {
  const read = readScenarios(c.answers).map((r) => `${r.thread}${r.kind === "read" ? "✓" : "—"}`).join(" ");
  return `| ${c.key} | ${c.title} | ${c.who === "seoyun" ? "서윤 (1994-11-07 08:40 · 여)" : "P01 (비교용 가상 인물)"} | ${read} | ${c.checks} |`;
}).join("\n");

const answerRows = (Object.keys(SCENE_BY_ID) as SceneId[])
  .map((id) => `| ${id} ${SCENE_BY_ID[id].label} | ${SCENARIO_CASES.map((c) => q(answerText(id, c.answers[id]))).join(" | ")} |`)
  .join("\n");

// 2. 제품 검사 표
const checkRows = SCENARIO_CASES.map((c) => {
  const d = drafts[c.key]!;
  const ev = scenarioCaseEvidence(c);
  const v = validateReadingDraft(d, ev, { hasContext: false });
  const rep = findRepeatedPhrases(d).length;
  const depth = checkReadingDepth({ draft: d as never });
  const text = allText(d);
  const optionEcho = echoedOptionTexts(text, SCENES.flatMap((s) => s.options.map((o) => o.text))).length;
  const echo = ANSWER_ECHO.test(text) ? "있음" : "없음";
  const nodata = NO_DATA_TEXT.test(text) ? "있음" : "없음";
  const rec = CASE_RECORDS[c.key]!;
  const cited = [...new Set(Object.values(sceneCitations(d)).flat())].sort().join(" ");
  return `| ${c.key} | ${rec.prompt} | ${v.ok ? "통과" : "실패"} | ${rep}건 | ${depth.pass ? "통과" : "실패"} | ${echo} · ${optionEcho}건 · ${nodata} | ${cited || "없음"} | ${rec.repairs}회 |`;
}).join("\n");

// 3. 비교 표
const pairTable = (a: string, b: string) => {
  const rows = diffParts(drafts[a]!, drafts[b]!).map((d) => `| ${d.part} | ${d.same ? "같은 글" : "다름"} | ${d.overlap.toFixed(2)} |`);
  return `| 부분 | ${a} → ${b} | 글자 겹침(참고) |\n| --- | --- | --- |\n${rows.join("\n")}`;
};

const pairs: [string, string, string][] = [
  ["X", "R", "같은 입력을 독립으로 두 번 쓴 글 — 글자 겹침의 바닥(쓰는 사람이 달라서 생기는 차이)"],
  ["X", "Y", "같은 사주 + 다른 응답"],
  ["X", "W", "다른 사주 + 같은 응답"],
  ["X", "Z", "일부 응답만 변경(S8 하나) — 고쳐 쓰기"],
  ["Y", "V", "첫 반응만 변경(S5 하나) — 고쳐 쓰기"],
  ["X", "H", "읽을 수 없는 구분이 있는 사례(H)와 X"],
];

const findingBlocks = FINDINGS.map((f) => {
  const quotes = f.quotes
    .map((x) => {
      const t = pickByPath(drafts[x.key]!, x.path);
      return `> **${x.label}** (\`${x.key}\` · \`${x.path}\`)\n> ${t ?? "(없음)"}`;
    })
    .join("\n>\n");
  return `### ${f.id.replace("F", "발견 ")} · ${f.pair}\n\n**${f.title}**\n\n- 달라진 근거: ${f.evidence}\n- 읽은 것: ${f.reading}\n\n${quotes}\n`;
}).join("\n");

const rRow = diffParts(drafts.X!, drafts.R!);
const noiseLine = `X와 R은 입력이 완전히 같은데도 ${rRow.filter((d) => !d.same).length}개 부분이 모두 다른 글이고 글자 겹침이 ${Math.min(...rRow.map((d) => d.overlap)).toFixed(2)}~${Math.max(...rRow.map((d) => d.overlap)).toFixed(2)}다(바닥). 그래서 X→Y · X→W의 겹침이 비슷하게 낮은 것은 응답이나 사주가 달라서가 아니라 독립으로 쓴 글이면 원래 그만큼 다르기 때문일 수 있다 — 겹침 비율로는 둘을 가를 수 없다.`;

const doc = `# 미유 장면 질문 — 실제 생성 경로 시험 (${GENERATION_DATE})

- 상태: 시험 기록. **실제 서비스에 연결된 AI가 아니라 시험용 대리 작성기(AI 하위 작업자)가 쓴 글이다.** 화면 · 저장 · 실제 리포트 생성 · 기존 회원 결과 · 결제 · 권한에 연결하지 않았다.
- 입력: 리포트 AI가 받는 것과 같은 근거 목록(사주 근거 + 입력한 MBTI + 장면 질문의 근거, \`lib/assessment/drafts/scenario-evidence.ts\`) · 지시문 \`${READING_PROMPT_VERSION}\`(현재 버전, 사례마다 쓴 지시문은 2장 표) · 사례 정의 \`scenario-cases.ts\` · 저장된 글 \`docs/samples/scenario-generation/\` · 시험 \`scenario-generation.test.ts\`. 이 문서는 \`node scripts/render-assessment-scenario-generation.ts\`로 저장된 글에서 만든다.
- 쓴 방식: ${GENERATION_WRITER}
- **보여 주려는 것은 테스트 통과 숫자가 아니라 "어떤 해석이 어떤 근거 때문에 달라졌는가"다.** 아래 비교 판단은 글을 읽은 한 사람(Claude)의 해석이며, 사람의 가려 읽기 · 인지 인터뷰로 확인하지 않았다.

## 1. 시험 사례

가상 인물만 쓴다. R은 X와 입력이 같은 반복이고, Z · V는 바탕 글에서 바뀐 근거에 닿은 곳만 고쳐 쓴 사례다.

| 사례 | 이름 | 사주 | 읽힌 구분(✓ 읽음 · — 읽지 않음) | 확인하려는 것 |
| --- | --- | --- | --- | --- |
${caseRows}

**응답** (가상 응답이며 실제 사람의 것이 아니다)

| 장면 | ${SCENARIO_CASES.map((c) => c.key).join(" | ")} |
| --- | ${SCENARIO_CASES.map(() => "---").join(" | ")} |
${answerRows}

## 2. 제품 검사

각 글을 제품 검사(\`validateReadingDraft\` · \`findRepeatedPhrases\` · \`checkReadingDepth\`)에 넣은 결과. "응답 읽어 주기"는 \`ANSWER_ECHO\`(표시 말), "선택지 그대로"는 선택지 문장을 글에서 찾은 개수, "자료 없음"은 \`NO_DATA_TEXT\`. 고쳐 쓴 횟수는 제품 검사에 걸려 작성기에게 이유를 돌려보낸 횟수이며, 제품 생성기는 한 번만 고쳐 쓰고 반복 표현은 그대로 받아들인다.

| 사례 | 지시문 | 형식 검사 | 반복 표현 | 내용 검사 | 응답 읽어 주기 · 선택지 그대로 · 자료 없음 | 글이 단 장면 근거 | 고쳐 쓴 횟수 |
| --- | --- | --- | --- | --- | --- | --- | --- |
${checkRows}

${Object.entries(CASE_RECORDS)
  .map(([k, r]) => `- **${k}**: ${r.how}`)
  .join("\n")}

이 표는 형식 · 금지 표현 · 반복 · 내용 검사를 넘었다는 뜻이다. **글이 좋다는 뜻이 아니다.**

## 3. 비교 — 어떤 해석이 어떤 근거 때문에 달라졌나

${findingBlocks}
## 4. 글자 겹침 비율(참고값)

부분별 글자 조각(4글자) 겹침이다(0이면 하나도 겹치지 않음, 1이면 같은 글). ${noiseLine} 되풀이(고른 답을 바꿔 쓴 문장)를 재는 데도 쓸 수 없었다(발견 7). Z · V처럼 고쳐 쓰게 한 사례에서만 "같은 글"과 "다름"이 근거 변화를 따라간다.

${pairs.map(([a, b, title]) => `**${a} → ${b} · ${title}**\n\n${pairTable(a, b)}\n`).join("\n")}
## 5. 이 시험으로 알게 된 것

1. **근거가 달라지면 풀이가 따라간다** — Z · V에서 바뀐 근거에 닿은 곳만 달라졌고 일 · 성향 · 시기 · 실천은 그대로였다(발견 3 · 4). 같은 사주에서 응답이 다르면(Y) · 같은 응답에서 사주가 다르면(W) 풀이의 장면 · 중심이 달라졌다(발견 1 · 2).
2. **수정한 세 조합**이 글에서 지켜졌다(발견 6 · 4): 접는 이유를 기준 미달로 읽지 않았고, 담담함의 원인을 확정하지 않았으며, 같은 "혼자 정리할 시간"에 첫 반응이 다르면 다른 풀이가 나왔다.
3. **읽을 수 없는 구분은 근거를 만들지 않아도 지시문 0.9로는 성향이 채워졌다**(발견 5). 사용자가 "거의 없었다"고 답한 연락 장면의 반응이 연애 반응 단계에 생겼다. 제품 검사는 이런 글을 잡지 못해 지시문 0.10에 규칙을 더했고(근거 목록에 없는 장면의 구체적 행동을 사실처럼 쓰지 않는다) 다시 쓴 글에서는 없어졌다. 다른 장면에서 같은 일이 안 생긴다는 보증은 아니다.
4. **고른 답을 바꿔 쓴 문장은 남는다**(발견 2 · 7). 표시 말은 막혔지만 성향 제목과 일 · 이유 소단락에 답의 사실이 거의 그대로 보인다. 어디까지가 새로 연결해 준 이해인지는 사람의 가려 읽기가 필요하다.
5. **독립으로 쓴 글은 같은 입력에도 크게 다르다**(R). 글자 겹침으로는 응답이 바꾼 차이를 말할 수 없고, 해석이 달라진 근거를 읽어서 판단해야 한다.

## 6. 하지 못한 것 · 한계

${LIMITS.map((l) => `- ${l}`).join("\n")}

## 7. 다음 단계(운영자 결정)

1. 인지 인터뷰 2단계(\`assessment-scenario-v1.md\` 9장): 본인 답으로 만든 글을 읽고 문단마다 되풀이 · 새 연결 · 잘못 짐작한 이유를 표시, "둘 다 맞음 · 둘 다 아님" 허용, 6~8명은 초기 수정용.
2. 이 근거 연결을 실제 화면 · 저장 · 실제 AI 생성에 붙일 시점. 붙이기 전에는 기존 22문항 화면과 리포트 생성이 그대로 동작한다.
3. 실제 서비스 AI로 같은 사례를 한 번 시험할지(운영자가 승인 금액 · 기간을 직접 적은 뒤에만 한다).
`;

writeFileSync(new URL("../docs/assessment-scenario-generation-check.md", import.meta.url), doc);
console.log(`docs/assessment-scenario-generation-check.md (${doc.length}자)`);
