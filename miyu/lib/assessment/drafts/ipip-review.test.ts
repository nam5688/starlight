// 실행: npm test — IPIP 개념 비교와 0.3 수정안이 0.2와 같은 구조 · 균형 규칙을 지키고, 0.2 원본을 바꾸지 않았는지 확인한다.
// 이 검사는 문항 구조만 본다. 수정안이 더 정확하다는 증거가 아니며(시범 응답 전), IPIP 비교는 사람의 개념 판단이다.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLOSENESS_LABEL,
  IPIP_FACETS,
  IPIP_REFERENCE,
  ITEM_FINDINGS,
  PERSPECTIVE_COMPARISON,
  PROPOSAL_VERSION,
  PROPOSED_ITEMS,
  READING_LIMITS,
  applyProposals,
} from "./ipip-review.ts";
import { DRAFT_CONTENT_VERSION, DRAFT_ITEMS, PERSPECTIVES, PERSPECTIVE_IDS, coverageOf, scoreItems, type DraftAnswers, type DraftItem } from "./situational-draft.ts";

const scored = (i: DraftItem) => i.options.filter((o) => !o.unscored);
const proposed = applyProposals(DRAFT_ITEMS);

test("개념 비교: 13개 관점 모두 가까운 정도와 이유를 적었고, 인용한 IPIP 하위 영역은 논문에 있는 30개 이름이다", () => {
  assert.equal(Object.keys(IPIP_FACETS).length, 30);
  assert.deepEqual(Object.keys(PERSPECTIVE_COMPARISON).sort(), [...PERSPECTIVE_IDS].sort());
  for (const [id, c] of Object.entries(PERSPECTIVE_COMPARISON)) {
    assert.ok(c.note.length >= 30, `${id} 설명`);
    assert.ok(c.closeness in CLOSENESS_LABEL);
    for (const f of c.nearest) assert.ok(f in IPIP_FACETS, `${id}: 없는 하위 영역 ${f}`);
    assert.equal(c.nearest.length === 0, c.closeness === "none", `${id}: 대응이 없으면 가까운 하위 영역도 없다`);
  }
  assert.match(IPIP_REFERENCE.citation, /10\.1016\/j\.jrp\.2014\.05\.003/);
  assert.match(IPIP_REFERENCE.terms, /직접 확인하지 못했다/, "원문을 열지 못한 사실을 숨기지 않는다");
});

test("문항 점검: 모든 항목이 실제 문항과 주 관점이 맞고, 바꾸자고 한 문항(replace)은 수정안이 있으며 수정안은 점검에 없는 문항을 건드리지 않는다", () => {
  const byId = new Map(DRAFT_ITEMS.map((i) => [i.id, i]));
  for (const f of ITEM_FINDINGS) {
    const item = byId.get(f.itemId);
    assert.ok(item, `없는 문항 ${f.itemId}`);
    assert.equal(item.primary, f.primary, `${f.itemId} 주 관점`);
    for (const n of f.nearest) assert.ok(n in IPIP_FACETS, `${f.itemId}: ${n}`);
    assert.ok(f.issue.length >= 25 && f.risk.length >= 15, `${f.itemId} 설명`);
  }
  const proposedIds = new Set(PROPOSED_ITEMS.map((p) => p.id));
  for (const f of ITEM_FINDINGS) if (f.action === "replace" || f.action === "wording") assert.ok(proposedIds.has(f.itemId), `${f.itemId} 수정안이 없다`);
  for (const id of proposedIds) assert.ok(ITEM_FINDINGS.some((f) => f.itemId === id && (f.action === "replace" || f.action === "wording")), `${id}: 점검에 없는 문항을 고쳤다`);
});

test("수정안 0.3: 0.2와 같은 구조 규칙을 지킨다 — 문항 30개, 주 관점은 그대로, 선택지 4개, 점수는 주 관점 하나에만, 점수 주는 선택지 3개 이상, 높은 쪽과 낮은 쪽이 모두 있다", () => {
  assert.equal(proposed.length, 30);
  assert.deepEqual(proposed.map((i) => i.id), DRAFT_ITEMS.map((i) => i.id));
  assert.match(PROPOSAL_VERSION, /0\.3-proposal/);
  assert.notEqual(DRAFT_CONTENT_VERSION, PROPOSAL_VERSION, "0.2와 버전을 구분한다");
  for (const [n, item] of proposed.entries()) {
    assert.equal(item.primary, DRAFT_ITEMS[n].primary, `${item.id} 주 관점은 바꾸지 않는다`);
    assert.equal(PERSPECTIVES[item.primary].domain, item.domain, `${item.id} 영역`);
    assert.deepEqual(item.options.map((o) => o.id), ["a", "b", "c", "d"]);
    assert.ok(item.stem.length >= 20 && item.stem.endsWith("?"), `${item.id} 질문 형식`);
    for (const o of item.options) {
      assert.ok(o.text.length >= 10 && o.text.length <= 70, `${item.id}${o.id} 길이 ${o.text.length}`);
      if (!o.unscored) assert.deepEqual(Object.keys(o.w), [item.primary], `${item.id}${o.id}`);
    }
    assert.ok(scored(item).length >= 3);
    const ws = scored(item).map((o) => o.w[item.primary] as number);
    assert.ok(Math.max(...ws) > 0 && Math.min(...ws) < 0, `${item.id} 방향`);
  }
  assert.equal(new Set(proposed.map((i) => i.stem)).size, 30);
  assert.equal(new Set(proposed.map((i) => i.topic)).size, 30);
});

