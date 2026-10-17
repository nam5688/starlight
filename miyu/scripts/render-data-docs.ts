// 코드의 기록에서 두 문서를 만든다 — 손으로 고치지 않는다.
//   docs/saju-rules.md             사주 해석 규칙 이력(출처 · 적용 조건 · 예외 · 검토 상태 · 버전) — lib/saju/interpret/rule-meta.ts
//   docs/assessment-ipip-review.md 미유 30문항 × IPIP-NEO 하위 영역 개념 비교와 0.3 수정안 — lib/assessment/drafts/ipip-review.ts
// 실행: node scripts/render-data-docs.ts   (miyu 폴더에서)
import { writeFileSync } from "node:fs";
import {
  CLOSENESS_LABEL, IPIP_FACETS, IPIP_REFERENCE, IPIP_REVIEW_VERSION, ITEM_FINDINGS, PERSPECTIVE_COMPARISON, PROPOSAL_VERSION, PROPOSED_ITEMS, READING_LIMITS,
} from "../lib/assessment/drafts/ipip-review.ts";
import { DRAFT_CONTENT_VERSION, DRAFT_ITEMS, PERSPECTIVES, type DraftItem, type PerspectiveId } from "../lib/assessment/drafts/situational-draft.ts";
import { COMPAT_RULE_META, DAY_RULE_META, LUCKY_RULE_META, MONTH_RULE_META, PAIR_RULE_META, PARTNER_RULE_META, PERSONAL_TYPE_RULE_META, RULE_META, RULE_META_VERSION, type RuleMeta } from "../lib/saju/interpret/rule-meta.ts";
import { PERSONAL_TYPE_VERSION } from "../lib/assessment/personal-type.ts";
import { COMPAT_RULE_VERSION } from "../lib/saju/interpret/compat.ts";
import { LUCKY_VERSION } from "../lib/saju/interpret/lucky.ts";
import { PAIR_RULE_VERSION } from "../lib/report/compat/pair-evidence.ts";
import { PARTNER_RULE_VERSION } from "../lib/saju/interpret/partner.ts";
import { DAY_RULE_VERSION } from "../lib/saju/interpret/day-plain.ts";
import { MONTH_RULE_VERSION } from "../lib/saju/interpret/months.ts";
import { SAJU_RULE_VERSION } from "../lib/saju/interpret/rules.ts";

const mode = <T,>(xs: T[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<T, number>()).entries()].sort((a, b) => b[1] - a[1])[0][0];
const REVIEW_LABEL = { unreviewed: "전문가 검토 전", "dev-example": "개발용 예시(실제 응답으로 검증 안 함)", reviewed: "검토 완료" } as const;

