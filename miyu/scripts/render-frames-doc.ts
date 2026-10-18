// 명리 조합 해석 프레임 문서 만들기 — docs/saju-frames-v1.md (코드에서 생성, 손으로 고치지 않는다).
// 실행: node scripts/render-frames-doc.ts (miyu 폴더에서). 새 AI 호출 · DB · 결제 없음(0원). 분포 숫자는 아래 가정으로 직접 센 값이다.
//   가정: 출생 1960~2006 균등 · 성별 반반 · 시각 미상 20% · 기준일 2026-10 · 고정 난수(20261018) — 실제 이용자 분포가 아니며 설계 가설의 확인용이다.
import { writeFileSync } from "node:fs";
import { calculateSaju } from "../lib/saju/manseryeok-engine.ts";
import type { SajuOk } from "../lib/saju/engine.ts";
import { AHEAD_YEARS } from "../lib/saju/interpret/frames/select.ts";
import { AREA_LABEL, DATA_NOTES, FRAME_HIT_RATE, FRAME_RULE_VERSION, FRAMES, frameCardsOf, renderCard, type FrameDef } from "../lib/saju/interpret/frames/index.ts";

const REF = { year: 2026, month: 10 };
const N = 4000;
type Survey = Record<string, "high" | "low">;

const make = (y: number, m: number, d: number, time: string | null, gender: "male" | "female" | null): SajuOk => {
  const s = calculateSaju({ year: y, month: m, day: d, calendar: "solar", isLeapMonth: false, birthTime: time, ...(gender ? { gender } : {}) });
  if (s.status !== "ok") throw new Error("계산 실패");
  return s as SajuOk;
};

/** 고정 가상 인물 다섯 — 출생 날짜는 설명을 위한 임의 값이고 실제 사람이 아니다. 응답 축은 미리 정한 값 */
const PEOPLE: { n: string; saju: SajuOk; survey: Survey }[] = [
  { n: "A", saju: make(1979, 12, 8, "09:30", "male"), survey: { anxiety: "high" } },
  { n: "B", saju: make(1984, 5, 21, "14:10", "female"), survey: { avoidance: "high", caution: "high" } },
  { n: "C", saju: make(1991, 9, 3, null, "female"), survey: { novelty: "high", caution: "low" } },
  { n: "D", saju: make(1996, 2, 14, "06:20", "male"), survey: { anxiety: "low", avoidance: "low", persistence: "high" } },
  { n: "E", saju: make(2001, 7, 27, "18:50", "female"), survey: { sensitivity: "high", jp: "high" } },
];

let seed = 20261018;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const randomCharts = (n: number): SajuOk[] => {
  const out: SajuOk[] = [];
  while (out.length < n) {
    const y = 1960 + Math.floor(rnd() * 47), m = 1 + Math.floor(rnd() * 12), d = 1 + Math.floor(rnd() * 28);
    out.push(make(y, m, d, rnd() < 0.2 ? null : "12:00", rnd() < 0.5 ? "female" : "male"));
  }
  return out;
};

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
const GEN = { male: "남성", female: "여성" };
const chartLine = (s: SajuOk) => {
  const by = Object.fromEntries(s.pillars.map((p) => [p.key, `${p.stem}${p.branch}`]));
  return `${by.year} ${by.month} ${by.day} ${by.hour ?? "(시주 없음)"} · 일간 ${s.dayMaster.stem} · ${s.gender ? GEN[s.gender] : "성별 없음"} · ${s.birthTime ? `시각 ${s.birthTime}` : "시각 미상"} · 출생 ${s.solarDate.year}년`;
};

// ───────────── 카탈로그 ─────────────
const hitMark = (f: FrameDef) => {
  const ai = f.data.map((k) => DATA_NOTES[k].ai);
  return ai.includes("✘") ? "✘ 일부 없음" : ai.includes("△") ? "△ 일부만" : "✔";
};
const summaryRows = FRAMES.map((f) => `| ${f.id} | ${AREA_LABEL[f.area]} | ${f.name} | ${f.condition.join(" + ")} | ${pct(FRAME_HIT_RATE[f.id])} | ${f.needs.length ? f.needs.map((x) => (x === "gender" ? "성별" : "대운")).join(" · ") : "-"} | ${hitMark(f)} |`).join("\n");

