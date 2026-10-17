// 이용 후기(리뷰) 규칙 — 순수 함수만 둔다(저장소 · 화면을 부르지 않는다). 서비스(lib/services/review-service.ts)와 화면이 같은 규칙을 쓴다.
//
// 지키는 것(운영자 요청 2026-10-17)
// - 후기는 실제 이용 건(구매 주문 · 상담 기록)에만 달리고, 한 건에 하나뿐이다. 보상(질문권)은 한 건에 한 번이고 별점 · 내용 방향 · 공개 동의와 무관하게 같다.
// - 공개 후기는 "공개에 동의한 후기"만이다. 대가(질문권 보상 · 무료 체험)를 받고 쓴 후기는 그 사실을 숨기지 않고 함께 보인다.
//   ※ 대가 표시 문구는 가안이다 — "대가성 후기 표시"의 정확한 법정 문구는 법률 검토 대상이며 약관 · 처리방침 문구는 만들지 않았다.
// - AI가 후기를 만들거나 고치거나 요약하지 않는다. 서버가 하는 일은 개인정보로 보이는 부분(연락처 · 이메일 · 주민번호 · 카드 · 계좌)을 가리는 것뿐이다.
// - 부정적인 내용이라는 이유만으로 숨기거나 지우지 않는다(관리자 사유 분류에 "부정적인 내용"이 없다).

import { REVIEWS } from "../config/product.ts";
import { redactPersonalInfo } from "../personalization/context.ts";

// ── 종류 ─────────────────────────────────────

