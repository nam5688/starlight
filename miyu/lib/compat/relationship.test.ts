// 실행: npm test — 궁합의 "무슨 사이인가요?"(여섯 값)와 성별(남자 · 여자): 표시 문구 · 순서가 지시한 그대로인지, 엄격한 값 검사(빈 값 · 잘못된 값), 무료 간단 궁합이 사이마다 실제로 다른 풀이를 내는지,
// 사이를 고르거나 성별 조합이 달라도 점수 · 유형 · 근거가 바뀌지 않는지, 친구 · 기타에 연애 · 배우자 · 결혼 말이 없고 썸에 상대 마음 확정이 없고 결혼 사이에 앞날 보장이 없는지를 확인한다.
// 비용 0 — 결정론적 문구와 엔진 계산만 쓴다(실제 AI · 결제 · DB 없음). 실제 AI 글의 품질은 이 시험으로 알 수 없다.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMPAT_GENDERS,
  COMPAT_RELATIONSHIPS,
  GENDER_LABEL,
  MARRIAGE_FUTURE,
  NAME_PLACEHOLDER,
  OTHER_KIND,
  RELATIONSHIP_LABEL,
  RELATIONSHIP_QUESTION,
  ROMANCE_TALK,
  SOME_CERTAIN,
  headingOf,
  isCompatGender,
  myGenderError,
  neutralWording,
  parseRelationship,
  relationFrameOf,
  relationshipIssues,
  showsCoupleType,
  type CompatGender,
  type CompatRelationship,
} from "./relationship.ts";
import { SCORE_BASIS_LIFE } from "./life-voice.ts";
import { computeSimpleCompat, EMPTY_COMPAT_PERSON, parseCompatPerson, shareTextOf, validateCompatPerson, type CompatPersonInput, type SimpleCompatCard } from "./simple.ts";

const TODAY = new Date("2026-10-19T12:00:00+09:00");
const person = (over: Partial<CompatPersonInput> = {}): CompatPersonInput => ({ ...EMPTY_COMPAT_PERSON, nickname: "슬기", gender: "female", birthYear: "1996", birthMonth: "3", birthDay: "29", birthTime: "09:30", ...over });
const partner = (over: Partial<CompatPersonInput> = {}): CompatPersonInput => person({ nickname: "남수", gender: "male", birthYear: "1994", birthMonth: "11", birthDay: "2", ...over });
const cardOf = (rel: CompatRelationship, a: Partial<CompatPersonInput> = {}, b: Partial<CompatPersonInput> = {}): SimpleCompatCard => {
  const out = computeSimpleCompat(person(a), partner(b), TODAY, rel);
  assert.ok(out.ok, JSON.stringify(out));
  return out.ok ? out.card : (null as never);
};
/** 화면에 보이는 글 전부(제목 · 풀이 · 읽힌 점 · 계산 설명) */
const textOf = (c: SimpleCompatCard) => JSON.stringify(c.relation) + c.good.join(" ") + c.care.join(" ") + c.basis.map((b) => b.label).join(" ") + JSON.stringify(c.notes) + c.cautions.join(" ") + c.explain.join(" ");

test("지시한 표시 문구 · 순서 그대로다 — 질문, 이름 안내, 여섯 사이, 남자 · 여자", () => {
  assert.equal(RELATIONSHIP_QUESTION, "무슨 사이인가요?");
  assert.deepEqual([...COMPAT_RELATIONSHIPS].map((r) => RELATIONSHIP_LABEL[r]), ["연인", "결혼준비중", "썸타는중", "결혼함", "친구", "기타"]);
  assert.equal(NAME_PLACEHOLDER.self, "본인의 이름을 적어주세요");
  assert.equal(NAME_PLACEHOLDER.partner, "상대의 이름을 적어주세요");
  assert.deepEqual([...COMPAT_GENDERS].map((g) => GENDER_LABEL[g]), ["남자", "여자"]);
});

test("값 검사는 엄격하다 — 빈 값 · 잘못된 값 · 표시 문구는 사이로 받지 않고 대신 채우지도 않는다", () => {
  for (const r of COMPAT_RELATIONSHIPS) assert.equal(parseRelationship(r), r);
  for (const bad of ["", " lover", "LOVER", "연인", "friends", null, undefined, 3, {}, ["lover"]]) assert.equal(parseRelationship(bad), null, String(bad));
  assert.ok(isCompatGender("male") && isCompatGender("female"));
  for (const bad of ["", "남자", "M", "other", null, undefined, 1]) assert.equal(isCompatGender(bad), false, String(bad));
});