// ───────── docs/saju-rules.md ─────────
const saju = RULE_META.filter((r) => r.kind === "saju");
const commonCalc = mode(saju.map((r) => r.calculation));
const commonSource = mode(saju.map((r) => r.source));
const exCount = new Map<string, number>();
for (const r of saju) for (const e of r.exceptions) exCount.set(e, (exCount.get(e) ?? 0) + 1);
const commonEx = new Set([...exCount].filter(([, n]) => n >= saju.length / 2).map(([e]) => e));
const block = (r: RuleMeta) => [
  `### ${r.title} — \`${r.id}\``,
  `- 근거 ID 모양: \`${r.match.source.replaceAll("\\", "")}\``,
  ...(r.kind === "saju" && r.calculation === commonCalc ? [] : [`- 계산: ${r.calculation}`]),
  `- 해석: ${r.interpretation}`,
  ...(r.kind === "saju" && r.source === commonSource ? [] : [`- 출처: ${r.source}`]),
  `- 적용 조건: ${r.conditions.join(" / ")}`,
  `- 예외 · 쓰지 않는 것: ${r.exceptions.filter((e) => !commonEx.has(e)).join(" / ") || "공통 예외만 적용"}`,
  `- 검토 상태: ${REVIEW_LABEL[r.review]} · 버전 ${r.version}`,
].join("\n");
const sajuDoc = `# 해석 근거 규칙 이력 (출처 · 적용 조건 · 예외 · 검토 상태 · 버전)

- 이 문서는 \`lib/saju/interpret/rule-meta.ts\`(기록 ${RULE_META_VERSION})에서 만든다. 손으로 고치지 않는다. 규칙의 문장과 조건은 \`rules.ts\`(규칙 ${SAJU_RULE_VERSION}) · \`survey-evidence.ts\`에 있고, 기록이 실제로 나오는 모든 근거 ID를 덮는지는 \`rule-meta.test.ts\`가 확인한다.
- **계산과 해석은 다르다.** 계산(원국 · 십신 · 대운 · 세운)은 만세력 엔진이 하고 독립 교차 검증을 거쳤다. 그 결과를 "~로 봅니다"로 읽는 **해석 규칙은 검증된 사실이 아니다.** 전문가 검토를 받은 규칙은 아직 없다.
- 사주 해석 규칙 공통 계산 · 검증: ${commonCalc}
- 사주 해석 규칙 공통 출처: ${commonSource}
- 사주 해석 규칙 공통 예외: ${[...commonEx].join(" / ")}

## 사주 해석 규칙 (${saju.length}개)

${saju.map(block).join("\n\n")}

## 응답 · 본인 입력 근거 규칙 (${RULE_META.length - saju.length}개)

${RULE_META.filter((r) => r.kind !== "saju").map(block).join("\n\n")}

## 월 단위 "움직이는 달" 계산 규칙 (${MONTH_RULE_META.length}개, \`months.ts\` · 규칙 ${MONTH_RULE_VERSION})

근거 목록(Evidence)을 만드는 규칙이 아니라 코드가 달력을 직접 계산하는 규칙이라 위 목록과 따로 적는다. 사건 · 날짜를 알려 주는 규칙이 아니며 같은 출처 · 같은 검토 상태(전문가 검토 전)다. 설계 · 표시 빈도 측정 · 한계는 \`docs/month-calendar.md\`.

${MONTH_RULE_META.map(block).join("\n\n")}

## 인연의 경향 규칙 (${PARTNER_RULE_META.length}개, \`partner.ts\` · 규칙 ${PARTNER_RULE_VERSION})

운영자가 2026-10-15에 "전통 해석에 따른 경향"을 보여 주기로 결정했다. 근거 목록을 만드는 규칙이 아니라 코드가 직접 읽는 규칙이라 따로 적는다. 구체적인 나이 · 직업 · 만나는 날짜는 말하지 않고(나이 차는 연상 · 또래 · 연하 쪽의 큰 방향까지), 통계 · 조사 결과를 쓰지 않았으며, 같은 출처 · 같은 검토 상태(전문가 검토 전)다.

${PARTNER_RULE_META.map(block).join("\n\n")}

## 오늘의 한 장 규칙 (${DAY_RULE_META.length}개, \`day-plain.ts\` · 규칙 ${DAY_RULE_VERSION})

오늘의 일진을 내 원국과 겹쳐 하루의 분위기를 읽는 규칙이다. 오늘 일어날 일을 말하지 않고 좋은 날 · 나쁜 날을 가르지 않는다. 같은 출처 · 같은 검토 상태(전문가 검토 전)다.

${DAY_RULE_META.map(block).join("\n\n")}

## 사주 궁합 규칙 (${COMPAT_RULE_META.length}개, \`compat.ts\` · 규칙 ${COMPAT_RULE_VERSION})

두 사람의 사주 원국만으로 관계를 읽는 규칙이다. 간단 궁합(무료)과 사주 궁합(유료)이 같은 규칙 · 같은 결과를 쓴다. 총점 · 커플 유형은 재미와 공유를 위한 정리이며 관계의 성공 확률 · 궁합의 정확도가 아니다. 같은 출처 · 같은 검토 상태(전문가 검토 전)다. 설계 · 분포 측정 · 한계는 \`docs/compat-engine.md\`.

${COMPAT_RULE_META.map(block).join("\n\n")}

## 리포트 궁합 — 두 사람 응답 비교 규칙 (${PAIR_RULE_META.length}개, \`compat/pair-evidence.ts\` · 규칙 ${PAIR_RULE_VERSION})

두 사람이 각자 직접 답한 응답을 같은 영역끼리 비교하는 규칙이다. **리포트 궁합은 아직 만들지 않았고** 이 규칙은 근거 빌더(순수 계산)로만 있다. 설계 가설이며 실제 사람의 응답 · 전문가 검토로 확인하지 못했다.

${PAIR_RULE_META.map(block).join("\n\n")}

## 개인 유형명 규칙 (${PERSONAL_TYPE_RULE_META.length}개, \`assessment/personal-type.ts\` · 규칙 ${PERSONAL_TYPE_VERSION})

사주 갈래 + 응답으로 코드가 고정된 이름 10개 가운데 하나를 정하는 규칙이다(운영자 확정 2026-10-17). 진단이 아니고 사주와 응답을 합산하지 않으며 근거가 부족하면 "혼합 경향"으로 둔다. **화면에는 아직 켜지 않았다.** 설계 · 분포 측정 · 한계는 \`docs/personal-type-v1.md\`.

${PERSONAL_TYPE_RULE_META.map(block).join("\n\n")}

## 럭키 지수 규칙 (${LUCKY_RULE_META.length}개, \`lucky.ts\` · 규칙 ${LUCKY_VERSION})

사주 원국만으로 계산하는 고정 콘텐츠 지수다(운영자 확정 2026-10-17). 성공 확률 · 정확도 · 사람의 가치가 아니고 낮은 점수는 "운이 나쁘다"가 아니다. **화면에는 아직 켜지 않았다.** 점수표 · 분포 · 한계는 \`docs/lucky-index-v1.md\`.

${LUCKY_RULE_META.map(block).join("\n\n")}
`;
writeFileSync(new URL("../docs/saju-rules.md", import.meta.url), sajuDoc);

