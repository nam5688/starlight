// 실행: npm test — 무료 미리보기: 잠긴 내용은 만들지 않고, 보이는 것은 구매한 리포트에 모두 들어 있다
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { REPORT_BASIS } from "../config/product.ts";
import { calculateSaju } from "../saju/manseryeok-engine.ts";
import { createAiReportGenerator } from "./ai/generator.ts";
import { createMockModel } from "./ai/mock-model.ts";
import { buildDevFreeSummary } from "./build-free-summary.ts";
import { buildReportExtras } from "./extras.ts";
import { buildDevReport } from "./generate-dev-report.ts";
import type { ReportInput } from "./generator.ts";
import { buildFreePreview, maskOneLiner } from "./preview.ts";
import { STARTER_ACTIONS } from "./starter-actions.ts";

const REF = { year: 2026, month: 10 };
const answersOf = (f: (i: number) => number) => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((item, i) => [item.id, f(i)])));
const PATTERNS = [(i: number) => (i % 5) + 1, () => 5, () => 1, (i: number) => ((i * 3) % 5) + 1, (i: number) => (i % 2 ? 4 : 2), (i: number) => (i < 12 ? 5 : 1)];
const A = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" });
const B = calculateSaju({ year: 1992, month: 6, day: 21, calendar: "solar", isLeapMonth: false, birthTime: "15:10", gender: "female" });

function input(pattern: (i: number) => number, saju = A): ReportInput {
  return { nickname: "서윤", knownMbti: "INFJ", birthText: "", summary: buildDevFreeSummary(answersOf(pattern)), saju, gender: "female", context: null, reference: REF };
}

test("문장 가리기: 쉼표 앞까지만 남기고 가려진 글자는 담지 않는다 (대표 경향 이름 · 한 줄 요약은 2026-10-16부터 가리지 않는다)", () => {
  assert.equal(maskOneLiner("관계가 불확실할 때, 상대의 반응을 확인하려는 편입니다."), "관계가 불확실할 때,");
  assert.equal(maskOneLiner("쉼표가없는아주긴문장입니다"), "쉼표가없는아주긴");
});

test("대표 경향: 이름 전체와 한 줄 요약은 완성된 문장으로 보이고, 그렇게 읽은 이유(근거 응답)와 다른 유료 항목은 열리지 않는다", () => {
  for (const p of PATTERNS) {
    const inp = input(p);
    const preview = buildFreePreview({ summary: inp.summary, saju: inp.saju, reference: REF });
    assert.deepEqual(preview.tendency, { name: inp.summary.tendency.name, line: inp.summary.oneLiner });
    assert.ok(preview.tendency.name.endsWith("형") && preview.tendency.line.endsWith("."), "이름은 ~형, 한 줄 요약은 끝맺은 문장");
    const json = JSON.stringify(preview);
    for (const b of inp.summary.insight?.basis ?? []) assert.ok(!json.includes(b.text) && !json.includes(b.itemId), "제목을 공개해도 근거 응답은 구매 후");
    // 제목 공개를 이유로 다른 유료 항목을 넓히지 않는다 — 잠긴 핵심 요약 · 실천 제안 나머지는 그대로 없다
    assert.ok(!json.includes(inp.summary.core.stressTrigger) && !json.includes(inp.summary.core.tryNow));
    assert.equal(preview.core.shown.length, 2);
    assert.equal(preview.action.lockedCount, 2);
    // 잠긴 목록에는 "이름 앞부분만 보인다"는 안내가 더는 없고, 근거 응답이 있을 때만 "그렇게 읽은 이유"를 약속한다
    assert.ok(!preview.locked.some((f) => /이름/.test(f.title + f.teaser)));
    assert.equal(preview.locked.some((f) => f.id === "tendency"), Boolean(inp.summary.insight) && REPORT_BASIS.visible, "분석 근거를 화면에 보이지 않는 동안에는 \"그렇게 읽은 이유\"를 약속하지 않는다");
  }
});

