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

// ── 기록 삭제 범위 확대(29번): 단독 마이그레이션 + 읽기 전용 사전 / 사후 확인 ──
const scopeFile = files.find((f) => f.endsWith("_record_delete_scope.sql"))!;
const scopeSql = readSource(new URL(scopeFile, dir));
const scopePre = readSource(new URL("../supabase/delete-scope-29-precheck.sql", import.meta.url));
const scopePost = readSource(new URL("../supabase/delete-scope-29-postcheck.sql", import.meta.url));

test("기록 삭제 범위 확대 29번: 새 파일이고 28번 파일은 건드리지 않으며, 더하기만 한다(기존 표 · 열을 지우거나 바꾸지 않는다)", () => {
  assert.equal(scopeFile, "20261108000000_record_delete_scope.sql");
  assert.ok(files.indexOf(scopeFile) >= 0 && files.indexOf(scopeFile) === files.indexOf("20261107000000_record_delete.sql") + 1, "29번은 28번 바로 다음 번호");
  const code = scopeSql.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /\b(drop\s+(table|column|function|trigger)|truncate|alter\s+table\s+\S+\s+(drop|rename|alter))/i, "기존 표 · 열을 지우거나 바꾸지 않는다(열 추가뿐)");
  // 29번이 하는 쓰기는 삭제 함수 안(본인 결과 한 건)뿐이다: 함수 밖의 최상위 문장은 열 추가 · 함수 · 트리거 · 권한이다
  const topLevel = code.replace(/\$\$[\s\S]*?\$\$/g, "$$$$");
  assert.doesNotMatch(topLevel, /\b(insert\s+into|update\s+public|delete\s+from)/i, "함수 밖에서 데이터를 바꾸는 문장이 없다");
  assert.match(code, /alter table public\.assessments\s+add column record_purged_at timestamptz;/);
  assert.equal((code.match(/create trigger /g) ?? []).length, 4);
  assert.match(code, /revoke all on function public\.block_write_on_purged_record\(\) from public, anon, authenticated;/);
  assert.match(code, /revoke all on function public\.delete_assessment_record_v2\(uuid, uuid\) from public, anon, authenticated;\s*grant execute on function public\.delete_assessment_record_v2\(uuid, uuid\) to service_role;/);
  // 두 함수 모두 security definer + 빈 search_path
  assert.equal((code.match(/security definer\s+set search_path = ''/g) ?? []).length, 2);
  // 질문 횟수 · 질문권 장부 · 주문 · 결제 증빙 표는 삭제하지 않는다
  const fnBody = scopeSql.slice(scopeSql.indexOf("create or replace function public.delete_assessment_record_v2"));
  assert.doesNotMatch(fnBody, /delete from public\.(chat_questions|cash_ledger|cash_wallets|question_packs|orders|payment_events|profiles|user_consents|ai_usage)/);
  assert.match(fnBody, /delete from public\.talk_rooms/);
  assert.match(fnBody, /delete from public\.chat_summaries where assessment_id = p_assessment_id and user_id = p_user_id/);
  assert.match(fnBody, /delete from public\.talk_transcripts where assessment_id = p_assessment_id and user_id = p_user_id/);
  // 리포트 궁합 쌍 표는 있을 때만 확인한다(없는 DB에서도 적용된다)
  assert.match(fnBody, /to_regclass\('public\.pairs'\) is not null/);
});

test("기록 삭제 범위 확대 29번 사전 · 사후 확인은 읽기 전용 조회 하나다(쓰기 문장 없음) — 종합 판정을 내고 사전은 28번까지 적용된 DB에서만 OK다", () => {
  for (const [name, sql] of [["사전", scopePre], ["사후", scopePost]] as const) {
    const code = sql.replace(/--.*$/gm, "").replace(/'(?:[^']|'')*'/g, "''"); // 주석 · 문자열 안의 안내 글은 문장이 아니다
    assert.doesNotMatch(code, /\b(insert\s+into|update\s+public|delete\s+from|drop\s|alter\s|create\s|truncate|grant\s|revoke\s|notify\s)/i, `${name} 확인에 쓰기 문장이 없다`);
    assert.match(sql, /'종합'/);
    assert.equal((code.match(/;/g) ?? []).length, 1, `${name} 확인은 문장 하나`);
  }
  assert.match(scopePre, /29번을 실행하지 말고/);
  assert.match(scopePost, /이상/);
  assert.match(scopePre, /노출|참고/);
  // 사전: 19~22 · 25번에 기대지 않는다 — 혜택 · 후기 표가 없어도 OK 판정에 영향이 없다(참고로만 보인다)
  assert.match(scopePre, /\(6, '19~22번\(혜택\) · 25번\(후기\)에 기대지 않는다[^']*', '참고'/);
  // 사후 확인의 번호 13은 notify를 안내만 하고 실행하지 않는다
  assert.match(scopePost, /notify pgrst, ''reload schema'';/);
});

