// 장면 질문 별도 버전 설계 초안 문서(docs/assessment-scenario-v1.md)를 코드에서 만든다.
// 구분 · 장면 · 선택지 · 해석 규칙 · 22문항 검토 · 리포트 AI로 넘기는 근거 · 36문항 대조는 모두 코드(scenario-v1.ts · scenario-evidence.ts · scenario-deep-map.ts)에서 읽어 와서 문서와 코드가 어긋나지 않게 한다.
// 실행: node scripts/render-assessment-scenario.ts   (miyu 폴더에서)
import { writeFileSync } from "node:fs";
import { ASSESSMENT_MODULES } from "../lib/assessment/modules/index.ts";
import {
  CANDIDATES,
  ITEM_REVIEWS,
  NONE_OPTIONS,
  PATTERNS,
  SCENES,
  SCENE_BY_ID,
  SCENARIO_DATE,
  SCENARIO_READING_VERSION,
  SCENARIO_VERSION,
  SCENE_PROMPT,
  THREADS,
  readThread,
  type ScenarioAnswers,
  type SceneId,
} from "../lib/assessment/drafts/scenario-v1.ts";
import { scenarioEvidence, SCENE_RULE_VERSION } from "../lib/assessment/drafts/scenario-evidence.ts";
import { DEEP_GAPS, DEEP_MAP, DEEP_MAP_SUMMARY } from "../lib/assessment/drafts/scenario-deep-map.ts";
import { READING_PROMPT_VERSION } from "../lib/report/reading/prompt.ts";

const optLetter = { a: "가", b: "나", c: "다", d: "라" } as const;
const letterOf = (scene: SceneId, tag: string) => optLetter[SCENE_BY_ID[scene].options.find((o) => o.tag === tag)!.id];

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
    `- 고른 답이 말해 주는 사실(AI에 넘어가는 말, 이유를 추정하지 않는다): ${s.options.map((o) => `${optLetter[o.id]}=${o.plain}`).join(" · ")}`,
    `- 내부 이름표(화면에 보이지 않음): ${s.options.map((o) => `${optLetter[o.id]}=${o.tag}`).join(" · ")}`,
  ].join("\n");
};

/** 한 구분의 16개 답 쌍이 모두 규칙을 갖는지 센다 (readThread가 규칙이 없으면 던진다) */
const pairCoverage = (threadId: string) => {
  const t = THREADS.find((x) => x.id === threadId)!;
  const [s1, s2] = t.scenes.map((id) => SCENE_BY_ID[id]!);
  let n = 0;
  const missing: string[] = [];
  for (const o1 of s1!.options) for (const o2 of s2!.options) {
    try {
      const r = readThread(t.id, { [s1!.id]: o1.id, [s2!.id]: o2.id } as ScenarioAnswers);
      if (r.kind === "read") n++;
    } catch {
      missing.push(`${optLetter[o1.id]}·${optLetter[o2.id]}`);
    }
  }
  return { n, missing };
};

