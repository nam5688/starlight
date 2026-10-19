// 시험용 리포트 궁합 쌍 저장소(메모리) — DB 변경 24번의 표 · 함수(pair_join · pair_withdraw_consent · pair_unlink)와 같은 규칙을 흉내 낸다.
// 서비스 시험은 DB 없이 이것으로 하고, SQL 자체는 supabase/tests/pairs.db.test.ts가 실제 Postgres로 확인한다.
import type { JoinPairResult, NewPair, PairChangeResult, PairRecord, PairRepository } from "../pair-ports.ts";
import type { InsertResult } from "../ports.ts";
import type { createMemoryRepository } from "./memory-repository.ts";

type Mem = ReturnType<typeof createMemoryRepository>;

export function createMemoryPairs(mem: Mem, now: () => Date = () => new Date()) {
  const pairs = new Map<string, PairRecord>();
  const clone = (p: PairRecord): PairRecord => ({ ...p });
  const stamp = () => now().toISOString();

  const change = (pairId: string, userId: string, withdraw: boolean): PairChangeResult => {
    const p = pairs.get(pairId);
    if (!p) return { ok: false, reason: "not-found" };
    if (userId !== p.aUserId && userId !== p.bUserId) return { ok: false, reason: "not-member" };
    const t = stamp();
    if (withdraw) {
      if (userId === p.aUserId) p.aWithdrawnAt = p.aWithdrawnAt ?? t;
      if (userId === p.bUserId) p.bWithdrawnAt = p.bWithdrawnAt ?? t;
    }
    p.status = "unlinked";
    p.unlinkedAt = p.unlinkedAt ?? t;
    p.unlinkedBy = p.unlinkedBy ?? userId;
    return { ok: true, pair: clone(p) };
  };

  const repo: PairRepository = {
    async createPair(n: NewPair): Promise<InsertResult<PairRecord>> {
      if ([...pairs.values()].some((p) => p.token === n.token || p.id === n.id)) return { ok: false, reason: "conflict" };
      const rec: PairRecord = {
        id: n.id,
        token: n.token,
        aUserId: n.aUserId,
        aAssessmentId: n.aAssessmentId,
        aConsentAt: n.aConsentAt,
        aConsentVersion: n.aConsentVersion,
        aWithdrawnAt: null,
        bUserId: null,
        bAssessmentId: null,
        bConsentAt: null,
        bConsentVersion: null,
        bWithdrawnAt: null,
        status: "invited",
        unlinkedAt: null,
        unlinkedBy: null,
        expiresAt: n.expiresAt,
        relationship: n.relationship ?? null,
        createdAt: stamp(),
      };
      pairs.set(rec.id, rec);
      return { ok: true, value: clone(rec) };
    },
    async getPair(id) {
      const p = pairs.get(id);
      return p ? clone(p) : null;
    },
    async getPairByToken(token) {
      const p = [...pairs.values()].find((x) => x.token === token);
      return p ? clone(p) : null;
    },
    async listPairsForUser(userId) {
      return [...pairs.values()]
        .filter((p) => p.aUserId === userId || p.bUserId === userId)
        .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))
        .map(clone);
    },
    async joinPair(input): Promise<JoinPairResult> {
      const p = [...pairs.values()].find((x) => x.token === input.token);
      if (!p) return { ok: false, reason: "not-found" };
      if (p.status === "unlinked") return { ok: false, reason: "closed" };
      if (p.bUserId) return p.bUserId === input.userId ? { ok: true, pair: clone(p) } : { ok: false, reason: "taken" };
      if (new Date(p.expiresAt).getTime() <= now().getTime()) return { ok: false, reason: "expired" };
      if (p.aUserId === input.userId) return { ok: false, reason: "self" };
      if (p.aWithdrawnAt) return { ok: false, reason: "closed" };
      const a = await mem.repo.getAssessment(input.assessmentId);
      if (!a || a.userId !== input.userId) return { ok: false, reason: "bad-assessment" };
      p.bUserId = input.userId;
      p.bAssessmentId = input.assessmentId;
      p.bConsentAt = stamp();
      p.bConsentVersion = input.consentVersion;
      p.status = "linked";
      return { ok: true, pair: clone(p) };
    },
    async withdrawConsent({ pairId, userId }) {
      return change(pairId, userId, true);
    },
    async unlinkPair({ pairId, userId }) {
      return change(pairId, userId, false);
    },
  };

  return {
    repo,
    /** 시험용: 탈퇴한 회원의 쌍을 DB 트리거(pairs_on_withdraw)처럼 처리한다 */
    onMemberWithdrawn(userId: string) {
      for (const [id, p] of [...pairs]) {
        if (p.aUserId === userId && !p.bUserId) {
          pairs.delete(id);
          continue;
        }
        if (p.aUserId !== userId && p.bUserId !== userId) continue;
        const t = stamp();
        if (p.aUserId === userId) p.aWithdrawnAt = p.aWithdrawnAt ?? t;
        if (p.bUserId === userId) p.bWithdrawnAt = p.bWithdrawnAt ?? t;
        p.status = "unlinked";
        p.unlinkedAt = p.unlinkedAt ?? t;
        p.unlinkedBy = p.unlinkedBy ?? userId;
      }
    },
    /** 시험용: 내용 직접 확인 */
    all: () => [...pairs.values()].map(clone),
  };
}
