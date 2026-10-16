// 실행: npm test — 무료 맛보기 대화: 잠긴 내용(전체 이름 · 나머지 요약 · 점수 · 상세 · 질문의 답 · 상황 설명)이 모델에 없고, 잠긴 자리에는 질문만 있으며, 구매(또는 내 리포트)로 이어진다.
import assert from "node:assert/strict";
import test from "node:test";
import { ASSESSMENT_MODULES } from "../../assessment/modules/index.ts";
import { PERSONAL_REPORT } from "../../config/product.ts";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import { buildDevFreeSummary } from "../build-free-summary.ts";
import { buildReportExtras } from "../extras.ts";
import { buildFreePreview } from "../preview.ts";
import { STARTER_ACTIONS } from "../starter-actions.ts";
import { TALK_COPY, type TalkChat, type TalkModel } from "./talk.ts";
import { buildFreeTalkModel } from "./talk-free.ts";
import { partnerReading } from "../../saju/interpret/partner.ts";
import { applyAction, availableRooms, replyOptions, roomHasMaterial, roomTopics, ROOM_COPY, ROOM_ORDER, ROOMS, startRoom, type TalkLine } from "./talk-room.ts";

const REF = { year: 2026, month: 10 };
const TODAY = { year: 2026, month: 10, day: 15 };
const answersOf = (f: (i: number) => number) => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((item, i) => [item.id, f(i)])));
const PATTERNS = [(i: number) => (i % 5) + 1, () => 5, () => 1, (i: number) => ((i * 3) % 5) + 1, (i: number) => (i % 2 ? 4 : 2), (i: number) => (i < 12 ? 5 : 1)];
const A = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" });
const B = calculateSaju({ year: 1992, month: 6, day: 21, calendar: "solar", isLeapMonth: false, birthTime: "15:10", gender: "male" });

function freeModel(pattern: (i: number) => number, saju = A, owned = false, chat: TalkChat = { state: "locked" }): { model: TalkModel; summary: ReturnType<typeof buildDevFreeSummary> } {
  const summary = buildDevFreeSummary(answersOf(pattern));
  const preview = buildFreePreview({ summary, saju, reference: REF });
  return { model: buildFreeTalkModel({ name: "서윤", preview, saju, today: TODAY, href: owned ? "/results/x" : "/results/x#r-purchase", owned, chat }), summary };
}
const miyuText = (lines: TalkLine[]) => lines.flatMap((l) => (l.from === "miyu" && l.say.kind === "text" ? [l.say.text] : []));

test("잠금: 무료 맛보기 모델에는 전체 이름 · 나머지 요약 · 점수 설명 · 질문의 답 · 상황 설명 · 잠긴 실천이 없다", () => {
  for (const p of PATTERNS) {
    for (const saju of [A, B]) {
      const { model, summary } = freeModel(p, saju);
      const json = JSON.stringify(model);
      const extras = buildReportExtras({ summary, saju, reference: REF });
      assert.equal(model.tier, "free");
      assert.ok(!json.includes(summary.tendency.name), "전체 대표 경향 이름");
      assert.ok(!json.includes(summary.oneLiner), "전체 한 줄 요약");
      assert.ok(!json.includes(summary.core.stressTrigger) && !json.includes(summary.core.tryNow), "잠긴 핵심 요약 2개");
      for (const r of [...summary.temperament, ...summary.relationship]) assert.ok(!json.includes(r.highMeaning) && !json.includes(r.lowMeaning), `기질 · 관계 설명 ${r.id}`);
      for (const a of STARTER_ACTIONS[summary.tendency.id].slice(1)) assert.ok(!json.includes(a.title) && !json.includes(a.detail), "잠긴 실천 제안");
      for (const s of extras.situations) assert.ok(!json.includes(s.strength) && !json.includes(s.caution) && !json.includes(s.scenario) && !json.includes(s.tip), `상황 설명 ${s.id}`);
      for (const s of extras.situations.slice(1)) assert.ok(!json.includes(s.strengthLabel) && !json.includes(s.cautionLabel), "첫 상황 외 라벨");
      for (const q of extras.questions) assert.ok(!json.includes(q.answer), "질문의 답");
      // 오행별 풀이 중 맛보기로 여는 것은 가장 두드러진 기운 하나의 "관계" 한 줄뿐이다(운영자 2026-10-16, 무료 미리보기와 같은 줄)
      const shownRelation = model.topics.find((t) => t.id === "love")?.summary.join("\n") ?? "";
      if (extras.plain)
        for (const e of extras.plain.elements) {
          if (!e.domains) continue;
          assert.ok(!json.includes(e.domains.work) && !json.includes(e.domains.choice), `오행 ${e.element} 일 · 선택 풀이`);
          if (!shownRelation.includes(e.domains.relation)) assert.ok(!json.includes(e.domains.relation), `오행 ${e.element} 관계 풀이(맛보기 한 줄 외)`);
        }
      for (const b of summary.insight?.basis ?? []) assert.ok(!json.includes(b.text) && !json.includes(b.itemId), "그렇게 읽은 이유는 구매 후");
      assert.equal(model.card.tendency, null, "대표 경향 설명은 구매 후");
    }
  }
});

