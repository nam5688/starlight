// 실행: npm test — 사주 궁합(유료)의 "무슨 사이인가요?" · 성별: 결제 시작의 입력 검사(서버가 다시 확인) → 상대 입력과 함께 보관 → 리포트 생성(모의 AI) → 저장된 글의 사이 → 열람/MY,
// 그리고 이 기능 이전에 보관된 요청(사이 · 성별 없음)이 특정 관계로 채워지지 않고 중립으로 읽히는지 확인한다.
// 메모리 저장소 + 가짜 결제사 + 모의 AI. 실제 AI · 결제사 · DB를 부르지 않는다. 실제 DB(migration 없이 jsonb에 담는다)는 supabase/tests/compat.db.test.ts가 로컬 Postgres로 따로 본다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { COMPAT_RELATIONSHIPS, RELATIONSHIP_LABEL } from "../compat/relationship.ts";
import type { GatewayPayment } from "../commerce/order.ts";
import { EMPTY_BASIC_INFO, type BasicInfo } from "../profile/basic-info.ts";
import { createAiReportGenerator } from "../report/ai/generator.ts";
import { createMockModel } from "../report/ai/mock-model.ts";
import { COMPAT_NOTES } from "../report/compat/plan.ts";
import { isCompatReport } from "../report/compat/types.ts";
import { manseryeokEngine as sajuEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { compatInputFor, getCompatReportView, listMyCompat, partnerSajuOf, readCompatPartner, startCompatCheckout } from "./compat-service.ts";
import { confirmPayment } from "./order-service.ts";
import type { PaymentGateway } from "./ports.ts";
import { ensureReport, queueReport } from "./report-service.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const T0 = new Date("2026-10-19T00:00:00Z");
const USER = "11111111-1111-4111-8111-111111111111";
const INFO: BasicInfo = { ...EMPTY_BASIC_INFO, nickname: "슬기", birthYear: "1996", birthMonth: "3", birthDay: "29", birthTime: "09:30", gender: "female", knownMbti: "INFJ", regionProvince: "서울특별시", regionDistrict: "마포구" };
const answersAll = (v: number) => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, v])));
const PARTNER = { nickname: "남수", gender: "male", calendar: "solar", isLeapMonth: false, birthYear: "1994", birthMonth: "11", birthDay: "2", birthTime: "09:30", birthTimeUnknown: false };

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

async function setup(info: BasicInfo = INFO) {
  const clock = { now: T0 };
  const mem = createMemoryRepository(() => clock.now);
  const saved = await submitAssessment({ repo: mem.repo, saju: sajuEngine }, { userId: USER, channel: "web", info, answers: answersAll(4), today: T0 });
  assert.ok(saved.ok);
  const assessment = saved.ok ? saved.assessment : (null as never);
  const generator = createAiReportGenerator({ model: createMockModel(), now: () => T0, sleep: async () => {} });
  const start = (over: { partner?: unknown; relationship?: unknown; myGender?: unknown } = {}) =>
    startCompatCheckout(
      { repo: mem.repo, now: () => clock.now, saleOpen: true, generatorReady: true },
      { userId: USER, assessmentId: assessment.id, partner: "partner" in over ? over.partner : PARTNER, relationship: "relationship" in over ? over.relationship : "lover", myGender: "myGender" in over ? over.myGender : "female" },
    );
  const gen = () => ({ repo: mem.repo, generator, now: () => clock.now });
  async function buy(over: Parameters<typeof start>[0] = {}) {
    const started = await start(over);
    if (started.kind !== "order") throw new Error(`주문 실패: ${JSON.stringify(started)}`);
    const paid = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: `pk_${started.requestId}`, amount: started.order.amount });
    if (paid.kind !== "paid") throw new Error("결제 실패");
    return { started, order: paid.order };
  }
  return { mem, clock, assessment, generator, start, gen, buy };
}

