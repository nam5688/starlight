// 리포트 궁합의 쌍(누구와 누가 어느 검사 결과로 연결됐는가 · 동의 · 해제 · 철회) 저장소 약속 — 서비스(pair-service.ts)는 이 약속만 안다.
// 이름 · 생년월일 · 응답은 이 표에 없다(회원번호 · 검사 결과 번호 · 동의 시각 · 동의한 문구의 버전 · 상태뿐). 구현은 Supabase(integrations)와 시험용 메모리(testing/memory-pairs.ts).
import type { InsertResult } from "./ports.ts";

/** invited: 상대가 아직 들어오지 않음 · linked: 두 사람이 모두 동의해 연결됨 · unlinked: 끊김(연결 해제 · 동의 철회 · 탈퇴) */
export type PairStatus = "invited" | "linked" | "unlinked";

export type PairRecord = {
  id: string;
  token: string;
  aUserId: string;
  aAssessmentId: string;
  aConsentAt: string;
  aConsentVersion: string;
  aWithdrawnAt: string | null;
  bUserId: string | null;
  bAssessmentId: string | null;
  bConsentAt: string | null;
  bConsentVersion: string | null;
  bWithdrawnAt: string | null;
  status: PairStatus;
  unlinkedAt: string | null;
  unlinkedBy: string | null;
  expiresAt: string;
  createdAt: string;
};

export type NewPair = { id: string; token: string; aUserId: string; aAssessmentId: string; aConsentAt: string; aConsentVersion: string; expiresAt: string };

export type JoinPairResult =
  | { ok: true; pair: PairRecord }
  | { ok: false; reason: "not-found" | "closed" | "expired" | "taken" | "self" | "bad-assessment" };

export type PairChangeResult = { ok: true; pair: PairRecord } | { ok: false; reason: "not-found" | "not-member" };

export interface PairRepository {
  createPair(pair: NewPair): Promise<InsertResult<PairRecord>>;
  getPair(id: string): Promise<PairRecord | null>;
  getPairByToken(token: string): Promise<PairRecord | null>;
  /** 내가 초대했거나 초대받은 쌍 (최근이 먼저) */
  listPairsForUser(userId: string): Promise<PairRecord[]>;
  /** 상대가 초대 링크로 들어와 동의하고 연결한다 — 한 번에 하나만 성공한다(DB가 행을 잠그고 확인한다) */
  joinPair(input: { token: string; userId: string; assessmentId: string; consentVersion: string }): Promise<JoinPairResult>;
  /** 동의 철회 — 철회 시각을 남기고 연결을 끊는다. 이미 철회했으면 같은 결과 */
  withdrawConsent(input: { pairId: string; userId: string }): Promise<PairChangeResult>;
  /** 연결 해제 — 더 이상 이 쌍으로 새로 만들지 않는다(철회가 아니다) */
  unlinkPair(input: { pairId: string; userId: string }): Promise<PairChangeResult>;
}