test("무료 맛보기 연애 방: 사주에서 읽은 관계 한 줄이 함께 보이고(테스트 답을 다시 말해 주는 데 그치지 않게), 인연의 경향 문장을 되풀이하지 않으며, 질문 근거에도 같은 줄이 들어 간다", () => {
  for (const saju of [A, B]) {
    const { model } = freeModel(PATTERNS[0], saju);
    const love = model.topics.find((t) => t.id === "love")!;
    assert.ok(love.grounded);
    const text = love.summary.join("\n");
    assert.match(text, /기운이 (많아요|없어요|적어요) — /, "사주에서 읽은 관계 한 줄");
    const partner = partnerReading(saju.status === "ok" ? saju : (undefined as never));
    if (partner) assert.ok(!text.includes(partner.mood.line), "인연의 경향(분위기)은 '끌리는 사람의 경향' 풀이가 따로 보여 준다");
    assert.ok(model.tasteProfile?.saju.some((l) => text.includes(l)), "질문 근거(profile)에도 같은 관계 줄이 있다");
    assert.ok(model.tasteProfile && model.tasteProfile.response.length > 0, "응답에서 읽은 문구도 있다");
  }
});

test("잠금 자리에는 문장이 아니라 질문만 있고, 이어지는 버튼은 구매(또는 이미 구매했다면 내 리포트)다", () => {
  const { model } = freeModel(PATTERNS[0]);
  const locked = [...model.topics, ...model.codeTopics].filter((t) => t.locked);
  assert.ok(locked.length >= 5, "리포트 주제 4개와 계산 주제 일부가 맛보기로 열린다");
  for (const t of locked) {
    assert.ok(t.locked!.hooks.length >= 2, t.id);
    for (const h of t.locked!.hooks) assert.ok(h.endsWith("?"), `${t.id}: 잠긴 자리는 질문 — ${h}`);
    assert.equal(t.basis, null, `${t.id}: 분석 근거는 구매 후`);
    assert.deepEqual(t.detail, [], `${t.id}: 자세한 풀이는 구매 후`);
  }
  assert.equal(model.buy?.href, "/results/x#r-purchase");
  assert.equal(model.buy?.label, `리포트로 이어 보기 · ${PERSONAL_REPORT.priceKrw.toLocaleString("ko-KR")}원`);
  assert.equal(model.buy?.owned, false);
  const owned = freeModel(PATTERNS[0], A, true).model;
  assert.equal(owned.buy?.label, "내 리포트 보기");
  assert.equal(owned.buy?.href, "/results/x");
});

