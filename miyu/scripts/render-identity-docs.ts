// 개인 유형명 · 럭키 지수 문서 만들기 — docs/personal-type-v1.md · docs/lucky-index-v1.md (코드에서 생성, 손으로 고치지 않는다).
// 실행: node scripts/render-identity-docs.ts (miyu 폴더에서). 분포 숫자는 scripts/identity-measure.ts의 가정(균등 분포)으로 센 값이다.
import { writeFileSync } from "node:fs";
import {
  CANDIDATE_MIN_LEAD, CLEAR_DISTANCE, FLAVOR_MIN_DIFF, FLAVOR_RULES, GROUP_PLAIN, MIXED_TYPE, PERSONAL_TYPES, PERSONAL_TYPE_IDS, PERSONAL_TYPE_NOTE, PERSONAL_TYPE_VERSION, TILT_RULE,
} from "../lib/assessment/personal-type.ts";
import {
  LUCKY_BANDS, LUCKY_FALLBACK_LINE, LUCKY_METHOD, LUCKY_NOTE, LUCKY_RULES, LUCKY_SCALE, LUCKY_STRONGEST, LUCKY_STRONGEST_LINE, LUCKY_SUB_IDS, LUCKY_SUB_TEXT, LUCKY_TOTAL_BANDS,
  LUCKY_TOTAL_STRETCH, LUCKY_TOTAL_TEXT, LUCKY_VERSION,
} from "../lib/saju/interpret/lucky.ts";
import { LUCKY_RULE_META, PERSONAL_TYPE_RULE_META } from "../lib/saju/interpret/rule-meta.ts";
import { measureLucky, measurePersonalType } from "./identity-measure.ts";

const N = 20000;
const pct = (v: number) => `${((v / N) * 100).toFixed(1)}%`;
const ROW_NAME: Record<string, string> = { novelty: "새로움(기질)", caution: "신중함(기질)", sensitivity: "민감함(기질)", persistence: "지속성(기질)", anxiety: "관계 불안(가까운 관계)", avoidance: "거리 두기(가까운 관계)", ei: "에너지를 채우는 방식", sn: "정보를 받아들이는 방식", tf: "판단하는 기준", jp: "생활을 꾸리는 방식" };
const DIR: Record<string, { high: string; low: string }> = {
  ei: { high: "혼자 정리하며 채움", low: "함께하며 채움" }, sn: { high: "가능성 · 의미 먼저", low: "사실 · 경험 먼저" }, tf: { high: "사람 · 관계 먼저", low: "논리 · 기준 먼저" }, jp: { high: "그때그때 맞추기", low: "미리 정해 두기" },
};
const partText = (p: { row: string; toward: "high" | "low" }) => (DIR[p.row] ? `${ROW_NAME[p.row]} — ${DIR[p.row][p.toward]}` : `${ROW_NAME[p.row]} ${p.toward === "high" ? "높음" : "낮음"}`);

const pm = measurePersonalType(N);
const lm = measureLucky(N);

