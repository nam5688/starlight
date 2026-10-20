// 실행: npm test — 지금 화면의 22문항(동의 척도)이 조용히 바뀌지 않았는지 고정한다(운영자 2026-10-20: 문항 회귀 점검).
//  · 문항 id · 영역 · 차원 · 역채점 표시 · 문장을 하나의 지문으로 묶어 고정한다 — 문구를 바꾸면 이 시험이 깨지고, 바꾸는 사람이 이유를 문서에 남겨야 한다.
//  · 역채점은 6 − 응답이고, 같은 응답이면 같은 점수다(저장된 기존 응답은 이 규칙으로 읽는다).
//  · 상황형 28문항 · 30문항 초안은 이 모듈과 섞이지 않는다(질문 버전이 다르다 — 보존 시험은 drafts/ 쪽에 있다).
// 문항의 좋고 나쁨 · 신뢰도 · 타당도를 확인하는 시험이 아니다. 비용 0.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "./modules/index.ts";
import { scoreModule, toScoreMap } from "./scoring.ts";
import type { Answers } from "./types.ts";

const rows = ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => `${m.id}|${i.id}|${i.dimension}|${i.reverse ? "R" : "-"}|${i.text}`));

test("문항 22개 · 역채점 10개의 id와 문장이 고정돼 있다(최초 커밋 이후 바뀌지 않았다)", () => {
  assert.equal(rows.length, 22);
  assert.deepEqual(ASSESSMENT_MODULES.map((m) => m.id), ["mbti", "temperament", "relationship"]);
  const reversed = ASSESSMENT_MODULES.flatMap((m) => m.items.filter((i) => i.reverse).map((i) => i.id));
  assert.deepEqual(reversed, ["m2", "m4", "m6", "m8", "t2", "t4", "t6", "t8", "r3", "r6"]);
  const all = rows.join("\n");
  let h = 0;
  for (const ch of all) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  assert.equal([...all].length, 1148, "문항 문장의 글자 수가 달라졌다");
  assert.equal(h, 2614048528, "문항 문장 · 차원 · 역채점 중 하나가 바뀌었다 — 바꿨다면 이유 · 기존 응답 호환을 문서에 남기고 이 지문을 갱신한다");
});

test("역채점은 6 − 응답이고 점수는 0~100으로 환산된다: 같은 응답이면 같은 점수, 역문항은 반대로 읽힌다", () => {
  const rel = ASSESSMENT_MODULES.find((m) => m.id === "relationship")!;
  const base: Answers = Object.fromEntries(rel.items.map((i) => [i.id, 3]));
  const score = (a: Answers) => toScoreMap(scoreModule(rel, a));
  assert.deepEqual(score(base), score({ ...base }));
  // r3(역문항, anxiety)에 '매우 그렇다(5)'는 불안이 낮은 쪽 — 같은 차원의 r1 · r2가 보통일 때 평균이 내려간다
  const anxietyLow = score({ ...base, r3: 5 }).anxiety;
  const anxietyHigh = score({ ...base, r3: 1 }).anxiety;
  assert.ok(anxietyLow < score(base).anxiety && score(base).anxiety < anxietyHigh, `${anxietyLow} < ${score(base).anxiety} < ${anxietyHigh}`);
  // 역문항에 5를 주면 직접 문항에 1을 준 것과 같다
  assert.equal(score({ ...base, r3: 5 }).anxiety, score({ ...base, r1: 1 }).anxiety);
  // 응답이 모두 3이면 어느 차원이나 50
  for (const v of Object.values(score(base))) assert.equal(v, 50);
});
