// 장면 질문 별도 버전 설계 초안 문서(docs/assessment-scenario-v1.md)를 코드에서 만든다.
// 구분 · 장면 · 선택지 · 조합 · 22문항 검토 · 서윤 예시는 모두 lib/assessment/drafts/scenario-v1.ts에서 읽어 와서 문서와 코드가 어긋나지 않게 한다.
// 실행: node scripts/render-assessment-scenario.ts   (miyu 폴더에서)
import { writeFileSync } from "node:fs";
import { ASSESSMENT_MODULES } from "../lib/assessment/modules/index.ts";
import {
  CANDIDATES,
  COMBOS,
  EXAMPLES,
  FALLBACK_READING,
  HOLD_TEXT,
  ITEM_REVIEWS,
  NONE_OPTIONS,
  SCENES,
  SCENE_BY_ID,
  SCENARIO_DATE,
  SCENARIO_READING_VERSION,
  SCENARIO_VERSION,
  SCENE_PROMPT,
  THREADS,
  readThread,
  textOverlap,
  type ScenarioAnswers,
  type SceneId,
} from "../lib/assessment/drafts/scenario-v1.ts";

const optLetter = { a: "가", b: "나", c: "다", d: "라" } as const;
const sceneBlock = (id: SceneId) => {
  const s = SCENE_BY_ID[id];
  return [
    `**${s.id} · ${s.label}**`,
    ``,
    `> ${s.ask}`,
    ``,
    ...s.options.map((o) => `> - ${optLetter[o.id]}. ${o.text}`),
    `> - ${NONE_OPTIONS.map((n) => n.text).join(" / ")} _(점수 없음 · 이 장면을 읽지 않음)_`,
    ``,
    `- 가르려는 차이: ${s.difference}`,
    `- 시범 인터뷰에서 확인할 것: ${s.watch}`,
    `- 내부 이름표(화면에 보이지 않음): ${s.options.map((o) => `${optLetter[o.id]}=${o.tag}`).join(" · ")}`,
  ].join("\n");
};

const comboCoverage = (threadId: string) => {
  const t = THREADS.find((x) => x.id === threadId)!;
  const [s1, s2] = t.scenes.map((id) => SCENE_BY_ID[id]!);
  let n = 0;
  const uncovered: string[] = [];
  for (const o1 of s1!.options) for (const o2 of s2!.options) {
    const r = readThread(t.id, { [s1!.id]: o1.id, [s2!.id]: o2.id } as ScenarioAnswers);
    if (r.kind === "combo") n++;
    else uncovered.push(`${optLetter[o1.id]}·${optLetter[o2.id]}`);
  }
  return { n, uncovered };
};

const threadBlocks = THREADS.map((t) => {
  const combos = COMBOS.filter((c) => c.thread === t.id);
  const [s1, s2] = t.scenes;
  const tagToLetter = (sceneId: SceneId, tag: string) => {
    const o = SCENE_BY_ID[sceneId].options.find((x) => x.tag === tag)!;
    return `${optLetter[o.id]}`;
  };
  const cov = comboCoverage(t.id);
  return `### ${t.id} · ${t.name}

- **구분하려는 차이**: ${t.asks}
- **리포트에서 쓰이는 영역**: ${t.blocks.join(" · ")}

${sceneBlock(s1)}

${sceneBlock(s2)}

**두 장면을 함께 읽는 대표 조합** (${s1} 답 × ${s2} 답 → 이 조합이 말해 주는 것, 점수가 아니다)

| 조합 | ${s1} | ${s2} | 이 조합이 말해 주는 것 | 붙이면 안 되는 결론 |
| --- | --- | --- | --- | --- |
${combos.map((c) => `| ${c.id} | ${c.first.map((x) => tagToLetter(s1, x)).join("·")} | ${c.second.map((x) => tagToLetter(s2, x)).join("·")} | ${c.meaning} | ${c.notThis} |`).join("\n")}

- 16개 답 쌍 중 대표 조합이 있는 것: **${cov.n}쌍**. 나머지(${cov.uncovered.join(", ") || "없음"})는 "${FALLBACK_READING}"
- **사주 연결 지점** — 같은 조합의 풀이가 사주 근거에 따라 달라지는 방식:
${t.sajuPairs.map((p) => `  - ${p.cue}: ${p.effect}`).join("\n")}
- **구분 전체에 붙이면 안 되는 결론**: ${t.notThis.join(" · ")}
- **겹칠 수 있는 널리 알려진 개념**: ${t.overlap}
`;
}).join("\n");