export const REVIEW_KINDS = ["personal", "saju_compat", "pair_compat", "chat"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export const isReviewKind = (v: unknown): v is ReviewKind => typeof v === "string" && (REVIEW_KINDS as readonly string[]).includes(v);

/** 후기마다 보이는 종류 이름표 */
export const REVIEW_KIND_LABEL: Record<ReviewKind, string> = {
  personal: "개인 리포트",
  saju_compat: "사주 궁합",
  pair_compat: "리포트 궁합",
  chat: "미유 채팅",
};

/** 목록 필터용 묶음 — 개인 · 궁합(사주 궁합 + 리포트 궁합) · 채팅 */
export const REVIEW_GROUPS = ["personal", "compat", "chat"] as const;
export type ReviewGroup = (typeof REVIEW_GROUPS)[number];
export const REVIEW_GROUP_LABEL: Record<ReviewGroup, string> = { personal: "개인 리포트", compat: "궁합", chat: "미유 채팅" };

export function groupOf(kind: ReviewKind): ReviewGroup {
  return kind === "saju_compat" || kind === "pair_compat" ? "compat" : kind;
}
export function kindsOfGroup(group: ReviewGroup): ReviewKind[] {
  return REVIEW_KINDS.filter((k) => groupOf(k) === group);
}
export function parseGroup(v: unknown): ReviewGroup | null {
  return typeof v === "string" && (REVIEW_GROUPS as readonly string[]).includes(v) ? (v as ReviewGroup) : null;
}

// ── 상태 · 대가 표시 · 보상 상태 ─────────────────

/** published 공개 · private 나만 보기 · hidden 운영자가 숨김 · deleted 삭제(묘비 — 행은 남기고 글은 지운다) */
export type ReviewStatus = "published" | "private" | "hidden" | "deleted";
export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = { published: "공개 중", private: "나만 보기", hidden: "운영자가 숨김", deleted: "삭제됨" };

/** 쓸 때의 대가 표시 — reward: 질문권 보상 대상으로 쓴 후기 · free_trial: 보상은 없지만 무료로 제공받은 이용에 쓴 후기 · none */
export type ReviewDisclosure = "reward" | "free_trial" | "none";

/**
 * 보상 상태 — off: 스위치가 꺼져 있거나 0개라 주지 않음 · ineligible: 보상 대상이 아닌 무료 체험 · pending: 지급을 시작했지만 확정 전(곧 맞춘다) ·
 * granted: 질문권 지급 확정 · failed: 지급에 실패해 다시 시도할 수 있음. off · ineligible은 쓸 때 정해지며 나중에 바꾸지 않는다(대가 표시와 어긋나지 않게).
 */
export type RewardState = "off" | "ineligible" | "pending" | "granted" | "failed";
export const REWARD_STATE_LABEL: Record<RewardState, string> = { off: "보상 없음", ineligible: "보상 대상 아님", pending: "지급 확인 중", granted: "지급함", failed: "지급 실패 · 다시 시도 가능" };

export const DISCLOSURE_TEXT = { reward: "질문권 보상 제공", freeTrial: "무료 체험 제공" } as const;

/** 공개 후기에 붙는 대가 표시 — 둘 다 해당하면 둘 다 보인다(숨기지 않는다). 가안 문구 */
export function disclosureLabels(r: { disclosure: ReviewDisclosure; freeTrial: boolean }): string[] {
  const out: string[] = [];
  if (r.freeTrial) out.push(DISCLOSURE_TEXT.freeTrial);
  if (r.disclosure === "reward") out.push(DISCLOSURE_TEXT.reward);
  return out;
}

/** 쓸 때의 대가 표시를 정한다 — 보상 대상이면 reward, 아니고 무료로 제공받은 이용이면 free_trial */
export function disclosureFor(input: { rewardOffered: boolean; freeTrial: boolean }): ReviewDisclosure {
  return input.rewardOffered ? "reward" : input.freeTrial ? "free_trial" : "none";
}

// ── 안내 문구 ────────────────────────────────

/** 작성 화면에 항상 보이는 안내 — 공개 전 안내(`noticeVersion`은 `REVIEWS.noticeVersion`) */
export const REVIEW_NOTICES = {
  publish: "사주 · 관계 · 상담에서 읽힌 구체적인 내용, 이름 · 생년월일 · 상대 정보는 적지 마세요. 공개에 동의하면 메인과 전체 후기에 보여요. 동의하지 않으면 나만 보고 운영 기록 용도로만 쓰여요.",
  consentLabel: "이 후기를 메인과 전체 후기에 공개해도 좋아요",
  noAi: "미유는 후기를 고치거나 요약하거나 AI로 만들지 않아요. 연락처 · 이메일 · 주민번호 · 카드 · 계좌처럼 개인정보로 보이는 부분만 가려서 저장해요.",
  /** 보상이 켜져 있고 이 건이 대상일 때 */
  reward: (credits: number) => `후기를 남기면 질문권 ${credits}개를 드려요. 별점이 높든 낮든, 좋은 이야기든 아쉬운 이야기든, 공개하든 안 하든 같아요. 보상을 받고 쓴 후기는 공개될 때 “${DISCLOSURE_TEXT.reward}”라고 함께 표시돼요.`,
  freeTrial: `무료로 제공받은 이용에 쓴 후기는 공개될 때 “${DISCLOSURE_TEXT.freeTrial}”라고 함께 표시돼요.`,
  editNote: "고쳐 쓰거나 비공개로 바꾸거나 지워도 질문권을 다시 주거나 되찾지 않아요. 지운 뒤 다시 써도 같은 이용 건에는 보상이 한 번뿐이에요.",
} as const;

/** 메인 · 전체 후기 화면의 짧은 안내(운영 원칙) */
export const REVIEW_PUBLIC_NOTES = {
  source: "미유를 실제로 이용한 분이 공개에 동의한 후기만 보여요.",
  selection: "운영자가 고른 후기가 먼저 보일 수 있어요. 별점이나 긍정 · 부정으로 고르지 않고, 공개된 후기는 모두 전체 후기에서 볼 수 있어요.",
  noAi: "미유는 후기를 고치거나 요약하거나 AI로 만들지 않아요.",
} as const;

// ── 입력 확인 ────────────────────────────────

export type ReviewFieldErrors = { rating?: string; body?: string };
export type NormalizedReview = { ok: true; value: { rating: number; body: string; publicConsent: boolean; redactions: number } } | { ok: false; errors: ReviewFieldErrors };

/** 줄바꿈을 맞추고 눈에 보이지 않는 제어 문자를 지운다 */
export function cleanReviewBody(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 글자 수를 셀 때 공백과 "[연락처 가림]" 같은 가림 표시는 뺀다 — 가림 표시로 최소 글자 수를 채울 수 없다 */
export function countMeaningfulChars(body: string): number {
  return [...body.replace(/\[[^\]]*가림\]/g, "").replace(/\s+/g, "")].length;
}

const distinctChars = (body: string): number => new Set([...body.replace(/\[[^\]]*가림\]/g, "").replace(/\s+/g, "")]).size;

