// 실행: npm test — story-motif.ts: 한 낱말이 글 전체에 번지는 반복을 찾고, 문장 수를 넘은 문단을 문장은 그대로 두고 문단 나눔만 나눈다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SAMPLE_STORY_DRAFT } from "../../samples/sample-story-draft.ts";
import { findMotifSpread, motifMessages, normalizeStoryDraft, splitSentences } from "./story-motif.ts";
import { visibleStoryTexts } from "./story-validate.ts";
import type { StoryDraftV1 } from "./types.ts";
import { countSentences } from "./validate.ts";

const REAL = JSON.parse(readFileSync(new URL("../../../docs/samples/real-ai/story-0.2-P01-story-p01-20261017-020347/failed/P01-X-round2.json", import.meta.url), "utf8")) as StoryDraftV1;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

test("splitSentences는 countSentences와 같은 규칙이다 — 따옴표 안의 마침표는 나누지 않고 글자는 그대로 이어 붙여진다", () => {
  const samples = [
    "첫 문장이에요. 둘째 문장이에요! 셋째 문장이에요?",
    '이렇게 말해 보세요. "저는 천천히 알아가는 게 편해요. 중간중간 속도를 맞춰 봐요." 그러면 편해요.',
    "마침표가 없는 한 문장",
    "짝이 맞지 않는 \"따옴표가 있어요. 그래서 그대로 센다. 끝.",
  ];
  for (const t of samples) {
    assert.equal(splitSentences(t).length, countSentences(t), t);
    assert.equal(splitSentences(t).join(" ").replace(/\s+/g, " "), t.replace(/\s+/g, " "), "문장을 다시 이으면 글이 그대로다");
  }
  // 실제 AI 글의 모든 문단에서도 같다
  for (const a of REAL.areas) for (const p of a.paragraphs) assert.equal(splitSentences(p).length, countSentences(p));
});

test("normalizeStoryDraft: 4문장 문단을 2+2로 나눈다 — 문장은 그대로이고 입력은 바뀌지 않는다", () => {
  const before = JSON.stringify(REAL);
  const n = normalizeStoryDraft(REAL);
  assert.equal(JSON.stringify(REAL), before, "입력을 바꾸지 않는다");
  const core = n.areas.find((a) => a.id === "core")!;
  const orig = REAL.areas.find((a) => a.id === "core")!;
  assert.equal(core.paragraphs.length, orig.paragraphs.length + 1, "문단이 하나 늘었다");
  assert.ok(core.paragraphs.every((p) => countSentences(p) <= 3));
  assert.deepEqual(core.paragraphs.slice(0, 1), orig.paragraphs.slice(0, 1));
  assert.equal(core.paragraphs.slice(1, 3).join(" "), orig.paragraphs[1], "나눈 두 문단을 이으면 원래 문단이다");
  // 다른 영역 · 흐름은 그대로
  assert.deepEqual(n.areas.filter((a) => a.id !== "core"), REAL.areas.filter((a) => a.id !== "core"));
  assert.deepEqual(n.flow, REAL.flow);
});

test("normalizeStoryDraft: 나눌 수 없으면 건드리지 않는다 — 조각이 너무 짧거나 문단 수 상한을 넘길 때", () => {
  const short = clone(REAL);
  short.areas[0].paragraphs[1] = "짧아요. 짧아요. 짧아요. 짧아요.";
  assert.deepEqual(normalizeStoryDraft(short).areas[0].paragraphs, short.areas[0].paragraphs, "조각이 최소 글자 수(60자)에 못 미친다");
  const full = clone(REAL);
  // core는 최대 5문단 — 이미 5개이면 나누면 6개가 되므로 그대로 둔다
  const long = REAL.areas[0].paragraphs[1];
  full.areas[0].paragraphs = [REAL.areas[0].paragraphs[0], long, REAL.areas[0].paragraphs[2], REAL.areas[0].paragraphs[3], REAL.areas[0].paragraphs[0]];
  assert.deepEqual(normalizeStoryDraft(full).areas[0].paragraphs, full.areas[0].paragraphs, "문단 수 상한을 넘기면 나누지 않는다");
  // 모양이 맞지 않으면 그대로 돌려준다
  assert.equal(normalizeStoryDraft(null), null);
  assert.equal(normalizeStoryDraft("글"), "글");
  const odd = { areas: [{ id: "core", paragraphs: "문단이 배열이 아니다" }], flow: null };
  assert.deepEqual(normalizeStoryDraft(odd), odd);
});

test("findMotifSpread: 실제 AI 글의 '정리'(20번, 제목 · 카드 · 세 영역)를 잡고, 흔한 말은 세지 않는다", () => {
  const found = findMotifSpread(visibleStoryTexts(REAL));
  const stems = found.map((m) => m.stem);
  assert.ok(stems.includes("정리"), stems.join(","));
  const m = found.find((x) => x.stem === "정리")!;
  assert.ok(m.total >= 15 && m.where.includes("head") && m.where.length >= 4, JSON.stringify(m));
  for (const common of ["있어", "먼저", "마음", "사람", "함께"]) assert.ok(!stems.includes(common), `${common}은 흔한 말`);
  assert.match(motifMessages(found)[0], /정리…/);
  assert.match(motifMessages(found)[0], /한 영역에서만 중심으로 쓰고/);
});

test("findMotifSpread: 제목 · 카드에 없거나 두 영역에만 나오면 번졌다고 보지 않는다", () => {
  const onlyBody = clone(REAL);
  onlyBody.headline = "책임은 크게 지고 방향이 바뀌면 지치는 사람이에요";
  onlyBody.cards.strength.keyword = "사람을 살피는 힘";
  onlyBody.cards.caution.keyword = "말수가 줄어드는 시간";
  onlyBody.cards.strength.note = "관계의 영향을 먼저 헤아리고 맡은 자리는 책임 있게 지켜 가요.";
  onlyBody.cards.caution.note = "말수가 줄어드는 시간이 길어지면 옆에서는 거리로 느낄 수 있어요.";
  onlyBody.cards.flow.keyword = "배운 것을 결과로 보여 주는 시기";
  assert.ok(!findMotifSpread(visibleStoryTexts(onlyBody)).some((x) => x.stem === "정리"), "제목 · 카드에 없으면 번짐이 아니다");
  const few = findMotifSpread([
    { where: "headline", text: "정리가 중요한 사람이에요 정리 정리" },
    { where: "areas.core.paragraphs[0]", text: "정리를 해요 정리해요 정리했어요" },
    { where: "areas.relation.paragraphs[0]", text: "정리해 봐요 정리를 합니다" },
  ]);
  assert.deepEqual(few, [], "영역 두 곳에만 나오면(세 곳 미만) 번졌다고 보지 않는다");
});

test("서윤 예시 글의 번짐을 측정해 둔다(고쳐 쓰기를 부탁하는 검사이지 형식 오류가 아니다 — 예시는 이 검사를 통과해야 하는 대상이 아니다)", () => {
  const found = findMotifSpread(visibleStoryTexts(SAMPLE_STORY_DRAFT));
  // 지금 예시에서 번진 낱말(확인 · 다듬 — 한 가지 모티프가 여러 영역에 이어지는 점은 이전 대리 작성기 시험에서도 관찰됐다)
  assert.ok(found.every((m) => m.total >= 8 && m.where.includes("head")));
});
