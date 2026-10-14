// 실행: npm test — 채팅 요약: 문장 끝에서 줄이기 · 행동 목록을 질문 → 답변으로 줄이기(이전 저장 이후만) · 리포트 글을 옮겨 담지 않기 · 읽을 때 모양 확인 · 다음 질문의 참고(이전 이야기)
import assert from "node:assert/strict";
import test from "node:test";
import { SAMPLE_CHART } from "../../samples/sample-report.ts";
import { sampleReadingReport } from "../../samples/sample-reading-report.ts";
import { buildTalkModel, TALK_COPY, type TalkModel } from "../reading/talk.ts";
import { ROOMS, type RoomAction } from "../reading/talk-room.ts";
import { CHAT_SUMMARY_POLICY } from "../../config/product.ts";
import { isEmptySummary, memoryPairs, parseSummaryItems, referenceCutoff, shorten, summarizeActions, SUMMARY_LIMITS } from "./summary.ts";

const model = (): TalkModel => buildTalkModel(sampleReadingReport, { tendencyName: "확인추구형", saju: SAMPLE_CHART, today: { year: 2026, month: 10, day: 15 }, chat: { state: "ready" } });
const free = (q: string, a: string[]): RoomAction => ({ t: "free", q, a, topic: "love" });

test("shorten: 짧은 글은 그대로, 긴 글은 문장이 끝난 곳에서 줄이고 문장이 이어지면 …을 붙인다", () => {
  assert.equal(shorten("  안녕하세요.   반가워요  ", 50), "안녕하세요. 반가워요");
  const long = "첫 문장은 이렇게 끝나요. 두 번째 문장은 조금 더 길게 이어지는 이야기예요. 세 번째 문장도 있어요.";
  const cut = shorten(long, 45);
  assert.equal(cut, "첫 문장은 이렇게 끝나요. 두 번째 문장은 조금 더 길게 이어지는 이야기예요.".slice(0, cut.length));
  assert.ok(cut.endsWith("."), "문장이 끝난 곳에서 자른다");
  assert.ok(cut.length <= 45);
  const noStop = shorten("마침표 없이 계속 이어지는 아주 긴 글이라서 어디서도 자연스럽게 끊을 곳이 없어요 정말로", 30);
  assert.ok(noStop.endsWith("…") && noStop.length <= 31);
});

test("행동 목록 → 질문 · 답변: 먼저 묻는 질문은 고른 답, 내 경험 답장은 고른 말, 직접 적은 질문은 질문과 답의 앞부분, 읽은 풀이는 이름표만", () => {
  const m = model();
  const actions: RoomAction[] = [
    { t: "intake", option: "some" },
    { t: "extra", topic: "love", which: "example" },
    { t: "feel", topic: "love", kind: "mixed" },
    free("연락이 뜸한 사람이 있어요", ["천천히 확인해 볼 수 있어요. 먼저 내 마음을 살펴보세요.", "두 번째 문단이에요."]),
  ];
  const s = summarizeActions(m, "love", actions);
  assert.deepEqual(s.qa[0], { q: ROOMS.love.intake!.question, a: "썸 타는 중이에요", fixed: true });
  assert.equal(s.qa[1].a, TALK_COPY.feel.mixed.label);
  assert.equal(s.qa[1].fixed, true);
  assert.deepEqual(s.qa[2], { q: "연락이 뜸한 사람이 있어요", a: "천천히 확인해 볼 수 있어요. 먼저 내 마음을 살펴보세요. 두 번째 문단이에요." });
  assert.equal(s.qa.length, 3, "[일상 예시] 같은 보조 버튼은 질문이 아니다");

  const topics = summarizeActions(m, "main", [{ t: "group", id: m.groups[0].id }, { t: "topic", id: m.topics[0].id }, { t: "topic", id: m.topics[0].id }]);
  assert.ok(topics.read.length >= 1 && new Set(topics.read).size === topics.read.length, "읽은 풀이는 이름표만, 같은 것은 한 번");
  assert.equal(topics.qa.length, 0);
});

test("리포트의 글을 옮겨 담지 않는다: 풀이를 열어도 요약에는 풀이 이름표뿐이다", () => {
  const m = model();
  const s = summarizeActions(m, "main", m.topics.map((t) => ({ t: "topic", id: t.id }) as RoomAction));
  const body = JSON.stringify(s);
  for (const t of m.topics) {
    assert.ok(!body.includes(t.headline), `결론 문장 ${t.id}`);
    for (const p of t.summary) assert.ok(!body.includes(p), `요약 문단 ${t.id}`);
  }
});