const detail = (f: FrameDef) => {
  const hooks = f.hooks.map((h) => `${h.axis} ${h.side === "high" ? "높음" : "낮음"} → ${({ match: "사주와 일치", differ: "사주와 차이(상황별 차이로 설명)", complement: "풀이를 구체화" })[h.mode]}(${h.face === "bright" ? "좋은 면" : "어려운 면"}에 닿음): ${h.note}`);
  const faces = f.facesBy ? `\n- **얼굴(성별에 따라 다름)**\n${(Object.keys(f.facesBy) as ("male" | "female")[]).map((g) => `  - ${GEN[g]} — 좋은 면: ${f.facesBy![g]!.bright.join(" · ")} / 어려운 면: ${f.facesBy![g]!.hard.join(" · ")}`).join("\n")}` : `\n- **좋은 면**: ${f.faces.bright.join(" · ")}\n- **어려운 면**: ${f.faces.hard.join(" · ")}`;
  const data = f.data.map((k) => `${DATA_NOTES[k].label}(엔진 ${DATA_NOTES[k].engine} · AI ${DATA_NOTES[k].ai})`).join(" / ");
  return `#### ${f.id} · ${f.name}  (${AREA_LABEL[f.area]} · ${f.kind === "timing" ? "시기 프레임" : "구조 프레임"})

- **고객 질문**: ${f.question}
- **발동 조건(모두 동시에)**
${f.condition.map((c) => `  - ${c}`).join("\n")}
- **전통 해석(원칙 — 이 사람의 결론이 아니다)**: ${f.tradition}
- **의미 범위 키워드**: ${f.meaning.join(" · ")}${faces}
- **과거 장면 후보(가능성)**: ${f.pastScenes.join(" / ")}
- **현재 모습 키워드**: ${f.present.join(" / ")}
- **앞으로 흐름 키워드**: ${f.future.join(" / ")}
- **설문 연결(프레임의 있고 없음은 바꾸지 않는다)**: ${hooks.join(" / ")}
- **쓰는 데이터**: ${data}
- **쓸 수 있는 나이 · 시기**: ${f.minAge ? `과거 시기는 만 ${f.minAge}세 이후만, 앞으로는 ${AHEAD_YEARS}년 안` : "원국 구조라 나이 제한 없음(시기는 시기 카드가 말한다)"}
- **근거 수준 · 한계**: 사실 셋 이상이면 중간 · 둘이면 약함(강함은 없다 — 전문가 검토 전 초안) · ${f.limits.join(" · ")}
- **다른 프레임과의 관계**: ${f.overlaps.join(" · ")}
- **명중률(무작위 명식에서 나오는 비율)**: ${pct(FRAME_HIT_RATE[f.id])}`;
};

const dataRows = Object.entries(DATA_NOTES).map(([k, d]) => `| ${d.label} | ${d.engine} | ${d.ai} | ${d.note} |`).join("\n");

// ───────────── 다섯 명 ─────────────
const sig = (r: ReturnType<typeof frameCardsOf>, k: "love" | "wealth") => {
  const a = r.selection[k];
  return a ? `${a.structure?.core.frame.id ?? "-"}${a.structure?.side ? `+${a.structure.side.frame.id}` : ""} / 과거 ${a.past?.instance.unit.label ?? "-"} / 앞으로 ${a.ahead?.instance.unit.label ?? "-"}` : "(없음)";
};
const pastSig = (r: ReturnType<typeof frameCardsOf>) =>
  r.selection.past.basis === "universal" ? (r.selection.past.universal.length ? "보편 경험 연결(사주 근거 아님)" : "(쓰지 않음)") : r.selection.past.picks.map((p) => `${p.frame.id} ${p.instance.unit.label}`).join(" + ");

const peopleResults = PEOPLE.map((p) => ({ ...p, r: frameCardsOf(p.saju, { reference: REF, survey: p.survey }) }));

