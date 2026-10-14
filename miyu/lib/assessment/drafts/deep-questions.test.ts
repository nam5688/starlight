// 실행: npm test — 미유 자체 심화 검사 첫 묶음(문항 36개 · 세부 항목 12개 · 초안 0.1)의 구조 · 균형 · 채점 규칙 검사 (화면에는 연결하지 않은 초안)
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEEP_DOMAINS, TOTAL_QUESTION_BUDGET, firstBundle } from "./deep-design.ts";
import { permFor, PERM_COUNT } from "./deep-item-kit.ts";
import {
  DEEP_ITEM_BY_ID,
  DEEP_ITEMS,
  DEEP_SUB_DEFS,
  FIRST_BUNDLE_SUB_IDS,
  HOLD_TEXT,
  UNCLEAR_TEXT,
  deepContribution,
  deepIndicatorCounts,
  scoreDeep,
  type DeepAnswers,
  type DeepItem,
  type FirstBundleSubId,
} from "./deep-questions.ts";
import { MIN_INDICATORS, NA_OPTION_TEXT } from "./situational-draft.ts";

const scored = (item: DeepItem) => item.options.filter((o) => !o.unscored);
const w = (o: { w?: number }) => o.w as number;

test("구성: 문항 36개(E01~E36) · 세부 항목 12개 × 3문항 · 선택지 4개 + 공통 '해당 없음', 질문 · 이름이 겹치지 않는다", () => {
  assert.equal(DEEP_ITEMS.length, 36);
  assert.deepEqual(DEEP_ITEMS.map((i) => i.id), Array.from({ length: 36 }, (_, n) => `E${String(n + 1).padStart(2, "0")}`));
  assert.equal(Object.keys(DEEP_ITEM_BY_ID).length, 36);
  for (const item of DEEP_ITEMS) {
    assert.deepEqual(item.options.map((o) => o.id), ["a", "b", "c", "d"], item.id);
    assert.ok(item.stem.length >= 20 && item.stem.endsWith("?"), `${item.id} 질문 형식`);
    assert.ok(item.purpose.length >= 10, `${item.id} 알고 싶은 것`);
  }
  assert.equal(new Set(DEEP_ITEMS.map((i) => i.stem)).size, 36, "같은 질문을 반복하지 않는다");
  assert.equal(new Set(DEEP_ITEMS.map((i) => i.topic)).size, 36);
  assert.match(NA_OPTION_TEXT, /겪어 본 적이 없거나/);
  assert.deepEqual(deepIndicatorCounts(), Object.fromEntries(FIRST_BUNDLE_SUB_IDS.map((s) => [s, 3])));
});

test("설계안과 맞는다: 묶음의 세부 항목은 deep-design의 first 표시 12개와 같고, 이름 · 영역이 같으며, 총 문항 수가 50~60개 안이다", () => {
  const bundle = firstBundle();
  assert.deepEqual(
    bundle.subs.map((r) => r.name),
    FIRST_BUNDLE_SUB_IDS.map((id) => DEEP_SUB_DEFS[id].name),
  );
  const byId = new Map<string, string>();
  for (const d of DEEP_DOMAINS) d.subs.forEach((s, n) => byId.set(`${d.id}-${n + 1}`, s.name));
  for (const id of FIRST_BUNDLE_SUB_IDS) assert.equal(byId.get(id), DEEP_SUB_DEFS[id].name, `${id} 이름이 설계안과 다르다`);
  for (const item of DEEP_ITEMS) assert.equal(item.domain, item.sub.slice(0, 2), item.id);
  assert.equal(bundle.items, DEEP_ITEMS.length, "설계안이 센 문항 수와 실제 문항 수가 같다");
  assert.equal(bundle.total, bundle.liveItems + 36);
  assert.ok(bundle.withinBudget, `총 ${bundle.total}문항이 ${TOTAL_QUESTION_BUDGET.min}~${TOTAL_QUESTION_BUDGET.max}개를 벗어났다`);
  // 다음 단계(13개)에는 아직 문항이 없다 — 문항이 없는 세부 항목을 있는 것처럼 쓰지 않는다
  const later = new Set(bundle.later.map((r) => r.name));
  for (const id of FIRST_BUNDLE_SUB_IDS) assert.ok(!later.has(DEEP_SUB_DEFS[id].name));
  assert.equal(later.size, 13);
});

