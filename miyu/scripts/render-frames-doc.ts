// 명리 조합 해석 프레임 문서 만들기 — docs/saju-frames-v1.md (코드에서 생성, 손으로 고치지 않는다).
// 실행: node scripts/render-frames-doc.ts (miyu 폴더에서). 새 AI 호출 · DB · 결제 없음(0원). 분포 숫자는 아래 가정으로 직접 센 값이다.
//   가정: 출생 1960~2006 균등 · 성별 반반 · 시각 미상 20% · 기준일 2026-10 · 고정 난수(20261018) — 실제 이용자 분포가 아니며 설계 가설의 확인용이다.
import { writeFileSync } from "node:fs";
import { ASSESSMENT_MODULES } from "../lib/assessment/modules/index.ts";
import { AI_CANDIDATES } from "../lib/config/ai-candidates.ts";
import type { Evidence } from "../lib/report/evidence.ts";
import { DEFAULT_FX_KRW_PER_USD, DEFAULT_SURCHARGE } from "../lib/report/ai/budget.ts";
import { buildPersonas } from "../lib/report/ai/compare-personas.ts";
import { planStage } from "../lib/report/ai/compare-plan.ts";
import { buildEvidence } from "../lib/report/ai/generator.ts";
import { buildDevFreeSummary } from "../lib/report/build-free-summary.ts";
import { audienceErrors } from "../lib/report/reading/audience-scope.ts";
import { owners7 } from "../lib/report/reading/story7-measure.ts";
import { composeMockStory7 } from "../lib/report/reading/story7-mock-model.ts";
import { STORY7_PROMPT_VERSION, STORY7_SECTIONS } from "../lib/report/reading/story7-plan.ts";
import { buildStory7UserMessage, STORY7_SYSTEM_PROMPT } from "../lib/report/reading/story7-prompt.ts";
import { story7Evidence } from "../lib/report/reading/story7-evidence.ts";
import { validateStory7Draft } from "../lib/report/reading/story7-validate.ts";
import type { SajuOk } from "../lib/saju/engine.ts";
import { calculateSaju } from "../lib/saju/manseryeok-engine.ts";
import {
  AREA_LABEL, audienceOf, DATA_NOTES, FRAME_HIT_RATE, FRAME_RULE_VERSION, FRAMES, frameCardsOf, heldReasonOf, renderCard, surveyAxesOf, RESPONSE_MARK,
  type Audience, type FrameDef,
} from "../lib/saju/interpret/frames/index.ts";
import { AHEAD_YEARS, PAST_TOTAL_MAX } from "../lib/saju/interpret/frames/select.ts";

const REF = { year: 2026, month: 10 };
const REF_DATE = "2026-10-18";
const N = 4000;
type Survey = Record<string, "high" | "low">;
type R = ReturnType<typeof frameCardsOf>;

const make = (y: number, m: number, d: number, time: string | null, gender: "male" | "female" | null): SajuOk => {
  const s = calculateSaju({ year: y, month: m, day: d, calendar: "solar", isLeapMonth: false, birthTime: time, ...(gender ? { gender } : {}) });
  if (s.status !== "ok") throw new Error("계산 실패");
  return s as SajuOk;
};

/** 고정 가상 인물 다섯 — 출생 날짜는 설명을 위한 임의 값이고 실제 사람이 아니다. 응답은 개발용 문항에 가상으로 답한 값(가상 인물 시험과 같은 패턴) */
const PEOPLE: { n: string; saju: SajuOk; idx: number }[] = [
  { n: "A", saju: make(1979, 12, 8, "09:30", "male"), idx: 0 },
  { n: "B", saju: make(1984, 5, 21, "14:10", "female"), idx: 1 },
  { n: "C", saju: make(1991, 9, 3, null, "female"), idx: 2 },
  { n: "D", saju: make(1996, 2, 14, "06:20", "male"), idx: 3 },
  { n: "E", saju: make(2001, 7, 27, "18:50", "female"), idx: 4 },
];

const answersFor = (i: number) => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((item, idx) => [item.id, ((i * 7 + idx * (i + 2) + (idx % 3) * i) % 5) + 1])));
const inputOf = (saju: SajuOk, idx: number) => ({ saju, gender: saju.gender ?? null, summary: buildDevFreeSummary(answersFor(idx)), knownMbti: null });

/** 실제 생성 경로(buildEvidence, story-7)가 AI에 건네는 근거 전부 */
const deliveredOf = (saju: SajuOk, idx: number): Evidence[] => buildEvidence(inputOf(saju, idx), REF, { fortune: true });
const isFrame = (e: { id: string }) => e.id.startsWith("saju.frame.");

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
const ageText = (ws?: { from: number; to: number }[]) => (ws ?? []).map((w) => (w.from === w.to ? `${w.from}` : `${w.from}~${w.to}`)).join(", ");
const ageAt = (by: number, bm: number, y: number, m: number) => y - by - (m < bm ? 1 : 0);
const isPastText = (fact: string) => /^(?:지난|지금까지 지나온) /.test(fact);

// ───────────── 카탈로그 ─────────────
const hitMark = (f: FrameDef) => {
  const ai = f.data.map((k) => DATA_NOTES[k].ai);
  return ai.includes("✘") ? "✘ 일부 없음" : ai.includes("△") ? "△ 일부만" : "✔";
};
const usedMark = (f: FrameDef) => (f.grade === "자체조합" ? "**제외**" : "사용");
const summaryRows = FRAMES.map((f) => `| ${f.id} | ${AREA_LABEL[f.area]} | ${f.name} | ${f.grade} | ${usedMark(f)} | ${f.condition.join(" + ")} | ${pct(FRAME_HIT_RATE[f.id])} | ${f.needs.length ? f.needs.map((x) => (x === "gender" ? "성별" : "대운")).join(" · ") : "-"} | ${hitMark(f)} |`).join("\n");

const detail = (f: FrameDef) => {
  const hooks = f.hooks.map((h) => `${h.axis} ${h.side === "high" ? "높음" : "낮음"} → ${({ match: "사주와 일치", differ: "사주와 차이(상황별 차이로 설명)", complement: "풀이를 구체화" })[h.mode]}(${h.face === "bright" ? "좋은 면" : "어려운 면"}에 닿음): ${h.note}`);
  const faces = f.facesBy ? `\n- **얼굴(성별에 따라 다름)**\n${(Object.keys(f.facesBy) as ("male" | "female")[]).map((g) => `  - ${GEN[g]} — 좋은 면: ${f.facesBy![g]!.bright.join(" · ")} / 어려운 면: ${f.facesBy![g]!.hard.join(" · ")}`).join("\n")}` : `\n- **좋은 면**: ${f.faces.bright.join(" · ")}\n- **어려운 면**: ${f.faces.hard.join(" · ")}`;
  const data = f.data.map((k) => `${DATA_NOTES[k].label}(엔진 ${DATA_NOTES[k].engine} · AI ${DATA_NOTES[k].ai})`).join(" / ");
  return `#### ${f.id} · ${f.name}  (${AREA_LABEL[f.area]} · ${f.kind === "timing" ? "시기 프레임" : "구조 프레임"} · 근거 수준 ${f.grade} · ${f.grade === "자체조합" ? "**AI 근거에서 제외**" : "AI 근거 사용"})

- **근거 수준 판단(미유 판단 · 전문가 검토 전)**: ${f.gradeNote}
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
- **근거 강도 · 한계**: 사실 셋 이상이면 중간 · 둘이면 약함(강함은 없다 — 전문가 검토 전 초안) · ${f.limits.join(" · ")}
- **다른 프레임과의 관계**: ${f.overlaps.join(" · ")}
- **명중률(무작위 명식에서 나오는 비율)**: ${pct(FRAME_HIT_RATE[f.id])}${f.grade === "자체조합" ? "(참고 값 — 평가하지 않아 실제로는 나오지 않는다)" : ""}`;
};

