// 생활 행동 질문 독립 설계 초안 문서(docs/assessment-life-behavior-v1.md)를 코드에서 만든다.
// 영역 · 문항 · 채점 방향 · 읽는 규칙은 모두 lib/assessment/drafts/life-behavior-v1.ts에서 읽어 와서 문서와 코드가 어긋나지 않게 한다.
// 실행: node scripts/render-life-behavior.ts   (miyu 폴더에서)
import { writeFileSync } from "node:fs";
import {
  LIFE_AREAS,
  LIFE_BEHAVIOR_DATE,
  LIFE_BEHAVIOR_VERSION,
  LIFE_CLEAR_DISTANCE,
  LIFE_HOLD_TEXT,
  LIFE_ITEMS,
  LIFE_ITEMS_PER_AREA,
  LIFE_NONE_TEXT,
  LIFE_OPTIONS,
  LIFE_PROMPT,
  LIFE_SCORING_VERSION,
  LIFE_UNCLEAR_TEXT,
  lifeScoringText,
  readLifeAreas,
  type LifeValue,
} from "../lib/assessment/drafts/life-behavior-v1.ts";

// 앞선 초안과 같은 일상 주제를 다루는 영역 — 숨기지 않고 적는다 (손으로 정리한 표이며 코드로 검사하지 않는다)
const TOPIC_OVERLAP: [string, string][] = [
  ["L01 계획이 바뀔 때", "화면의 계획 · 일정 문항(m7 · m8)과 일부 같은 주제"],
  ["L02 시작하는 방식", "화면의 계획 · 대비 문항(t3 · t4 · m7 · m8)과 닿는 주제"],
  ["L03 마무리하는 방식", "화면의 이어 가기 문항(t7 · t8) · 심화 초안의 어려워도 이어 감과 같은 주제"],
  ["L04 결정하는 방식", "화면 문항에는 직접 대응이 없다 (m5 · m6은 결정의 기준이고 이것은 비교하는 정도 · 걸리는 시간)"],
  ["L05 새로운 시도", "화면의 새로움 문항(t1 · t2)과 같은 주제"],
  ["L06 감정이 올라올 때", "30문항 초안의 행동을 늦춰 고름 · 심화 초안의 행동을 조절함(D5-3)과 같은 주제"],
  ["L07 마음을 표현할 때", "화면의 속마음 문항(r4) · 심화 초안의 마음을 드러내는 편안함(D3-3) · 애정 표현과 같은 주제"],
  ["L08 갈등에서 의견을 말할 때", "심화 초안의 갈등에서 의견을 말함(D6-4)과 같은 주제"],
  ["L09 부탁을 받았을 때", "심화 초안의 거절 · 경계 세우기(D6-3)와 같은 주제"],
  ["L10 다툰 뒤", "심화 초안의 갈등 뒤 회복(D7-4)과 같은 주제"],
  ["L11 혼자 · 함께 쉬는 방식", "화면의 에너지 문항(m1 · m2) · 혼자 필요한 시간(r5)과 같은 주제"],
  ["L12 답이 없을 때", "화면의 연락 문항(r1 · r2) · 확인받고 싶은 마음과 같은 주제"],
];

const areaRows = LIFE_AREAS.map((a) => `| ${a.id} | **${a.name}** | ${a.asks} | ${a.a} | ${a.b} | ${a.notThis} | ${a.overlap} |`).join("\n");

const itemBlocks = LIFE_AREAS.map((a) => {
  const items = LIFE_ITEMS.filter((i) => i.area === a.id)
    .map((i) => `- **${i.id}** (${i.scene}) ${i.statement}\n  - "자주 · 거의 매번"이 가리키는 쪽: ${i.agree === "a" ? `A — ${a.a}` : `B — ${a.b}`}\n  - ${lifeScoringText(i)}\n  - 이 장면을 고른 이유: ${i.note}`)
    .join("\n");
  return `### ${a.id} ${a.name}\n\n${a.asks}. (A: ${a.a} · B: ${a.b})\n\n${items}\n`;
}).join("\n");

// 채점 예시 — 코드로 계산한다
const strong = (area: string, pole: "a" | "b"): Record<string, LifeValue> =>
  Object.fromEntries(
    LIFE_ITEMS.filter((i) => i.area === area).map((i) => [i.id, (i.agree === pole ? 4 : 1) as LifeValue]),
  );