const typeDoc = `# 개인 유형명 v1 — 코드에 고정한 이름 10개 + 혼합 경향 (${PERSONAL_TYPE_VERSION})

- 이 문서는 \`lib/assessment/personal-type.ts\`에서 \`node scripts/render-identity-docs.ts\`로 만든다. 손으로 고치지 않는다.
- **상태: 설계 초안 · 운영자 확인 전 · 화면에 켜지 않았다**(\`lib/config/product.ts\`의 \`PERSONAL_TYPE.visible = false\`). 이름 · 분류 규칙 · 기준 값은 운영자가 확인한 뒤에 켠다. 개발용 확인 화면은 \`/dev/identity\`(이 PC에서만).
- 근거: 운영자 확정(2026-10-17, D1) — 고정된 직관형 이름 8~12개, 감성 별명 · 동물 이름 · 알파벳 코드 없음, AI가 매번 새로 이름을 만들지 않음, **사주 + 행동 4축 + 기질 · 애착을 기준으로 코드가 정함**, 근거가 부족하면 "혼합/판정 보류".

## 1. 이름 10개(+ 혼합 경향)

운영자 예시 8개를 그대로 쓰고 두 개(섬세 공감형 · 책임 완수형)를 더했다 — 갈래마다 두 모습이 나오도록 10개로 맞췄다.

| 사주 갈래 | 이름 | 한 줄 | 잘 쓰일 때 | 조절이 필요할 때 |
| --- | --- | --- | --- | --- |
${PERSONAL_TYPE_IDS.map((id) => {
  const t = PERSONAL_TYPES[id];
  return `| ${t.group} (${GROUP_PLAIN[t.group]}) | **${t.name}** | ${t.line} | ${t.whenStrength} | ${t.whenBurden} |`;
}).join("\n")}
| (정해지지 않음) | **${MIXED_TYPE.name}** | ${MIXED_TYPE.line} | — | — |

- 한 줄 · 강점일 때 · 부담일 때 문장은 모두 코드에 고정돼 있다(AI가 쓰지 않는다). "부담"은 "나쁘다"가 아니라 조절이 필요한 모습으로 썼다.
- 화면에는 항상 이 안내가 따라온다: "${PERSONAL_TYPE_NOTE}"
- 혼합 경향의 안내: "${MIXED_TYPE.note}" (사주에서 두드러진 쪽이 있으면 쉬운 말로 덧붙인다)

## 2. 분류 규칙 — 두 단계, 합산하지 않는다

**① 사주가 큰 방향(갈래)을 정한다.** 원국 일곱 자리(시각을 모르면 다섯 자리, 천간은 일간을 뺀 3곳 + 지지 4곳)의 십신을 다섯 갈래로 센다. 월지는 한 자리를 더 센다(+${TILT_RULE.monthBonus}). 가장 많은 갈래가 ${TILT_RULE.minTop}자리 이상이어야 하고, 하나면 그 갈래, 같은 수로 겹치면 그 갈래들이 후보다. 월주가 절기 경계에 걸려 달라질 수 있으면 월지 가중치를 넣었을 때와 뺐을 때 후보가 같을 때만 정한다.

**② 응답이 후보 갈래 안의 두 모습 가운데 어느 쪽인지 가른다.** 가운데(50)에서 ${CLEAR_DISTANCE} 이상 벗어난 뚜렷한 응답만 쓴다. 두 모습의 기울기 차이가 ${FLAVOR_MIN_DIFF} 이상이어야 한쪽으로 정한다. 후보 갈래가 둘 이상이면 가장 또렷하게 기운 모습의 갈래를 고르되, 둘째와 ${CANDIDATE_MIN_LEAD} 이상 차이가 나야 한다(사주가 후보를 좁히고 응답이 그 안에서 고르는 보조 역할).

| 갈래 | A 모습 | A를 가르는 응답 | B 모습 | B를 가르는 응답 |
| --- | --- | --- | --- | --- |
${(Object.entries(FLAVOR_RULES) as [keyof typeof FLAVOR_RULES, (typeof FLAVOR_RULES)[keyof typeof FLAVOR_RULES]][]).map(([g, r]) => `| ${g} | ${PERSONAL_TYPES[r.a].name} | ${r.aParts.map(partText).join(" + ")} | ${PERSONAL_TYPES[r.b].name} | ${r.bParts.map(partText).join(" + ")} |`).join("\n")}

- 사주와 응답을 하나의 점수로 합산하지 않는다 — 사주가 갈래를, 응답이 그 안의 모습을 따로 정한다.
- 입력한 MBTI는 쓰지 않는다(선택 입력이고 자기 인식 참고값이다). 이름 · 생년월일 원문은 계산에 들어가도 결과에 남지 않는다(사주 계산 결과만 쓴다).
- 근거가 부족하면(사주 갈래가 정해지지 않았거나 뚜렷한 응답이 없거나 기울기가 작으면) **이름을 붙이지 않고 "${MIXED_TYPE.name}"** 으로 둔다.

## 3. 분포를 직접 센 값 (무작위 ${N.toLocaleString()}명)

**가정(모두 실제 이용자 분포가 아니다)**: 생년 1950~2005 · 월 · 일 균등, 시각 균등(15%는 시각 모름), **응답은 지금 화면 22문항에 1~5를 균등하게 무작위로 고른 것**. 실제 사람의 응답은 문항끼리 연관이 있어 다르다 — 실제 응답 분포는 시범 응답을 받기 전에는 알 수 없다.

- 사주 갈래 후보가 하나인 사람 ${pct(pm.single)} · 후보가 둘 이상으로 겹친 사람 ${pct(pm.ties)} · 월주 경계로 정하지 못한 사람 ${pct(pm.tilts["정해지지 않음(month-uncertain)"] ?? 0)}
- 사주 갈래 분포: ${Object.entries(pm.tilts).sort().map(([k, v]) => `${k} ${pct(v)}`).join(" · ")}
- **이름이 붙은 사람 ${pct(pm.typed)} / 혼합 경향 ${pct(pm.mixed)}** (이유: ${Object.entries(pm.reasons).map(([k, v]) => `${k} ${pct(v)}`).join(" · ")})
  - response-missing = 갈래 안의 두 모습을 가르는 뚜렷한 응답이 없음 · response-unclear = 응답이 있어도 기울기가 작거나 후보끼리 비슷함 · month-uncertain = 월주 경계
- 유형별: ${PERSONAL_TYPE_IDS.map((id) => `${PERSONAL_TYPES[id].name} ${pct(pm.types[id] ?? 0)}`).join(" · ")}
- 읽는 법: 이름이 한두 개로 쏠리지 않고(각 7% 안팎) 혼합 경향이 대부분이지 않은 것은 **균등 분포 가정에서의 결과**다. 실제 응답이 한쪽으로 몰리거나 가운데에 몰리면 혼합 경향의 몫이 달라진다.

## 4. 규칙 이력

${PERSONAL_TYPE_RULE_META.map((m) => `### ${m.title} (${m.id}, v${m.version}, 검토 상태: ${m.review === "unreviewed" ? "전문가 검토 전" : m.review})\n- 계산: ${m.calculation}\n- 해석: ${m.interpretation}\n- 출처: ${m.source}\n- 적용 조건: ${m.conditions.join(" / ")}\n- 예외 · 한계: ${m.exceptions.join(" / ")}`).join("\n\n")}