const dataRows = Object.values(DATA_NOTES).map((d) => `| ${d.label} | ${d.engine} | ${d.ai} | ${d.note} |`).join("\n");

// ───────────── 제외 사유 ─────────────
const AUD: Audience[] = ["adult", "teen", "child"];
const AUD_LABEL: Record<Audience, string> = { adult: "만 19세 이상", teen: "만 16~18세", child: "만 16세 미만" };
const heldRows = FRAMES.flatMap((f) => AUD.map((a) => ({ f, a, why: heldReasonOf(f, a) })).filter((x) => x.why));
const heldTable = [
  "| 프레임 | 적용 대상 | 제외 사유 |",
  "|---|---|---|",
  ...heldRows.filter((x) => x.f.grade === "자체조합").filter((x) => x.a === "adult").map((x) => `| ${x.f.id} ${x.f.name} | 모든 연령 | ${x.why} |`),
  ...heldRows.filter((x) => x.f.grade !== "자체조합").map((x) => `| ${x.f.id} ${x.f.name} | ${AUD_LABEL[x.a]} | ${x.why} |`),
].join("\n");

// ───────────── 다섯 명 ─────────────
const sig = (r: R, k: "love" | "wealth") => {
  const a = r.selection[k];
  return a ? `${a.structure?.core.frame.id ?? "-"}${a.structure?.side ? `+${a.structure.side.frame.id}` : ""} / 과거 ${a.past?.instance.unit.label ?? "-"} / 앞으로 ${a.ahead?.instance.unit.label ?? "-"}` : "(없음)";
};
const pastSig = (r: R) =>
  r.selection.past.basis === "universal" ? (r.selection.past.universal.length ? "보편 경험 연결(사주 근거 아님)" : "(쓰지 않음)") : r.selection.past.picks.map((p) => `${p.frame.id} ${p.instance.unit.label}`).join(" + ");

type Person = { n: string; saju: SajuOk; idx: number; delivered: Evidence[]; r: R };
const people: Person[] = PEOPLE.map((p) => {
  const delivered = deliveredOf(p.saju, p.idx);
  const r = frameCardsOf(p.saju, { reference: REF, survey: surveyAxesOf(delivered) });
  return { ...p, delivered, r };
});

const evHead = (e: Evidence) =>
  `\`${e.id}\` · ${e.strength}${e.period ? ` · ${e.period.from}~${e.period.to}` : ""}${e.ageWindows ? ` · 만 ${ageText(e.ageWindows)}세` : ""}${e.uncertain ? " · 불확실" : ""}`;
const evFull = (e: Evidence) => `- ${evHead(e)}\n  - **fact**: ${e.fact}\n  - **cue**: ${e.cue}`;
const evCompact = (e: Evidence) => `- ${evHead(e)}\n  - fact: ${e.fact}`;

const surveyText = (s: Survey) => Object.entries(s).map(([k, v]) => `${k} ${v === "high" ? "높음" : "낮음"}`).join(" · ") || "(뚜렷한 방향 없음)";

const peopleSections = people
  .map(({ n, saju, r, delivered }) => {
    const cur = r.ctx.luck.find((u) => u.position === "current");
    const hits = r.evaluation.hits.map((h) => `${h.frame.id}(${h.level === "moderate" ? "중간" : "약함"})`).join(" · ") || "(없음)";
    const unavailable = r.evaluation.unavailable.map((u) => `${u.frameId}: ${u.reason}`).join(" / ");
    const excluded = r.evaluation.excluded.map((u) => `${u.frameId}: ${u.reason}`).join(" / ");
    const held = r.evaluation.held.map((u) => `${u.frameId}`).join(" · ");
    const frameEv = delivered.filter(isFrame);
    const full = n === "B" || n === "D";
    return `### 인물 ${n} — ${chartLine(saju)}

- 현재 만 ${r.ctx.age}세(${AUD_LABEL[r.ctx.audience]}) · 현재 대운 ${cur ? `${cur.label}(만 ${cur.ageFrom}~${cur.ageTo}세)` : "(계산 없음)"} · 배우자 별 ${r.ctx.star ?? "(성별 없음)"}
- 응답(가상, 뚜렷한 방향만): ${surveyText(surveyAxesOf(delivered))}
- **발동한 프레임**: ${hits}${held ? `  · 제외한 프레임: ${held}` : ""}
- **선택된 이야기** — 연애: ${sig(r, "love")} · 재물: ${sig(r, "wealth")} · 과거 회고: ${pastSig(r)}
${unavailable ? `- 발동하지 못한 이유: ${unavailable}\n` : ""}${excluded ? `- 근거에서 뺀 것: ${excluded}\n` : ""}- AI에 건네지는 근거 전체 ${delivered.length}개 중 프레임 근거 ${frameEv.length}개(나머지는 기존 사주 · 풀이 재료 · 응답 근거)

**AI에 실제 전달되는 프레임 근거** ${full ? "(전문 — fact와 cue)" : "(계산 사실만. cue는 인물 B · D에서 전문을 보인다)"}

${frameEv.map(full ? evFull : evCompact).join("\n")}

**읽기 카드(AI 서술 전의 근거 묶음)**

${r.cards.cards.map((c) => renderCard(c)).join("\n\n")}
${r.cards.skipped.length ? `\n- 카드를 만들지 않은 곳: ${r.cards.skipped.map((s) => `${s.card}(${s.reason})`).join(" / ")}\n` : ""}`;
  })
  .join("\n\n---\n\n");

const matrix = [
  `| | ${people.map((x) => `인물 ${x.n}`).join(" | ")} |\n|---|${people.map(() => "---").join("|")}|`,
  `| 발동한 프레임 | ${people.map((x) => x.r.evaluation.hits.map((h) => h.frame.id).join(" ")).join(" | ")} |`,
  `| 3장 연애 이야기 | ${people.map((x) => sig(x.r, "love").replace(/ \/ /g, "<br>")).join(" | ")} |`,
  `| 5장 재물 이야기 | ${people.map((x) => sig(x.r, "wealth").replace(/ \/ /g, "<br>")).join(" | ")} |`,
  `| 6장 과거 회고 | ${people.map((x) => pastSig(x.r)).join(" | ")} |`,
  `| 기본 풀이 근거 | ${people.map((x) => x.delivered.filter((e) => /base-/.test(e.id)).map((e) => e.id.replace("saju.frame.", "")).join(" ") || "-").join(" | ")} |`,
].join("\n");