const threadBlocks = THREADS.map((t) => {
  const [s1, s2] = t.scenes;
  const rules = PATTERNS.filter((p) => p.thread === t.id);
  const cov = pairCoverage(t.id);
  const nuance = (p: (typeof rules)[number]) => (p.nuance ? Object.entries(p.nuance).map(([tag, text]) => `\`${tag}\`일 때만: ${text}`).join(" ") : "—");
  return `### ${t.id} · ${t.name}

- **구분하려는 차이**: ${t.asks}
- **리포트에서 쓰이는 영역**: ${t.blocks.join(" · ")}

${sceneBlock(s1)}

${sceneBlock(s2)}

**두 장면을 함께 읽는 해석 규칙** — ${s1} 답 × ${s2} 답. "해석 후보"는 원인을 확정하지 않는 조건형이고, "쓰는 조건"에 적힌 사주 쪽 근거가 받쳐 줄 때만 쓴다(없으면 두 답이 보여 주는 방식만 장면으로 푼다).

| 규칙 | ${s1} | ${s2} | 해석 후보 | 쓰는 조건 | 붙이면 안 되는 결론 | 한쪽 답일 때만 |
| --- | --- | --- | --- | --- | --- | --- |
${rules.map((p) => `| ${p.id} | ${p.first.map((x) => letterOf(s1, x)).join("·")} | ${p.second.map((x) => letterOf(s2, x)).join("·")} | ${p.candidates.join(" ")} | ${p.needs ?? "사주 근거가 받쳐 줄 때"} | ${p.notThis} | ${nuance(p)} |`).join("\n")}

- 16개 답 쌍 중 규칙이 있는 것: **${cov.n}쌍**${cov.missing.length ? ` — 규칙이 없는 쌍: ${cov.missing.join(", ")}` : ""}. 모든 쌍이 정확히 한 규칙에 걸린다(테스트가 센다).
- **사주 연결 지점** — 같은 답의 풀이가 사주 근거에 따라 달라지는 방식:
${t.sajuPairs.map((p) => `  - ${p.cue}: ${p.effect}`).join("\n")}
- **구분 전체에 붙이면 안 되는 결론**: ${t.notThis.join(" · ")}
- **겹칠 수 있는 널리 알려진 개념**: ${t.overlap}
`;
}).join("\n");

const overview = THREADS.map((t) => `| ${t.id} | ${t.name} | ${SCENE_BY_ID[t.scenes[0]].label} (${t.scenes[0]}) | ${SCENE_BY_ID[t.scenes[1]].label} (${t.scenes[1]}) |`).join("\n");

// 수정한 세 조합 — 고치기 전(0.1)과 고친 뒤
const get = (id: string) => PATTERNS.find((p) => p.id === id)!;
const fixTable = [
  {
    key: "C5.5 · 부담이 몰려 중단",
    before: "내 기준이 이어 가는 힘이면서 접는 기준이기도 하다 — 기준에 못 미친다고 느낄 때 접기 쉽고 마무리의 기준을 낮춰 볼 여지가 있다. (접는 계기가 \"기준에 못 미쳐서\"로 바뀌어 읽히고, \"부담이 몰려서\"를 고른 사람에게도 같은 말이 붙었다)",
    ids: ["P5.6", "P5.7", "P5.8"],
    why: "고른 계기(\"일이 나에게만 몰려서\" · \"바뀐 것이 없어서\")를 그대로 두고, 기준 미달이라는 이유를 만들지 않는다. 내 기준을 이어 가는 힘으로 삼은 사람도 접는 계기가 부담이면 \"완성도를 건드리는 것\"이 아니라 \"무엇을 나눌지\"가 방향이다.",
  },
  {
    key: "C3.4 · 혼자 정리할 시간",
    before: "풀린 뒤 말보다 시간과 평소 같은 일상이 도움이 된다 — 첫 반응이 근거를 말한 사람 · 상대를 확인한 사람 · 양보한 사람 · 물러선 사람에게 모두 같은 문장이 붙었다.",
    ids: ["P3.4", "P3.6", "P3.8"],
    why: "같은 \"혼자 정리할 시간\"이어도 첫 반응이 말이었는지 물러섬이었는지에 따라 다른 규칙이 걸린다. 두 풀이 모두 실제 답 두 개(첫 반응 + 풀리는 조건)를 함께 담는다.",
  },
  {
    key: "C4.1 · 평소처럼 지냄 + 말로 꺼냄",
    before: "답이 없어도 평소처럼 지낼 수 있는 힘이, 서운하면 말로 꺼낼 길이 있다는 데서 올 수 있다. (담담함의 원인을 \"말할 수 있어서\"로 확정)",
    ids: ["P4.1"],
    why: "말로 꺼낸다는 답은 담담함의 원인이 아니다. 두 답을 사실로 나란히 놓고, 믿음 · 바쁨 · 말할 곳이 있음 같은 이유는 조건형 후보로만 두며 \"원인 확정\"을 붙이면 안 되는 결론으로 막았다.",
  },
];

