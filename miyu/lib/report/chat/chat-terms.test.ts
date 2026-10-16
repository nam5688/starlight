// 실행: npm test — 채팅 답의 용어 · 방향 · 보완 아이템 검사(2026-10-16, 지시문 0.6).
// 사용자가 물은 용어 · 구매한 리포트 방은 용어를 설명과 함께 쓸 수 있고, 이 분의 판정은 풀이 글에 있을 때만, 이유 있는 방향은 허용하고 중대한 선택의 확정 · 운을 바꾼다는 보장은 막는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chatKnownText, validateChatAnswer, type ChatValidateOpts } from "./validate.ts";

const ok = (text: string, opts?: ChatValidateOpts) => validateChatAnswer(text, opts);
const errs = (text: string, opts?: ChatValidateOpts) => {
  const r = ok(text, opts);
  return r.ok ? [] : r.errors;
};
const asked = (question: string, allowTerms = false, known = ""): ChatValidateOpts => ({ question, allowTerms, known });

test("옵션이 없으면 예전처럼 사주 용어를 한 번도 쓰지 못한다(맛보기 리포트 검사와 같은 경로)", () => {
  assert.ok(errs("일간(나 자신을 나타내는 글자)이 정화라서 오래 가는 편이에요.").some((e) => /사주 용어/.test(e)));
});

test("무료 맛보기 방: 사용자가 묻지 않은 용어는 쉬운 말로 바꿔야 하고, 사용자가 물은 용어는 설명과 함께 답할 수 있다", () => {
  const tasteNoAsk = asked("요즘 왜 이렇게 지칠까요?", false);
  assert.ok(errs("월령(태어난 달의 기운)이 약해서 지치기 쉬워요. 쉬는 시간을 먼저 정해 보세요.", tasteNoAsk).some((e) => /사주 용어\(월령\)는 쓰지 않고/.test(e)));
  assert.deepEqual(errs("물 기운이 많은 구성이라 생각이 오래 머물러서 지치기 쉬워요. 쉬는 시간을 먼저 정해 보세요.", tasteNoAsk), []);
  const tasteAsk = asked("월령이 뭐예요?", false);
  assert.deepEqual(errs("월령이란 태어난 달의 기운을 말해요. 같은 사람도 어느 계절에 태어났는지에 따라 힘의 쓰임이 달라진다고 봐요.", tasteAsk), []);
  // 물었어도 설명 없이 쓰면 막힌다
  assert.ok(errs("월령이 약해요. 쉬는 시간을 먼저 정해 보세요.", tasteAsk).some((e) => /설명 없는 사주 용어\(월령\)/.test(e)));
});

test("구매한 리포트 방: 풀이에 필요한 용어를 설명과 함께 쓸 수 있고, 설명 없는 용어 · 한 문장에 셋 이상은 막힌다", () => {
  const paid = asked("요즘 왜 이렇게 지칠까요?", true);
  assert.deepEqual(errs("월령(태어난 달의 기운)이 뒷받침해 주지 않는 구조라서 혼자 힘을 쓰다 지치기 쉬워요. 쉬는 시간을 먼저 정해 보세요.", paid), []);
  assert.ok(errs("월령이 뒷받침해 주지 않는 구조라서 지치기 쉬워요. 쉬는 시간을 먼저 정해 보세요.", paid).some((e) => /설명 없는 사주 용어\(월령\)/.test(e)));
  assert.ok(errs("비겁(나와 같은 기운)과 식상(표현하는 기운)과 인성(나를 돕는 기운)이 같이 있어요. 쉬는 시간을 먼저 정해 보세요.", paid).some((e) => /한 문장에 사주 용어가 3개/.test(e)));
});