const overview = THREADS.map((t) => `| ${t.id} | ${t.name} | ${SCENE_BY_ID[t.scenes[0]].label} (${t.scenes[0]}) | ${SCENE_BY_ID[t.scenes[1]].label} (${t.scenes[1]}) |`).join("\n");

// 서윤 예시
const exampleBlocks = EXAMPLES.map((ex) => {
  const t = THREADS.find((x) => x.id === ex.thread)!;
  const side = (s: typeof ex.a, label: string) => {
    const r = readThread(ex.thread, s.answers as ScenarioAnswers);
    const picks = (Object.keys(s.answers) as SceneId[]).map((id) => `${id} ${optLetter[s.answers[id]!]}. ${SCENE_BY_ID[id].options.find((o) => o.id === s.answers[id])!.text}`).join(" / ");
    return [`**${label} — ${s.combo}**`, ``, `- 가상 답: ${picks}`, `- 조합의 의미: ${r.kind === "combo" ? r.combo.meaning : ""}`, ``, `> ${s.reading}`].join("\n");
  };
  const o = textOverlap(ex.a.reading, ex.b.reading);
  return `#### 예시 ${EXAMPLES.indexOf(ex) + 1} · ${t.id} ${t.name}

같은 사주에서 쓰인 근거: ${ex.sajuUsed}

${side(ex.a, "답 조합 A")}

${side(ex.b, "답 조합 B")}

- 두 글이 같은 글자 조각(4글자 기준)을 쓴 비율: **${o.toFixed(2)}** (0이면 하나도 겹치지 않음, 1이면 같은 글). 답이 바뀌어도 글이 비슷해지면 그 문항을 의심한다는 기준의 어림이며 좋은 글의 보증이 아니다.
`;
}).join("\n");

// 22문항 검토
const reviewBlocks = ITEM_REVIEWS.map((r) => {
  const rep = r.replacedBy.map((id) => (id.startsWith("S") ? `${id} (${SCENE_BY_ID[id as SceneId].label})` : `${id} (후보, 아래 표)`)).join(" · ");
  return `#### ${r.id} · ${r.judgment}

- 지금 문장: "${r.text}"
- 이유: ${r.reason}
- 실제로 구분해야 하는 차이: ${r.difference}
- 새 질문: ${rep}
- 함께 해석할 문항: ${r.readWith}
- 답 조합에 따라 달라지는 풀이: ${r.comboExample}
`;
}).join("\n");

const candidateBlocks = CANDIDATES.map(
  (c) => `**${c.id}** (${c.from.join(" · ")}을 대신하는 후보, 짝 장면 ${c.pairWith})

> ${c.ask}
${c.options.map((o) => `> - ${optLetter[o.id]}. ${o.text}`).join("\n")}
> - ${NONE_OPTIONS.map((n) => n.text).join(" / ")} _(점수 없음)_

- 가르려는 차이: ${c.difference}
- 이번 묶음에 넣지 않은 이유: ${c.why}
- 내부 이름표: ${c.options.map((o) => `${optLetter[o.id]}=${o.tag}`).join(" · ")}
`,
).join("\n");

