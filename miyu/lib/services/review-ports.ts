// 이용 후기(리뷰) 저장소의 약속 — DB 변경 25번(표 reviews · review_admin_log · review_reports, 함수 review_admin_apply · submit_review_report)과 같은 규칙을 따른다.
// 웹은 Supabase 구현체(연결 폴더의 supabase/reviews.ts), 시험은 메모리 구현체(lib/services/testing/memory-reviews.ts)를 쓴다.
// 쓰기는 서버(비밀키)만 부르고, 서비스가 소유자를 확인한 뒤에만 부른다. 이 파일은 React · Next · 외부 SDK를 불러오지 않는다.
// 질문권 지급은 이 저장소가 하지 않는다 — 서비스가 혜택 저장소(BenefitRepository.grantCredit)를 멱등 키 `review:<후기 번호>`로 한 번만 부른다.

import type { PublicReview, ReviewAdminAction, ReviewDisclosure, ReviewKind, ReviewStatus, RewardState } from "../commerce/reviews.ts";

export type ReviewRecord = {
  id: string;
  userId: string;
  kind: ReviewKind;
  /** 구매 건이면 주문 번호(uuid), 채팅이면 검사 결과 번호(uuid) */
  subjectRef: string;
  rating: number;
  /** 삭제(묘비)이면 빈 글 */
  body: string;
  publicConsent: boolean;
  status: ReviewStatus;
  disclosure: ReviewDisclosure;
  freeTrial: boolean;
  rewardState: RewardState;
  /** 실제로 지급한 질문권 수(지급 전 · 지급 안 함이면 0) */
  rewardCredits: number;
  rewardOpKey: string | null;
  rewardedAt: string | null;
  /** 공개에 동의한 시각과 그때 보인 공개 전 안내의 판 — 동의하지 않았으면 null */
  consentedAt: string | null;
  consentNoticeVersion: string | null;
  featured: boolean;
  featuredAt: string | null;
  /** 운영자가 숨기거나 지운 사유 분류(글 내용 아님) */
  hiddenReason: string | null;
  hiddenAt: string | null;
  deletedBy: "user" | "admin" | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewReview = {
  userId: string;
  kind: ReviewKind;
  subjectRef: string;
  rating: number;
  body: string;
  publicConsent: boolean;
  disclosure: ReviewDisclosure;
  freeTrial: boolean;
  /** 쓸 때 정한 보상 상태 — pending(지급을 시작함) · off · ineligible */
  rewardState: "pending" | "off" | "ineligible";
  consentNoticeVersion: string;
};

export type InsertReviewResult = { ok: true; review: ReviewRecord } | { ok: false; reason: "exists" };

/** 글 · 별점 · 공개 동의를 고치는 입력(수정 · 다시 쓰기 공통) */
export type ReviewEdit = { id: string; userId: string; rating: number; body: string; publicConsent: boolean; consentNoticeVersion: string };

export type ReviewAdminLogRecord = { id: number; reviewId: string; adminId: string; action: ReviewAdminAction; reasonCode: string; memo: string | null; createdAt: string };

export type AdminReviewRow = { review: ReviewRecord; openReports: number };

export type AdminApplyResult = { ok: true; review: ReviewRecord } | { ok: false; reason: "not-found" | "invalid-state" | "invalid-reason" };

/** 통계용 한 줄 — 글은 담지 않는다 */
export type ReviewStatRow = {
  userId: string;
  kind: ReviewKind;
  subjectRef: string;
  status: ReviewStatus;
  publicConsent: boolean;
  featured: boolean;
  rating: number;
  rewardState: RewardState;
  rewardCredits: number;
  createdAt: string;
};

/** 답을 받은 AI 질문이 있는 검사 결과 한 건 — 채팅 후기의 이용 건 */
export type ChatSubject = { userId: string; assessmentId: string; firstAnswerAt: string; answers: number };

export interface ReviewRepository {
  getReviewByKey(userId: string, kind: ReviewKind, subjectRef: string): Promise<ReviewRecord | null>;
  getReview(id: string): Promise<ReviewRecord | null>;
  /** 이 회원의 후기(삭제한 묘비 포함) — 최근 것이 먼저 */
  listUserReviews(userId: string): Promise<ReviewRecord[]>;
  /** 같은 회원 · 종류 · 이용 건에는 하나뿐(DB 고유 조건) — 이미 있으면 { ok: false, reason: "exists" } */
  insertReview(input: NewReview): Promise<InsertReviewResult>;
  /** 글 · 별점 · 공개 동의를 고친다. 삭제된 후기는 고치지 않는다(null). 운영자가 숨긴 후기는 숨김 상태를 유지한다(회원이 고쳐서 다시 공개되지 않는다) */
  updateReview(input: ReviewEdit): Promise<ReviewRecord | null>;
  /** 회원이 지운 묘비(deletedBy = user)를 다시 쓴다. 운영자가 지운 후기 · 삭제되지 않은 후기는 null — 보상은 다시 주지 않는다 */
  reviveReview(input: ReviewEdit): Promise<ReviewRecord | null>;
  /** 글을 지우고 묘비로 남긴다(행은 남아 같은 이용 건에 보상을 또 받을 수 없다). 이미 삭제됐거나 내 것이 아니면 null */
  deleteReview(input: { id: string; userId: string }): Promise<ReviewRecord | null>;
  /** 공개 동의만 바꾼다(비공개 전환 · 다시 공개). 삭제된 후기는 바꾸지 않는다(null), 운영자가 숨긴 후기는 숨김을 유지한다 */
  setPublicConsent(input: { id: string; userId: string; publicConsent: boolean; consentNoticeVersion: string }): Promise<ReviewRecord | null>;
  /** 보상 확정: pending · failed일 때만 granted · failed로 바꾼다. 바꿨으면 true */
  settleReward(input: { id: string; state: "granted" | "failed"; credits: number; opKey: string }): Promise<boolean>;
  /** 지급을 마무리하지 못한 후기(pending · failed, 지운 후기도 — 보상은 글과 무관하다) — userId가 있으면 그 회원 것만 */
  listRewardRetry(opts: { userId?: string; limit: number }): Promise<ReviewRecord[]>;

  // 공개 조회 — 공개 중(published)이고 공개에 동의한 후기만. 작성자를 알 수 있는 값은 담지 않는다
  listPublicReviews(opts: { kinds?: readonly ReviewKind[]; limit: number; offset: number }): Promise<{ rows: PublicReview[]; total: number }>;
  /** 메인 후보 — 운영자가 고른 공개 후기 전부 + 최신 공개 후기 recent개 */
  listHomeCandidates(opts: { recent: number }): Promise<PublicReview[]>;
  countPublicReviews(): Promise<number>;

  // 신고 — 공개 후기에만 받는다. 같은 방문자(reporterKey)가 같은 후기에 두 번 하면 한 번으로 센다
  submitReport(input: { reviewId: string; reporterKey: string; reason: "privacy" | "abuse" | "fake_or_ad" | "other" }): Promise<"reported" | "duplicate" | "not-public">;

  // 관리자
  adminListReviews(filter: { status?: ReviewStatus; kind?: ReviewKind; reportedOnly?: boolean; limit: number; offset: number }): Promise<{ rows: AdminReviewRow[]; total: number }>;
  /** 숨김 · 숨김 해제 · 삭제 · 선정 · 선정 해제 · 신고 기각 — 상태 변경과 이력 기록을 한 번에(한쪽만 남지 않는다) */
  adminApply(input: { reviewId: string; action: ReviewAdminAction; reasonCode: string; memo: string | null; adminId: string }): Promise<AdminApplyResult>;
  listAdminLog(opts: { reviewId?: string; limit: number }): Promise<ReviewAdminLogRecord[]>;

  // 집계(글은 읽지 않는다)
  listReviewStats(opts: { limit: number }): Promise<ReviewStatRow[]>;
  /** 답을 받은 AI 질문이 있는 검사 결과 — userId가 있으면 그 회원 것만, since가 있으면 처음 답을 받은 시각이 그 이후인 것만 */
  listAnsweredChatSubjects(opts: { userId?: string; since?: string; limit: number }): Promise<ChatSubject[]>;
}