test("무료 간단 궁합 입력 검사: 사이를 고르지 않으면 카드를 만들지 않고 이유를 알려 준다 · 알 수 없는 사이는 형식 오류 · 성별을 고르지 않은 사람은 이유와 함께 막는다", () => {
  const none = computeSimpleCompat(person(), partner(), TODAY);
  assert.ok(!none.ok && none.relationship === "무슨 사이인지 선택해 주세요.");
  const empty = computeSimpleCompat(person(), partner(), TODAY, "");
  assert.ok(!empty.ok && empty.relationship);
  const bad = computeSimpleCompat(person(), partner(), TODAY, "boyfriend");
  assert.ok(!bad.ok && bad.message === "입력 형식이 올바르지 않아요." && !bad.relationship);
  const noGender = computeSimpleCompat(person({ gender: "" }), partner({ gender: "" }), TODAY, "lover");
  assert.ok(!noGender.ok && noGender.errors.a.gender === "성별을 선택해 주세요." && noGender.errors.b.gender === "성별을 선택해 주세요.");
  // 한 사람만 고르지 않아도 막힌다 — 이름(슬기 · 남수)으로 짐작해 채우지 않는다
  const onlyB = computeSimpleCompat(person(), partner({ gender: "" }), TODAY, "lover");
  assert.ok(!onlyB.ok && !onlyB.errors.a.gender && onlyB.errors.b.gender);
  // 성별 키가 아예 없는 예전 형식의 입력도 "고르지 않음"으로 읽고 아무 성별로 채우지 않는다
  const { gender: _drop, ...legacy } = person();
  void _drop;
  const old = computeSimpleCompat(legacy, partner(), TODAY, "lover");
  assert.ok(!old.ok && old.errors.a.gender);
  // 정해진 두 값이 아닌 성별은 형식 오류
  assert.equal(parseCompatPerson({ ...person(), gender: "other" }), null);
  assert.equal(parseCompatPerson({ ...person(), gender: 1 }), null);
  assert.equal(validateCompatPerson(person({ gender: "" }), TODAY).gender, "성별을 선택해 주세요.");
});

test("같은 두 사람이라면 사이 · 성별 조합이 달라도 점수 · 유형 · 근거 방향이 같다 — 사이는 관점만 바꾼다(여섯 사이 × 성별 네 조합)", () => {
  const combos: [CompatGender, CompatGender][] = [["female", "male"], ["male", "female"], ["female", "female"], ["male", "male"]];
  const ref = cardOf("lover");
  for (const rel of COMPAT_RELATIONSHIPS) {
    const first = cardOf(rel, { gender: "female" }, { gender: "male" });
    for (const [ga, gb] of combos) {
      const c = cardOf(rel, { gender: ga }, { gender: gb });
      // 성별 조합은 카드의 어떤 글자도 바꾸지 않는다(동성 조합 포함)
      assert.deepEqual(c, first, `${rel} ${ga}/${gb}`);
    }
    assert.equal(first.score, ref.score, rel);
    assert.equal(first.typeName, ref.typeName, rel);
    assert.equal(first.core, ref.core, rel);
    assert.deepEqual(first.explain, ref.explain, rel);
    assert.deepEqual(first.basis.map((b) => b.direction), ref.basis.map((b) => b.direction), rel);
    assert.equal(first.relation?.id, rel);
    assert.equal(first.relation?.label, RELATIONSHIP_LABEL[rel]);
  }
});

