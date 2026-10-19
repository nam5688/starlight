// 실행: npm test — supabase/apply-4-to-10.sql(SQL Editor에서 한 번에 실행하는 통합 파일)이 마이그레이션 4~10번과 어긋나지 않았는지 확인한다.
// 실제 DB에서의 동작(임시 Postgres 16: 순차 적용과 구조 동일 · 기존 데이터 보존 · 재실행 중단 · 오류 시 전체 취소)은 이 테스트가 아니라 개발 환경에서 따로 확인했다.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { buildApplySql } from "../lib/ops/apply-sql.ts";
import { readSource } from "../lib/report/test-source.ts";

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const migrations = files.slice(3, 10).map((name) => ({ name, sql: readSource(new URL(name, dir)) }));
const checkSql = readSource(new URL("../supabase/check-migrations.sql", import.meta.url));
const committed = readSource(new URL("../supabase/apply-4-to-10.sql", import.meta.url));

test("통합 파일은 마이그레이션 4~10번에서 만든 그대로다 (마이그레이션을 고쳤다면 node scripts/render-apply-sql.ts를 다시 실행)", () => {
  assert.equal(migrations.length, 7);
  assert.deepEqual(migrations.map((m) => m.name.slice(0, 14)), ["20261014000000", "20261015000000", "20261016000000", "20261017000000", "20261018000000", "20261019000000", "20261020000000"]);
  assert.equal(committed, buildApplySql({ migrations, checkSql, firstNo: 4 }));
});

test("마이그레이션 내용이 한 글자도 바뀌지 않고 번호 순서대로 들어 있다", () => {
  let at = -1;
  for (const m of migrations) {
    const i = committed.indexOf(m.sql.trimEnd(), at + 1);
    assert.ok(i > at, `${m.name}이 순서대로 들어 있지 않음`);
    at = i;
  }
});

test("전체가 하나의 트랜잭션이다 — 시작 조건 확인이 begin 뒤에, commit이 마지막 마이그레이션 뒤 · 확인 조회 앞에 있다", () => {
  const begin = committed.indexOf("\nbegin;\n");
  const check = committed.indexOf("do $check$");
  const first = committed.indexOf(migrations[0].sql.trimEnd());
  const last = committed.lastIndexOf(migrations[6].sql.trimEnd());
  const commit = committed.indexOf("\ncommit;\n");
  const verify = committed.indexOf("-- 확인: 모든 번호의 적용 여부");
  assert.ok(begin > 0 && begin < check && check < first && first < last && last < commit && commit < verify, JSON.stringify({ begin, check, first, last, commit, verify }));
  assert.equal(committed.match(/\nbegin;\n/g)?.length, 1);
  assert.equal(committed.match(/\ncommit;\n/g)?.length, 1);
});

test("시작 조건 확인이 4~10번 각각의 대표 항목과 1~2번 표를 본다", () => {
  for (let n = 4; n <= 10; n++) assert.ok(committed.includes(`'${n}번 (`), `${n}번 확인 항목`);
  for (const t of ["profiles", "assessments", "user_regions", "orders", "payment_events", "reports", "user_consents"]) assert.ok(committed.includes(`'${t}'`), t);
  assert.match(committed, /시작 조건 불충족/);
  assert.match(committed, /아무것도 바꾸지 않았습니다/);
});

test("마지막은 읽기 전용 확인 조회이고, 통합 파일 어디에도 최상위의 데이터 삭제 · 수정 · 표 삭제 문장이 없다", () => {
  const tail = committed.slice(committed.indexOf("-- 확인: 모든 번호의 적용 여부"));
  assert.ok(tail.includes(checkSql.trimEnd()));
  assert.doesNotMatch(tail, /\b(insert|update|delete|drop|alter|create|truncate)\b\s+(into|public|table|function|index|from)/i, "확인 조회에 쓰기 문장이 없다");
  for (const line of committed.split("\n")) {
    assert.doesNotMatch(line, /^\s{0,0}(truncate|drop\s+(table|schema|function|trigger|index|policy)|delete|update|insert)\b/i, `최상위 위험 문장: ${line}`);
  }
});

// ── 스테이징(비어 있는 새 프로젝트) 전용 통합 파일: supabase/apply-staging-all.sql ──
import { buildStagingApplySql } from "../lib/ops/apply-sql.ts";

const all = files.map((name) => ({ name, sql: readSource(new URL(name, dir)) }));
const stagingCommitted = readSource(new URL("../supabase/apply-staging-all.sql", import.meta.url));

test("스테이징 통합 파일은 마이그레이션 전체에서 만든 그대로다 (마이그레이션이 늘거나 바뀌면 node scripts/render-apply-sql.ts --staging을 다시 실행)", () => {
  assert.ok(all.length >= 25, "1~25번이 모두 있다");
  assert.equal(stagingCommitted, buildStagingApplySql({ migrations: all, checkSql }));
});

test("스테이징 통합 파일: 마이그레이션 내용이 한 글자도 바뀌지 않고 번호 순서대로 들어 있다", () => {
  let at = -1;
  for (const m of all) {
    const i = stagingCommitted.indexOf(m.sql.trimEnd(), at + 1);
    assert.ok(i > at, `${m.name}이 순서대로 들어 있지 않음`);
    at = i;
  }
});

