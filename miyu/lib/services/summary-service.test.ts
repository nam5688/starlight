// 실행: npm test — 채팅 요약 저장: [저장하기](이전 저장 이후의 대화만 · 두 번 눌러도 한 번만) · 대화 종료(저장 · 저장하지 않음 = 보이지 않는 참고 기록) · 한도 · 소유자 · 목록 · 지우기 · 다음 질문의 참고 · 탈퇴 · 표가 없을 때
import assert from "node:assert/strict";
import test from "node:test";
import { SAMPLE_CHART } from "../samples/sample-report.ts";
import { sampleReadingReport } from "../samples/sample-reading-report.ts";
import { SUMMARY_LIMITS } from "../report/chat/summary.ts";
import { buildTalkModel, type TalkModel } from "../report/reading/talk.ts";
import { ROOMS, type RoomAction } from "../report/reading/talk-room.ts";
import type { AssessmentRecord, MiyuRepository } from "./ports.ts";
import { closeRoom, deleteAllSummaries, deleteSavedSummary, listSavedSummaries, memoryFor, purgeExpiredReferenceRecords, saveRoomSummary } from "./summary-service.ts";
import { loadTalkRoom, saveTalkRoom } from "./talk-service.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const model = (): TalkModel => buildTalkModel(sampleReadingReport, { tendencyName: "확인추구형", saju: SAMPLE_CHART, today: { year: 2026, month: 10, day: 15 }, chat: { state: "ready" } });
const free = (n: number): RoomAction => ({ t: "free", q: `질문${n}`, a: [`답${n}이에요.`], topic: "love" });

async function setup() {
  let tick = 0;
  const mem = createMemoryRepository(() => new Date(Date.UTC(2026, 9, 15, 3, 0, ++tick)));
  const base = { channel: "web", nickname: "서윤", calendar: "solar", isLeapMonth: false, birthYear: 1994, birthMonth: 11, birthDay: 7, birthTime: "08:40", knownMbti: null, answers: {}, contentVersion: "t", source: "sample", summary: {}, saju: { status: "not-connected" } } as unknown as Omit<AssessmentRecord, "id" | "createdAt" | "userId">;
  const mine = await mem.repo.insertAssessment({ ...base, userId: "u1" });
  const other = await mem.repo.insertAssessment({ ...base, userId: "u2" });
  const input = (actions: unknown, over: Record<string, unknown> = {}) => ({ userId: "u1", assessmentId: mine.id, roomKey: "love", room: "love", actions, model: model(), ...over });
  return { mem, repo: mem.repo, mine: mine.id, other: other.id, input };
}

test("[저장하기]: 이전 저장 이후의 대화만 요약하고, 같은 대화를 다시 저장하면 새로 담을 것이 없다고 알린다", async () => {
  const { repo, input } = await setup();
  const first = [{ t: "intake", option: "some" } as RoomAction, free(1)];
  const a = await saveRoomSummary(repo, input(first));
  assert.equal(a.ok, true);
  assert.deepEqual(await saveRoomSummary(repo, input(first)), { ok: false, reason: "empty" }, "새 대화가 없으면 저장하지 않는다");
  const b = await saveRoomSummary(repo, input([...first, free(2), free(3)]));
  assert.equal(b.ok, true);

  const groups = await listSavedSummaries(repo, "u1");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].room, "love");
  assert.equal(groups[0].label, ROOMS.love.label);
  const [latest, earlier] = groups[0].entries;
  assert.deepEqual(latest.items.qa.map((p) => p.q), ["질문2", "질문3"], "두 번째 저장은 첫 저장 이후의 대화만");
  assert.deepEqual(earlier.items.qa.map((p) => p.q), [ROOMS.love.intake!.question, "질문1"]);
  assert.ok(latest.createdAt > earlier.createdAt, "저장한 날짜가 최근인 것이 먼저");
});

test("저장 버튼을 동시에 두 번 눌러도 같은 대화가 두 번 요약되지 않는다", async () => {
  const { repo, input } = await setup();
  const actions = [free(1), free(2)];
  const results = await Promise.all([saveRoomSummary(repo, input(actions)), saveRoomSummary(repo, input(actions))]);
  assert.equal(results.filter((r) => r.ok).length, 1, "한 번만 성공");
  assert.equal((await listSavedSummaries(repo, "u1"))[0].entries.length, 1);
});