test("적용 이력 확인(check-migrations.sql)에 29번 줄이 있다 — 열 · 함수 · 권한 · 트리거 4개로 적용됨 / 일부만 / 아직 안 함을 가른다", () => {
  assert.match(checkSql, /select 29, '20261108000000_record_delete_scope\.sql'/);
  assert.match(checkSql, /wd29 as \(/);
  assert.match(checkSql, /record_purged_at/);
  assert.match(checkSql, /talk_rooms_block_purged/);
});

// ── 리포트 궁합 쌍 × 기록 삭제 동시성 장치(30번): 단독 마이그레이션 + 읽기 전용 사전 / 사후 확인 ──
const guardFile = files.find((f) => f.endsWith("_pair_assessment_guard.sql"))!;
const guardSql = readSource(new URL(guardFile, dir));
const guardPre = readSource(new URL("../supabase/pair-assessment-guard-30-precheck.sql", import.meta.url));
const guardPost = readSource(new URL("../supabase/pair-assessment-guard-30-postcheck.sql", import.meta.url));

test("쌍 × 삭제 동시성 장치 30번: 29번 바로 다음 새 파일이고 28 · 29번 파일은 건드리지 않으며, 데이터를 바꾸지 않는다(트리거 하나 + pair_join 새 정의)", () => {
  assert.equal(guardFile, "20261109000000_pair_assessment_guard.sql");
  assert.equal(files.indexOf(guardFile), files.indexOf("20261108000000_record_delete_scope.sql") + 1, "30번은 29번 바로 다음 번호");
  const code = guardSql.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /\b(drop\s+(table|column|function|trigger)|truncate|alter\s+table|delete\s+from|insert\s+into)/i, "기존 표 · 열 · 행을 건드리지 않는다");
  // 함수 밖의 최상위 문장에는 데이터를 바꾸는 문장이 없다(update는 pair_join 함수 안의 한 건뿐)
  const topLevel = code.replace(/\$\$[\s\S]*?\$\$/g, "$$$$");
  assert.doesNotMatch(topLevel, /\b(insert\s+into|update\s+public|delete\s+from)/i);
  assert.equal((code.match(/create trigger /g) ?? []).length, 1);
  assert.match(code, /create trigger pairs_block_deleted_record before insert or update of a_assessment_id, b_assessment_id on public\.pairs/);
  // 삭제 함수(for update)와 같은 행을 공유 잠금(for share)으로 읽고, 삭제 완료 · 삭제 표시 둘 다 거절한다
  assert.equal((code.match(/from public\.assessments a where a\.id = new\.(a|b)_assessment_id for share/g) ?? []).length, 2);
  assert.match(code, /raise exception 'record_purged'/);
  assert.match(code, /raise exception 'record_deleted'/);
  assert.match(code, /from public\.assessments where id = p_assessment for share/);
  // 번호를 바꾸지 않는 갱신은 지나가고, 없는 결과(외래 키 없는 설계)는 거절하지 않는다
  assert.match(code, /tg_op = 'INSERT' or new\.a_assessment_id is distinct from old\.a_assessment_id/);
  const triggerFn = code.slice(code.indexOf("create or replace function public.pairs_block_deleted_record"), code.indexOf("create trigger pairs_block_deleted_record"));
  assert.ok(triggerFn.length > 200 && !/if not found/.test(triggerFn), "트리거 함수는 결과 행이 없어도(탈퇴로 지워진 번호) 거절하지 않는다");
  // 선행 조건(24 · 29번)이 없으면 아무것도 바꾸기 전에 멈춘다
  assert.match(code, /to_regclass\('public\.pairs'\) is null/);
  assert.match(code, /column_name = 'record_purged_at'/);
  // 권한: 새 트리거 함수는 아무도 직접 부르지 못하고 pair_join은 서버만(24번과 같음)
  assert.match(code, /revoke all on function public\.pairs_block_deleted_record\(\) from public, anon, authenticated;/);
  assert.match(code, /revoke all on function public\.pair_join\(text, uuid, uuid, text\) from public, anon, authenticated;\s*grant execute on function public\.pair_join\(text, uuid, uuid, text\) to service_role;/);
  assert.equal((code.match(/security definer\s+set search_path = ''/g) ?? []).length, 2);
});

test("쌍 × 삭제 동시성 30번 사전 · 사후 확인은 읽기 전용 조회 하나다(쓰기 문장 없음) — 종합 판정을 낸다", () => {
  for (const [name, sql] of [["사전", guardPre], ["사후", guardPost]] as const) {
    const code = sql.replace(/--.*$/gm, "").replace(/'(?:[^']|'')*'/g, "''");
    assert.doesNotMatch(code, /\b(insert\s+into|update\s+public|delete\s+from|drop\s|alter\s|create\s|truncate|grant\s|revoke\s|notify\s)/i, `${name} 확인에 쓰기 문장이 없다`);
    assert.match(sql, /'종합'/);
    assert.equal((code.match(/;/g) ?? []).length, 1, `${name} 확인은 문장 하나`);
  }
  assert.match(guardPre, /30번을 실행하지 말고/);
  assert.match(guardPost, /OK — 30번이 적용됐다/);
});

test("적용 이력 확인(check-migrations.sql)에 30번 줄이 있다 — 장치 · pair_join 새 정의 · 권한으로 적용됨 / 일부만 / 아직 안 함을 가른다", () => {
  assert.match(checkSql, /select 30, '20261109000000_pair_assessment_guard\.sql'/);
  assert.match(checkSql, /wd30 as \(/);
  assert.match(checkSql, /pairs_block_deleted_record/);
});