const peopleSections = peopleResults
  .map(({ n, saju, survey, r }) => {
    const cur = r.ctx.luck.find((u) => u.position === "current");
    const hits = r.evaluation.hits.map((h) => `${h.frame.id}(${h.level === "moderate" ? "중간" : "약함"})`).join(" · ") || "(없음)";
    const unavailable = r.evaluation.unavailable.map((u) => `${u.frameId}: ${u.reason}`).join(" / ");
    const excluded = r.evaluation.excluded.map((u) => `${u.frameId}: ${u.reason}`).join(" / ");
    const surveyText = Object.entries(survey).map(([k, v]) => `${k} ${v === "high" ? "높음" : "낮음"}`).join(" · ");
    return `### 인물 ${n} — ${chartLine(saju)}

- 현재 만 ${r.ctx.age}세 · 현재 대운 ${cur ? `${cur.label}(만 ${cur.ageFrom}~${cur.ageTo}세)` : "(계산 없음)"} · 배우자 별 ${r.ctx.star ?? "(성별 없음)"}
- 응답(가상, 뚜렷한 방향만): ${surveyText}
- **발동한 프레임**: ${hits}
- **선택된 이야기** — 연애: ${sig(r, "love")} · 재물: ${sig(r, "wealth")} · 과거 회고: ${pastSig(r)}
${unavailable ? `- 발동하지 못한 이유: ${unavailable}\n` : ""}${excluded ? `- 근거에서 뺀 것: ${excluded}\n` : ""}${r.cards.skipped.length ? `- 카드를 만들지 않은 곳: ${r.cards.skipped.map((s) => `${s.card}(${s.reason})`).join(" / ")}\n` : ""}
${r.cards.cards.map((c) => renderCard(c)).join("\n\n")}`;
  })
  .join("\n\n---\n\n");

const matrixHeader = `| | ${peopleResults.map((x) => `인물 ${x.n}`).join(" | ")} |\n|---|${peopleResults.map(() => "---").join("|")}|`;
const matrix = [
  matrixHeader,
  `| 발동한 프레임 | ${peopleResults.map((x) => x.r.evaluation.hits.map((h) => h.frame.id).join(" ")).join(" | ")} |`,
  `| 3장 연애 이야기 | ${peopleResults.map((x) => sig(x.r, "love").replace(/ \/ /g, "<br>")).join(" | ")} |`,
  `| 5장 재물 이야기 | ${peopleResults.map((x) => sig(x.r, "wealth").replace(/ \/ /g, "<br>")).join(" | ")} |`,
  `| 6장 과거 회고 | ${peopleResults.map((x) => pastSig(x.r)).join(" | ")} |`,
  `| 연애 카드 앞세울 얼굴 | ${peopleResults.map((x) => x.r.cards.cards.find((c) => c.chapter === 3)?.lead === "hard" ? "어려운 면부터" : x.r.cards.cards.find((c) => c.chapter === 3) ? "좋은 면부터" : "-").join(" | ")} |`,
].join("\n");

