// 미유 자체 심화 검사 첫 묶음 문서(docs/assessment-deep-questions-v01.md)를 코드에서 만든다.
// 문항 · 선택지 · 점수 방향 · 세부 항목 정의 · 숫자는 모두 lib/assessment/drafts/deep-*.ts에서 읽어 와서 문서와 코드가 어긋나지 않게 한다.
// 실행: node scripts/render-assessment-deep-questions.ts   (miyu 폴더에서)
import { writeFileSync } from "node:fs";
import { DEEP_DOMAINS, SECONDS_PER_QUESTION, TOTAL_QUESTION_BUDGET, firstBundle } from "../lib/assessment/drafts/deep-design.ts";
import { DEEP_ITEMS, DEEP_QUESTIONS_VERSION, DEEP_SCORING_VERSION, DEEP_SUB_DEFS, FIRST_BUNDLE_SUB_IDS, HOLD_TEXT, UNCLEAR_TEXT, type DeepItem, type DeepOption } from "../lib/assessment/drafts/deep-questions.ts";
import { CLEAR_DISTANCE, MIN_INDICATORS, NA_OPTION_TEXT } from "../lib/assessment/drafts/situational-draft.ts";

const bundle = firstBundle();
const ARROW: Record<string, string> = { "2": "↑↑", "1": "↑", "-1": "↓", "-2": "↓↓" };
const KIND: Record<DeepItem["kind"], string> = { feeling: "마음의 크기", behavior: "행동 · 방식", reason: "같은 행동의 이유" };
const groupOf = (subId: string) => DEEP_DOMAINS.find((d) => d.id === subId.slice(0, 2))!;

const optionDir = (item: DeepItem, o: DeepOption) => {
  if (o.unscored) return `**점수에 넣지 않음** · 이유 기록: ${o.reason}`;
  return `${DEEP_SUB_DEFS[item.sub as keyof typeof DEEP_SUB_DEFS].name} ${ARROW[String(o.w)]}`;
};

const defRows = FIRST_BUNDLE_SUB_IDS.map((id) => {
  const d = DEEP_SUB_DEFS[id];
  const dom = groupOf(id);
  return `| ${id} | ${dom.name}<br>(${dom.group}) | **${d.name}** | ${d.means} | ${d.notThis} | ${d.vs} | ${d.high} | ${d.low} |`;
}).join("\n");

const overviewRows = FIRST_BUNDLE_SUB_IDS.map((id) => {
  const items = DEEP_ITEMS.filter((i) => i.sub === id);
  return `| ${id} ${DEEP_SUB_DEFS[id].name} | ${items.map((i) => `${i.id} ${i.scene}`).join(" · ")} | ${items.some((i) => i.options.some((o) => o.unscored)) ? "있음 (점수에 넣지 않는 답 1개)" : "—"} |`;
}).join("\n");

const itemBlocks = FIRST_BUNDLE_SUB_IDS.map((sub) => {
  const def = DEEP_SUB_DEFS[sub];
  const dom = groupOf(sub);
  const blocks = DEEP_ITEMS.filter((i) => i.sub === sub)
    .map((item) => {
      const rows = item.options.map((o) => `| ${o.id} | ${o.text} | ${optionDir(item, o)} |`).join("\n");
      return `#### ${item.id} · ${item.topic} (장면: ${item.scene} · 묻는 것: ${KIND[item.kind]})

${item.stem}

- 알고 싶은 것: ${item.purpose}

| 선택지 | 내용 | 점수에 주는 방향 |
| --- | --- | --- |
${rows}
| 공통 | ${NA_OPTION_TEXT} | 점수에 넣지 않음 |
`;
    })
    .join("\n");
  return `### ${sub} ${def.name} — ${dom.name} (${dom.group})

${blocks}`;
}).join("\n");

