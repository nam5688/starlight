// 미유 자체 심화 검사 설계안 문서(docs/assessment-deep-design-v1.md)를 코드에서 만든다.
// 표의 숫자는 화면에 연결된 개발용 문항(lib/assessment/modules)과 초안 0.2(lib/assessment/drafts)에서 읽어 와서 문서와 코드가 어긋나지 않게 한다.
// 실행: node scripts/render-assessment-deep-design.ts   (miyu 폴더에서)
import { writeFileSync } from "node:fs";
import { DEEP_DESIGN_VERSION, DEEP_DOMAINS, SECONDS_PER_QUESTION, TOTAL_QUESTION_BUDGET, deepRows, deepSummary, firstBundle, perspectiveName, supplementList } from "../lib/assessment/drafts/deep-design.ts";
import { DOMAIN_LABEL, DRAFT_ITEMS, HOLD_TEXT, MIN_INDICATORS, PERSPECTIVES, PERSPECTIVE_IDS, UNCLEAR_TEXT, CLEAR_DISTANCE, coverage, indicatorCounts } from "../lib/assessment/drafts/situational-draft.ts";
import { ASSESSMENT_MODULES } from "../lib/assessment/modules/index.ts";

const liveItems = ASSESSMENT_MODULES.reduce((n, m) => n + m.items.length, 0);
const counts = indicatorCounts();
const cov = coverage();
const rows = deepRows();
const sum = deepSummary(rows);
const supplement = supplementList(rows);
const readableIds = new Set(cov.readable);
const bundle = firstBundle(rows);

const bundleTable = bundle.subs.map((r) => `| ${r.domain.name}<br>(${r.domain.group}) | ${r.name} | ${MIN_INDICATORS} | ${r.note} |`).join("\n");
const laterTable = bundle.later.map((r) => `| ${r.domain.name} | ${r.name} | ${r.fit} | ${r.have} |`).join("\n");

const liveRows = ASSESSMENT_MODULES.map((m) => {
  const dims = m.dimensions.map((d) => `${d.label}(${m.items.filter((i) => i.dimension === d.id).length}문항)`).join(" · ");
  return `| ${m.title} | ${m.items.length} | ${dims} |`;
}).join("\n");

const perspectiveRows = PERSPECTIVE_IDS.map((id) => {
  const p = PERSPECTIVES[id];
  return `| ${id} | ${DOMAIN_LABEL[p.domain]} | ${p.name} | ${counts[id]} | ${readableIds.has(id) ? "뚜렷한 방향을 읽음" : HOLD_TEXT} |`;
}).join("\n");

const deepTable = DEEP_DOMAINS.flatMap((d) =>
  d.subs.map((s, i) => {
    const r = rows.find((x) => x.domain.id === d.id && x.name === s.name)!;
    return `| ${i === 0 ? `**${d.name}**<br>(${d.group})` : ""} | ${s.name} | ${perspectiveName(s.perspective)} | ${s.fit} | ${r.have} | ${r.short} |`;
  }),
).join("\n");

const domainTable = sum.perDomain.map((d) => `| ${d.name} | ${d.group} | ${d.subs} | ${d.fullItems} | ${d.toWrite} |`).join("\n");

const supplementTable = supplement
  .map((r) => `| ${r.domain.name} | ${r.name} | ${r.fit === "없음" ? "지금 문항에 없음" : r.fit === "부분" ? "비슷한 관점만 있고 같지 않음" : r.fit === "같은 축" ? "반대쪽 끝으로만 있음" : `문항 ${r.have}개로 모자람`} | ${r.note} |`)
  .join("\n");