// ───────────── 응답 불변 ─────────────
const variantsOf = (base: SajuOk, label: string) => {
  const sets: { name: string; survey: Survey }[] = [
    { name: "응답 없음", survey: {} },
    { name: "거리 두기 높음", survey: { avoidance: "high" } },
    { name: "거리 두기 낮음", survey: { avoidance: "low" } },
    { name: "관계 불안 높음", survey: { anxiety: "high" } },
    { name: "관계 불안 낮음", survey: { anxiety: "low" } },
    { name: "민감함 높음 + 신중함 높음", survey: { sensitivity: "high", caution: "high" } },
    { name: "새로움 높음", survey: { novelty: "high" } },
  ];
  const results = sets.map((s) => ({ ...s, r: frameCardsOf(base, { reference: REF, survey: s.survey }) }));
  const key = (r: ReturnType<typeof frameCardsOf>) => `${r.evaluation.hits.map((h) => h.frame.id).join(",")}|${sig(r, "love")}|${sig(r, "wealth")}|${pastSig(r)}`;
  const same = results.every((x) => key(x.r) === key(results[0].r));
  const rows = results.map((x) => {
    const love = x.r.cards.cards.find((c) => c.chapter === 3 && c.id.includes("structure"));
    const wealth = x.r.cards.cards.find((c) => c.chapter === 5 && c.id.includes("structure"));
    const f = (c: typeof love) => (c ? `${c.frameIds[0]}: ${c.lead === "hard" ? "어려운 면부터" : "좋은 면부터"} · ${c.response ? `${c.response.axis} ${c.response.mode === "differ" ? "차이 표시" : c.response.mode === "match" ? "일치 표시" : "구체화 표시"}` : "연결 없음"}` : "-");
    return `| ${x.name} | ${f(love)} | ${f(wealth)} |`;
  });
  return `**${label}** — 발동 프레임 · 선택된 이야기 · 시기가 응답 일곱 가지에서 모두 ${same ? "**같았다**" : "**달랐다(오류)**"}\n\n| 응답 | 3장 연애 구조 카드 | 5장 재물 구조 카드 |\n|---|---|---|\n${rows.join("\n")}\n\n- 발동 프레임: ${results[0].r.evaluation.hits.map((h) => h.frame.id).join(" · ")}`;
};

// ───────────── 정보가 모자란 경우 ─────────────
const noGender = make(1984, 5, 21, "14:10", null);
const ng = frameCardsOf(noGender, { reference: REF });
const young = frameCardsOf(make(2012, 3, 3, "10:00", "female"), { reference: REF });
const child = frameCardsOf(make(2020, 6, 6, "10:00", "male"), { reference: REF });
const sample = randomCharts(N);
const measured = sample.map((s) => frameCardsOf(s, { reference: REF }));
const shakyAt = measured.findIndex((r) => r.ctx.uncertain.length && r.evaluation.excluded.length);
const shaky = shakyAt >= 0 ? measured[shakyAt] : undefined;
const unknownAt = measured.findIndex((r) => !r.ctx.hourKnown && r.ctx.gender && r.cards.cards.length);
const unknownHour = unknownAt >= 0 ? measured[unknownAt] : undefined;

const insufficient = `### 1) 성별을 받지 않은 경우(인물 B와 같은 사주에서 성별만 뺌)
- 발동한 프레임: ${ng.evaluation.hits.map((h) => h.frame.id).join(" · ") || "(없음)"}
- 발동하지 못한 이유: ${[...new Set(ng.evaluation.unavailable.map((u) => u.reason))].join(" / ")}
- 카드를 만들지 않은 곳: ${ng.cards.skipped.map((s) => `${s.card}(${s.reason})`).join(" / ")}
- 만든 카드: ${ng.cards.cards.map((c) => c.id).join(" · ") || "(없음)"} — **연애 · 시기 · 과거 회고를 지어내지 않고 성별 없이 읽히는 재물 구조만 남는다.**

### 2) 어린 나이(만 ${young.ctx.age}세, 2012년생 여성)
- 발동한 프레임: ${young.evaluation.hits.map((h) => h.frame.id).join(" · ") || "(없음)"}
- 과거 회고: ${pastSig(young)}
- 만든 카드: ${young.cards.cards.map((c) => c.id).join(" · ") || "(없음)"}

### 3) 아주 어린 나이(만 ${child.ctx.age}세, 2020년생 남성)
- 과거 회고: ${pastSig(child)} · 만든 카드: ${child.cards.cards.map((c) => c.id).join(" · ") || "(없음)"} — 과거로 쓸 수 있는 나이 하한(만 7~12세) 이전은 쓰지 않는다.

### 4) 절기 경계 · 야자시 관법으로 기둥이 흔들리는 경우
${shaky ? `- 예: ${chartLine(sample[shakyAt])}` : "- (표본에서 흔들리는 기둥에 기댄 프레임이 없었다)"}`;