test("저장하면 대화(행동 목록)도 서버에 올라가 있고, 방 이름과 방이 어긋나거나 남의 결과면 거절한다", async () => {
  const { repo, mine, other, input } = await setup();
  await saveRoomSummary(repo, input([free(1)]));
  assert.equal((await loadTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love" })).length, 1);
  assert.deepEqual(await saveRoomSummary(repo, input([free(1)], { room: "money" })), { ok: false, reason: "invalid" }, "방 이름이 다른 방을 가리킨다");
  assert.deepEqual(await saveRoomSummary(repo, input([free(1)], { roomKey: "../x" })), { ok: false, reason: "invalid" });
  assert.deepEqual(await saveRoomSummary(repo, input([free(1)], { assessmentId: other })), { ok: false, reason: "not-found" });
  assert.deepEqual(await saveRoomSummary(repo, input([])), { ok: false, reason: "empty" });
  // 날짜별 방(오늘의 한 장)도 방 하나(daily)로 묶인다
  const day = await saveRoomSummary(repo, input([{ t: "intake", option: "work" }], { roomKey: "daily:2026-10-15", room: "daily" }));
  assert.equal(day.ok, true);
  assert.deepEqual((await listSavedSummaries(repo, "u1")).map((g) => g.room), ["daily", "love"], "방 순서(ROOM_ORDER)대로 묶인다");
});

test("대화 종료 · 저장: 마지막 저장 이후의 대화를 요약해 저장하고 방의 대화를 지운다 — 이미 저장했다면 저장한 것으로 본다", async () => {
  const { repo, mine, input } = await setup();
  const actions = [free(1), free(2)];
  const r = await closeRoom(repo, { ...input(actions), keep: true });
  assert.deepEqual(r, { ok: true, saved: true });
  assert.deepEqual(await loadTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love" }), [], "대화는 지워진다");
  assert.equal((await listSavedSummaries(repo, "u1"))[0].entries.length, 1);

  // 새 대화에서 [저장하기] 뒤 바로 종료(저장) — 새로 담을 것이 없어도 저장된 것이다
  const next = [free(5)];
  await saveRoomSummary(repo, input(next));
  assert.deepEqual(await closeRoom(repo, { ...input(next), keep: true }), { ok: true, saved: true });
  assert.equal((await listSavedSummaries(repo, "u1"))[0].entries.length, 2, "같은 대화를 또 담지 않는다");
  // 대화가 없으면 요약 없이 끝난다
  assert.deepEqual(await closeRoom(repo, { ...input([]), keep: true }), { ok: true, saved: false });
});

test("대화 종료 · 저장하지 않음: 회원 화면에는 보이지 않고, 같은 요약이 참고 기록으로 남는다", async () => {
  const { repo, mine, input, mem } = await setup();
  const r = await closeRoom(repo, { ...input([free(1), free(2)]), keep: false });
  assert.deepEqual(r, { ok: true, saved: false });
  assert.deepEqual(await loadTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love" }), [], "대화는 지워진다");
  assert.deepEqual(await listSavedSummaries(repo, "u1"), [], "저장하지 않은 요약은 목록에 보이지 않는다");
  assert.equal(await repo.countVisibleChatSummaries("u1"), 0);
  assert.equal(mem.chatSummaries.length, 1);
  assert.equal(mem.chatSummaries[0].visible, false);
  assert.deepEqual(await memoryFor(repo, { userId: "u1", assessmentId: mine, room: "love" }), [
    { q: "질문1", a: "답1이에요." },
    { q: "질문2", a: "답2이에요." },
  ]);
});

test("저장 후 이어서 나눈 대화를 저장하지 않고 끝내면, 참고 기록은 저장 이후의 대화만 담는다", async () => {
  const { repo, mem, input } = await setup();
  await saveRoomSummary(repo, input([free(1)]));
  await closeRoom(repo, { ...input([free(1), free(2)]), keep: false });
  assert.deepEqual(mem.chatSummaries.filter((s) => !s.visible).map((s) => (s.items as { qa: { q: string }[] }).qa.map((p) => p.q)), [["질문2"]]);
});

test("참고 기록: 같은 방 · 같은 검사 결과만 쓰고, 오늘의 운세 방은 쓰지 않으며, 방마다 오래된 기록은 정리한다", async () => {
  const { repo, mine, other, input, mem } = await setup();
  await closeRoom(repo, { ...input([free(1)]), keep: false });
  await closeRoom(repo, { ...input([{ t: "free", q: "돈 질문", a: ["돈 답이에요."] } as RoomAction], { roomKey: "money", room: "money" }), keep: false });
  assert.deepEqual((await memoryFor(repo, { userId: "u1", assessmentId: mine, room: "love" })).map((p) => p.q), ["질문1"], "다른 방의 이야기는 가져오지 않는다");
  assert.deepEqual(await memoryFor(repo, { userId: "u2", assessmentId: other, room: "love" }), [], "남의 기록은 보이지 않는다");
  assert.deepEqual(await memoryFor(repo, { userId: "u1", assessmentId: mine, room: "daily" }), []);
  assert.deepEqual(await memoryFor(repo, { userId: "u1", assessmentId: mine, room: "nope" }), []);
  for (let i = 0; i < SUMMARY_LIMITS.hiddenPerRoom + 5; i++) await closeRoom(repo, { ...input([free(100 + i)]), keep: false });
  assert.equal(mem.chatSummaries.filter((s) => !s.visible && s.room === "love").length, SUMMARY_LIMITS.hiddenPerRoom, "방마다 최근 몇 개만 남긴다");
});

test("직접 저장한 요약은 한도가 있고, 한도에서는 저장하겠다는 종료가 대화를 지우지 않고 알린다 (저장하지 않고 끝내기는 된다)", async () => {
  const { repo, mine, input } = await setup();
  for (let i = 0; i < SUMMARY_LIMITS.visiblePerUser; i++) await repo.insertChatSummary({ userId: "u1", assessmentId: mine, room: "love", visible: true, items: { read: [], qa: [{ q: `q${i}`, a: "a" }] } });
  assert.deepEqual(await saveRoomSummary(repo, input([free(1)])), { ok: false, reason: "limit" });
  await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love", actions: [free(1)] });
  assert.deepEqual(await closeRoom(repo, { ...input([free(1)]), keep: true }), { ok: false, reason: "limit" });
  assert.equal((await loadTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love" })).length, 1, "대화를 지우지 않는다");
  assert.deepEqual(await closeRoom(repo, { ...input([free(1)]), keep: false }), { ok: true, saved: false });
});

test("지우기: 내 요약만 지워지고, '이전 대화 기록 모두 지우기'는 저장한 요약과 참고 기록을 모두 지운다", async () => {
  const { repo, mine, input } = await setup();
  await saveRoomSummary(repo, input([free(1)]));
  await closeRoom(repo, { ...input([free(1), free(2)]), keep: false });
  const [group] = await listSavedSummaries(repo, "u1");
  assert.equal(await deleteSavedSummary(repo, "u2", group.entries[0].id), false, "남의 요약은 지울 수 없다");
  assert.equal(await deleteSavedSummary(repo, "u1", "not-an-id"), false);
  assert.equal(await deleteSavedSummary(repo, "u1", group.entries[0].id), true);
  assert.deepEqual(await listSavedSummaries(repo, "u1"), []);
  assert.equal((await memoryFor(repo, { userId: "u1", assessmentId: mine, room: "love" })).length, 1, "참고 기록은 남아 있다");
  assert.equal(await deleteAllSummaries(repo, "u1"), 1);
  assert.deepEqual(await memoryFor(repo, { userId: "u1", assessmentId: mine, room: "love" }), []);
});

test("회원 탈퇴가 채팅 요약을 모두 지운다 (저장한 것 · 참고 기록)", async () => {
  const { repo, mem, input } = await setup();
  await repo.ensureProfile("u1");
  await saveRoomSummary(repo, input([free(1)]));
  await closeRoom(repo, { ...input([free(1), free(2)]), keep: false });
  assert.equal(mem.chatSummaries.length, 2);
  const w = await repo.withdrawMemberData("u1");
  assert.equal(w.ok, true);
  assert.equal(mem.chatSummaries.length, 0);
  assert.equal((w as { counts: Record<string, number> }).counts.chat_summaries, 2);
});

test("표가 없을 때(14번 DB 변경 전): 저장은 준비 중으로 알리고, 저장하지 않고 끝내는 것은 기록 없이 끝나며, 참고는 빈 값이다", async () => {
  const { repo, mine, input } = await setup();
  const notReady = Object.assign(new Error("chat_summaries 테이블이 없습니다"), { code: "42P01" });
  const broken: MiyuRepository = { ...repo, claimTalkRoomSegment: async () => { throw notReady; }, countVisibleChatSummaries: async () => 0, listRoomChatSummaries: async () => { throw notReady; } };
  assert.deepEqual(await saveRoomSummary(broken, input([free(1)])), { ok: false, reason: "not-ready" });
  await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love", actions: [free(1)] });
  assert.deepEqual(await closeRoom(broken, { ...input([free(1)]), keep: true }), { ok: false, reason: "not-ready" });
  assert.equal((await loadTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love" })).length, 1, "저장하겠다는 종료는 대화를 지우지 않는다");
  assert.deepEqual(await closeRoom(broken, { ...input([free(1)]), keep: false }), { ok: true, saved: false });
  assert.deepEqual(await loadTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love" }), [], "저장하지 않고 끝내면 대화는 지워진다");
  assert.deepEqual(await memoryFor(broken, { userId: "u1", assessmentId: mine, room: "love" }), []);
});

test("참고 기록 보관 기간(90일): 지난 기록은 아직 지워지지 않았어도 다음 질문에서 쓰지 않고, 정기 점검이 지우며, 직접 저장한 요약은 남는다", async () => {
  let clock = new Date("2026-07-01T03:00:00Z");
  const mem = createMemoryRepository(() => clock);
  const base = { channel: "web", nickname: "서윤", calendar: "solar", isLeapMonth: false, birthYear: 1994, birthMonth: 11, birthDay: 7, birthTime: "08:40", knownMbti: null, answers: {}, contentVersion: "t", source: "sample", summary: {}, saju: { status: "not-connected" } } as unknown as Omit<AssessmentRecord, "id" | "createdAt" | "userId">;
  const mine = (await mem.repo.insertAssessment({ ...base, userId: "u1" })).id;
  const input = (actions: unknown[], keep: boolean) => ({ userId: "u1", assessmentId: mine, roomKey: "love", room: "love", actions, model: model(), keep });

  // 7월 1일: 저장하지 않고 끝낸 대화(참고 기록)와 직접 저장한 대화
  await closeRoom(mem.repo, input([free(1)], false));
  await closeRoom(mem.repo, input([free(2)], true));
  assert.deepEqual((await memoryFor(mem.repo, { userId: "u1", assessmentId: mine, room: "love" }, clock)).map((p) => p.q), ["질문1", "질문2"]);

  // 89일 뒤: 아직 보관 기간 안이다
  clock = new Date("2026-09-28T03:00:00Z");
  assert.equal((await memoryFor(mem.repo, { userId: "u1", assessmentId: mine, room: "love" }, clock)).length, 2);
  assert.equal(await purgeExpiredReferenceRecords(mem.repo, clock), 0, "기간 안의 기록은 지우지 않는다");

  // 91일 뒤: 저장하지 않은 대화의 참고 기록은 쓰지 않는다 (지워지기 전에도). 직접 저장한 요약은 계속 쓴다
  clock = new Date("2026-09-30T03:00:00Z");
  assert.deepEqual((await memoryFor(mem.repo, { userId: "u1", assessmentId: mine, room: "love" }, clock)).map((p) => p.q), ["질문2"]);
  assert.equal(mem.chatSummaries.length, 2, "아직 지우지 않았다");
  assert.equal(await purgeExpiredReferenceRecords(mem.repo, clock), 1, "정기 점검이 기간이 지난 참고 기록만 지운다");
  assert.deepEqual(mem.chatSummaries.map((x) => x.visible), [true], "직접 저장한 요약은 남는다");
  assert.equal((await listSavedSummaries(mem.repo, "u1"))[0].entries.length, 1);
  assert.equal(await purgeExpiredReferenceRecords(mem.repo, clock), 0, "다시 해도 같다");
});