// 전체 규칙 감사: 원인 확정 · 답 누락 위험이 있는 표현이 후보에 남아 있는가
const CAUSE_RISK = /때문이다|때문에 그렇다|그래서 그렇다|라서 그렇다|원인이다|온다\.$/;
const riskyPatterns = PATTERNS.filter((p) => p.candidates.some((c) => CAUSE_RISK.test(c)));

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

// AI로 넘어가는 근거 한 건 예시 — 서윤의 기준 응답(X)
const xAnswers: ScenarioAnswers = { S1: "b", S2: "d", S3: "d", S4: "b", S5: "a", S6: "a", S7: "a", S8: "c", S9: "d", S10: "b" };
const sampleEvidence = scenarioEvidence(xAnswers).find((e) => e.id === "scene.D4")!;

const deepRows = DEEP_MAP.map((r) => `| ${r.id} | ${r.sub} | ${r.relation}${r.scene ? ` → ${r.scene}(${r.thread})` : ""} | ${r.reason} |`).join("\n");
const deepSubRows = DEEP_MAP_SUMMARY.remaining.map((s) => `| ${s.sub} | ${s.kept} | ${s.replaced} | ${s.kept < 3 ? "3개 미만 — 심화 규칙(서로 다른 문항 3개 이상)으로는 판단 보류" : "3개 이상"} |`).join("\n");

const modifyCount = ITEM_REVIEWS.filter((r) => r.judgment === "수정").length;
const deleteCount = ITEM_REVIEWS.filter((r) => r.judgment === "삭제").length;
const current = ASSESSMENT_MODULES.flatMap((m) => m.items).length;
const anxiety = ASSESSMENT_MODULES.flatMap((m) => m.dimensions).find((d) => d.id === "anxiety")!;