// ───────────── 측정 ─────────────
const rate: Record<string, number> = {};
for (const f of FRAMES) rate[f.id] = measured.filter((r) => r.evaluation.hits.some((h) => h.frame.id === f.id)).length / N;
const hitCounts = measured.map((r) => r.evaluation.hits.length).sort((a, b) => a - b);
const q = (p: number) => hitCounts[Math.floor(p * (N - 1))];
const collide = (arr: string[]) => {
  const cnt = new Map<string, number>();
  for (const a of arr) cnt.set(a, (cnt.get(a) ?? 0) + 1);
  let same = 0;
  for (const v of cnt.values()) same += (v * (v - 1)) / 2;
  return { p: same / ((N * (N - 1)) / 2), kinds: cnt.size, max: Math.max(...cnt.values()) };
};
const coreOf = (r: ReturnType<typeof frameCardsOf>, k: "love" | "wealth") => r.selection[k]?.structure?.core.frame.id ?? "(없음)";
const loveCore = collide(measured.filter((r) => r.ctx.gender).map((r) => coreOf(r, "love")));
const wealthCore = collide(measured.map((r) => coreOf(r, "wealth")));
const loveFull = collide(measured.map((r) => sig(r, "love")));
const wealthFull = collide(measured.map((r) => sig(r, "wealth")));
const pastFull = collide(measured.map((r) => pastSig(r)));
const share = (f: (r: ReturnType<typeof frameCardsOf>) => boolean) => measured.filter(f).length / N;
const loveHasStruct = share((r) => !!r.selection.love?.structure);
const wealthHasStruct = share((r) => !!r.selection.wealth?.structure);
const loveAhead = share((r) => !!r.selection.love?.ahead);
const wealthAhead = share((r) => !!r.selection.wealth?.ahead);
const pastChart = share((r) => r.selection.past.basis === "chart");
const pastUniversal = share((r) => r.selection.past.basis === "universal" && r.selection.past.universal.length > 0);
const pastTwo = share((r) => r.selection.past.picks.length === 2);
const kindsLove = new Set(measured.map((r) => coreOf(r, "love")));
const kindsWealth = new Set(measured.map((r) => coreOf(r, "wealth")));
const nCard = measured.map((r) => r.cards.cards.length);
const avgCards = nCard.reduce((a, b) => a + b, 0) / N;

const hitTable = FRAMES.map((f) => `| ${f.id} | ${f.name} | ${pct(FRAME_HIT_RATE[f.id])} | ${pct(rate[f.id], 1)} |`).join("\n");