test("입력 검사(서버): 사이를 고르지 않거나 알 수 없는 값이면, 성별을 고르지 않았으면 주문 없이 이유를 알려 준다 — 어떤 값도 대신 채우지 않는다", async () => {
  const s = await setup();
  const orders = async () => (await s.mem.repo.listOrdersForAssessment(s.assessment.id)).length;
  for (const bad of [undefined, null, "", "boyfriend", "LOVER", 7]) {
    const r = await s.start({ relationship: bad });
    assert.equal(r.kind, "invalid", String(bad));
    if (r.kind !== "invalid") return;
    // 비었으면 고르라고 안내, 알 수 없는 값은 형식 오류
    if (bad === undefined || bad === null || bad === "") assert.equal(r.errors.relationship, "무슨 사이인지 선택해 주세요.");
    else assert.equal(r.message, "입력 형식이 올바르지 않아요.");
  }
  const noPartnerGender = await s.start({ partner: { ...PARTNER, gender: "" } });
  assert.ok(noPartnerGender.kind === "invalid" && noPartnerGender.errors.gender === "성별을 선택해 주세요.");
  const missingKey = await s.start({ partner: { ...PARTNER, gender: undefined } });
  assert.ok(missingKey.kind === "invalid" && missingKey.errors.gender);
  const badGender = await s.start({ partner: { ...PARTNER, gender: "other" } });
  assert.equal(badGender.kind, "invalid");
  const noMine = await s.start({ myGender: "" });
  assert.ok(noMine.kind === "invalid" && noMine.errors.myGender === "성별을 선택해 주세요.");
  // 오류가 여러 개여도 한 번에 알려 준다
  const many = await s.start({ relationship: "", myGender: undefined, partner: { ...PARTNER, gender: "" } });
  assert.ok(many.kind === "invalid" && many.errors.relationship && many.errors.myGender && many.errors.gender);
  assert.equal(await orders(), 0, "검사에 걸리면 주문도 상대 정보 보관도 만들지 않는다");
});

test("원본 프로필과 충돌: 분석 때 입력한 성별과 다른 성별을 고르면 조용히 덮어쓰지 않고 멈춰 이유를 알려 준다 — 주문 · 보관 없음, 같게 고르면 진행", async () => {
  const s = await setup(); // 분석 때 여자
  const clash = await s.start({ myGender: "male" });
  assert.ok(clash.kind === "invalid");
  if (clash.kind !== "invalid") return;
  assert.match(clash.errors.myGender!, /분석할 때는 "여자"로 입력하셨어요/);
  assert.match(clash.errors.myGender!, /새로 받아 주세요/);
  assert.equal((await s.mem.repo.listOrdersForAssessment(s.assessment.id)).length, 0);
  assert.equal((await s.mem.repo.getAssessment(s.assessment.id))?.saju && (s.mem.assessments.get(s.assessment.id)!.saju as { gender?: string }).gender, "female", "저장된 분석 결과는 그대로다");
  assert.equal((await s.start({ myGender: "female" })).kind, "order");
});

test("여섯 사이 × 상대 성별 둘 × 내 성별: 모두 주문이 만들어지고 상대 입력과 함께 사이 · 성별이 보관되며, 동성 조합도 막히지 않는다", async () => {
  for (const rel of COMPAT_RELATIONSHIPS) {
    for (const partnerGender of ["male", "female"] as const) {
      const s = await setup();
      const r = await s.start({ relationship: rel, partner: { ...PARTNER, gender: partnerGender } });
      assert.equal(r.kind, "order", `${rel}/${partnerGender}`);
      if (r.kind !== "order") return;
      const req = await s.mem.repo.getCompatRequestByOrder(r.order.id);
      assert.equal(req?.partner?.relationship, rel);
      assert.equal(req?.partner?.gender, partnerGender);
      assert.equal(req?.partner?.nickname, "남수");
      // 상대의 사주는 입력한 성별로 계산되어 대운이 있다(성별이 10년 시기 계산에만 들어간다)
      assert.ok(partnerSajuOf(req!.partner!).luck, "성별을 받은 상대는 대운이 계산된다");
    }
  }
  // 상대 입력을 읽는 함수(readCompatPartner)는 사이를 함께 돌려주고, 사이 없이는 성공하지 않는다
  const ok = readCompatPartner(PARTNER, T0, "friend");
  assert.ok(ok.ok && ok.partner.relationship === "friend" && ok.partner.gender === "male");
  assert.equal(readCompatPartner(PARTNER, T0).ok, false);
});

