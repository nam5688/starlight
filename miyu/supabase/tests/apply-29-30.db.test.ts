/**
 * DB 검증: 29번 + 30번을 한 트랜잭션으로 적용하는 단독 파일(supabase/apply-29-30.sql)을 로컬 임시 DB(실제 Supabase와 같은 기본 권한 조건)에서 확인한다.
 * 외부 DB가 아니라 로컬 Postgres에서만 돌린다. 이 시험은 고객 기록 삭제 함수를 부르지 않는다.
 *   · 28번까지 적용한 DB(전체 / 혜택 19~22번이 없는 테스트 DB 모양)에 적용 → 29 · 30번을 따로 순서대로 적용한 DB와 구조가 같다, 기존 행은 그대로
 *   · 다시 실행하면 시작 조건에서 멈춘다 · 선행(24번 등)이 없으면 멈춘다
 *   · 끝 확인이 틀리면 전체 취소(예상하지 못한 변화 · 행 변경 · 권한 누락) — 취소 뒤에는 아무것도 남지 않는다
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";

const port = process.env.PG_PORT ?? "54329";
const base = ["-h", "127.0.0.1", "-p", port, "-U", "postgres"];
const migrationsDir = join(import.meta.dirname, "..", "migrations");
const all = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
const f29 = "20261108000000_record_delete_scope.sql";
const f30 = "20261109000000_pair_assessment_guard.sql";
const before29 = all.slice(0, all.indexOf(f29));
const BENEFIT = /^2026(1029|1030|1031|1101)/; // 19~22번(혜택) — 외부 테스트 DB에는 없다
const wrapperPath = join(import.meta.dirname, "..", "apply-29-30.sql");
const wrapper = readFileSync(wrapperPath, "utf8");
const work = mkdtempSync(join(tmpdir(), "apply2930-"));

const dbs: string[] = [];
const q = (db: string, sql: string) => execFileSync("psql", [...base, "-d", db, "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql]).toString().trim();
const fileIn = (db: string, path: string) => execFileSync("psql", [...base, "-d", db, "-At", "-q", "-v", "ON_ERROR_STOP=1", "-f", path], { stdio: ["ignore", "pipe", "pipe"] }).toString();
/** 실패해도 던지지 않고 결과를 돌려준다 */
const tryFile = (db: string, path: string): { ok: boolean; err: string } => {
  try {
    fileIn(db, path);
    return { ok: true, err: "" };
  } catch (e) {
    return { ok: false, err: String((e as { stderr?: Buffer }).stderr ?? e) };
  }
};
const mk = (name: string, template: string) => {
  const db = `${name}_${process.pid}`;
  execFileSync("dropdb", [...base, "--if-exists", db]);
  execFileSync("createdb", [...base, "-T", template, db]);
  dbs.push(db);
  return db;
};

const TPL_FULL = `a2930_full_${process.pid}`;
const TPL_TEST = `a2930_test_${process.pid}`;

function buildTemplate(db: string, files: string[]) {
  execFileSync("dropdb", [...base, "--if-exists", db]);
  execFileSync("createdb", [...base, db]);
  dbs.push(db);
  execFileSync("bash", ["-c", `pg_dump -h 127.0.0.1 -p ${port} -U postgres -s -n auth postgres | psql -h 127.0.0.1 -p ${port} -U postgres -d ${db} -q >/dev/null 2>&1 || true`]);
  q(
    db,
    "alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;" +
      "alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;" +
      "alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role",
  );
  for (const f of files) fileIn(db, join(migrationsDir, f));
}

before(() => {
  buildTemplate(TPL_FULL, before29);
  buildTemplate(TPL_TEST, before29.filter((f) => !BENEFIT.test(f)));
});
after(() => {
  for (const db of dbs.reverse()) execFileSync("dropdb", [...base, "--if-exists", db]);
});