test("무료 맛보기 방: 여덟 방이 열리고, 풀이는 맛보기 뒤에 잠금 안내와 구매 버튼이 오고 내 경험 질문은 그대로 있다", () => {
  const { model } = freeModel(PATTERNS[0]);
  assert.deepEqual(availableRooms(model), [...ROOM_ORDER]);
  for (const room of ["love", "career", "money", "year", "marriage"] as const) {
    const intake = startRoom(model, room);
    const opt = intake.phase === "intake" ? (replyOptions(model, room, intake) as { kind: "intake"; options: { action: Parameters<typeof applyAction>[3] }[] }).options[0].action : null;
    assert.ok(opt, room);
    const a = applyAction(model, room, intake, opt);
    const kinds = a.added.map((l) => (l.from === "miyu" ? l.say.kind : "me"));
    assert.ok(kinds.includes("answer") && kinds.includes("lock"), `${room}: 맛보기 뒤에 잠금 안내가 온다`);
    assert.ok(kinds.lastIndexOf("lock") < kinds.lastIndexOf("text"), `${room}: 잠금 안내 뒤에 내 경험을 묻는 질문`);
    const r = replyOptions(model, room, a.state);
    assert.ok(r.kind === "chat" && r.buy?.href === "/results/x#r-purchase", `${room}: 구매 버튼`);
    assert.ok(r.kind === "chat" && r.feel.length === 3 && r.helpers.every((c) => c.key !== "detail"), `${room}: 자세한 풀이 버튼은 없다`);
  }
  // 오늘의 한 장은 하루 한 번 무료 — 잠금 없이 고른 영역의 한 줄까지 모두 보인다
  const daily = applyAction(model, "daily", startRoom(model, "daily"), { t: "intake", option: "money" });
  assert.ok(!daily.added.some((l) => l.from === "miyu" && l.say.kind === "lock"));
  const r = replyOptions(model, "daily", daily.state);
  assert.ok(r.kind === "chat" && r.buy === null && r.feel.length === 0);
  // 고민해결소는 리포트를 받은 분께 열려 있다고 밝히고 구매로 이어진다
  const c = applyAction(model, "concern", startRoom(model, "concern"), { t: "intake", option: "love" });
  assert.ok(c.added.some((l) => l.from === "miyu" && l.say.kind === "lock"));
  const rc = replyOptions(model, "concern", c.state);
  assert.ok(rc.kind === "chat" && rc.buy !== null);
});

test("무료 맛보기의 말은 쉬운 말이고(사주 용어 · 점수 · 확률 없음), 공감할 문장은 응답이나 계산이 뒷받침할 때만 나온다", () => {
  for (const p of PATTERNS) {
    const { model, summary } = freeModel(p);
    const texts: string[] = [model.card.headline, model.card.strength.keyword, model.card.caution.keyword, model.card.flow.keyword];
    for (const t of [...model.topics, ...model.codeTopics]) texts.push(t.headline, ...t.summary, ...(t.caveat ? [t.caveat] : []), ...(t.periodExample ? [t.periodExample] : []));
    for (const raw of texts) {
      // "100% 정확하거나 검증된 사실이 아니에요"는 정확도를 주장하는 말이 아니라 한계를 밝히는 작은 안내다
      const s = raw.replace(/100% 정확하거나 검증된 사실이 아니에요/g, "");
      assert.doesNotMatch(s, /비겁|식상|재성|관성|인성|일간|일지|십신|대운|세운|천간|지지/, `사주 용어: ${s}`);
      assert.doesNotMatch(s, /\d+점|\d+\s*%|확률|반드시|틀림없/, `점수 · 확률 · 단정: ${s}`);
    }
    // 응답이 뒷받침하는 문단이 없으면(근거 문항이 0개) 그 문단은 만들지 않고 사주 한 줄로 돌아간다
    const tendency = model.topics.find((t) => t.id === "tendency")!;
    const love = model.topics.find((t) => t.id === "love")!;
    const insight = summary.insight;
    if (!insight) {
      assert.ok(!tendency.summary.join(" ").includes("있을 수 있어요") || /처럼/.test(tendency.summary.join(" ")));
    } else {
      const used = insight.basisModule === "relationship" ? love : tendency;
      assert.ok(used.summary.includes(insight.text), "응답이 뒷받침하는 문단이 맞는 방에 놓인다");
      const other = insight.basisModule === "relationship" ? tendency : love;
      assert.ok(!other.summary.includes(insight.text), "같은 문단을 두 곳에 되풀이하지 않는다");
    }
  }
});