const first = LIFE_AREAS[0]!;
const exA = readLifeAreas(strong(first.id, "a")).find((r) => r.area === first.id)!;
const exMid = readLifeAreas(Object.fromEntries(LIFE_ITEMS.filter((i) => i.area === first.id).map((i) => [i.id, 3 as LifeValue]))).find((r) => r.area === first.id)!;
const noneIds = LIFE_ITEMS.filter((i) => i.area === first.id).map((i) => i.id);
const exHold = readLifeAreas({ ...strong(first.id, "a"), [noneIds[0]!]: null }).find((r) => r.area === first.id)!;
const show = (r: ReturnType<typeof readLifeAreas>[number]) => (r.kind === "hold" ? `${r.text} (답한 문항 ${r.answered}개)` : r.kind === "unclear" ? `${r.text} (A 방식 쪽 위치 ${r.position})` : `뚜렷한 방향: ${r.text} (A 방식 쪽 위치 ${r.position})`);

const doc = `# 미유 생활 행동 질문 — 독립 설계 초안 (${LIFE_BEHAVIOR_VERSION}, ${LIFE_BEHAVIOR_DATE}, 검토 전)

- 상태: **초안.** 채점 규칙 ${LIFE_SCORING_VERSION}. **검사 화면 · 저장 · 리포트에는 연결하지 않았다.** 시범 인터뷰 · 시범 응답 · 검사 저작권 전문가 검토를 거치기 전에는 연결하지 않는다.
- 코드: \`lib/assessment/drafts/life-behavior-v1.ts\`(영역 · 문항 · 채점 · 읽기) · \`life-behavior-v1.test.ts\`. 이 문서는 \`node scripts/render-life-behavior.ts\`로 코드에서 만든다. 출처 점검은 \`assessment-source-audit.md\`.
- 초안은 AI 도구(Claude)의 도움으로 정리했고 운영자가 아직 확인하지 않았다.

## 1. 왜 새로 설계했나

운영자 요청(2026-10-15): 자체 검사를 만드는 것 자체가 문제가 아니라, **독립적으로 개발했는지 · 기존 검사를 가져왔는지**가 핵심이다. 이름을 바꾸거나 문장만 바꾼다고 독립이 되지 않는다. 점검 결과(\`assessment-source-audit.md\`) 지금 화면의 22문항은 문장은 직접 썼지만 **방향을 나눈 틀(4 + 4 + 2)이 기존 이론의 틀과 닮았다.** 그래서 이론의 틀이 아니라 **미유가 알아보려는 일상 행동**(계획이 바뀔 때의 대응 · 갈등에서 의견을 말하는 방식 · 시작과 마무리 습관 등)에서 영역을 새로 정했다.

## 2. 앞선 초안과 다른 점

| | 지금 화면 22문항 · 앞선 초안 | 이 설계 |
| --- | --- | --- |
| 영역을 정한 기준 | 기질 · 성격 · 가까운 관계라는 묶음 아래 이론에서 익숙한 방향들 | **생활 장면**(${LIFE_AREAS.length}개) — 이론 용어를 영역 이름으로 쓰지 않는다 |
| 문항 형식 | "나는 ~하다" 성향 진술, 또는 장면 + 선택지 4개 | **지난 한두 달 동안 실제로 한 행동의 빈도**를 묻는다: ${LIFE_OPTIONS.map((o) => `"${o.text}"`).join(" · ")} + "${LIFE_NONE_TEXT}" |
| 채점 근거 | 정문항 · 반대 방향 | 영역마다 두 행동 방식(A · B)을 정하고 **문항마다 "자주"가 어느 쪽인지 · 그 장면을 고른 이유**를 적는다 |
| 묶음 점수 · 유형 이름 | 만들지 않는다 | 만들지 않는다 (영역별로만 읽는다) |

## 3. 영역 ${LIFE_AREAS.length}개

A · B는 서로 다른 행동 방식일 뿐 좋고 나쁨이 아니다.

| ID | 영역 (생활 장면) | 알아보려는 행동 | A 방식 | B 방식 | 이 영역이 아닌 것 | 겹칠 수 있는 널리 쓰이는 개념 |
| --- | --- | --- | --- | --- | --- | --- |
${areaRows}

## 4. 문항 ${LIFE_ITEMS.length}개 (영역마다 서로 다른 장면 ${LIFE_ITEMS_PER_AREA}문항)

문항을 읽기 전 안내: "${LIFE_PROMPT}"  ·  선택지: ${LIFE_OPTIONS.map((o) => o.text).join(" / ")} / ${LIFE_NONE_TEXT}(점수 제외)

${itemBlocks}
## 5. 읽는 규칙

- 문항 하나의 응답은 영역의 A 방식 쪽 위치(0~100)로 옮긴다: 선택지 1~4를 0 · 33 · 67 · 100으로 놓고, "자주"가 B 방향인 문항은 뒤집는다. "${LIFE_NONE_TEXT}"는 점수에서 뺀다.
- 영역은 **${LIFE_ITEMS_PER_AREA}문항 모두 답했을 때만** 읽는다(하나라도 해당 없음이면 "${LIFE_HOLD_TEXT}"). 평균 위치가 가운데(50)에서 **${LIFE_CLEAR_DISTANCE} 이상** 벗어나면 뚜렷한 방향, 아니면 "${LIFE_UNCLEAR_TEXT}". "약간 ~한 편" · "고르게"로 나누지 않는다.
- 영역을 합친 점수 · 유형 이름 · 사주 점수와의 합산 · 공식 검사 점수로의 환산은 하지 않는다. 결과는 영역을 점수표처럼 늘어놓지 않고 고민과 이어지는 2~3개 영역을 상황 → 반응 → 강점과 어려움 → 작은 행동 순서로 쓴다.
- 영역마다 방향이 섞여 있어(2 : 1) 모든 문항에 같은 답을 골라도 뚜렷한 방향이 되지 않는다(테스트가 확인).

채점 예시(코드로 계산, 실제 응답이 아님):
- ${first.id} ${first.name}: A 방식 쪽 문항에 "거의 매번", B 방식 쪽 문항에 "거의 없었어요" → ${show(exA)}
- ${first.id}: 세 문항 모두 "자주 있었어요" → ${show(exMid)}
- ${first.id}: 한 문항이 "${LIFE_NONE_TEXT}" → ${show(exHold)}

## 6. 앞선 초안과 같은 일상 주제 (숨기지 않는다)

일상의 행동 주제는 앞선 초안 · 연구가 오래 다뤄 온 것과 겹칠 수밖에 없다. 겹치지 않는다고 주장하지 않는다.

| 이 설계의 영역 | 앞선 초안과 겹치는 주제 |
| --- | --- |
${TOPIC_OVERLAP.map(([a, b]) => `| ${a} | ${b} |`).join("\n")}

미유가 말할 수 있는 것은 **문항 문장 · 응답 형식 · 채점표를 가져오지 않았고 새로 썼다**는 것까지다. 주제가 겹치는 것이 문제가 되는지, 닮은 문장이 있는지는 판단하지 않았다.

## 7. 확인하지 못한 것 · 다음 단계

- **공식 검사의 문항 원문과 대조하지 못했다.** 원문 · 이용 허락 문서가 없다. 닮은 문장이 없다고 보증하지 않는다 → **검사 저작권을 다루는 전문가가 구체적인 설계안(이 문서 + 문항)을 보고 판단**해야 한다(운영자가 받는다).
- 시범 인터뷰(\`assessment-pilot-protocol.md\`와 같은 방식: 풀고 "왜 이 답을 골랐는지" 말하기)로 문항이 의도한 뜻으로 읽히는지, "지난 한두 달"을 떠올리기 쉬운지, "${LIFE_NONE_TEXT}"가 너무 자주 나오지 않는지 본다.
- 지난 한두 달의 기억에 의존하는 방식이라 기억의 쏠림(최근 일 · 인상 깊은 일)이 있을 수 있다.
- 영역당 문항이 3개뿐이라 하나만 해당 없음이어도 읽지 못한다. 시범 응답을 본 뒤 문항을 더하거나 영역을 줄인다.
- 신뢰도 · 타당도 · 정확도는 확인하지 못했다. 이 문서는 장면을 고른 이유와 채점 방향의 기록일 뿐이다.
- 지금 화면의 22문항은 이 설계로 바꾸기 전까지 **개발용 예시**이며 정식 검사로 쓰지 않는다. 바꾸기 전에 공개 페이지(\`/assessment-basis\`)의 문구를 함께 고친다.
`;

writeFileSync(new URL("../docs/assessment-life-behavior-v1.md", import.meta.url), doc);
console.log(`docs/assessment-life-behavior-v1.md (${doc.length}자)`);