const doc = `# 미유 장면 질문 — 문항 설계 재검토 + 별도 버전 초안 (${SCENARIO_VERSION}, ${SCENARIO_DATE}, 검토 전)

- 상태: **초안.** 읽는 규칙 ${SCENARIO_READING_VERSION} · 근거 변환 ${SCENE_RULE_VERSION} · 리포트 지시문 ${READING_PROMPT_VERSION}. **검사 화면 · 점수표 · 저장된 회원 결과 · 화면 · 실제 리포트 생성 · 문항 기록(provenance)에 연결하지 않았다**(테스트가 확인). 지금 화면의 ${current}문항은 그대로다(개발용 예시). 기존 회원의 결과 · 결제 · 권한 · 운영 화면은 바꾸지 않았다.
- 코드: \`lib/assessment/drafts/scenario-v1.ts\`(구분 · 장면 · 해석 규칙 · 22문항 검토) · \`scenario-evidence.ts\`(답 → 리포트 AI 근거) · \`scenario-cases.ts\`(생성 시험 사례) · \`scenario-deep-map.ts\`(36문항 대조) · 각 \`.test.ts\`. 이 문서는 \`node scripts/render-assessment-scenario.ts\`로 코드에서 만든다.
- **실제 생성 시험(같은 사주 + 다른 응답 · 다른 사주 + 같은 응답 · 일부 응답만 변경 · 첫 반응만 변경 · 선택지 없음 · 미응답 · 같은 입력 반복)**: \`assessment-scenario-generation-check.md\` — 실제 서비스 AI가 아니라 시험용 대리 작성기(AI 하위 작업자)가 제품 지시문으로 쓴 글을 제품 검사로 확인했다.
- 이 초안은 AI 도구(Claude)가 정리했고 운영자가 아직 확인하지 않았다. **실제 사람에게 풀어 보게 한 적이 없고, 실제 서비스에 연결된 AI로 이 규칙을 풀이로 쓰게 해 본 적도 없다.**

## 0. 운영자 결정(2026-10-16)과 이 문서의 반영

| # | 결정 | 반영 |
| --- | --- | --- |
| 1 | 지금 ${current}문항을 새 방식으로 **바꾸는 방향**은 맞다. 지금 문항과 새 질문 10개를 **함께 묻지 않는다.** 문항은 "동의형이라서"가 아니라 풀이에서 **어떤 차이를 만드는가**로 유지 · 수정 · 삭제를 판단한다. | 6장 ${current}문항 검토(유지 0 · 수정 ${modifyCount} · 삭제 ${deleteCount}). 이유는 모두 "이 문항으로는 풀이에서 무엇이 구분되지 않는가"로 썼고 테스트가 "동의하는 형식이라"만으로 판단한 이유를 막는다. 한 사람에게 옛 ${current}문항과 새 10장면을 같이 묻는 연결은 만들지 않았다. |
| 2 | 구분 5개는 **기준 틀**로 두고 36개 심화 후보와 맞춰 본다. 문항 수를 채우려고 비슷한 질문을 더하지 않는다. 22 + 36 = 58문항 구조는 적용하지 않는다. | 7장 대조 표 — 36문항 중 ${DEEP_MAP_SUMMARY.replaced}개는 같은 장면을 장면 질문이 이미 묻고 있어 대체 후보, ${DEEP_MAP_SUMMARY.kept}개는 5개 구분이 묻지 않는 장면이라 유지. 최종 문항 수는 정하지 않았다. |
| 3 | 리포트 AI에는 **조합 의미만이 아니라** 사주 근거 + 실제 장면 · 고른 선택 + 해석 후보 + 적용 조건을 넘긴다. 고른 말을 되풀이하지 않는 것은 글쓰기 규칙으로 막는다. | 4장 · \`scenario-evidence.ts\` · 지시문 ${READING_PROMPT_VERSION}(\`ANSWER_ECHO\` 검사 유지). |
| 4 | 사람 시험은 **이해 인터뷰 → 생성된 글 점검**(글이 고른 답을 그대로 되풀이했는가 · 새로 연결해 줬는가 · 이유를 잘못 짐작했는가, "둘 다 맞음 · 둘 다 아님" 허용). 6~8명은 초기 수정용일 뿐 통계적 검증이 아니다. | 9장 절차. |
| 5 | 36개 심화 후보는 유지하되 중복 · 겹침을 정리한다. | 7장. |

## 1. 무엇이 문제였나

운영자 지적(2026-10-16): 리포트 문장을 고쳐도 **질문이 이미 결론을 말하고 있으면** 풀이는 답을 되풀이하게 된다.

| | 지금 방식 | 이 초안 |
| --- | --- | --- |
| 질문 | "연락이 평소보다 늦으면 이유가 계속 신경 쓰인다." (동의 정도) | "하루 종일 답이 없었어요. 그날 실제로 한 행동은?" (장면 + 행동 4개) |
| 응답 → 결과 | 신경 쓰임 → "관계 불안" 높음 → "${anxiety.highMeaning}" | 한 장면만으로는 결론을 내지 않고, 다른 장면(서운할 때의 기대)과 **함께** 읽는다 |
| 같은 답의 다른 이유 | 신경 쓰이지 않는 사람은 모두 "낮음" → "${anxiety.lowMeaning}" (믿음 · 낮은 기대 · 관심 없음이 구분되지 않는다) | 평소처럼 지냄 × 말로 꺼냄(P4.1)과 평소처럼 지냄 × 기대를 낮춤(P4.3)은 다른 풀이, 이유는 조건형 후보로만 |
| 선택지 | 좋은 사람처럼 보이는 답이 쏠린다("불안하지 않다 = 안정") | 같은 장면을 다루는 방식 4개. 높고 낮음 · 좋고 나쁨이 없다 |
| 맞는 답이 없을 때 | 아무 점수나 고르거나 해당 없음으로 도망간다 | "${NONE_OPTIONS.map((n) => n.text).join('" · "')}"가 항상 있고 성향으로 읽지 않는다 — 그 구분의 근거는 만들지 않고 사주 근거로 풀이를 끝까지 쓴다 |

## 2. 설계 원칙 (운영자 지시 반영)

1. **질문은 유형을 판정하지 않는다.** 같은 모습이 어떤 상황에서 어떤 방식으로 나타나는지를 가른다. 평소에 겪는 장면을 그대로 묻는다.
2. **한 질문 = 한 장면 · 한 주제.** 질문은 한 문장, 선택지는 45자 이하(테스트).
3. **문항 하나를 유형이나 결과 문단에 1:1로 연결하지 않는다.** 서로 다른 장면 두 개(같은 구분 안)를 함께 읽어야 풀이가 정해진다.
4. **사주가 해석의 중심이다.** 응답은 사주 풀이가 이 사람에게 어떤 장면으로 나타나는지 구체화하는 재료이며, 응답으로 원국 · 시기를 바꾸지 않는다. 구분마다 어떤 사주 근거와 짝지어 읽는지 적었다.
5. **선택지에 좋은 답 · 나쁜 답이 없다.** 선택지 문장에 성향 이름(불안 · 회피 · 안정 · 독립 · 성실 등)과 평가어를 쓰지 않는다(테스트가 막는다).
6. **"${NONE_OPTIONS[0].text}" · "${NONE_OPTIONS[1].text}"는 성향으로 읽지 않는다.** 두 장면 중 하나라도 이것이면 그 구분을 읽지 않는다.
7. **점수를 만들지 않는다.** "불안 87점" 같은 값 · 구분들을 합친 점수 · 유형 이름이 없다. 답은 장면 안에서만 뜻이 있는 이름표이고, 결과는 문장이다.
8. **비슷한 질문으로 개수를 채우지 않는다.** 대표 묶음은 구분 5개 × 서로 다른 장면 2개 = **${SCENES.length}장면**뿐이다.
9. **구분마다 리포트가 무엇이 달라지는지 먼저 적었다**(구분하려는 차이 · 함께 볼 장면 · 답 쌍별 해석 규칙 · 붙이면 안 되는 결론 · 사주 연결 지점).
10. **지금 점수표에 끼워 넣지 않는다.** 새 질문과 읽는 규칙은 별도 버전(${SCENARIO_VERSION})이다.

## 3. 대표 묶음 한눈에

안내 문구: "${SCENE_PROMPT}"

| 구분 | 이름 | 장면 1 | 장면 2 |
| --- | --- | --- | --- |
${overview}

선택지 순서는 화면에서 섞어야 한다(맨 위 선택지로 쏠리는 것을 막기 위해). 아래 가나다 순서는 문서 순서일 뿐이다.

${threadBlocks}

### 3-1. 이번에 고친 세 조합 — 고치기 전과 고친 뒤

${fixTable
  .map(
    (f) => `**${f.key}**

