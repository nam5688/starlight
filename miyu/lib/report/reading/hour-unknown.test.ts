// 출생 시각을 모르는 사람(시주 없이 세 기둥으로 읽는 경우)의 풀이 범위 — 근거 · 검사 · 조립 · 십성 표 독립 대조. 실제 AI는 부르지 않는다(모의 작성기만).
// 이 시험이 통과해도 실제 AI의 글이 범위를 지킨다는 뜻이 아니다 — 실제 AI로는 아직 한 번도 시험하지 못했다(검증되지 않음). 사주아이 결과지의 이름 · 생년월일은 이 시험 어디에도 쓰지 않는다(가상 인물 + 임의 날짜).
import assert from "node:assert/strict";
import test from "node:test";
import { getBranchTenGod, getTenGod } from "manseryeok";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import type { SajuOk } from "../../saju/engine.ts";
import { ELEMENT_FORTUNE, fortifyOf } from "../../saju/interpret/fortune.ts";
import { HOUR_UNKNOWN_CAVEAT, HOUR_UNKNOWN_ID, hasHourUnknownEvidence, hourUnknownEvidence } from "../../saju/interpret/hour-unknown.ts";
import { buildPersonas } from "../ai/compare-personas.ts";
import { buildEvidence } from "../ai/generator.ts";
import { familyPastErrors, hourUnknownErrors } from "./hour-scope.ts";
import { assembleStory7 } from "./story7-assemble.ts";
import { composeMockStory7 } from "./story7-mock-model.ts";
import { STORY7_SYSTEM_PROMPT, buildStory7UserMessage } from "./story7-prompt.ts";
import { story7Evidence } from "./story7-evidence.ts";
import { validateStory7Draft } from "./story7-validate.ts";
import type { Story7DraftV1 } from "./types.ts";

const PERSONAS = buildPersonas(10);
const KNOWN = PERSONAS[0]; // 시각을 아는 가상 인물
const UNKNOWN = PERSONAS[2]; // 시각을 모르는 가상 인물(P03)
const REF = { year: 2026, month: 10 };
const EV_KNOWN = buildEvidence(KNOWN.input, REF, { fortune: true });
const EV_UNKNOWN = buildEvidence(UNKNOWN.input, REF, { fortune: true });
const saju = (p: (typeof PERSONAS)[number]) => p.input.saju as SajuOk;

test("전제: 가상 인물 P01은 시각을 알고 P03은 모른다", () => {
  assert.equal(saju(KNOWN).hourPillarOmitted, false);
  assert.equal(saju(UNKNOWN).hourPillarOmitted, true);
  assert.equal(saju(UNKNOWN).pillars.length, 3);
  assert.equal(Object.values(saju(UNKNOWN).elementCounts).reduce((a, b) => a + b, 0), 6);
});

test("근거: 시각을 모를 때만 saju.hour.unknown이 있고, 세 기둥 기준이라는 범위가 없음 · 적음 · 후보를 말하는 근거마다 적힌다", () => {
  assert.equal(hasHourUnknownEvidence(EV_KNOWN), false);
  assert.equal(hasHourUnknownEvidence(EV_UNKNOWN), true);
  const hour = EV_UNKNOWN.find((e) => e.id === HOUR_UNKNOWN_ID)!;
  assert.equal(hour.strength, "strong");
  assert.match(hour.fact, /세 기둥/);
  assert.match(hour.fact, /시주로 읽는 풀이/);
  assert.deepEqual(hourUnknownEvidence(saju(KNOWN)), []);
  // 없음 · 적음 · 후보를 말하는 근거는 세 기둥 기준을 밝힌다(원국 전체에 없다는 말로 읽히지 않게)
  const scoped = EV_UNKNOWN.filter((e) => /\.none$|^saju\.(sipsung|career|wealth|fortify)$/.test(e.id));
  assert.ok(scoped.length >= 3);
  for (const e of scoped) assert.match(e.fact, /세 기둥/, e.id);
  // 시각을 아는 사람의 근거에는 이 문구가 없다
  for (const e of EV_KNOWN) assert.doesNotMatch(e.fact, /세 기둥\(시주 제외\)/, e.id);
  // 시주를 몰라 달라질 수 있는 근거(없음 · 개운 · 강약)는 보조 근거(weak)로만 둔다
  for (const e of EV_UNKNOWN.filter((x) => /\.none$|^saju\.fortify$|^saju\.structure\.strength$/.test(x.id))) assert.equal(e.strength, "weak", e.id);
  // 계산하지 않은 판정 이름을 근거 문장이 쓰지 않는다
  for (const e of EV_UNKNOWN.filter((x) => x.source === "saju")) assert.doesNotMatch(`${e.fact} ${e.cue}`, /격국|용신|희신|기신|신살|십이운성/, e.id);
});