const doc = `# 명리 조합 해석 프레임 v1 — 연애 · 재물 · 과거 회고 20개 (${FRAME_RULE_VERSION})

- 이 문서는 \`lib/saju/interpret/frames/\`에서 \`node scripts/render-frames-doc.ts\`로 만든다. 손으로 고치지 않는다.
- **상태: 설계 초안 · 운영자 확인 전 · 지금 AI 근거 목록과 지시문에 연결하지 않았다(AI 호출 0회 · 판매 · 화면 · DB 변경 없음).** 프레임의 조건 · 키워드는 전통 해석을 단순화한 가설이며 **원전 대조와 전문가 검토를 하지 않았다 — "검증됨 · 전문가 감수"라고 읽지 않는다.**
- 근거(운영자 2026-10-18): 만세력 엔진은 그대로 두고 그 위에 "명리 계산 → 조합 해석(프레임) → 인생 이야기 후보 → 실제 설문과 연결 → AI 서술" 계층을 얹는다. **코드가 근거(프레임 · 시기 · 중복 제거 · 명리 사실)를 정하고 AI는 그 근거로 쓴다.**
- 숫자는 모두 이 저장소의 엔진으로 직접 센 값이다. 가정: 출생 1960~2006 균등 · 성별 반반 · 시각 미상 20% · 기준일 ${REF.year}-${REF.month} · 표본 ${N}명(고정 난수). 실제 이용자 분포가 아니다.

## 0. 구현 범위와 바뀐 파일

**만든 것**(\`lib/saju/interpret/frames/\`, 새 명리 계산 규칙 없음 — 이미 계산된 값을 프레임 재료로 모았다)

| 파일 | 하는 일 |
|---|---|
| \`types.ts\` | 프레임 · 컨텍스트 · 시기 인스턴스 · 응답 연결 타입, 규칙 버전 |
| \`context.ts\` | 만세력 계산 결과 → 프레임 재료(십성 자리 수 · 월령 · 일간 방향 · 일지 관계 · 대운 · 세운 · 흔들리는 기둥) |
| \`love.ts\` · \`wealth.ts\` · \`past.ts\` | 프레임 20개(연애 6 · 재물 8 · 과거 회고 6) — 조건 · 전통 해석 · 키워드 · 얼굴 · 설문 연결 · 한계 · 중복 관계 |
| \`catalog.ts\` · \`data.ts\` | 목록 · 명중률 표 / 데이터 확보 상태(엔진 · AI 근거) |
| \`select.ts\` | 평가 · 이야기 선택(드문 조합 우선 · 시기 인스턴스 · 사용한 시기 중복 제거 · 보편 경험 연결) |
| \`cards.ts\` | 3 · 5 · 6장 읽기 카드 + 해석 근거 추적 |
| \`evidence.ts\` | 카드 → AI 근거 목록 변환 어댑터(**연결하지 않았다**) |
| \`index.ts\` · \`frames.test.ts\` | 진입점 / 시험 22개 |
| \`scripts/render-frames-doc.ts\` · \`docs/saju-frames-v1.md\` | 이 문서 |

**바꾸지 않은 것**: 만세력 엔진 · \`buildEvidence\`(AI 근거 목록) · story-7 지시문(0.5) · 검사 · 규칙 이력(\`rule-meta.ts\`) · 화면 · DB · 결제. 연결하려면 근거 ID가 규칙 이력과 맞아야 하므로(시험이 확인) 그 작업은 운영자가 이 문서의 카드를 본 뒤에 한다.

## 1. 프레임 20개 한눈에

| ID | 영역 | 이름(내부) | 발동 조건 | 명중률 | 필요한 입력 | AI 근거 확보 |
|---|---|---|---|---|---|---|
${summaryRows}

- **AI 근거 확보** 열: ✘ = 지금 AI 근거 목록에 없는 데이터가 들어 있음(과거 대운 · 세운 등), △ = 일부만 있음, ✔ = 이미 있음. 상세는 2장.
- 명중률이 높은 시기 프레임(L6 · W8)은 "해당 시기가 하나라도 있는 비율"이라 거의 모두에게 나온다. 변별은 **어느 시기인가**(나이대 · 대운 · 세운)로 한다.

## 2. 기존 엔진에서 실제로 확보 가능한 데이터

| 데이터 | 엔진 | AI 근거 | 설명 |
|---|---|---|---|
${dataRows}

- 엔진 ✔ / AI ✘ 인 **지난 대운 · 지난 세운**이 운영자가 말한 "과거 대운 · 세운을 AI에게 넘기는 일"의 핵심이다. 지금은 현재 · 다음 대운과 올해부터 3년의 세운만 건네진다. 프레임 어댑터(\`cardsToEvidence\`)를 연결하면 선택된 시기만 건네지고(전체 대운 · 세운 목록이 아니라 이 사람의 이야기에 쓰인 몇 곳), 연결하려면 근거 ID · 규칙 이력 · 지시문을 함께 바꿔야 한다.
- **계산하지 않은 것**: 격국 · 용신 · 희신 · 기신 · 신살 · 십이운성 · 공망 기반 프레임 · 원진 · 파 · 해. 프레임 조건에도 쓰지 않았고 시험이 막는다.

## 3. 프레임 상세 — 정확한 적용 조건 · 명리 근거 · 해석 후보

${FRAMES.map(detail).join("\n\n")}

## 4. 서로 다른 다섯 명식의 0원 예시

> 출생 날짜는 설명을 위한 임의 값이고 실제 사람이 아니다. 아래 카드는 **AI가 쓰기 전의 근거 묶음**이며 완성된 글이 아니다 — 문장은 AI가 이 묶음으로 쓴다. 실제 AI로 이 카드를 읽은 적은 없다(검증되지 않음).

### 4-1. 한눈에 비교

${matrix}

${peopleSections}

## 5. 응답은 프레임의 있고 없음을 바꾸지 않는다 (같은 사주, 다른 응답)

${variantsOf(PEOPLE[1].saju, "인물 B (1984년생 여성)")}

${variantsOf(PEOPLE[3].saju, "인물 D (1996년생 남성)")}

- 응답이 바꾸는 것은 **앞세울 얼굴(좋은 면 · 어려운 면)과 "일치 · 차이 · 구체화" 표시뿐**이다. 사주와 응답이 다르면 차이를 지우지 않고 상황별 차이로 설명하는 표시를 붙인다.
- 프레임의 설문 연결에 없는 축은 연결 표시가 없다(관련 없는 응답을 억지로 넣지 않는다).

## 6. 정보가 모자란 경우 — 거짓 근거를 만들지 않는다

${insufficient}
${shaky ? `- 흔들리는 기둥: ${[...new Set(shaky.ctx.uncertain)].join(" · ")} — 근거에서 뺀 것: ${shaky.evaluation.excluded.map((e) => `${e.frameId}(${e.reason})`).join(" / ")}` : ""}
${unknownHour ? `\n### 5) 출생 시각을 모르는 경우\n- 예: ${chartLine(sample[unknownAt])}\n- 발동한 프레임: ${unknownHour.evaluation.hits.map((h) => h.frame.id).join(" · ")} — 시주를 쓴 사실이 없다(시험이 확인). 대운 전환은 연 단위 "무렵"으로만 말한다.` : ""}