test("성별 정보가 없는 결과: 시기 풀이가 없어 올해의 흐름 방은 열리지 않고 나머지는 열린다", () => {
  const noGender = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: null });
  const { model } = freeModel(PATTERNS[0], noGender);
  assert.equal(roomTopics(model, "year").length, 0);
  assert.ok(!availableRooms(model).includes("year"));
  assert.ok(availableRooms(model).includes("love"));
  assert.equal(model.card.flow.keyword, "리포트에서 이어서 볼 수 있어요");
  assert.equal(TALK_COPY.lock.title, "여기서부터는 리포트에서 이어져요");
  assert.deepEqual(miyuText([]), []);
});

test("무료 맛보기에서도 진로 방과 재무 방은 이어지는 질문 · 안내가 다르다 (재무 방에는 일 이야기 질문이 없고, 진로 방에는 돈 질문이 없다)", () => {
  const { model } = freeModel(PATTERNS[0]);
  const career = roomTopics(model, "career")[0];
  const money = roomTopics(model, "money")[0];
  assert.deepEqual(money.locked?.hooks, ROOM_COPY.focus.money.hooks);
  assert.ok(career.locked && career.locked.hooks.length > 0 && career.locked.hooks.every((h) => !/돈|소비|저축|재물|수입/.test(h)));
  assert.equal(career.askText, ROOM_COPY.focus.career.ask);
  assert.equal(money.askText, ROOM_COPY.focus.money.ask);
  assert.equal(money.traits, undefined, "재무 방에는 일하는 방식 카드를 보이지 않는다");
});

test("무료 질문은 재료가 있는 방에서만 열린다: 내 자료(응답에서 읽은 반응 · 사주 계산)가 있으면 열리고, 없는 방은 열리지 않는다 — 구매한 리포트는 늘 열린다", () => {
  // 사주 계산이 되는 결과: 나를 알아보기 · 연애 · 진로 · 재무 · 흐름 방이 열린다 (일지 · 일간 문장과 계산한 시기가 재료다)
  const { model } = freeModel(PATTERNS[0]);
  for (const room of ROOM_ORDER) assert.equal(typeof roomHasMaterial(model, room), "boolean", room);
  assert.ok(roomHasMaterial(model, "main"), "나를 알아보기는 맛보기 전체에서 하나라도 재료가 있으면 열린다");
  assert.ok(roomHasMaterial(model, "love"));
  assert.ok(roomHasMaterial(model, "year"));
  // 방마다 자기 풀이의 재료만 본다 — 한 방의 재료가 다른 방의 무료 질문을 열지 않는다
  for (const id of ["tendency", "love", "work-money", "flow"]) {
    const t = model.topics.find((x) => x.id === id);
    assert.equal(typeof t?.grounded, "boolean", `${id}: 맛보기 풀이는 재료 여부를 표시한다`);
  }

  // 재료가 하나도 없는 맛보기(사주 계산 불가 + 응답에서 읽은 반응 없음)는 어느 방도 무료 질문을 열지 않는다
  const empty = { ...model, topics: model.topics.map((t) => ({ ...t, grounded: false })), codeTopics: [] };
  for (const room of ROOM_ORDER) {
    if (ROOMS[room].chatOnly) continue;
    assert.equal(roomHasMaterial(empty, room), false, `${room}: 재료 없음`);
  }
  // 한 풀이에만 재료가 있으면 그 풀이를 쓰는 방만 열린다
  const onlyLove = { ...empty, topics: empty.topics.map((t) => (t.id === "love" ? { ...t, grounded: true } : t)) };
  assert.equal(roomHasMaterial(onlyLove, "love"), true);
  assert.equal(roomHasMaterial(onlyLove, "main"), true);
  assert.equal(roomHasMaterial(onlyLove, "career"), false);
  assert.equal(roomHasMaterial(onlyLove, "year"), false);

  // 구매한 리포트(tier paid)는 재료 여부와 상관없이 늘 열린다
  assert.equal(roomHasMaterial({ ...empty, tier: "paid" }, "love"), true);
});