test("여섯 사이는 실제로 서로 다른 풀이를 낸다 — 잘 맞는 부분 · 부딪히기 쉬운 부분 · 서로 이해할 점 · 지금 해 볼 행동이 모두 사이마다 다르다", () => {
  const frames = COMPAT_RELATIONSHIPS.map((r) => cardOf(r).relation!.frame);
  for (const key of ["title", "lens", "fit", "friction", "understand"] as const) assert.equal(new Set(frames.map((f) => f[key])).size, 6, key);
  assert.equal(new Set(frames.map((f) => f.doNow.join("|"))).size, 6, "행동도 사이마다 다르다");
  for (const f of frames) assert.ok(f.doNow.length >= 2 && f.doNow.every((t) => t.trim().length > 10), f.id);
  // 사이마다 지시한 중심 내용을 말한다
  const lens = Object.fromEntries(frames.map((f) => [f.id, f.lens])) as Record<CompatRelationship, string>;
  assert.match(lens.lover, /대화/);
  assert.match(lens.lover, /서운함|갈등/);
  for (const w of ["생활", "시간", "돈", "역할", "합의"]) assert.ok(lens.engaged.includes(w), `결혼준비중: ${w}`);
  for (const w of ["속도", "경계", "대화"]) assert.ok(lens.some.includes(w), `썸타는중: ${w}`);
  assert.match(lens.some, /마음이 어떤지는 사주로 알 수 없/);
  for (const w of ["일상", "회복"]) assert.ok(lens.married.includes(w), `결혼함: ${w}`);
  for (const w of ["거리감", "협력"]) assert.ok(lens.friend.includes(w), `친구: ${w}`);
  assert.match(lens.other, /짐작해서 풀이하지 않았/);
});

test("같은 사이라도 사주에서 읽힌 신호(끌림 · 부딪힘 · 속도)에 따라 풀이가 달라진다 — 사이 선택이 장식이 아니고 엔진 결과를 읽는다", () => {
  for (const rel of COMPAT_RELATIONSHIPS) {
    const fit = new Set([0, 1, 2].map((pull) => relationFrameOf(rel, { pull: pull as 0 | 1 | 2, friction: 0, pace: "even" }).fit));
    const friction = new Set([0, 1, 2].map((f) => relationFrameOf(rel, { pull: 1, friction: f as 0 | 1 | 2, pace: "even" }).friction));
    const understand = new Set((["go-go", "careful-careful", "mixed", "even"] as const).map((pace) => relationFrameOf(rel, { pull: 1, friction: 0, pace }).understand));
    const doNow = new Set([0, 1].map((f) => relationFrameOf(rel, { pull: 1, friction: f as 0 | 1 | 2, pace: "even" }).doNow.join("|")));
    assert.equal(fit.size, 3, `${rel} 끌림`);
    assert.equal(friction.size, 3, `${rel} 부딪힘`);
    assert.equal(understand.size, 4, `${rel} 속도`);
    assert.equal(doNow.size, 2, `${rel} 행동`);
  }
});

test("고정 풀이 문구 전체(사이 6 × 끌림 3 × 부딪힘 3 × 속도 4)에 사이에 맞지 않는 말이 없다 — 친구 · 기타에 연애 · 배우자 · 결혼, 썸에 마음 확정, 결혼 사이에 앞날 보장, 기타에 구체 관계 이름", () => {
  const paces = ["go-go", "careful-careful", "mixed", "even"] as const;
  for (const rel of COMPAT_RELATIONSHIPS) {
    for (const pull of [0, 1, 2] as const) {
      for (const friction of [0, 1, 2] as const) {
        for (const pace of paces) {
          const f = relationFrameOf(rel, { pull, friction, pace });
          const all = [f.title, f.lens, f.fit, f.friction, f.understand, ...f.doNow, f.note].join("\n");
          if (rel === "friend" || rel === "other") assert.doesNotMatch(all, ROMANCE_TALK, `${rel}: ${ROMANCE_TALK.exec(all)?.[0]}`);
          if (rel === "some") {
            assert.doesNotMatch(all, SOME_CERTAIN, `${rel}: ${SOME_CERTAIN.exec(all)?.[0]}`);
            assert.doesNotMatch(all, /결혼|배우자|부부|연인 사이/);
          }
          if (rel === "engaged" || rel === "married") assert.doesNotMatch(all, MARRIAGE_FUTURE, `${rel}: ${MARRIAGE_FUTURE.exec(all)?.[0]}`);
          if (rel === "other") assert.doesNotMatch(all, OTHER_KIND, `${rel}: ${OTHER_KIND.exec(all)?.[0]}`);
          // 근거 없는 사건 · 상대의 감정 · 재정 상황을 사실처럼 쓰지 않는다
          assert.doesNotMatch(all, /다퉜|싸웠|헤어졌|이별했|사귀고\s*있|월급|연봉|빚|대출|저축 액|통장/, `${rel}`);
          assert.doesNotMatch(all, /(?:상대|그 사람)(?:은|는|이)\s*(?:당신|나|널)\s*(?:을|를)?\s*(?:좋아|사랑)/, `${rel}`);
        }
      }
    }
  }
});

