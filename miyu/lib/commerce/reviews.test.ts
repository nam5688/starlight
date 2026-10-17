// 실행: npm test — 이용 후기(리뷰)의 순수 규칙(입력 확인 · 대가 표시 · 메인 고르기 · 사유 분류 · 개인정보 점검 · 전환 분석)을 확인한다.
import assert from "node:assert/strict";
import test from "node:test";
import {
  checkAdminReason,
  countMeaningfulChars,
  disclosureFor,
  disclosureLabels,
  groupOf,
  kindsOfGroup,
  normalizeReviewInput,
  pickHomeReviews,
  ratingSpread,
  reviewFunnel,
  reviewKey,
  reviewWriteRate,
  REVIEW_KINDS,
  REVIEW_REASONS,
  scanPublicBody,
  type PublicReview,
} from "./reviews.ts";

const MIN = 20;
const GOOD = "리포트를 읽고 평소 내 행동이 왜 그런지 생각해 볼 수 있었어요.";

test("종류 묶음: 개인 · 궁합(사주 궁합 + 리포트 궁합) · 채팅", () => {
  assert.deepEqual(REVIEW_KINDS.map(groupOf), ["personal", "compat", "compat", "chat"]);
  assert.deepEqual(kindsOfGroup("compat"), ["saju_compat", "pair_compat"]);
});

test("입력 확인: 별점은 1~5, 글은 최소 글자 수 이상이어야 저장한다(별점 · 내용 방향과 무관하게 같은 기준)", () => {
  assert.equal(normalizeReviewInput({ rating: 5, body: GOOD, publicConsent: "on" }, { minBodyChars: MIN }).ok, true);
  assert.equal(normalizeReviewInput({ rating: 1, body: GOOD, publicConsent: undefined }, { minBodyChars: MIN }).ok, true, "낮은 별점도 같은 기준");
  for (const rating of [0, 6, 2.5, "x", null]) {
    const r = normalizeReviewInput({ rating, body: GOOD, publicConsent: true }, { minBodyChars: MIN });
    assert.ok(!r.ok && r.errors.rating, String(rating));
  }
  const short = normalizeReviewInput({ rating: 5, body: "좋았어요", publicConsent: true }, { minBodyChars: MIN });
  assert.ok(!short.ok && /20자 이상/.test(short.errors.body ?? ""));
  const repeated = normalizeReviewInput({ rating: 5, body: "ㅋ".repeat(40), publicConsent: true }, { minBodyChars: MIN });
  assert.ok(!repeated.ok && /되풀이/.test(repeated.errors.body ?? ""), "같은 글자 반복은 최소 글자 수를 채운 것으로 보지 않는다");
  const long = normalizeReviewInput({ rating: 5, body: `${GOOD}${"가나다라마바사 ".repeat(100)}`, publicConsent: true }, { minBodyChars: MIN });
  assert.ok(!long.ok && /500자까지/.test(long.errors.body ?? ""));
  // 최소 글자 수를 0으로 두면 별점만 있어도 된다(운영자가 설정으로 정한다)
  assert.equal(normalizeReviewInput({ rating: 4, body: "", publicConsent: false }, { minBodyChars: 0 }).ok, true);
});

test("개인정보로 보이는 부분은 저장 전에 가리고, 가림 표시로 최소 글자 수를 채울 수 없다", () => {
  const r = normalizeReviewInput({ rating: 5, body: `연락은 010-1234-5678 이나 test@example.com 으로 주세요. 그리고 ${GOOD}`, publicConsent: true }, { minBodyChars: MIN });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(!/010-1234|example\.com/.test(r.value.body));
  assert.match(r.value.body, /\[연락처 가림\]/);
  assert.match(r.value.body, /\[이메일 가림\]/);
  assert.ok(r.value.redactions >= 2);
  const onlyMarkers = normalizeReviewInput({ rating: 5, body: "010-1234-5678 010-9999-8888 010-7777-6666", publicConsent: true }, { minBodyChars: MIN });
  assert.ok(!onlyMarkers.ok, "가려진 번호만으로는 후기가 될 수 없다");
  assert.equal(countMeaningfulChars("[연락처 가림] 가 나 다"), 3);
});