test("한 문항은 세부 항목 하나에만 점수를 준다: 점수를 주는 선택지 3~4개, 세기 ±1~2, 점수 제외 답은 이유를 적고 세부 항목마다 한 문항 이하다", () => {
  for (const item of DEEP_ITEMS) {
    for (const o of item.options) {
      if (o.unscored) {
        assert.equal(o.w, undefined, `${item.id}${o.id} 점수에 넣지 않는 답은 점수를 주지 않는다`);
        assert.ok(o.reason && o.reason.length >= 3, `${item.id}${o.id} 점수에 넣지 않는 답은 이유를 적는다`);
      } else assert.ok([-2, -1, 1, 2].includes(w(o)), `${item.id}${o.id} 세기`);
      assert.ok(o.text.length >= 10 && o.text.length <= 70, `${item.id}${o.id} 길이 ${o.text.length}`);
    }
    assert.ok(scored(item).length >= 3, `${item.id} 점수를 주는 선택지가 3개 이상`);
    const values = scored(item).map(w);
    assert.ok(Math.max(...values) > 0 && Math.min(...values) < 0, `${item.id} 높은 쪽과 낮은 쪽 선택지가 모두 있다`);
  }
  // 점수 제외 답이 있는 문항: 거절 · 경계(E22) · 갈등에서 의견(E35)뿐이며 세부 항목마다 하나 이하 — 하나만 있어도 3문항 중 하나가 증거가 아니라 판단 보류가 쉬워진다
  const withUnscored = DEEP_ITEMS.filter((i) => i.options.some((o) => o.unscored));
  assert.deepEqual(withUnscored.map((i) => i.id), ["E22", "E35"]);
  assert.deepEqual(withUnscored.map((i) => i.sub), ["D6-3", "D6-4"]);
});

test("장면: 세부 항목마다 세 문항이 서로 다른 장면에서 묻고, 한 장면이 문항의 3분의 1을 넘지 않는다", () => {
  for (const sub of FIRST_BUNDLE_SUB_IDS) {
    const scenes = DEEP_ITEMS.filter((i) => i.sub === sub).map((i) => i.scene);
    assert.equal(new Set(scenes).size, 3, `${sub} ${DEEP_SUB_DEFS[sub].name}: 장면이 ${scenes.join("·")}`);
  }
  const perScene: Record<string, number> = {};
  for (const i of DEEP_ITEMS) perScene[i.scene] = (perScene[i.scene] ?? 0) + 1;
  for (const [scene, n] of Object.entries(perScene)) assert.ok(n <= 12, `${scene} 장면이 ${n}문항`);
  assert.ok(Object.keys(perScene).length >= 6, "일곱 장면 중 대부분을 쓴다");
});

test("세부 항목 정의: 12개 모두 무엇이고 무엇이 아닌지 · 이웃 항목과의 차이 · 높은 쪽 · 낮은 쪽을 적었다", () => {
  assert.equal(FIRST_BUNDLE_SUB_IDS.length, 12);
  for (const id of FIRST_BUNDLE_SUB_IDS) {
    const d = DEEP_SUB_DEFS[id];
    assert.ok(d.name.length >= 2, `${id} 이름이 비어 있다`);
    for (const field of [d.means, d.notThis, d.vs, d.high, d.low]) assert.ok(field.length >= 6, `${id} 정의가 비어 있다`);
  }
  // 알아채는 것과 같이 느끼는 것은 서로를 이웃으로 적는다
  assert.match(DEEP_SUB_DEFS["D3-1"].vs, /D6-1/);
  assert.match(DEEP_SUB_DEFS["D6-1"].vs, /D3-1/);
  // 거절하기 어려워서 따름 · 설득돼서 접음은 점수에 넣지 않는다고 적었다
  assert.match(DEEP_SUB_DEFS["D6-3"].vs, /unscored|점수에 넣지 않는다/);
  assert.match(DEEP_SUB_DEFS["D6-4"].vs, /점수에 넣지 않는다/);
  // 기질 · 성격 · 가까운 관계를 합친 점수는 정의 어디에도 없다
  assert.ok(!JSON.stringify(DEEP_SUB_DEFS).includes("종합 점수"));
});