- 고치기 전(0.1): ${f.before}
- 고친 뒤: ${f.ids.map((id) => `${id} — ${get(id).candidates.join(" ")} (쓰는 조건: ${get(id).needs ?? "사주 근거가 받쳐 줄 때"} / 붙이면 안 되는 결론: ${get(id).notThis})`).join("\n  ")}
- 왜 이렇게 고쳤나: ${f.why}
`,
  )
  .join("\n")}
### 3-2. 전체 규칙 감사

- 규칙 ${PATTERNS.length}개가 구분 5개의 16개 답 쌍을 모두 정확히 한 번씩 덮는다(테스트가 센다). 규칙이 없어서 일반화하는 길이 없다.
- 모든 규칙의 해석 후보는 조건형("~할 수 있다")이어야 하고(테스트), 원인을 확정하는 어미("~때문이다 · ~라서 그렇다 · 원인이다")를 낱말로 찾아본 어림(좋은 문장의 보증이 아니다)에서 남은 규칙: **${riskyPatterns.length ? riskyPatterns.map((p) => p.id).join(", ") : "없음"}**.
- 두 답을 함께 읽을 때 한쪽 답에만 맞는 말은 "한쪽 답일 때만"(nuance)으로 따로 뺐다 — 한 규칙이 여러 답을 묶을 때 묶인 답 모두에게 맞는 후보만 남긴다.
- 읽는 결과는 항상 **고른 두 답의 사실 + 각 답이 그 장면에서 보여 주는 방식 + 해석 후보**를 함께 담는다. 한 답을 건너뛰고 다른 답만 읽는 길이 코드에 없다(테스트).

## 4. 리포트 AI에 넘기는 것 (운영자 결정 3)

구분 하나가 읽히면 근거 하나(\`scene.D1\`~\`scene.D5\`, 출처 구분: 응답)가 만들어져 사주 근거 · 입력한 MBTI 근거와 함께 지시문 ${READING_PROMPT_VERSION}의 사용자 메시지에 실린다. 지금 ${current}문항에서 만든 응답 근거(\`survey.*\`)는 이 경로에서는 빼서 같은 답을 두 번 읽지 않는다.

넘기는 것: ① **실제 장면 두 곳과 고른 답의 사실** ② 각 답이 그 장면에서 보여 주는 방식 ③ 두 답을 함께 볼 때의 해석 후보(조건형) ④ **쓰는 조건**(사주 쪽에 있어야 하는 근거) ⑤ 사주와 짝지을 때(같은 답이 사주에 따라 어떻게 달라지는지) ⑥ **붙이면 안 되는 해석** ⑦ 쓰는 법(고른 말을 옮기지 말고 사주 성향이 나타나는 장면으로 풀기). 점수 · 유형 이름 · 퍼센트 · 정해진 유형 이름(금지 목록에 적힌 것도 AI에는 "정해진 유형 이름"으로만 넘긴다)은 없다.

넘기지 않는 것: 읽을 수 없는 구분(해당 없음 · 선택지 없음 · 미응답)의 근거 — 만들지 않으므로 글에 "자료 없음"을 쓸 거리가 없다. 지시문 ${READING_PROMPT_VERSION}은 "응답 근거가 없는 주제는 사주 근거만으로 풀이를 끝까지 쓴다"고 하고, 제품 검사(\`NO_DATA_TEXT\`)가 본문의 "응답이 없어요 · 자료가 없어요 · 부족해요"를 막는다(연락의 "상대의 응답이 없는 시간" 같은 일상 문장은 막지 않는다).

고른 말을 되풀이하지 않는 것은 근거를 빼서가 아니라 글쓰기 규칙으로 막는다: 지시문 + 제품 검사 \`ANSWER_ECHO\`("~라고 답했어요 · 응답에서 · 문항에서 · 검사 결과 · 고르셨어요").

근거 한 건의 실제 모양(서윤의 기준 응답 X의 D4):

- fact: ${sampleEvidence.fact}
- cue: ${sampleEvidence.cue}

## 5. 읽는 규칙 (코드와 같은 것)

- 두 장면 모두 선택지를 골랐을 때만 그 구분을 읽는다. 하나라도 "${NONE_OPTIONS[0].text}" · "${NONE_OPTIONS[1].text}" · 미응답이면 읽지 않고 근거를 만들지 않는다.
- 결과에는 구분 5개를 늘어놓지 않는다. 고민과 이어지는 구분만 쓰고 나머지는 사주 근거로 풀이를 끝까지 쓴다.
- 점수 · 백분위 · 정확도 · 유형 이름 · 사주와의 합산 · 공식 검사 점수로의 환산은 하지 않는다.
- 글자 겹침 비율은 **참고값**일 뿐이다 — 어떤 해석이 어떤 근거(어느 답 · 어느 사주 근거) 때문에 달라졌는지가 판단 기준이다(\`assessment-scenario-generation-check.md\`).

## 6. 지금 화면의 ${current}문항 검토

결과: **유지 0 · 수정 ${modifyCount} · 삭제 ${deleteCount}.** ${current}문항은 모두 "나는 ~하다 / ~하는 편이다"에 동의하는 형식이라 답이 곧 결론이 된다. 유지할 문항이 없다는 것은 문항이 나빴다는 뜻이 아니라, **다루던 주제를 장면 질문이 이어 받는다**는 뜻이다(판단은 형식이 아니라 각 문항이 풀이에서 구분하지 못하는 차이로 했다). 반대 방향 문항이 쌍으로 있던 구조(m1/m2 · m5/m6 · m7/m8 · t1/t2 · t3/t4 · t5/t6 · t7/t8)는 한 장면으로 합쳤다. 운영 규칙상 "우선 확인"이던 r2 · r4는 둘 다 수정이다. 새 방식으로 바꿀 때 한 사람에게 옛 ${current}문항과 새 장면 질문을 함께 묻지 않는다.

${reviewBlocks}
### 이번 대표 묶음에 넣지 않은 후보 장면 ${CANDIDATES.length}개

위 검토에서 "수정"한 문항 일부는 새 질문이 대표 묶음(10장면)에 없다. 짝 장면과 규칙은 대표 묶음의 시범 인터뷰를 본 뒤 정한다(지금 만들면 비슷한 질문으로 개수를 채우는 일이 된다).

${candidateBlocks}
## 7. 심화 후보 36문항과의 대조 (운영자 결정 2 · 5)

36문항(\`assessment-deep-questions-v01.md\`, 세부 항목 12개 × 3문항)을 5개 구분의 장면과 대조했다. 판단 기준은 문항 형식이 아니라 **같은 순간을 묻는가**다.

- 36문항 중 **대체 ${DEEP_MAP_SUMMARY.replaced}개**(새 구분의 장면이 같은 순간의 행동 · 마음을 이미 묻는다 — 같은 장면을 두 번 묻지 않는다), **유지 ${DEEP_MAP_SUMMARY.kept}개**(5개 구분이 묻지 않는 순간).
- **최종 문항 수는 정하지 않았다.** 장면 10 + 유지 후보 ${DEEP_MAP_SUMMARY.kept} = 최대 ${SCENES.length + DEEP_MAP_SUMMARY.kept}개까지 가능하지만 이 숫자는 목표가 아니다. 유지한 문항도 선택지가 점수 방향을 말하고 있는지에 대한 **같은 재검토를 아직 받지 않았다** — 36문항이 장면 질문의 기준을 이미 통과했다는 뜻이 아니다.
- 22 + 36 = 58문항 구조는 적용하지 않는다.

| 세부 항목 | 유지 문항 수 | 대체 문항 수 | 심화 규칙으로 읽을 수 있나 |
| --- | --- | --- | --- |
${deepSubRows}

대체로 3개 미만이 된 세부 항목(갈등에서 의견을 말함 · 갈등 뒤 회복 · 마음을 드러내는 편안함은 전부 대체)은 심화 규칙의 점수가 아니라 **장면 질문의 조합 풀이**로 이어 받는다. 이 세부 항목을 따로 점수처럼 읽지 않는다.

| 문항 | 세부 항목 | 판단 | 이유 |
| --- | --- | --- | --- |
${deepRows}

**36문항에도 5개 구분에도 아직 문항이 없는 영역(문항을 쓰지 않았고 넣을지 정하지 않았다)**

${DEEP_GAPS.map((g) => `- **${g.name}**: ${g.why}`).join("\n")}

## 8. 확인하지 못한 것

- **실제 사람에게 풀어 보게 하지 못했다.** 9장 인지 인터뷰 전에는 문항 · 해석 규칙 · 붙이면 안 되는 결론 어느 것도 검증되지 않았다.
- **해석 규칙은 설계 가설이다.** "담담함이 기대를 접은 것일 수 있다" 같은 후보는 일반적으로 그럴 수 있다는 어림이고 연구로 확인한 것이 아니다. 풀이에서는 항상 조건("~일 수 있어요")으로 쓴다.
- **실제 서비스에 연결된 AI로 쓰게 해 본 적이 없다.** 생성 시험의 글은 시험용 대리 작성기(AI 하위 작업자)가 제품 지시문으로 쓴 것이며 실제 AI 연결 · 비용 · 시간은 재지 못했다. 실제 연결은 운영자가 승인 값을 직접 적은 뒤에만 한다.
- **공식 검사의 원문과 대조하지 못했다.** 장면이 다루는 주제(갈등 대처 · 연락 · 도움 요청 · 동기)는 널리 알려진 개념과 닮았다(구분마다 적었다). 문장 · 선택지 · 채점표 · 유형 이름은 가져오지 않았고 새로 썼지만, 닮은 문장이 없다는 보증이 아니며 검사 저작권 전문가 검토를 받지 않았다.
- **사주 쪽은 엔진이 주는 근거에 기댄다.** 일간 강약 · 월령 · 격국 · 용신 같은 근거는 엔진이 아직 계산하지 않아(\`docs/saju-voice-direction.md\` 8) 구분의 "사주 연결 지점"은 지금 엔진이 주는 근거(십신 그룹 · 오행 · 배우자 자리 · 합충 · 시기)까지만 쓴다. 사주 해석 규칙은 전문가 검토 전이다.
- 이유를 묻는 장면(S9 · S10)은 나중에 만든 이유(합리화)가 섞일 수 있어 인터뷰에서 우선 확인한다. 장면 질문은 문장이 길어 22문항 형식보다 문항당 시간이 더 걸릴 수 있다 — 장면 ${SCENES.length}개를 장면당 20초로 세면 약 3분 20초(직접 재지 않은 어림).
- 생활 행동 36문항 초안(\`assessment-life-behavior-v1.md\`)과 어느 쪽을 쓰거나 어떻게 나눌지는 정하지 않았다.

## 9. 사람 시험 절차

**1단계 — 이해 인터뷰**(\`assessment-pilot-protocol.md\`와 같은 방식에 더하는 것)

1. 장면을 하나씩 풀고, 고른 뒤 "어떤 장면을 떠올렸나요?" "다른 선택지를 거의 고를 뻔했나요?" "둘 다 해당되면 어느 쪽이 더 자주인가요?"를 묻는다.
2. "좋게 보이는 선택지가 있었나요? 나빠 보이는 선택지는요?" — 쏠림이 있으면 선택지를 고친다.
3. 같은 행동인데 이유가 다른 사람이 있는지 본다(S7 "평소처럼"을 고른 사람에게 그날 마음을 묻는다 — 믿음 · 낮은 기대 · 바빠서 등이 갈리면 S8과 규칙이 그 이유를 가르는지 확인한다).
4. 해당 없음 · 맞는 선택지 없음이 너무 많이 나오는 장면은 고치거나 뺀다. 숫자 맞추기를 위해 문항을 고치지 않는다.

**2단계 — 생성된 글 점검**(1단계에서 고친 질문으로)

1. 본인 답으로 만든 글(실제 서비스 AI가 아닌 경우 그렇게 표시)을 읽고 문단마다 셋 중 하나를 고른다: ① **내가 고른 답을 그대로 되풀이했다** ② **내가 말하지 않은 것을 새로 연결해 줬다** ③ **내 이유를 잘못 짐작했다.** 한 문단에 둘 다 맞거나 둘 다 아니면 "둘 다 맞음 · 둘 다 아님"을 고른다 — 억지로 하나로 고르게 하지 않는다.
2. 같은 사주에 다른 답으로 만든 글 두 개를 이름 없이 보여 주고 "어느 쪽이 내 이야기에 가깝나요?"를 묻는다.
3. 6~8명은 질문과 글을 **초기에 고치기 위한 제안**일 뿐이며 통계적 검증이 아니다. 사주 해석 규칙의 타당성은 이 시험으로 알 수 없다.

## 10. 운영자 결정 항목

1. 구분 5개 중 더하거나 뺄 것(더할 후보: 계획이 바뀔 때 N3 · 새로운 시도 N4 · 사람 많은 자리 뒤 N1 · 낯선 자리 N2, 7장의 빈 영역 3개).
2. 7장의 대체 ${DEEP_MAP_SUMMARY.replaced}개 · 유지 ${DEEP_MAP_SUMMARY.kept}개 판단과 유지 문항의 같은 재검토를 누가 언제 하는지.
3. 1단계 이해 인터뷰 대상 · 방법(소수부터).
4. 이 근거 연결을 실제 화면 · 저장 · 리포트 생성에 붙일 시점 — 붙이기 전에는 기존 22문항 화면이 그대로 동작한다.
5. 생활 행동 36문항 초안과의 관계.
`;

writeFileSync(new URL("../docs/assessment-scenario-v1.md", import.meta.url), doc);
console.log(`docs/assessment-scenario-v1.md (${doc.length}자)`);