// ───────── docs/assessment-ipip-review.md ─────────
const facet = (c: string) => `${c} ${IPIP_FACETS[c]}`;
const optLine = (item: DraftItem, o: DraftItem["options"][number]) => `${o.id.toUpperCase()}) ${o.text} (${o.w[item.primary] !== undefined ? (o.w[item.primary]! > 0 ? "+" : "") + o.w[item.primary] : "점수 없음"})`;
const itemBlock = (item: DraftItem) => `**${item.id} · ${item.scene} · ${item.primary} ${PERSPECTIVES[item.primary].name}**\n> ${item.stem}\n${item.options.map((o) => `> - ${optLine(item, o)}`).join("\n")}`;
const old = new Map(DRAFT_ITEMS.map((i) => [i.id, i]));
const ipipDoc = `# 미유 30문항 × IPIP-NEO 하위 영역 — 개념 비교와 수정안 (0.3 제안)

- 이 문서는 \`lib/assessment/drafts/ipip-review.ts\`(${IPIP_REVIEW_VERSION})에서 만든다. 손으로 고치지 않는다.
- **무엇이고 무엇이 아닌가:** 문항 본문을 읽고 미유 관점이 IPIP-NEO-120의 30개 하위 영역 중 어느 것과 가까운지, 한 문항이 서로 다른 구성을 섞지 않는지를 **사람이 판단한 개념 비교**다. 통계가 아니고, 미유 문항의 신뢰도 · 타당도 증거가 아니며, 실제 사람의 응답(시범 인터뷰 · 시범 응답)을 대신하지 못한다. 일반 지식에 기댄 판단이므로 시범 인터뷰에서 확인한다.
- 수정안은 **제안(${PROPOSAL_VERSION})**이다. 현재 초안 ${DRAFT_CONTENT_VERSION}은 바꾸지 않았고 화면 · 저장에 연결하지 않았다. 운영자가 정한 순서(시범 인터뷰 → 문항 수정 → 보강 → 시범 응답)에 따라, 인터뷰 결과와 함께 보고 적용 여부를 정한다. 숫자를 맞추려고 고치지 않았다.

## 1. 쓴 자료와 이용 조건

- 기준: ${IPIP_REFERENCE.name} — ${IPIP_REFERENCE.citation}
- 쓴 것: 30개 하위 영역의 **영어 이름**(논문 표에 적힌 것)뿐이다. IPIP 문항 문구 · 번역 · 응답 데이터는 쓰지 않았다.
- 이용 조건: ${IPIP_REFERENCE.terms}
- 30개 하위 영역: ${Object.keys(IPIP_FACETS).map(facet).join(" · ")}

## 2. 관점별 비교 (13개)

| 미유 관점 | 가장 가까운 IPIP-NEO 하위 영역 | 가까운 정도 | 비교 메모 |
| --- | --- | --- | --- |
${(Object.keys(PERSPECTIVE_COMPARISON) as PerspectiveId[]).map((p) => `| ${p} ${PERSPECTIVES[p].name} | ${PERSPECTIVE_COMPARISON[p].nearest.map(facet).join(", ") || "-"} | ${CLOSENESS_LABEL[PERSPECTIVE_COMPARISON[p].closeness]} | ${PERSPECTIVE_COMPARISON[p].note} |`).join("\n")}

## 3. 문항별 점검 (${ITEM_FINDINGS.length}개 문항)

| 문항 | 관점 | 가까운 하위 영역 | 섞이거나 넓어지는 곳 | 그대로 두면 | 조치 |
| --- | --- | --- | --- | --- | --- |
${ITEM_FINDINGS.map((f) => `| ${f.itemId} | ${f.primary} | ${f.nearest.map(facet).join(", ") || "-"} | ${f.issue} | ${f.risk} | ${{ replace: "교체안", wording: "선택지 한 곳 고침", note: "메모(시범에서 확인)" }[f.action]} |`).join("\n")}

## 4. 수정안 (${PROPOSAL_VERSION}) — 현재 0.2와 나란히

같은 번호 · 같은 주 관점 · 점수는 주 관점 하나에만. 괄호 안은 점수(+는 높은 쪽).

${PROPOSED_ITEMS.map((p) => `#### ${p.id} — 고치려는 이유: ${ITEM_FINDINGS.find((f) => f.itemId === p.id)?.issue ?? ""}\n\n현재 0.2\n\n${itemBlock(old.get(p.id)!)}\n\n제안 0.3 (보려는 것: ${p.purpose})\n\n${itemBlock(p)}`).join("\n\n")}