// ───────────── 장 배정 ─────────────
const short = (id: string) => id.replace("saju.frame.", "");
const chapterTable = (p: Person) => {
  const own = story7Evidence(p.delivered);
  return STORY7_SECTIONS.map((s) => `| ${s.no}장 ${s.title} | ${own.saju[s.no].filter((id) => id.startsWith("saju.frame.")).map(short).join(" · ") || "-"} | ${own.saju[s.no].filter((id) => !id.startsWith("saju.frame.")).length} | ${own.personal[s.no].length} |`).join("\n");
};
const chapterSections = people.slice(0, 3).map((p) => `**인물 ${p.n}**\n\n| 장 | 이 장이 읽는 프레임 근거 | 기존 사주 근거 수 | 개인 성향 근거 수 |\n|---|---|---|---|\n${chapterTable(p)}`).join("\n\n");

// ───────────── 나이 범위 독립 검증 ─────────────
type AgeRow = { id: string; pos: string; from: string; to: string; shown: string; expect: string; ok: boolean };
function ageRowsOf(saju: SajuOk, r: R): AgeRow[] {
  const by = saju.solarDate.year, bm = saju.solarDate.month;
  const rows: AgeRow[] = [];
  for (const e of r.evidence) {
    if (!e.period || !e.ageWindows || /base-past/.test(e.id)) continue;
    const [fy, fm, ty, tm] = [Number(e.period.from.slice(0, 4)), Number(e.period.from.slice(5, 7)), Number(e.period.to.slice(0, 4)), Number(e.period.to.slice(5, 7))];
    const w = e.ageWindows[0];
    const past = isPastText(e.fact);
    const minFrom = ageAt(by, bm, fy, fm);
    const expTo = past ? Math.min(ageAt(by, bm, ty, tm), r.ctx.age) : ageAt(by, bm, ty, tm);
    rows.push({
      id: short(e.id), pos: e.fact.split(" ")[0] === "지금" ? "지금 지나는" : past ? (e.fact.startsWith("지금까지") ? "지금까지 지나온" : "지난") : "앞으로", from: e.period.from, to: e.period.to,
      shown: ageText(e.ageWindows), expect: `시작 ≥ ${minFrom} · 끝 = ${expTo}`, ok: w.from >= minFrom && w.to === expTo && w.from <= w.to,
    });
  }
  return rows;
}
const ageTables = people.map((p) => {
  const rows = ageRowsOf(p.saju, p.r);
  return `**인물 ${p.n}** (출생 ${p.saju.solarDate.year}-${String(p.saju.solarDate.month).padStart(2, "0")} · 지금 만 ${p.r.ctx.age}세)\n\n| 근거 | 위치 | 시기(연-월) | 전달된 만 나이 | 독립 계산 | 일치 |\n|---|---|---|---|---|---|\n${rows.map((x) => `| ${x.id} | ${x.pos} | ${x.from}~${x.to} | 만 ${x.shown}세 | ${x.expect} | ${x.ok ? "✔" : "✘"} |`).join("\n") || "| (시기 근거 없음) | | | | | |"}`;
}).join("\n\n");

// ───────────── 정보가 모자란 경우 · 연령대 ─────────────
const noGender = make(1984, 5, 21, "14:10", null);
const ng = frameCardsOf(noGender, { reference: REF });
const teenSaju = make(2009, 3, 3, "10:00", "female");
const childSaju = make(2012, 3, 3, "10:00", "male");
const audienceDemo = ([["adult", people[1].saju, 1], ["teen", teenSaju, 5], ["child", childSaju, 6]] as const).map(([a, s, idx]) => {
  const ev = deliveredOf(s, idx);
  const r = frameCardsOf(s, { reference: REF, survey: surveyAxesOf(ev) });
  const msg = buildStory7UserMessage(ev, REF_DATE, null);
  const draft = composeMockStory7(msg);
  const v = validateStory7Draft(draft, ev) as { ok: boolean; errors?: string[] };
  const hasSpouse = ev.some((e) => e.id === "saju.spouse-star" || e.id === "saju.partner");
  const frameIds = ev.filter(isFrame).map((e) => short(e.id));
  const own = story7Evidence(ev);
  return `**${AUD_LABEL[a]} 예시 — ${chartLine(s)} (지금 만 ${r.ctx.age}세, 구분 ${audienceOf(r.ctx.age)})**
- 프레임 근거: ${frameIds.join(" · ")}
- 배우자 별(saju.spouse-star) · 인연의 경향(saju.partner) 근거: ${hasSpouse ? "있음" : "**없음**(연령대에 맞춰 뺌)"}
- 3장이 읽는 프레임 근거: ${own.saju[3].filter((id) => id.startsWith("saju.frame.")).map(short).join(" · ") || "-"} · 5장: ${own.saju[5].filter((id) => id.startsWith("saju.frame.")).map(short).join(" · ") || "-"}
- 어른 관계 낱말 검사(\`audienceErrors\`)를 근거의 cue에 적용한 결과: ${(() => { const bad = audienceErrors(ev.filter((e) => /^saju\.frame\.(?!audience)/.test(e.id)).map((e) => ({ where: e.id, text: e.cue })) as never, a); return bad.length ? `${bad.length}건 — ${(bad as string[]).slice(0, 2).join(" / ")}` : "0건"; })()}
- 모의 작성기 글을 같은 형식 검사에 넣은 결과: ${v.ok ? "**통과**" : `불통과(${v.errors?.length ?? 0}건)`}(모의 작성기는 실제 서비스 AI가 아니다)`;
}).join("\n\n");

const audienceEv = people.length ? deliveredOf(childSaju, 6).filter((e) => e.id.startsWith("saju.frame.audience")) : [];
const teenEv = deliveredOf(teenSaju, 5).filter((e) => e.id.startsWith("saju.frame.audience"));

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
  const bodyOf = (r: R) => JSON.stringify(r.evidence.map((e) => [e.id, e.strength, e.fact, e.period ?? null, e.ageWindows ?? null, e.cue.split(RESPONSE_MARK)[0]]));
  const same = results.every((x) => bodyOf(x.r) === bodyOf(results[0].r));
  const respTails = new Set(results.map((x) => x.r.evidence.map((e) => e.cue.split(RESPONSE_MARK)[1] ?? "").join("|")));
  const rows = results.map((x) => {
    const love = x.r.cards.cards.find((c) => c.chapter === 3 && c.id.includes("structure"));
    const wealth = x.r.cards.cards.find((c) => c.chapter === 5 && c.id.includes("structure"));
    const f = (c: typeof love) => (c ? `${c.frameIds[0]}: ${c.lead === "hard" ? "어려운 면부터" : "좋은 면부터"} · ${c.response ? `${c.response.axis} ${c.response.mode === "differ" ? "차이 표시" : c.response.mode === "match" ? "일치 표시" : "구체화 표시"}` : "연결 없음"}` : "-");
    return `| ${x.name} | ${f(love)} | ${f(wealth)} |`;
  });
  return `**${label}** — 근거 ID · 강도 · fact · 시기 · 나이 범위 · cue의 응답 연결 앞부분이 응답 일곱 가지에서 모두 ${same ? "**같았다**" : "**달랐다(오류)**"} / 응답 연결 문장은 ${respTails.size}가지로 달랐다(바뀌는 것은 이 문장뿐)\n\n| 응답 | 3장 연애 구조 카드 | 5장 재물 구조 카드 |\n|---|---|---|\n${rows.join("\n")}\n\n- 근거 ID: ${results[0].r.evidence.map((e) => short(e.id)).join(" · ")}`;
};

