// 실행: npm test — 방 등급 · 방마다 무료 질문 수
import assert from "node:assert/strict";
import test from "node:test";
import { CHAT_ROOMS } from "../../config/product.ts";
import { ROOM_ORDER } from "../reading/talk-room.ts";
import { isSimpleRoom, roomPolicy, roomQuestionNote, roomSections } from "./quota.ts";

test("운영자 지정값: 무료 리포트는 네 개 방(연애 2 · 고민 2 · 일일 1 · 나를 알아보기 0), 심층 리포트는 방마다 3", () => {
  assert.deepEqual({ ...CHAT_ROOMS.simple }, { main: 0, daily: 1, concern: 2, love: 2 });
  assert.equal(CHAT_ROOMS.deepFreeQuestions, 3);
});

test("무료 리포트(free): 네 개 방만 열리고, 나머지(올해의 흐름 · 결혼 · 진로 · 재무)는 심층 리포트로만 열린다", () => {
  const open = ROOM_ORDER.filter((r) => roomPolicy("free", r).open);
  assert.deepEqual([...open].sort(), ["concern", "daily", "love", "main"]);
  for (const r of ["year", "marriage", "career", "money"]) {
    assert.deepEqual(roomPolicy("free", r), { open: false, freeQuestions: 0, cashAllowed: false, needsDeep: true }, r);
    assert.equal(isSimpleRoom(r), false);
  }
  assert.deepEqual(roomPolicy("free", "love"), { open: true, freeQuestions: 2, cashAllowed: true, needsDeep: false });
  assert.deepEqual(roomPolicy("free", "concern"), { open: true, freeQuestions: 2, cashAllowed: true, needsDeep: false });
  assert.deepEqual(roomPolicy("free", "daily"), { open: true, freeQuestions: 1, cashAllowed: true, needsDeep: false });
});

test("나를 알아보기는 무료 리포트로 질문이 없고(캐시로도 열리지 않음) 심층 리포트로 이어 준다", () => {
  assert.deepEqual(roomPolicy("free", "main"), { open: true, freeQuestions: 0, cashAllowed: false, needsDeep: true });
});

test("심층 리포트(paid): 모든 방이 열리고 방마다 무료 질문 3번, 다 쓰면 캐시로 이어 간다", () => {
  for (const r of ROOM_ORDER) assert.deepEqual(roomPolicy("paid", r), { open: true, freeQuestions: 3, cashAllowed: true, needsDeep: false }, r);
});

test("시험용 추가 질문은 열린 방의 무료 질문만 늘린다 (질문이 없는 방 · 닫힌 방은 그대로)", () => {
  assert.equal(roomPolicy("free", "love", 5).freeQuestions, 7);
  assert.equal(roomPolicy("paid", "year", 2).freeQuestions, 5);
  assert.equal(roomPolicy("free", "main", 5).freeQuestions, 0);
  assert.equal(roomPolicy("free", "career", 5).open, false);
  assert.equal(roomPolicy("free", "love", -3).freeQuestions, 2);
});

test("방 나누기: 무료 리포트 방은 운영자 순서(나를 알아보기 · 오늘의 운세 · 고민해결소 · 연애), 나머지는 심층 리포트 방(올해의 흐름 · 결혼 · 진로 · 재무)", () => {
  const order = ["main", "daily", "year", "love", "marriage", "career", "money", "concern"] as const;
  const s = roomSections(order);
  assert.deepEqual(s.simple, ["main", "daily", "concern", "love"]);
  assert.deepEqual(s.deepOnly, ["year", "marriage", "career", "money"]);
  assert.equal(s.simple.length + s.deepOnly.length, order.length, "모든 방이 어느 한쪽에 있다");
  // 정책에 있는 방은 모두 무료 리포트 쪽
  for (const r of order) assert.equal(s.simple.includes(r), isSimpleRoom(r));
});

test("방 카드 한 줄: 방마다 무료 질문 수 · 질문 없는 방은 심층 리포트로 안내 · 닫힌 방은 심층 리포트로 열림 · AI가 연결되지 않았으면 준비 중", () => {
  assert.equal(roomQuestionNote("free", "love", true), "무료 질문 2번");
  assert.equal(roomQuestionNote("free", "concern", true), "무료 질문 2번");
  assert.equal(roomQuestionNote("free", "daily", true), "하루 무료 질문 1번");
  assert.equal(roomQuestionNote("free", "main", true), "질문은 없어요 · 자세한 이야기는 심층 리포트에서");
  assert.equal(roomQuestionNote("free", "career", true), "심층 리포트로 열려요");
  assert.equal(roomQuestionNote("free", "career", false), "심층 리포트로 열려요", "닫힌 방은 AI 연결과 상관없이 같은 안내");
  assert.equal(roomQuestionNote("free", "love", false), "질문 기능은 준비 중이에요");
  assert.equal(roomQuestionNote("paid", "career", true), "무료 질문 3번 · 더 묻고 싶으면 질문 3개 묶음 결제");
  assert.equal(roomQuestionNote("paid", "daily", true), "하루 무료 질문 3번 · 더 묻고 싶으면 질문 3개 묶음 결제");
});
