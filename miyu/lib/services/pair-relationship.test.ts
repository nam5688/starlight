// 실행: npm test — 리포트 궁합(유료 2)의 "무슨 사이인가요?" · 성별: 초대한 사람이 사이를 알려 주고(쌍에 저장) → 초대받은 사람이 그 사이를 보고 동의 → 두 사람이 모두 같은 사이로 읽는 글을 공동 열람하는 흐름,
// 성별 입력과 원본 분석 결과의 충돌 처리(조용히 덮어쓰지 않고 멈춘다), 이 기능 이전의 쌍(사이 없음)의 중립 호환을 확인한다.
// 메모리 저장소 + 가짜 결제사 + 모의 AI. 실제 AI · 결제사 · DB를 부르지 않는다(migration 26이 없는 DB의 안전한 멈춤은 저장소 구현 옆의 pairs-relationship.test.ts가 따로 본다).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { COMPAT_RELATIONSHIPS, RELATIONSHIP_LABEL, type CompatRelationship } from "../compat/relationship.ts";
import type { GatewayPayment } from "../commerce/order.ts";
import { PAIR_COMPAT } from "../config/product.ts";
import { EMPTY_BASIC_INFO, type BasicInfo } from "../profile/basic-info.ts";
import { createAiReportGenerator } from "../report/ai/generator.ts";
import { createMockModel } from "../report/ai/mock-model.ts";
import type { ModelRequest, TextModel } from "../report/ai/model.ts";
import { topicFor } from "../report/compat/plan.ts";
import { isPairReport } from "../report/compat/types.ts";
import { manseryeokEngine as sajuEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { confirmPayment } from "./order-service.ts";
import { createPairInvite, getPairView, joinPairInvite, listMyPairs, pairInputFor, peekPairInvite, startPairCheckout, type PairDeps } from "./pair-service.ts";
import type { PaymentGateway } from "./ports.ts";
import { ensureReport } from "./report-service.ts";
import { createMemoryPairs } from "./testing/memory-pairs.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const T0 = new Date("2026-10-19T00:00:00Z");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const INFO_A: BasicInfo = { ...EMPTY_BASIC_INFO, nickname: "슬기", birthYear: "1996", birthMonth: "3", birthDay: "29", birthTime: "09:30", gender: "female", knownMbti: "INFJ", regionProvince: "서울특별시", regionDistrict: "마포구" };
const INFO_B: BasicInfo = { ...EMPTY_BASIC_INFO, nickname: "남수", birthYear: "1994", birthMonth: "11", birthDay: "2", birthTime: "09:30", gender: "male", knownMbti: "ESTP", regionProvince: "서울특별시", regionDistrict: "강남구" };
const answersAll = (v: number) => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, v])));

const done = (orderId: string, amount: number, paymentKey: string): GatewayPayment => ({ paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: "2026-10-19T10:00:00+09:00", mId: "fake" });
const gateway: PaymentGateway = {
  provider: "tosspayments",
  async confirm(i) {
    return { ok: true, payment: done(i.orderId, i.amount, i.paymentKey) };
  },
  async getPayment() {
    return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
  },
  async getPaymentByOrderId() {
    return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
  },
};

async function setup() {
  const clock = { now: T0 };
  const mem = createMemoryRepository(() => clock.now);
  const mp = createMemoryPairs(mem, () => clock.now);
  const save = async (userId: string, info: BasicInfo, v: number) => {
    const r = await submitAssessment({ repo: mem.repo, saju: sajuEngine }, { userId, channel: "web", info, answers: answersAll(v), today: T0 });
    assert.ok(r.ok);
    return r.ok ? r.assessment : (null as never);
  };
  const a = await save(A, INFO_A, 4);
  const b = await save(B, INFO_B, 2);
  let n = 0;
  const deps: PairDeps = { repo: mem.repo, pairs: mp.repo, now: () => clock.now, saleOpen: true, generatorReady: true, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, newToken: () => `tok${String(n).padStart(2, "0")}${"x".repeat(19)}` };
  const mock = createMockModel();
  const calls: ModelRequest[] = [];
  const spy: TextModel = { provider: mock.provider, model: mock.model, async complete(req) { calls.push(req); return mock.complete(req); } };
  const generator = createAiReportGenerator({ model: spy, now: () => T0, sleep: async () => {} });
  const gen = () => ({ repo: mem.repo, pairs: mp.repo, generator, now: () => clock.now });
  const invite = (over: { relationship?: unknown; myGender?: unknown; consent?: boolean } = {}) =>
    createPairInvite(deps, { userId: A, assessmentId: a.id, consent: over.consent ?? true, relationship: "relationship" in over ? over.relationship : "lover", myGender: "myGender" in over ? over.myGender : "female" });
  const join = (token: string, over: { myGender?: unknown } = {}) => joinPairInvite(deps, { token, userId: B, consent: true, myGender: "myGender" in over ? over.myGender : "male" });
  async function linked(rel: CompatRelationship = "lover") {
    const inv = await invite({ relationship: rel });
    assert.equal(inv.kind, "created");
    if (inv.kind !== "created") throw new Error("초대 실패");
    assert.equal((await join(inv.pair.token)).kind, "joined");
    return inv.pair;
  }
  async function buy(pairId: string, userId: string) {
    const r = await startPairCheckout(deps, { userId, pairId });
    if (r.kind !== "order") throw new Error(`주문 실패: ${r.kind}`);
    const paid = await confirmPayment({ repo: mem.repo, gateway }, { userId, orderNumber: r.order.orderNumber, paymentKey: `pk_${r.order.orderNumber}`, amount: r.order.amount });
    if (paid.kind !== "paid") throw new Error("결제 실패");
    return paid.order;
  }
  return { mem, mp, deps, a, b, gen, calls, invite, join, linked, buy };
}