/** 사용자 자료가 든 상태 — 분석 결과 · 쌍 · 대화방 · 질문 횟수 */
function seed(db: string) {
  const uid = randomUUID();
  const aid = randomUUID();
  q(db, `insert into auth.users (id, email) values ('${uid}', 'a2930-${uid}@example.test')`);
  q(db, `insert into public.assessments (id, user_id, channel, nickname, birth_calendar, birth_year, birth_month, birth_day, content_version, source, answers, summary, saju) values ('${aid}', '${uid}', 'web', '자료보존', 'solar', 1990, 1, 15, 'v', 'live', '{}', '{}', '{}')`);
  q(db, `insert into public.pairs (id, token, a_user_id, a_assessment_id, a_consent_at, a_consent_version, expires_at) values ('${randomUUID()}', 't${randomUUID().replace(/-/g, "")}', '${uid}', '${aid}', now(), 'v1', now() + interval '1 day')`);
  q(db, `insert into public.talk_rooms (assessment_id, room_key, user_id, actions) values ('${aid}', 'main', '${uid}', '[]'::jsonb)`);
  q(db, `insert into public.chat_questions (user_id, assessment_id, room_key) values ('${uid}', '${aid}', 'main')`);
  return { uid, aid };
}

const fingerprint = (db: string) =>
  q(
    db,
    "select string_agg(t || '=' || c, ',' order by t) from (" +
      ["assessments", "pairs", "talk_rooms", "chat_questions", "orders", "profiles", "reports"].map((t) => `select '${t}' as t, count(*)::text as c from public.${t}`).join(" union all ") +
      ") x",
  );
/** 구조 요약 — 열 · 함수 정의 · 함수 권한 · 트리거 · 표 권한(순서 · 이름 기준) */
const structure = (db: string) =>
  q(
    db,
    "select string_agg(line, E'\\n' order by line) from (" +
      "select 'col ' || table_name || '.' || column_name || ' ' || data_type as line from information_schema.columns where table_schema = 'public' " +
      "union all select 'fn ' || p.oid::regprocedure::text || ' ' || md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '-') from pg_proc p where p.pronamespace = 'public'::regnamespace " +
      "union all select 'trg ' || t.tgname || ' ' || md5(pg_get_triggerdef(t.oid)) || ' ' || t.tgenabled::text from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relnamespace = 'public'::regnamespace " +
      "union all select 'rel ' || relname || ' ' || coalesce(relacl::text, '-') from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','S','v') " +
      ") s",
  );

for (const [label, tpl] of [["28번까지 전부 적용한 DB", TPL_FULL], ["혜택 19~22번이 없는 테스트 DB 모양", TPL_TEST]] as const) {
  test(`${label}: 29 · 30번을 한 번에 적용하면 따로 순서대로 적용한 것과 구조가 같고, 사용자 자료는 한 줄도 바뀌지 않으며 삭제 함수는 부르지 않는다`, () => {
    const one = mk("a2930_one", tpl);
    const two = mk("a2930_two", tpl);
    seed(one);
    seed(two);
    const beforeRows = fingerprint(one);
    const beforeStructure = structure(one);
    // 한 번에 적용
    const run = tryFile(one, wrapperPath);
    assert.ok(run.ok, run.err);
    // 따로 순서대로 적용
    fileIn(two, join(migrationsDir, f29));
    fileIn(two, join(migrationsDir, f30));
    assert.equal(structure(one), structure(two), "한 번에 적용한 구조 = 순서대로 적용한 구조");
    assert.notEqual(structure(one), beforeStructure, "구조는 실제로 달라졌다");
    assert.equal(fingerprint(one), beforeRows, "사용자 자료 행 수 불변");
    assert.equal(q(one, "select count(*) from public.assessments where record_purged_at is not null"), "0", "어떤 기록도 삭제 완료로 바뀌지 않았다");
    assert.equal(q(one, "select nickname from public.assessments"), "자료보존", "원자료 그대로");
    // 임시 객체는 남지 않는다
    assert.equal(q(one, "select count(*) from pg_class where relname like '\\_a2930\\_%'"), "0");
    // 새 장치가 실제로 동작한다: 삭제 표시가 된 결과를 가리키는 쌍은 만들 수 없다(삭제 함수를 부르지 않고 열만 직접 표시)
    const marked = randomUUID();
    const u = q(one, "select user_id from public.assessments limit 1");
    q(one, `insert into public.assessments (id, user_id, channel, nickname, birth_calendar, birth_year, birth_month, birth_day, content_version, source, answers, summary, saju, record_deleted_at) values ('${marked}', '${u}', 'web', '표시됨', 'solar', 1990, 1, 15, 'v', 'live', '{}', '{}', '{}', now())`);
    assert.throws(() => q(one, `insert into public.pairs (id, token, a_user_id, a_assessment_id, a_consent_at, a_consent_version, expires_at) values ('${randomUUID()}', 't${randomUUID().replace(/-/g, "")}', '${u}', '${marked}', now(), 'v1', now() + interval '1 day')`), /record_deleted/);
  });
}