test("친구 · 기타 · 썸에는 커플 유형 이름을 보이지 않고 그 사이의 제목을 쓴다 — 연인 · 결혼준비중 · 결혼함은 커플 유형 그대로(내부 유형 · 점수는 보존)", () => {
  for (const rel of COMPAT_RELATIONSHIPS) {
    const c = cardOf(rel);
    const expectType = rel === "lover" || rel === "engaged" || rel === "married";
    assert.equal(showsCoupleType(rel), expectType, rel);
    assert.equal(c.relation!.showType, expectType, rel);
    assert.equal(c.relation!.heading, expectType ? c.typeName : relationFrameOf(rel, { pull: 0, friction: 0, pace: "even" }).title, rel);
    assert.equal(headingOf(rel, c.typeName), c.relation!.heading);
    if (!expectType) {
      assert.ok(!c.relation!.heading.includes("커플"), `${rel} 제목에 커플이 없다`);
      assert.doesNotMatch(textOf(c), /커플/, `${rel} 표시 글에 커플이 없다`);
      assert.doesNotMatch(shareTextOf(c), /커플/, `${rel} 공유 글에 커플이 없다`);
    } else {
      assert.ok(shareTextOf(c).includes(c.typeName));
    }
  }
  // 이 기능 이전의 카드(relation 없음)와 사이를 모르는 값(null)은 예전 그대로 유형을 보인다
  assert.equal(showsCoupleType(null), true);
  assert.equal(showsCoupleType(undefined), true);
  assert.equal(neutralWording("배우자 자리끼리 서로 끌어당기는 관계로 읽혀요", null), "배우자 자리끼리 서로 끌어당기는 관계로 읽혀요");
});

test("화면 문구는 모든 사이에서 생활 말이다 — 엔진의 \"배우자 자리\" 같은 말이 카드에 나오지 않고, 점수 · 읽힌 점의 개수 · 계산 재료는 사이와 상관없이 같다", () => {
  // 일지끼리 합 · 충이 읽히는 쌍을 찾는다 — 엔진은 "배우자 자리끼리 ~" 문장을 내보내지만(compat.ts, 변경 없음) 카드에는 생활 말로만 나온다
  let found: { a: Partial<CompatPersonInput>; b: Partial<CompatPersonInput> } | null = null;
  outer: for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 28; d += 3) {
      const a = { birthMonth: String(m), birthDay: String(d) };
      const lover = computeSimpleCompat(person(a), partner(), TODAY, "lover");
      if (lover.ok && lover.card.basis.some((b) => /일지/.test(b.label))) {
        found = { a, b: {} };
        break outer;
      }
    }
  }
  assert.ok(found, "시험할 쌍을 찾지 못했다");
  const lover = cardOf("lover", found.a);
  for (const rel of COMPAT_RELATIONSHIPS) {
    const c = cardOf(rel, found.a);
    assert.doesNotMatch(textOf(c), /배우자/, rel);
    assert.equal(c.score, lover.score, rel);
    assert.equal(c.good.length, lover.good.length, rel);
    assert.equal(c.care.length, lover.care.length, rel);
    assert.deepEqual(c.basis, lover.basis, `${rel}: 계산 재료는 사이로 바뀌지 않는다`);
  }
  assert.ok(lover.basis.some((b) => b.label === "가까운 사이에서 대하는 방식 (일지)"), "계산 재료는 쉬운 말이 앞이고 전통 이름은 괄호로 남는다");
});

test("\"이 지수는 이렇게 계산했어요\" 설명은 모든 사이에서 같은 생활 말이다 — 재료의 이름과 방향은 숨기지 않는다", () => {
  for (const rel of COMPAT_RELATIONSHIPS) {
    const c = cardOf(rel);
    assert.equal(c.notes.scoreBasis, SCORE_BASIS_LIFE, rel);
    assert.doesNotMatch(textOf(c), /배우자/, rel);
  }
});

