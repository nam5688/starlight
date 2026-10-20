// 실행: npm test — 상황형 28문항 읽기 설계 초안(situational-v2-reading.ts)의 규칙을 확인한다. 비용 0 · 연결하지 않은 초안이다.
//  · 112개 선택지가 모두 행동 근거 한 문장을 갖고, 읽는 쪽이 있거나 읽지 않는 이유가 있다 · 점수 · 가중치 · 애착 유형 이름이 데이터에 없다.
//  · 충분 · 상반 · 부족 판정이 규칙대로 나온다 · 읽는 장면이 모자라면 근거를 만들지 않는다.
//  · 개인 유형 연결: 기존 FLAVOR_RULES를 그대로 쓰고, 읽을 수 없는 행이 있는 유형은 닿을 수 없거나 그 행이 빠지며, 근거가 부족하면 유형을 정하지 않는다.
//  · 누구의 응답도 기본값이 아니다 — 빈 응답은 아무것도 읽지 않고 유형을 정하지 않는다. 운영자 예시는 문서 생성의 예시 D에서만 쓰인다.
//  · 어디에서도 불러오지 않는다 · 생성 문서(docs/assessment-situational-v2-reading-tables.md)가 코드와 어긋나지 않는다.
// 문항의 좋고 나쁨 · 신뢰도 · 타당도를 확인하는 시험이 아니다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Group } from "../../saju/interpret/structure.ts";
import { FLAVOR_RULES, PERSONAL_TYPES, PERSONAL_TYPE_IDS } from "../personal-type.ts";
import { readSource } from "../../report/test-source.ts";
import { SITUATIONAL_V2_ITEMS } from "./situational-v2-draft.ts";
import {
  DISTINCTIONS,
  DISTINCTION_IDS,
  SCENE_READINGS,
  judgeAll,
  judgeDistinction,
  readableRows,
  rowReads,
  sceneBalance,
  scenesOf,
  typeCoverage,
  typeFrom28,
  type Answer,
  type AnswerSheet,
} from "./situational-v2-reading.ts";
import { SIM, mulberry32, operatorSheetFromDoc, randomSheet, renderReadingTables, sheetFromPreference, simulate } from "./situational-v2-reading-render.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const GROUPS: Group[] = ["비겁", "식상", "재성", "관성", "인성"];
const provenance = readSource(join(root, "docs", "assessment-situational-v2-provenance.md"));

/** 장면 번호 → 선택지 번호 */
const sheet = (o: Record<string, Answer | undefined>): AnswerSheet => o;

test("장면 28개가 원본 초안 순서 그대로 있고 선택지 4개마다 행동 근거 한 문장이 있다(선택지 문장을 그대로 옮기지 않는다)", () => {
  assert.equal(SCENE_READINGS.length, 28);
  SCENE_READINGS.forEach((scene, i) => {
    const item = SITUATIONAL_V2_ITEMS[i];
    assert.equal(scene.id, item.id);
    assert.equal(scene.options.length, 4);
    assert.ok(["work", "social", "close", "solo"].includes(scene.context), scene.id);
    const facts = new Set<string>();
    scene.options.forEach((opt, k) => {
      assert.ok(opt.fact.trim().length >= 8, `${scene.id}-${k + 1} 행동 근거가 없다`);
      assert.notEqual(opt.fact.trim(), item.options[k].trim(), `${scene.id}-${k + 1} 행동 근거가 선택지 문장 그대로다`);
      assert.ok(!facts.has(opt.fact), `${scene.id}-${k + 1} 행동 근거가 같은 장면의 다른 선택지와 같다`);
      facts.add(opt.fact);
    });
  });
});