test("초대: 사이와 내 성별을 직접 골라야 한다 — 비었거나 알 수 없는 값, 분석 때와 다른 성별은 쌍을 만들지 않고 이유를 알려 준다", async () => {
  const s = await setup();
  const mine = async () => (await s.mp.repo.listPairsForUser(A)).length;
  for (const bad of [undefined, null, "", "boyfriend", "연인", 3]) {
    const r = await s.invite({ relationship: bad });
    assert.ok(r.kind === "invalid" && r.errors.relationship === "무슨 사이인지 선택해 주세요.", String(bad));
  }
  for (const bad of [undefined, null, "", "x"]) {
    const r = await s.invite({ myGender: bad });
    assert.ok(r.kind === "invalid" && r.errors.myGender === "성별을 선택해 주세요.", String(bad));
  }
  const clash = await s.invite({ myGender: "male" });
  assert.ok(clash.kind === "invalid" && /분석할 때는 "여자"로 입력하셨어요/.test(clash.errors.myGender ?? ""), "분석 때와 다른 성별은 덮어쓰지 않고 멈춘다");
  const both = await s.invite({ relationship: "", myGender: "" });
  assert.ok(both.kind === "invalid" && both.errors.relationship && both.errors.myGender, "오류는 한 번에 알려 준다");
  assert.equal(await mine(), 0, "검사에 걸리면 쌍도 초대 링크도 만들어지지 않는다");
  // 동의가 없으면 사이를 고르는 것과 상관없이 만들지 않는다
  assert.equal((await s.invite({ consent: false })).kind, "no-consent");
  assert.equal(await mine(), 0);
});

test("연결: 초대받은 사람은 초대한 사람이 알려 준 사이를 보고(peek) 자기 성별을 직접 골라 동의한다 — 분석 때와 다른 성별이면 연결하지 않고, 같게 고르면 연결된다", async () => {
  const s = await setup();
  const inv = await s.invite({ relationship: "some" });
  if (inv.kind !== "created") throw new Error("초대 실패");
  assert.equal(inv.pair.relationship, "some");
  const peek = await peekPairInvite(s.deps, { token: inv.pair.token, userId: B });
  assert.ok(peek.kind === "open");
  if (peek.kind !== "open") return;
  assert.equal(peek.relationship, "some", "초대받은 사람에게 초대한 사람이 고른 사이가 보인다");
  assert.equal(peek.myAssessment?.savedGender, "male", "분석 때 입력한 성별을 알려 준다");
  assert.equal(JSON.stringify(peek).includes("슬기") && !peek.inviterNickname.includes("슬기"), false, "초대한 사람의 닉네임 말고는 보이지 않는다");

  for (const bad of [undefined, "", "x"]) {
    const r = await s.join(inv.pair.token, { myGender: bad });
    assert.ok(r.kind === "invalid" && r.errors.myGender === "성별을 선택해 주세요.", String(bad));
  }
  const clash = await s.join(inv.pair.token, { myGender: "female" });
  assert.ok(clash.kind === "invalid" && /분석할 때는 "남자"로 입력하셨어요/.test(clash.errors.myGender ?? ""));
  const still = await s.mp.repo.getPair(inv.pair.id);
  assert.equal(still?.status, "invited", "충돌하면 연결되지 않는다");
  assert.equal(still?.bUserId, null);
  assert.equal((await s.join(inv.pair.token)).kind, "joined");
  assert.equal((await s.mp.repo.getPair(inv.pair.id))?.relationship, "some", "연결해도 사이는 바뀌지 않는다");
});

