// 실행: npm test — DB 변경 26번(pairs.relationship 열)이 아직 적용되지 않은 DB에서 리포트 궁합이 안전하게 멈추는지 확인한다(가짜 Supabase 클라이언트 · 실제 DB 연결 없음).
//  · 새 초대 만들기만 "준비 중"(db-not-ready)으로 멈추고, 사이를 빼고 성공한 척하지 않는다
//  · 기존 쌍의 읽기(select)는 새 열 이름을 부르지 않아 그대로 동작하고 사이는 null(중립)로 읽힌다
//  · 열이 있고 값이 있으면 읽고, 정해진 여섯 값이 아니면 null · 새 초대 insert에는 사이가 함께 들어간다
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ASSESSMENT_MODULES } from "../../assessment/modules/index.ts";
import { EMPTY_BASIC_INFO, type BasicInfo } from "../../profile/basic-info.ts";
import { manseryeokEngine as sajuEngine } from "../../saju/manseryeok-engine.ts";
import { submitAssessment } from "../../services/assessment-service.ts";
import { createPairInvite, type PairDeps } from "../../services/pair-service.ts";
import { createMemoryRepository } from "../../services/testing/memory-repository.ts";
import { createSupabasePairRepository, toPair } from "./pairs.ts";

const T0 = new Date("2026-10-19T00:00:00Z");
const A = "11111111-1111-4111-8111-111111111111";
const INFO_A: BasicInfo = { ...EMPTY_BASIC_INFO, nickname: "슬기", birthYear: "1996", birthMonth: "3", birthDay: "29", birthTime: "09:30", gender: "female", knownMbti: "INFJ", regionProvince: "서울특별시", regionDistrict: "마포구" };
const answersAll = (v: number) => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, v])));
type Result = { data: unknown; error: { message: string; code?: string } | null; status?: number };
/** 가짜 Supabase 클라이언트 — insert가 받은 값을 기록하고, 준비한 결과를 돌려준다. select()는 기존 열만 있는 행(= migration 26 이전)을 돌려준다 */
function fakeDb(insertResult: Result, row: Record<string, unknown>) {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    from: () => ({
      insert: (r: Record<string, unknown>) => {
        inserted.push(r);
        return { select: () => ({ single: async () => insertResult }) };
      },
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
        or: () => ({ order: () => ({ limit: async () => ({ data: [row], error: null }) }) }),
      }),
    }),
  } as unknown as SupabaseClient;
  return { db, inserted };
}
const OLD_ROW = { id: "00000000-0000-4000-8000-000000000001", token: `tok${"x".repeat(21)}`, a_user_id: A, a_assessment_id: "aid", a_consent_at: T0.toISOString(), a_consent_version: "v1", status: "invited", expires_at: T0.toISOString(), created_at: T0.toISOString() };

test("migration 26이 없는 DB: 새 초대 만들기만 \"준비 중\"으로 멈추고(사이를 빼고 성공한 척하지 않는다) 기존 쌍의 읽기는 사이를 null로 읽어 그대로 동작한다", async () => {
  const mem = createMemoryRepository(() => T0);
  const saved = await submitAssessment({ repo: mem.repo, saju: sajuEngine }, { userId: A, channel: "web", info: INFO_A, answers: answersAll(4), today: T0 });
  assert.ok(saved.ok);
  const assessmentId = saved.ok ? saved.assessment.id : "";
  const baseDeps = { repo: mem.repo, now: () => T0, saleOpen: true, generatorReady: true } as const;
  // ① 열이 없다는 오류(PostgREST PGRST204 / Postgres 42703)는 모두 db-not-ready로 멈춘다
  for (const code of ["PGRST204", "42703"]) {
    const { db, inserted } = fakeDb({ data: null, error: { message: "Could not find the 'relationship' column of 'pairs' in the schema cache", code }, status: 400 }, OLD_ROW);
    const repo = createSupabasePairRepository(db);
    await assert.rejects(() => repo.createPair({ id: OLD_ROW.id, token: OLD_ROW.token, aUserId: A, aAssessmentId: "aid", aConsentAt: T0.toISOString(), aConsentVersion: "v1", expiresAt: T0.toISOString(), relationship: "lover" }), (e: unknown) => (e as { code?: string }).code === "42P01" && /DB 변경 26번 필요/.test((e as Error).message));
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].relationship, "lover", "새 쌍은 사이를 반드시 함께 넣으려 한다(빼고 만들지 않는다)");
    const r = await createPairInvite({ ...baseDeps, pairs: repo } as PairDeps, { userId: A, assessmentId, consent: true, relationship: "lover", myGender: "female" });
    assert.equal(r.kind, "db-not-ready", code);
  }
  // ② 다른 오류는 준비 중으로 가리지 않는다
  const { db: other } = fakeDb({ data: null, error: { message: "boom", code: "XX000" }, status: 500 }, OLD_ROW);
  await assert.rejects(() => createSupabasePairRepository(other).createPair({ id: OLD_ROW.id, token: OLD_ROW.token, aUserId: A, aAssessmentId: "aid", aConsentAt: T0.toISOString(), aConsentVersion: "v1", expiresAt: T0.toISOString(), relationship: "lover" }), (e: unknown) => (e as { code?: string }).code !== "42P01");
  // ③ 읽기: select()는 새 열 이름을 부르지 않으므로 열이 없어도 같은 방식으로 읽히고 사이는 null이다
  const { db: oldDb } = fakeDb({ data: null, error: null }, OLD_ROW);
  const repo = createSupabasePairRepository(oldDb);
  assert.equal((await repo.getPair(OLD_ROW.id))?.relationship, null);
  assert.equal((await repo.getPairByToken(OLD_ROW.token))?.relationship, null);
  assert.deepEqual((await repo.listPairsForUser(A)).map((p) => p.relationship), [null]);
  // ④ 열이 있고 값이 있으면 읽고, 정해진 여섯 값이 아니면 null(특정 관계로 읽지 않는다)
  assert.equal(toPair({ ...OLD_ROW, relationship: "friend" }).relationship, "friend");
  for (const bad of ["", "FRIEND", "연인", 5, null]) assert.equal(toPair({ ...OLD_ROW, relationship: bad }).relationship, null, String(bad));
  // ⑤ 열이 있으면 새 초대 insert에 사이가 들어간다
  const ok = fakeDb({ data: { ...OLD_ROW, relationship: "engaged" }, error: null }, OLD_ROW);
  const made = await createSupabasePairRepository(ok.db).createPair({ id: OLD_ROW.id, token: OLD_ROW.token, aUserId: A, aAssessmentId: "aid", aConsentAt: T0.toISOString(), aConsentVersion: "v1", expiresAt: T0.toISOString(), relationship: "engaged" });
  assert.ok(made.ok && made.value.relationship === "engaged");
  assert.equal(ok.inserted[0].relationship, "engaged");
});