## 5. 기존 유형론과 닮은 정도 (\`docs/assessment-source-audit.md\` 기준의 점검 — 법률 판단이 아니다)

- **이름 · 문장 · 채점표는 가져오지 않았다.** 이름 10개는 직접 지은 일상어이고 알파벳 코드 · 동물 이름 · 기존 유형 이름(MBTI® 유형 · 에니어그램 · TCI 등)을 쓰지 않았다.
- **구조는 닮은 곳이 있다**: 갈래 안의 두 모습을 가르는 응답으로 "평소 행동 방식" 네 가지(에너지 · 정보 · 판단 · 생활)를 쓰므로 널리 알려진 성격 유형론의 네 쌍과 개념적으로 겹친다. 이 네 가지는 이미 지금 화면 22문항의 구성이고 \`assessment-source-audit.md\`에서 같은 점을 적었다. 공식 검사의 원문과 대조하지 못했고 전문가(검사 저작권) 검토도 받지 않았다.
- 입력한 MBTI 네 글자는 유형 계산에 쓰지 않는다 — 공식 MBTI로 환산하거나 그 이름으로 결과를 표시하지 않는다.

## 6. 하지 못한 것 · 운영자 확인 항목

- 사주 갈래 → 유형 이름 표는 미유가 정한 설계 가설이다(전문가 검토 전). 십신이 성격 유형으로 옮겨진다는 문헌 근거는 확인하지 못했다. 월지를 한 자리 더 세는 단순화도 같다.
- 실제 사람에게 유형 이름을 보여 "맞다 · 아니다" 반응을 받은 적이 없다 — 이름이 그 사람에게 맞는지는 시범 응답 · 인터뷰 전에는 모른다.
- 기준 값(뚜렷함 ${CLEAR_DISTANCE} · 차이 ${FLAVOR_MIN_DIFF} · 후보 간격 ${CANDIDATE_MIN_LEAD} · 월지 +${TILT_RULE.monthBonus})은 임의로 정한 값이다.
- 확인해 주세요: ① 이름 10개와 한 줄 문장 ② 갈래 → 이름 표 ③ 혼합 경향을 이름 대신 보이는 방식(지금은 "혼합 경향"과 사주에서 두드러진 쪽 안내) ④ 결과 화면에서 켜는 위치(지금은 무료 결과 화면 맨 위 카드).
`;