test("이미 적용한 DB에서 다시 실행하면 시작 조건에서 멈추고 아무것도 바뀌지 않는다 · 29번만 적용된 DB(일부만)도 멈춘다", () => {
  const db = mk("a2930_again", TPL_FULL);
  assert.ok(tryFile(db, wrapperPath).ok);
  const snapshot = structure(db);
  const again = tryFile(db, wrapperPath);
  assert.equal(again.ok, false);
  assert.match(again.err, /시작 조건 불충족 — 29 · 30번이 만드는 것이 이미 있습니다/);
  assert.equal(structure(db), snapshot);
  // 29번만 먼저 적용된 DB
  const partial = mk("a2930_partial", TPL_FULL);
  fileIn(partial, join(migrationsDir, f29));
  const r = tryFile(partial, wrapperPath);
  assert.equal(r.ok, false);
  assert.match(r.err, /시작 조건 불충족 — 29 · 30번이 만드는 것이 이미 있습니다/);
  assert.equal(q(partial, "select count(*) from pg_proc where proname = 'pairs_block_deleted_record'"), "0", "30번은 적용되지 않았다");
});

test("선행(28번 기록 삭제 · 24번 리포트 궁합 · 필요한 표)이 없으면 아무것도 바꾸지 않고 멈춘다", () => {
  const noPairs = mk("a2930_nopairs", TPL_FULL);
  q(noPairs, "drop table public.pairs cascade");
  const r1 = tryFile(noPairs, wrapperPath);
  assert.equal(r1.ok, false);
  assert.match(r1.err, /시작 조건 불충족 — 필요한 것이 없습니다: .*pairs/);
  assert.equal(q(noPairs, "select count(*) from information_schema.columns where table_name = 'assessments' and column_name = 'record_purged_at'"), "0");
  const no28 = mk("a2930_no28", TPL_FULL);
  q(no28, "alter table public.assessments drop column record_deleted_at cascade");
  const r2 = tryFile(no28, wrapperPath);
  assert.equal(r2.ok, false);
  assert.match(r2.err, /시작 조건 불충족 — 필요한 것이 없습니다: .*record_deleted_at/);
});

function variant(name: string, edit: (sql: string) => string): string {
  const out = edit(wrapper);
  assert.notEqual(out, wrapper, `${name}: 변형이 적용됐다`);
  const path = join(work, `${name}.sql`);
  writeFileSync(path, out);
  return path;
}

