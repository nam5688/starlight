// 실행: npm test — 후기 마이그레이션(25번)이 방문 단계 이름 검사를 "나열한 목록"으로 유지하고, 그 목록이 서버 코드(FUNNEL_EVENT_NAMES)와 같은지 확인한다.
// (이름 검사를 패턴으로 느슨하게 풀면 결제 이벤트 같은 이름도 들어올 수 있다 — 실제 거절은 supabase/tests/db.test.ts · reviews.db.test.ts가 Postgres로 확인한다.)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FUNNEL_EVENT_NAMES } from "../lib/services/ports.ts";

const sql = readFileSync(new URL("../supabase/migrations/20261104000000_reviews.sql", import.meta.url), "utf8");
const first = readFileSync(new URL("../supabase/migrations/20261018000000_funnel_feedback.sql", import.meta.url), "utf8");

const namesIn = (text: string): string[] => {
  const m = /funnel_events_name_check\s+check\s*\(\s*name in \(([^)]*)\)\s*\)/s.exec(text) ?? /name text not null check \(name in \(([^)]*)\)\)/s.exec(text);
  assert.ok(m, "나열한 허용 이름 목록을 찾지 못했다");
  return [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
};

test("25번의 방문 단계 허용 이름은 8번의 다섯 이름 + 후기 이벤트 둘이고 서버 코드의 목록과 같다 — 패턴으로 풀지 않았다", () => {
  const mine = namesIn(sql);
  assert.deepEqual([...mine].sort(), [...FUNNEL_EVENT_NAMES].sort());
  const original = namesIn(first);
  assert.deepEqual(original, ["visit", "analyze_start", "analyze_complete", "preview_view", "report_view"]);
  assert.ok(original.every((n) => mine.includes(n)), "기존 이름을 빼지 않았다");
  assert.deepEqual(mine.filter((n) => !original.includes(n)), ["review_section_view", "review_all_click"]);
  assert.ok(!/name\s*~/.test(sql), "정규식 검사로 느슨하게 바꾸지 않았다");
  assert.ok(!mine.includes("payment_confirmed"));
});
