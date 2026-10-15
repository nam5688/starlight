// 출시 전 검토용 묶음(docs/assessment-expert-review-pack.md)을 코드에서 만든다 — 실제 문항 · 채점 방식 · 결과 예시 · 개발 기록을 한 파일에 담고,
// 저작권 검토(검사 저작권 전문가)와 측정 품질 검토(심리측정 전문가)를 나눈다. 문항 · 채점은 모두 lib/에서 읽어 와 문서와 코드가 어긋나지 않는다.
// 이 묶음은 법률 판단 · 검증 결과가 아니라 전문가가 볼 자료다. 실행: node scripts/render-assessment-review-pack.ts   (miyu 폴더에서)
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { ASSESSMENT_MODULES } from "../lib/assessment/modules/index.ts";
import { scoreModule } from "../lib/assessment/scoring.ts";
import { LIKERT_OPTIONS, type Answers } from "../lib/assessment/types.ts";
import { CHECKED, DEVELOPMENT, MODULE_RECORDS, NOT_CHECKED, PROVENANCE_DATE, SIMILARITY, SIMILARITY_LABEL, SOURCES, provenanceRows } from "../lib/assessment/provenance.ts";
import { CLEAR_DISTANCE, DOMAIN_LABEL, DRAFT_CONTENT_VERSION, DRAFT_ITEMS, DRAFT_SCORING_VERSION, HOLD_TEXT, MIN_INDICATORS, NA_OPTION_TEXT, PERSPECTIVES, UNCLEAR_TEXT } from "../lib/assessment/drafts/situational-draft.ts";
import { DEEP_ITEMS, DEEP_QUESTIONS_VERSION, DEEP_SCORING_VERSION, DEEP_SUB_DEFS } from "../lib/assessment/drafts/deep-questions.ts";
import {
  LIFE_AREAS,
  LIFE_BEHAVIOR_VERSION,
  LIFE_CLEAR_DISTANCE,
  LIFE_HOLD_TEXT,
  LIFE_ITEMS,
  LIFE_NONE_TEXT,
  LIFE_OPTIONS,
  LIFE_PROMPT,
  LIFE_SCORING_VERSION,
  LIFE_UNCLEAR_TEXT,
  lifeScoringText,
  readLifeAreas,
  type LifeValue,
} from "../lib/assessment/drafts/life-behavior-v1.ts";

const ARROW: Record<string, string> = { "2": "↑↑", "1": "↑", "-1": "↓", "-2": "↓↓" };
const live = provenanceRows();
const liveCount = live.reduce((n, r) => n + r.items.length, 0);

// ── 화면 22문항 ──
const liveRows = live
  .flatMap(({ module, items }) =>
    items.map(({ item, record, scoring }) => {
      const sim = SIMILARITY[item.id]!;
      return `| ${item.id} | ${module.title} | ${item.text} | ${item.reverse ? "반대 방향(6−응답)" : "그대로"} | ${scoring} | **${sim.level === "check" ? "우선 확인" : sim.level === "common" ? "주제 흔함" : "특이점 없음"}** — ${sim.note} | ${record?.why ?? ""} |`;
    }),
  )
  .join("\n");

const checkIds = Object.entries(SIMILARITY).filter(([, s]) => s.level === "check").map(([id]) => id);

const moduleRows = MODULE_RECORDS.map((m) => `| ${m.title} | ${m.corresponds} | ${m.notUsed} | ${m.handling} |`).join("\n");

// ── 결과 예시: 임의의 응답(실제 사람 아님) ──
const sample: Answers = {};
ASSESSMENT_MODULES.flatMap((m) => m.items).forEach((it, i) => {
  sample[it.id] = ((i * 2 + 1) % 5) + 1;
});
const resultExample = ASSESSMENT_MODULES.map((m) => {
  const rows = scoreModule(m, sample)
    .map((s) => {
      const d = m.dimensions.find((x) => x.id === s.dimensionId)!;
      const side = s.score > 50 ? (d.highName ?? d.highMeaning) : s.score < 50 ? (d.lowName ?? d.lowMeaning) : "가운데";
      return `| ${d.label} | ${s.score} | ${side} |`;
    })
    .join("\n");
  return `**${m.title}**\n\n| 방향 | 점수(0~100, 응답 환산값) | 점수가 기운 쪽 |\n| --- | --- | --- |\n${rows}`;
}).join("\n\n");

