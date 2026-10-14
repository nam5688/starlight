// 실행: npm test — 방 등급 · 방마다 무료 질문 수
import assert from "node:assert/strict";
import test from "node:test";
import { CHAT_ROOMS } from "../../config/product.ts";
import { ROOM_ORDER } from "../reading/talk-room.ts";
import { isSimpleRoom, roomPolicy } from "./quota.ts";

test("운영자 지정값: 간단 리포트는 네 개 방(연애 2 · 고민 2 · 일일 1 · 나를 알아보기 0), 심층 리포트는 방마다 3", () => {
  assert.deepEqual({ ...CHAT_ROOMS.simple }, { main: 0, daily: 1, concern: 2, love: 2 });
  assert.equal(CHAT_ROOMS.deepFreeQuestions, 3);
});

test("간단 리포트(free): 네 개 방만 열리고, 나머지(올해의 흐름 · 결혼 · 진로 · 재무)는 심층 리포트로만 열린다", () => {
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

test("나를 알아보기는 간단 리포트로 질문이 없고(캐시로도 열리지 않음) 심층 리포트로 이어 준다", () => {
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