test("균형: 선택지가 한 글자 · 한 길이로 쏠리지 않고, 정답처럼 보이는 낱말 · 공식 검사 이름 · 단정 표현이 없다", () => {
  const top = { a: 0, b: 0, c: 0, d: 0 };
  const bottom = { a: 0, b: 0, c: 0, d: 0 };
  const high: number[] = [];
  const low: number[] = [];
  for (const item of DEEP_ITEMS) {
    const sc = scored(item);
    top[sc.reduce((a, b) => (w(b) > w(a) ? b : a)).id] += 1;
    bottom[sc.reduce((a, b) => (w(b) < w(a) ? b : a)).id] += 1;
    for (const o of sc) (w(o) > 0 ? high : low).push(o.text.length);
    const ws = sc.map(w);
    assert.notDeepEqual(ws, [...ws].sort((x, y) => x - y), `${item.id} 선택지가 낮음 → 높음 순서로 줄 서 있다`);
    assert.notDeepEqual(ws, [...ws].sort((x, y) => y - x), `${item.id} 선택지가 높음 → 낮음 순서로 줄 서 있다`);
  }
  for (const [k, v] of Object.entries(top)) assert.ok(v >= 6 && v <= 12, `가장 높은 쪽 선택지가 ${k}에 ${v}번 — 위치가 방향을 알려 준다`);
  for (const [k, v] of Object.entries(bottom)) assert.ok(v >= 6 && v <= 12, `가장 낮은 쪽 선택지가 ${k}에 ${v}번`);
  const mean = (xs: number[]) => xs.reduce((n, v) => n + v, 0) / xs.length;
  const ratio = mean(high) / mean(low);
  assert.ok(ratio > 0.85 && ratio < 1.18, `높은 쪽 평균 ${mean(high).toFixed(1)}자 · 낮은 쪽 ${mean(low).toFixed(1)}자 (비 ${ratio.toFixed(2)})`);
  const text = DEEP_ITEMS.map((i) => i.stem + " " + i.options.map((o) => o.text).join(" ")).join(" ");
  for (const word of ["성숙", "이기적", "착한", "올바른", "바람직", "훌륭", "정답", "MBTI", "TCI", "ECR", "애착검사", "성격검사", "기질 및 성격", "책임감 있", "배려심", "무책임", "예민", "소심", "쿨하게", "우울", "불안장애", "진단", "자기초월"]) assert.ok(!text.includes(word), `금지 표현 ${word}`);
  for (const word of ["항상", "절대", "무조건", "전혀", "완전히"]) assert.ok(!text.includes(word), `단정 표현 ${word}`);
  // 보이는 순서는 문항 번호로 정한 고정 순열이다 — 순열이 22개 있고 36문항은 그것을 겹쳐 쓴다
  assert.equal(PERM_COUNT, 22);
  assert.equal(new Set(DEEP_ITEMS.map((_, n) => permFor(n + 1))).size, 22);
});

test("채점: 기여값은 점수를 주는 선택지를 같은 확률로 고르는 사람이 0이 되게 맞추고, 점수 제외 답은 증거가 아니다", () => {
  for (const item of DEEP_ITEMS) {
    const sum = scored(item).reduce((n, o) => n + (deepContribution(item, o.id) ?? 0), 0);
    assert.ok(Math.abs(sum) < 1e-9, `${item.id} 점수를 주는 선택지의 기여값 합 ${sum}`);
    for (const o of scored(item)) {
      const c = deepContribution(item, o.id);
      assert.ok(c !== null && c >= -1 - 1e-9 && c <= 1 + 1e-9, `${item.id}${o.id} 기여값 ${c}`);
    }
  }
  const e22 = DEEP_ITEM_BY_ID.E22;
  const liked = e22.options.find((o) => o.unscored)!;
  assert.equal(liked.reason, "그 일이 좋아서");
  assert.equal(deepContribution(e22, liked.id), null, "좋아서 돕는 답은 거절 · 경계의 증거가 아니다");
  const e35 = DEEP_ITEM_BY_ID.E35;
  assert.equal(deepContribution(e35, e35.options.find((o) => o.unscored)!.id), null, "설득돼서 접은 답은 갈등에서 의견을 말함의 증거가 아니다");
  assert.equal(deepContribution(e22, "z" as never), null);
});

test("채점: 무작위 응답 5,000명의 평균은 모든 세부 항목에서 50 근처이다 (점수 제외 답이 없는 항목은 거의 모두 읽힌다)", () => {
  let seed = 424242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const sums = Object.fromEntries(FIRST_BUNDLE_SUB_IDS.map((s) => [s, 0])) as Record<FirstBundleSubId, number>;
  const okCount = Object.fromEntries(FIRST_BUNDLE_SUB_IDS.map((s) => [s, 0])) as Record<FirstBundleSubId, number>;
  const people = 5000;
  for (let r = 0; r < people; r++) {
    const answers: DeepAnswers = {};
    for (const item of DEEP_ITEMS) answers[item.id] = (["a", "b", "c", "d"] as const)[Math.floor(rnd() * 4)];
    const res = scoreDeep(answers);
    for (const s of FIRST_BUNDLE_SUB_IDS) {
      const v = res.subs[s];
      if (v.status === "ok") {
        sums[s] += v.score;
        okCount[s] += 1;
      }
    }
  }
  for (const s of FIRST_BUNDLE_SUB_IDS) {
    const hasUnscored = DEEP_ITEMS.some((i) => i.sub === s && i.options.some((o) => o.unscored));
    assert.ok(okCount[s] > people * (hasUnscored ? 0.4 : 0.99), `${s} 읽힌 사람 ${okCount[s]}`);
    assert.ok(Math.abs(sums[s] / okCount[s] - 50) < 4, `${s} 평균 ${(sums[s] / okCount[s]).toFixed(1)}`);
  }
});