const luckyDoc = `# ME:U 럭키 지수 v1 — 사주 원국만으로 계산하는 고정 콘텐츠 지수 (${LUCKY_VERSION})

- 이 문서는 \`lib/saju/interpret/lucky.ts\`에서 \`node scripts/render-identity-docs.ts\`로 만든다. 손으로 고치지 않는다.
- **상태: 설계 초안 · 운영자 확인 전 · 화면에 켜지 않았다**(\`lib/config/product.ts\`의 \`LUCKY_INDEX.visible = false\`). **계산 기준(규칙 · 분포)을 운영자가 확정하기 전에는 임의 점수를 화면에 표시하지 않는다**(운영자 2026-10-17). 개발용 확인 화면은 \`/dev/identity\`(이 PC에서만).
- 근거: 운영자 확정(2026-10-17, D2) — 처음에는 사주 원국 기반 고정 지수(시기에 따라 바뀌는 "올해의 럭키 흐름"은 v1 이후), 하위 4개(귀인 · 사람복 / 기회 연결 / 재물 흐름 / 회복 · 반전), 총점과 하위 지수 모두 코드가 계산하고 AI는 숫자를 만들지 않음.

## 1. 뜻과 읽는 법

"타고난 사주 구조에서 도움 · 기회 · 재물 연결 · 회복이 얼마나 자연스럽게 생기는지를 미유식으로 센 고정 콘텐츠 지수"다. 성공 확률 · 정확도 · 사람의 가치가 아니고, 낮은 점수는 "운이 나쁘다"가 아니라 **"운이 먼저 굴러오기보다 행동으로 흐름을 만드는 힘이 중요한 타입"**이다. 같은 사주면 언제나 같은 값이다.

화면에 지수 옆에 항상 적는 안내: "${LUCKY_NOTE}"

## 2. 지켜야 할 조건 6가지(CLAUDE.md의 두 번째 예외)와 지킨 방법

| 조건 | 어떻게 지켰나 |
| --- | --- |
| ① 계산 재료 · 방향을 함께 보인다 | 카드 아래 "이 지수는 이렇게 계산했어요"(접힘) — 재료와 방향만, 점수표 숫자는 싣지 않는다 |
| ② 확률 · 정확도가 아니고 좋고 나쁨이 아니며 "예측이 아니며 보장하지 않는다"를 옆에 적는다 | 안내 문장을 코드에 고정하고 카드에 항상 붙인다(시험으로 확인) |
| ③ 사주 원국에서만 계산하고 응답 · MBTI와 합산하지 않는다 | \`luckyIndexOf(saju)\`는 사주 하나만 입력으로 받는다(응답이 달라도 같은 값 — 시험으로 확인) |
| ④ AI가 쓰는 리포트 본문에는 숫자를 쓰지 않고 카드에만 보인다 | 지수는 \`IdentityCard\`(코드가 그리는 카드)에만 있고 AI 근거 목록에 넣지 않았다 |
| ⑤ 임의로 정한 규칙이라 "전문가 검토 전 초안 · 검증되지 않았다"를 표시한다 | 안내 문장 · 규칙 이력(검토 상태 unreviewed)에 적었다 |
| ⑥ 분포를 직접 세어 한쪽으로 쏠리지 않는지 확인한다 | 아래 4장. 눈금은 분포를 센 뒤 정했다(측정 뒤 정한 값이라는 한계도 아래에 적었다) |

## 3. 계산 — 점수표(설계 가설)

각 하위 지수는 원국의 모양에 점수를 주는 표의 합(raw)을 눈금으로 0~100에 옮긴다. 시각을 모르면 다섯 자리를 일곱 자리로 환산해 센다. 신살(천을귀인 등) · 격국 · 용신 · 대운 · 세운은 쓰지 않는다.

${LUCKY_SUB_IDS.map((id) => `### ${LUCKY_RULES[id].name} (만점 ${LUCKY_RULES[id].max}, 눈금 ${LUCKY_SCALE[id].floor} + ${LUCKY_SCALE[id].span} × raw/만점)\n${LUCKY_RULES[id].rules.map((r) => `- ${r.label}`).join("\n")}`).join("\n\n")}

