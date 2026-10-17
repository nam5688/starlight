// 7개 대주제 — 구조 · 근거 배분 · 지시문 · 순수 계산(서비스에 닿지 않음)을 확인한다. 7개 구조가 좋다는 것을 확인하는 시험이 아니다(글에서 실제로 반복이 줄었는지는 docs/story-7-sections-review.md의 비교가 따로 본다).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CONCERN_RECORDS } from "../../config/product.ts";
import { buildPersonas } from "../ai/compare-personas.ts";
import { buildEvidence } from "../ai/generator.ts";
import { assignPersonal, checkStory7Format, measureLayout, owners7, piecesOfStory7, piecesOfStoryV1, sajuCoverage, slotsOf7, slotsOfAreas, textRepetition, type Story7Draft } from "./story7-measure.ts";
import { STORY7_SYSTEM_PROMPT, buildStory7UserMessage } from "./story7-prompt.ts";
import { STORY7_SCENE_OWNER, STORY7_SECTIONS } from "./story7-plan.ts";
import { personalEvidenceFor } from "./story-prompt.ts";
import { validateStoryDraft } from "./story-validate.ts";
import type { StoryDraftV1 } from "./types.ts";

const REF = { year: 2026, month: 10, iso: "2026-10-17" };
const PERSONAS = buildPersonas(10);
const EVIDENCE = PERSONAS.map((p) => buildEvidence(p.input, REF));
const proxy = (file: string): unknown => JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "docs", "samples", "story7-proxy", file), "utf8"));