test("글 검사(relationshipIssues): 사이마다 지시한 금지 표현만 막고 사이에 맞는 말은 막지 않는다 · 사이가 없으면 예전처럼 아무것도 걸지 않는다", () => {
  const at = (text: string, rel: CompatRelationship | null) => relationshipIssues([{ where: "x", text }], rel).length;
  // 친구 · 기타: 연애 · 배우자 · 결혼
  assert.equal(at("두 분은 오래 가까이 지내는 친구로서 약속을 잡는 방식이 달라서 서로 확인이 필요해요.", "friend"), 0);
  assert.equal(at("두 분은 연애하듯 서로를 챙겨 줄 때 편해져요.", "friend"), 1);
  assert.equal(at("결혼 생활에서 생활 습관이 맞는지 보면 좋아요.", "friend"), 1);
  assert.equal(at("일지는 배우자 자리를 보는 곳이라 두 분이 편해져요.", "other"), 1);
  assert.equal(at("이성적으로 판단하는 편이라 대화가 정리돼요.", "friend"), 0, "이성적 판단은 연애 말이 아니다");
  // 기타: 구체적인 관계 이름을 지어내지 않는다
  assert.equal(at("두 분은 부부처럼 호흡이 맞을 때 편해져요.", "other"), 1);
  assert.equal(at("두 분이 함께 있을 때 분위기와 서로 이해하는 방법을 먼저 봐요.", "other"), 0);
  assert.equal(at("친구 사이처럼 편한 순간이 있어요.", "other"), 1);
  assert.equal(at("가족 · 생활 환경 쪽 기준이 맞닿는지 부딪히는지로 읽어요.", "other"), 0, "일반 풀이 문구는 관계 이름이 아니다");
  // 썸: 서로의 마음 확정 · 사귀게 된다
  assert.equal(at("두 분은 서로 좋아하고 있어서 곧 사귀게 될 거예요.", "some"), 1);
  assert.equal(at("상대도 호감이 있을 수 있다고 믿고 싶어지지만 마음은 직접 물어봐야 알 수 있어요.", "some"), 1, "상대 마음을 짐작하는 문장은 걸린다");
  assert.equal(at("가까워지는 속도와 서로의 선을 말로 확인해 보면 편해져요.", "some"), 0);
  // 결혼준비중 · 결혼함: 앞날 보장 · 이혼 · 재정 사정
  assert.equal(at("결혼은 성공할 거예요, 평생 함께 행복해요.", "engaged"), 1);
  assert.equal(at("결혼 준비에서 시간 · 돈 · 역할을 먼저 합의해 두면 편해져요.", "engaged"), 0);
  assert.equal(at("이혼 위기를 조심해야 해요.", "married"), 1);
  assert.equal(at("다툰 뒤에 필요한 것을 말로 정해 두면 회복이 빨라져요.", "married"), 0);
  // 연인: 사이 자체에는 제한이 없다(예전과 같은 일반 규칙이 따로 본다)
  assert.equal(at("연인 사이에서 서운함을 짧게 말해 두면 좋아요.", "lover"), 0);
  // 사이가 없으면(예전 방식) 걸지 않는다
  assert.equal(at("두 분은 연애하듯 서로를 챙겨요. 결혼 생활도 이어져요.", null), 0);
});

test("내 성별 확인(myGenderError): 직접 골라야 하고, 분석 때 입력한 성별과 다르면 덮어쓰지 않고 이유를 알려 준다 · 성별이 없던 예전 결과는 선택만 확인한다", () => {
  assert.equal(myGenderError({ gender: "female" }, "female"), null);
  assert.equal(myGenderError({ gender: "male" }, "male"), null);
  assert.match(myGenderError({ gender: "female" }, "male")!, /분석할 때는 "여자"로 입력하셨어요.*같게 선택해 주세요.*새로 받아 주세요/);
  assert.match(myGenderError({ gender: "male" }, "female")!, /"남자"로 입력하셨어요/);
  for (const raw of [undefined, null, "", "x", 2]) assert.equal(myGenderError({ gender: "female" }, raw), "성별을 선택해 주세요.", String(raw));
  assert.equal(myGenderError({}, "female"), null, "성별을 받기 전에 저장한 결과");
  assert.equal(myGenderError(null, "male"), null);
});