const truthy = (v: unknown) => v === true || v === "on" || v === "true" || v === "1" || v === 1;

/**
 * 별점 · 글 · 공개 동의를 확인하고 정리한다. 글이 최소 글자 수에 못 미치면 저장하지 않는다(빈 후기로 보상을 받는 것을 막는 기준 — 별점 · 내용 방향과 무관하게 같다).
 * 수정할 때도 같은 기준이다(보상을 받은 뒤 글을 비우는 것을 막는다). 같은 글자만 되풀이한 글은 최소 글자 수를 채운 것으로 보지 않는다.
 */
export function normalizeReviewInput(raw: { rating: unknown; body: unknown; publicConsent: unknown }, opts: { minBodyChars: number; bodyMax?: number }): NormalizedReview {
  const errors: ReviewFieldErrors = {};
  const rating = Number(raw.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = "별점을 1~5점 중에서 골라 주세요.";

  const bodyMax = opts.bodyMax ?? REVIEWS.bodyMax;
  const cleaned = cleanReviewBody(raw.body);
  const redacted = redactPersonalInfo(cleaned);
  const body = redacted.text;
  if ([...cleaned].length > bodyMax) {
    errors.body = `후기는 ${bodyMax}자까지 적을 수 있어요 (지금 ${[...cleaned].length}자).`;
  } else if (opts.minBodyChars > 0) {
    const n = countMeaningfulChars(body);
    if (n < opts.minBodyChars) errors.body = `경험을 ${opts.minBodyChars}자 이상 적어 주세요 (지금 ${n}자).`;
    else if (distinctChars(body) < Math.min(8, Math.ceil(opts.minBodyChars / 2))) errors.body = "같은 글자만 되풀이하지 말고, 이용하면서 느낀 점을 적어 주세요.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { rating, body, publicConsent: truthy(raw.publicConsent), redactions: redacted.count } };
}

// ── 공개 · 선정 ──────────────────────────────

/** 화면에 보이는 공개 후기 — 작성자를 알 수 있는 값(회원번호 · 닉네임)은 담지 않는다 */
export type PublicReview = {
  id: string;
  kind: ReviewKind;
  rating: number;
  body: string;
  disclosure: ReviewDisclosure;
  freeTrial: boolean;
  createdAt: string;
  updatedAt: string;
  /** 운영자가 고른 후기(메인에서 먼저 보임) */
  featured: boolean;
  featuredAt: string | null;
};

/** 공개 조건 — 공개 중이고 공개에 동의한 후기만. 저장소의 조회 조건과 같은 기준이다 */
export const isPublicReview = (r: { status: ReviewStatus; publicConsent: boolean }): boolean => r.status === "published" && r.publicConsent;

const time = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/**
 * 메인에 보일 후기 고르기 — 운영자가 고른(선정) 후기가 있으면 먼저, 그다음은 최신순. 개인 · 궁합 · 채팅이 섞이도록 종류 묶음마다 하나씩 먼저 담고 나머지는 같은 순서로 채운다.
 * 별점 · 글의 긍정 · 부정으로는 고르지도 거르지도 않는다(전체 반응처럼 보이게 골라 담는 것을 막는다).
 */
export function pickHomeReviews<T extends Pick<PublicReview, "id" | "kind" | "createdAt" | "featured" | "featuredAt">>(list: readonly T[], max: number): T[] {
  const ordered = [...list].sort((a, b) => Number(b.featured) - Number(a.featured) || time(b.featuredAt) - time(a.featuredAt) || time(b.createdAt) - time(a.createdAt) || (a.id < b.id ? -1 : 1));
  const chosen = new Set<string>();
  const seen = new Set<ReviewGroup>();
  for (const r of ordered) {
    if (chosen.size >= max) break;
    const g = groupOf(r.kind);
    if (seen.has(g)) continue;
    seen.add(g);
    chosen.add(r.id);
  }
  for (const r of ordered) {
    if (chosen.size >= max) break;
    chosen.add(r.id);
  }
  return ordered.filter((r) => chosen.has(r.id));
}

/** 별점 분포(1~5점 개수) — 관리자 화면에서 메인에 보이는 후기가 전체와 한쪽으로 치우치지 않았는지 보는 데 쓴다 */
export function ratingSpread(list: readonly { rating: number }[]): { counts: [number, number, number, number, number]; total: number; average: number | null } {
  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const r of list) {
    if (r.rating >= 1 && r.rating <= 5) {
      counts[r.rating - 1] += 1;
      sum += r.rating;
    }
  }
  const total = counts.reduce((a, b) => a + b, 0);
  return { counts, total, average: total > 0 ? Math.round((sum / total) * 100) / 100 : null };
}

// ── 관리자 사유 분류 ──────────────────────────

export type ReviewAdminAction = "hide" | "unhide" | "delete" | "feature" | "unfeature" | "dismiss_reports";

/**
 * 운영자 조치마다 고르는 사유 분류. **"부정적인 내용"은 어떤 조치의 사유도 될 수 없다.** other는 메모가 꼭 있어야 한다.
 * hide · delete: 개인정보 노출 · 욕설 혐오 · 허위 광고 · 신고 처리 · 기타 / unhide: 잘못 숨김 · 문제 해결 · 기타 / feature: 선정 기준(구체적인 이용 경험 · 처음 보는 분께 도움 · 의견 균형) · 기타 /
 * unfeature: 다른 후기로 교체 · 선정 기준 변경 · 기타 / dismiss_reports: 위반 아님 · 기타
 */
export const REVIEW_REASONS: Record<ReviewAdminAction, readonly { code: string; label: string }[]> = {
  hide: [
    { code: "privacy", label: "개인정보 노출" },
    { code: "abuse", label: "욕설 · 혐오" },
    { code: "fake_or_ad", label: "허위 · 광고" },
    { code: "report", label: "신고 처리" },
    { code: "other", label: "기타(메모 필수)" },
  ],
  delete: [
    { code: "privacy", label: "개인정보 노출" },
    { code: "abuse", label: "욕설 · 혐오" },
    { code: "fake_or_ad", label: "허위 · 광고" },
    { code: "report", label: "신고 처리" },
    { code: "other", label: "기타(메모 필수)" },
  ],
  unhide: [
    { code: "wrongly_hidden", label: "잘못 숨김" },
    { code: "resolved", label: "문제가 해결됨" },
    { code: "other", label: "기타(메모 필수)" },
  ],
  feature: [
    { code: "specific", label: "구체적인 이용 경험" },
    { code: "helpful", label: "처음 보는 분께 도움이 됨" },
    { code: "balance", label: "의견 · 종류 균형" },
    { code: "other", label: "기타(메모 필수)" },
  ],
  unfeature: [
    { code: "replaced", label: "다른 후기로 교체" },
    { code: "criteria", label: "선정 기준 변경" },
    { code: "other", label: "기타(메모 필수)" },
  ],
  dismiss_reports: [
    { code: "no_violation", label: "위반 아님" },
    { code: "other", label: "기타(메모 필수)" },
  ],
};

export const REVIEW_ACTION_LABEL: Record<ReviewAdminAction, string> = { hide: "숨김", unhide: "숨김 해제", delete: "삭제", feature: "메인 선정", unfeature: "선정 해제", dismiss_reports: "신고 기각" };

/** 운영자 조치의 사유 확인 — 분류가 그 조치에 맞아야 하고 기타는 메모가 꼭 있어야 한다. 메모에는 후기 글을 옮겨 적지 않는다(120자까지) */
export function checkAdminReason(action: ReviewAdminAction, code: unknown, memo: unknown): { ok: true; code: string; memo: string | null } | { ok: false; message: string } {
  const allowed = REVIEW_REASONS[action];
  if (typeof code !== "string" || !allowed.some((r) => r.code === code)) return { ok: false, message: "사유 분류를 골라 주세요." };
  const m = typeof memo === "string" ? memo.trim().slice(0, 120) : "";
  if (code === "other" && m.length < 2) return { ok: false, message: "기타를 고르면 메모를 2자 이상 적어 주세요." };
  return { ok: true, code, memo: m || null };
}

export const REVIEW_SELECTION_CRITERIA = [
  "선정은 글의 내용(구체적인 이용 경험 · 처음 보는 분께 도움이 되는 정도)과 종류의 균형을 보고 합니다.",
  "별점이 높은지 낮은지, 긍정인지 부정인지로 고르지 않습니다. 아쉬운 점을 솔직하게 적은 후기도 같은 기준으로 선정합니다.",
  "선정 · 해제는 모두 사유 분류와 함께 기록하고, 메인에 보이는 후기의 별점 분포를 전체 공개 후기와 나란히 확인합니다.",
] as const;

// ── 개인정보 노출 점검 ─────────────────────────

export type PrivacyFlag = "phone" | "email" | "long_number" | "dated_year" | "birth_hint" | "url" | "id_hint";
export const PRIVACY_FLAG_LABEL: Record<PrivacyFlag, string> = {
  phone: "전화번호처럼 보임",
  email: "이메일처럼 보임",
  long_number: "긴 숫자",
  dated_year: "연도가 있는 날짜(생년월일 가능성)",
  birth_hint: "생년 · 생일 표현",
  url: "주소(링크)",
  id_hint: "계정 아이디 표현",
};

const SCAN: { flag: PrivacyFlag; re: RegExp }[] = [
  { flag: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { flag: "phone", re: /(?:\+?82[\s.-]?)?0?1[016789][\s.-]?\d{3,4}[\s.-]?\d{4}|\b0\d{1,2}[\s.-]\d{3,4}[\s.-]\d{4}\b/ },
  { flag: "long_number", re: /\d{6,}/ },
  { flag: "dated_year", re: /(?:19|20)\d{2}\s*[년.\-/]\s*\d{1,2}\s*[월.\-/]\s*\d{1,2}|\d{2}\s*[년.]\s*\d{1,2}\s*[월.]\s*\d{1,2}\s*일/ },
  { flag: "birth_hint", re: /\d{2,4}\s*년\s*\d{0,2}\s*월?\s*생|\d{1,2}\s*월\s*\d{1,2}\s*일\s*생|생년월일|음력\s*\d/ },
  { flag: "url", re: /https?:\/\/|www\./i },
  { flag: "id_hint", re: /(?:카톡|카카오톡|카카오|인스타(?:그램)?|텔레그램|라인|아이디|\bid\b)\s*[:：]?\s*@?[A-Za-z0-9._-]{4,}/i },
];

/**
 * 공개 후기 글에서 개인정보로 의심되는 표현을 다시 훑는다(저장할 때 가린 것 말고 남은 것). **의심 후보일 뿐 판정이 아니다** — 사람이 읽고 정한다.
 * 가려진 표시("[연락처 가림]")는 이미 가려진 것이라 세지 않는다.
 */
export function scanPublicBody(body: string): PrivacyFlag[] {
  const text = body.replace(/\[[^\]]*가림\]/g, " ");
  return SCAN.filter((s) => s.re.test(text)).map((s) => s.flag);
}

// ── 전환 분석 ────────────────────────────────

export type ReviewFunnelEvent = { anonId: string; name: string; createdAt: string };
export type ReviewFunnel = {
  /** 메인 후기 영역이 화면에 보인 익명 방문자 수 */
  viewers: number;
  /** 그중 영역을 본 뒤 [전체 후기 보기]를 누른 방문자 수 */
  clickers: number;
  clickRate: number | null;
  /** 그중 영역을 본 뒤 무료 분석을 시작한(analyze_start) 방문자 수 */
  starters: number;
  startRate: number | null;
};

const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/**
 * 후기 영역을 본 익명 방문자 기준의 흐름. 같은 익명 번호의 기록 중 **처음 본 시각 이후**의 클릭 · 분석 시작만 센다(보기 전의 행동은 후기를 본 뒤의 행동이 아니다).
 * 상관 기록일 뿐이다 — 후기를 본 사람이 많이 시작했다는 것이 후기 때문이라는 뜻은 아니다(보여 준 쪽 · 숨긴 쪽을 나눠 비교하는 A/B 테스트가 필요하다).
 * 익명 번호는 추적 거부(DNT · GPC) · 쿠키 차단 시 기록되지 않아 실제 방문자보다 적게 센다.
 */
export function reviewFunnel(events: readonly ReviewFunnelEvent[]): ReviewFunnel {
  const firstView = new Map<string, number>();
  for (const e of events) {
    if (e.name !== "review_section_view") continue;
    const t = Date.parse(e.createdAt);
    if (Number.isNaN(t)) continue;
    const prev = firstView.get(e.anonId);
    if (prev === undefined || t < prev) firstView.set(e.anonId, t);
  }
  const clicked = new Set<string>();
  const started = new Set<string>();
  for (const e of events) {
    const at = firstView.get(e.anonId);
    if (at === undefined) continue;
    const t = Date.parse(e.createdAt);
    if (Number.isNaN(t) || t < at) continue;
    if (e.name === "review_all_click") clicked.add(e.anonId);
    if (e.name === "analyze_start") started.add(e.anonId);
  }
  const viewers = firstView.size;
  return { viewers, clickers: clicked.size, clickRate: rate(clicked.size, viewers), starters: started.size, startRate: rate(started.size, viewers) };
}

/** 후기 키 — 같은 회원 · 같은 종류 · 같은 이용 건 */
export const reviewKey = (userId: string, kind: ReviewKind, subjectRef: string) => `${userId}|${kind}|${subjectRef}`;

/** 작성률 — 적격 건 가운데 후기가 있는(지금까지 한 번이라도 쓴) 건의 비율. 삭제한 후기도 "썼다"로 센다(보상은 한 번뿐) */
export function reviewWriteRate(eligibleKeys: readonly string[], reviewKeys: ReadonlySet<string>): { eligible: number; written: number; rate: number | null } {
  const uniq = new Set(eligibleKeys);
  let written = 0;
  for (const k of uniq) if (reviewKeys.has(k)) written += 1;
  return { eligible: uniq.size, written, rate: rate(written, uniq.size) };
}

// ── 화면 안내(MY 후기 화면이 주소의 done 값으로 보이는 문구) ─────────

/** 서버 동작이 끝난 뒤 MY 후기 화면 위에 보이는 안내 — 주소에는 이 이름만 실리고 문장은 화면이 정한다(주소로 임의의 문장을 띄울 수 없게) */
export const REVIEW_DONE_TEXT = {
  created: "후기를 남겼어요.",
  created_reward: "후기를 남겼어요. 보상 질문권이 들어왔어요.",
  created_pending: "후기를 남겼어요. 보상 질문권은 확인되는 대로 들어와요.",
  updated: "후기를 고쳤어요.",
  revived: "후기를 다시 남겼어요. 같은 이용 건의 보상은 한 번뿐이라 질문권은 다시 들어오지 않아요.",
  deleted: "후기를 지웠어요.",
  private: "후기를 나만 보기로 바꿨어요.",
  public: "후기를 공개로 바꿨어요.",
  error: "처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.",
} as const;
export type ReviewDoneCode = keyof typeof REVIEW_DONE_TEXT;
export const isReviewDoneCode = (v: unknown): v is ReviewDoneCode => typeof v === "string" && Object.prototype.hasOwnProperty.call(REVIEW_DONE_TEXT, v);