test("용어를 물었을 때: 일반 설명은 되고, 풀이 글에 없는 판정을 이 분의 것처럼 쓰면 막히며, 아직 계산하지 않았다고 밝히면 통과한다", () => {
  const q = asked("제 용신이 뭐예요?", true, "태어난 달의 기운과 뿌리를 바탕으로 읽은 풀이");
  // 이 분의 용신을 정해 주면 막힌다(풀이 글에 용신이 없다)
  assert.ok(errs("이 분의 용신(필요한 기운)은 물이에요. 물 기운을 가까이 두면 편해져요.", q).some((e) => /근거 없는 판정\(용신\)/.test(e)));
  assert.ok(errs("당신의 용신(필요한 기운)은 물이에요. 물 기운을 가까이 두면 편해져요.", q).some((e) => /근거 없는 판정\(용신\)/.test(e)));
  // 일반 설명 + 아직 계산하지 않았다는 안내 + 있는 재료로 대신 말하기는 통과한다
  assert.deepEqual(
    errs("용신이란 사주에서 균형을 잡아 주는 기운을 가리키는 말이에요.\n\n미유는 아직 이 분의 용신을 계산하지 않았어요. 대신 풀이에 있는 태어난 달의 기운과 뿌리를 보면, 혼자 힘을 쓰다 지치기 쉬운 쪽으로 읽혀요.", q),
    [],
  );
  // 풀이 글에 월령이 이미 있으면 이 분의 월령을 말할 수 있다
  const withKnown = asked("월령이 약하다는 게 무슨 뜻이에요?", true, "월령(태어난 달의 기운)을 얻지 못한 구조라서 혼자 힘을 쓰기 쉬워요.");
  assert.deepEqual(errs("월령이란 태어난 달의 기운을 말해요. 이 분의 월령은 뒷받침이 약한 쪽으로 읽혀서 혼자 힘을 쓰기 쉬워요.", withKnown), []);
  // 풀이 글에 월령이 없으면 같은 문장도 이 분의 판정으로 막힌다
  assert.ok(errs("월령이란 태어난 달의 기운을 말해요. 이 분의 월령은 뒷받침이 약한 쪽으로 읽혀요.", asked("월령이 뭐예요?", true, "")).some((e) => /근거 없는 판정\(월령\)/.test(e)));
});

test("방향 제시: 이유 있는 추천은 통과하고, 중대한 선택을 확정하는 말 · 투자 권유 · 운을 바꾼다는 보장은 막는다", () => {
  const o = asked("이직할까요?", true);
  assert.deepEqual(errs("이직을 고민한다면 책임 범위가 넓어지는 자리가 이 분에게는 더 맞아 보여요. 지금 일에서 반복되는 부담을 먼저 적어 보고, 맞지 않는 신호가 보이면 그때 다시 이야기해 봐요.", o), []);
  assert.deepEqual(errs("새 팀에서 역할이 흐릿하면 처음 한 달은 맡을 범위를 문장으로 적어 두는 편이 편해 보여요. 적고도 불편하다면 범위 자체가 맞는지 물어볼 시점이에요.", o), []);
  for (const bad of ["이직하세요. 지금이 가장 좋은 때라서요 정말로요.", "그 사람과는 헤어지는 게 맞아요. 더 생각할 필요가 없어요.", "지금 퇴사하는 게 좋아요. 미루지 않아도 돼요.", "대출해서 창업하세요. 이 시기에 잘 풀려요 정말로요.", "이 주식을 사세요. 수익이 보장돼요 정말로요."]) {
    assert.equal(ok(bad, o).ok, false, bad);
  }
  // 보완 아이템: 가볍게 곁들이는 제안은 통과하고, 운을 바꾼다는 보장 · 부적 · 행운의 숫자는 막는다
  assert.deepEqual(errs("마음이 차분해지는 색의 소품을 자주 보는 자리에 두면 기분 전환에 도움이 될 수 있어요. 가볍게 해 보고 달라지는지 지켜봐요.", o), []);
  for (const bad of ["이 소품을 두면 운이 트여요. 가볍게 해 보세요 정말로요.", "이 색을 쓰면 액운을 막아요. 가볍게 해 보세요 정말로요.", "부적을 지니면 좋아요. 가볍게 해 보세요 정말로요.", "행운의 숫자는 7이에요. 가볍게 해 보세요 정말로요."]) {
    assert.equal(ok(bad, o).ok, false, bad);
  }
});

test("chatKnownText: 이 방의 풀이 글 · 분석 카드 · 맛보기 문구를 한 덩어리로 모은다", () => {
  const known = chatKnownText({
    topic: { title: "일과 돈", headline: "헤드라인", summary: ["요약 하나"], detail: ["월령(태어난 달의 기운) 풀이"] },
    overview: { headline: "한 줄", tendency: null, strength: "강한 점", caution: null, flow: null },
    profile: { saju: ["사주 문구"], response: ["응답 문구"] },
  });
  for (const must of ["일과 돈", "헤드라인", "요약 하나", "월령(태어난 달의 기운) 풀이", "한 줄", "강한 점", "사주 문구", "응답 문구"]) assert.ok(known.includes(must), must);
  assert.equal(chatKnownText({ topic: null, overview: {}, profile: null }), "");
});