test("읽는 쪽은 주 구분의 쪽 이름 중 하나이고, 읽지 않는 선택지에는 이유가 있다 · 주 구분이 없는 장면은 모두 읽지 않는다", () => {
  for (const scene of SCENE_READINGS) {
    for (const [k, opt] of scene.options.entries()) {
      const where = `${scene.id}-${k + 1}`;
      if (scene.main === null) {
        assert.equal(opt.read, null, where);
        assert.ok(opt.why, where);
      } else if (opt.read) {
        assert.ok(opt.read.side in DISTINCTIONS[scene.main].sides, `${where}: ${opt.read.side}는 ${scene.main}의 쪽이 아니다`);
        assert.ok(["clear", "weak"].includes(opt.read.clarity), where);
        if (opt.read.clarity === "weak") assert.ok((opt.why ?? "").length >= 8, `${where}: 약하게 읽는 이유가 없다`);
        else assert.equal(opt.why, undefined, `${where}: 뚜렷하게 읽는 선택지에 이유가 붙어 있다`);
      } else assert.ok((opt.why ?? "").length >= 8, `${where}: 읽지 않는 이유가 없다`);
    }
  }
});

test("구분마다 설계된 장면 수와 선택지 읽기 수는 검토 문서(설계 문서 3장)가 말한 대로다", () => {
  const counts = Object.fromEntries(DISTINCTION_IDS.map((d) => [d, scenesOf(d).length]));
  assert.deepEqual(counts, { energy: 4, info: 1, basis: 3, structure: 3, first: 4, explore: 3, confirm: 3, repair: 3, help: 2 });
  assert.deepEqual(SCENE_READINGS.filter((s) => !s.main).map((s) => s.id), ["s10", "s26"]);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0) + 2, 28);
  let read = 0, clear = 0, weak = 0, unread = 0;
  for (const s of SCENE_READINGS) {
    for (const o of s.options) {
      if (!o.read) unread++;
      else {
        read++;
        if (o.read.clarity === "clear") clear++;
        else weak++;
      }
    }
  }
  assert.deepEqual({ read, clear, weak, unread }, { read: 83, clear: 59, weak: 24, unread: 29 });
  assert.equal(read + unread, 112);
  // 한쪽으로 쏠린 장면(뚜렷하게 읽히는 쪽이 하나뿐) — 설계 문서 4장의 표
  assert.deepEqual(SCENE_READINGS.filter((s) => sceneBalance(s).oneSided).map((s) => s.id), ["s05", "s07", "s21", "s22", "s23", "s25", "s27", "s28"]);
});

test("점수 · 가중치 · 방향 숫자가 없고 애착 유형 이름(안정형 · 불안형 · 회피형)을 쓰지 않으며, 애착 방식 구분은 유형 계산에 연결하지 않는다", () => {
  const text = JSON.stringify({ SCENE_READINGS, DISTINCTIONS });
  for (const word of ["score", "weight", "점수", "가중치", "안정형", "불안형", "회피형", "dimension"]) assert.ok(!text.includes(word), `읽기 데이터에 ${word}`);
  const hasNumber = (v: unknown): boolean => (typeof v === "number" ? true : Array.isArray(v) ? v.some(hasNumber) : v && typeof v === "object" ? Object.values(v).some(hasNumber) : false);
  assert.ok(!hasNumber(SCENE_READINGS), "장면 읽기에 숫자 값이 있다(선택지에 점수를 붙이지 않는다)");
  for (const d of DISTINCTION_IDS) {
    if (!DISTINCTIONS[d].attachmentWay) continue;
    for (const side of Object.values(DISTINCTIONS[d].sides)) assert.deepEqual(side.rows, [], `${d}: 애착 방식은 유형 계산에 쓰지 않는다`);
  }
  assert.deepEqual(DISTINCTION_IDS.filter((d) => DISTINCTIONS[d].attachmentWay), ["confirm", "repair", "help"]);
});

test("판정 — 읽는 장면이 3개보다 적게 설계된 구분(정보 · 도움)은 어떤 답이어도 읽지 않는다", () => {
  for (const pick of [1, 2, 3, 4] as const) {
    const all = sheet(Object.fromEntries(SCENE_READINGS.map((s) => [s.id, pick])));
    assert.equal(judgeDistinction("info", all).status, "insufficient");
    assert.equal(judgeDistinction("info", all).code, "design-short");
    assert.equal(judgeDistinction("help", all).code, "design-short");
  }
});