const doc = `# 미유 자체 심화 검사 설계안 — 지금 문항이 재는 것 · 못 재는 것, 7영역 세부 항목

- 버전: \`${DEEP_DESIGN_VERSION}\` · 날짜: 2026-10-15 · **초안, 운영자 검토 전. 검사 화면 · 저장 · 리포트에는 연결하지 않았다.**
- 코드: \`miyu/lib/assessment/drafts/deep-design.ts\`(설계 데이터) · \`miyu/scripts/render-assessment-deep-design.ts\`(이 문서를 만든다 — 표의 숫자는 코드에서 읽는다).
- 이 문서는 문장을 더 길게 쓰자는 것이 아니라 **"한 성향 안에서도 무엇이 다른가"를 구분하는 질문**을 만들기 위한 설계다. 전체를 다 묻는 하한은 3절, **무료 분석과 합쳐 50~60문항을 넘지 않게 고른 첫 묶음은 3-2절**이다(문항 글은 \`assessment-deep-questions-v01.md\`).
- **공식 검사(TCI · MBTI® · 애착검사 등)의 문항 · 채점표 · 척도 이름은 가져오지 않는다.** 세부 항목 이름과 문항은 모두 미유가 새로 쓴다. 자기초월 영역은 이번 설계에서 뺐다.

## 0. 먼저 바로잡을 것 — "30문항"은 두 가지다

| 이름 | 문항 수 | 상태 |
| --- | --- | --- |
| **지금 검사 화면의 질문** (개발용 예시) | **${liveItems}문항** | 화면에 연결돼 있다 — 무료 분석이 이 문항으로 계산한다. \`status: "dev-example"\`이며 최종 검사가 아니다 |
| **미유 성향 질문 초안 0.2** (상황형) | **${DRAFT_ITEMS.length}문항** | 검토용 초안 — **화면에 연결하지 않았다**. 13개 관점을 문항마다 주 관점 하나로 읽는다 |

그래서 아래 1절은 **두 가지를 따로** 정리한다. 지금 운영자가 풀어 보는 검사는 앞의 ${liveItems}문항이다.

## 1. 지금 질문이 재는 것 · 못 재는 것

### 1-1. 화면에 연결된 개발용 질문 (${liveItems}문항)

| 묶음 | 문항 수 | 지표(지표마다 문항 수) |
| --- | --- | --- |
${liveRows}

**재는 것**: 각 지표의 방향(0~100 환산값). 지표마다 문항이 2~3개라서 **한두 문항만 달라져도 방향이 바뀐다** — 그래서 화면은 점수를 "정확한 측정"이 아니라 "지금 응답에서 보이는 경향"으로만 표시한다.

**못 재는 것**:
- 감정이 올라오는 크기, 미리 하는 걱정, 낯선 상황에서의 긴장 — "신중함"은 시작 전 대비하는 행동이지 걱정하는 마음이 아니다.
- 성취하고 싶은 마음, 완벽하게 하려는 마음, 자신을 받아들이는 정도.
- 상대 감정을 알아채는 정도, 공감, 거절 · 경계 세우기, 갈등 한가운데서 의견 말하기, 갈등 뒤 회복.
- 같은 반응이 **어떤 장면에서** 나오는지(일 · 친구 · 연애 · 가족) — 문항이 장면을 나누지 않아 "상황에 따라 다름"을 읽지 못한다.
- MBTI는 공식 검사가 아니라 입력한 유형을 참고값으로 따로 보여 줄 뿐이고, 개발용 4축 문항(축당 2문항)은 MBTI 결과를 대신하지 않는다.

**대표 경향(4가지 후보 이름)은 이 가운데 4개 지표만 쓴다** — 관계 불안 · 거리 두기 · 새로움 추구 · 신중함. 타인 반응 민감도 · 지속성 · MBTI 4축은 대표 경향을 정하는 데 쓰이지 않고, 점수가 같으면 확인추구형이 앞선다(\`lib/assessment/dev-rules.ts\`). 그래서 리포트의 중심 문장이 관계에서의 확인 쪽으로 모이기 쉽고, 나머지 영역은 세부 구분이 없다(얼마나 자주 그런지는 실제 응답을 모으기 전에는 알 수 없다).

### 1-2. 초안 0.2 (${DRAFT_ITEMS.length}문항, 화면 미연결)

| 관점 | 영역 | 이름 | 문항 수 | 지금 읽을 수 있나 |
| --- | --- | --- | --- | --- |
${perspectiveRows}

- 읽는 기준: 서로 다른 문항 **${MIN_INDICATORS}개 이상**이어야 한다. 읽을 수 있는 관점은 **${cov.readable.length}개**(${cov.readable.join(" · ")})이고 나머지 ${cov.needMore.length}개는 "${HOLD_TEXT}"다.
- 읽는 규칙은 두 단계뿐이다 — 가운데에서 ${CLEAR_DISTANCE} 이상이면 뚜렷한 방향, 아니면 "${UNCLEAR_TEXT}". "약간 ~한 편" · "고르게"로 나누지 않는다.
- 이 숫자는 문항 구조의 한계이며 실제 신뢰도 · 정확도가 아니다(\`assessment-reliability-sim.md\`).

## 2. 심화 검사 설계안 — 7영역 · 세부 항목 ${sum.subItems}개

**세부 항목의 역할**: 같은 "불안"이라도 *미리 걱정하는 것* · *낯선 곳에서 긴장하는 것* · *가까운 사람에게 확인받고 싶은 것*은 다르다. 세부 항목은 이 차이를 가르는 단위다. 영역은 **기질 · 성격 · 가까운 관계**로 묶어 각각 따로 설명하며, **하나의 점수로 합치지 않는다.**

"지금 초안과의 연결"의 뜻 — **직접**: 같은 것을 재는 관점이 있다 · **같은 축**: 같은 관점의 반대쪽 끝이라 별도 항목으로 둘지 정해야 한다 · **부분**: 비슷하지만 같지 않아 그 관점의 점수로 읽지 않는다 · **없음**: 지금 문항으로는 재지 못한다. "지금 문항 수"는 **직접**일 때만 세고, 같은 관점을 두 세부 항목이 나눠 쓰지 않는다.

| 영역 | 세부 항목 | 지금 초안에서 가장 가까운 관점 | 연결 | 지금 문항 수 | 더 써야 할 문항 |
| --- | --- | --- | --- | --- | --- |
${deepTable}

## 3. 숫자로 본 설계 규모 (어림)

- 세부 항목 ${sum.subItems}개 × 문항 ${MIN_INDICATORS}개(서로 다른 장면) = **최소 ${sum.fullItems}문항** — 한 번에 풀기에는 길다.
- 지금 초안 문항으로 **읽을 수 있는 세부 항목은 ${sum.readableNow}개**뿐이고, **더 써야 하는 문항은 약 ${sum.toWrite}개**다(연결 ${Object.entries(sum.byFit).map(([k, v]) => `${k} ${v}`).join(" · ")}).
- 같은 관점을 여러 장면에서 묻는 규칙(일 · 친구 · 연애 · 가족 · 혼자 · 돈 · 낯선 자리)은 그대로 쓴다.

| 영역 | 묶음 | 세부 항목 | 읽기 위한 최소 문항 | 더 써야 할 문항 |
| --- | --- | --- | --- | --- |
${domainTable}

### 3-2. 첫 심화 묶음 — 무료 분석과 합쳐 ${TOTAL_QUESTION_BUDGET.min}~${TOTAL_QUESTION_BUDGET.max}문항 (운영자 요청 2026-10-15)

*"심화 문항이 너무 많다. 총 70개를 풀면 중간에 그만둔다. 기존 무료 분석 질문 + 심화 질문을 합쳐 50~60개여야 할 것 같다."* — 그래서 세부 항목 ${sum.subItems}개를 모두 묻지 않고, **지금 검사 화면의 문항이 아예 재지 못하는 세부 항목 ${bundle.subs.length}개**부터 서로 다른 장면 ${MIN_INDICATORS}문항씩 묻는다.

| 숫자 | 값 | 설명 |
| --- | --- | --- |
| 심화 첫 묶음 | **${bundle.items}문항** | 세부 항목 ${bundle.subs.length}개 × ${MIN_INDICATORS}문항 |
| 지금 무료 분석에 연결된 문항 | ${bundle.liveItems}문항 | 개발용 예시(\`dev-example\`) |
| **합계** | **${bundle.total}문항** | ${TOTAL_QUESTION_BUDGET.min}~${TOTAL_QUESTION_BUDGET.max}문항 범위 ${bundle.withinBudget ? "안" : "**밖**"} |
| 푸는 시간 어림 | 심화만 약 ${bundle.deepMinutes}분 · 합쳐서 약 ${bundle.totalMinutes}분 | 문항당 ${SECONDS_PER_QUESTION}초로 센 **어림이며 직접 재지 않았다**. 시범 응답으로 재면 고친다 |

| 영역 | 세부 항목 | 문항 수 | 이 항목을 먼저 묻는 이유 |
| --- | --- | --- | --- |
${bundleTable}

- 문항 글 · 선택지 · 점수 방향 · 채점은 \`docs/assessment-deep-questions-v01.md\`(코드에서 만든다)에 있다.
- **이 묶음에 세부 항목이 하나도 없는 영역: ${bundle.domainsWithoutItems.length ? bundle.domainsWithoutItems.join(" · ") : "없음"}** — 그 영역의 결과는 "자료 없음"이다. 리포트 글 · AI는 이 영역을 있는 것처럼 쓰지 않는다.
- **다음 단계로 미룬 세부 항목 ${bundle.later.length}개**(아래 표)에는 아직 문항이 없다. 같은 방식으로 ${MIN_INDICATORS}문항씩 더하면 ${bundle.later.length * MIN_INDICATORS}문항이 늘어 합계가 ${bundle.total + bundle.later.length * MIN_INDICATORS}문항이 되므로 **범위(${TOTAL_QUESTION_BUDGET.max}문항)를 넘는다** — 아래 7절의 결정 항목이다.

| 영역 | 세부 항목 (다음 단계) | 지금 초안과의 연결 | 지금 문항 수 |
| --- | --- | --- | --- |
${laterTable}

## 4. 질문 구성 제안 — 무료 기본 + 첫 심화 묶음

운영자 방향(2026-10-15): *무료 기본 검사는 짧게 큰 경향만 보고, 더 자세한 내용은 심화 검사로 이어 가며, 심화는 기본 검사의 응답을 기억해 참고하고 심화 질문만 더한다. 두 가지를 합쳐 50~60문항을 넘기지 않는다.*

| 단계 | 질문 | 결과 |
| --- | --- | --- |
| **무료 기본 검사** | 지금처럼 짧게(큰 경향, ${bundle.liveItems}문항) — 시범 인터뷰 뒤 문항을 고친다 | 무료 리포트 + 상담방 맛보기 |
| **첫 심화 묶음** | 세부 항목 ${bundle.subs.length}개 × ${MIN_INDICATORS}문항 = ${bundle.items}문항(어림 약 ${bundle.deepMinutes}분). 기본 응답을 다시 묻지 않고 심화 질문만 더한다 | 심층 리포트의 세부 경향 · 채팅 근거 |

- **전부 한 번에(${sum.fullItems}문항 이상)는 하지 않는다.** 첫 묶음 ${bundle.items}문항으로 시작하고, 나머지 ${bundle.later.length}개 세부 항목은 7절 결정 뒤에 정한다.
- 연결 제안(상담방 → 먼저 권할 세부 항목): 연애 → 마음을 드러내는 편안함 · 갈등에서 의견을 말함 · 갈등 뒤 회복 / 일 · 진로 → 성취하고 싶은 마음 · 완벽하게 하려는 마음 · 행동을 조절함 / 고민해결소 → 미리 걱정함 · 낯선 상황에서의 긴장 — **제안이며 운영자 확인 전**.
- 기본 검사의 문항을 심화 세부 항목의 문항으로 **인정할지**는 시범 응답을 본 뒤 정한다(같은 문항이 두 곳에서 점수를 주면 안 된다 — 0.1에서 있던 이중 반영 문제). 첫 묶음은 지금 문항이 재지 못하는 항목만 골랐기 때문에 이 문제가 없다.
- 심화 질문은 문항마다 **세부 항목 하나**에만 점수를 준다. 행동은 같아도 이유가 다른 답은 점수에 넣지 않고 이유만 남긴다(0.2의 규칙 그대로).
- **한 문항만 건너뛰어도 그 세부 항목은 판단을 보류한다**(${MIN_INDICATORS}문항이 최소선이라서). 끝까지 푸는 것을 쉽게 하려고 문항을 줄이면 건너뛴 문항 하나가 결과 하나를 지우는 한계가 남는다.

## 5. 리포트에는 이렇게 쓴다

**첫 화면 — 핵심 조합 3개만.** 서로 다른 영역의 세부 항목 2~3개가 **같은 장면에서 겹치는 모습**을 하나의 문장으로 쓴다(예: 걱정과 대비 + 가까운 관계의 확인 → "연락이 늦을 때 …"). 읽을 수 있는 세부 항목 안에서만 조합하고, 문장마다 근거 ID를 단다.

**상세 화면 — 이 순서로.**
1. **세부 경향 그래프** — 영역마다 세부 항목 막대. 가운데를 기준으로 어느 쪽으로 기울었는지만 그린다.
   - "상위 몇 %" · 평균선 · 또래 비교를 쓰지 않는다(비교 집단이 없다). "응답에서 보이는 경향"이라고만 표시한다.
   - 가운데에서 ${CLEAR_DISTANCE} 이상 기운 것만 방향을 말하고, 아니면 "${UNCLEAR_TEXT}", 문항이 모자라면 "${HOLD_TEXT}"로 **회색으로 두며 측정하지 않은 것은 막대를 그리지 않는다.**
   - 높고 낮음을 좋고 나쁨으로 쓰지 않는다. 기질 · 성격 · 가까운 관계 그래프를 **따로** 그리고 합치지 않는다.
2. **생활 예시** — 같은 경향이 일 · 친구 · 연애 · 가족에서 어떻게 나타나는지 장면으로(응답에 근거가 있는 장면만).
3. **강한 점과 힘든 점** — 같은 특징이 언제 강점이고 언제 부담이 되는지.

**사주와 함께.** 사주는 틀로 풀고 검사 결과는 그 옆에서 같이 설명한다. **검사 점수를 사주로 바꾸지 않고**, 응답 때문에 원국 · 시기 해석을 바꾸지 않는다. 둘이 다르면 차이를 그대로 설명한다.

**채팅.** "이 결과와 실제 경험이 다른 곳이 있어요?"를 먼저 묻는다 — 지금 있는 [상황에 따라 달라요] 흐름과 같은 자리다. 심화 응답과의 연결은 **준비 중**이다.

## 6. AI가 채우지 않는 것 — 자체 검사 보완 목록

AI 리포트는 코드가 만든 근거 목록 안에서만 쓴다(\`survey-evidence.ts\`). **측정하지 않은 세부 항목은 근거 목록에 없으므로 글에 쓰지 않고, 필요하면 "이 질문으로는 아직 알 수 없는 부분"으로만 알린다.** 아래가 그 보완 목록이다 — 이 항목들은 문항이 생기기 전까지 "자료 없음"이다.

| 영역 | 세부 항목 | 왜 못 읽나 | 비고 |
| --- | --- | --- | --- |
${supplementTable}

## 7. 운영자가 정할 것

1. **첫 묶음의 ${bundle.subs.length}개 세부 항목이 맞는지**: 지금 문항이 못 재는 것을 먼저 골랐다. 다른 항목을 먼저 묻고 싶으면 \`deep-design.ts\`의 \`first\` 표시만 바꾸면 되지만 문항은 새로 써야 한다.
2. **나머지 ${bundle.later.length}개 세부 항목(새로움과 행동 영역 포함)**: ${bundle.later.length * MIN_INDICATORS}문항을 더하면 ${TOTAL_QUESTION_BUDGET.max}문항을 넘는다 — (가) 별도 단계로 나누어 푼다 (나) 무료 문항 일부를 심화 세부 항목의 문항으로 인정해 중복을 줄인다 (다) 몇 개를 빼거나 합친다 중에서 정한다.
3. **같은 축**(새로운 것에 대한 관심 ↔ 익숙한 방식 선호)을 하나의 막대로 합칠지, 따로 물을지.
4. **세부 항목 이름**: 화면에 쓸 쉬운 말(지금 이름은 설계용).
5. **심화 검사의 위치**: 심층 리포트 구매 전 · 후, 가격과 무료 범위(미정).
6. **기본 문항의 재사용**: 기본 응답을 심화 세부 항목으로 인정할 조건.
7. **시범 인터뷰 먼저**: 몇 사람이 풀고 "왜 이 답을 골랐는지" 확인(\`assessment-pilot-protocol.md\`) → 문항 수정 → 모자란 세부 항목 보강 → 시범 응답. 시뮬레이션 숫자를 맞추려고 문항을 고치지 않는다. 시범 전에는 소요 시간도 어림일 뿐이다.

## 8. 지금 유료 리포트에 대해 확인한 것 (2026-10-15)

- MY에서 열리는 유료 리포트에 \`dev-rules dev-0.1\` · "만세력 계산 연결 전"이 적힌 것은 **옛 저장본**이다. 지금 코드의 개발용 생성기는 \`dev-0.2\`이고, \`dev-0.1\`은 만세력 엔진이 연결되기 전에 만들었다. 구매한 리포트는 저장된 같은 버전을 다시 보여 주므로 코드를 고쳐도 자동으로 바뀌지 않는다.
- **엔진 연결 전에 저장한 검사 결과에는 사주 원국이 없어서**, 같은 결과로 새 리포트를 받아도 사주 칸은 비어 있다. 사주가 들어간 리포트는 무료 검사를 새로 하면 받을 수 있다(이전 결과 · 구매본은 그대로 남는다).
- 개발용 규칙 생성기(\`dev-rules\`)는 규칙을 조합한 글이라 통합 해석이 얕다. 상품으로 파는 형태는 AI 읽기 구조(\`reading-v1\`)이고, 실제 AI 글은 승인 범위 안의 시험 몇 건뿐이라 품질은 검증되지 않았다.
- 개발용 화면 \`/dev/report-check\`(내 컴퓨터에서만 열림)에서 지금 코드가 새로 만드는 리포트를 실제 리포트 화면으로 볼 수 있다.
`;

writeFileSync(new URL("../docs/assessment-deep-design-v1.md", import.meta.url), doc);
console.log(`docs/assessment-deep-design-v1.md 생성 — 세부 항목 ${sum.subItems}개 · 읽을 수 있는 것 ${sum.readableNow}개 · 더 써야 할 문항 약 ${sum.toWrite}개`);
