// 실행: npm test — 미유 대화기록: 내 분석 결과의 대화방만 방마다 한 줄로(최근 대화부터), 남의 대화는 보이지 않고, 대화 내용(질문 · 답)은 목록에 실리지 않는다
import assert from "node:assert/strict";
import test from "node:test";
import type { RoomAction } from "../report/reading/talk-room.ts";
import { listMyConversations } from "./conversation-service.ts";
import { saveTalkRoom } from "./talk-service.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";
import type { AssessmentRecord } from "./ports.ts";

async function setup() {
  const mem = createMemoryRepository();
  const base = { channel: "web", nickname: "서윤", calendar: "solar", isLeapMonth: false, birthYear: 1994, birthMonth: 11, birthDay: 7, birthTime: "08:40", knownMbti: null, answers: {}, contentVersion: "t", source: "sample", summary: {}, saju: { status: "not-connected" } } as unknown as Omit<AssessmentRecord, "id" | "createdAt" | "userId">;
  const a1 = await mem.repo.insertAssessment({ ...base, userId: "u1" });
  const a2 = await mem.repo.insertAssessment({ ...base, userId: "u1" });
  const other = await mem.repo.insertAssessment({ ...base, userId: "u2" });
  return { repo: mem.repo, a1: a1.id, a2: a2.id, other: other.id };
}
const actions: RoomAction[] = [{ t: "intake", option: "some" }, { t: "free", q: "연락이 뜸한 사람이 있어요", a: ["정해서 말할 수는 없어요."], topic: "love" }];

test("대화가 있는 방만 방마다 한 줄로 나오고, 분석 결과 표시 · 방 이름 · 마지막 시각이 붙으며, 대화 내용은 목록에 없다", async () => {
  const { repo, a1, a2 } = await setup();
  await saveTalkRoom(repo, { userId: "u1", assessmentId: a1, roomKey: "love", actions });
  await saveTalkRoom(repo, { userId: "u1", assessmentId: a1, roomKey: "daily:2026-10-19", actions });
  await saveTalkRoom(repo, { userId: "u1", assessmentId: a2, roomKey: "money", actions });
  const list = await listMyConversations(repo, "u1", [
    { assessmentId: a1, subject: "서윤 님 · 1994년 11월 7일 (양력)" },
    { assessmentId: a2, subject: "서윤 님 · 두 번째 결과" },
  ]);
  assert.deepEqual(list.map((c) => `${c.assessmentId === a1 ? "1" : "2"}:${c.room}`).sort(), ["1:daily", "1:love", "2:money"]);
  for (const c of list) {
    assert.ok(c.label.length > 0 && c.mode.length > 0 && c.subject.includes("서윤") && c.updatedAt && c.readOnly === false);
    assert.ok(!JSON.stringify(c).includes("연락이 뜸한"), "질문 · 답 내용은 목록에 싣지 않는다");
  }
  // 최근 대화부터
  const times = list.map((c) => c.updatedAt!);
  assert.deepEqual([...times].sort().reverse(), times);
});

test("남의 분석 결과의 대화는 보이지 않고, 대화가 없으면 빈 목록이다", async () => {
  const { repo, a1, other } = await setup();
  assert.deepEqual(await listMyConversations(repo, "u1", [{ assessmentId: a1, subject: "내 결과" }]), [], "대화가 없다");
  await saveTalkRoom(repo, { userId: "u2", assessmentId: other, roomKey: "love", actions });
  assert.deepEqual(await listMyConversations(repo, "u1", [{ assessmentId: other, subject: "남의 결과를 내 것처럼 넘겨도" }]), [], "내 결과가 아니면 읽지 않는다");
  assert.deepEqual(await listMyConversations(repo, "u1", []), []);
});

test("모르는 방 이름은 건너뛰고, 표를 읽다 오류가 나도 다른 결과의 대화는 그대로 보인다", async () => {
  const { repo, a1, a2 } = await setup();
  await saveTalkRoom(repo, { userId: "u1", assessmentId: a2, roomKey: "love", actions });
  const broken = { ...repo, listTalkRoomKeys: async (id: string) => { if (id === a1) throw Object.assign(new Error("relation does not exist"), { code: "42P01" }); return repo.listTalkRoomKeys(id); } };
  const list = await listMyConversations(broken as never, "u1", [{ assessmentId: a1, subject: "표 없음" }, { assessmentId: a2, subject: "정상" }]);
  assert.deepEqual(list.map((c) => c.room), ["love"]);
});