test("대가 표시: 보상 대상이면 질문권 보상, 보상 없이 무료로 제공받았으면 무료 체험 — 둘 다 해당하면 둘 다 보인다(숨기지 않는다)", () => {
  assert.equal(disclosureFor({ rewardOffered: true, freeTrial: false }), "reward");
  assert.equal(disclosureFor({ rewardOffered: false, freeTrial: true }), "free_trial");
  assert.equal(disclosureFor({ rewardOffered: false, freeTrial: false }), "none");
  assert.equal(disclosureFor({ rewardOffered: true, freeTrial: true }), "reward");
  assert.deepEqual(disclosureLabels({ disclosure: "reward", freeTrial: false }), ["질문권 보상 제공"]);
  assert.deepEqual(disclosureLabels({ disclosure: "free_trial", freeTrial: true }), ["무료 체험 제공"]);
  assert.deepEqual(disclosureLabels({ disclosure: "reward", freeTrial: true }), ["무료 체험 제공", "질문권 보상 제공"]);
  assert.deepEqual(disclosureLabels({ disclosure: "none", freeTrial: false }), []);
});

const R = (id: string, kind: PublicReview["kind"], createdAt: string, extra: Partial<PublicReview> = {}): PublicReview => ({ id, kind, rating: 3, body: "글", disclosure: "none", freeTrial: false, createdAt, updatedAt: createdAt, featured: false, featuredAt: null, ...extra });

test("메인 고르기: 선정 후기가 먼저, 그다음 최신순 — 종류가 섞이고, 별점 · 긍정 · 부정으로 고르지 않는다", () => {
  const list = [
    R("p1", "personal", "2026-10-10T00:00:00Z"),
    R("p2", "personal", "2026-10-11T00:00:00Z"),
    R("p3", "personal", "2026-10-12T00:00:00Z"),
    R("p4", "personal", "2026-10-13T00:00:00Z"),
    R("c1", "saju_compat", "2026-10-01T00:00:00Z", { rating: 1 }),
    R("t1", "chat", "2026-09-01T00:00:00Z", { rating: 2 }),
  ];
  // 최신순이면 개인 후기만 4개가 앞서지만, 종류 묶음마다 하나씩 먼저 담아 궁합 · 채팅도 보인다(낮은 별점이어도 빠지지 않는다)
  const picked = pickHomeReviews(list, 4).map((r) => r.id);
  assert.deepEqual(picked, ["p4", "p3", "c1", "t1"]);
  // 운영자가 고른 후기가 먼저(선정 시각이 최근인 것부터)
  const featured = list.map((r) => (r.id === "p1" ? { ...r, featured: true, featuredAt: "2026-10-14T00:00:00Z" } : r.id === "t1" ? { ...r, featured: true, featuredAt: "2026-10-15T00:00:00Z" } : r));
  assert.deepEqual(pickHomeReviews(featured, 6).slice(0, 2).map((r) => r.id), ["t1", "p1"]);
  assert.equal(pickHomeReviews(featured, 3).length, 3);
  assert.deepEqual(pickHomeReviews([], 6), []);
  // 같은 입력은 같은 결과
  assert.deepEqual(pickHomeReviews(list, 6), pickHomeReviews([...list].reverse(), 6));
});

test("별점 분포 · 평균", () => {
  const s = ratingSpread([{ rating: 5 }, { rating: 5 }, { rating: 1 }, { rating: 3 }]);
  assert.deepEqual(s.counts, [1, 0, 1, 0, 2]);
  assert.equal(s.total, 4);
  assert.equal(s.average, 3.5);
  assert.equal(ratingSpread([]).average, null);
});

