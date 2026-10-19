// 실행: npm test — 궁합 입력 임시 보관(새로고침 유지): 이 브라우저 탭(sessionStorage)에만 두는 값의 모양 · 1시간 만료 · 잘못된 값 거르기 · 빈 입력은 보관하지 않기.
// 서버로 보내지 않는 저장이므로 만료와 지우기 동작이 개인정보 안내("1시간, 탭을 닫거나 입력 지우기")와 어긋나지 않는지 본다.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMPAT_BUY_DRAFT_KEY,
  COMPAT_DRAFT_KEY,
  COMPAT_DRAFT_MAX_AGE_MS,
  hasBuyDraftContent,
  hasCompatDraftContent,
  parseBuyDraft,
  parseCompatDraft,
  serializeBuyDraft,
  serializeCompatDraft,
  type CompatBuyDraft,
  type CompatFormDraft,
} from "./draft.ts";
import { EMPTY_COMPAT_PERSON, type CompatPersonInput } from "./simple.ts";

const NOW = 1_800_000_000_000;
const p = (over: Partial<CompatPersonInput> = {}): CompatPersonInput => ({ ...EMPTY_COMPAT_PERSON, nickname: "슬기", gender: "female", birthYear: "1996", birthMonth: "3", birthDay: "29", birthTime: "09:30", ...over });
const full: CompatFormDraft = { a: p(), b: p({ nickname: "남수", gender: "male" }), relationship: "friend" };

test("보관 기간은 1시간이고 분석 입력(6시간)보다 짧다 · 키는 분석 입력과 겹치지 않는다", () => {
  assert.equal(COMPAT_DRAFT_MAX_AGE_MS, 3_600_000);
  assert.notEqual(COMPAT_DRAFT_KEY, COMPAT_BUY_DRAFT_KEY);
  assert.notEqual(COMPAT_DRAFT_KEY, "meu-analyze-draft");
});

test("저장했다가 읽으면 사이 · 성별 · 이름 · 생년월일 선택이 그대로 돌아온다(새로고침 뒤에도 선택이 유지된다)", () => {
  assert.deepEqual(parseCompatDraft(serializeCompatDraft(full, NOW), NOW + 5_000), full);
  const buy: CompatBuyDraft = { partner: p({ nickname: "남수", gender: "male" }), myGender: "female", relationship: "engaged" };
  assert.deepEqual(parseBuyDraft(serializeBuyDraft(buy, NOW), NOW + 5_000), buy);
});

test("1시간이 지났거나 미래에 저장된 것, 깨진 글, 버전이 다른 것은 버린다", () => {
  const raw = serializeCompatDraft(full, NOW);
  assert.ok(parseCompatDraft(raw, NOW + COMPAT_DRAFT_MAX_AGE_MS));
  assert.equal(parseCompatDraft(raw, NOW + COMPAT_DRAFT_MAX_AGE_MS + 1), null);
  assert.equal(parseCompatDraft(raw, NOW - 120_000), null, "저장 시각이 미래");
  for (const bad of [null, "", "{", "[]", "null", JSON.stringify({ v: 2, savedAt: NOW, data: full }), JSON.stringify({ v: 1, savedAt: "x", data: full }), JSON.stringify({ v: 1, savedAt: NOW })]) assert.equal(parseCompatDraft(bad, NOW), null, String(bad));
});

test("잘못된 값은 특정 값으로 바꾸지 않고 비운다 — 알 수 없는 사이 · 성별은 선택 전 상태, 깨진 사람은 빈 입력", () => {
  const raw = JSON.stringify({ v: 1, savedAt: NOW, data: { a: { ...p(), gender: "other" }, b: p({ nickname: "남수", gender: "male" }), relationship: "boyfriend" } });
  const read = parseCompatDraft(raw, NOW)!;
  assert.deepEqual(read.a, EMPTY_COMPAT_PERSON, "성별이 정해진 두 값이 아니면 그 사람 입력은 빈 상태");
  assert.equal(read.b.gender, "male");
  assert.equal(read.relationship, "", "알 수 없는 사이는 고르기 전 상태");
  const buy = parseBuyDraft(JSON.stringify({ v: 1, savedAt: NOW, data: { partner: p(), myGender: "남자", relationship: "friend" } }), NOW)!;
  assert.equal(buy.myGender, "");
  assert.equal(buy.relationship, "friend");
});

test("빈 입력은 보관하지 않는다 — 입력한 것이 있을 때만 저장 대상이다", () => {
  const empty: CompatFormDraft = { a: { ...EMPTY_COMPAT_PERSON }, b: { ...EMPTY_COMPAT_PERSON }, relationship: "" };
  assert.equal(hasCompatDraftContent(empty), false);
  assert.equal(parseCompatDraft(serializeCompatDraft(empty, NOW), NOW), null);
  assert.equal(hasCompatDraftContent({ ...empty, relationship: "some" }), true, "사이만 골라도 보관 대상");
  assert.equal(hasCompatDraftContent({ ...empty, a: p({ gender: "male", nickname: "", birthYear: "", birthMonth: "", birthDay: "", birthTime: "" }) }), true, "성별만 골라도 보관 대상");
  assert.equal(hasBuyDraftContent({ partner: { ...EMPTY_COMPAT_PERSON }, myGender: "", relationship: "" }), false);
  assert.equal(hasBuyDraftContent({ partner: { ...EMPTY_COMPAT_PERSON }, myGender: "male", relationship: "" }), true);
});
