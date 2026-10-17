// 실행: npm test — 궁합 실제 AI 글 검토 지표(live-review.ts)가 반복 · 영역끼리 겹침 · 사건 단정 · 같은 조언 · 응답 재진술을 실제로 잡아내는지 확인한다.
// 이 지표는 읽기 전의 보조이며 합격 판정이 아니다 — 말을 바꿔 되풀이한 문장 · 만족도는 못 센다.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Evidence } from "../evidence.ts";
import { renderLiveReview, reviewLive, type LiveReviewShape } from "./live-review.ts";

const para = (n: number) => `${n}번째 장면에서는 서로 다른 일이 일어나기 쉬워요. 연락이 늦어지는 날 한쪽은 혼자 정리하고 다른 쪽은 바로 말을 꺼내는 방향으로 움직여요 ${n}.`;
const shape = (over: Partial<LiveReviewShape> = {}): LiveReviewShape => ({
  headline: "두 분은 서로의 속도를 맞추는 연습이 필요한 사이예요",
  sections: [
    { id: "overview", headline: "첫째 영역", paragraphs: ["낮에는 일정을 정하고 저녁에는 쉬는 쪽으로 하루를 쓰는 두 사람이라 약속을 잡을 때 시간대부터 맞추게 돼요.", "주말에 가고 싶은 곳을 고르는 방식이 달라서 한 사람은 목록을 만들고 다른 사람은 그날 기분으로 정해요."], evidence: ["compat.a"] },
    { id: "fit", headline: "둘째 영역", paragraphs: ["돈을 쓰는 기준이 비슷해서 큰 지출 앞에서는 같은 쪽으로 망설이기 쉬워요.", "집안일을 나눌 때 먼저 손이 가는 일이 달라 역할을 나누면 덜 부딪혀요."], evidence: ["compat.b"] },
  ],
  steps: {
    aToB: [{ title: "먼저 시간 묻기", detail: "약속을 정할 때 B님이 편한 시간대를 먼저 물어보세요", say: "너는 언제가 편해?", evidence: ["compat.a"] }],
    bToA: [{ title: "결정 미리 알리기", detail: "A님이 목록을 만드는 날에는 하루 전에 가고 싶은 곳을 한 가지만 말해 두세요", say: "이번엔 여기 어때?", evidence: ["compat.b"] }],
    together: [{ title: "주간 점검", detail: "일요일 저녁 십 분 동안 한 주의 일정을 같이 훑어보세요", say: "다음 주는 어때?", evidence: ["compat.a"] }],
  },
  ...over,
});

test("지표: 서로 다른 글은 새 정보량이 높고 되풀이 · 겹침이 없다", () => {
  const r = reviewLive(shape());
  assert.ok(r.sections.every((s) => s.novelty >= 0.9), JSON.stringify(r.sections));
  assert.equal(r.repeatedPhrases.length, 0);
  assert.equal(r.eventAssertions.length, 0);
  assert.ok((r.maxSectionOverlap?.overlap ?? 1) < 0.1);
  assert.equal(r.steps.duplicateSays, 0);
  assert.ok((r.steps.aToBvsBToAOverlap ?? 1) < 0.2);
  assert.equal(r.productCheckErrors, null, "근거 목록을 주지 않으면 제품 검사는 돌리지 않는다");
});

test("지표: 영역이 같은 말을 되풀이하면 새 정보량이 떨어지고 같은 구절 · 영역 겹침이 잡힌다", () => {
  const same = "연락이 늦어지는 날 한쪽은 혼자 정리하고 다른 쪽은 바로 말을 꺼내는 방향으로 움직이기 쉬워요";
  const r = reviewLive(shape({ sections: [{ id: "overview", headline: "a", paragraphs: [para(1), same], evidence: [] }, { id: "fit", headline: "b", paragraphs: [para(1), same], evidence: [] }] }));
  assert.ok(r.sections.every((s) => s.novelty < 0.3), JSON.stringify(r.sections));
  assert.ok(r.repeatedPhrases.length > 0);
  assert.ok((r.maxSectionOverlap?.overlap ?? 0) > 0.7);
});

test("지표: 입력받지 않은 사건 단정 · 같은 건넬 말 · A님과 B님에게 같은 조언을 한 글을 잡아낸다", () => {
  const dup = { title: "같은 행동", detail: "일요일 저녁에 십 분 동안 한 주의 일정을 같이 훑어보세요", say: "다음 주는 어때?", evidence: [] };
  const r = reviewLive(shape({
    sections: [{ id: "overview", headline: "a", paragraphs: ["두 분은 지난달에 크게 다퉜어요. 그래서 거리가 생겼어요."], evidence: [] }],
    steps: { aToB: [dup], bToA: [dup], together: [dup] },
  }));
  assert.equal(r.eventAssertions.length, 1);
  assert.equal(r.steps.duplicateSays, 2);
  assert.ok((r.steps.aToBvsBToAOverlap ?? 0) > 0.9);
});

test("지표: 근거에 적힌 응답 풀이 문구를 그대로 옮기면 잡히고, 안 쓴 응답 근거는 따로 센다", () => {
  const ev: Evidence[] = [
    { id: "pair.sensitivity", source: "survey", topics: ["relationship"], strength: "moderate", fact: '타인 반응 민감도: A님의 응답에서 나타난 경향은 "다른 사람의 반응과 인정에 크게 영향을 받습니다", B님은 "다른 사람의 반응에 비교적 덜 흔들립니다" — 서로 다른 쪽으로 답했어요', cue: "x" },
    { id: "pair.avoidance", source: "survey", topics: ["relationship"], strength: "weak", fact: '거리 두기: A님의 응답에서 나타난 경향은 "가까워질수록 혼자만의 거리가 필요합니다", B님은 "가까워지고 기대는 것이 비교적 편합니다" — 서로 다른 쪽으로 답했어요', cue: "x" },
  ];
  const s = shape({ sections: [{ id: "response", headline: "응답", paragraphs: ["A님은 다른 사람의 반응과 인정에 크게 영향을 받아요.", "B님은 가까워지고 기대는 것이 비교적 편해요."], evidence: ["pair.sensitivity"] }, { id: "fit", headline: "b", paragraphs: ["두 분은 연락 방식이 달라요."], evidence: ["compat.b"] }] });
  const r = reviewLive(s, { evidence: ev, pair: true });
  assert.equal(r.meaningEchoes.length, 2);
  assert.deepEqual(r.evidence?.pairUncited, ["pair.avoidance"]);
  assert.equal(r.evidence?.pairCitedSections, 1);
  assert.ok(renderLiveReview(r).includes("응답 풀이 문구를 그대로 옮긴 곳: 2곳"));
});