test("운영자 사유 분류: 조치에 맞는 분류만, 기타는 메모 필수, 부정적인 내용이라는 분류는 어디에도 없다", () => {
  const all = Object.values(REVIEW_REASONS).flat();
  assert.ok(all.every((r) => !/부정/.test(r.label) && !/negative/i.test(r.code)), "부정적인 내용은 사유가 될 수 없다");
  assert.deepEqual(checkAdminReason("hide", "privacy", ""), { ok: true, code: "privacy", memo: null });
  assert.ok(!checkAdminReason("hide", "negative", "").ok);
  assert.ok(!checkAdminReason("hide", undefined, "").ok);
  assert.ok(!checkAdminReason("feature", "privacy", "").ok, "다른 조치의 분류는 안 된다");
  assert.ok(!checkAdminReason("hide", "other", "").ok, "기타는 메모 필수");
  assert.ok(!checkAdminReason("hide", "other", " ").ok);
  const ok = checkAdminReason("delete", "other", "  전화번호를 돌려 적었어요  ");
  assert.ok(ok.ok && ok.memo === "전화번호를 돌려 적었어요");
  const long = checkAdminReason("delete", "other", "가".repeat(300));
  assert.ok(long.ok && long.memo?.length === 120, "메모는 120자까지(글을 옮겨 적지 않게)");
});

test("공개 후기 개인정보 점검: 전화 · 이메일 · 긴 숫자 · 생년월일 · 주소 · 계정 아이디 표현을 의심 후보로 잡고, 가려진 표시는 세지 않는다", () => {
  assert.deepEqual(scanPublicBody("리포트가 도움이 됐어요. 풀이가 구체적이라 좋았어요."), []);
  assert.ok(scanPublicBody("010-1234-5678로 연락 주세요").includes("phone"));
  assert.ok(scanPublicBody("연락처는 01012345678").includes("phone"));
  assert.ok(scanPublicBody("문의는 abc@test.co.kr").includes("email"));
  assert.ok(scanPublicBody("주문번호 12345678 입니다").includes("long_number"));
  assert.ok(scanPublicBody("1996년 3월 29일에 태어났는데 맞았어요").includes("dated_year"));
  assert.ok(scanPublicBody("96년생인데 공감됐어요").includes("birth_hint"));
  assert.ok(scanPublicBody("https://example.com 참고").includes("url"));
  assert.ok(scanPublicBody("카톡 아이디 miyu_fan 로 연락").includes("id_hint"));
  assert.deepEqual(scanPublicBody("연락처는 [연락처 가림] 입니다. 풀이가 좋았어요."), []);
  assert.deepEqual(scanPublicBody("I would identify with the idea of a provider"), [], "id가 들어간 평범한 영어 낱말은 계정 아이디가 아니다");
});

test("전환 분석: 후기 영역을 본 뒤의 클릭 · 분석 시작만 센다(보기 전의 행동은 세지 않고, 방문자마다 한 번)", () => {
  const e = (anonId: string, name: string, t: string) => ({ anonId, name, createdAt: `2026-10-20T${t}Z` });
  const f = reviewFunnel([
    e("a", "analyze_start", "09:00:00"), // 보기 전 — 세지 않는다
    e("a", "review_section_view", "09:10:00"),
    e("a", "review_all_click", "09:11:00"),
    e("a", "review_all_click", "09:12:00"), // 두 번 눌러도 한 명
    e("a", "analyze_start", "09:20:00"),
    e("b", "review_section_view", "10:00:00"),
    e("b", "review_section_view", "10:05:00"),
    e("c", "review_section_view", "11:00:00"),
    e("c", "analyze_start", "11:30:00"),
    e("d", "review_all_click", "12:00:00"), // 영역을 본 기록이 없다 — 센 대상이 아니다
    e("d", "analyze_start", "12:01:00"),
  ]);
  assert.equal(f.viewers, 3);
  assert.equal(f.clickers, 1);
  assert.equal(f.clickRate, 33.3);
  assert.equal(f.starters, 2);
  assert.equal(f.startRate, 66.7);
  const none = reviewFunnel([]);
  assert.deepEqual([none.viewers, none.clickRate, none.startRate], [0, null, null]);
});

test("작성률: 적격 건 가운데 후기를 한 번이라도 쓴 건(삭제한 후기도 센다)의 비율 — 같은 건은 한 번만 센다", () => {
  const k1 = reviewKey("u1", "personal", "o1");
  const k2 = reviewKey("u2", "personal", "o2");
  const k3 = reviewKey("u3", "chat", "a3");
  const r = reviewWriteRate([k1, k2, k3, k3], new Set([k1, reviewKey("x", "chat", "none")]));
  assert.deepEqual(r, { eligible: 3, written: 1, rate: 33.3 });
  assert.deepEqual(reviewWriteRate([], new Set()), { eligible: 0, written: 0, rate: null });
});
