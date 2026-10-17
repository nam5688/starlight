// 12개 고정 섹션 초안 — 구조 · 근거 배분 · 비교 시험용 지시문 · "아무 곳에도 연결하지 않았다"를 확인한다. 12개 구조가 좋다는 것을 확인하는 시험이 아니다(글에서 실제로 반복이 줄었는지는 docs/story-12-sections-review.md의 비교 시험이 따로 본다).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildPersonas } from "../ai/compare-personas.ts";
import { buildEvidence } from "../ai/generator.ts";
import { assignPersonal, measureLayout, owners12, piecesOfStory12, piecesOfStoryV1, sajuCoverage, slotsOf12, slotsOfAreas, textRepetition, type Story12Draft } from "./story12-measure.ts";
import { STORY12_SYSTEM_PROMPT, buildStory12UserMessage } from "./story12-prompt.ts";
import { STORY12_SCENE_OWNER, STORY12_SECTIONS } from "./story12-plan.ts";
import { personalEvidenceFor } from "./story-prompt.ts";
import type { StoryDraftV1 } from "./types.ts";

const REF = { year: 2026, month: 10, iso: "2026-10-17" };
const PERSONAS = buildPersonas(10);
const EVIDENCE = PERSONAS.map((p) => buildEvidence(p.input, REF));