// ───────────── 표본 측정 ─────────────
const sample = randomCharts(N);
const measured = sample.map((s) => ({ s, r: frameCardsOf(s, { reference: REF }) }));
const frameEvOf = (r: R) => r.evidence;
const isTiming = (e: Evidence) => /^saju\.frame\.(?:L6|W8|R\d)\./.test(e.id);

// 프레임 없는 명식(구조 프레임이 연애 · 재물 모두 없음)에서 기본 풀이가 달라지는가
const noLoveAndWealth = measured.filter((x) => x.r.ctx.gender && x.r.ctx.audience === "adult" && !x.r.selection.love?.structure && !x.r.selection.wealth?.structure);
const pickedBase: typeof noLoveAndWealth = [];
for (const x of noLoveAndWealth) {
  if (pickedBase.length >= 2) break;
  if (pickedBase.length === 1 && x.s.pillars.find((p) => p.key === "day")?.branch === pickedBase[0].s.pillars.find((p) => p.key === "day")?.branch) continue;
  if (x.r.evidence.some((e) => e.id === "saju.frame.base-love") && x.r.evidence.some((e) => e.id === "saju.frame.base-wealth")) pickedBase.push(x);
}
const baseDemo = pickedBase
  .map((x, i) => {
    const ev = x.r.evidence.filter((e) => /base-/.test(e.id));
    return `**프레임 없는 명식 ${i + 1}** — ${chartLine(x.s)} (지금 만 ${x.r.ctx.age}세)\n- 발동한 프레임: ${x.r.evaluation.hits.map((h) => h.frame.id).join(" · ") || "(없음)"} — 연애 · 재물 구조 이야기는 없다\n${ev.map((e) => `${evFull(e)}`).join("\n")}`;
  })
  .join("\n\n");
const baseKinds = (id: string) => measured.map((x) => x.r.evidence.find((e) => e.id === id)?.fact).filter((v): v is string => !!v);
const collide = (arr: string[]) => {
  const cnt = new Map<string, number>();
  for (const a of arr) cnt.set(a, (cnt.get(a) ?? 0) + 1);
  let same = 0;
  for (const v of cnt.values()) same += (v * (v - 1)) / 2;
  const n = arr.length;
  return { p: n > 1 ? same / ((n * (n - 1)) / 2) : 0, kinds: cnt.size, max: cnt.size ? Math.max(...cnt.values()) : 0, n };
};
const baseLoveFacts = baseKinds("saju.frame.base-love");
const baseWealthFacts = baseKinds("saju.frame.base-wealth");
const basePastFacts = baseKinds("saju.frame.base-past");
const adultGender = measured.filter((x) => x.r.ctx.gender && x.r.ctx.audience === "adult");
const loveText = (x: (typeof measured)[number]) => x.r.evidence.some((e) => /^saju\.frame\.(?:L[1-5]|base-love)$/.test(e.id));
const wealthText = (x: (typeof measured)[number]) => x.r.evidence.some((e) => /^saju\.frame\.(?:W[1-7]|base-wealth)$/.test(e.id));
const pastText = (x: (typeof measured)[number]) => x.r.evidence.some((e) => /^saju\.frame\.(?:R\d\.|base-past)/.test(e.id));
const neverEmpty = (arr: typeof measured, f: (x: (typeof measured)[number]) => boolean) => arr.filter(f).length / Math.max(1, arr.length);