test("근거: 시각을 모르는 사람도 7개 장이 쓸 사주 근거가 모두 있다(시주가 없다고 장을 비우지 않는다)", () => {
  const mine = story7Evidence(EV_UNKNOWN);
  for (let no = 1; no <= 6; no++) assert.ok(mine.saju[no].length >= 1, `${no}번 장의 사주 근거`);
  assert.ok(mine.saju[1].includes(HOUR_UNKNOWN_ID), "1번 장이 시각 미상 근거를 소유한다");
  // 연애 · 인간관계 · 직업 · 재물 · 개운의 재료
  for (const id of ["saju.partner", "saju.kin", "saju.career", "saju.wealth", "saju.fortify"]) assert.ok(EV_UNKNOWN.some((e) => e.id === id && !e.uncertain), id);
});

test("지시문: 시각을 모르는 경우의 범위(7개 모두 · 세 기둥 기준 · 시주 풀이 금지 · 신강/신약 금지)와 사주 모습 · 응답의 일치 · 차이 설명이 들어 있다", () => {
  assert.match(STORY7_SYSTEM_PROMPT, /\[출생 시각을 모르는 경우/);
  assert.match(STORY7_SYSTEM_PROMPT, /7개 장을 평소와 똑같이 끝까지 쓴다/);
  assert.match(STORY7_SYSTEM_PROMPT, /세 기둥/);
  assert.match(STORY7_SYSTEM_PROMPT, /자녀 · 말년/);
  assert.match(STORY7_SYSTEM_PROMPT, /신강 · 신약으로 부르지 않고/);
  assert.match(STORY7_SYSTEM_PROMPT, /일치 · 차이의 설명/);
  // 시각을 모르는 사람에게 건네는 사용자 메시지에는 시각 미상 근거가 있고, 아는 사람에게는 없다
  assert.match(buildStory7UserMessage(EV_UNKNOWN, "2026-10-17"), /saju\.hour\.unknown/);
  assert.doesNotMatch(buildStory7UserMessage(EV_KNOWN, "2026-10-17"), /saju\.hour\.unknown/);
});

const mockDraft = (evidence = EV_UNKNOWN, context = UNKNOWN.input.context): Story7DraftV1 => composeMockStory7(buildStory7UserMessage(evidence, "2026-10-17", context));
const errorsFor = (mutate: (d: Story7DraftV1) => void, evidence = EV_UNKNOWN) => {
  const d = structuredClone(mockDraft(evidence));
  mutate(d);
  const r = validateStory7Draft(d, evidence, { hasContext: Boolean(UNKNOWN.input.context) });
  return r.ok ? [] : r.errors;
};
const setFirst = (d: Story7DraftV1, no: number, text: string) => {
  const s = d.sections.find((x) => x.no === no)!;
  if (s.parts) s.parts[0].paragraphs[0] = text;
  else s.paragraphs![0] = text;
};
const PAD = "이 문단은 장면을 일상의 말로 풀어 쓰는 자리라서 길이를 충분히 채워 둡니다 그래서 길이 검사는 걸리지 않아요";

test("모의 초안: 시각을 모르는 사람의 모의 초안은 형식 검사를 통과한다(7개 장 그대로)", () => {
  const r = validateStory7Draft(mockDraft(), EV_UNKNOWN, { hasContext: Boolean(UNKNOWN.input.context) });
  assert.equal(r.ok, true, r.ok ? "" : r.errors.join("\n"));
  assert.equal(mockDraft().sections.length, 7);
});

test("검사: 시각을 모를 때 오행 · 십성의 없음 · 적음은 세 기둥 기준이라는 범위가 있어야 한다", () => {
  const bad = errorsFor((d) => setFirst(d, 4, `토 기운이 하나도 없어서 사람 사이에서 쉽게 흔들려요. ${PAD}`));
  assert.ok(bad.some((e) => /세 기둥 기준/.test(e)), bad.join("\n"));
  const bad2 = errorsFor((d) => setFirst(d, 4, `이 사주에는 재성이 없어서 돈 이야기가 어려워요. ${PAD}`));
  assert.ok(bad2.some((e) => /세 기둥 기준/.test(e)), bad2.join("\n"));
  // 같은 문장이나 바로 앞 문장에 범위를 밝히면 통과
  const scopeSame = errorsFor((d) => setFirst(d, 4, `세 기둥으로 보면 토 기운은 보이지 않아요(시주에 있을 수 있어요). ${PAD}`));
  assert.ok(!scopeSame.some((e) => /세 기둥 기준/.test(e)), scopeSame.join("\n"));
  // 지시문이 쓰라고 알려 준 "(시주에 있을 수 있어요)" 자체를 시주 풀이로 막지 않는다(실제 AI가 지시문 그대로 쓴 문구를 검사가 막았던 모순) — 시주에 놓인 것을 읽는 말은 그대로 막는다
  assert.ok(!scopeSame.some((e) => /시주로 읽는 풀이/.test(e)), scopeSame.join("\n"));
  const readHour = errorsFor((d) => setFirst(d, 4, `시주에 놓인 식신이 표현력을 받쳐 줘요. ${PAD}`));
  assert.ok(readHour.some((e) => /시주로 읽는 풀이/.test(e)), readHour.join("\n"));
  // 시주에 특정 기운이 "있다"고 확정하는 문장은 계속 막고, 가능성만 말하는 범위 안내("있을 수 있어요 · 있을 수도 있어요")만 허용한다
  for (const claim of ["시주에 토 기운이 있어서 중심이 잡혀요.", "시주에 있을 거예요.", "시주에 분명 식신이 있을 수밖에 없어요.", "시주에는 인성이 있어요."]) {
    const e = errorsFor((d) => setFirst(d, 4, `${claim} ${PAD}`));
    assert.ok(e.some((m) => /시주로 읽는 풀이/.test(m)), `${claim}: ${e.join("\n")}`);
  }
  for (const hedge of ["시주에 있을 수 있어요.", "시주에도 있을 수 있어요.", "시주에 있을 수도 있어요.", "시주에 있을지도 몰라요."]) {
    const e = errorsFor((d) => setFirst(d, 4, `세 기둥으로 보면 토 기운은 보이지 않아요(${hedge.replace(/\.$/, "")}). ${PAD}`));
    assert.ok(!e.some((m) => /시주로 읽는 풀이/.test(m)), `${hedge}: ${e.join("\n")}`);
  }
  const scopePrev = errorsFor((d) => setFirst(d, 4, `출생 시각을 몰라 시주를 뺀 세 기둥으로 읽었어요. 토 기운이 하나도 없어서 중심을 잡는 힘이 적게 읽혀요. ${PAD}`));
  assert.ok(!scopePrev.some((e) => /세 기둥 기준/.test(e)), scopePrev.join("\n"));
  // "그럴 수는 없어요" 같은 일상어는 오행 없음으로 세지 않는다
  const plain = errorsFor((d) => setFirst(d, 4, `혼자 모든 걸 해결할 수는 없어요. 도움을 요청하는 연습이 필요해요. ${PAD}`));
  assert.ok(!plain.some((e) => /세 기둥 기준/.test(e)), plain.join("\n"));
});

test("검사: 시각을 모르면 시주 풀이(자녀 · 말년) · 신강/신약 판정은 쓰지 않는다", () => {
  const child = errorsFor((d) => setFirst(d, 3, `자녀가 학업에서 두각을 나타낼 수 있어요. ${PAD}`));
  assert.ok(child.some((e) => /시주로 읽는 풀이/.test(e)), child.join("\n"));
  const late = errorsFor((d) => setFirst(d, 2, `말년에는 안정되는 구조로 읽혀요. ${PAD}`));
  assert.ok(late.some((e) => /시주로 읽는 풀이/.test(e)), late.join("\n"));
  const strength = errorsFor((d) => setFirst(d, 2, `원국이 신약해서 도움을 받아야 힘이 나요. ${PAD}`));
  assert.ok(strength.some((e) => /신약/.test(e) && /출생 시각을 몰라/.test(e)), strength.join("\n"));
  // "시주를 몰라" 같은 범위 밝히기는 시주 풀이로 세지 않는다
  const scope = errorsFor((d) => setFirst(d, 2, `시주를 몰라 세 기둥으로만 읽었어요. 월령을 얻었는지를 먼저 봐요. ${PAD}`));
  assert.ok(!scope.some((e) => /시주로 읽는 풀이/.test(e)), scope.join("\n"));
  // 시각을 아는 사람에게는 이 검사를 적용하지 않는다(hourUnknownErrors는 근거에 시각 미상이 있을 때만 호출된다)
  const known = structuredClone(composeMockStory7(buildStory7UserMessage(EV_KNOWN, "2026-10-17", KNOWN.input.context)));
  const k = known.sections.find((s) => s.no === 2)!;
  k.paragraphs![0] = `말년에는 안정되는 구조로 읽히기 쉬워요. ${PAD}`;
  const kr = validateStory7Draft(known, EV_KNOWN, { hasContext: Boolean(KNOWN.input.context) });
  const kErrors = kr.ok ? [] : kr.errors;
  assert.ok(!kErrors.some((e) => /출생 시각을 몰라/.test(e)), kErrors.join("\n"));
});

test("검사: 가족에게 있었던 일을 지난 사실처럼 쓰지 않는다 — 전통 해석 표지가 있어도(시주 유무와 상관없이)", () => {
  const pieces = (text: string) => [{ where: "t", text }];
  assert.equal(familyPastErrors(pieces("어머니의 도움을 받지 못했다고 봐요.")).length, 1);
  assert.equal(familyPastErrors(pieces("전통에서는 어머니에게 도움을 받지 못한 구조로 읽어요.")).length, 1);
  assert.equal(familyPastErrors(pieces("부모님과 떨어져 지냈을 가능성이 있어요.")).length, 1);
  // 조건 · 가능성으로 쓴 경향은 통과한다
  assert.equal(familyPastErrors(pieces("전통에서는 인성이 약해 윗사람의 도움이 늦게 닿는 구조로 읽어요.")).length, 0);
  assert.equal(familyPastErrors(pieces("어머니 같은 윗사람의 보살핌이 필요한 때가 올 수 있어요.")).length, 0);
  assert.equal(hourUnknownErrors(pieces("세 기둥으로 보면 화 기운이 적어요.")).length, 0);
});

test("조립: 시각을 모르면 1번 장 아래에 코드가 세 기둥 안내를 붙이고, 아는 사람에게는 붙이지 않는다", () => {
  const r = validateStory7Draft(mockDraft(), EV_UNKNOWN, { hasContext: Boolean(UNKNOWN.input.context) });
  assert.equal(r.ok, true);
  const mk = (evidence: typeof EV_UNKNOWN, input: typeof UNKNOWN.input, draft: Story7DraftV1) =>
    assembleStory7({ draft, evidence, input, reference: { ...REF, iso: "2026-10-17" }, promptVersion: "x", ruleVersions: [] });
  const unknown = mk(EV_UNKNOWN, UNKNOWN.input, mockDraft());
  const first = unknown.blocks.find((b) => b.id === "tendency")!;
  assert.ok(first.caveat?.includes(HOUR_UNKNOWN_CAVEAT), "시각 미상 안내");
  assert.equal(unknown.blocks.filter((b) => b.caveat?.includes(HOUR_UNKNOWN_CAVEAT)).length, 1, "1번 장에만 한 번");
  const known = mk(EV_KNOWN, KNOWN.input, mockDraft(EV_KNOWN, KNOWN.input.context));
  assert.ok(!known.blocks.some((b) => b.caveat?.includes(HOUR_UNKNOWN_CAVEAT)));
});

// ───── 만세력 · 명리 대응의 독립 대조 ─────

/** 십성을 오행의 생극 + 음양에서 직접 정한다(엔진 · 라이브러리 표를 보지 않고) */
const STEMS = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"] as const;
const ELEMENT_OF: Record<string, "목" | "화" | "토" | "금" | "수"> = { 갑: "목", 을: "목", 병: "화", 정: "화", 무: "토", 기: "토", 경: "금", 신: "금", 임: "수", 계: "수" };
const YANG = new Set(["갑", "병", "무", "경", "임"]);
const NEXT = { 목: "화", 화: "토", 토: "금", 금: "수", 수: "목" } as const; // 내가 생하는 오행
const CONTROL = { 목: "토", 토: "수", 수: "화", 화: "금", 금: "목" } as const; // 내가 극하는 오행
function tenGodFromFirstPrinciples(dm: string, other: string): string {
  const same = YANG.has(dm) === YANG.has(other);
  const a = ELEMENT_OF[dm];
  const b = ELEMENT_OF[other];
  if (a === b) return same ? "비견" : "겁재";
  if (NEXT[a] === b) return same ? "식신" : "상관";
  if (CONTROL[a] === b) return same ? "편재" : "정재";
  if (CONTROL[b] === a) return same ? "편관" : "정관";
  return same ? "편인" : "정인"; // 남은 경우는 b가 a를 생한다
}

test("독립 대조: 천간 십성 100가지가 오행 생극 + 음양에서 직접 정한 값과 같다(운영자 전달 사례의 일간 辛 기준 4가지 포함)", () => {
  for (const dm of STEMS) for (const other of STEMS) assert.equal(getTenGod(dm, other), tenGodFromFirstPrinciples(dm, other), `${dm} 기준 ${other}`);
  // 신금 일간 기준: 병화 정관 · 을목 편재 · 계수 식신 · 경금 겁재(운영자 전달 내용을 코드가 아닌 생극 규칙으로 확인)
  assert.equal(tenGodFromFirstPrinciples("신", "병"), "정관");
  assert.equal(tenGodFromFirstPrinciples("신", "을"), "편재");
  assert.equal(tenGodFromFirstPrinciples("신", "계"), "식신");
  assert.equal(tenGodFromFirstPrinciples("신", "경"), "겁재");
});

test("독립 대조: 지지 십성은 정기(본기) 천간의 십성과 같다 — 申의 정기 庚 · 卯의 乙 · 子의 癸를 신금 일간 기준으로", () => {
  const MAIN: Record<string, string> = { 자: "계", 축: "기", 인: "갑", 묘: "을", 진: "무", 사: "병", 오: "정", 미: "기", 신: "경", 유: "신", 술: "무", 해: "임" };
  for (const dm of STEMS) for (const [branch, stem] of Object.entries(MAIN)) {
    assert.equal(getBranchTenGod(dm, branch as never), tenGodFromFirstPrinciples(dm, stem), `${dm} 기준 ${branch}`);
  }
  assert.equal(getBranchTenGod("신", "신" as never), "겁재");
  assert.equal(getBranchTenGod("신", "묘" as never), "편재");
  assert.equal(getBranchTenGod("신", "자" as never), "식신");
});

test("독립 대조: 월주 천간은 오호둔 규칙(년간 → 인월 천간)으로 직접 구한 값과 같고, 시각이 없어도 연 · 월 · 일주는 시각이 있을 때와 같다", () => {
  const STEM_LIST = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
  const BRANCHES = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];
  // 갑 · 기년 → 병인, 을 · 경년 → 무인, 병 · 신년 → 경인, 정 · 임년 → 임인, 무 · 계년 → 갑인(오호둔)
  const FIRST_MONTH_STEM: Record<string, number> = { 갑: 2, 기: 2, 을: 4, 경: 4, 병: 6, 신: 6, 정: 8, 임: 8, 무: 0, 계: 0 };
  // 12달 × 여러 해를 확인한다 — 절입일은 매달 4~9일 무렵이라 매달 20일이면 그달의 절기 이후다(경계를 피한다)
  for (const year of [1985, 1996, 2003, 2011]) {
    for (let month = 1; month <= 12; month++) {
      const withTime = calculateSaju({ year, month, day: 20, calendar: "solar", isLeapMonth: false, birthTime: "12:00", gender: "male" });
      const noTime = calculateSaju({ year, month, day: 20, calendar: "solar", isLeapMonth: false, birthTime: null, gender: "male" });
      assert.equal(withTime.status, "ok");
      assert.equal(noTime.status, "ok");
      const a = withTime as SajuOk;
      const b = noTime as SajuOk;
      const yearP = a.pillars.find((p) => p.key === "year")!;
      const monthP = a.pillars.find((p) => p.key === "month")!;
      // 월지: 양력 20일은 그달의 절기 이후이므로 1월 축 · 2월 인 · 3월 묘 … 12월 자(소한 · 입춘 · 경칩 … 대설 이후)
      const branch = BRANCHES[month % 12];
      assert.equal(monthP.branch, branch, `${year}-${month} 월지`);
      const offset = (BRANCHES.indexOf(branch) - 2 + 12) % 12; // 인월이 첫째 달
      // 1월(축월)은 전 해의 년간 기준 12번째 달이므로 년간이 한 해 앞선 기준이다 — 입춘 전에 속하는 1월은 전 해의 년주를 쓴다
      const yearStem = yearP.stem;
      const expected = STEM_LIST[(FIRST_MONTH_STEM[yearStem] + offset) % 10];
      assert.equal(monthP.stem, expected, `${year}-${month} 월간(오호둔)`);
      for (const key of ["year", "month", "day"] as const) {
        const x = a.pillars.find((p) => p.key === key)!;
        const y = b.pillars.find((p) => p.key === key)!;
        assert.equal(`${y.stem}${y.branch}`, `${x.stem}${x.branch}`, `${year}-${month} ${key}주는 시각 유무와 같다`);
      }
      assert.equal(b.hourPillarOmitted, true);
      assert.equal(b.pillars.some((p) => p.key === "hour"), false);
    }
  }
});