test("12개 장: 번호 1~12 · 운영자 표의 제목 그대로 · 근거를 소유하는 장 8 + 앞 장을 엮는 장 4", () => {
  assert.deepEqual(STORY12_SECTIONS.map((s) => s.no), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(STORY12_SECTIONS.map((s) => s.title), [
    "나의 핵심 성향", "나의 사주 구조", "타고난 기질과 성격", "겉으로 보이는 나, 실제의 나", "나의 강점과 약점", "연애에서의 나",
    "애착과 갈등·회복", "인간관계와 귀인", "일·적성·진로", "재물과 돈의 흐름", "시기와 변화의 흐름", "나를 위한 종합 조언",
  ]);
  assert.equal(new Set(STORY12_SECTIONS.map((s) => s.id)).size, 12);
  assert.deepEqual(STORY12_SECTIONS.filter((s) => s.kind === "synthesis").map((s) => s.no), [1, 4, 5, 12]);
  for (const s of STORY12_SECTIONS) {
    assert.ok(s.question.length >= 20 && s.must && s.repeatGuard, `${s.no}: 질문 · 내용 · 반복 방지가 비었다`);
    // 엮는 장만 "새로 보태야 할 것"을 갖는다 — 자기 근거가 없는 장이 앞 장을 다시 쓰지 않게 하는 조건이다
    assert.equal(Boolean(s.mustAdd), s.kind === "synthesis", `${s.no}: mustAdd`);
  }
  assert.equal(new Set(STORY12_SECTIONS.map((s) => s.question)).size, 12, "장마다 다른 질문");
});

test("28문항 장면은 s01~s28 28개가 한 장에만 배분된다", () => {
  const all = STORY12_SECTIONS.flatMap((s) => s.scenes);
  assert.deepEqual([...all].sort(), Array.from({ length: 28 }, (_, i) => `s${String(i + 1).padStart(2, "0")}`));
  assert.equal(Object.keys(STORY12_SCENE_OWNER).length, 28);
});

test("엮는 장은 근거를 소유하지 않고, 모든 장이 '이 장만의 질문'이 서로 다른 개인 근거 규칙을 가진다", () => {
  for (const s of STORY12_SECTIONS.filter((x) => x.kind === "synthesis")) {
    assert.deepEqual(s.sajuOwns, [], `${s.no}`);
    assert.equal(s.personalTopics.length, 0, `${s.no}`);
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

test("12개 장 배정: 소유한 근거는 한 장에만, 빌린 근거는 이미 다른 장이 소유한 것, 최소 요구는 소유 + 빌림으로만 센다", () => {
  PERSONAS.forEach((p, i) => {
    const a = assignPersonal(EVIDENCE[i], slotsOf12());
    const ownedAll = Object.values(a.owned).flat();
    assert.equal(new Set(ownedAll).size, ownedAll.length, `${p.id}: 같은 근거를 두 장이 소유했다`);
    for (const [key, ids] of Object.entries(a.borrowed)) for (const id of ids) assert.ok(ownedAll.includes(id) && !a.owned[key].includes(id), `${p.id} ${key}: 빌림 ${id}`);
    const m = measureLayout(EVIDENCE[i], slotsOf12());
    assert.equal(m.need, 8);
    assert.equal(m.borrowTotal, Object.values(a.borrowed).flat().length);
  });
});

test("겉과 속(04)은 22문항에서 소유 근거가 없어 모든 인물이 빌려야 한다 — 이 구조의 장 하나는 22문항으로 근거를 만들 수 없다는 사실이다", () => {
  PERSONAS.forEach((p, i) => {
    const a = assignPersonal(EVIDENCE[i], slotsOf12());
    assert.equal(a.owned["04"].length, 0, p.id);
  });
});

test("사주 근거를 소유하는 장: 2 · 11은 모든 인물에게 있고, 귀인(8)은 신살을 계산하지 않아 십성만 소유한다", () => {
  const rows = EVIDENCE.map((ev) => sajuCoverage(ev));
  for (const r of rows) {
    assert.ok(r.find((x) => x.no === 2)!.count > 0);
    assert.ok(r.find((x) => x.no === 11)!.count > 0);
  }
  const people = STORY12_SECTIONS.find((s) => s.no === 8)!;
  assert.ok(people.sajuOwns.every((re) => /tengod/.test(re.source)), "귀인(신살) 근거를 소유한다고 적지 않았다");
  assert.match(people.moreSaju ?? "", /신살/);
  // 근거 소유자 판정이 평소 근거에서 동작한다
  const e = EVIDENCE[0].find((x) => x.id === "saju.spouse-palace")!;
  assert.deepEqual(owners12(e), [6]);
});

test("비교 시험용 지시문: 12개 장 이름이 모두 있고, 없는 칸(cards · areas · work-money · 영역 이름)을 가리키지 않으며, 입력은 장마다 배정된 근거를 담는다", () => {
  for (const s of STORY12_SECTIONS) assert.ok(STORY12_SYSTEM_PROMPT.includes(s.title), s.title);
  for (const word of ["cards", "work-money", "areas[]", "\"core\"", "\"relation\""]) assert.ok(!STORY12_SYSTEM_PROMPT.includes(word), `지시문에 ${word}`);
  assert.match(STORY12_SYSTEM_PROMPT, /12개 장이 항상 모두 나온다/);
  assert.match(STORY12_SYSTEM_PROMPT, /길게 채우는 것이 목표가 아니다/);
  const msg = buildStory12UserMessage(EVIDENCE[0], REF.iso);
  const payload = JSON.parse(msg.slice(msg.indexOf("\n") + 1)) as { sections: { no: number; sajuEvidence: string[]; personalEvidence: string[] }[]; evidence: { id: string }[] };
  assert.equal(payload.sections.length, 12);
  const ids = new Set(payload.evidence.map((e) => e.id));
  for (const s of payload.sections) for (const id of [...s.sajuEvidence, ...s.personalEvidence]) assert.ok(ids.has(id), `${s.no}: ${id}`);
  // 입력한 MBTI는 03 · 06 · 09번 장에만 배정된다(이 지시문의 MBTI 규칙과 같게)
  const mbtiAt = payload.sections.filter((s) => s.personalEvidence.includes("self.mbti")).map((s) => s.no);
  assert.deepEqual(mbtiAt, [3, 6, 9]);
});

test("글 수준 지표: 같은 말을 되풀이한 글이 더 높게 나오고, 12개 장 글 조각 모양을 읽는다", () => {
  const repeated: Story12Draft = {
    headline: "한 문장 결론이에요",
    sections: [
      { no: 1, headline: "첫 장의 결론", paragraphs: ["확인하는 시간이 길어서 기다리는 쪽에게는 거리처럼 느껴져요. 확인하는 시간이 길어서 기다리는 쪽에게는 거리처럼 느껴져요."], evidence: [] },
      { no: 2, headline: "둘째 장의 결론", paragraphs: ["확인하는 시간이 길어서 기다리는 쪽에게는 거리처럼 느껴져요. 점검하는 습관이 생활 전체에 퍼져 있어요 계획 일정 약속 정리 기준 습관."], evidence: [] },
    ],
    actions: [{ title: "작은 행동 하나", detail: "오늘 저녁에 한 줄로 적어 두고 다음 날 다시 읽어 보는 행동이에요", evidence: [] }],
  };
  const distinct: Story12Draft = {
    headline: "한 문장 결론이에요",
    sections: [
      { no: 1, headline: "첫 장의 결론", paragraphs: ["아침마다 산책을 먼저 나가면 하루가 가벼워져요. 집에서 조용히 책을 읽는 시간이 마음을 달래 줘요 음악 요리 정원 사진."], evidence: [] },
      { no: 2, headline: "둘째 장의 결론", paragraphs: ["회의에서는 질문을 먼저 던지는 쪽이에요. 낯선 도시를 여행할 때는 지도를 미리 훑어보는 편이에요 열차 숙소 식당 박물관."], evidence: [] },
    ],
    actions: [{ title: "작은 행동 하나", detail: "금요일 저녁에는 친구에게 안부를 묻는 전화를 걸어 보세요 짧게 해도 괜찮아요", evidence: [] }],
  };
  const a = textRepetition(piecesOfStory12(repeated));
  const b = textRepetition(piecesOfStory12(distinct));
  assert.ok(a.repeatedPhrases > b.repeatedPhrases, `${a.repeatedPhrases} vs ${b.repeatedPhrases}`);
  assert.equal(a.blocks, 4); // head · s01 · s02 · s12(actions)
  assert.ok(piecesOfStory12(repeated).some((p) => p.block === "s12" && p.where.startsWith("s12.actions")));
});

test("story-v1 글 조각은 고민(focus)을 비교에서 뺀다 — 12개 장에는 대응하는 칸이 없다", () => {
  const d = { headline: "중심 연결이에요", cards: { strength: { keyword: "강점", note: "강점 설명이에요" }, caution: { keyword: "부담", note: "부담 설명이에요" }, flow: { keyword: "시기" } }, areas: [{ id: "core", headline: "핵심 결론", paragraphs: ["첫 문단이에요"], evidence: [] }], flow: { headline: "시기 결론", paragraphs: ["시기 문단이에요"], years: [], scenarios: [], evidence: [] }, focus: [{ text: "알려 주신 고민이에요", evidence: [] }], actions: [] } as unknown as StoryDraftV1;
  const pieces = piecesOfStoryV1(d);
  assert.ok(!pieces.some((p) => p.where.startsWith("focus")));
  assert.deepEqual([...new Set(pieces.map((p) => p.block))], ["head", "core", "flow"]);
});

test("연결하지 않았다: 화면 · 서버 · 서비스 · 리포트 생성 어디에서도 12개 장 초안을 불러오지 않는다(예외는 story12-* 파일과 측정 스크립트뿐)", () => {
  const root = join(import.meta.dirname, "..", "..", "..");
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name === "pilot-data" || name === "docs") continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && !name.startsWith("story12") && name !== "measure-story12.ts" && /story12-(plan|measure|prompt)/.test(readFileSync(path, "utf8"))) hits.push(path.slice(root.length + 1));
    }
  };
  for (const d of ["app", "components", "server", "lib", "scripts"]) walk(join(root, d));
  assert.deepEqual(hits, [], "12개 장 초안을 불러오는 파일이 있다 — 승인 전에는 연결하지 않는다");
});