test("7개 대주제: 번호 1~7 · 운영자가 정한 제목 그대로 · 근거를 소유하는 장 5 + 앞 장을 엮는 장 2", () => {
  assert.deepEqual(STORY7_SECTIONS.map((s) => s.no), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(STORY7_SECTIONS.map((s) => s.title), ["나는 어떤 사람일까?", "나의 강점과 약점", "연애와 애착", "인간관계와 인연", "일과 재물", "앞으로의 운과 변화", "미유의 종합 조언"]);
  assert.equal(new Set(STORY7_SECTIONS.map((s) => s.id)).size, 7);
  assert.deepEqual(STORY7_SECTIONS.filter((s) => s.kind === "synthesis").map((s) => s.no), [2, 7]);
  for (const s of STORY7_SECTIONS) {
    assert.ok(s.question.length >= 20 && s.repeatGuard && s.includes.length > 0, `${s.no}`);
    // 엮는 장만 "새로 보태야 할 것"을 갖는다 — 자기 근거가 없는 장이 앞 장을 다시 쓰지 않게 하는 조건이다
    assert.equal(Boolean(s.mustAdd), s.kind === "synthesis", `${s.no}: mustAdd`);
    assert.ok(s.maxParagraphs >= 1 && s.maxParagraphs <= 4, `${s.no}: 문단 상한`);
  }
  assert.equal(new Set(STORY7_SECTIONS.map((s) => s.question)).size, 7, "장마다 다른 질문");
  // 일과 재물은 한 대주제 안의 소제목으로 구분한다
  assert.deepEqual(STORY7_SECTIONS[4].parts, ["일", "재물"]);
  assert.ok(STORY7_SECTIONS.filter((s) => s.parts).length === 1);
});

test("28문항 장면은 s01~s28 28개가 한 장에만 배분된다", () => {
  const all = STORY7_SECTIONS.flatMap((s) => s.scenes);
  assert.deepEqual([...all].sort(), Array.from({ length: 28 }, (_, i) => `s${String(i + 1).padStart(2, "0")}`));
  assert.equal(Object.keys(STORY7_SCENE_OWNER).length, 28);
});

test("엮는 장(2 · 7)은 근거를 소유하지 않는다", () => {
  for (const s of STORY7_SECTIONS.filter((x) => x.kind === "synthesis")) {
    assert.deepEqual(s.sajuOwns, [], `${s.no}`);
    assert.equal(s.personalTopics.length, 0, `${s.no}`);
    assert.equal(s.personalMin, 0, `${s.no}`);
  }
});

test("같은 배정 알고리즘이 지금 story-v1의 personalEvidenceFor와 같은 결과를 낸다(가상 인물 10명)", () => {
  PERSONAS.forEach((p, i) => {
    const real = personalEvidenceFor(EVIDENCE[i]);
    const mine = assignPersonal(EVIDENCE[i], slotsOfAreas());
    for (const key of Object.keys(real)) {
      const expected = [...mine.owned[key], ...mine.borrowed[key], ...(mine.mbti.includes(key) ? ["self.mbti"] : [])];
      assert.deepEqual(expected, real[key], `${p.id} ${key}`);
    }
  });
});

test("7개 대주제 배정: 소유한 근거는 한 장에만, 빌린 근거는 이미 다른 장이 소유한 것, 최소 요구는 소유 + 빌림으로만 센다", () => {
  PERSONAS.forEach((p, i) => {
    const a = assignPersonal(EVIDENCE[i], slotsOf7());
    const ownedAll = Object.values(a.owned).flat();
    assert.equal(new Set(ownedAll).size, ownedAll.length, `${p.id}: 같은 근거를 두 장이 소유했다`);
    for (const [key, ids] of Object.entries(a.borrowed)) for (const id of ids) assert.ok(ownedAll.includes(id) && !a.owned[key].includes(id), `${p.id} ${key}: 빌림 ${id}`);
    const m = measureLayout(EVIDENCE[i], slotsOf7());
    assert.equal(m.need, 5);
    assert.equal(m.borrowTotal, Object.values(a.borrowed).flat().length);
  });
});

test("사주 근거 소유자: 시기(6)와 구조(1)는 모든 인물에게 있고, 인간관계(4)는 신살(귀인)을 소유한다고 적지 않았다 · 같은 사주 근거를 두 장이 소유하지 않는다", () => {
  const rows = EVIDENCE.map((ev) => sajuCoverage(ev));
  for (const r of rows) {
    assert.ok(r.find((x) => x.no === 1)!.count > 0);
    assert.ok(r.find((x) => x.no === 6)!.count > 0);
  }
  const people = STORY7_SECTIONS.find((s) => s.no === 4)!;
  assert.ok(people.sajuOwns.every((re) => /tengod|relation/.test(re.source)));
  assert.match(people.moreSaju ?? "", /귀인/);
  assert.match(people.moreSaju ?? "", /가족/);
  for (const ev of EVIDENCE) for (const e of ev.filter((x) => x.source === "saju" && !x.uncertain)) assert.ok(owners7(e).length <= 1, `${e.id}: 소유자 ${owners7(e)}`);
  // 일지가 낀 합 · 충은 3(연애와 애착)이, 일지를 뺀 합 · 충은 4(인간관계)가 소유한다(엔진이 relationship 주제를 붙이는 기준과 같다)
  const day = EVIDENCE.flat().find((e) => /^saju\.relation\.(month-day|year-day)\./.test(e.id))!;
  const other = EVIDENCE.flat().find((e) => /^saju\.relation\.(year-hour|month-hour)\./.test(e.id))!;
  assert.deepEqual(owners7(day), [3]);
  assert.deepEqual(owners7(other), [4]);
});

test("7번 장의 \"현재 고민을 반영\"은 지금 화면에 고민 입력 경로가 없다 — 고민 기록소가 숨겨져 있다(켜면 문서의 이 판단을 다시 확인한다)", () => {
  assert.equal(CONCERN_RECORDS.visible, false);
  assert.match(STORY7_SECTIONS[6].gap22 ?? "", /CONCERN_RECORDS\.visible = false/);
});

test("제품 지시문: 7개 대주제 이름이 모두 있고, 없는 칸(areas · work-money · 영역 이름)을 가리키지 않으며, 입력은 장마다 배정된 근거를 담는다", () => {
  for (const s of STORY7_SECTIONS) assert.ok(STORY7_SYSTEM_PROMPT.includes(s.title), s.title);
  for (const word of ["areas[]", "\"core\"", "\"relation\"", "work-money", "personalEvidence는 코드가 영역마다"]) assert.ok(!STORY7_SYSTEM_PROMPT.includes(word), `지시문에 ${word}`);
  assert.match(STORY7_SYSTEM_PROMPT, /7개 대주제가 항상 모두 나온다/);
  assert.match(STORY7_SYSTEM_PROMPT, /길게 채우는 것이 목표가 아니다/);
  assert.match(STORY7_SYSTEM_PROMPT, /알려 준 고민\(context\)이 있으면/);
  const msg = buildStory7UserMessage(EVIDENCE[0], REF.iso);
  const payload = JSON.parse(msg.slice(msg.indexOf("\n") + 1)) as { sections: { no: number; sajuEvidence: string[]; personalEvidence: string[]; maxParagraphs: number }[]; evidence: { id: string }[]; context?: unknown };
  assert.equal(payload.sections.length, 7);
  assert.equal(payload.context, undefined, "고민은 넣지 않는다");
  const ids = new Set(payload.evidence.map((e) => e.id));
  for (const s of payload.sections) for (const id of [...s.sajuEvidence, ...s.personalEvidence]) assert.ok(ids.has(id), `${s.no}: ${id}`);
  // 입력한 MBTI는 1 · 3 · 5번 장에만 배정된다(지금 story-v1의 핵심 · 가까운 관계 · 일과 재물과 같은 몫)
  assert.deepEqual(payload.sections.filter((s) => s.personalEvidence.includes("self.mbti")).map((s) => s.no), [1, 3, 5]);
});

test("글 수준 지표: 같은 말을 되풀이한 글이 더 높게 나오고, 소제목이 있는 장의 글 조각을 읽는다", () => {
  const para = (t: string) => t;
  const repeated: Story7Draft = {
    headline: "한 문장 결론이에요",
    sections: [
      { no: 1, headline: "첫 장의 결론이에요", paragraphs: [para("확인하는 시간이 길어서 기다리는 쪽에게는 거리처럼 느껴져요. 확인하는 시간이 길어서 기다리는 쪽에게는 거리처럼 느껴져요.")], evidence: [] },
      { no: 5, headline: "일과 재물의 결론이에요", parts: [{ title: "일", paragraphs: [para("확인하는 시간이 길어서 기다리는 쪽에게는 거리처럼 느껴져요. 점검하는 습관이 생활 전체에 퍼져 있어요 계획 일정 약속 정리 기준 습관.")] }, { title: "재물", paragraphs: [para("돈 앞에서는 한도를 먼저 정해요")] }], evidence: [] },
    ],
    actions: [{ title: "작은 행동 하나", detail: "오늘 저녁에 한 줄로 적어 두고 다음 날 다시 읽어 보는 행동이에요", evidence: [] }],
  };
  const distinct: Story7Draft = {
    headline: "한 문장 결론이에요",
    sections: [
      { no: 1, headline: "첫 장의 결론이에요", paragraphs: ["아침마다 산책을 먼저 나가면 하루가 가벼워져요. 집에서 조용히 책을 읽는 시간이 마음을 달래 줘요 음악 요리 정원 사진."], evidence: [] },
      { no: 5, headline: "일과 재물의 결론이에요", parts: [{ title: "일", paragraphs: ["회의에서는 질문을 먼저 던지는 쪽이에요. 낯선 도시를 여행할 때는 지도를 미리 훑어보는 편이에요 열차 숙소 식당 박물관."] }, { title: "재물", paragraphs: ["월말에는 통장을 열어 보며 쓴 만큼을 되짚어 봐요"] }], evidence: [] },
    ],
    actions: [{ title: "작은 행동 하나", detail: "금요일 저녁에는 친구에게 안부를 묻는 전화를 걸어 보세요 짧게 해도 괜찮아요", evidence: [] }],
  };
  const a = textRepetition(piecesOfStory7(repeated));
  const b = textRepetition(piecesOfStory7(distinct));
  assert.ok(a.repeatedPhrases > b.repeatedPhrases, `${a.repeatedPhrases} vs ${b.repeatedPhrases}`);
  assert.equal(a.blocks, 4); // head · s1 · s5 · s7(actions)
  assert.ok(piecesOfStory7(repeated).some((p) => p.block === "s5" && p.where.startsWith("s5.part1")));
  // 소제목이 틀렸거나 재물에 돈 이야기가 없으면 형식 점검이 알려 준다
  assert.ok(checkStory7Format(distinct, EVIDENCE[0]).some((e) => /대주제가 2개/.test(e)));
});

test("story-v1 글 조각은 고민(focus)을 비교에서 뺀다 — 7개 대주제 비교 입력에는 고민이 없다", () => {
  const d = { headline: "중심 연결이에요", cards: { strength: { keyword: "강점", note: "강점 설명이에요" }, caution: { keyword: "부담", note: "부담 설명이에요" }, flow: { keyword: "시기" } }, areas: [{ id: "core", headline: "핵심 결론", paragraphs: ["첫 문단이에요"], evidence: [] }], flow: { headline: "시기 결론", paragraphs: ["시기 문단이에요"], years: [], scenarios: [], evidence: [] }, focus: [{ text: "알려 주신 고민이에요", evidence: [] }], actions: [] } as unknown as StoryDraftV1;
  const pieces = piecesOfStoryV1(d);
  assert.ok(!pieces.some((p) => p.where.startsWith("focus")));
  assert.deepEqual([...new Set(pieces.map((p) => p.block))], ["head", "core", "flow"]);
  assert.equal(validateStoryDraft(d, EVIDENCE[0], { hasContext: false }).ok, false); // 간이 입력은 제품 검사를 통과하지 못한다(검사가 살아 있다는 확인)
});

test("저장된 비교 글 4편: 문서(story-7-sections-review.md 3장)에 적은 수치가 지금 코드로 다시 세어도 같다 — 지표 코드가 바뀌면 문서를 고쳐야 한다", () => {
  const rows = (["P01", "P03"] as const).map((id) => {
    const ev = EVIDENCE[PERSONAS.findIndex((p) => p.id === id)];
    const v1 = proxy(`${id}-v1.json`) as StoryDraftV1;
    const s7 = proxy(`${id}-s7.json`) as Story7Draft;
    const cites = (blocks: [string, string[]][]) => {
      const m = new Map<string, Set<string>>();
      for (const [b, ids] of blocks) for (const i of ids) (m.get(i) ?? m.set(i, new Set()).get(i)!).add(b);
      return { distinct: m.size, multi: [...m.values()].filter((x) => x.size >= 2).length };
    };
    return {
      id, ev, v1, s7,
      mv1: textRepetition(piecesOfStoryV1(v1)),
      m7: textRepetition(piecesOfStory7(s7)),
      c1: cites([...v1.areas.map((a) => [a.id, a.evidence] as [string, string[]]), ["flow", v1.flow.evidence]]),
      c7: cites(s7.sections.map((sec) => [`s${sec.no}`, sec.evidence])),
    };
  });
  const [p01, p03] = rows;
  assert.deepEqual([p01.mv1.repeatedPhrases, p01.m7.repeatedPhrases, p03.mv1.repeatedPhrases, p03.m7.repeatedPhrases], [1, 0, 4, 3]);
  assert.deepEqual([p01.mv1.pairOverlapMean, p01.m7.pairOverlapMean, p03.mv1.pairOverlapMean, p03.m7.pairOverlapMean].map((x) => Number(x.toFixed(2))), [0.2, 0.16, 0.2, 0.18]);
  assert.deepEqual([p01.mv1.chars, p01.m7.chars, p03.mv1.chars, p03.m7.chars], [3763, 4559, 4052, 4453]);
  assert.deepEqual([p01.c1, p01.c7, p03.c1, p03.c7], [{ distinct: 32, multi: 2 }, { distinct: 38, multi: 4 }, { distinct: 17, multi: 5 }, { distinct: 22, multi: 4 }]);
  // 형식: 지금 구조의 P01은 제품 검사 통과, P03은 용어 두 건 불통과 · 7개 대주제 두 편은 최소 점검 통과
  assert.equal(validateStoryDraft(p01.v1, p01.ev, { hasContext: false }).ok, true);
  const v03 = validateStoryDraft(p03.v1, p03.ev, { hasContext: false });
  assert.ok(!v03.ok && v03.errors.length === 2);
  for (const r of rows) assert.deepEqual(checkStory7Format(r.s7, r.ev), [], r.id);
  // 2번 · 7번(엮는 장)은 응답 근거를 인용하지 않았고, 7번에는 알려 준 고민이 없어 고민을 반영한 조언이 아니다
  for (const r of rows) for (const no of [2, 7]) assert.deepEqual(r.s7.sections.find((s) => s.no === no)!.evidence, [], `${r.id} ${no}`);
});

test("7개 대주제 모듈(story7-*)은 순수 계산이다 — 서비스 · 외부 연결 · 서버 코드를 불러오지 않는다(판매 스위치 · DB · 결제에 닿지 않는다)", () => {
  const dir = import.meta.dirname;
  const bad: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.startsWith("story7") || name.endsWith(".test.ts")) continue;
    const src = readFileSync(join(dir, name), "utf8");
    for (const m of src.matchAll(/from "([^"]+)"/g)) if (/services\/|integrations\/|server\/|@\//.test(m[1])) bad.push(`${name}: ${m[1]}`);
  }
  assert.deepEqual(bad, []);
});