test("결제 → 리포트 생성(모의 AI): 저장된 글에 사이가 남고 5번 장 이름표 · 안내가 사이를 따르며, 보관한 상대 입력(사이 · 성별 포함)은 지워진다 — 점수는 사이와 상관없이 같다", async () => {
  let score: number | null = null;
  const topics = new Set<string>();
  for (const rel of COMPAT_RELATIONSHIPS) {
    const s = await setup();
    const { order } = await s.buy({ relationship: rel });
    await queueReport({ repo: s.mem.repo }, order);
    const report = await ensureReport(s.gen(), order);
    assert.equal(report?.status, "ready", rel);
    assert.ok(report?.content && isCompatReport(report.content));
    if (!report?.content || !isCompatReport(report.content)) return;
    assert.equal(report.content.relationship, rel);
    assert.ok(report.content.headline.includes(RELATIONSHIP_LABEL[rel]), "모의 작성기가 받은 사이가 글에 남았다(모델 입력까지 갔다)");
    topics.add(report.content.sections.find((x) => x.id === "love")!.topic);
    assert.ok(report.content.notes.items.some((t) => t.includes("사이는 직접 알려 주신 값")));
    assert.ok(report.content.notes.items.includes(COMPAT_NOTES.timingUsed), "내 성별과 상대 성별이 있어 두 사람의 대운이 근거로 쓰였다");
    if (score === null) score = report.content.summary.score;
    assert.equal(report.content.summary.score, score, `${rel}: 점수가 사이로 바뀌지 않았다`);
    // 상대 입력 삭제 — 사이 · 성별도 보관소에서 사라진다. 저장된 글에는 사이(관점)만 남고 상대 생년월일 · 성별 값은 없다
    const req = await s.mem.repo.getCompatRequestByOrder(order.id);
    assert.equal(req?.partner, null);
    const stored = JSON.stringify(report.content);
    for (const secret of ["1994", "male", "female", "남자", "여자"]) assert.ok(!stored.includes(secret), `${rel}: 저장된 글에 ${secret}이 있다`);
    // 열람 · MY 목록에서도 그대로
    const view = await getCompatReportView(s.mem.repo, { userId: USER, orderNumber: order.orderNumber });
    assert.ok(view.kind === "ready" && view.report.relationship === rel);
    assert.equal((await listMyCompat(s.mem.repo, USER))[0].status, "paid-ready");
  }
  assert.equal(topics.size, 6);
});

test("이 기능 이전에 보관된 요청(사이 · 성별 없음)은 특정 관계로 채우지 않고 중립으로 읽는다 — 예전 이름표 · 안내 그대로, 대운 근거는 성별이 없어 빠진다", async () => {
  const s = await setup();
  const { order } = await s.buy();
  // 예전 형식으로 되돌린다: 사이 · 성별을 모르는 보관 입력
  const req = [...s.mem.compatRequests.values()].find((c) => c.orderId === order.id)!;
  const { relationship: _r, ...legacyPartner } = req.partner!;
  void _r;
  s.mem.compatRequests.set(req.id, { ...req, partner: { ...legacyPartner, gender: null } });
  const input = await compatInputFor(s.mem.repo, order, s.assessment);
  assert.equal(input.relationship, null, "특정 관계로 채우지 않는다");
  await queueReport({ repo: s.mem.repo }, order);
  const report = await ensureReport(s.gen(), order);
  assert.equal(report?.status, "ready");
  if (!report?.content || !isCompatReport(report.content)) throw new Error("리포트가 없다");
  assert.equal(report.content.relationship, undefined);
  assert.equal(report.content.sections.find((x) => x.id === "love")!.topic, "연애와 결혼 궁합");
  assert.ok(!report.content.notes.items.some((t) => t.includes("사이는 직접 알려 주신 값")));
  // 상대의 성별이 없던 예전 입력은 대운을 계산하지 못한다(세운 근거만 남는다) — 성별이 있을 때만 대운 근거가 생기는 것은 그대로다
  assert.equal(partnerSajuOf({ ...legacyPartner, gender: null }).luck, null);
  const view = await getCompatReportView(s.mem.repo, { userId: USER, orderNumber: order.orderNumber });
  assert.equal(view.kind, "ready");
});

test("성별을 받기 전에 저장한 분석 결과(저장된 성별 없음)로도 사주 궁합을 시작할 수 있다 — 고른 성별은 확인만 하고 내 사주의 대운 근거는 그대로 없다", async () => {
  const s = await setup();
  // 저장된 분석 결과에서 성별을 지워 예전 결과를 만든다
  const a = s.mem.assessments.get(s.assessment.id)!;
  const { gender: _g, luck: _l, ...rest } = a.saju as unknown as Record<string, unknown>;
  void _g;
  void _l;
  s.mem.assessments.set(a.id, { ...a, saju: { ...rest, luck: null } as never });
  const r = await s.start({ myGender: "male" });
  assert.equal(r.kind, "order");
});