## 7. 측정 (표본 ${N}명, 위 가정)

- 명식당 발동한 프레임: 평균 ${(hitCounts.reduce((a, b) => a + b, 0) / N).toFixed(1)}개 · 10% ${q(0.1)} · 중앙 ${q(0.5)} · 90% ${q(0.9)} · 최소 ${hitCounts[0]} · 최대 ${hitCounts[N - 1]}
- 만들어진 카드: 명식당 평균 ${avgCards.toFixed(1)}장(최대 5장: 연애 구조 · 연애 시기 · 재물 구조 · 재물 시기 · 과거 회고)
- 구조 이야기가 있는 명식: 연애 ${pct(loveHasStruct)} · 재물 ${pct(wealthHasStruct)}(표본은 모두 성별이 있다) — **나머지(연애 ${pct(1 - loveHasStruct)} · 재물 ${pct(1 - wealthHasStruct)})는 구조 프레임이 없어 시기 · 과거 카드로만 읽힌다**
- 앞으로 시기(열 해 안)가 있는 명식: 연애 ${pct(loveAhead)} · 재물 ${pct(wealthAhead)}
- 과거 회고: 사주 기반 ${pct(pastChart)}(두 시기 ${pct(pastTwo)}) · 보편 경험 연결 ${pct(pastUniversal)}
- 구조 핵심 프레임 종류: 연애 ${kindsLove.size}가지 · 재물 ${kindsWealth.size}가지

| 이야기 지문 | 서로 다른 값 | 임의의 두 명식이 같을 확률 | 가장 흔한 값을 가진 명식 수 |
|---|---|---|---|
| 연애 구조 핵심 프레임만 | ${loveCore.kinds}종 | ${pct(loveCore.p, 1)} | ${loveCore.max} |
| 재물 구조 핵심 프레임만 | ${wealthCore.kinds}종 | ${pct(wealthCore.p, 1)} | ${wealthCore.max} |
| 연애 전체(구조 + 과거 시기 + 앞으로 시기) | ${loveFull.kinds}종 | ${pct(loveFull.p, 2)} | ${loveFull.max} |
| 재물 전체 | ${wealthFull.kinds}종 | ${pct(wealthFull.p, 2)} | ${wealthFull.max} |
| 과거 회고 | ${pastFull.kinds}종 | ${pct(pastFull.p, 2)} | ${pastFull.max} |

### 프레임별 명중률(표의 값 · 이번에 센 값)

| ID | 이름 | 명중률 표 | 센 값 |
|---|---|---|---|
${hitTable}

## 8. 지금 구조의 약점 — 정직하게