test("끝 확인이 틀리면 전체 취소된다 — 권한 누락 · 예상하지 못한 변화(다른 열 추가) · 사용자 행 변경 · 취소 뒤에는 아무것도 남지 않는다", () => {
  const noObjects = (db: string) => {
    assert.equal(q(db, "select count(*) from information_schema.columns where table_name = 'assessments' and column_name = 'record_purged_at'"), "0", "열이 남지 않았다");
    assert.equal(q(db, "select count(*) from pg_proc where proname in ('delete_assessment_record_v2', 'block_write_on_purged_record', 'pairs_block_deleted_record')"), "0", "함수가 남지 않았다");
    assert.equal(q(db, "select count(*) from pg_trigger where tgname like '%block_purged' or tgname = 'pairs_block_deleted_record'"), "0", "트리거가 남지 않았다");
    assert.equal(q(db, "select count(*) from pg_class where relname like '\\_a2930\\_%'"), "0", "임시 객체가 남지 않았다");
    assert.equal(q(db, "select (pg_get_functiondef('public.pair_join(text,uuid,uuid,text)'::regprocedure) ~ 'record_purged_at')::text"), "false", "pair_join도 예전 정의 그대로");
  };
  // (1) 새 트리거 함수의 권한 정리 줄이 빠지면(브라우저 역할이 실행 가능) 취소
  {
    const db = mk("a2930_acl", TPL_FULL);
    seed(db);
    const path = variant("no-revoke", (s) => s.replace("revoke all on function public.pairs_block_deleted_record() from public, anon, authenticated;", "-- (시험용으로 뺀 줄)"));
    const r = tryFile(db, path);
    assert.equal(r.ok, false);
    assert.match(r.err, /끝 확인 실패 — 브라우저 역할이 public\.pairs_block_deleted_record\(\)/);
    noObjects(db);
  }
  // (2) 예상하지 못한 변화(관계 없는 표에 열 추가)가 끼어들면 취소
  {
    const db = mk("a2930_extra", TPL_FULL);
    const path = variant("extra-column", (s) => s.replace("create temp table _a2930_before on commit drop as select * from _a2930_state;", "create temp table _a2930_before on commit drop as select * from _a2930_state;\nalter table public.orders add column zzz_extra integer;"));
    const r = tryFile(db, path);
    assert.equal(r.ok, false);
    assert.match(r.err, /예상하지 못한 변화가 있습니다: .*column orders\.zzz_extra/);
    noObjects(db);
    assert.equal(q(db, "select count(*) from information_schema.columns where table_name = 'orders' and column_name = 'zzz_extra'"), "0", "끼어든 변경도 함께 취소됐다");
  }
  // (3) 끼어든 사용자 행 변경(삭제 · 수정) → 행 수 · 내용 불변 확인에서 취소
  for (const [label, stmt] of [["행 삭제", "delete from public.assessments;"], ["행 내용 수정", "update public.assessments set nickname = '바뀜';"]] as const) {
    const db = mk("a2930_rows", TPL_FULL);
    seed(db);
    const path = variant(`rows-${label.replace(/\s/g, "")}`, (s) => s.replace("-- ═════════════════════════════════════════════════════════════════\n-- 끝 확인", `${stmt}\n-- ═════════════════════════════════════════════════════════════════\n-- 끝 확인`));
    const r = tryFile(db, path);
    assert.equal(r.ok, false, label);
    assert.match(r.err, /끝 확인 실패 — 사용자 자료의 행 수 또는 내용이 적용 전과 달라졌습니다: .*rows assessments/, label);
    noObjects(db);
    assert.equal(q(db, "select count(*) from public.assessments"), "1", `${label}: 취소돼 행이 그대로`);
    assert.equal(q(db, "select nickname from public.assessments"), "자료보존", `${label}: 취소돼 내용이 그대로`);
  }
  // (4) 30번 안의 pair_join 새 정의가 빠진 모양(예전 정의로 남음)이면 취소 — 만들어져야 할 것이 없다
  {
    const db = mk("a2930_nojoin", TPL_FULL);
    const path = variant("no-pairjoin", (s) => s.replace(/create or replace function public\.pair_join[\s\S]*?\$\$;\n/, "-- (시험용으로 뺀 정의)\n"));
    const r = tryFile(db, path);
    assert.equal(r.ok, false);
    assert.match(r.err, /끝 확인 실패 — 만들어져야 할 것이 없습니다: .*pair_join/);
    noObjects(db);
  }
});