test("채점: 한 방향으로 일관되게 답하면 뚜렷하게, 문항마다 방향이 갈리면 '뚜렷하지 않음'이며, 영역 · 전체로 합친 값은 만들지 않는다", () => {
  const pick = (sub: FirstBundleSubId, dir: 1 | -1): DeepAnswers => {
    const answers: DeepAnswers = Object.fromEntries(DEEP_ITEMS.map((i) => [i.id, "na" as const]));
    for (const item of DEEP_ITEMS) {
      if (item.sub !== sub) continue;
      answers[item.id] = [...scored(item)].sort((x, y) => (w(y) - w(x)) * dir)[0].id;
    }
    return answers;
  };
  for (const sub of FIRST_BUNDLE_SUB_IDS) {
    const hi = scoreDeep(pick(sub, 1)).subs[sub];
    assert.ok(hi.status === "ok" && hi.direction === "high" && hi.strength === "clear" && hi.score >= 80, `${sub} ${JSON.stringify(hi)}`);
    const lo = scoreDeep(pick(sub, -1)).subs[sub];
    assert.ok(lo.status === "ok" && lo.direction === "low" && lo.strength === "clear" && lo.score <= 20, `${sub} ${JSON.stringify(lo)}`);
  }
  // 문항마다 반대로 답함
  const sub: FirstBundleSubId = "D3-1";
  const mixed: DeepAnswers = Object.fromEntries(DEEP_ITEMS.map((i) => [i.id, "na" as const]));
  DEEP_ITEMS.filter((i) => i.sub === sub).forEach((item, n) => {
    mixed[item.id] = [...scored(item)].sort((x, y) => (w(y) - w(x)) * (n % 2 === 0 ? 1 : -1))[0].id;
  });
  const res = scoreDeep(mixed).subs[sub];
  assert.ok(res.status === "ok" && res.strength === "unclear" && res.direction === "unclear", JSON.stringify(res));
  assert.equal(UNCLEAR_TEXT, "현재 응답만으로 뚜렷하지 않음");
  assert.match(HOLD_TEXT, /보류/);
  // 결과는 세부 항목 12개뿐이다 — 영역 합계 · 총점 · 유형은 없다
  const out = scoreDeep(pick(sub, 1));
  assert.deepEqual(Object.keys(out.subs).sort(), [...FIRST_BUNDLE_SUB_IDS].sort());
  assert.deepEqual(Object.keys(out).sort(), ["answered", "skipped", "subs"]);
});

test("채점: '해당 없음'은 점수에 넣지 않고, 한 문항만 건너뛰어도 그 세부 항목은 판단을 보류한다 (억지로 분류하지 않는다)", () => {
  const allNa: DeepAnswers = Object.fromEntries(DEEP_ITEMS.map((i) => [i.id, "na" as const]));
  const none = scoreDeep(allNa);
  assert.equal(none.answered, 0);
  assert.equal(none.skipped, 36);
  for (const s of FIRST_BUNDLE_SUB_IDS) assert.equal(none.subs[s].status, "hold");
  const all: DeepAnswers = Object.fromEntries(DEEP_ITEMS.map((i) => [i.id, "b" as const]));
  const e01Sub = DEEP_ITEM_BY_ID.E01.sub as FirstBundleSubId;
  assert.equal(scoreDeep(all).subs[e01Sub].status, "ok");
  const skipOne = scoreDeep({ ...all, E01: "na" });
  assert.equal(skipOne.subs[e01Sub].status, "hold", `${MIN_INDICATORS}개뿐인 세부 항목은 한 문항만 건너뛰어도 보류`);
  assert.equal(skipOne.subs["D3-1"].status, "ok", "다른 세부 항목은 그대로 계산된다");
  assert.equal(skipOne.skipped, 1);
  // 점수 제외 답을 고르면 그 문항은 증거가 아니므로 2개만 남아 보류된다
  const liked = DEEP_ITEM_BY_ID.E22.options.find((o) => o.unscored)!.id;
  assert.equal(scoreDeep({ ...all, E22: liked }).subs["D6-3"].status, "hold");
});