test("수정안 0.3: 선택지 위치로 방향을 짐작할 수 없고(가장 높은 · 낮은 쪽이 한 글자에 5~10번), 순서대로 줄 서 있지 않으며, 단정 표현 · 정답 낱말이 없고, 같은 관점 문항은 서로 다른 장면이다", () => {
  const top = { a: 0, b: 0, c: 0, d: 0 };
  const bottom = { a: 0, b: 0, c: 0, d: 0 };
  for (const item of proposed) {
    const sc = scored(item);
    const w = (o: DraftItem["options"][number]) => o.w[item.primary] ?? 0;
    top[sc.reduce((a, b) => (w(b) > w(a) ? b : a)).id]++;
    bottom[sc.reduce((a, b) => (w(b) < w(a) ? b : a)).id]++;
    const ws = sc.map(w);
    assert.notDeepEqual(ws, [...ws].sort((x, y) => x - y), `${item.id} 낮음 → 높음 순서`);
    assert.notDeepEqual(ws, [...ws].sort((x, y) => y - x), `${item.id} 높음 → 낮음 순서`);
  }
  for (const [k, v] of Object.entries(top)) assert.ok(v >= 5 && v <= 10, `가장 높은 쪽이 ${k}에 ${v}번`);
  for (const [k, v] of Object.entries(bottom)) assert.ok(v >= 5 && v <= 10, `가장 낮은 쪽이 ${k}에 ${v}번`);
  const text = proposed.map((i) => i.stem + i.options.map((o) => o.text).join(" ")).join(" ");
  for (const word of ["항상", "절대", "무조건", "전혀", "완전히", "성숙", "이기적", "착한", "올바른", "바람직", "훌륭", "정답", "MBTI", "TCI", "ECR", "애착검사", "성격검사"]) assert.ok(!text.includes(word), `금지 낱말 ${word}`);
  for (const p of PERSPECTIVE_IDS) {
    const scenes = proposed.filter((i) => i.primary === p).map((i) => i.scene);
    if (scenes.length >= 2) assert.equal(new Set(scenes).size, scenes.length, `${p} 같은 장면 반복: ${scenes.join("·")}`);
  }
  const len = (xs: number[]) => xs.reduce((n, v) => n + v, 0) / xs.length;
  const hi: number[] = [];
  const lo: number[] = [];
  for (const item of proposed) for (const o of scored(item)) ((o.w[item.primary] ?? 0) > 0 ? hi : lo).push(o.text.length);
  const ratio = len(hi) / len(lo);
  assert.ok(ratio > 0.85 && ratio < 1.18, `높은 쪽 선택지가 길다 (비 ${ratio.toFixed(2)})`);
});

test("수정안 0.3: 0.2 원본은 그대로이고, 읽을 수 있는 관점은 0.2와 같으며(수정으로 문항 수를 늘리거나 줄이지 않았다), 채점이 같은 규칙으로 돈다", () => {
  assert.equal(DRAFT_ITEMS.find((i) => i.id === "Q15")!.options[0].text.includes("정해도 어차피 바뀌니"), true, "0.2 Q15 원본");
  assert.deepEqual(coverageOf(proposed).readable, coverageOf(DRAFT_ITEMS).readable);
  const answers = Object.fromEntries(proposed.map((i) => [i.id, "b"])) as DraftAnswers;
  const r = scoreItems(proposed, answers);
  assert.equal(Object.keys(r.perspectives).length, 13);
  assert.equal(r.answered, 30);
});

test("읽는 범위: 읽을 수 있는 다섯 관점마다 쓸 수 있는 말과 쓰지 않는 말이 있고, 진단 · 정확도 표현이 없다", () => {
  assert.deepEqual(Object.keys(READING_LIMITS).sort(), coverageOf(DRAFT_ITEMS).readable.sort());
  for (const [id, l] of Object.entries(READING_LIMITS)) {
    assert.ok(l.may.length >= 20 && l.mayNot.length >= 15, id);
    assert.match(l.may, /응답 경향/, `${id}: 쓸 수 있는 말은 응답 경향까지`);
    assert.doesNotMatch(l.may, /정확|신뢰도|진단|유형이다/);
  }
});
