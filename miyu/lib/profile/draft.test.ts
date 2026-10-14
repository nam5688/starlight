// 실행: npm test — 입력 임시 보관: 형식이 맞는 것만 복원하고, 오래되거나 이상한 값은 버린다
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { EMPTY_BASIC_INFO } from "./basic-info.ts";
import { DRAFT_MAX_AGE_MS, hasContent, parseDraft, serializeDraft } from "./draft.ts";

const NOW = 1_800_000_000_000;
const info = { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12" };
const firstItem = ASSESSMENT_MODULES[0].items[0].id;

test("저장한 값을 그대로 복원한다 (단계는 허용 범위로 맞춘다)", () => {
  const raw = serializeDraft({ step: 2, info, answers: { [firstItem]: 4 } }, NOW);
  const d = parseDraft(raw, NOW + 1000, 3);
  assert.ok(d);
  assert.equal(d.info.nickname, "지민");
  assert.equal(d.answers[firstItem], 4);
  assert.equal(d.step, 2);
  assert.equal(parseDraft(raw, NOW + 1000, 1)?.step, 1, "요약 단계는 복원하지 않고 마지막 검사 단계로");
});

test("성별: 임시 보관에서 알려진 값만 복원하고, 성별 칸이 없던 이전 보관값은 답하지 않음으로 복원한다", () => {
  const withGender = parseDraft(serializeDraft({ step: 1, info: { ...info, gender: "male" }, answers: {} }, NOW), NOW, 3);
  assert.equal(withGender?.info.gender, "male");
  const odd = parseDraft(JSON.stringify({ v: 1, savedAt: NOW, step: 1, answers: {}, info: { ...info, gender: "아무거나" } }), NOW, 3);
  assert.equal(odd?.info.gender, "");
  const { gender: _g, ...legacyInfo } = info;
  void _g;
  const legacy = parseDraft(JSON.stringify({ v: 1, savedAt: NOW, step: 1, answers: {}, info: legacyInfo }), NOW, 3);
  assert.equal(legacy?.info.gender, "");
  assert.equal(hasContent({ ...EMPTY_BASIC_INFO, gender: "female" }, {}), true, "성별만 골라도 입력한 것으로 본다");
});

test("빈 입력 · 오래된 것 · 깨진 것 · 다른 버전은 버린다", () => {
  assert.equal(hasContent(EMPTY_BASIC_INFO, {}), false);
  assert.equal(parseDraft(serializeDraft({ step: 0, info: EMPTY_BASIC_INFO, answers: {} }, NOW), NOW, 3), null);
  const raw = serializeDraft({ step: 1, info, answers: {} }, NOW);
  assert.equal(parseDraft(raw, NOW + DRAFT_MAX_AGE_MS + 1, 3), null, "6시간이 지남");
  assert.equal(parseDraft("{깨진", NOW, 3), null);
  assert.equal(parseDraft(null, NOW, 3), null);
  assert.equal(parseDraft(JSON.stringify({ v: 99, savedAt: NOW, info, answers: {}, step: 0 }), NOW, 3), null);
  assert.equal(parseDraft(JSON.stringify({ v: 1, savedAt: NOW + 3_600_000, info, answers: {}, step: 0 }), NOW, 3), null, "미래 시각");
});

test("이상한 값은 걸러낸다: 모르는 문항 · 범위 밖 응답 · 종류가 다른 입력", () => {
  const raw = JSON.stringify({ v: 1, savedAt: NOW, step: 1, info: { ...info, nickname: 12345, birthYear: "1995", extra: "x" }, answers: { [firstItem]: 9, hack: 3, [ASSESSMENT_MODULES[0].items[1].id]: 2.5 } });
  const d = parseDraft(raw, NOW, 3);
  assert.ok(d);
  assert.equal(d.info.nickname, "", "문자열이 아닌 닉네임은 버린다");
  assert.equal(d.info.birthYear, "1995");
  assert.equal("extra" in d.info, false);
  assert.deepEqual(d.answers, {});
});
