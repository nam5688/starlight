// 실행: npm test — 성별(필수): 여성 · 남성 두 가지만 있고 고르지 않으면 저장할 수 없다. 이전 버전이 보관한 입력(성별 없음)은 버려지지 않고 다시 고르게 한다
import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_BASIC_INFO, GENDER_OPTIONS, genderOf, hasRequiredBasicInfo, parseBasicInfo, validateBasicInfo } from "./basic-info.ts";

const TODAY = new Date("2026-10-11T00:00:00Z");
const raw = { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true };

test("성별: 여성 · 남성 두 가지뿐이고 ‘답하지 않음’ 선택지는 없다", () => {
  assert.deepEqual(GENDER_OPTIONS.map(([, label]) => label), ["여성", "남성"]);
  assert.deepEqual(GENDER_OPTIONS.map(([value]) => value), ["female", "male"]);
  assert.equal(genderOf({ gender: "female" }), "female");
  assert.equal(genderOf({ gender: "male" }), "male");
  assert.equal(genderOf({ gender: "" }), null);
  assert.equal(genderOf({}), null);
});

test("성별: 고르지 않으면 오류가 나고 진행률에서도 빠진 항목이다", () => {
  assert.equal(validateBasicInfo({ ...raw, gender: "" }, TODAY).gender, "성별을 선택해 주세요.");
  assert.equal(validateBasicInfo({ ...raw }, TODAY).gender, "성별을 선택해 주세요.");
  assert.equal(validateBasicInfo({ ...raw, gender: "female" }, TODAY).gender, undefined);
  assert.equal(validateBasicInfo({ ...raw, gender: "male" }, TODAY).gender, undefined);
  assert.equal(hasRequiredBasicInfo({ ...raw, gender: "" }), false);
  assert.equal(hasRequiredBasicInfo({ ...raw, gender: "male" }), true);
  assert.deepEqual(Object.values(validateBasicInfo({ ...raw, gender: "female" }, TODAY)), []);
});

test("성별: 서버는 알려진 값만 받고, 이전 버전의 보관값(성별 없음)은 버리지 않되 고르지 않은 상태로 받는다", () => {
  assert.equal(parseBasicInfo({ ...raw, gender: "female" })?.gender, "female");
  assert.equal(parseBasicInfo({ ...raw, gender: "male" })?.gender, "male");
  const { gender: _omit, ...legacy } = raw;
  void _omit;
  const parsed = parseBasicInfo(legacy);
  assert.ok(parsed, "성별이 없어도 입력이 버려지지 않는다");
  assert.equal(parsed.gender, "");
  assert.ok(validateBasicInfo(parsed, TODAY).gender, "하지만 저장하려면 다시 골라야 한다");
  assert.equal(parseBasicInfo({ ...raw, gender: "other" })?.gender, "");
  assert.equal(parseBasicInfo({ ...raw, gender: 1 })?.gender, "");
});