test("판정 — 같은 쪽 3장면 이상 + 2가지 맥락이면 뚜렷한 방향(강), 한 장면이라도 반대쪽이 나오면 상황별 차이, 2장면이면 중", () => {
  const withAll = judgeDistinction("energy", sheet({ s04: 1, s08: 2, s12: 1, s14: 3 }));
  assert.equal(withAll.status, "sufficient");
  assert.equal(withAll.side, "with");
  assert.equal(withAll.strength, "strong");
  const split = judgeDistinction("energy", sheet({ s04: 1, s08: 1, s12: 1, s14: 3 }));
  assert.equal(split.status, "contrast", "s08-1(혼자 쪽)이 끼면 평균 내지 않고 상황별 차이");
  assert.deepEqual(split.counts, { with: 3, alone: 1 });
  const moderate = judgeDistinction("energy", sheet({ s04: 1, s08: "na", s12: 2, s14: 3 }));
  assert.equal(moderate.status, "sufficient");
  assert.equal(moderate.strength, "moderate", "s08은 해당 없음 · s12-2는 읽지 않는 선택지 — 2장면(친구 · 모임과 혼자)만 읽혔다");
});

test("판정 — 답한 장면 3개 미만 · 읽힌 장면 2개 미만 · 약하게만 읽힘 · 한 맥락뿐이면 읽지 않고 이유가 다르다", () => {
  assert.equal(judgeDistinction("basis", sheet({ s07: 1, s22: 3, s23: "na" })).code, "few-answered");
  assert.equal(judgeDistinction("basis", sheet({ s07: 1, s22: 3 })).code, "few-answered");
  assert.equal(judgeDistinction("energy", sheet({ s04: 2, s08: 2, s12: 2, s14: 2 })).code, "few-read");
  // s05-3 · s27-2는 먼저 해 보는 쪽으로 약하게만 읽힌다
  assert.equal(judgeDistinction("explore", sheet({ s02: 1, s05: 3, s27: 2 })).code, "weak-only");
  // s04 · s08 · s12는 모두 친구 · 모임 맥락이고 s14-2는 읽지 않는 선택지
  const one = judgeDistinction("energy", sheet({ s04: 1, s08: 2, s12: 1, s14: 2 }));
  assert.equal(one.code, "one-context");
  assert.equal(one.status, "insufficient");
});

test("판정 — \"해당 없음\" · 미응답은 답한 장면에 세지 않는다(4장면 구분은 하나가 없어도 읽고, 3장면 구분은 하나만 없어도 읽지 않는다)", () => {
  assert.equal(judgeDistinction("energy", sheet({ s04: 1, s08: 2, s12: 1, s14: "na" })).status, "insufficient", "s04 · s08 · s12가 모두 친구 · 모임 맥락이라 한 맥락뿐");
  assert.equal(judgeDistinction("energy", sheet({ s04: 1, s08: 2, s12: "na", s14: 3 })).status, "sufficient");
  assert.equal(judgeDistinction("structure", sheet({ s01: 1, s25: 1, s28: null })).code, "few-answered");
  assert.equal(judgeDistinction("structure", sheet({ s01: 1, s25: 1 })).code, "few-answered");
});

test("판정 — 약하게 읽힌 선택도 반대쪽 신호로 센다(상반을 가린 방향으로 만들지 않는다)", () => {
  // s07-1 근거 먼저(뚜렷) · s22-3 근거 먼저(뚜렷) · s23-3 사람 먼저(약함)
  const r = judgeDistinction("basis", sheet({ s07: 1, s22: 3, s23: 3 }));
  assert.equal(r.status, "contrast");
  assert.deepEqual(r.counts, { logic: 2, people: 1 });
});

