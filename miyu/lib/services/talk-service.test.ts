// 실행: npm test — 대화 저장: 내 검사 결과에만 저장 · 불러오기, 모양 · 크기 검사, 지난 날짜 정리, 테이블이 없을 때의 동작
import assert from "node:assert/strict";
import test from "node:test";
import type { RoomAction } from "../report/reading/talk-room.ts";
import { listSavedRoomKeys, loadTalkRoom, resetTalkRoom, saveTalkRoom, TALK_ROOM_KEY, TALK_SAVE_MAX_CHARS } from "./talk-service.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";
import type { AssessmentRecord, MiyuRepository } from "./ports.ts";

async function setup() {
  const mem = createMemoryRepository();
  const base = { channel: "web", nickname: "서윤", calendar: "solar", isLeapMonth: false, birthYear: 1994, birthMonth: 11, birthDay: 7, birthTime: "08:40", knownMbti: null, answers: {}, contentVersion: "t", source: "sample", summary: {}, saju: { status: "not-connected" } } as unknown as Omit<AssessmentRecord, "id" | "createdAt" | "userId">;
  const mine = await mem.repo.insertAssessment({ ...base, userId: "u1" });
  const other = await mem.repo.insertAssessment({ ...base, userId: "u2" });
  return { mem, repo: mem.repo, mine: mine.id, other: other.id };
}
const actions: RoomAction[] = [{ t: "intake", option: "some" }, { t: "feel", topic: "love", kind: "yes" }, { t: "free", q: "연락이 뜸한 사람이 있어요", a: ["정해서 말할 수는 없어요."], topic: "love" }];

test("저장과 불러오기: 내 검사 결과의 방에만 저장하고, 같은 방을 열면 같은 행동 목록이 돌아온다", async () => {
  const { repo, mine } = await setup();
  assert.deepEqual(await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love", actions }), { ok: true });
  assert.deepEqual(await loadTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love" }), actions);
  assert.deepEqual(await loadTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "money" }), [], "다른 방은 비어 있다");
  assert.deepEqual(await listSavedRoomKeys(repo, { userId: "u1", assessmentId: mine }), ["love"]);
  // 같은 방에 다시 저장하면 덮어쓴다 (한 방 한 줄)
  await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love", actions: actions.slice(0, 1) });
  assert.deepEqual(await loadTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love" }), actions.slice(0, 1));
});

test("남의 검사 결과에는 저장도 불러오기도 지우기도 되지 않는다", async () => {
  const { repo, other, mine } = await setup();
  assert.deepEqual(await saveTalkRoom(repo, { userId: "u1", assessmentId: other, roomKey: "love", actions }), { ok: false, reason: "not-found" });
  await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love", actions });
  assert.deepEqual(await loadTalkRoom(repo, { userId: "u2", assessmentId: mine, roomKey: "love" }), []);
  assert.deepEqual(await listSavedRoomKeys(repo, { userId: "u2", assessmentId: mine }), []);
  assert.deepEqual(await resetTalkRoom(repo, { userId: "u2", assessmentId: mine, roomKey: "love" }), { ok: false, reason: "not-found" });
  assert.equal((await loadTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love" })).length, actions.length, "남이 지우려 해도 그대로다");
});

test("모양 · 크기 검사: 모르는 행동은 버리고, 글자 수 · 개수 한도를 넘는 저장은 거절하며, 방 이름 형식이 맞아야 한다", async () => {
  const { repo, mine } = await setup();
  assert.ok(TALK_ROOM_KEY.test("daily:2026-10-15") && TALK_ROOM_KEY.test("concern") && !TALK_ROOM_KEY.test("../x") && !TALK_ROOM_KEY.test("Love"));
  assert.deepEqual(await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "../x", actions }), { ok: false, reason: "invalid" });
  await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love", actions: [...actions, { t: "x" }, null, { t: "topic", id: "<script>" }, { t: "free", q: "가".repeat(301), a: ["x"] }] });
  assert.deepEqual(await loadTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love" }), actions);
  const many = Array.from({ length: 250 }, () => ({ t: "topic", id: "love" }));
  const r = await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "career", actions: many });
  assert.equal(r.ok, true);
  assert.equal((await loadTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "career" })).length, 200, "200개까지만 남긴다");
  const big = Array.from({ length: 200 }, () => ({ t: "free", q: "가".repeat(300), a: ["나".repeat(600), "나".repeat(600), "나".repeat(600), "나".repeat(600), "나".repeat(600), "나".repeat(600)] }));
  assert.ok(JSON.stringify(big).length > TALK_SAVE_MAX_CHARS);
  assert.deepEqual(await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "money", actions: big }), { ok: false, reason: "invalid" });
});