test("여섯 사이마다: 초대 → 연결 → 한 사람이 결제 → 생성(모의 AI) → 두 사람이 같은 글을 읽고 그 글의 사이가 같다(공동 열람 전달) — AI 요청에 이름 · 성별은 없다", async () => {
  let score: number | null = null;
  const topics = new Set<string>();
  for (const rel of COMPAT_RELATIONSHIPS) {
    const s = await setup();
    const pair = await s.linked(rel);
    const order = await s.buy(pair.id, B); // 초대받은 사람이 결제
    s.calls.length = 0;
    const report = await ensureReport(s.gen(), order);
    assert.equal(report?.status, "ready", rel);
    assert.ok(report?.content && isPairReport(report.content));
    if (!report?.content || !isPairReport(report.content)) return;
    // 생성에 쓴 입력과 AI 요청
    const input = await pairInputFor(s.mem.repo, s.mp.repo, order);
    assert.equal(input.relationship, rel);
    const body = JSON.parse(s.calls[0].messages[0].content.slice(s.calls[0].messages[0].content.indexOf("\n") + 1));
    assert.equal(body.mode, "pair");
    assert.equal(body.relationship.id, rel);
    for (const c of s.calls) for (const m of c.messages) for (const secret of ["슬기", "남수", "male", "female", "남자", "여자", "1996", "1994"]) assert.ok(!m.content.includes(secret), `${rel}: AI 요청에 ${secret}이 있다`);
    // 저장된 글
    assert.equal(report.content.relationship, rel);
    assert.ok(report.content.headline.includes(RELATIONSHIP_LABEL[rel]));
    const topic = report.content.sections.find((x) => x.id === "love")!.topic;
    assert.equal(topic, topicFor({ id: "love", topic: "연애와 결혼 궁합" }, rel));
    topics.add(topic);
    if (score === null) score = report.content.summary.score;
    assert.equal(report.content.summary.score, score, `${rel}: 점수는 사이로 바뀌지 않는다`);
    assert.ok(!JSON.stringify(report.content).match(/슬기|남수|male|female|남자|여자/), "저장된 글에 이름 · 성별이 없다");
    // 공동 열람: 결제한 사람(B)과 상대(A)가 같은 글, 같은 사이를 본다. 쌍 화면에서도 같은 사이
    const va = await getPairView(s.deps, { pairId: pair.id, userId: A });
    const vb = await getPairView(s.deps, { pairId: pair.id, userId: B });
    assert.ok(va.kind === "ok" && vb.kind === "ok" && va.relationship === rel && vb.relationship === rel);
    if (va.kind === "ok" && vb.kind === "ok" && va.report.state === "ready" && vb.report.state === "ready") {
      assert.deepEqual(va.report.report, vb.report.report);
      assert.equal(va.report.report.relationship, rel);
    } else assert.fail("두 사람 모두 읽을 수 있어야 한다");
    assert.equal((await listMyPairs(s.deps, A))[0].report, "ready");
  }
  assert.equal(topics.size, 6);
});

test("이 기능 이전의 쌍(사이 없음)은 특정 관계로 채우지 않고 중립으로 읽는다 — 연결 · 결제 · 생성 · 열람이 예전처럼 되고 글에는 사이가 없다", async () => {
  const s = await setup();
  // migration 26 이전에 만들어진 쌍: relationship 칸이 비어 있다
  const created = await s.mp.repo.createPair({ id: "00000000-0000-4000-8000-0000000000aa", token: `legacy${"x".repeat(18)}`, aUserId: A, aAssessmentId: s.a.id, aConsentAt: T0.toISOString(), aConsentVersion: PAIR_COMPAT.consentVersion, expiresAt: new Date(T0.getTime() + 86_400_000).toISOString(), relationship: null as never });
  assert.ok(created.ok);
  if (!created.ok) return;
  assert.equal(created.value.relationship, null);
  const peek = await peekPairInvite(s.deps, { token: created.value.token, userId: B });
  assert.ok(peek.kind === "open" && peek.relationship === null);
  assert.equal((await s.join(created.value.token)).kind, "joined", "예전 초대도 성별만 고르면 연결된다");
  const order = await s.buy(created.value.id, A);
  const input = await pairInputFor(s.mem.repo, s.mp.repo, order);
  assert.equal(input.relationship, null);
  const report = await ensureReport(s.gen(), order);
  assert.equal(report?.status, "ready");
  if (!report?.content || !isPairReport(report.content)) throw new Error("리포트가 없다");
  assert.equal(report.content.relationship, undefined);
  assert.equal(report.content.sections.find((x) => x.id === "love")!.topic, "연애와 결혼 궁합");
  assert.ok(!report.content.notes.items.some((t) => t.includes("사이는 직접 알려 주신 값")));
  assert.ok(s.calls.length > 0);
  for (const c of s.calls) {
    const content = c.messages[0].content;
    assert.equal(JSON.parse(content.slice(content.indexOf("\n") + 1)).relationship, undefined, "사이를 모르는 쌍의 AI 요청에는 relationship 항목이 없다");
  }
  const view = await getPairView(s.deps, { pairId: created.value.id, userId: B });
  assert.ok(view.kind === "ok" && view.relationship === null && view.report.state === "ready");
});