test("읽기 결과는 답의 입력 순서와 상관없고, 같은 답이면 늘 같다", () => {
  const a = sheet({ s01: 2, s02: 3, s03: 4, s04: 1, s05: 2, s06: 2, s07: 1, s08: 3, s09: 1, s10: 4, s11: 2, s12: 3, s13: 1, s14: 2, s15: 3, s16: 1, s17: 3, s18: 2, s19: 3, s20: 1, s21: 2, s22: 3, s23: 1, s24: 4, s25: 1, s26: 2, s27: 4, s28: 2 });
  const b = sheet(Object.fromEntries(Object.entries(a).reverse()));
  assert.deepEqual(judgeAll(a), judgeAll(b));
  assert.deepEqual(judgeAll(a), judgeAll(a));
});

test("누구의 응답도 기본값이 아니다 — 빈 응답은 아무것도 읽지 않고 유형도 정하지 않는다", () => {
  const empty = judgeAll({});
  for (const rd of empty) {
    assert.equal(rd.status, "insufficient", rd.d);
    assert.equal(rd.read, 0);
  }
  for (const g of GROUPS) {
    const t = typeFrom28([g], empty);
    assert.equal(t.kind, "mixed");
    if (t.kind === "mixed") assert.equal(t.reason, "response-missing");
  }
  assert.equal(typeFrom28([], empty).kind, "mixed");
  // 읽기 모듈은 운영자 예시 답을 모른다 — 예시는 문서 생성 쪽에서만 문서의 블록에서 읽는다
  const source = readSource(join(import.meta.dirname, "situational-v2-reading.ts"));
  for (const word of ["operator-picks", "assessment-situational-v2-provenance", "readFileSync", "OPERATOR"]) assert.ok(!source.includes(word), `읽기 모듈이 ${word}를 알고 있다`);
  assert.deepEqual(operatorSheetFromDoc(""), {});
  assert.ok(!renderReadingTables("").includes("예시 D"), "운영자 블록이 없으면 예시 D를 만들지 않는다");
});

test("운영자가 고른 28개는 예시 입력일 뿐이다 — 문서의 블록을 28개 모두 읽고, 이 사람에게는 상황별 차이가 여럿이라 한 가지 유형으로 묶이지 않는다", () => {
  const picks = operatorSheetFromDoc(provenance);
  assert.equal(Object.keys(picks).length, 28);
  for (const s of SCENE_READINGS) assert.ok([1, 2, 3, 4].includes(picks[s.id] as number), s.id);
  const readings = judgeAll(picks);
  const contrast = readings.filter((r) => r.status === "contrast").map((r) => r.d);
  assert.ok(contrast.length >= 4, `운영자 예시에서 상황별 차이가 ${contrast.length}개 — 한 가지 모습으로 단정하지 않는다`);
  for (const g of GROUPS) assert.notEqual(typeFrom28([g], readings).kind, "type", `${g}: 근거가 엇갈리는 응답에 유형을 억지로 붙였다`);
});

test("행 연결 — 이 설계로 읽을 수 있는 행은 ei · tf · jp · novelty · caution뿐이고 sn · sensitivity · persistence · anxiety · avoidance는 읽는 구분이 없다", () => {
  const rows = readableRows();
  assert.deepEqual(Object.entries(rows).filter(([, d]) => d.length > 0).map(([r]) => r).sort(), ["caution", "ei", "jp", "novelty", "tf"]);
  assert.deepEqual(rows.caution.sort(), ["explore", "first"]);
});

test("행 읽기 — 서로 다른 구분이 같은 행을 반대로 가리키면 갈림으로 두고, 상반 · 부족한 구분은 방향을 만들지 않는다", () => {
  // 첫 반응이 점검(caution 높음)인데 시도와 신중은 먼저 해 보는 쪽(caution 낮음)
  const first = sheetFromPreference({ first: "check", explore: "venture" });
  const rows = rowReads(judgeAll(first));
  assert.equal(rows.caution.dir, "split");
  assert.equal(rows.novelty.dir, "high");
  // 한쪽 구분만 방향이 나왔을 때
  assert.equal(rowReads(judgeAll(sheetFromPreference({ first: "check" }))).caution.dir, "high");
  // 읽지 않은 구분은 행을 만들지 않는다
  assert.equal(rowReads(judgeAll({})).ei.dir, "unread");
});