// 나이 범위 독립 검증(표본 전체) · 장 배정 중복 · 과거 시기 개수
let ageChecked = 0, ageBad = 0;
let ownMulti = 0, ownNone = 0, slugDup = 0, factDup = 0;
const pastCounts: number[] = [], ch6Counts: number[] = [], frameEvCounts: number[] = [];
for (const { s, r } of measured) {
  for (const row of ageRowsOf(s, r)) { ageChecked++; if (!row.ok) ageBad++; }
  const fe = frameEvOf(r);
  frameEvCounts.push(fe.length);
  const slugs = new Set<string>(), facts = new Set<string>();
  let dup = false, fdup = false;
  for (const e of fe) {
    const o = owners7(e);
    if (o.length > 1) ownMulti++;
    if (o.length === 0) ownNone++;
    if (isTiming(e)) {
      const slug = e.id.split(".")[3];
      if (slugs.has(slug)) dup = true;
      slugs.add(slug);
    }
    if (facts.has(e.fact)) fdup = true;
    facts.add(e.fact);
  }
  if (dup) slugDup++;
  if (fdup) factDup++;
  pastCounts.push(fe.filter((e) => isTiming(e) && isPastText(e.fact)).length);
  ch6Counts.push(fe.filter((e) => owners7(e).includes(6)).length);
}
const dist = (arr: number[]) => {
  const m = new Map<number, number>();
  for (const a of arr) m.set(a, (m.get(a) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}개 ${pct(v / arr.length)}`).join(" · ");
};

const hitCounts = measured.map((x) => x.r.evaluation.hits.length).sort((a, b) => a - b);
const q = (p: number) => hitCounts[Math.floor(p * (N - 1))];
const coreOf = (r: R, k: "love" | "wealth") => r.selection[k]?.structure?.core.frame.id ?? "(없음)";
const loveCore = collide(measured.filter((x) => x.r.ctx.gender).map((x) => coreOf(x.r, "love")));
const wealthCore = collide(measured.map((x) => coreOf(x.r, "wealth")));
const idSets = collide(measured.map((x) => x.r.evidence.map((e) => e.id).sort().join(",")));
const share = (f: (r: R) => boolean) => measured.filter((x) => f(x.r)).length / N;
const loveHasStruct = share((r) => !!r.selection.love?.structure);
const wealthHasStruct = share((r) => !!r.selection.wealth?.structure);
const loveAhead = share((r) => !!r.selection.love?.ahead);
const wealthAhead = share((r) => !!r.selection.wealth?.ahead);
const pastChart = share((r) => r.selection.past.basis === "chart");
const rate: Record<string, number> = {};
for (const f of FRAMES) rate[f.id] = measured.filter((x) => x.r.evaluation.hits.some((h) => h.frame.id === f.id)).length / N;
const hitTable = FRAMES.map((f) => `| ${f.id} | ${f.name} | ${f.grade} | ${pct(FRAME_HIT_RATE[f.id])} | ${f.grade === "자체조합" ? "평가하지 않음" : pct(rate[f.id], 1)} |`).join("\n");

// 기타 정보 부족
const shakyAt = measured.findIndex((x) => x.r.ctx.uncertain.length && x.r.evaluation.excluded.length);
const shaky = shakyAt >= 0 ? measured[shakyAt] : undefined;
const unknownAt = measured.findIndex((x) => !x.r.ctx.hourKnown && x.r.ctx.gender && x.r.cards.cards.length);
const unknownHour = unknownAt >= 0 ? measured[unknownAt] : undefined;
const insufficient = `### 1) 성별을 받지 않은 경우(인물 B와 같은 사주에서 성별만 뺌)
- 발동한 프레임: ${ng.evaluation.hits.map((h) => h.frame.id).join(" · ") || "(없음)"}
- 발동하지 못한 이유: ${[...new Set(ng.evaluation.unavailable.map((u) => u.reason))].join(" / ")}
- 카드를 만들지 않은 곳: ${ng.cards.skipped.map((s) => `${s.card}(${s.reason})`).join(" / ")}
- 만든 AI 근거: ${ng.evidence.map((e) => short(e.id)).join(" · ") || "(없음)"} — **연애 · 시기 · 과거 회고의 프레임 사건을 지어내지 않는다.** 기본 풀이는 성별이 있어야 배우자 별을 정하므로 base-love도 만들지 않는다.

### 2) 절기 경계 · 야자시 관법으로 기둥이 흔들리는 경우
${shaky ? `- 예: ${chartLine(shaky.s)}\n- 흔들리는 기둥: ${[...new Set(shaky.r.ctx.uncertain)].join(" · ")} — 근거에서 뺀 것: ${shaky.r.evaluation.excluded.map((e) => `${e.frameId}(${e.reason})`).join(" / ")}` : "- (표본에서 흔들리는 기둥에 기댄 프레임이 없었다)"}

### 3) 출생 시각을 모르는 경우
${unknownHour ? `- 예: ${chartLine(unknownHour.s)}\n- 발동한 프레임: ${unknownHour.r.evaluation.hits.map((h) => h.frame.id).join(" · ")} — 시주를 쓴 사실이 없다(시험이 확인). 대운 전환은 연 단위 "무렵"으로만 말한다.` : "- (표본 없음)"}`;

// ───────────── 비용 ─────────────
const cand = AI_CANDIDATES.find((c) => c.key === "A")!;
const settings = { fxKrwPerUsd: DEFAULT_FX_KRW_PER_USD, surcharge: DEFAULT_SURCHARGE };
const costRows = buildPersonas(10).map((p) => {
  const plan = planStage({ stage: "story7-own", capKrw: 6000, personas: [p], candidates: [{ key: "A", price: cand.price }], settings, now: new Date("2026-10-18T03:00:00Z"), variant: "story-7" });
  return { id: p.id, worst: plan.firstCallWorstKrw, exp: plan.expectedKrw };
});
const costMax = Math.max(...costRows.map((c) => c.worst));
const costAvg = costRows.reduce((a, c) => a + c.worst, 0) / costRows.length;
const costExp = costRows.reduce((a, c) => a + c.exp, 0) / costRows.length;
const frameChars = people.map((p) => p.delivered.filter(isFrame).reduce((n, e) => n + e.fact.length + e.cue.length, 0));

// ───────────── 지시문 발췌 ─────────────
const blockOf = (head: string) => {
  const i = STORY7_SYSTEM_PROMPT.indexOf(head);
  if (i < 0) return "(찾지 못함)";
  const j = STORY7_SYSTEM_PROMPT.indexOf("\n\n[", i + 1);
  return STORY7_SYSTEM_PROMPT.slice(i, j < 0 ? undefined : j);
};

const doc = `# 명리 조합 해석 프레임 v1 — 연애 · 재물 · 과거 회고 20개 (${FRAME_RULE_VERSION}) · AI 근거 연결

- 이 문서는 \`lib/saju/interpret/frames/\`에서 \`node scripts/render-frames-doc.ts\`로 만든다. 손으로 고치지 않는다.
- **상태(운영자 2026-10-18 연결 승인): 프레임을 개인 심층 리포트 \`story-7\` 형식의 AI 근거와 읽기 카드에 연결했다. 지시문은 \`${STORY7_PROMPT_VERSION}\`(기존 7개 장 유지). 새 AI 호출 · 운영 DB 변경 · 실결제 · Production 배포는 하지 않았다(호출 0회). 연결한 뒤 실제 AI로 글을 읽은 적은 없다 — 검증되지 않았다.**
- 프레임의 조건 · 키워드는 전통 해석을 단순화한 가설이며 **원전 대조와 전문가 검토를 하지 않았다 — "검증됨 · 전문가 감수"라고 읽지 않는다.** 아래 "근거 수준"은 미유가 정한 분류일 뿐 외부 검토 결과가 아니다.
- 만세력 엔진은 바꾸지 않았고 새 만세력 계산 기능도 없다 — 이미 계산된 값(십성 · 지장간 · 월령 · 대운 · 세운 · 합충형)을 프레임 재료로 모았다.
- 숫자는 모두 이 저장소의 엔진으로 직접 센 값이다. 가정: 출생 1960~2006 균등 · 성별 반반 · 시각 미상 20% · 기준일 ${REF.year}-${REF.month} · 표본 ${N}명(고정 난수). 실제 이용자 분포가 아니다.

## 0. 이번에 한 일과 바뀐 파일

**운영자 결정문 6가지에 대한 처리**

| 결정 | 처리 |
|---|---|
| 1. 연애 6 · 재물 8 · 과거 회고 6을 AI 근거와 읽기 카드에 연결 | 연결함(story-7만). 단 아래 2에 따라 **17개만** 근거로 쓰고 3개는 제외 |
| 2. 근거가 불분명한 프레임은 쓰지 않고 제외 사유 기록 | 근거 수준을 통설 · 단순화 · 자체조합으로 매기고 **자체조합 3개(W5 · R1 · R2)를 평가에서 제외** — 사유는 2장 · 3장 |
| 3. 엔진에 있는 과거 대운 · 세운을 AI에 전달 | 프레임이 고른 지난 대운 · 세운 + 지난 대운 개요(base-past)를 \`period\`와 \`ageWindows\`(정확한 만 나이 범위)로 전달 — 8장에서 독립 계산과 대조 |
| 4. 새 만세력 계산 기능 없음 | 없음(\`context.ts\`가 기존 함수 결과를 모으는 것뿐) |
| 5. 지시문 0.6, 기존 7개 장 유지 | \`${STORY7_PROMPT_VERSION}\` — 7개 장 · 제목 · 순서 그대로, 새 블록 둘(프레임 읽기 · 미성년) 추가. 14장 |
| 6. 개인 심층 신규 AI 호출 없음 | 호출 0회. 승인 횟수 \`runsApproved 3 / runsDone 3\`와 3차 원문 · 입력 · 비용 기록은 건드리지 않았다 |

**바뀐 파일**

| 파일 | 내용 |
|---|---|
| \`lib/saju/interpret/frames/types.ts\` · \`context.ts\` | 근거 수준(grade) · 연령대(audience) · 월 단위 정확한 만 나이 · 시기 칸의 만 나이 범위 |
| \`frames/love.ts\` · \`wealth.ts\` · \`past.ts\` | 프레임마다 근거 수준과 판단 이유 기록(W5 · R1 · R2는 제외 사유) |
| \`frames/select.ts\` | 제외(held) 기록 · 프레임별 나이 하한 · 연령대별 이야기 제한 · 과거 시기 합계 상한(${PAST_TOTAL_MAX}개) · 같은 시기 중복 제거 |
| \`frames/base.ts\`(신규) | 프레임이 없는 곳을 위치와 운으로 읽는 **기본 풀이 근거** (연애 · 재물 · 또래 관계 · 지난 대운 개요) |
| \`frames/evidence.ts\` · \`audience.ts\`(신규) · \`index.ts\` | 프레임 → AI 근거 변환(fact · cue · period · ageWindows) · 연령대별 근거 정리 |
| \`frames/data.ts\` · \`cards.ts\` | 데이터 확보 표 갱신 · 카드 표기 |
| \`lib/report/evidence.ts\` | 근거 타입에 \`ageWindows\` 추가 |
| \`lib/report/ai/generator.ts\` | \`buildEvidence\`의 story-7 경로에 프레임 근거 연결(이전 형식은 그대로) |
| \`lib/report/reading/story7-plan.ts\` · \`story7-prompt.ts\` · \`story7-validate.ts\` · \`validate.ts\` | 장별 근거 소유 · 6번 장 한도 · 지시문 0.6 · 나이는 6번 장의 근거 범위 안에서만 · 과거 사건 단정 차단 |
| \`lib/report/reading/audience-scope.ts\`(신규) · \`story7-mock-model.ts\` · \`story7-assemble.ts\` | 연령대별 금지 낱말 검사 · 모의 작성기와 3번 장 제목 조정(만 16세 미만) |
| \`lib/saju/interpret/rule-meta.ts\` | 프레임 근거 ID 4종 규칙 이력 등록(frame-structure · frame-timing · frame-base · frame-audience) |
| \`frames/frames.test.ts\` · \`connect.test.ts\`(신규) · \`story7*.test.ts\` | 시험 |
| \`scripts/render-frames-doc.ts\` · 이 문서 · \`docs/saju-rules.md\` · \`CLAUDE.md\` | 문서 |

## 1. 프레임 20개 한눈에

| ID | 영역 | 이름(내부) | 근거 수준 | AI 근거 | 발동 조건 | 명중률 | 필요한 입력 | 데이터 확보 |
|---|---|---|---|---|---|---|---|---|
${summaryRows}

- **근거 수준**: 통설 = 전통에서 이름이 있는 구조를 그대로 / 단순화 = 통설 구조를 한두 조건으로 줄인 것 / 자체조합 = 통설 이름이 없고 미유가 조건을 조합한 것. 외부 검토가 아니라 미유 판단이다.
- **데이터 확보**: ✘ = AI 근거에 없던 데이터 포함, △ = 일부만, ✔ = 이미 있음. 지난 대운 · 세운은 이번에 프레임이 고른 시기만 연결했다.
- 명중률이 높은 시기 프레임(L6 · W8)은 "해당 시기가 하나라도 있는 비율"이라 거의 모두에게 나온다. 변별은 **어느 시기인가**(나이대 · 대운 · 세운)로 한다.

## 2. 제외한 프레임과 사유 (운영자 결정 2)

근거가 불분명한 프레임은 평가하지 않는다(발동 여부를 보지 않으므로 어떤 명식에서도 AI 근거로 나가지 않는다). 사유는 코드에도 같은 문장으로 기록돼 있다(\`gradeNote\` · \`heldReasonOf\`).

${FRAMES.filter((f) => f.grade === "자체조합").map((f) => `- **${f.id} ${f.name}** (${AREA_LABEL[f.area]}) — ${f.gradeNote}`).join("\n")}

**제외와 범위 제한 전체 표** (W5 · R1 · R2는 모든 연령에서 제외, 나머지 행은 연령대별 범위 제한)

${heldTable}

- 제외한 3개는 다른 프레임이 대신 같은 주제를 읽는다(예: W5 대신 W4 · W3, R1 · R2 대신 R3~R6). 프레임이 더 줄어도 기본 풀이 층(6장)이 연애 · 재물 · 과거를 비우지 않는다.
- 나머지 17개도 단순화한 가설이며 외부 검토를 받지 않았다. "통설"로 매긴 것은 구조 이름이 전통에 있다는 뜻이지 이 저장소의 조건이 정확하다는 뜻이 아니다.

## 3. 기존 엔진에서 실제로 확보 가능한 데이터

| 데이터 | 엔진 | AI 근거 | 설명 |
|---|---|---|---|
${dataRows}

- **계산하지 않은 것**: 격국 · 용신 · 희신 · 기신 · 신살 · 십이운성 · 공망 기반 프레임 · 원진 · 파 · 해. 프레임 조건에도 쓰지 않았고 시험이 막는다.

## 4. 프레임 상세 — 정확한 적용 조건 · 명리 근거 · 해석 후보

${FRAMES.map(detail).join("\n\n")}

## 5. 서로 다른 다섯 명식 — AI에 실제 전달되는 근거

> 출생 날짜는 설명을 위한 임의 값이고 실제 사람이 아니다. 응답은 개발용 문항에 가상으로 답한 값이다. "AI에 실제 전달되는 근거"는 실제 생성 경로(\`buildEvidence\`, story-7)가 만드는 목록 그대로다. 카드는 **AI가 쓰기 전의 근거 묶음**이며 완성된 글이 아니다. 실제 AI로 이 근거를 읽은 적은 없다(검증되지 않음).

### 5-1. 한눈에 비교

${matrix}

${peopleSections}

## 6. 프레임이 없는 명식도 기본 풀이를 받는다 (운영자 요청 ①)

특별한 조합 구조가 없는 명식은 연애 · 재물 · 과거 풀이를 비우지 않고 **기본 풀이 근거**(\`saju.frame.base-*\`)로 읽는다. 새 계산 규칙이 아니라 이 명식의 **위치**(배우자 별이 천간에 드러났는지 · 지지 속인지 · 없는지, 일지와 월지의 십성, 일지의 합 · 충 · 형)와 **운**(지난 · 지금 · 다음 대운이 그 주제를 들이는지)을 이미 계산된 값에서 적은 것이다. 근거 문장에 "특별한 조합 구조는 발동하지 않았어요"를 밝히고 조합 이름을 붙이지 않는다.

${baseDemo || "(표본에서 두 명식을 고르지 못했다)"}

**기본 풀이가 명식마다 다른가 (표본 ${N}명, 가정은 위와 같음)**

| 근거 | 만들어진 명식 | 서로 다른 fact | 임의의 두 명식이 같은 fact일 확률 |
|---|---|---|---|
| base-love(연애 · 배우자) | ${baseLoveFacts.length}명 | ${collide(baseLoveFacts).kinds}종 | ${pct(collide(baseLoveFacts).p, 2)} |
| base-wealth(재물) | ${baseWealthFacts.length}명 | ${collide(baseWealthFacts).kinds}종 | ${pct(collide(baseWealthFacts).p, 2)} |
| base-past(지난 대운 개요) | ${basePastFacts.length}명 | ${collide(basePastFacts).kinds}종 | ${pct(collide(basePastFacts).p, 2)} |

- **연애 · 재물 · 과거 근거가 하나도 없는 명식**(만 19세 이상, 성별 있음): 연애 ${pct(1 - neverEmpty(adultGender, loveText), 1)} · 재물 ${pct(1 - neverEmpty(adultGender, wealthText), 1)} · 과거 ${pct(1 - neverEmpty(measured, pastText), 1)} — 값이 0%에 가까울수록 "연애복 · 재물복 · 과거가 비는 일"이 없다는 뜻이다(과거는 만 7세 이후 지난 대운이 없는 어린 명식만 비게 된다).
- 같은 fact 확률이 작다는 것은 **근거의 구조가 명식마다 다르다**는 것이지 글이 다르다는 증거가 아니다. 실제 AI 글에서 명식마다 풀이가 다르게 읽히는지는 확인하지 못했다.
- 기본 풀이를 짧게 때우지 않도록 지시문(14장)이 위치와 운으로 풀게 하고, "있는 것처럼 꾸미지 않기"는 근거 문장에 이미 들어 있다.

## 7. 지난 · 지금 · 앞으로의 대운 · 세운 — 정확한 만 나이 범위 독립 검증 (운영자 요청 ③)

계산식: 만 나이 = 시기의 연 − 출생 연 − (시기의 월 < 출생 월 ? 1 : 0). 생일의 일은 따지지 않아 한 살 안쪽 어림이 남으므로 모든 시기는 "만 N세 무렵"으로만 말한다. 아래 표의 "독립 계산"은 프레임 코드를 거치지 않고 출생 연-월과 근거에 전달된 시기(연-월)만으로 이 문서가 다시 센 값이다. 지난 시기의 끝은 지금 나이까지만 자른다(아직 오지 않은 나이를 말하지 않는다).

${ageTables}

- **표본 ${N}명 전체**: 시기 근거 ${ageChecked}개를 같은 방법으로 대조해 **불일치 ${ageBad}개**.
- 지난 대운 개요(base-past)는 만 7세 이전 구간을 자르고 현재 나이까지만 보인다.
- **한계**: 대운이 바뀌는 달은 출생 시각을 모르면 정확하지 않아 연 단위 "무렵"으로만 말한다. 대운 시작 나이(대운수) 계산 방식은 엔진의 기존 결과를 그대로 쓴 것이며 이번에 새로 검증하지 않았다.

## 8. 장 배정 — 1~7장에 같은 근거를 두 번 주지 않는다 (운영자 요청 ⑤)

코드가 장마다 읽을 프레임 근거를 정해 사용자 메시지(\`sajuEvidence\`)로 나눠 건넨다. 연애 구조는 3장, 재물 구조는 5장, 시기(지난 · 지금 · 앞으로)와 과거 회고 · 지난 대운 개요는 6장만 읽는다. 나이 표현은 6장 근거의 범위 안에서만 허용된다(다른 장의 나이 · 시기 이야기는 검사가 막는다).

${chapterSections}

**표본 ${N}명 전체 측정**

- 프레임 근거를 읽는 장이 **둘 이상인 근거: ${ownMulti}개 / 읽는 장이 없는 근거: ${ownNone}개** (모두 0이어야 한다)
- 같은 시기(같은 대운 · 세운)가 두 프레임 근거로 중복된 명식: ${slugDup}명 · 같은 사실 문장이 중복된 명식: ${factDup}명
- 명식당 프레임 근거 수: ${dist(frameEvCounts)}
- 6장이 읽는 프레임 근거 수: ${dist(ch6Counts)} (6장 한도: 문단 6개)
- 지난 시기(과거로 말하는) 시기 근거 수: ${dist(pastCounts)} — 상한 ${PAST_TOTAL_MAX}개를 넘은 명식 ${pastCounts.filter((n) => n > PAST_TOTAL_MAX).length}명
- **한계**: "근거를 한 장에만 준다"는 것은 코드의 배정이다. 글에서 같은 이야기를 다른 말로 되풀이하는지는 코드가 완전히 잡지 못하며, 지시문 · 검사(12자 구절 반복 · 맺음 틀 예산) · 사람이 읽는 평가로 본다.

## 9. 연령대 분기 — 미성년의 연애 · 결혼 풀이 (운영자 요청)

- 만 19세 이상(adult): 연애 · 배우자복 · 결혼운 풀이 가능.
- 만 16~18세(teen): 호감 · 첫 연애 · 친밀감 · 관계 경험 중심. 결혼 · 배우자 확정 풀이 · 인연의 나이 방향을 쓰지 않는다. 실제 연애 경험이 있다고 가정하지 않는다.
- 만 16세 미만(child): 연애 대신 또래 관계 · 대인관계 성장 중심. 연애 · 이성 · 결혼 · 배우자 풀이를 쓰지 않고 재물 구조 풀이도 없다.
- 구현: 코드가 근거를 걸러 건넨다(배우자 별 · 인연의 경향 근거를 빼고, 남은 근거의 "배우자 · 연인" 말을 가까운 관계 말로 바꾸고, 연령대 안내 근거를 더한다) + 지시문 새 블록 + 검사(\`audience-scope.ts\` — 연령대에 맞지 않는 낱말 차단). 만 16세 미만은 3장 제목도 "또래 관계와 애착"으로 바꾼다(**운영자 확인 항목**).

${audienceDemo}

**연령대 안내 근거(AI에 전달되는 그대로)**

${[...teenEv, ...audienceEv].map(evFull).join("\n")}

- **한계**: 검사는 연령대에 맞지 않는 **낱말**을 막는다. 낱말 없이 은근히 관계를 가정하는 문장은 코드가 못 잡는다. 모의 작성기가 통과한다는 것은 형식이 만족 가능하다는 뜻이지 실제 AI가 잘 쓴다는 뜻이 아니다.

## 10. 응답은 프레임의 있고 없음을 바꾸지 않는다 (같은 사주, 다른 응답)

${variantsOf(PEOPLE[1].saju, "인물 B (1984년생 여성)")}

${variantsOf(PEOPLE[3].saju, "인물 D (1996년생 남성)")}

- 응답이 바꾸는 것은 **앞세울 얼굴(좋은 면 · 어려운 면)과 "일치 · 차이 · 구체화" 표시뿐**이다. 사주와 응답이 다르면 차이를 지우지 않고 상황별 차이로 설명하는 표시를 붙인다. 프레임의 설문 연결에 없는 축은 연결 표시가 없다.

## 11. 정보가 모자란 경우 — 거짓 근거를 만들지 않는다

${insufficient}

## 12. 측정 (표본 ${N}명, 위 가정)

- 명식당 발동한 프레임: 평균 ${(hitCounts.reduce((a, b) => a + b, 0) / N).toFixed(1)}개 · 10% ${q(0.1)} · 중앙 ${q(0.5)} · 90% ${q(0.9)} · 최소 ${hitCounts[0]} · 최대 ${hitCounts[N - 1]} (제외한 3개는 평가하지 않아 포함되지 않는다)
- 구조 이야기가 있는 명식: 연애 ${pct(loveHasStruct)} · 재물 ${pct(wealthHasStruct)} — **나머지는 구조 프레임이 없어 6장의 기본 풀이로 읽는다**(위 6장)
- 앞으로 시기(열 해 안)가 있는 명식: 연애 ${pct(loveAhead)} · 재물 ${pct(wealthAhead)}
- 과거 회고를 사주 기반으로 읽은 명식: ${pct(pastChart)}
- 임의의 두 명식이 같은 AI 프레임 근거 ID 묶음을 받을 확률: ${pct(idSets.p, 2)} (서로 다른 묶음 ${idSets.kinds}종, 가장 흔한 묶음을 받는 명식 ${idSets.max}명) — 구조일 뿐 글의 차이가 아니다
- 구조 핵심 프레임이 같은 확률: 연애 ${pct(loveCore.p, 1)} · 재물 ${pct(wealthCore.p, 1)}

### 프레임별 명중률(표의 값 · 이번에 센 값)

| ID | 이름 | 근거 수준 | 명중률 표 | 센 값 |
|---|---|---|---|---|
${hitTable}

## 13. 비용 변화 (호출 없음, 계산만)

\`planStage\`(승인 가드와 같은 계산: 환율 ${DEFAULT_FX_KRW_PER_USD}원 · 여유율 ${DEFAULT_SURCHARGE} 적용)로 가상 인물 10명의 **첫 호출 최악 예약액**을 다시 계산했다.

| 인물 | 첫 호출 최악 | 예상 |
|---|---|---|
${costRows.map((c) => `| ${c.id} | ${c.worst.toFixed(1)}원 | ${c.exp.toFixed(1)}원 |`).join("\n")}

- 최대 **${costMax.toFixed(1)}원** · 평균 ${costAvg.toFixed(1)}원 · 예상 평균 ${costExp.toFixed(1)}원. 시스템 지시문 ${STORY7_SYSTEM_PROMPT.length.toLocaleString()}자, 프레임 근거는 다섯 명식에서 ${Math.min(...frameChars).toLocaleString()}~${Math.max(...frameChars).toLocaleString()}자.
- 연결 전(e3306b9, 지시문 0.5) 같은 계산의 최대는 약 648원이었다(이전 커밋에서 같은 방법으로 돌려 얻은 값 — 이 문서가 다시 계산하지는 않는다). 즉 **최악 예약액이 약 40원 늘었다**.
- **기존 3차 시험 승인의 1회 상한은 700원이고 \`runsApproved 3 / runsDone 3\`으로 소진됐다.** 새 호출을 승인한다면 최악 ${costMax.toFixed(1)}원은 700원 상한 안이지만 여유가 ${(700 - costMax).toFixed(1)}원뿐이라, 프레임이나 지시문을 더 얹으면 상한을 넘는다 — 새 승인 때 1회 상한을 다시 정해야 한다. 이 문서 작성 중 호출은 하지 않았다.

## 14. 지시문 ${STORY7_PROMPT_VERSION} — 새로 더한 블록 (기존 7개 장 구성은 그대로)

\`\`\`
${blockOf("[명리 조합 읽기")}

${blockOf("[읽는 사람이 만 19세 미만인 경우")}
\`\`\`

- 이 밖에 6장 질문 · 포함 항목 · 반복 안내를 "지나온 시기 → 지금 → 앞으로" 한 사람의 흐름으로 잇도록 바꿨고(문단 상한 6), 3장 · 5장은 기본 풀이 근거를 위치와 운으로 풀게 했다. 7개 장의 번호 · 제목 · 순서는 그대로다.
- **검사 변경**: 나이는 6장의 근거 범위 안에서만 허용 / 지난 시기를 "있었던 일"로 단정하면 막음(가능성 표현 필요) / 연령대에 맞지 않는 낱말 차단. 용어 · 문단 길이는 이전 정책대로 경고(WARN)만 한다.

## 15. 지금 구조의 약점 — 정직하게

1. **실제 AI 글을 읽지 않았다.** 근거 묶음과 형식 검사가 만족 가능하다는 것(모의 작성기)만 확인했다. 지시문 0.6과 프레임 문장이 실제 글을 좋게 만드는지는 모른다 — 출시 판단 ① "개인 심층 실제 AI 리포트 품질"은 여전히 검증되지 않았다.
2. **구조만 보면 같은 이야기가 자주 겹친다**: 구조 핵심 프레임이 같은 확률이 연애 ${pct(loveCore.p, 1)} · 재물 ${pct(wealthCore.p, 1)}. 변별은 시기와 기본 풀이의 위치에서 나오는데, 이것도 구조의 차이이지 글의 차이가 아니다.
3. **구조 프레임이 없는 명식(연애 ${pct(1 - loveHasStruct)} · 재물 ${pct(1 - wealthHasStruct)})은 기본 풀이에 의존한다.** 기본 풀이는 근거가 weak이라 AI가 짧게 때우거나 일반론으로 흐를 위험이 있다 — 실제 글로 확인해야 한다.
4. **조건 · 임계값(자리 수 3 이상 등)과 근거 수준 분류는 설계 가설이다.** 전통 문헌과 대조하지 않았고 학파마다 다를 수 있다. 학파 차이는 문서에만 남기고 한 가지 기준만 쓴다.
5. **나이 · 시기 위치는 어림이다.** 생일의 일을 따지지 않아 ±1세 오차가 있어 "무렵"으로 말한다. 시주를 모르면 대운 전환 달도 정확하지 않다.
6. **응답 연결은 프레임당 1~2개뿐**이고 설계 가설이며 실제 사람이 풀어 본 적이 없다.
7. **미성년 분기는 낱말 검사가 중심이다.** 만 16세 미만의 3장 제목 변경(또래 관계와 애착)과 만 16~18세의 풀이 범위는 운영자 확인 항목이다. 이전 형식(reading-v1 · story-v1)과 채팅은 연령대 분기가 없다(story-7만 연결).
8. **최악 비용 여유가 ${(700 - costMax).toFixed(1)}원뿐이다**(기존 상한 700원 기준). 새 호출은 새 승인과 새 상한이 필요하다.
9. **제외한 3개(W5 · R1 · R2)와 나머지 17개 모두 외부 검토를 받지 않았다.** 명리 전문가 의뢰는 하지 않기로 했으므로(운영자 2026-10-18) 실제 명리 오류가 보이면 출시 전에 고치는 방식으로만 다룬다.

## 16. 다음 단계 — 범위 동결(운영자 2026-10-18): 아래 순서만, 프레임 · 기능 추가 없음

1. ✔ 기존 20개 프레임(제외 3개 포함) + 과거 대운 · 세운을 AI 근거에 연결 — 이 문서.
2. ✔ 0원 테스트 — 위 측정과 시험(\`npm run check\`).
3. 개인 심층 실제 AI 1회 검증 — **운영자 별도 승인 필요**(1회 상한 · 총액을 다시 정함, 위 13장). 승인 전에는 호출하지 않는다. 가상 인물이 아니라 운영자 본인 입력(\`story7-own\`)으로 읽는 것을 권한다.
4. 궁합 2종(사주 궁합 · 리포트 궁합) 실제 AI 검증 — 별도 승인.
5. 스테이징 결제 · 환불 · 공동 열람 테스트 — 별도 승인(실결제 · 운영 DB 적용 아님).
6. 개인정보 · 약관 · 모바일 최종 점검.
7. 출시 여부 결정(\`launch-checklist.md\`).

- 실제 글을 읽고 **출시를 막는 오류**가 있을 때만 그 오류를 최소 수정한다. 통과한 부분은 다시 설계하지 않는다. 개인 리포트가 완벽하지 않아도 내용이 충분하고 읽을 만하면 출시한다(운영자).
- 출시 후 개선 후보는 \`post-launch-backlog.md\`에만 적는다. 이 20개 밖의 영역(인간관계 · 직업 · 성향 등) 프레임은 만들지 않는다.
`;

writeFileSync(new URL("../docs/saju-frames-v1.md", import.meta.url), doc);
console.log(`docs/saju-frames-v1.md 생성 — ${doc.length}자 · 시기 근거 대조 ${ageChecked}개 불일치 ${ageBad} · 장 중복 ${ownMulti}/미배정 ${ownNone} · 비용 최대 ${costMax.toFixed(1)}원`);