const lifeSample: Record<string, LifeValue> = Object.fromEntries(LIFE_ITEMS.map((i, n) => [i.id, ((n % 4) + 1) as LifeValue]));
lifeSample["L02-1"] = 4;
lifeSample["L02-2"] = 1;
lifeSample["L02-3"] = 4;
const lifeExample = readLifeAreas(lifeSample)
  .slice(0, 4)
  .map((r) => {
    const a = LIFE_AREAS.find((x) => x.id === r.area)!;
    return `| ${a.id} ${a.name} | ${r.kind === "clear" ? `뚜렷한 방향: ${r.text}` : r.text} |`;
  })
  .join("\n");

// ── 새 설계 36문항 ──
const lifeItemBlocks = LIFE_AREAS.map((a) => {
  const items = LIFE_ITEMS.filter((i) => i.area === a.id)
    .map((i) => `| ${i.id} | ${i.scene} | ${i.statement} | ${i.agree === "a" ? `A · ${a.a}` : `B · ${a.b}`} | ${i.note} |`)
    .join("\n");
  return `**${a.id} ${a.name}** — ${a.asks}\n\n| ID | 장면 | 문항 | "자주"가 가리키는 쪽 | 이 장면을 고른 이유 |\n| --- | --- | --- | --- | --- |\n${items}\n\n겹칠 수 있는 널리 쓰이는 개념: ${a.overlap}`;
}).join("\n\n");

// ── 부록: 초안 30문항 · 심화 36문항 ──
const draftBlocks = DRAFT_ITEMS.map((it) => {
  const per = PERSPECTIVES[it.primary];
  const opts = it.options.map((o) => `  - ${o.text} → ${o.unscored ? `점수 제외(이유: ${o.reason ?? "기록"})` : `${per.name} ${ARROW[String(o.w[it.primary])] ?? ""}`}`).join("\n");
  return `- **${it.id}** (${it.scene} · ${DOMAIN_LABEL[it.domain]} · ${per.name}) ${it.stem}\n${opts}\n  - 공통: ${NA_OPTION_TEXT}`;
}).join("\n");

const deepBlocks = DEEP_ITEMS.map((it) => {
  const def = DEEP_SUB_DEFS[it.sub as keyof typeof DEEP_SUB_DEFS];
  const opts = it.options.map((o) => `  - ${o.text} → ${o.unscored ? `점수 제외(이유: ${o.reason ?? "기록"})` : `${def.name} ${ARROW[String(o.w)] ?? ""}`}`).join("\n");
  return `- **${it.id}** (${it.scene} · ${def.name}) ${it.stem}\n${opts}\n  - 공통: ${NA_OPTION_TEXT}`;
}).join("\n");

// ── 수정 이력(git) — 문항 · 채점 · 기록 파일의 실제 커밋 기록 ──
let history = "(git 기록을 읽지 못했다)";
try {
  history = execFileSync(
    "git",
    ["log", "--date=short", "--format=- %ad %h %s", "--", "lib/assessment", "docs/assessment-design-v1.md", "docs/assessment-deep-questions-v01.md", "docs/assessment-source-audit.md", "docs/assessment-life-behavior-v1.md"],
    { encoding: "utf8", cwd: new URL("..", import.meta.url) },
  )
    .trim()
    .split("\n")
    .slice(0, 30)
    .join("\n");
} catch {
  /* git이 없으면 위 문구 그대로 */
}