test("잠금: 미리보기에는 나머지 요약 · 점수 · 상세 · 실천 나머지 · 질문 답 · 상황 설명이 전송 대상에 없다", () => {
  for (const p of PATTERNS) {
    const inp = input(p);
    const preview = buildFreePreview({ summary: inp.summary, saju: inp.saju, reference: REF });
    const json = JSON.stringify(preview);
    const extras = buildReportExtras({ summary: inp.summary, saju: inp.saju, reference: REF });

    for (const b of inp.summary.insight?.basis ?? []) assert.ok(!json.includes(b.text) && !json.includes(b.itemId), "그렇게 읽은 이유(근거 문항 · 응답)는 구매 후");
    if (extras.plain) {
      // 오행별 풀이 중 맛보기로 여는 것은 가장 두드러진 기운 하나의 "관계" 한 줄뿐이다(운영자 2026-10-16). 일 · 선택 풀이와 나머지 기운의 관계 풀이는 구매 후
      const shownRelation = preview.saju.status === "ok" ? preview.saju.relation?.text : undefined;
      for (const e of extras.plain.elements) {
        if (!e.domains) continue;
        assert.ok(!json.includes(e.domains.work) && !json.includes(e.domains.choice), `오행 ${e.element}의 일 · 선택 풀이`);
        if (e.domains.relation !== shownRelation) assert.ok(!json.includes(e.domains.relation), `오행 ${e.element}의 관계 풀이(맛보기 한 줄 외)`);
      }
    }
    assert.ok(!json.includes(inp.summary.core.stressTrigger) && !json.includes(inp.summary.core.tryNow), "잠긴 핵심 요약 2개");
    for (const r of [...inp.summary.temperament, ...inp.summary.relationship]) {
      assert.ok(!json.includes(r.highMeaning) && !json.includes(r.lowMeaning), `기질 · 관계 설명 ${r.id}`);
    }
    assert.ok(!("temperament" in preview) && !("relationship" in preview), "기질 · 관계 점수 항목 자체가 없다");
    for (const a of STARTER_ACTIONS[inp.summary.tendency.id].slice(1)) assert.ok(!json.includes(a.title) && !json.includes(a.detail), "잠긴 실천 제안");
    for (const s of extras.situations) {
      assert.ok(!json.includes(s.strength) && !json.includes(s.caution) && !json.includes(s.scenario) && !json.includes(s.tip), `상황 설명 ${s.id}`);
    }
    for (const s of extras.situations.slice(1)) assert.ok(!json.includes(s.strengthLabel) && !json.includes(s.cautionLabel), "첫 상황 외 라벨");
    for (const c of preview.core.locked) assert.ok(c.question.endsWith("?"), "잠긴 핵심 요약은 문장 대신 질문");
    for (const q of extras.questions) assert.ok(!json.includes(q.answer), "질문의 답");
    for (const q of extras.questions.slice(2)) assert.ok(!json.includes(q.question), "공개하지 않는 질문");
    if (extras.plain) {
      assert.ok(!json.includes(extras.plain.dayMaster.goodAt) && !json.includes(extras.plain.dayMaster.watchOut), "일간의 잘하는 점 · 주의할 점");
      for (const e of extras.plain.everyday.slice(1)) assert.ok(!json.includes(e), "일상 예시 나머지");
    }
    if (extras.items) for (const it of extras.items.items) assert.ok(!json.includes(it.place) && !json.includes(it.habits[0]), "보완 아이템 내용");
    if (extras.partner) for (const f of extras.partner.fits) assert.ok(!json.includes(f.detail), "어울리는 관계 조건 내용");
  }
});