test("같은 출생정보로 시각이 있을 때와 모를 때: 오행 개수는 8 → 6글자이고 연 · 월 · 일주의 십성은 같으며 시각을 모를 때만 시각 미상 근거가 생긴다", () => {
  const base = { year: 1990, month: 5, day: 17, calendar: "solar" as const, isLeapMonth: false, gender: "female" as const };
  const withTime = calculateSaju({ ...base, birthTime: "10:30" }) as SajuOk;
  const noTime = calculateSaju({ ...base, birthTime: null }) as SajuOk;
  assert.equal(Object.values(withTime.elementCounts).reduce((a, b) => a + b, 0), 8);
  assert.equal(Object.values(noTime.elementCounts).reduce((a, b) => a + b, 0), 6);
  for (const key of ["year", "month", "day"] as const) {
    const a = withTime.pillars.find((p) => p.key === key)!;
    const b = noTime.pillars.find((p) => p.key === key)!;
    assert.deepEqual(b.tenGod, a.tenGod, key);
  }
  // 세 기둥 개수는 시각이 있을 때의 개수에서 시주 두 글자를 뺀 값이다
  const hour = withTime.pillars.find((p) => p.key === "hour")!;
  const minus = { ...withTime.elementCounts };
  minus[hour.stemElement] -= 1;
  minus[hour.branchElement] -= 1;
  assert.deepEqual(noTime.elementCounts, minus);
  assert.equal(hourUnknownEvidence(withTime).length, 0);
  assert.equal(hourUnknownEvidence(noTime).length, 1);
  // 개운 보완 후보는 세 기둥 개수 기준 — 개수가 달라지면 후보가 달라질 수 있다(같은 계산식 · 다른 입력)
  assert.ok(ELEMENT_FORTUNE[fortifyOf(withTime).primary.element]);
  assert.ok(ELEMENT_FORTUNE[fortifyOf(noTime).primary.element]);
});
