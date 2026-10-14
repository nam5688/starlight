// 실행: npm test — 성별(선택) 입력: 알려진 값만 받고, 이전 버전이 보관한 입력(성별 없음)도 그대로 받는다
import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_BASIC_INFO, GENDER_OPTIONS, genderOf, parseBasicInfo } from "./basic-info.ts";

const raw = { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true };

test("성별: 여성 · 남성 · 답하지 않음 세 가지이고, 답하지 않으면 계산에는 null로 넘긴다", () => {
  assert.deepEqual(GENDER_OPTIONS.map(([, label]) => label), ["여성", "남성", "답하지 않음"]);
  assert.equal(genderOf({ gender: "female" }), "female");
  assert.equal(genderOf({ gender: "male" }), "male");
  assert.equal(genderOf({ gender: "" }), null);
  assert.equal(genderOf({}), null);
});

test("성별: 서버는 알려진 값만 받는다 (이전 버전의 보관값 · 이상한 값은 답하지 않음)", () => {
  assert.equal(parseBasicInfo({ ...raw, gender: "female" })?.gender, "female");
  assert.equal(parseBasicInfo({ ...raw, gender: "male" })?.gender, "male");
  const { gender: _omit, ...legacy } = raw; // 성별 칸이 생기기 전에 만든 보관값(로그인 이동 중 쿠키 등)
  void _omit;
  const parsed = parseBasicInfo(legacy);
  assert.ok(parsed, "성별이 없어도 입력이 버려지지 않는다");
  assert.equal(parsed.gender, "");
  assert.equal(parseBasicInfo({ ...raw, gender: "other" })?.gender, "");
  assert.equal(parseBasicInfo({ ...raw, gender: 1 })?.gender, "");
});