test("유형 연결 — 지금 FLAVOR_RULES를 그대로 쓰고 사주 갈래가 정한 안에서만 이름이 붙으며, 새 이름을 만들지 않는다", () => {
  const consistent = judgeAll(sheetFromPreference({ energy: "alone", basis: "logic", structure: "planned", first: "check", explore: "settled" }));
  const expected: Record<Group, string> = { 비겁: "독립 추진형", 식상: "혼합 경향", 재성: "안정 구축형", 관성: "기준 중심형", 인성: "신중 몰입형" };
  for (const g of GROUPS) assert.equal(typeFrom28([g], consistent).name, expected[g], g);
  // 같은 응답이어도 사주 갈래가 정해지지 않으면(사주가 먼저다) 이름을 붙이지 않는다
  assert.equal(typeFrom28([], consistent).name, "혼합 경향");
  // 붙는 이름은 개인 유형 10개 안에 있다
  const names = new Set(PERSONAL_TYPE_IDS.map((id) => PERSONAL_TYPES[id].name));
  const rand = mulberry32(7);
  for (let i = 0; i < 300; i++) {
    const rd = judgeAll(randomSheet(rand));
    for (const g of GROUPS) {
      const t = typeFrom28([g], rd);
      if (t.kind === "type") {
        assert.ok(names.has(t.name));
        assert.equal(PERSONAL_TYPES[t.id].group, g);
        assert.ok(t.id === FLAVOR_RULES[g].a || t.id === FLAVOR_RULES[g].b);
      }
    }
  }
});

test("유형 연결 — 근거가 부족하거나 엇갈리면 이름을 억지로 붙이지 않는다(받침 하나가 약함 · 이기는 모습의 다른 행이 갈림 · 사주 후보 동률)", () => {
  // 에너지만 2장면으로 중간(moderate) — 비겁은 ei 하나뿐이고 strong이 아니라 정하지 않는다
  const weakOnly = judgeAll(sheet({ s04: 4, s08: "na", s12: 2, s14: 1 }));
  assert.equal(judgeDistinction("energy", sheet({ s04: 4, s08: "na", s12: 2, s14: 1 })).strength, "moderate");
  const t = typeFrom28(["비겁"], weakOnly);
  assert.equal(t.kind, "mixed");
  // 에너지가 강하게 혼자 쪽이면(strong) 읽을 수 없는 행(avoidance)이 있어도 ei 하나로 정한다
  const strong = judgeAll(sheetFromPreference({ energy: "alone" }));
  const typed = typeFrom28(["비겁"], strong);
  assert.equal(typed.kind, "type");
  if (typed.kind === "type") {
    assert.equal(typed.name, "독립 추진형");
    assert.deepEqual(typed.unreadable, ["avoidance"]);
  }
  // 이기는 모습(유연 적응형)의 다른 행(caution)이 갈림이면 정하지 않는다
  const conflicted = judgeAll(sheetFromPreference({ structure: "open", first: "check", explore: "venture" }));
  assert.equal(rowReads(conflicted).caution.dir, "split");
  assert.equal(typeFrom28(["재성"], conflicted).kind, "mixed");
  // 후보 갈래 둘이 똑같이 받쳐지면 정하지 않는다(재성 ↔ 비겁)
  const tie = judgeAll(sheetFromPreference({ energy: "alone", structure: "planned", explore: "settled" }));
  assert.equal(typeFrom28(["재성", "비겁"], tie).kind, "type", "재성(받침 caution · jp 둘)이 비겁(받침 ei 하나)보다 앞서면 정한다");
  const tie2 = judgeAll(sheetFromPreference({ energy: "alone", basis: "logic" }));
  assert.equal(typeFrom28(["비겁", "관성"], tie2).kind, "mixed", "받침이 같은 수(1 대 1)면 어느 쪽도 고르지 않는다");
});

