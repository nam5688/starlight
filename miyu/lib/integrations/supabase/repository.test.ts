// 실행: npm test — 가짜 Supabase 클라이언트로 저장소의 오류 처리를 확인한다
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseRepository, isMissingTableError } from "./repository.ts";

/**
 * 어떤 요청이든 같은 오류를 돌려주는 가짜 클라이언트.
 * 실제 PostgREST처럼, 저장(.single)은 상태 404에 빈 오류 객체를 돌려준다 (조회 · 삭제는 코드가 있다).
 */
function failingDb(code: string, opts: { emptySingle?: boolean } = {}): SupabaseClient {
  const result = { data: null, error: { code, message: `fake ${code}` }, status: 404 };
  const emptyResult = { data: null, error: {}, status: 404 };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    insert: () => chain,
    upsert: () => chain,
    delete: () => chain,
    single: () => Promise.resolve(opts.emptySingle ? emptyResult : result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: typeof result) => unknown) => resolve(result),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

test("내 고민 자세히 알려주기 테이블이 아직 없으면(DB 변경 5번 전) 조회는 '적은 내용 없음'으로 처리해 기존 화면이 멈추지 않는다", async () => {
  for (const code of ["PGRST205", "42P01"]) {
    const repo = createSupabaseRepository(failingDb(code));
    assert.equal(await repo.getContext("00000000-0000-4000-8000-000000000001"), null, code);
    assert.deepEqual(await repo.listContexts("00000000-0000-4000-8000-000000000002"), [], code);
  }
});

test("테이블 없음이 아닌 오류(권한 · 서버 오류)는 숨기지 않고 던진다", async () => {
  for (const code of ["42501", "XX000"]) {
    const repo = createSupabaseRepository(failingDb(code));
    await assert.rejects(repo.getContext("00000000-0000-4000-8000-000000000001"), /반영 정보 조회/);
    await assert.rejects(repo.listContexts("00000000-0000-4000-8000-000000000002"), /반영 정보 목록 조회/);
  }
});

const NEW_CONTEXT = { assessmentId: "a", userId: "u", topic: "work" as const, question: "", situation: "", matched: "", differed: "", excerpt: "", agreedAt: "2026-10-12T00:00:00.000Z" };

test("저장은 테이블이 없을 때 오류 코드를 던져, 화면이 안내 문구로 바꿔 보여 줄 수 있다 (코드가 있는 오류 · 실제처럼 404 + 빈 오류 둘 다)", async () => {
  for (const db of [failingDb("PGRST205"), failingDb("PGRST205", { emptySingle: true })]) {
    await assert.rejects(createSupabaseRepository(db).upsertContext(NEW_CONTEXT), (e: Error & { code?: string }) => isMissingTableError(e));
  }
});

test("저장이 다른 이유로 실패하면(권한 등) 테이블 없음으로 오해하지 않는다", async () => {
  await assert.rejects(createSupabaseRepository(failingDb("42501")).upsertContext(NEW_CONTEXT), (e: Error & { code?: string }) => e.code === "42501" && !isMissingTableError(e));
});