## 5. 리포트가 읽을 수 있는 말 · 읽지 않는 말 (읽을 수 있는 다섯 관점)

| 관점 | 쓸 수 있는 말 | 쓰지 않는 말 |
| --- | --- | --- |
${Object.entries(READING_LIMITS).map(([p, l]) => `| ${p} ${PERSPECTIVES[p as PerspectiveId].name} | ${l.may} | ${l.mayNot} |`).join("\n")}

## 6. 시범 인터뷰에서 더 물을 것 (이 비교가 만든 질문)

1. Q05(낯선 모임)와 수정안(낯선 메뉴) 중 어느 쪽이 "새로움에 끌림"으로 읽히나요? 사교성 때문에 답을 바꾼 사람이 있었나요?
2. T2(불확실함에 대비)와 C2(감정 뒤 멈춤)를 같은 습관으로 느꼈나요? 두 질문에 같은 이유로 답했나요? (IPIP 기준으로는 한 하위 영역에 걸린다)
3. Q06(공개된 자리에서 지적받음)의 답이 "반응이 의욕을 움직임"(Q03)과 같은 마음이었나요, 남의 시선이 신경 쓰이는 마음이었나요?
4. Q21 · Q18에서 "가치"를 고른 사람은 실제로 그 기준으로 고르나요, 좋은 답처럼 보여서 골랐나요? (수정안은 정답처럼 보일 위험이 더 크다)
5. R2(가까울수록 혼자 시간)와 C4(의미 · 가치)는 IPIP-NEO에 대응하는 하위 영역이 없다. 이 두 관점은 인터뷰 설명이 가장 중요하다.
`;
writeFileSync(new URL("../docs/assessment-ipip-review.md", import.meta.url), ipipDoc);
console.log(`docs/saju-rules.md ${sajuDoc.length}자 · docs/assessment-ipip-review.md ${ipipDoc.length}자`);
