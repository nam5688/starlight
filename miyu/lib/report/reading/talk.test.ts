// 실행: npm test — 대화로 풀어보기(1단계): 저장된 리포트의 글만 쓰고(AI 호출 없음), 큰 주제 번호 · 분석 카드 · 공유용 카드의 개인정보 범위를 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sampleReadingReport } from "../../samples/sample-reading-report.ts";
import { buildTalkModel, CARD_DISCLAIMER, nextTopic, TALK_COPY, type TalkPiece, type TalkTopic } from "./talk.ts";
import { layoutCard, wrapText, type Measure } from "./talk-card.ts";
import type { IntegratedReadingReport } from "./types.ts";

const R = sampleReadingReport;
/** 글자 하나당 폭 — 한글은 크게, 숫자 · 영문 · 공백은 작게 (실제 글꼴이 아니라 배치 규칙만 시험하는 가짜 자) */
const measure: Measure = (t, size) => [...t].reduce((n, c) => n + (c.charCodeAt(0) > 0x2e80 ? size : size * 0.55), 0);

/** 리포트 안의 모든 문자열 */
function allStrings(v: unknown, out = new Set<string>()): Set<string> {
  if (typeof v === "string") out.add(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}
const pieceTexts = (ps: TalkPiece[]) =>
  ps.flatMap((p) => (p.kind === "para" || p.kind === "note" ? [p.text] : p.kind === "flow" ? [p.when, p.helpful, ...p.steps.map((s) => s.text)] : [...p.comfortable, ...p.clash, p.note]));
/** 대화 모델의 풀이 글 — 이 문자열들은 모두 저장된 리포트에 있어야 한다 */
const contentOf = (t: TalkTopic) => [t.headline, ...t.summary, ...(t.caveat ? [t.caveat] : []), ...(t.timeline ? [t.timeline.text] : []), ...(t.traits ?? []).flatMap((x) => [x.shinesShort, x.burdenShort]), ...pieceTexts(t.example), ...pieceTexts(t.detail)];

test("큰 주제 번호: 주제 5개 + 앞으로의 시기가 1부터 차례로 이어지고, 고르는 버튼이 모두 있다", () => {
  const m = buildTalkModel(R, { tendencyName: "확인추구형" });
  assert.deepEqual(m.topics.map((t) => t.number), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(m.topics.map((t) => t.id), ["tendency", "strength-burden", "values", "love", "work-money", "flow"]);
  assert.ok(m.topics.every((t) => t.chip && t.title && t.headline && t.summary.length > 0));
  assert.equal(m.topics[0].chip, "나는 어떤 사람?");
  assert.equal(m.topics[5].chip, "앞으로의 시기");
  assert.equal(m.name, "서윤");
});

test("풀이 · 예시 · 자세히는 저장된 리포트의 문장 그대로다 — 새로 쓰거나 바꾼 글이 없다 (AI 호출 없음)", () => {
  const pool = allStrings(R);
  for (const t of buildTalkModel(R).topics) {
    for (const s of contentOf(t)) assert.ok(pool.has(s), `${t.id}: 저장된 리포트에 없는 글 — ${s.slice(0, 40)}`);
  }
  // 분석 근거도 저장된 근거 그대로
  const tendency = buildTalkModel(R).topics[0];
  assert.deepEqual(tendency.basis, R.blocks[0].basis);
  // 대화 안의 고정 안내는 풀이 글이 아니다: 사주 용어 · 점수 표현이 없다
  const copy = JSON.stringify(TALK_COPY);
  assert.doesNotMatch(copy, /일간|대운|세운|원국|오행|십신|\d+\s*%|확률|점수/);
});

test("버튼마다 보여 줄 내용이 있다: 특징 주제는 특징별 예시 3개, 관계 주제는 반응 단계 그림 · 편안한 조건, 앞으로의 시기는 타임라인 · 가능성", () => {
  const m = buildTalkModel(R);
  const by = (id: string) => m.topics.find((t) => t.id === id)!;
  const sb = by("strength-burden");
  assert.equal(sb.traits?.length, 3);
  assert.equal(sb.example.length, 3);
  assert.ok(sb.detail.some((p) => p.kind === "para" && p.label?.endsWith("단점이 될 수 있는 부분")), "특징마다 단점이 될 수 있는 부분 풀이가 있다");
  const love = by("love");
  assert.ok(love.example.some((p) => p.kind === "flow"), "관계는 반응이 이어지는 모습이 예시 자리");
  assert.ok(love.detail.some((p) => p.kind === "comfort"));
  const flow = by("flow");
  assert.ok(flow.timeline && flow.timeline.slots.length === R.timeline.length, "타임라인은 계산된 기간 그대로");
  assert.ok(flow.example.length >= 3 && flow.example[0].kind === "note", "응답으로 본 가능성은 예측이 아니라는 안내가 먼저");
  assert.ok(m.topics.every((t) => t.basis), "모든 주제에 분석 근거가 있다");
});

test("알려 준 고민이 있을 때만 '알려 주신 고민' 주제가 생기고, 분석 카드에는 고민이 들어가지 않는다", () => {
  const without = buildTalkModel(R);
  assert.ok(!without.topics.some((t) => t.id === "focus"));
  const withFocus: IntegratedReadingReport = { ...R, focus: [{ text: "알려 주신 고민을 반영하면, 답을 기다리는 시간이 길게 느껴질 수 있습니다.", evidence: ["saju.daymaster"] }] };
  const m = buildTalkModel(withFocus);
  const focus = m.topics.find((t) => t.id === "focus");
  assert.ok(focus);
  assert.equal(focus.number, 7);
  assert.deepEqual(focus.summary, ["알려 주신 고민을 반영하면, 답을 기다리는 시간이 길게 느껴질 수 있습니다."]);
  assert.equal(focus.basis, null, "예시에는 근거 목록이 없어 만들지 않는다");
  assert.doesNotMatch(JSON.stringify(m.card), /알려 주신 고민을 반영하면/);
});

test("분석 카드: 핵심 문장 · 성향 요약 3줄 · 장점 · 단점이 될 수 있는 부분 · 지금 나의 시기 · 사용한 정보 — 생년월일 · 점수는 없다", () => {
  const { card } = buildTalkModel(R, { tendencyName: "확인추구형" });
  assert.equal(card.headline, R.headline);
  assert.equal(card.tendency, "확인추구형");
  assert.deepEqual(card.rows.map((r) => r.label), ["생각과 행동 방식", "가까운 관계", "일과 돈"]);
  assert.deepEqual([card.strength.label, card.caution.label, card.flow.label], ["장점", "단점이 될 수 있는 부분", "지금 나의 시기"]);
  assert.ok(card.inputs.length >= 3 && card.inputs.every((s) => !/없음|입력하지 않았/.test(s)));
  assert.ok(card.inputs.some((s) => s.includes("개발용 문항")), "개발용 문항은 개발용이라고 밝힌다");
  assert.ok(!card.inputs.some((s) => s.includes("알려 준 고민")), "쓰지 않은 자료는 사용한 정보에 넣지 않는다");
  assert.doesNotMatch(JSON.stringify(card), /\d{4}[.\-년]\s*\d{1,2}[.\-월]\s*\d{1,2}|\(\d{2,3}\)|\d+\s*%|생년월일|백분위/);
});

test("대표 경향은 저장된 응답 요약에서 읽고, 없으면 카드에 넣지 않는다", () => {
  assert.equal(buildTalkModel(R).card.tendency, null);
  const withBase = { ...R, base: { tendency: { id: "stability", name: "안정지향형" } } } as unknown as IntegratedReadingReport;
  assert.equal(buildTalkModel(withBase).card.tendency, "안정지향형");
});

test("다음 풀이: 지금 다음 순서에서 아직 보지 않은 첫 주제를 고르고, 다 봤으면 없다", () => {
  const { topics } = buildTalkModel(R);
  assert.equal(nextTopic(topics, null, new Set())?.id, "tendency");
  assert.equal(nextTopic(topics, "tendency", new Set(["tendency"]))?.id, "strength-burden");
  assert.equal(nextTopic(topics, "flow", new Set(["flow"]))?.id, "tendency", "끝까지 갔으면 못 본 앞쪽으로 돌아간다");
  assert.equal(nextTopic(topics, "love", new Set(topics.map((t) => t.id))), null);
});

test("카드 줄바꿈: 어절 단위로 나누고, 한 줄이 폭을 넘지 않으며, 한 어절이 너무 길면 글자 단위로 끊는다", () => {
  const lines = wrapText("새로운 일 앞에서는 위험과 변수를 먼저 살펴보는 편입니다", 400, 30, 400, measure);
  assert.ok(lines.length > 1 && lines.every((l) => measure(l, 30, 400) <= 400));
  assert.equal(lines.join(" "), "새로운 일 앞에서는 위험과 변수를 먼저 살펴보는 편입니다");
  const long = wrapText("가나다라마바사아자차카타파하가나다라마바사", 200, 30, 400, measure);
  assert.ok(long.length > 1 && long.every((l) => measure(l, 30, 400) <= 200));
  assert.equal(long.join(""), "가나다라마바사아자차카타파하가나다라마바사");
});

test("카드 배치: 저장용에는 이름 · 분석일 · 사용한 정보가 있고, 공유용에는 기본으로 없다 (이름은 고르면 넣는다)", () => {
  const { card } = buildTalkModel(R, { tendencyName: "확인추구형" });
  const textsOf = (o: Parameters<typeof layoutCard>[1]) => layoutCard(card, o).ops.flatMap((op) => (op.type === "text" ? [op.text] : []));
  const save = textsOf({ variant: "save", measure, name: "서윤", dateLabel: "2026. 10. 13." });
  assert.ok(save.some((t) => t.includes("서윤 님의 분석 카드")) && save.includes("2026. 10. 13.") && save.includes("사용한 정보"));
  const share = textsOf({ variant: "share", measure, name: "서윤", dateLabel: "2026. 10. 13." });
  assert.ok(!share.some((t) => t.includes("서윤")) && !share.includes("2026. 10. 13.") && !share.includes("사용한 정보"));
  assert.ok(share.includes("나의 분석 카드"));
  const named = textsOf({ variant: "share", measure, name: "서윤", includeName: true });
  assert.ok(named.some((t) => t.includes("서윤 님의 분석 카드")));
  // 공유용에도 핵심 문장 · 장점 · 단점이 될 수 있는 부분 · 시기 · 안내문이 들어 있다
  for (const must of [card.strength.keyword, card.caution.keyword, card.flow.keyword, "단점이 될 수 있는 부분", CARD_DISCLAIMER, "확인추구형"]) assert.ok(share.some((t) => t.includes(must)), must);
  // 어느 카드에도 점수 · 생년월일 · 고민이 없다
  for (const t of [...save, ...share]) assert.doesNotMatch(t, /생년월일|\(\d{2,3}\)|\d+\s*%|백분위/);
});

test("카드 배치: 모든 글이 이미지 안에 들어가고 높이는 글에 맞춰 늘어난다", () => {
  const { card } = buildTalkModel(R, { tendencyName: "확인추구형" });
  const a = layoutCard(card, { variant: "save", measure, name: "서윤", dateLabel: "2026. 10. 13." });
  assert.equal(a.width, 1080);
  assert.ok(a.height > 1200);
  for (const op of a.ops) {
    if (op.type === "rect") assert.ok(op.x >= 0 && op.y >= 0 && op.x + op.w <= a.width && op.y + op.h <= a.height, "칸이 이미지 밖으로 나가지 않는다");
    else {
      const w = measure(op.text, op.size, op.weight);
      const left = op.align === "right" ? op.x - w : op.x;
      assert.ok(left >= 0 && left + w <= a.width, `글이 가로로 넘친다: ${op.text.slice(0, 20)}`);
      assert.ok(op.y >= 0 && op.y + op.size <= a.height, "글이 세로로 넘친다");
    }
  }
  const longer = layoutCard({ ...card, headline: `${card.headline} ${card.headline} ${card.headline}` }, { variant: "save", measure, name: "서윤", dateLabel: "예시" });
  assert.ok(longer.height > a.height, "글이 길어지면 카드가 길어진다 (글을 자르지 않는다)");
  assert.equal(a.ops[0].type, "rect", "바탕이 맨 먼저");
});