1. **구조만 보면 같은 이야기가 자주 겹친다**: 연애 구조 핵심 프레임이 같은 확률 ${pct(loveCore.p, 1)}, 재물 ${pct(wealthCore.p, 1)}(종류 ${kindsLove.size} · ${kindsWealth.size}가지뿐). 변별은 시기(어느 대운 · 세운인가)가 더해져야 생긴다 — 그래서 시기 프레임이 중요하고, 시기 근거는 지금 AI에 지난 대운 · 세운이 건네지지 않아 연결 전에는 효과가 없다.
2. **구조 프레임이 없는 명식이 있다**: 연애 ${pct(1 - loveHasStruct)} · 재물 ${pct(1 - wealthHasStruct)}가 구조 프레임 없이 시기 · 과거 카드로만 읽힌다. 프레임을 더 만들면 줄지만 조건을 느슨하게 만들면 "모두에게 붙는 문장"이 된다(단일 신호 금지 원칙).
3. **앞으로 시기가 없는 명식이 많다**: 앞으로 열 해 안에 배우자 별(또는 재성)이 들어오고 일지 · 월지와 관계를 맺는 시기가 없는 명식은 앞으로 카드가 비어 있다(연애 ${pct(loveAhead)} · 재물 ${pct(wealthAhead)}만 있음). 억지로 먼 시기를 쓰지 않는다.
4. **조건 · 임계값(자리 수 3 이상 등)은 설계 가설이다**: 전통 문헌과 대조하지 않았고 학파마다 다를 수 있다. 같은 사주를 다른 학파가 다르게 읽을 수 있다는 점은 문서에만 남기고(운영자 결정) 한 가지 기준만 쓴다.
5. **나이 · 시기 위치는 어림이다**: 만 나이는 생일 전후를 가르지 않아 ±1세 오차가 있다 — 그래서 "만 N세 무렵"으로만 말한다. 시주를 모르면 대운 전환 달도 정확하지 않다.
6. **응답 연결 표는 프레임당 1~2개뿐이다**: 설문 응답이 닿는 얼굴은 설계 가설이고 실제 사람이 풀어 본 적이 없다.
7. **미성년 명식에도 연애 · 배우자 구조 카드가 만들어진다**: 위 6장 2)(만 14세)처럼 나이를 따지지 않고 3장 구조 카드가 나온다. 서비스는 만 14세 이상 가입이라 가능한 입력인데, 만 19세 미만에게 배우자 별 · 인연 이야기를 어떻게 쓸지는 정하지 않았다 — **운영자 결정 항목**(지금 코드는 막지 않았고 과거 시기만 만 16세 이후로 제한한다).
8. **실제 AI가 이 카드를 어떻게 쓰는지 읽어 본 적이 없다**: 카드는 근거 묶음이고 좋은 글의 보증이 아니다. 지시문 연결 · 실제 AI 1건 · 모델 비교(Claude · GPT)는 운영자 승인 후 단계다.

## 9. 다음 단계(운영자 확인 · 승인 후)

1. 이 문서의 카드를 읽고 프레임의 조건 · 키워드를 확인한다(개별 프레임을 일괄 승인하지 않는다 — 연애 · 재물 · 과거 회고를 먼저 확인).
2. 확인된 프레임만 \`cardsToEvidence\`로 AI 근거 목록에 연결한다(근거 ID · 규칙 이력 · story-7 지시문 0.6 · 지난 대운 · 세운 전달) — 코드 변경과 시험이 필요하다.
3. 실제 AI 1건 · 모델 비교(Claude · GPT)는 새 승인이 필요하다. 기존 승인(\`runsApproved 3 / runsDone 3\`)은 소진되어 새 호출을 하지 않는다.
4. 인간관계 · 직업 · 성향 등 다른 영역 프레임은 이 결과를 본 뒤에 넓힌다(v1 범위 동결 · 출시 판단은 \`launch-checklist.md\`).
`;

writeFileSync(new URL("../docs/saju-frames-v1.md", import.meta.url), doc);
console.log(`docs/saju-frames-v1.md 생성 — ${doc.length}자`);