const doc = `# 미유 성향 질문 — 출시 전 검토용 묶음 (${PROVENANCE_DATE} 생성, 검토 전)

**이 묶음은 법률 판단도 검증 결과도 아니다.** 법적으로 문제가 되는지 · 측정이 타당한지는 확인하지 못했고 미유(AI 도구)가 판단할 수도 없다. 전문가가 볼 **실제 문항 · 채점 방식 · 결과 예시 · 개발 기록**을 한 파일에 모았다. 문항 · 채점 값은 코드에서 읽어 만든다(\`node scripts/render-assessment-review-pack.ts\`).

## 0. 먼저 읽을 것

- **검토는 두 가지로 나뉜다.** (A) **저작권 검토** — 기존 검사의 문항 · 해설 · 채점표 · 규준과 겹치는지, 구성이 닮은 것이 문제인지(검사 저작권 · 상표를 다루는 전문가). (B) **측정 품질 검토** — 문항이 의도한 뜻으로 읽히는지 · 같은 사람이 다시 답해도 비슷한지 · 점수 규칙이 타당한지(심리측정 전문가). 한 전문가가 둘 다 볼 수도 있지만 묻는 것이 다르다.
- **지금 침해가 확인된 것은 없다. 문제가 없다고 확인된 것도 없다.** 확인한 것: 저장소에 외부 검사 문항 · 번역문 · 채점표 · 응답 데이터 파일이 없다. 확인하지 못한 것: 공식 검사 원문과의 대조, 유료 검사 · 해설서 · 인터넷 재게시물 등 **다른 경로로 접한 표현이 섞였는지**, AI 도구가 학습한 자료와 닮았는지(출처를 추적할 수 없다).
- **기존에 발급된 리포트와 저장된 응답은 건드리지 않았다.** 이번에 바꾼 것은 화면 이름(예전 "MBTI 성향" → "평소 행동 방식")과 글자 코드를 화면에서 보이지 않게 한 것뿐이고, 저장된 내용은 그대로다. 아래 새 설계(36문항)와 초안들은 **검토용 초안이며 화면에 연결하지 않았다.**
- 미유는 이름을 바꾸거나 안내 문구를 붙이는 것으로 해결하지 않는다. 문항 · 채점 · 해설을 **미유가 알아보려는 생활 행동**에서 독립적으로 설계했고(4장), 기존 이론을 참고했다는 이유만으로 개념을 지우지는 않는다(아이디어와 구체적 표현은 구분된다). 기존 검사를 재현하라는 지시는 어디에도 쓰지 않았다.
- 공식 MBTI® · TCI · 애착검사처럼 표시하지 않고, 검증하지 않은 정확도 · 백분위 · 진단 · 유형 확정을 제공하지 않는다(결과는 응답 환산값이며 영역별로 따로 보인다).

## 1. 문항 묶음 4개

| 묶음 | 문항 수 | 상태 | 화면 연결 |
| --- | --- | --- | --- |
| 화면의 22문항 — 평소 행동 방식 8 · 기질 8 · 관계(애착) 6 | ${liveCount} | **개발용 예시 dev-0.1** | **연결됨**(무료 분석에서 응답) |
| 상황형 초안 ${DRAFT_CONTENT_VERSION} | ${DRAFT_ITEMS.length} | 초안 · 시범 인터뷰 전 | 연결 안 함 |
| 심화 초안 ${DEEP_QUESTIONS_VERSION} | ${DEEP_ITEMS.length} | 초안 · 시범 인터뷰 전 | 연결 안 함 |
| **생활 행동 독립 설계 ${LIFE_BEHAVIOR_VERSION}** | ${LIFE_ITEMS.length} | 초안 · 검토 대상 | 연결 안 함 |

# 검토 A — 저작권 (검사 저작권 전문가용)

## A-1. 개발 과정 (사실만)

${DEVELOPMENT.map((t) => `- ${t}`).join("\n")}

확인한 것
${CHECKED.map((t) => `- ${t}`).join("\n")}

확인하지 못한 것
${NOT_CHECKED.map((t) => `- ${t}`).join("\n")}

- 문항을 쓸 당시의 문항별 메모는 남기지 않았다. 문항별 기록은 ${PROVENANCE_DATE}에 문장을 보고 다시 정리한 것이다. 실제 수정 이력은 이 문서 맨 아래 git 기록이다.

## A-2. 참고한 자료와 이용 조건

| 자료 | 쓴 것 | 이용 허락 범위 |
| --- | --- | --- |
${SOURCES.map((s) => `| ${s.name} | ${s.used} | ${s.scope} |`).join("\n")}

## A-3. 닮음 표시를 읽는 법

- **원문과 대조한 것이 아니다.** 공식 검사의 문항 원문을 가지고 있지 않아, 아래 표시는 미유의 **기억과 판단**에 기댄 것이며 "닮지 않았다"는 보증이 아니다. 전문가가 원문과 직접 대조해야 한다.
- 우선 확인(${checkIds.join(" · ")}): ${SIMILARITY_LABEL.check}. **먼저 원문과 대조해 달라고 요청할 대상이고, 교체를 권한다.**
- 주제 흔함: ${SIMILARITY_LABEL.common}. 같은 주제의 문항이 많은 검사에 있다는 뜻이며 문장이 같다는 뜻이 아니다.

## A-4. 화면에 연결된 22문항 전문

응답은 5단계(${LIKERT_OPTIONS.map((o) => o.label).join(" · ")})이고 반대 방향 문항은 6에서 응답을 뺀 값으로 계산한다.

| ID | 묶음 | 문항 | 점수 계산 | 점수 읽는 법 | 기존 검사와의 닮음 표시 | 이렇게 쓴 이유 |
| --- | --- | --- | --- | --- | --- | --- |
${liveRows}

## A-5. 구조가 닮은 점 (문장이 아니라 방향을 나눈 틀)

| 묶음 | 기존 이론과의 대응 | 가져오지 않은 것 | 지금의 쓰임 |
| --- | --- | --- | --- |
${moduleRows}

그 밖에 초안의 구성(상황형 초안의 13관점, 12유형 설계안의 7방향, 심화 초안의 7영역 25항목)도 같은 이론의 구성과 닮았다. 자세한 점검은 \`assessment-source-audit.md\`.

## A-6. 독립 설계 초안 ${LIFE_BEHAVIOR_VERSION} — 36문항 전문

영역을 이론 용어가 아니라 **생활 장면**으로 정했다. 문항은 "${LIFE_PROMPT}"에 이어 **지난 한두 달 동안의 행동 빈도**를 묻는다: ${LIFE_OPTIONS.map((o) => `"${o.text}"`).join(" · ")} · "${LIFE_NONE_TEXT}"(점수 제외). A · B는 서로 다른 행동 방식일 뿐 좋고 나쁨이 아니다.

${lifeItemBlocks}

(채점 방향 글은 코드 \`lifeScoringText\`가 만든다. 예: ${lifeScoringText(LIFE_ITEMS[0]!)})

## A-7. 전문가에게 물을 것 (저작권)

1. 방향을 나눈 구성이 기존 검사와 닮은 것이 문제가 되는가 — 지금 화면의 구성(4 · 4 · 2)과 독립 설계(생활 장면 12개)를 각각.
2. 우선 확인 표시 문항(${checkIds.join(" · ")})과 같은 주제의 문항을 쓰려면 어느 정도로 달라야 하는가. 22문항 전체를 원문과 대조하는 방법.
3. 영역 이름에 일반 낱말("기질 · 성격 · 애착")을 쓰는 것, 사용자가 입력한 MBTI 유형을 "MBTI"라고 표시하는 것의 상표 범위.
4. 초안을 AI 도구의 도움으로 쓴 사실을 개발 기록에 어떻게 남기고 관리할지. 그리고 "접하지 않았다"를 입증하는 기록으로 무엇이 충분한지.
5. 공개 안내 페이지(\`/assessment-basis\`)의 문구가 적절한지 — 이 페이지는 법적 안전을 보장한다고 쓰지 않았다.

# 검토 B — 측정 품질 (심리측정 전문가용)

측정 품질은 **확인하지 못했다.** 아래는 지금 있는 채점 규칙과 한계다. 가상 응답 점검(\`assessment-reliability-sim.md\`)은 실제 사람의 응답이 아니며 신뢰도 · 타당도 증거가 아니다.

## B-1. 채점 · 읽기 규칙

- **화면의 22문항**: 지표마다 문항 평균(1~5, 반대 방향은 6−응답)을 0~100으로 옮긴 값(평균 1 → 0, 평균 5 → 100). 백분위 · 정확도가 아니고 높고 낮음이 좋고 나쁨도 아니다. 영역을 합치지 않고 유형 이름을 붙이지 않는다. 지표당 문항은 1~3개다.
- **상황형 초안 ${DRAFT_SCORING_VERSION}**: 문항 하나는 주 관점 하나에만 점수를 주고, 서로 다른 문항 ${MIN_INDICATORS}개 이상 응답이 있어야 읽는다. 가운데(50)에서 ${CLEAR_DISTANCE} 이상이면 뚜렷한 방향, 아니면 "${UNCLEAR_TEXT}", 문항이 모자라면 "${HOLD_TEXT}". 같은 행동이어도 이유가 다른 답은 점수에 넣지 않고 이유만 남긴다.
- **심화 초안 ${DEEP_SCORING_VERSION}**: 같은 규칙, 세부 항목 12개 × 3문항.
- **독립 설계 ${LIFE_SCORING_VERSION}**: 영역 3문항에 모두 답해야 읽고(해당 없음이 있으면 "${LIFE_HOLD_TEXT}"), 가운데에서 ${LIFE_CLEAR_DISTANCE} 이상이면 뚜렷한 방향, 아니면 "${LIFE_UNCLEAR_TEXT}". 영역 안에서 "자주"가 가리키는 방향을 섞어 같은 답만 고르는 습관이 뚜렷한 결과가 되지 않게 했다(테스트로 확인).
- 하지 않는 것: 영역을 합친 점수, 유형 이름(12유형은 화면에 연결하지 않았다), 사주 점수와의 합산, 공식 검사 점수로의 환산.

## B-2. 결과 예시

**임의의 응답으로 계산한 예시이며 실제 사람이 아니다.** (화면 22문항의 응답 환산값)

${resultExample}

(독립 설계 — 임의의 응답, 처음 4개 영역만)

| 영역 | 읽은 결과 |
| --- | --- |
${lifeExample}

실제 화면의 결과 문장은 점수 숫자를 본문에 쓰지 않고, 고민과 이어지는 2~3개 관점을 상황 → 반응 → 강점과 어려움 → 작은 행동 순서로 쓴다. 측정하지 않은 성향은 "자료 없음"으로 둔다.

## B-3. 확인하지 못한 것 · 필요한 자료

- 문항이 사람들에게 의도한 뜻으로 읽히는지(시범 인터뷰: 풀고 "왜 이 답을 골랐는지" 말하기) — 하지 못했다.
- 같은 사람이 다시 답해도 비슷한지(2주 뒤 재응답), 문항 간 일관성, 요인 구조 — 실제 응답 자료가 없다.
- 지난 한두 달 기억에 의존하는 방식(독립 설계)의 기억 쏠림, 영역당 3문항으로 충분한지.
- 30문항으로는 13관점 중 서로 다른 문항 3개 이상으로 읽을 수 있는 관점이 5개뿐이다(\`assessment-reliability-sim.md\`, 가상 응답).

## B-4. 전문가에게 물을 것 (측정 품질)

1. 영역당 3문항으로 "뚜렷한 방향"을 읽는 규칙(가운데에서 20 이상)이 적절한가. 문항 수 · 응답 형식(빈도 4단계 + 해당 없음)의 제안.
2. 정방향 · 반대 방향 문항을 영역 안에서 2 : 1로 섞은 설계가 응답 습관을 가리는 데 충분한가.
3. 시범 인터뷰 · 시범 응답의 최소 규모와 순서, 재응답 간격.
4. 결과를 "경향"으로만 표현하는 문구가 과장 없이 적절한지(진단 · 정확도 표현 금지 기준).

# 부록

## 부록 1. 상황형 초안 ${DRAFT_CONTENT_VERSION} 30문항 전문 (화면 미연결)

화살표는 선택지가 그 관점의 점수에 주는 방향(↑ 높은 쪽 · ↓ 낮은 쪽, 두 개는 더 센 쪽)이다.

${draftBlocks}

## 부록 2. 심화 초안 ${DEEP_QUESTIONS_VERSION} 36문항 전문 (화면 미연결)

${deepBlocks}

## 부록 3. 수정 이력 (git 기록, 생성 시점)

${history}
`;

writeFileSync(new URL("../docs/assessment-expert-review-pack.md", import.meta.url), doc);
console.log(`docs/assessment-expert-review-pack.md (${doc.length}자)`);