test("공개 범위: 핵심 요약 2개, 질문 2개, 실천 1개, 첫 상황 라벨만, MBTI 성향과 사주 표 · 오행 뜻은 보인다", () => {
  const inp = input(PATTERNS[0]);
  const p = buildFreePreview({ summary: inp.summary, saju: inp.saju, reference: REF });
  assert.equal(p.lead.kind, "insight", "응답이 뒷받침하면 해석 문단은 전체를 보여 준다");
  assert.equal(p.core.shown.length, 2);
  assert.deepEqual(p.core.shown.map((r) => r.label), ["내가 편한 환경", "자주 반복되는 반응"]);
  assert.equal(p.core.locked.length, 2);
  assert.ok(p.questions.shown.length <= 2 && p.questions.shown.length + p.questions.lockedCount >= 3);
  assert.ok(p.action.shown && p.action.lockedCount === 2);
  assert.equal(p.situations.filter((s) => s.strengthLabel).length, 1);
  assert.equal(p.situations.length, 4);
  assert.equal(p.mbti.axes.length, 4);
  assert.equal(p.saju.status, "ok");
  if (p.saju.status !== "ok") return;
  assert.equal(p.saju.elements.length, 5);
  assert.ok(p.saju.elements.every((e) => e.force.length > 8));
  assert.ok(p.saju.everyday.shown);
  assert.ok(p.saju.elements.every((e) => e.keywords.includes("·")), "오행 키워드");
  assert.match(p.saju.headline, /촛불처럼/, "정화 일간 — 쉬운 한 줄");
});

test("사주로 읽은 관계 한 줄: 가장 두드러진 기운(많음 → 없음 → 적음) 하나의 관계 풀이만 열리고, 같은 문장이 구매한 리포트의 오행별 풀이에 있다", () => {
  for (const saju of [A, B]) {
    const inp = input(PATTERNS[0], saju);
    const p = buildFreePreview({ summary: inp.summary, saju: inp.saju, reference: REF });
    const extras = buildReportExtras({ summary: inp.summary, saju: inp.saju, reference: REF });
    assert.equal(p.saju.status, "ok");
    if (p.saju.status !== "ok" || !extras.plain) return;
    const rel = p.saju.relation;
    assert.ok(rel, "두드러진 기운이 있으면 관계 한 줄이 있다");
    const hit = extras.plain.elements.filter((e) => e.domains?.relation === rel.text);
    assert.equal(hit.length, 1, "구매한 리포트의 오행별 풀이에 같은 문장이 있다");
    const manyFirst = extras.plain.elements.filter((e) => e.level === "many").sort((a, b) => b.count - a.count)[0];
    if (manyFirst) assert.equal(hit[0].element, manyFirst.element, "많은 기운이 있으면 그 기운의 풀이");
    assert.ok(!/\d/.test(rel.lead + rel.text), "개수 숫자는 싣지 않는다");
    assert.match(rel.lead, /기운이 (많아요|없어요|적어요)$/);
  }
});