test("유형 연결 가능성 — 빠른 실행형은 읽는 행이 하나도 없어 28문항만으로는 닿을 수 없고, 나머지 9개는 일부 행이 빠진 채 닿는다", () => {
  const cov = typeCoverage();
  assert.equal(cov.length, 10);
  assert.deepEqual(cov.filter((c) => !c.reachable).map((c) => c.id), ["fast-doer"]);
  const partial = cov.filter((c) => c.reachable && c.parts.some((p) => !p.readable)).map((c) => c.id).sort();
  assert.deepEqual(partial, ["duty-finisher", "explorer", "gentle-empathic", "independent-driver", "relation-balancer", "standard-keeper"]);
  const full = cov.filter((c) => c.parts.every((p) => p.readable)).map((c) => c.id).sort();
  assert.deepEqual(full, ["careful-deep", "flexible-adapter", "steady-builder"]);
  // 무작위 가상 응답 어디서도 식상 갈래의 빠른 실행형이 붙지 않는다
  const rand = mulberry32(99);
  for (let i = 0; i < 2000; i++) {
    const t = typeFrom28(["식상"], judgeAll(randomSheet(rand)));
    if (t.kind === "type") assert.notEqual(t.id, "fast-doer");
  }
});

test("가상 무작위 응답 측정 — 정보 · 도움은 어떤 경우에도 읽지 않고, 읽히는 구분이 있어도 유형이 붙는 몫은 낮다(설계가 어디서 막히는지 보는 참고)", () => {
  const sim = simulate();
  assert.equal(sim.n, SIM.n);
  assert.equal(sim.status.info.insufficient, SIM.n);
  assert.equal(sim.status.help.insufficient, SIM.n);
  for (const g of GROUPS) assert.ok(sim.byGroup[g].typed + sim.byGroup[g].mixed === SIM.n);
  // 같은 씨앗이면 같은 결과
  assert.deepEqual(simulate(), sim);
});

test("선호를 정해 둔 가상 응답은 그쪽 선택지를 고른다(응답 기본값을 만들지 않고 선호가 없는 구분은 읽지 않는 선택지로 둔다)", () => {
  const s = sheetFromPreference({ energy: "with" });
  for (const scene of SCENE_READINGS) {
    const opt = scene.options[(s[scene.id] as number) - 1];
    if (scene.main === "energy") assert.equal(opt.read?.side, "with", scene.id);
    else if (scene.options.some((o) => !o.read)) assert.equal(opt.read, null, `${scene.id}: 선호 없는 장면은 읽지 않는 선택지`);
  }
  assert.equal(judgeDistinction("energy", s).side, "with");
  assert.deepEqual(sheetFromPreference({}), sheetFromPreference({}));
});

test("연결하지 않았다: 읽기 모듈 · 문서 생성 · 시험 밖의 어떤 화면 · 서버 · 저장 · 리포트 · 검사 · 스크립트도 이 초안을 불러오지 않는다", () => {
  const allowed = /^situational-v2-/;
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name === "pilot-data" || name === "docs" || name.startsWith(".")) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && !allowed.test(name) && /situational-v2-reading|situational-v2-render/.test(readFileSync(path, "utf8"))) hits.push(path.slice(root.length + 1));
    }
  };
  for (const d of ["app", "components", "server", "lib", "scripts"]) walk(join(root, d));
  assert.deepEqual(hits, []);
  // 지금 22문항 검사 모듈은 이 초안을 모른다
  for (const f of ["mbti.ts", "temperament.ts", "relationship.ts", "index.ts"]) assert.ok(!/situational/.test(readFileSync(join(root, "lib", "assessment", "modules", f), "utf8")), f);
});

test("생성 문서(docs/assessment-situational-v2-reading-tables.md)가 코드와 어긋나지 않는다", () => {
  const onDisk = readSource(join(root, "docs", "assessment-situational-v2-reading-tables.md"));
  const rendered = renderReadingTables(provenance);
  assert.equal(onDisk.replace(/\n+$/, ""), rendered.replace(/\n+$/, ""), "문서가 낡았다 — node scripts/situational-v2-render-reading.ts로 다시 만든다");
});
