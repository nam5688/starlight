// 실행: npm test — 상담방 입구 규칙 (분석 직후 바로 열 방 · "무료 리포트가 필요해요!" 안내 문구)
import assert from "node:assert/strict";
import { test } from "node:test";
import { isSimpleRoom } from "../chat/quota.ts";
import { NEED_REPORT_COPY, ownedStateOf, roomAfterAnalysis } from "./room-entry.ts";
import { ROOM_ORDER } from "./talk-room.ts";

test("분석 직후에는 무료 리포트로 열리는 방(나를 알아보기 · 오늘의 운세 · 연애 · 고민 상담)만 바로 열고, 심층 리포트로만 열리는 방과 고르지 않은 경우는 결과 화면이다", () => {
  assert.equal(roomAfterAnalysis(null), null);
  for (const room of ROOM_ORDER) {
    assert.equal(roomAfterAnalysis(room), isSimpleRoom(room) ? room : null, room);
  }
  assert.deepEqual(ROOM_ORDER.filter((r) => roomAfterAnalysis(r) === r).sort(), ["concern", "daily", "love", "main"]);
  for (const locked of ["year", "marriage", "career", "money"] as const) assert.equal(roomAfterAnalysis(locked), null, locked);
});

test("안내 문구: 무료 리포트가 필요하다고 알리고, 방마다 다음에 어디로 가는지 사실대로 말하며, 가격 · 마감 · 불안 표현이 없다", () => {
  assert.equal(NEED_REPORT_COPY.title, "무료 리포트가 필요해요!");
  for (const room of ROOM_ORDER) {
    const lead = NEED_REPORT_COPY.lead(room);
    assert.match(lead, /무료 분석/);
    assert.match(lead, /약 5분/);
    const next = NEED_REPORT_COPY.next(room);
    if (roomAfterAnalysis(room)) assert.match(next, /상담방으로 이어서 가요/, room);
    else assert.match(next, /먼저 보여 드려요/, room);
    for (const banned of ["지금 안 하면", "마감", "서두르", "놓치", "할인", "원"]) assert.ok(!lead.includes(banned) && !next.includes(banned), `${room} 금지 표현 ${banned}`);
  }
  assert.equal(NEED_REPORT_COPY.start, "무료 리포트 만들기");
});

test("구매했는데 방에서 풀이로 쓰지 못하는 이유: 만드는 중 · 만들지 못함 · 예전 형식을 나누고, 새 형식으로 완성됐거나 구매하지 않았으면 null이다", () => {
  const base = { paid: true, status: "ready" as const, hasContent: true, readingFormat: true };
  assert.equal(ownedStateOf(base), null, "새 형식으로 완성 — 풀이를 쓴다");
  assert.equal(ownedStateOf({ ...base, paid: false }), null, "구매하지 않음");
  assert.equal(ownedStateOf({ ...base, readingFormat: false }), "old-format", "완성됐지만 예전 형식 — 준비 중이 아니다");
  assert.equal(ownedStateOf({ ...base, status: "failed" }), "failed");
  for (const status of ["queued", "generating"] as const) assert.equal(ownedStateOf({ ...base, status, hasContent: false }), "pending", status);
  assert.equal(ownedStateOf({ paid: true, status: null, hasContent: false, readingFormat: false }), "pending", "주문은 있는데 리포트 기록이 아직 없음");
  assert.equal(ownedStateOf({ ...base, hasContent: false }), "pending", "완성이라고 돼 있지만 내용이 없으면 준비 중으로 본다");
});