const doc = `# 미유 자체 심화 검사 — 첫 묶음 문항 초안 (${DEEP_QUESTIONS_VERSION}, 검토 전)

- 상태: **초안** · 채점 규칙 ${DEEP_SCORING_VERSION}. **검사 화면 · 저장 · 리포트에는 연결하지 않았다.** 시범 인터뷰 · 시범 응답을 본 뒤 고친다.
- 코드: \`lib/assessment/drafts/deep-questions.ts\`(세부 항목 정의 · 채점) · \`deep-items-a/b/c.ts\`(문항 36개) · \`deep-item-kit.ts\`(문항 만드는 도구) · \`deep-questions.test.ts\`(구조 · 균형 · 채점 검사). 이 문서는 \`node scripts/render-assessment-deep-questions.ts\`로 코드에서 만든다. 설계안은 \`assessment-deep-design-v1.md\`.
- **공식 검사(TCI · MBTI® · 애착검사 등)의 문항 · 채점표 · 척도 이름을 가져오지 않았다.** 문항은 모두 미유가 새로 썼다. 결과를 공식 검사 점수로 바꾸지 않으며 "공식 검사 · 정확도"라고 쓰지 않는다. 진단이 아니다.

## 1. 무엇을 하는 묶음인가

- 운영자 요청(2026-10-15): *무료 분석 문항 + 심화 문항을 합쳐 ${TOTAL_QUESTION_BUDGET.min}~${TOTAL_QUESTION_BUDGET.max}개* — 길면 중간에 그만둔다. 그래서 설계안의 세부 항목 25개를 모두 묻지 않고, **지금 검사 화면의 문항이 재지 못하는 세부 항목 ${bundle.subs.length}개**를 서로 다른 장면 ${MIN_INDICATORS}문항씩 묻는다.
- **문항 ${bundle.items}개** = 세부 항목 ${bundle.subs.length}개 × ${MIN_INDICATORS}문항. 지금 무료 분석에 연결된 ${bundle.liveItems}문항과 합치면 **${bundle.total}문항**(${TOTAL_QUESTION_BUDGET.min}~${TOTAL_QUESTION_BUDGET.max}문항 범위 ${bundle.withinBudget ? "안" : "**밖**"}).
- **푸는 시간 어림**: 심화만 약 ${bundle.deepMinutes}분, 무료 분석과 이어서 풀면 약 ${bundle.totalMinutes}분 — 문항당 ${SECONDS_PER_QUESTION}초로 센 **어림이며 직접 재지 않았다**. 시범 응답으로 재면 고친다.
- 영역 일곱 가지 중 **"${bundle.domainsWithoutItems.join(" · ") || "없음"}" 영역에는 이번 묶음의 문항이 없다** — 그 영역의 결과는 "자료 없음"이며 글 · AI가 있는 것처럼 쓰지 않는다. 나머지 세부 항목 ${bundle.later.length}개도 문항이 아직 없다.

| 세부 항목 | 장면(문항) | 점수에 넣지 않는 답 |
| --- | --- | --- |
${overviewRows}

## 2. 세부 항목 정의 — 무엇이고, 무엇이 아니고, 이웃 항목과 어떻게 다른가

높은 쪽 · 낮은 쪽은 방향일 뿐 좋고 나쁨이 아니다. 기질 · 성격 · 가까운 관계는 **따로** 설명하고 하나의 점수로 합치지 않는다.

| ID | 영역 | 세부 항목 | 이 항목이 가리키는 것 | 비슷해 보이지만 이 항목이 아닌 것 | 이웃과의 구분 | 높은 쪽 | 낮은 쪽 |
| --- | --- | --- | --- | --- | --- | --- | --- |
${defRows}

## 3. 읽는 규칙 (30문항 초안 0.2와 같다)

- 문항 하나는 **세부 항목 하나**에만 점수를 준다. 선택지는 4개 + 모든 문항에 같이 붙는 "${NA_OPTION_TEXT}"(점수에 넣지 않음).
- 선택지의 보이는 순서는 문항 번호로 정한 고정 순열(높음 → 낮음으로 줄 서지 않게)이다. 위 표의 순서가 그대로 보이는 순서다.
- 서로 다른 문항 **${MIN_INDICATORS}개 이상**의 응답이 있어야 방향을 읽고, 모자라면 "${HOLD_TEXT}"다. **한 문항만 건너뛰어도 그 세부 항목은 보류된다**(${MIN_INDICATORS}문항이 최소선이라서).
- 읽는 규칙은 두 단계뿐 — 가운데(50)에서 ${CLEAR_DISTANCE} 이상 떨어지면 뚜렷한 방향, 아니면 "${UNCLEAR_TEXT}". "약간 ~한 편" · "고르게"를 나누지 않는다.
- **같은 행동이어도 이유가 다른 답은 점수에 넣지 않고 이유만 남긴다**(거절 · 경계의 "그 일이 좋아서", 갈등에서 의견을 말함의 "설득돼서").
- **영역 · 전체로 합친 점수 · 유형 이름을 만들지 않는다.** 사주 점수와 합산하지 않고, 검사 점수를 사주로 바꾸지 않는다. 0~100은 응답 환산값이며 백분위 · 정확도가 아니다.
- 리포트에는 세부 항목 12개를 점수표처럼 늘어놓지 않고, 고민과 이어지는 **2~3개**를 상황 → 반응 → 강점과 어려움 → 작은 행동 순서로 쓴다. 측정하지 않은 항목은 쓰지 않는다.

## 4. 문항 ${bundle.items}개

문항 번호는 세 번의 회차(E01~E12 · E13~E24 · E25~E36)이며 한 회차에 세부 항목이 한 번씩 나온다 — 같은 세부 항목의 문항이 연달아 나오지 않는다. 같은 세부 항목은 서로 다른 장면 3개에서 묻는다.

${itemBlocks}
## 5. 확인한 것 · 확인하지 못한 것

**확인한 것 (\`npm test\`의 \`deep-questions.test.ts\` · \`deep-design.test.ts\`)**
- 문항 ${bundle.items}개 · 세부 항목 ${bundle.subs.length}개 × ${MIN_INDICATORS}문항, 세부 항목마다 장면이 서로 다름, 선택지 수 · 길이 · 점수 세기 · 점수 제외 답의 이유 표시.
- 높은 쪽 · 낮은 쪽 선택지의 위치와 글자 수가 한쪽으로 쏠리지 않고, 정답처럼 보이는 낱말 · 공식 검사 이름 · 단정 표현이 없음.
- 채점: 점수를 주는 선택지를 같은 확률로 고르는 사람이 가운데(0)가 되고, 무작위 응답 5,000명의 평균이 세부 항목마다 50 근처이며, 한 방향으로 일관되게 답하면 뚜렷하게 · 방향이 갈리면 "${UNCLEAR_TEXT}", 해당 없음은 점수 제외, 한 문항만 건너뛰어도 보류.
- 설계안(\`deep-design.ts\`)의 세부 항목 이름 · 문항 수와 이 문항이 같고 합계가 ${TOTAL_QUESTION_BUDGET.min}~${TOTAL_QUESTION_BUDGET.max}문항 안임.

**확인하지 못한 것 — 이 숫자들은 문항 구조의 검사일 뿐 실제 신뢰도 · 타당도가 아니다**
- **실제 사람의 응답이 한 건도 없다.** 같은 세부 항목의 세 문항이 정말 같은 것을 재는지(문항끼리의 일관성), 다시 풀면 같게 나오는지는 모른다.
- 사람들이 질문을 문항 뜻대로 읽는지 · 선택지가 자기 모습을 담는지 시범 인터뷰(\`assessment-pilot-protocol.md\`)로 확인하지 않았다. "해당 없음"을 얼마나 고르는지도 모른다.
- 푸는 시간(어림 약 ${bundle.deepMinutes}분 · 합쳐 약 ${bundle.totalMinutes}분)은 문항당 ${SECONDS_PER_QUESTION}초로 센 어림이며 직접 재지 않았다. 58문항이 중간에 그만두지 않을 길이인지도 시험하지 않았다.
- 같은 세부 항목을 장면을 바꿔 물어도 같은 것으로 읽히는지, 선택지가 점수 방향을 짐작하게 하지 않는지는 사람이 읽어 보지 않았다(자동 검사는 위치 · 길이 · 낱말만 본다).
- 세부 항목의 이웃 구분(알아챔 vs 공감, 성취 vs 완벽, 낯선 긴장 vs 사교성 등)은 정의로 적었을 뿐 응답으로 확인하지 않았다.
- 이 묶음을 무료 분석 뒤 어디에 붙일지 · 가격 · 심층 리포트와의 연결은 정해지지 않았다.

## 6. 운영자가 정할 것

1. **12개 세부 항목이 맞는지**(다른 것을 먼저 묻고 싶은지) — 바꾸면 문항을 새로 쓴다.
2. **문항 글 검토**: 말이 어색하거나 장면이 낯선 문항, 정답처럼 읽히는 선택지를 표시해 주세요.
3. **나머지 ${bundle.later.length}개 세부 항목과 "${bundle.domainsWithoutItems.join(" · ") || "없음"}" 영역**을 어떻게 할지 — 같은 방식으로 더하면 ${TOTAL_QUESTION_BUDGET.max}문항을 넘는다(\`assessment-deep-design-v1.md\` 7절).
4. **시범 인터뷰를 먼저** 하고 문항 수정 → 시범 응답 순서로 간다. 시뮬레이션 숫자를 맞추려고 문항을 고치지 않는다.
5. 화면에 연결하기 전에 세부 항목 이름을 쉬운 말로 바꾼다(지금 이름은 설계용).
`;

writeFileSync(new URL("../docs/assessment-deep-questions-v01.md", import.meta.url), doc);
console.log(`docs/assessment-deep-questions-v01.md 생성 — 문항 ${bundle.items}개 · 세부 항목 ${bundle.subs.length}개 · 무료 ${bundle.liveItems} + 심화 ${bundle.items} = ${bundle.total}문항`);