test("이전 저장 이후의 대화만 담는다: from번째부터 요약하고, 한도를 넘는 긴 글은 줄여서 담는다", () => {
  const m = model();
  const actions: RoomAction[] = [free("첫 질문", ["첫 답이에요."]), free("둘째 질문", ["둘째 답이에요."]), free("셋째 질문", ["셋째 답이에요."])];
  assert.deepEqual(summarizeActions(m, "love", actions, 2).qa.map((p) => p.q), ["셋째 질문"]);
  assert.ok(isEmptySummary(summarizeActions(m, "love", actions, 3)), "새로 담을 대화가 없으면 비어 있다");
  assert.equal(summarizeActions(m, "love", actions, -5).qa.length, 3, "음수는 처음부터");
  const long = summarizeActions(m, "love", [free("가".repeat(300), ["나".repeat(500)])]);
  assert.ok(long.qa[0].q.length <= SUMMARY_LIMITS.questionChars + 1 && long.qa[0].a.length <= SUMMARY_LIMITS.answerChars + 1);
  const many = summarizeActions(m, "love", Array.from({ length: 60 }, (_, i) => free(`질문${i}`, ["답이에요."])));
  assert.equal(many.qa.length, SUMMARY_LIMITS.qaMax);
});

test("읽을 때 모양을 다시 확인한다: 모양이 어긋난 줄 · 빈 글 · 한도 넘는 글은 걸러 낸다", () => {
  assert.deepEqual(parseSummaryItems(null), { read: [], qa: [] });
  assert.deepEqual(parseSummaryItems("x"), { read: [], qa: [] });
  const raw = { read: ["연애", 3, "", "  "], qa: [{ q: "질문", a: "답" }, { q: "", a: "x" }, { q: "q", a: 5 }, null, { q: "고정", a: "답", fixed: true }, { q: "가".repeat(500), a: "나".repeat(500) }] };
  const s = parseSummaryItems(raw);
  assert.deepEqual(s.read, ["연애"]);
  assert.equal(s.qa.length, 3);
  assert.deepEqual(s.qa[1], { q: "고정", a: "답", fixed: true });
  assert.ok(s.qa[2].q.length <= SUMMARY_LIMITS.questionChars + 1);
});

test("다음 질문의 참고: 직접 적은 질문만 최근 몇 쌍(먼저 묻는 질문 · 내 경험 답장은 뺀다), 오래된 것이 앞에 오도록", () => {
  const newer = { read: [], qa: [{ q: "고정 질문", a: "답", fixed: true }, { q: "최근 질문1", a: "최근 답1" }, { q: "최근 질문2", a: "최근 답2" }] };
  const older = { read: [], qa: [{ q: "예전 질문1", a: "예전 답1" }, { q: "예전 질문2", a: "예전 답2" }, { q: "예전 질문3", a: "예전 답3" }] };
  const pairs = memoryPairs([newer, older]);
  assert.equal(pairs.length, SUMMARY_LIMITS.memory.pairs);
  assert.deepEqual(pairs.map((p) => p.q), ["예전 질문2", "예전 질문3", "최근 질문1", "최근 질문2"], "시간 순서(오래된 것 → 최근 것)로, 최근 요약부터 채운다");
  assert.deepEqual(memoryPairs([]), []);
  const clipped = memoryPairs([{ read: [], qa: [{ q: "가".repeat(200), a: "나".repeat(300) }] }])[0];
  assert.ok(clipped.q.length <= SUMMARY_LIMITS.memory.questionChars + 1 && clipped.a.length <= SUMMARY_LIMITS.memory.answerChars + 1);
});

test("참고 기록 보관 기간: 운영자 정책 값(90일)을 따르고, 기준 시각은 지금에서 그만큼 앞선 시각이다", () => {
  assert.equal(CHAT_SUMMARY_POLICY.referenceKeepDays, 90);
  assert.equal(SUMMARY_LIMITS.hiddenDays, CHAT_SUMMARY_POLICY.referenceKeepDays);
  assert.equal(referenceCutoff(new Date("2026-10-15T00:00:00.000Z")), "2026-07-17T00:00:00.000Z");
});
