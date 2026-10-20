/**
 * 리포트 궁합 쌍(pairs)과 기록 삭제가 같은 순간에 겹칠 때의 DB 무결성 시험 (마이그레이션 30번).
 *
 * 문제: pairs는 검사 결과(assessments)를 외래 키로 묶지 않아 쌍을 만드는 쪽이 검사 결과 행을 잠그지 않는다.
 *   기록 삭제(29번 delete_assessment_record_v2)는 "쌍이 가리키는 결과면 분석 원자료를 남긴다"를 한 번 확인한 뒤 원자료를 비우므로,
 *   그 확인과 비우기 사이(또는 아직 커밋하지 않은 쌍 만들기)에 들어오는 쌍은 삭제 쪽 눈에 보이지 않아
 *   "원자료가 빈 값인 분석을 새 쌍이 가리키는" 상태가 남을 수 있었다. 30번이 쌍 쪽에 같은 행을 잠그는 읽기(for share)와 삭제 확인을 더한다.
 *
 * 이 파일은 실제 동시 트랜잭션(psql 두 줄)으로 양쪽 순서를 모두 시험한다:
 *   · 삭제가 먼저(삭제 트랜잭션이 행을 잠근 채 열려 있는 동안 쌍 만들기 · 연결이 들어온다) → 쌍 쪽이 기다렸다가 거절된다
 *   · 쌍이 먼저(쌍 트랜잭션이 아직 커밋하지 않은 동안 삭제가 들어온다) → 삭제가 기다렸다가 쌍을 보고 원자료를 남긴다
 * 외부 DB가 아니라 로컬 스택에서만 돌린다. 29번까지 적용된 스택에 30번을 적용한 뒤 실행한다.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createHmac, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { ASSESSMENT_MODULES } from "../../lib/assessment/modules/index.ts";
import { createSupabaseRepository } from "../../lib/integrations/supabase/repository.ts";
import { createSupabasePairRepository } from "../../lib/integrations/supabase/pairs.ts";
import { EMPTY_BASIC_INFO } from "../../lib/profile/basic-info.ts";
import { manseryeokEngine as sajuEngine } from "../../lib/saju/manseryeok-engine.ts";
import { submitAssessment } from "../../lib/services/assessment-service.ts";

const URL = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
const JWT_SECRET = process.env.JWT_SECRET ?? "local-test-jwt-secret-at-least-32-characters";

function sign(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...payload })}`;
  return `${body}.${createHmac("sha256", JWT_SECRET).update(body).digest("base64url")}`;
}

const SERVICE_KEY = sign({ role: "service_role" });
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE_KEY, noSession);
const server = createSupabaseRepository(admin);
const pairs = createSupabasePairRepository(admin);

const PG = ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres", "-d", "postgres"];
const sql = (q: string) => execFileSync("psql", [...PG, "-At", "-q", "-c", q]).toString().trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = () => new Date().toISOString();

const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i, n) => [i.id, (n % 5) + 1])));
const infoOf = (nickname: string) => ({ ...EMPTY_BASIC_INFO, nickname, birthYear: "1990", birthMonth: "1", birthDay: "15", birthTime: "09:30", gender: "female" as const });

async function makeUser(): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email: `pairpurge-${randomUUID()}@example.test`, password: `pw-${randomUUID()}`, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

async function newAssessment(userId: string, nickname: string): Promise<string> {
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId, channel: "web", info: infoOf(nickname), answers, today: new Date() });
  assert.ok(saved.ok, saved.ok ? "" : saved.message);
  return saved.ok ? saved.assessment.id : "";
}

const assessmentRow = async (id: string) => (await admin.from("assessments").select().eq("id", id).single()).data as Record<string, unknown>;
const tokenOf = () => `t${randomUUID().replace(/-/g, "")}`;
const pairRow = (over: Record<string, unknown>) => ({ id: randomUUID(), token: tokenOf(), a_consent_at: iso(), a_consent_version: "v1", expires_at: new Date(Date.now() + 86_400_000).toISOString(), ...over });
const pairCount = (where: string) => Number(sql(`select count(*) from public.pairs where ${where}`));

/** 한 트랜잭션을 열어 둔 채 붙잡는 psql — 안의 문장이 행을 잠근 상태로 2초 머문다 */
async function holdOpen(script: string) {
  const child = spawn("psql", [...PG, "-At", "-q", "-c", script], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  const closed = new Promise<void>((resolve) => child.on("close", () => resolve()));
  let holding = false;
  for (let waited = 0; !holding && waited < 8000; waited += 50) {
    holding = sql("select count(*) from pg_stat_activity where wait_event = 'PgSleep'") !== "0";
    if (!holding) await sleep(50);
  }
  assert.ok(holding, `트랜잭션이 열린 채 붙잡혀 있다 (${err})`);
  return { closed, out: () => out, err: () => err };
}

const insertPairSql = (r: { id: string; token: string; userId: string; assessmentId: string }) =>
  `insert into public.pairs (id, token, a_user_id, a_assessment_id, a_consent_at, a_consent_version, expires_at) values ('${r.id}', '${r.token}', '${r.userId}', '${r.assessmentId}', now(), 'v1', now() + interval '1 day')`;

// ── 신청(쌍 만들기) × 삭제 ─────────────────────────────────────────────────────────────────────────────

test("삭제가 먼저: 삭제 트랜잭션이 결과 행을 잠근 채 열려 있는 동안 들어온 쌍 만들기는 기다렸다가 삭제 뒤에 거절된다 — 원자료가 빈 분석을 가리키는 쌍이 생기지 않는다", async () => {
  const uid = await makeUser();
  const aid = await newAssessment(uid, "삭제먼저");
  const held = await holdOpen(`begin; select public.delete_assessment_record_v2('${uid}', '${aid}'); select pg_sleep(2); commit;`);
  const t0 = Date.now();
  const racing = await admin.from("pairs").insert(pairRow({ a_user_id: uid, a_assessment_id: aid })).select();
  await held.closed;
  assert.match(held.out(), /deleted/, "삭제 함수가 처리했다");
  assert.ok(Date.now() - t0 >= 300, "삭제가 끝날 때까지 기다렸다");
  assert.match(racing.error?.message ?? "", /record_purged/, `삭제가 끝난 뒤 거절된다 (${JSON.stringify(racing.error)})`);
  assert.equal(pairCount(`a_assessment_id = '${aid}'`), 0, "이 결과를 가리키는 쌍이 없다");
  assert.equal((await assessmentRow(aid)).nickname, "삭제", "원자료는 (쌍이 없으므로) 비워졌다");
});

test("쌍이 먼저: 쌍을 만드는 트랜잭션이 아직 끝나지 않은 동안 들어온 삭제는 기다렸다가 쌍을 보고 분석 원자료를 남긴다", async () => {
  const uid = await makeUser();
  const aid = await newAssessment(uid, "쌍먼저");
  const pair = { id: randomUUID(), token: tokenOf(), userId: uid, assessmentId: aid };
  const held = await holdOpen(`begin; ${insertPairSql(pair)}; select pg_sleep(2); commit;`);
  const t0 = Date.now();
  const result = await server.purgeAssessmentRecord(uid, aid);
  await held.closed;
  assert.equal(result, "deleted");
  assert.ok(Date.now() - t0 >= 300, "쌍 트랜잭션이 끝날 때까지 삭제가 기다렸다");
  assert.equal(pairCount(`id = '${pair.id}'`), 1, "쌍은 만들어졌다");
  const row = await assessmentRow(aid);
  assert.equal(row.nickname, "쌍먼저", "쌍이 가리키는 분석의 원자료는 비워지지 않았다");
  assert.equal(row.birth_year, 1990);
  assert.ok(row.record_purged_at, "삭제 표시는 찍혔다(대화 · 리포트는 지워졌고 새 쌍은 이 결과로 만들어지지 않는다)");
});

test("쌍을 만들던 트랜잭션이 취소되면(롤백) 삭제는 쌍이 없는 것으로 보고 원자료를 비운다", async () => {
  const uid = await makeUser();
  const aid = await newAssessment(uid, "쌍롤백");
  const pair = { id: randomUUID(), token: tokenOf(), userId: uid, assessmentId: aid };
  const held = await holdOpen(`begin; ${insertPairSql(pair)}; select pg_sleep(2); rollback;`);
  const result = await server.purgeAssessmentRecord(uid, aid);
  await held.closed;
  assert.equal(result, "deleted");
  assert.equal(pairCount(`id = '${pair.id}'`), 0);
  assert.equal((await assessmentRow(aid)).nickname, "삭제");
});

// ── 수락(pair_join) × 삭제 ─────────────────────────────────────────────────────────────────────────────

async function openInvite(aUser: string, aAssessment: string) {
  const row = pairRow({ a_user_id: aUser, a_assessment_id: aAssessment });
  assert.equal((await admin.from("pairs").insert(row)).error, null);
  return row as { id: string; token: string };
}

test("수락 × 삭제(삭제가 먼저): 상대가 수락하려는 자기 결과를 삭제하는 중이면 수락은 기다렸다가 쓸 수 없는 결과로 거절되고 초대는 그대로 열려 있다", async () => {
  const a = await makeUser();
  const b = await makeUser();
  const aAss = await newAssessment(a, "수락A");
  const bAss = await newAssessment(b, "수락B삭제먼저");
  const invite = await openInvite(a, aAss);
  const held = await holdOpen(`begin; select public.delete_assessment_record_v2('${b}', '${bAss}'); select pg_sleep(2); commit;`);
  const t0 = Date.now();
  const joined = await pairs.joinPair({ token: invite.token, userId: b, assessmentId: bAss, consentVersion: "v1" });
  await held.closed;
  assert.ok(Date.now() - t0 >= 300, "삭제가 끝날 때까지 기다렸다");
  assert.deepEqual(joined, { ok: false, reason: "bad-assessment" });
  const rec = await pairs.getPair(invite.id);
  assert.equal(rec?.status, "invited");
  assert.equal(rec?.bAssessmentId, null);
});

test("수락 × 삭제(수락이 먼저): 수락 트랜잭션이 끝나기 전에 들어온 삭제는 기다렸다가 연결된 쌍을 보고 상대 쪽 원자료를 남긴다", async () => {
  const a = await makeUser();
  const b = await makeUser();
  const aAss = await newAssessment(a, "수락A2");
  const bAss = await newAssessment(b, "수락B수락먼저");
  const invite = await openInvite(a, aAss);
  const held = await holdOpen(`begin; select public.pair_join('${invite.token}', '${b}', '${bAss}', 'v1'); select pg_sleep(2); commit;`);
  const t0 = Date.now();
  const result = await server.purgeAssessmentRecord(b, bAss);
  await held.closed;
  assert.match(held.out(), /joined/);
  assert.equal(result, "deleted");
  assert.ok(Date.now() - t0 >= 300, "수락이 끝날 때까지 삭제가 기다렸다");
  const rec = await pairs.getPair(invite.id);
  assert.equal(rec?.status, "linked");
  assert.equal(rec?.bAssessmentId, bAss);
  assert.equal((await assessmentRow(bAss)).nickname, "수락B수락먼저", "연결된 쌍이 쓰는 결과의 원자료는 남는다");
  assert.equal((await assessmentRow(aAss)).nickname, "수락A2", "상대의 자료는 그대로");
});

// ── 겹치지 않을 때(순서 없는 경우)도 DB가 지킨다 ───────────────────────────────────────────────────────

test("이미 삭제한 결과(예전 범위 28번 · 새 범위 29번 모두)를 가리키는 쌍은 만들 수 없고, 수락 · 연결 변경도 막힌다 — 앱 검사가 놓쳐도 DB가 지킨다", async () => {
  const uid = await makeUser();
  const purged = await newAssessment(uid, "이미삭제29");
  assert.equal(await server.purgeAssessmentRecord(uid, purged), "deleted");
  const legacy = await newAssessment(uid, "이미삭제28");
  sql(`update public.assessments set record_deleted_at = now() where id = '${legacy}'`); // 28번 범위(원자료는 그대로, 삭제 표시만)
  for (const [label, aid, pattern] of [["29번 범위", purged, /record_purged/], ["28번 범위", legacy, /record_deleted/]] as const) {
    const r = await admin.from("pairs").insert(pairRow({ a_user_id: uid, a_assessment_id: aid }));
    assert.match(r.error?.message ?? "", pattern, `${label}: 새 쌍 거절`);
  }
  // 상대(b) 자리도 같다 — 직접 연결 변경
  const a = await makeUser();
  const b = await makeUser();
  const aAss = await newAssessment(a, "변경A");
  const invite = await openInvite(a, aAss);
  const bad = await admin.from("pairs").update({ b_user_id: b, b_assessment_id: purged, b_consent_at: iso(), b_consent_version: "v1", status: "linked" }).eq("id", invite.id);
  assert.match(bad.error?.message ?? "", /record_purged/);
  assert.equal(pairCount(`id = '${invite.id}' and b_user_id is null`), 1, "초대는 그대로");
  // pair_join 함수도 쓸 수 없는 결과는 조용히 거절한다
  const j = await pairs.joinPair({ token: invite.token, userId: uid, assessmentId: legacy, consentVersion: "v1" });
  assert.deepEqual(j, { ok: false, reason: "bad-assessment" });
});

test("보존: 이미 연결된 기존 쌍은 한쪽이 기록을 삭제한 뒤에도 연결 해제 · 철회가 되고, 상대의 자료 · 없는 결과를 가리키는 옛 쌍은 영향이 없다", async () => {
  const a = await makeUser();
  const b = await makeUser();
  const aAss = await newAssessment(a, "보존A");
  const bAss = await newAssessment(b, "보존B");
  const invite = await openInvite(a, aAss);
  assert.equal((await pairs.joinPair({ token: invite.token, userId: b, assessmentId: bAss, consentVersion: "v1" })).ok, true);
  assert.equal(await server.purgeAssessmentRecord(b, bAss), "deleted");
  assert.equal((await assessmentRow(bAss)).nickname, "보존B", "쌍이 쓰므로 원자료 남김");
  // 삭제 뒤에도 쌍의 상태 변경(연결 해제 · 철회)은 막히지 않는다 — 결과 번호 열을 바꾸지 않는 갱신이다
  const unlinked = await pairs.unlinkPair({ pairId: invite.id, userId: a });
  assert.equal(unlinked.ok, true);
  const withdrawn = await pairs.withdrawConsent({ pairId: invite.id, userId: b });
  assert.equal(withdrawn.ok, true);
  assert.equal((await assessmentRow(aAss)).nickname, "보존A");
  // 없는 결과(회원 탈퇴로 지워진 번호)를 가리키는 쌍은 예전처럼 만들어지고 열린다 — 외래 키가 없는 설계는 그대로
  const ghost = await admin.from("pairs").insert(pairRow({ a_user_id: a, a_assessment_id: randomUUID() }));
  assert.equal(ghost.error, null);
});

test("권한: 새 트리거 함수는 로그인 회원 · 비로그인이 직접 부를 수 없다", () => {
  const acl = sql(`select coalesce(p.proacl::text, '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'pairs_block_deleted_record'`);
  assert.ok(acl !== "" || sql(`select count(*) from pg_proc where proname = 'pairs_block_deleted_record'`) === "1", "함수가 있다");
  assert.ok(!/(^\{|,)=/.test(acl), `PUBLIC 실행 권한이 없다 (${acl})`);
  assert.ok(!/anon=|authenticated=/.test(acl), `anon · authenticated 실행 권한이 없다 (${acl})`);
});

test("쓰지 않는 사용자의 대화 · 질문권 같은 다른 자료는 이 장치가 건드리지 않는다 (삭제 범위는 29번 그대로)", async () => {
  const uid = await makeUser();
  const aid = await newAssessment(uid, "범위확인");
  const sibling = await newAssessment(uid, "형제분석");
  const keptBefore = sql(`select count(*) from public.assessments where user_id = '${uid}'`);
  assert.equal(await server.purgeAssessmentRecord(uid, aid), "deleted");
  assert.equal(sql(`select count(*) from public.assessments where user_id = '${uid}'`), keptBefore, "삭제는 결과 행을 지우지 않는다(원자료만 비움)");
  assert.equal((await assessmentRow(sibling)).nickname, "형제분석");
});

test("실제 Supabase와 같은 기본 권한에서도 30번은 기존 표 · 함수의 권한을 바꾸지 않고(pair_join 포함) 새 트리거 함수의 권한은 정확하며, 사전 · 사후 확인과 데이터 보존이 맞는다", () => {
  const dir = join(import.meta.dirname, "..", "migrations");
  const all = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const last = "20261109000000_pair_assessment_guard.sql";
  assert.ok(all.includes(last), "30번 파일이 있다");
  const files = all.slice(0, all.indexOf(last));
  const port = process.env.PG_PORT ?? "54329";
  const base = ["-h", "127.0.0.1", "-p", port, "-U", "postgres"];
  const db = `acl30_${process.pid}`;
  const inDb = (q: string) => execFileSync("psql", [...base, "-d", db, "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", q]).toString().trim();
  const fileIn = (f: string) => execFileSync("psql", [...base, "-d", db, "-q", "-v", "ON_ERROR_STOP=1", "-f", join(dir, f)], { stdio: ["ignore", "ignore", "pipe"] });
  execFileSync("dropdb", [...base, "--if-exists", db]);
  execFileSync("createdb", [...base, db]);
  try {
    execFileSync("bash", ["-c", `pg_dump -h 127.0.0.1 -p ${port} -U postgres -s -n auth postgres | psql -h 127.0.0.1 -p ${port} -U postgres -d ${db} -q >/dev/null 2>&1 || true`]);
    assert.equal(inDb("select to_regclass('auth.users') is not null"), "t");
    inDb(
      "alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;" +
        "alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;" +
        "alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role",
    );
    for (const f of files) fileIn(f);
    assert.equal(inDb("select has_table_privilege('service_role', 'public.orders', 'delete')"), "t", "기본 권한 조건이 적용됐다");
    const snapshot = () =>
      inDb(
        "select 'rel ' || c.relname || ' ' || coalesce(c.relacl::text, '-') from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','S','v') " +
          "union all select 'fn ' || p.oid::regprocedure::text || ' ' || coalesce(p.proacl::text, '-') from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1",
      )
        .split("\n")
        .sort();
    const sqlDir = join(import.meta.dirname, "..");
    const verdict = (file: string) => {
      const out = execFileSync("psql", [...base, "-d", db, "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-f", join(sqlDir, file)]).toString();
      return { all: out, total: out.split("\n").find((l) => l.startsWith("99|")) ?? "" };
    };
    // 데이터가 있는 상태로 적용한다 — 쌍 하나 · 삭제한 기록 하나
    const uid = randomUUID();
    inDb(`insert into auth.users (id, email) values ('${uid}', 'acl30-${uid}@example.test')`);
    const aid = randomUUID();
    inDb(`insert into public.assessments (id, user_id, channel, nickname, birth_calendar, birth_year, birth_month, birth_day, content_version, source, answers, summary, saju) values ('${aid}', '${uid}', 'web', '보존', 'solar', 1990, 1, 15, 'v', 'live', '{}', '{}', '{}')`);
    inDb(`insert into public.pairs (id, token, a_user_id, a_assessment_id, a_consent_at, a_consent_version, expires_at) values ('${randomUUID()}', 't${randomUUID().replace(/-/g, "")}', '${uid}', '${aid}', now(), 'v1', now() + interval '1 day')`);
    const nums = (r: { all: string }) => r.all.split("\n").filter((l) => /^(5|6)\|/.test(l)).map((l) => l.split("|").slice(-1)[0]);
    const pre = verdict("pair-assessment-guard-30-precheck.sql");
    assert.match(pre.total, /^99\|종합\|OK — 30번을 적용해도 된다\|이상 0개$/);
    const countsBefore = nums(pre);
    const before = snapshot();
    fileIn(last);
    const after = snapshot();
    assert.match(verdict("pair-assessment-guard-30-precheck.sql").total, /^99\|종합\|이상 — 30번을 실행하지 말고/, "이미 적용된 DB에서는 다시 실행하지 말라고 알린다");
    const post = verdict("pair-assessment-guard-30-postcheck.sql");
    assert.match(post.total, /^99\|종합\|OK — 30번이 적용됐다\|이상 0개$/);
    assert.deepEqual(nums(post), countsBefore, "적용 전후 행 수가 같다 — 30번은 데이터를 바꾸지 않는다");
    const beforeSet = new Set(before);
    const changedOrNew = after.filter((line) => !beforeSet.has(line));
    assert.deepEqual(changedOrNew.filter((l) => !/^fn (public\.)?pairs_block_deleted_record\(/.test(l)), [], "새 트리거 함수 말고는 권한이 달라진 것이 없다(pair_join 포함, 새 표도 없다)");
    assert.deepEqual(before.filter((l) => !new Set(after).has(l)), [], "기존 줄이 사라지거나 바뀌지 않았다");
    for (const role of ["anon", "authenticated"]) {
      assert.equal(inDb(`select has_function_privilege('${role}', 'public.pairs_block_deleted_record()', 'execute')`), "f", `${role}: pairs_block_deleted_record`);
      assert.equal(inDb(`select has_function_privilege('${role}', 'public.pair_join(text,uuid,uuid,text)', 'execute')`), "f", `${role}: pair_join`);
    }
    const facl = inDb("select coalesce(proacl::text, '') from pg_proc where oid = 'public.pairs_block_deleted_record()'::regprocedure");
    assert.ok(!/(^\{|,)=/.test(facl), `PUBLIC 실행 권한이 없다 (${facl})`);
    assert.equal(inDb("select has_function_privilege('service_role', 'public.pair_join(text,uuid,uuid,text)', 'execute')"), "t");
    assert.equal(inDb("select count(*) from public.pairs"), "1", "기존 쌍은 그대로");
    // 30번 파일을 한 번 더 실행하면 이미 있다는 오류로 멈춘다(두 번 적용되지 않는다)
    assert.throws(() => fileIn(last));
  } finally {
    execFileSync("dropdb", [...base, "--if-exists", db]);
  }
});