test("목록이 비면 저장을 지우고, 새로 시작하기는 그 방만 지운다", async () => {
  const { repo, mine } = await setup();
  await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love", actions });
  await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "money", actions });
  await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love", actions: [] });
  assert.deepEqual(await listSavedRoomKeys(repo, { userId: "u1", assessmentId: mine }), ["money"]);
  assert.deepEqual(await resetTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "money" }), { ok: true });
  assert.deepEqual(await listSavedRoomKeys(repo, { userId: "u1", assessmentId: mine }), []);
});

test("오늘의 한 장은 날짜별 방이고, 새 날짜를 저장하면 지난 날짜의 방은 함께 정리된다", async () => {
  const { repo, mine } = await setup();
  const d = (n: number): RoomAction[] => [{ t: "intake", option: n % 2 ? "work" : "mind" }];
  await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "daily:2026-10-14", actions: d(1) });
  await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love", actions });
  await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "daily:2026-10-15", actions: d(2) });
  assert.deepEqual((await listSavedRoomKeys(repo, { userId: "u1", assessmentId: mine })).sort(), ["daily:2026-10-15", "love"]);
  // 같은 날 다시 열면 그 날의 한 장을 되살린다 (내일은 새 한 장)
  assert.deepEqual(await loadTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "daily:2026-10-15" }), d(2));
  assert.deepEqual(await loadTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "daily:2026-10-16" }), []);
});

test("DB 변경 12번 전(테이블 없음): 불러오기는 비어 있고 저장은 '아직 준비 안 됨'으로 알려 화면이 이 기기 저장으로 돌아가게 한다", async () => {
  const { repo, mine } = await setup();
  const missing = Object.assign(new Error("talk_rooms 테이블이 없습니다"), { code: "42P01" });
  const noTable: MiyuRepository = { ...repo, upsertTalkRoom: async () => { throw missing; }, getTalkRoom: async () => null, listTalkRoomKeys: async () => [] };
  assert.deepEqual(await saveTalkRoom(noTable, { userId: "u1", assessmentId: mine, roomKey: "love", actions }), { ok: false, reason: "not-ready" });
  assert.deepEqual(await loadTalkRoom(noTable, { userId: "u1", assessmentId: mine, roomKey: "love" }), []);
  const broken: MiyuRepository = { ...repo, upsertTalkRoom: async () => { throw new Error("연결 오류"); } };
  await assert.rejects(saveTalkRoom(broken, { userId: "u1", assessmentId: mine, roomKey: "love", actions }), /연결 오류/);
});

test("회원 탈퇴: 대화와 자유 질문 횟수 기록이 함께 지워진다", async () => {
  const { mem, repo, mine } = await setup();
  await repo.ensureProfile("u1");
  await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love", actions });
  await repo.addChatQuestion({ userId: "u1", assessmentId: mine, roomKey: "love" });
  const r = await repo.withdrawMemberData("u1");
  assert.ok(r.ok && r.counts.talk_rooms === 1 && r.counts.chat_questions === 1);
  assert.equal(mem.talkRooms.size, 0);
  assert.equal(mem.chatQuestions.length, 0);
});