const modifyCount = ITEM_REVIEWS.filter((r) => r.judgment === "수정").length;
const deleteCount = ITEM_REVIEWS.filter((r) => r.judgment === "삭제").length;
const current = ASSESSMENT_MODULES.flatMap((m) => m.items).length;
const anxiety = ASSESSMENT_MODULES.flatMap((m) => m.dimensions).find((d) => d.id === "anxiety")!;

const doc = `# 미유 장면 질문 — 문항 설계 재검토 + 별도 버전 초안 (${SCENARIO_VERSION}, ${SCENARIO_DATE}, 검토 전)

- 상태: **초안.** 읽는 규칙 ${SCENARIO_READING_VERSION}. **검사 화면 · 점수표 · 저장된 회원 결과 · 리포트 생성 · 문항 기록(provenance)에 연결하지 않았다**(테스트가 확인). 지금 화면의 ${current}문항은 그대로다(개발용 예시).
- 코드: \`lib/assessment/drafts/scenario-v1.ts\`(구분 · 장면 · 조합 · 22문항 검토 · 서윤 예시) · \`scenario-v1.test.ts\`. 이 문서는 \`node scripts/render-assessment-scenario.ts\`로 코드에서 만든다.
- 이 초안은 AI 도구(Claude)가 정리했고 운영자가 아직 확인하지 않았다. **실제 사람에게 풀어 보게 한 적이 없고, 실제 AI로 이 조합 의미를 풀이로 쓰게 해 본 적도 없다.** 아래 서윤 예시의 글은 제품 AI가 쓴 것이 아니라 설계 예시로 직접 쓴 것이다.

## 1. 무엇이 문제였나

운영자 지적(2026-10-16): 리포트 문장을 고쳐도 **질문이 이미 결론을 말하고 있으면** 풀이는 답을 되풀이하게 된다.

| | 지금 방식 | 이 초안 |
| --- | --- | --- |
| 질문 | "연락이 평소보다 늦으면 이유가 계속 신경 쓰인다." (동의 정도) | "하루 종일 답이 없었어요. 그날 실제로 한 행동은?" (장면 + 행동 4개) |
| 응답 → 결과 | 신경 쓰임 → "관계 불안" 높음 → "${anxiety.highMeaning}" | 한 장면만으로는 결론을 내지 않고, 다른 장면(서운할 때의 기대)과 **함께** 읽어 담담함이 어디서 오는지 가른다 |
| 같은 답의 다른 이유 | 신경 쓰이지 않는 사람은 모두 "낮음" → "${anxiety.lowMeaning}" (믿음 · 낮은 기대 · 관심 없음이 구분되지 않는다) | 평소처럼 지냄 × 말로 꺼냄(C4.1)과 평소처럼 지냄 × 기대를 낮춤(C4.2)은 다른 풀이 |
| 선택지 | 좋은 사람처럼 보이는 답이 쏠린다("불안하지 않다 = 안정") | 같은 장면을 다루는 방식 4개. 높고 낮음 · 좋고 나쁨이 없다 |
| 맞는 답이 없을 때 | 아무 점수나 고르거나 해당 없음으로 도망간다 | "${NONE_OPTIONS.map((n) => n.text).join('" · "')}"가 항상 있고 성향으로 읽지 않는다 |

## 2. 설계 원칙 (운영자 지시 반영)

1. **질문은 유형을 판정하지 않는다.** 같은 모습이 어떤 상황에서 어떤 방식으로 나타나는지를 가른다. 난해하게 숨기거나 심리 게임으로 바꾸지 않았다 — 평소에 겪는 장면을 그대로 묻는다.
2. **한 질문 = 한 장면 · 한 주제.** 질문은 한 문장, 선택지는 45자 이하(테스트).
3. **문항 하나를 유형이나 결과 문단에 1:1로 연결하지 않는다.** 서로 다른 장면 두 개(같은 구분 안)를 함께 읽어야 풀이가 정해진다. 한 장면만으로는 읽지 않는다.
4. **사주가 해석의 중심이다.** 응답은 사주 풀이가 이 사람에게 어떤 장면으로 나타나는지 구체화하는 재료이며, 응답으로 원국 · 시기를 바꾸지 않는다. 구분마다 어떤 사주 근거와 짝지어 읽는지 적었다.
5. **선택지에 좋은 답 · 나쁜 답이 없다.** 선택지 문장에 성향 이름(불안 · 회피 · 안정 · 독립 · 성실 등)과 평가어를 쓰지 않는다(테스트가 막는다).
6. **"${NONE_OPTIONS[0].text}" · "${NONE_OPTIONS[1].text}"는 성향으로 읽지 않는다.** 두 장면 중 하나라도 이것이면 그 구분은 읽지 않는다("${HOLD_TEXT}").
7. **점수를 만들지 않는다.** "불안 87점" 같은 값 · 구분들을 합친 점수 · 유형 이름이 없다. 답은 장면 안에서만 뜻이 있는 이름표이고, 결과는 조합의 의미(문장)다.
8. **비슷한 질문으로 개수를 채우지 않는다.** 대표 묶음은 구분 5개 × 서로 다른 장면 2개 = **${SCENES.length}장면**뿐이다. 모든 구분은 서로 다른 맥락 두 가지(혼자 · 함께 / 일 · 마음 / 첫 반응 · 풀리는 조건 / 행동 · 기대 / 이어 가는 힘 · 접는 계기)를 짝지었다.
9. **구분마다 리포트가 무엇이 달라지는지 먼저 적었다**(구분하려는 차이 · 함께 볼 장면 · 답 조합별 풀이 · 붙이면 안 되는 결론 · 사주 연결 지점). 답이 바뀌어도 풀이 문단이 거의 같으면 그 문항을 의심한다(아래 4의 어림 점검).
10. **지금 점수표에 끼워 넣지 않는다.** 새 질문과 읽는 규칙은 별도 버전(${SCENARIO_VERSION})이다. 기존 회원의 저장된 결과는 건드리지 않는다.

## 3. 대표 묶음 한눈에

안내 문구: "${SCENE_PROMPT}"

| 구분 | 이름 | 장면 1 | 장면 2 |
| --- | --- | --- | --- |
${overview}

선택지 순서는 화면에서 섞어야 한다(맨 위 선택지로 쏠리는 것을 막기 위해). 아래 가나다 순서는 문서 순서일 뿐이다.

${threadBlocks}

## 4. 읽는 규칙 (코드와 같은 것)

- 두 장면 모두 선택지를 골랐을 때만 그 구분을 읽는다. 하나라도 "${NONE_OPTIONS[0].text}" · "${NONE_OPTIONS[1].text}" · 미응답이면 "${HOLD_TEXT}"
- 대표 조합에 있으면 그 조합의 의미를, 없으면 "${FALLBACK_READING}"
- 한 구분 안에서 두 대표 조합이 같은 답 쌍을 가리지 않는다(테스트가 16쌍을 모두 세어 확인한다).
- 결과에는 구분 5개를 늘어놓지 않는다. 고민과 이어지는 2~3개를 사주 근거와 함께 쓴다(상황 → 반응 → 강점과 어려움 → 작은 행동).
- 리포트 생성기에는 **고른 선택지 문장이 아니라 조합의 의미**(와 붙이면 안 되는 결론)만 근거로 넘긴다. 근거 ID · 연결 방식은 이 초안에서 정하지 않았다.
- 점수 · 백분위 · 정확도 · 유형 이름 · 사주와의 합산 · 공식 검사 점수로의 환산은 하지 않는다.

### 어림 점검: 답 조합이 풀이를 바꾸는가

- 대표 조합이 있는 답 쌍: ${THREADS.map((t) => `${t.id} ${comboCoverage(t.id).n}/16`).join(" · ")}. 대표 조합이 없는 쌍은 일반화하지 않고 두 장면을 따로 쓴다.
- 서윤 예시의 두 글이 같은 글자 조각을 쓴 비율: ${EXAMPLES.map((ex) => `${ex.thread} ${textOverlap(ex.a.reading, ex.b.reading).toFixed(2)}`).join(" · ")} (테스트 기준 0.35 미만). 글자를 센 어림이며 풀이가 좋다는 뜻이 아니다.

## 5. 같은 사주, 다른 답 조합 — 서윤 예시

서윤의 사주 근거(\`/report/sample\`의 예시와 같은 근거)는 그대로 두고 **가상의 답 조합만 바꾼** 풀이 예시다. 서윤의 실제 응답이 아니다. 글은 실제 서비스 AI가 쓴 것이 아니라 설계 예시로 직접 썼고, 제품 본문 검사(전문 용어 · 응답 읽어 주기 · 풀이마다 붙는 한계 경고 · 점수 · 나이 · 원인 단정 · 합쇼체 · 이름)를 같은 규칙으로 통과하는지와 고른 선택지 문장을 그대로 옮기지 않았는지를 테스트가 확인한다.

${exampleBlocks}
**이 예시가 보여 주는 것**: 같은 사주(서윤)에서도 답 조합이 다르면 글이 다른 이유로 달라진다 — 예시 1은 같은 "평소처럼 지냄"이 믿음에서 오는지 기대를 접어 둔 것인지, 예시 2는 같은 "시간을 둠"이 정리 방식인지 회복 방식인지, 예시 3은 같은 "순서를 먼저 세움"이 말로 이어지는지 조용히 메우는지를 가른다. 지금 방식에서는 이 차이가 풀이에 들어갈 수 없다.

**이 예시가 보여 주지 못하는 것**: 조합 의미는 설계 가설이다. 실제 사람이 장면을 내가 생각한 뜻으로 읽는지, 두 조합이 실제로 다른 사람인지 확인하지 못했다. 사주 쪽 근거("배우자 자리의 기대" 등)는 전통 해석 규칙(전문가 검토 전, 검증된 사실이 아님)에 기대고 있다.

## 6. 지금 화면의 ${current}문항 검토

결과: **유지 0 · 수정 ${modifyCount} · 삭제 ${deleteCount}.** ${current}문항은 모두 "나는 ~하다 / ~하는 편이다"에 동의하는 형식이라 답이 곧 결론이 된다. 유지할 문항이 없다는 것은 문항이 나빴다는 뜻이 아니라, **다루던 주제를 장면 질문이 이어 받는다**는 뜻이다. 반대 방향 문항이 쌍으로 있던 구조(m1/m2 · m5/m6 · m7/m8 · t1/t2 · t3/t4 · t5/t6 · t7/t8)는 한 장면으로 합쳤다. 운영 규칙상 "우선 확인"이던 r2 · r4는 둘 다 수정이다.

${reviewBlocks}
### 이번 대표 묶음에 넣지 않은 후보 장면 ${CANDIDATES.length}개

위 검토에서 "수정"한 문항 일부는 새 질문이 대표 묶음(10장면)에 없다. 짝 장면과 조합 규칙은 대표 묶음의 시범 인터뷰를 본 뒤 정한다(지금 만들면 비슷한 질문으로 개수를 채우는 일이 된다).

${candidateBlocks}
## 7. 확인하지 못한 것 · 다음 단계

- **실제 사람에게 풀어 보게 하지 못했다.** 아래 인지 인터뷰 전에는 문항 · 조합 의미 · 붙이면 안 되는 결론 어느 것도 검증되지 않았다.
- **조합 의미는 설계 가설이다.** "담담함이 기대를 접은 것일 수 있다" 같은 의미는 일반적으로 그럴 수 있다는 어림이고 연구로 확인한 것이 아니다. 풀이에서는 항상 조건("~일 수 있어요")으로 쓴다.
- **공식 검사의 원문과 대조하지 못했다.** 장면이 다루는 주제(갈등 대처 · 연락 · 도움 요청 · 동기)는 널리 알려진 개념과 닮았다(구분마다 적었다). 문장 · 선택지 · 채점표 · 유형 이름은 가져오지 않았고 새로 썼지만, 닮은 문장이 없다는 보증이 아니며 검사 저작권 전문가 검토를 받지 않았다.
- **사주 쪽은 엔진이 주는 근거에 기댄다.** 일간 강약 · 월령 · 격국 · 용신 같은 근거는 엔진이 아직 계산하지 않아(\`docs/saju-voice-direction.md\` 8) 구분의 "사주 연결 지점"은 지금 엔진이 주는 근거(십신 그룹 · 오행 · 배우자 자리 · 합충 · 시기)까지만 쓴다. 사주 해석 규칙은 전문가 검토 전이다.
- 이유를 묻는 장면(S9 · S10)은 나중에 만든 이유(합리화)가 섞일 수 있어 인터뷰에서 우선 확인한다. 장면 질문은 문장이 길어 22문항 형식보다 문항당 시간이 더 걸릴 수 있다 — 장면 ${SCENES.length}개를 장면당 20초로 세면 약 3분 20초(직접 재지 않은 어림).
- 지난 1~2개월 행동 빈도를 묻는 생활 행동 초안(\`assessment-life-behavior-v1.md\`, 36문항)은 질문 형식이 다르다(빈도 · 영역별 위치 읽기). 이 초안과 어느 쪽을 쓰거나 어떻게 나눌지는 정하지 않았다.

### 인지 인터뷰 절차 (\`assessment-pilot-protocol.md\`와 같은 방식에 더하는 것)

1. 장면을 하나씩 풀고, 고른 뒤 "어떤 장면을 떠올렸나요?" "다른 선택지를 거의 고를 뻔했나요?" "둘 다 해당되면 어느 쪽이 더 자주인가요?"를 묻는다.
2. "좋게 보이는 선택지가 있었나요? 나빠 보이는 선택지는요?" — 쏠림이 있으면 선택지를 고친다.
3. 같은 행동인데 이유가 다른 사람이 있는지 본다(S7 "평소처럼"을 고른 사람에게 그날 마음을 묻는다 — 믿음 · 낮은 기대 · 바빠서 등이 갈리면 S8과 조합이 그 이유를 가르는지 확인한다).
4. **가려 읽기**: 본인 답으로 만든 풀이와 같은 사주에 다른 답 조합으로 만든 풀이 두 개를 이름 없이 보여 주고 "어느 쪽이 내 이야기에 가깝나요? 이미 아는 말을 되풀이한 것 같은 부분은 어디인가요?"를 묻는다 — 새로 연결해 준 이해와 이미 말한 사실의 되풀이를 구분한다.
5. 해당 없음 · 맞는 선택지 없음이 너무 많이 나오는 장면은 고치거나 뺀다. 숫자 맞추기를 위해 문항을 고치지 않는다.

### 운영자 결정 항목

1. 지금 ${current}문항을 이 장면 질문으로 **바꾸는 방향**이 맞는지(바꾼다 / 둘을 함께 둔다 / 일부만).
2. 구분 5개가 맞는지(더할 후보: 계획이 바뀔 때 N3 · 새로운 시도 N4 · 사람 많은 자리 뒤 N1 · 낯선 자리 N2, 뺄 것).
3. 리포트에는 **고른 선택지 문장이 아니라 조합의 의미만** 근거로 넘기는 연결 방식이 맞는지(맞다면 근거 목록 형식 · 지시문을 따로 설계한다).
4. 시범 인터뷰 대상 · 방법(\`assessment-pilot-protocol.md\` 참고, 소수부터).
5. 생활 행동 36문항 초안과의 관계.
`;

writeFileSync(new URL("../docs/assessment-scenario-v1.md", import.meta.url), doc);
console.log(`docs/assessment-scenario-v1.md (${doc.length}자)`);
