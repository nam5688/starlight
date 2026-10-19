// 실행: npm test — 대화로 풀어보기(1단계): 저장된 리포트의 글만 쓰고(AI 호출 없음), 큰 주제 번호 · 분석 카드 · 공유용 카드의 개인정보 범위를 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sampleReadingReport } from "../../samples/sample-reading-report.ts";
import { answerBubbles, askFor, buildTalkModel, CARD_DISCLAIMER, extraBubbles, nextTopic, TALK_COPY, type TalkBubble, type TalkPiece, type TalkTopic } from "./talk.ts";
import { periodPlain } from "../../saju/interpret/period-plain.ts";
import { layoutCard, wrapText, type Measure } from "./talk-card.ts";
import type { IntegratedReadingReport } from "./types.ts";
import { legacyTypeTitle } from "../type-title.ts";

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
const contentOf = (t: TalkTopic) => [t.headline, ...t.summary, ...(t.caveat ? [t.caveat] : []), ...(t.traits ?? []).flatMap((x) => [x.shinesShort, x.burdenShort]), ...pieceTexts(t.example), ...pieceTexts(t.detail)];

test("큰 주제 번호: 주제 5개 + 앞으로의 시기가 1부터 차례로 이어지고, 고르는 버튼이 모두 있다", () => {
  const m = buildTalkModel(R, { typeTitle: legacyTypeTitle("확인추구형") });
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
  assert.ok(sb.detail.some((p) => p.kind === "para" && p.label?.endsWith("내가 힘들 수 있는 포인트")), "특징마다 내가 힘들 수 있는 포인트 풀이가 있다");
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

test("분석 카드: 핵심 문장 · 대표 경향 · 강한 포인트 · 힘들 수 있는 포인트 · 지금 나의 시기 · 사용한 정보만 — 주제별 한 줄 요약 · 생년월일 · 점수는 없다", () => {
  const { card } = buildTalkModel(R, { typeTitle: legacyTypeTitle("확인추구형") });
  assert.equal(card.headline, R.headline);
  assert.equal(card.tendency, "관계에서 확인을 중요하게 여기는 편", "이름표(~형) 대신 설명으로");
  // 같은 특징을 카드 · 요약 · 주제에서 되풀이하지 않도록, 주제별 한 줄 요약(이전 rows)은 카드에 넣지 않는다
  assert.ok(!("rows" in card));
  assert.deepEqual([card.strength.label, card.caution.label, card.flow.label], ["내가 강한 포인트", "내가 힘들 수 있는 포인트", "지금 나의 시기"]);
  assert.ok(card.inputs.length >= 3 && card.inputs.every((s) => !/없음|입력하지 않았/.test(s)));
  assert.ok(card.inputs.some((s) => s.includes("개발용 문항")), "개발용 문항은 개발용이라고 밝힌다");
  assert.ok(!card.inputs.some((s) => s.includes("알려 준 고민")), "쓰지 않은 자료는 사용한 정보에 넣지 않는다");
  assert.doesNotMatch(JSON.stringify(card), /\d{4}[.\-년]\s*\d{1,2}[.\-월]\s*\d{1,2}|\(\d{2,3}\)|\d+\s*%|생년월일|백분위/);
});

test("나의 유형은 호출하는 쪽이 사주 + 응답으로 계산해 넘긴 값을 카드에 쓰고, 없으면 카드에 넣지 않는다 — 저장된 옛 후보 이름은 읽지 않는다", () => {
  assert.equal(buildTalkModel(R).card.tendency, null);
  assert.equal(buildTalkModel(R).card.typeName ?? null, null);
  const withBase = { ...R, base: { tendency: { id: "stability", name: "안정지향형" } } } as unknown as IntegratedReadingReport;
  assert.equal(buildTalkModel(withBase).card.tendency, null, "개인 유형이 켜져 있으면 저장된 옛 이름 · 설명은 카드에 나오지 않는다");
  assert.equal(buildTalkModel(withBase).card.typeName ?? null, null);
  const card = buildTalkModel(withBase, { typeTitle: { name: "신중 몰입형", line: "생각이 서면 깊이 파고드는 사람", kind: "type", note: "" } }).card;
  assert.equal(card.typeName, "신중 몰입형");
  assert.equal(card.tendency, "생각이 서면 깊이 파고드는 사람");
  // 옛 모양(스위치를 끄고 되돌릴 때): 이름표 없이 설명만
  const old = buildTalkModel(withBase, { typeTitle: legacyTypeTitle("안정지향형") }).card;
  assert.equal(old.typeName, null);
  assert.equal(old.tendency, "익숙한 방식에서 편안함을 느끼는 편");
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
  const { card } = buildTalkModel(R, { typeTitle: legacyTypeTitle("확인추구형") });
  const textsOf = (o: Parameters<typeof layoutCard>[1]) => layoutCard(card, o).ops.flatMap((op) => (op.type === "text" ? [op.text] : []));
  const save = textsOf({ variant: "save", measure, name: "서윤", dateLabel: "2026. 10. 13." });
  assert.ok(save.some((t) => t.includes("서윤 님의 분석 카드")) && save.includes("2026. 10. 13.") && save.includes("사용한 정보"));
  const share = textsOf({ variant: "share", measure, name: "서윤", dateLabel: "2026. 10. 13." });
  assert.ok(!share.some((t) => t.includes("서윤")) && !share.includes("2026. 10. 13.") && !share.includes("사용한 정보"));
  assert.ok(share.includes("나의 분석 카드"));
  const named = textsOf({ variant: "share", measure, name: "서윤", includeName: true });
  assert.ok(named.some((t) => t.includes("서윤 님의 분석 카드")));
  // 공유용에도 핵심 문장 · 강한 포인트 · 힘들 수 있는 포인트 · 시기 · 안내문이 들어 있다
  for (const must of [card.strength.keyword, card.caution.keyword, card.flow.keyword, "내가 힘들 수 있는 포인트", CARD_DISCLAIMER, "관계에서 확인을 중요하게 여기는 편"]) assert.ok(share.some((t) => t.includes(must)), must);
  // 어느 카드에도 점수 · 생년월일 · 고민이 없다
  for (const t of [...save, ...share]) assert.doesNotMatch(t, /생년월일|\(\d{2,3}\)|\d+\s*%|백분위/);
});

test("카드 배치: 모든 글이 이미지 안에 들어가고 높이는 글에 맞춰 늘어난다", () => {
  const { card } = buildTalkModel(R, { typeTitle: legacyTypeTitle("확인추구형") });
  const a = layoutCard(card, { variant: "save", measure, name: "서윤", dateLabel: "2026. 10. 13." });
  assert.equal(a.width, 1080);
  assert.ok(a.height > 1200);
  for (const op of a.ops) {
    if (op.type === "rect") assert.ok(op.x >= 0 && op.y >= 0 && op.x + op.w <= a.width && op.y + op.h <= a.height, "칸이 이미지 밖으로 나가지 않는다");
    else if (op.type === "mark") assert.ok(op.x >= 0 && op.y >= 0 && op.x + op.size <= a.width && op.y + op.size <= a.height, "캐릭터가 이미지 밖으로 나가지 않는다");
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

test("카드 배치: 맨 위 연보라 띠에 캐릭터 자리가 있고, 글은 캐릭터와 겹치지 않으며, 칸은 둥글게 색으로만 나눈다(띠 · 선 없음)", () => {
  const { card } = buildTalkModel(R, { typeTitle: legacyTypeTitle("확인추구형") });
  for (const variant of ["save", "share"] as const) {
    const { ops } = layoutCard(card, { variant, measure, name: "서윤", dateLabel: "2026. 10. 13." });
    const marks = ops.filter((op) => op.type === "mark");
    assert.equal(marks.length, 1, "캐릭터 자리는 하나");
    const mark = marks[0] as Extract<(typeof ops)[number], { type: "mark" }>;
    const band = ops.find((op) => op.type === "rect" && op.color === "accent-soft" && op.y === 0 && op.x === 0) as Extract<(typeof ops)[number], { type: "rect" }> | undefined;
    assert.ok(band && mark.y + mark.size <= band.h, "캐릭터는 연보라 띠 안에 있다");
    const head = ops.filter((op): op is Extract<(typeof ops)[number], { type: "text" }> => op.type === "text" && op.y < band!.h);
    assert.ok(head.length >= 3 && head.some((t) => t.text === "ME:U 미유") && head.some((t) => t.text.includes("분석 카드")) && head.some((t) => t.text === "관계에서 확인을 중요하게 여기는 편"));
    for (const t of head) if (t.align !== "right") assert.ok(t.x >= mark.x + mark.size, `띠 안의 글이 캐릭터를 가리지 않는다: ${t.text}`);
    // 그리는 순서: 띠 → 캐릭터 → 띠 안의 글 (띠를 글보다 나중에 그리면 글이 가려진다)
    const order = (op: (typeof ops)[number]) => ops.indexOf(op);
    assert.ok(order(band!) < order(mark) && head.every((t) => order(t) > order(band!)), "띠가 띠 안의 글보다 먼저 그려진다");
    for (const chipRect of ops.filter((op) => op.type === "rect" && op.color === "canvas" && op.r !== undefined && op.y < band!.h)) {
      assert.ok(order(chipRect) > order(band!), "대표 경향 칸(흰색)도 띠 위에 그려진다");
    }
    // 칸마다 왼쪽 띠(너비 8px 막대)를 두지 않고 모서리만 둥글린다
    assert.ok(!ops.some((op) => op.type === "rect" && op.w <= 10 && op.h > 40), "왼쪽 띠가 없다");
    assert.ok(ops.filter((op) => op.type === "rect" && op.r !== undefined).length >= 4, "칸(대표 경향 · 강한 포인트 · 힘들 수 있는 포인트 · 시기)은 둥근 모서리");
    assert.ok(!ops.some((op) => op.type === "rect" && op.color === "line"), "구분선(line 색)을 쓰지 않는다");
  }
});

const norm = (t: string) => t.replace(/\s+/g, " ").trim();
const bubbleText = (b: TalkBubble): string[] =>
  b.kind === "text" ? [b.text] : b.kind === "answer" ? [b.headline, ...b.paragraphs] : b.kind === "traits" ? b.traits.flatMap((t) => [t.shinesShort, t.burdenShort]) : b.kind === "timeline" ? [] : b.kind === "flow" ? [b.when, b.helpful, ...b.steps.map((x) => x.text)] : b.kind === "comfort" ? [...b.comfortable, ...b.clash, b.note] : [];

test("첫 화면 묶음: [내 성향] [연애 · 관계] [일 · 돈] [앞으로의 시기] — 모든 주제가 어느 묶음엔가 들어 있고, 번호는 칩에 붙이지 않는다", () => {
  const m = buildTalkModel(R);
  assert.deepEqual(m.groups.map((g) => g.chip), ["내 성향", "연애 · 관계", "일 · 돈", "앞으로의 시기"]);
  assert.deepEqual(m.groups[0].topicIds, ["tendency", "strength-burden", "values"], "내 성향 안에서 강한 포인트 · 힘들 수 있는 포인트, 중요하게 여기는 것이 이어진다");
  assert.deepEqual(m.groups.flatMap((g) => g.topicIds).sort(), m.topics.map((t) => t.id).sort(), "빠지거나 겹치는 주제가 없다");
  assert.ok(m.groups.every((g) => !/\d/.test(g.chip)));
  // 알려 준 고민이 있으면 그 주제도 묶음으로 보인다
  const withFocus = buildTalkModel({ ...R, focus: [{ text: "알려 주신 고민을 반영하면, 답을 기다리는 시간이 길게 느껴질 수 있습니다.", evidence: ["saju.daymaster"] }] });
  assert.equal(withFocus.groups.at(-1)?.chip, "알려 주신 고민");
});

test("말풍선: 답변 한 번에 말풍선 1~2개(풀이 하나 + 내 경험을 묻는 질문 하나)이고, 문단은 쪼개지 않으며 글자는 바꾸지 않는다", () => {
  const m = buildTalkModel(R);
  for (const topic of m.topics) {
    const a = answerBubbles(topic, m.name);
    // 말풍선으로 세는 것: 풀이(answer)와 질문(안내가 아닌 글) — 그림 · 작은 안내는 세지 않는다
    const counted = a.filter((b) => b.kind === "answer" || (b.kind === "text" && !b.muted && b.text !== topic.periodExample));
    assert.ok(counted.length >= 1 && counted.length <= 2, `${topic.id}: 말풍선 ${counted.length}개`);
    const first = a[0];
    assert.equal(first.kind, "answer");
    if (first.kind === "answer") assert.deepEqual(first.paragraphs, topic.summary, "요약은 저장된 글 그대로 한 말풍선에");
    const last = a[a.length - 1];
    assert.ok(last.kind === "text" && !last.muted && last.text === askFor(topic.id, m.name), `${topic.id}: 마지막은 내 경험을 묻는 질문`);
    assert.match(askFor(topic.id, m.name), /\?$/);
    // 예시 · 자세히는 문단 하나가 말풍선 하나다 (문장 단위로 쪼개 보내지 않는다)
    for (const which of ["example", "detail"] as const) {
      const pieces = which === "example" ? topic.example : topic.detail;
      const bs = extraBubbles(topic, which);
      assert.equal(bs.length, pieces.length, `${topic.id} ${which}: 문단 수와 말풍선 수가 같다`);
      for (const [i, p] of pieces.entries()) if (p.kind === "para" || p.kind === "note") assert.equal(bs[i].kind === "text" ? bs[i].text : "", p.text, "글자 그대로");
    }
  }
});

test("대화 말풍선은 모두 저장된 리포트의 글에서 나온다 — 답 · 예시 · 자세히 · 근거 어느 것도 새로 쓰지 않는다 (AI 호출 없음)", () => {
  const pool = [...allStrings(R)].map(norm);
  for (const t of buildTalkModel(R).topics) {
    const all = [...answerBubbles(t, "서윤").filter((b) => !(b.kind === "text" && !b.muted && b.text === askFor(t.id, "서윤"))), ...extraBubbles(t, "example"), ...extraBubbles(t, "detail")];
    // 지금 나의 시기의 예시 한 줄은 저장된 글이 아니라 계산된 현재 시기의 그룹을 쉬운 말로 옮긴 고정 문구(period-plain.ts)다 — 아래에서 따로 확인한다
    for (const b of all) for (const text of bubbleText(b)) assert.ok(text === t.periodExample || pool.some((p) => p.includes(norm(text))), `${t.id}: 저장된 글에 없는 말풍선 — ${text.slice(0, 30)}`);
    const basis = extraBubbles(t, "basis");
    assert.deepEqual(basis.length ? (basis[0] as { basis: unknown }).basis : null, t.basis);
    // 답은 결론 한 줄 + 요약을 한 말풍선으로 시작하고, 그 말풍선은 하나뿐이다
    const a = answerBubbles(t, "서윤");
    assert.equal(a[0].kind, "answer");
    assert.equal(a.filter((b) => b.kind === "answer").length, 1);
  }
  const m = buildTalkModel(R);
  const by = (id: string) => m.topics.find((t) => t.id === id)!;
  assert.ok(answerBubbles(by("strength-burden")).some((b) => b.kind === "traits"), "특징 주제는 강한 포인트 · 힘들 수 있는 포인트 카드");
  assert.ok(answerBubbles(by("flow")).some((b) => b.kind === "timeline"), "시기는 계산된 기간 그림");
  // 시기 설명은 쉬운 제목 → 생활 의미(카드) → 예시(이어지는 말풍선) 순서이고, 예시는 계산된 현재 시기의 그룹에서 온다
  const cur = R.timeline.find((s) => s.role === "current")!;
  const flowAnswer = answerBubbles(by("flow"));
  const at = flowAnswer.findIndex((b) => b.kind === "timeline");
  assert.equal(by("flow").periodExample, periodPlain(cur.stemGroup, cur.branchGroup).example);
  assert.deepEqual(flowAnswer[at + 1], { kind: "text", text: periodPlain(cur.stemGroup, cur.branchGroup).example }, "카드 다음 말풍선이 예시");
  assert.equal(by("tendency").periodExample, undefined, "다른 주제에는 시기 예시가 없다");
  assert.ok(extraBubbles(by("love"), "example").some((b) => b.kind === "flow") && extraBubbles(by("love"), "detail").some((b) => b.kind === "comfort"));
  // 안내(caveat · 예측이 아님)는 작은 안내 말풍선으로 남는다
  assert.ok(answerBubbles(by("love")).some((b) => b.kind === "text" && b.muted), "자료 없음 안내");
});

test("대화 속 고정 문구: 친구에게 말하듯 해요체이고, 풀이 내용 · 사주 용어 · 합쇼체가 없다", () => {
  const flat = (v: unknown): string[] => (typeof v === "string" ? [v] : typeof v === "function" ? [String((v as (n: string) => string)("서윤"))] : v && typeof v === "object" ? Object.values(v).flatMap(flat) : []);
  const copy = Object.values(TALK_COPY).flatMap(flat);
  for (const t of copy) assert.doesNotMatch(String(t), /습니다|합니다|입니다|됩니다/, `합쇼체: ${t}`);
  assert.equal(TALK_COPY.buttons.concern, "고민 말하기");
  assert.match(TALK_COPY.freeQuestion, /준비 중/);
  assert.match(TALK_COPY.notice, /AI가 새로 쓰는 글이 아니고/);
});

// ───────── 월별 달력 답장 (저장된 달력으로 만든 고정 문구 · AI 없음) ─────────

const bubbleTexts = (bs: TalkBubble[]) => bs.flatMap((b) => (b.kind === "text" ? [b.text, ...(b.label ? [b.label] : [])] : []));
const MONTH_REF = /(\d{4})년 (\d{1,2})월/g;

test("달력 답장: 앞으로의 시기 주제에만 달력 버튼이 있고, 말하는 달은 모두 저장된 달력의 앞으로 12개월 안에 있다", () => {
  const m = buildTalkModel(R);
  assert.deepEqual(m.topics.filter((t) => t.calendar).map((t) => t.id), ["flow"]);
  const flow = m.topics.find((t) => t.id === "flow")!;
  assert.ok(flow.calendar && flow.calendar.items.length === 3);
  const stored = new Set(flow.calendar.items.flatMap((c) => c.months.map((x) => `${x.startsOn.slice(0, 4)}년 ${x.startMonth}월`)));
  const ref = flow.calendar.reference;
  const from = `${ref.year}-${String(ref.month).padStart(2, "0")}`;
  for (const which of ["calendar-love", "calendar-money"] as const) {
    const texts = bubbleTexts(extraBubbles(flow, which));
    assert.ok(texts.length >= 2, which);
    for (const t of texts) for (const [full, y, mo] of t.matchAll(MONTH_REF)) {
      assert.ok(stored.has(full), `${t} — 저장된 달력에 없는 달 ${full}`);
      assert.ok(`${y}-${String(mo).padStart(2, "0")}` >= from, `${full}은 기준 달 ${from}보다 앞이다`);
    }
  }
});

test("달력 답장: 첫 말풍선은 앞으로 12개월 요약이고, 큰 달이 있으면 큰 달만 · 없으면 조금 움직이는 달 네 개까지 보이며 한계 안내가 따라온다", () => {
  const flow = buildTalkModel(R).topics.find((t) => t.id === "flow")!;
  for (const which of ["calendar-love", "calendar-money"] as const) {
    const bs = extraBubbles(flow, which);
    const first = bs[0];
    assert.ok(first.kind === "text" && /^앞으로 12개월 동안/.test(first.text), which);
    const labeled = bs.filter((b): b is Extract<TalkBubble, { kind: "text" }> => b.kind === "text" && Boolean(b.label));
    const levels = new Set(labeled.map((b) => b.label!.split(" · ")[1]));
    assert.ok(levels.size <= 1, "한 번에 한 단계만 보인다");
    if (levels.has("조금 움직이는 달") || levels.has("연애운이 조금 움직이는 달")) assert.ok(labeled.length <= 4);
    const muted = bs.filter((b) => b.kind === "text" && b.muted).map((b) => (b.kind === "text" ? b.text : ""));
    if (labeled.length > 0) {
      assert.ok(muted.some((t) => /검증된 사실이 아니에요/.test(t)), "한계 안내");
      assert.ok(muted.some((t) => /월별 달력/.test(t)), "더 보는 곳 안내");
    }
    for (const t of bubbleTexts(bs)) {
      assert.doesNotMatch(t, /점수|확률|만나게 돼요|헤어지게|돈이 들어와요|반드시/, t);
    }
  }
});

test("달력 답장: 성별 정보가 없으면 가까운 관계 달력은 이유만 알리고, 달력이 없는 이전 리포트에는 버튼 자체가 없다", () => {
  const noGender = { ...R, calendars: { ...R.calendars!, items: R.calendars!.items.map((c) => ({ ...c, usedSpouseStar: false })) } } satisfies IntegratedReadingReport;
  const flow = buildTalkModel(noGender).topics.find((t) => t.id === "flow")!;
  const love = bubbleTexts(extraBubbles(flow, "calendar-love")).join(" ");
  assert.match(love, /성별 정보가 없어/);
  assert.doesNotMatch(love, MONTH_REF);
  assert.ok(bubbleTexts(extraBubbles(flow, "calendar-money")).join(" ").match(MONTH_REF) || /눈에 띄는 달이 없어요/.test(bubbleTexts(extraBubbles(flow, "calendar-money")).join(" ")));

  const { calendars: _omit, ...legacy } = R;
  void _omit;
  const old = buildTalkModel(legacy as IntegratedReadingReport);
  assert.ok(old.topics.every((t) => !t.calendar));
  assert.deepEqual(extraBubbles(old.topics.find((t) => t.id === "flow")!, "calendar-love"), []);
});

test("달력 답장: 버튼 이름이 있고 같은 입력이면 같은 말풍선이다(저장된 달력만 쓴다)", () => {
  assert.equal(TALK_COPY.buttons["calendar-love"], "연애운이 강해지는 달은?");
  assert.equal(TALK_COPY.buttons["calendar-money"], "재물이 눈에 띄는 달은?");
  const flow = buildTalkModel(R).topics.find((t) => t.id === "flow")!;
  assert.deepEqual(extraBubbles(flow, "calendar-love"), extraBubbles(flow, "calendar-love"));
});

test("소단락 답장: [더 자세히 알려줘]는 소단락(제목 이름표 → 풀이 → 해 볼 것)부터 말풍선으로 보내고, 모두 저장된 리포트의 글이다", () => {
  const m = buildTalkModel(R);
  for (const id of ["love", "work-money"]) {
    const t = m.topics.find((x) => x.id === id)!;
    const block = R.blocks.find((b) => b.id === id)!;
    assert.equal(block.sections?.length, 3);
    const bubbles = extraBubbles(t, "detail");
    const labeled = bubbles.filter((b): b is Extract<TalkBubble, { kind: "text" }> => b.kind === "text" && Boolean(b.label));
    // 소단락마다 제목 이름표 한 번(풀이의 첫 말풍선) · "해 볼 것" 이름표 한 번
    for (const s of block.sections!) {
      assert.ok(labeled.some((b) => b.label === s.title), `${id}: 제목 이름표 ${s.title}`);
      assert.ok(bubbles.some((b) => b.kind === "text" && b.text.includes(s.tryIt.split(". ")[0].replace(/\.$/, "")) ), `${id}: 해 볼 것 ${s.tryIt}`);
    }
    assert.equal(labeled.filter((b) => b.label === "해 볼 것").length, 3);
    // 순서: 첫 소단락 제목이 가장 먼저 나온다
    assert.equal(labeled[0].label, block.sections![0].title);
    // 말풍선의 글은 모두 저장된 리포트에 있다 (새 글을 쓰지 않는다)
    const stored = [...allStrings(R)].join("\n");
    for (const b of bubbles) if (b.kind === "text") assert.ok(R.blocks.some((x) => [...allStrings(x)].some((str) => str.includes(b.text))) || stored.includes(b.text), `저장된 글에 없는 말풍선: ${b.text}`);
  }
  // 소단락이 없는 주제의 [더 자세히]에는 소단락이 없다
  const tendency = m.topics.find((x) => x.id === "tendency")!;
  assert.ok(!extraBubbles(tendency, "detail").some((b) => b.kind === "text" && b.label === "해 볼 것"));
});