(각 항목의 점수 폭은 \`lucky.ts\`의 \`LUCKY_RULES\`에 있다. 인성 · 비겁 같은 갈래 이름과 합 · 충은 내부 표기이며 화면에는 쉬운 말로만 보인다.)

- **총점** = 네 지수의 평균을 중심 ${LUCKY_TOTAL_STRETCH.center}에서 ${LUCKY_TOTAL_STRETCH.factor}배 늘린 값(${LUCKY_TOTAL_STRETCH.min}~${LUCKY_TOTAL_STRETCH.max}). 네 지수를 평균 내면 한가운데에 몰려 구간이 갈리지 않아 분포를 센 뒤 늘렸다.
- **구간**: 하위 지수 ${LUCKY_BANDS.low}점 미만 낮음 · ${LUCKY_BANDS.high}점 이상 높음 · 총점 ${LUCKY_TOTAL_BANDS.low}점 미만 낮음 · ${LUCKY_TOTAL_BANDS.high}점 이상 높음.
- **가장 강한 럭키 포인트**: 하위 지수 최고가 ${LUCKY_STRONGEST.minScore}점 이상이고 둘째와 ${LUCKY_STRONGEST.minLead}점 이상 차이가 날 때만(동점이면 사람 → 기회 → 재물 → 회복 순). 아니면 "${LUCKY_FALLBACK_LINE}".

## 4. 분포를 직접 센 값 (무작위 ${N.toLocaleString()}명)

**가정(실제 이용자 분포가 아니다)**: 생년 1950~2005 · 월 · 일 균등, 시각 균등(15%는 시각 모름). 눈금 · 구간 경계는 이 측정을 본 뒤에 정했다 — 점수의 의미가 아니라 보기 좋은 분포를 위한 값이다.

| 지수 | 점수 5% | 25% | 중앙 | 75% | 95% | 낮음 | 보통 | 높음 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${lm.subs.map((s) => `| ${LUCKY_RULES[s.id].name} | ${s.q.join(" | ")} | ${pct(s.bands.low)} | ${pct(s.bands.mid)} | ${pct(s.bands.high)} |`).join("\n")}
| **총점** | ${lm.total.q.join(" | ")} | ${pct(lm.total.bands.low)} | ${pct(lm.total.bands.mid)} | ${pct(lm.total.bands.high)} |

- 총점 범위: 최소 ${lm.total.min} · 최대 ${lm.total.max}.
- 가장 강한 포인트: ${Object.entries(lm.strongest).map(([k, v]) => `${k === "none" ? "뚜렷하지 않음(고른 구조 문구)" : k} ${pct(v)}`).join(" · ")}
- 시각을 모르거나 절기 · 자시 · 시 경계에 걸려 안내가 붙는 사람: ${pct(lm.caveats)} (시각 모름 15% + 경계)
- 한계: 점수표의 어떤 항목이 맞는지는 확인하지 못했고 분포가 한쪽으로 몰리지 않았다는 것이 좋은 지수라는 뜻은 아니다. 실제 이용자의 사주는 균등 분포가 아니다.

## 5. 고정 문구

${LUCKY_SUB_IDS.map((id) => `- **${LUCKY_RULES[id].name}** — 높음: ${LUCKY_SUB_TEXT[id].high} / 보통: ${LUCKY_SUB_TEXT[id].mid} / 낮음: ${LUCKY_SUB_TEXT[id].low} / 가장 강한 포인트: "${LUCKY_STRONGEST_LINE[id]}"`).join("\n")}
- **총점** — 높음: ${LUCKY_TOTAL_TEXT.high} / 보통: ${LUCKY_TOTAL_TEXT.mid} / 낮음: ${LUCKY_TOTAL_TEXT.low}
- **계산 설명**: ${LUCKY_METHOD.join(" ")}
- 모든 문구는 코드에 고정돼 있고 사주 용어 · 나쁘다는 표현 · 이모지가 없다(시험으로 확인). 아이콘은 이모지가 아니라 선 그림(SVG)이다.

## 6. 규칙 이력

${LUCKY_RULE_META.map((m) => `- **${m.title}** (${m.id}, v${m.version}, 검토 상태: ${m.review === "unreviewed" ? "전문가 검토 전" : m.review}) — ${m.interpretation}`).join("\n")}
- 공통 출처: ${LUCKY_RULE_META[0].source}
- 공통 예외 · 한계: ${LUCKY_RULE_META[0].exceptions.join(" / ")}

## 7. 하지 못한 것 · 운영자 확인 항목

- 점수표(어떤 모양에 몇 점)는 미유가 정한 설계 가설이고 전문가 검토 전이다. 어떤 원국이 실제로 운이 좋다는 증거는 없다.
- 실제 사람에게 지수를 보여 반응을 받은 적이 없다 · 가장 강한 포인트가 "맞다"고 느끼는 비율도 모른다.
- 확인해 주세요: ① 하위 4개의 이름과 점수표 ② 눈금 · 구간 경계(분포가 마음에 드는지) ③ 총점을 늘린 방식 ④ 카드의 모양과 위치 ⑤ 켤 시점. 확정되면 \`LUCKY_INDEX.visible\`을 한 줄로 켠다. 공유 이미지(유형명 + 지수 카드)는 아직 없다.
`;

writeFileSync(new URL("../docs/personal-type-v1.md", import.meta.url), typeDoc);
writeFileSync(new URL("../docs/lucky-index-v1.md", import.meta.url), luckyDoc);
console.log(`docs/personal-type-v1.md ${typeDoc.length}자 · docs/lucky-index-v1.md ${luckyDoc.length}자`);