test("일관성: 미리보기에 보이는 모든 것이 구매한 리포트(개발용 · AI)에 실제로 들어 있다", async () => {
  const ai = createAiReportGenerator({ model: createMockModel(), now: () => new Date("2026-10-12T03:00:00Z"), sleep: async () => {} });
  for (const saju of [A, B]) {
    for (const pattern of PATTERNS) {
      const inp = input(pattern, saju);
      const preview = buildFreePreview({ summary: inp.summary, saju: inp.saju, reference: REF });

      const dev = buildDevReport(inp);
      const aiReport = await ai.generate(inp);
      if (!("kind" in aiReport)) throw new Error("v2가 아님");

      for (const [label, base, extras] of [
        ["개발용", dev, dev.extras],
        ["AI", aiReport.base, aiReport.extras],
      ] as const) {
        assert.ok(base && extras, `${label}: 요약과 구성 요소가 저장된다`);
        assert.equal(base.tendency.name, preview.tendency.name, `${label}: 이름`);
        assert.equal(base.oneLiner, preview.tendency.line, `${label}: 한 줄 요약`);
        if (preview.lead.kind === "insight") {
          assert.equal(base.insight?.text, preview.lead.text, `${label}: 응답에서 읽은 문단이 그대로 들어 있다`);
          assert.ok(base.insight && base.insight.basis.length > 0, `${label}: 그렇게 읽은 이유(근거 응답)가 들어 있다`);
        } else {
          assert.ok(base.oneLiner.startsWith(preview.lead.shown), `${label}: 한 줄 요약`);
        }
        assert.deepEqual(preview.core.shown, [
          { label: "내가 편한 환경", text: base.core.comfortableEnvironment },
          { label: "자주 반복되는 반응", text: base.core.repeatedReaction },
        ]);
        assert.ok(base.core.stressTrigger.length > 0 && base.core.tryNow.length > 0, `${label}: 잠긴 핵심 요약 2개가 들어 있다`);
        assert.ok(base.temperament.length > 0 && base.relationship.length > 0, `${label}: 기질 · 관계 점수가 들어 있다`);
        assert.deepEqual(preview.questions.shown, extras.questions.slice(0, 2).map((q) => q.question));
        assert.equal(preview.questions.shown.length + preview.questions.lockedCount, extras.questions.length);
        assert.ok(extras.questions.every((q) => q.answer.length > 30), `${label}: 질문마다 답이 있다`);
        assert.deepEqual(preview.action.shown, extras.starterActions[0]);
        assert.equal(extras.starterActions.length, 3);
        assert.equal(preview.situations[0].strengthLabel, extras.situations[0].strengthLabel);
        assert.equal(preview.situations[0].cautionLabel, extras.situations[0].cautionLabel);
        assert.equal(extras.situations.length, preview.situations.length);
        for (const a of preview.answers) {
          // 답을 약속한 질문마다 구매한 리포트에 그 답이 되는 부분이 실제로 있어야 한다
          if (a.id === "partner" || a.id === "years") assert.ok(extras.partner && (a.id === "partner" ? extras.partner.fits.length > 0 : true), `${label}: ${a.id}`);
          if (a.id === "elements") assert.ok(extras.plain && extras.plain.elements.some((e) => e.domains), `${label}: 오행별 관계 · 일 · 선택 풀이`);
          if (a.id === "work" || a.id === "close" || a.id === "repeat") assert.ok(extras.situations.length === 4 && extras.situations.every((s) => s.tip.length > 0), `${label}: 상황별`);
          if (a.id === "stress") assert.ok(base.core.stressTrigger.length > 0);
          if (a.id === "actions") assert.equal(extras.starterActions.length, 3);
        }
        for (const f of preview.locked) {
          if (f.id === "questions") assert.ok(extras.questions.length > 0);
          if (f.id === "partner") assert.ok(extras.partner);
          if (f.id === "items") assert.ok(extras.items);
        }
      }
      assert.equal(dev.actions[0].title, preview.action.shown?.title, "개발용 리포트의 실천 제안 첫째");
    }
  }
});

test("사주 계산이 안 된 경우에도 미리보기는 만들어지고, 사주 부분만 안내로 바뀐다", () => {
  const inp = input(PATTERNS[0], { status: "invalid", message: "존재하지 않는 음력 날짜입니다." });
  const p = buildFreePreview({ summary: inp.summary, saju: inp.saju, reference: REF });
  assert.equal(p.saju.status, "not-ready");
  assert.equal(p.questions.shown.length, 0);
  assert.ok(!p.locked.some((f) => ["questions", "partner", "items"].includes(f.id)), "만들 수 없는 항목은 약속하지 않는다");
  assert.equal(p.situations.length, 4);
});

test("개인별: 원국이 다르면 풀이 · 질문 · 보완 아이템 · 관계 조건이 달라지고, 같은 입력이면 항상 같다", () => {
  const a = buildFreePreview({ summary: input(PATTERNS[0]).summary, saju: A, reference: REF });
  const b = buildFreePreview({ summary: input(PATTERNS[0]).summary, saju: B, reference: REF });
  assert.notDeepEqual(a.saju, b.saju);
  assert.notDeepEqual(a.questions, b.questions);
  assert.deepEqual(buildFreePreview({ summary: input(PATTERNS[0]).summary, saju: A, reference: REF }), a);

  const ea = buildReportExtras({ summary: input(PATTERNS[0]).summary, saju: A, reference: REF });
  const eb = buildReportExtras({ summary: input(PATTERNS[0]).summary, saju: B, reference: REF });
  assert.notDeepEqual(ea.items?.items.map((i) => i.element), eb.items?.items.map((i) => i.element));
  assert.notDeepEqual(ea.partner?.fits[0], eb.partner?.fits[0]);
  // 같은 응답이라도 사주가 다르면 사주 부분이 다르고, 응답 부분(상황)은 같다 — 사주와 응답은 합산하지 않는다
  assert.deepEqual(ea.situations, eb.situations);
});