test("스테이징 통합 파일: 운영 DB에 실수로 실행되지 않게 시작 조건(앱의 표가 하나도 없어야 함)이 있고, 전체가 하나의 트랜잭션이다", () => {
  assert.match(stagingCommitted, /스테이징 전용/);
  assert.match(stagingCommitted, /운영 프로젝트에서는 실행하지 않는다/);
  for (const t of ["profiles", "orders", "assessments"]) assert.ok(stagingCommitted.includes(`'${t}'`), t);
  assert.match(stagingCommitted, /시작 조건 불충족/);
  assert.match(stagingCommitted, /아무것도 바꾸지 않았습니다/);
  const begin = stagingCommitted.indexOf("\nbegin;\n");
  const check = stagingCommitted.indexOf("do $check$");
  const first = stagingCommitted.indexOf(all[0]!.sql.trimEnd());
  const commit = stagingCommitted.indexOf("\ncommit;\n");
  const verify = stagingCommitted.indexOf("-- 확인: 모든 번호의 적용 여부");
  assert.ok(begin > 0 && begin < check && check < first && first < commit && commit < verify);
  assert.equal(stagingCommitted.match(/\nbegin;\n/g)?.length, 1);
  assert.equal(stagingCommitted.match(/\ncommit;\n/g)?.length, 1);
  assert.ok(stagingCommitted.slice(verify).includes(checkSql.trimEnd()), "마지막은 읽기 전용 확인 조회");
});

// ── DB 변경 25번(후기)만 적용하는 단독 파일: supabase/apply-25-reviews.sql (테스트 전용 DB처럼 19~22번이 없는 DB에도 쓴다) ──
import { buildReviewsApplySql } from "../lib/ops/apply-sql.ts";

const reviewsFile = files.find((f) => f.endsWith("_reviews.sql"))!;
const reviewsMigration = { name: reviewsFile, sql: readSource(new URL(reviewsFile, dir)) };
const reviewsPost = readSource(new URL("../supabase/review-25-postcheck.sql", import.meta.url));
const reviewsPre = readSource(new URL("../supabase/review-25-precheck.sql", import.meta.url));
const reviewsCommitted = readSource(new URL("../supabase/apply-25-reviews.sql", import.meta.url));

test("후기 25번 단독 파일은 마이그레이션 · 사후 확인에서 만든 그대로다 (바뀌었다면 node scripts/render-apply-sql.ts --reviews를 다시 실행)", () => {
  assert.equal(reviewsFile, "20261104000000_reviews.sql");
  assert.equal(reviewsCommitted, buildReviewsApplySql({ migration: reviewsMigration, postSql: reviewsPost }));
  assert.ok(reviewsCommitted.includes(reviewsMigration.sql.trimEnd()), "마이그레이션 내용이 한 글자도 바뀌지 않고 들어 있다");
});

test("후기 25번 단독 파일: 하나의 트랜잭션 — 시작 조건 확인 → 마이그레이션 → 끝 확인(어긋나면 전체 취소) → commit → 읽기 전용 확인 조회", () => {
  const begin = reviewsCommitted.indexOf("\nbegin;\n");
  const check = reviewsCommitted.indexOf("do $check$");
  const body = reviewsCommitted.indexOf(reviewsMigration.sql.trimEnd());
  const verify = reviewsCommitted.indexOf("do $verify$");
  const commit = reviewsCommitted.indexOf("\ncommit;\n");
  const tail = reviewsCommitted.indexOf("-- 확인: 25번 적용 결과");
  assert.ok(begin > 0 && begin < check && check < body && body < verify && verify < commit && commit < tail, JSON.stringify({ begin, check, body, verify, commit, tail }));
  assert.equal(reviewsCommitted.match(/\nbegin;\n/g)?.length, 1);
  assert.equal(reviewsCommitted.match(/\ncommit;\n/g)?.length, 1);
  assert.match(reviewsCommitted, /시작 조건 불충족/);
  assert.match(reviewsCommitted, /아무것도 바꾸지 않았습니다/);
  assert.match(reviewsCommitted, /끝 확인 실패/);
});

test("후기 25번 단독 파일: 19~22번(혜택) 표를 직접 보지 않고(보상은 서버가 설정이 켜졌을 때만), 새 허용 이름 7개 밖의 기존 이름이 있으면 멈추며, 문자열 배열 이어 붙이기는 모두 ::text로 쓴다", () => {
  const guard = reviewsCommitted.slice(reviewsCommitted.indexOf("do $check$"), reviewsCommitted.indexOf("-- 25번:"));
  assert.ok(!reviewsCommitted.slice(reviewsCommitted.indexOf("begin;")).includes("public.credit_"), "후기 파일이 질문권 표를 직접 쓰지 않는다");
  assert.match(guard, /funnel_events where name not in \('visit', 'analyze_start', 'analyze_complete', 'preview_view', 'report_view', 'review_section_view', 'review_all_click'\)/);
  for (const m of reviewsCommitted.matchAll(/problems := problems \|\| '[^']*'(?!::text)/g)) assert.fail(`::text 없는 배열 이어 붙이기: ${m[0]}`);
});

test("후기 25번 사전 · 사후 확인은 읽기 전용 조회 하나다(쓰기 문장 없음) — 사전은 막힘/OK/참고, 사후는 이상/OK/참고로 종합을 낸다", () => {
  for (const [name, sql] of [["사전", reviewsPre], ["사후", reviewsPost]] as const) {
    const code = sql.replace(/--.*$/gm, "");
    assert.doesNotMatch(code, /\b(insert\s+into|update\s+public|delete\s+from|drop\s|alter\s|create\s|truncate|grant\s|revoke\s)/i, `${name} 확인에 쓰기 문장이 없다`);
    assert.match(code, /종합/);
  }
  assert.match(reviewsPre, /다시 실행하지 않는다|막힘/);
  assert.match(reviewsPost, /이상/);
  // 사후 확인은 적용 파일 끝의 확인 조회와 같은 글이다
  assert.ok(reviewsCommitted.endsWith(`${reviewsPost.trimEnd()}\n`));
});
