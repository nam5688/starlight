// 실행: npm test — 상황형 28문항 연결 점검: 저장 → 미리보기 · 유형 카드 · 결과 화면 재료 → 개발용 리포트 · 확장 · 대화 → AI 근거(모의 작성기) → 궁합 버전 분기, 그리고 예전 22문항 결과가 그대로인지.
// 비용 0 · 실제 AI 호출 없음(모의 모델만). 이 시험이 통과해도 실제 AI의 글이 통과하거나 읽을 만하다는 뜻이 아니다.
import assert from "node:assert/strict";
import test from "node:test";
import { PERSONAL_REPORT, PERSONAL_TYPE } from "../../config/product.ts";
import type { GatewayPayment } from "../../commerce/order.ts";
import { devReportGenerator } from "../../report/generate-dev-report.ts";
import { isReadingReport, type ReportGenerator } from "../../report/generator.ts";
import { confirmPayment, startCheckout, syncPayment } from "../../services/order-service.ts";
import type { GatewayResult, PaymentGateway } from "../../services/ports.ts";
import { ensureReport, getResultView, listMyItems, runReport } from "../../services/report-service.ts";
import { EMPTY_BASIC_INFO, type BasicInfo } from "../../profile/basic-info.ts";
import { buildPersonas } from "../../report/ai/compare-personas.ts";
import { buildEvidence, createAiReportGenerator } from "../../report/ai/generator.ts";
import { createMockModel } from "../../report/ai/mock-model.ts";
import { buildDevFreeSummary } from "../../report/build-free-summary.ts";
import { pairEvidenceOf } from "../../report/compat/pair-evidence.ts";
import { PAIR_NOTES } from "../../report/compat/plan.ts";
import { buildReportExtras } from "../../report/extras.ts";
import { withCurrentInsight } from "../../report/free-insight.ts";
import { buildIdentityType, personalTypeFor } from "../../report/identity.ts";
import { buildDevReport } from "../../report/generate-dev-report.ts";
import { buildFreePreview } from "../../report/preview.ts";
import { buildFreeTalkModel } from "../../report/reading/talk-free.ts";
import { assessmentTypeTitle } from "../../report/type-title.ts";
import type { TypeTitle } from "../../report/type-title.ts";
import { calculateSaju, manseryeokEngine } from "../../saju/manseryeok-engine.ts";
import { submitAssessment } from "../../services/assessment-service.ts";
import { reportInputOf } from "../../services/report-service.ts";
import { createMemoryRepository } from "../../services/testing/memory-repository.ts";
import { ASSESSMENT_MODULES } from "../modules/index.ts";
import { summarizeAnswers } from "../active.ts";
import { consistentSheet } from "./measure.ts";
import { SCENE_IDS } from "./reading.ts";
import { answerVersionOf, buildSituationalFreeSummary } from "./summary.ts";

const TODAY = new Date("2026-10-20T00:00:00Z");
const USER = "11111111-1111-4111-8111-111111111111";
const REF = { year: 2026, month: 10 };
const INFO: BasicInfo = { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true, gender: "female", knownMbti: "INFJ" };
const SAJU = calculateSaju({ year: 1995, month: 4, day: 12, calendar: "solar", isLeapMonth: false, birthTime: null, gender: "female" });
const sheet28 = (type: Parameters<typeof consistentSheet>[0]) => consistentSheet(type) as Record<string, number>;
const answers22 = (v: number) => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, v])));

async function save(answers: Record<string, number>, user = USER) {
  const mem = createMemoryRepository(() => TODAY);
  const saved = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId: user, channel: "web", info: INFO, answers, today: TODAY });
  return { mem, saved };
}

test("저장: 28문항 응답은 알려진 장면만 저장되고 요약(점수 없음) · 질문 버전 이름이 함께 남으며 사주도 같이 계산된다", async () => {
  const { saved } = await save({ ...sheet28("explorer"), extra: 5, m1: 3 });
  assert.equal(saved.ok, false, "다른 버전의 키가 섞이면 어느 질문의 응답인지 알 수 없어 저장하지 않는다");
  const { saved: ok } = await save({ ...sheet28("explorer"), s99: 2 });
  assert.ok(ok.ok);
  const a = ok.ok ? ok.assessment : (null as never);
  assert.deepEqual(Object.keys(a.answers).sort(), [...SCENE_IDS].sort());
  assert.equal(a.contentVersion, "situational-v2-live-0.1");
  assert.equal(a.source, "dev-scoring");
  assert.ok(a.summary.situational && a.summary.situational.answered === 28);
  assert.deepEqual([a.summary.temperament, a.summary.relationship, a.summary.mbti.axes], [[], [], []]);
  assert.equal(a.saju.status, "ok");
  assert.equal(answerVersionOf(a.answers), "situational-28");
  const { saved: none } = await save({ ...sheet28("explorer"), s05: 5 });
  assert.equal(none.ok, false, "다섯째 선택지는 없다");
});

test("저장 전후 같은 결과: 로그인 전 미리보기가 쓰는 요약과 저장된 요약이 같고, 같은 입력의 무료 미리보기 · 유형 카드가 같다", async () => {
  const answers = sheet28("duty-finisher");
  const pre = summarizeAnswers(answers, { strict: true });
  assert.ok(pre.ok);
  const { saved } = await save(answers);
  assert.ok(saved.ok);
  const stored = saved.ok ? saved.assessment : (null as never);
  assert.deepEqual(stored.summary, pre.ok ? pre.summary : null);
  const saju = stored.saju;
  const before = buildFreePreview({ summary: pre.ok ? pre.summary : (null as never), saju, reference: REF });
  const after = buildFreePreview({ summary: withCurrentInsight(stored.summary, stored.answers), saju, reference: REF });
  assert.deepEqual(after, before);
  const t1 = buildIdentityType({ saju, summary: pre.ok ? pre.summary : (null as never) });
  const t2 = buildIdentityType({ saju, summary: stored.summary });
  assert.deepEqual(t1, t2);
  assert.ok(t1 && (t1.kind === "type" || t1.kind === "mixed"));
  assert.ok(t1!.why && t1!.why.length > 10, "이름의 근거(또는 이름을 붙이지 않은 이유)가 한 문장 있다");
  if (SAJU.status === "ok") assert.equal(personalTypeFor({ saju: SAJU, summary: stored.summary }).kind, t1!.kind, "유형 계산 입구가 카드와 같은 결과를 낸다");
});

test("무료 미리보기: 점수 칸을 약속하지 않고 생활 말 문장이 앞에 오며 용어는 접힌 보조 영역(term)에만 있다 — 22문항 결과의 미리보기도 같은 생활 말을 쓴다", () => {
  const s28 = buildSituationalFreeSummary(sheet28("fast-doer"));
  if (SAJU.status !== "ok") throw new Error("사주 계산 실패");
  const p28 = buildFreePreview({ summary: s28, saju: SAJU, reference: REF });
  assert.equal(p28.lead.kind, "insight");
  assert.deepEqual(p28.scoreQuestions, []);
  assert.ok(!p28.locked.some((l) => l.id === "scores"));
  assert.equal(p28.basis.scenes, 28);
  assert.equal(p28.saju.status, "ok");
  if (p28.saju.status === "ok") {
    const life = p28.saju.life;
    assert.ok(life.headline.length >= 1 && life.dayMaster.lines.length === 3);
    assert.ok(life.dayMaster.term.startsWith("사주 용어로는"));
    // 앞에 읽히는 문장에는 사주 용어 · 한자 · 합쇼체가 없다
    for (const line of [...life.headline, ...life.dayMaster.lines, ...(life.everyday?.lines ?? []), ...(life.relation?.lines ?? [])]) {
      assert.ok(!/일간|오행|십성|[一-鿿]|입니다|합니다/.test(line), line);
    }
  }
  const p22 = buildFreePreview({ summary: buildDevFreeSummary(answers22(4)), saju: SAJU, reference: REF });
  assert.equal(p22.basis.scenes, undefined);
  assert.ok(p22.locked.some((l) => l.id === "scores"), "22문항 결과는 예전 그대로 점수 칸이 있다");
  assert.ok(p22.scoreQuestions.length === 2);
  assert.equal(p22.saju.status === "ok" && p22.saju.life.dayMaster.lines.length === 3, true);
});

test("유형 표시: 10개 유형이 켜져 있고 28문항 결과의 제목은 이름 + 근거 한 문장이며 옛 후보 이름(안정지향형 등)을 만들지 않는다", () => {
  assert.equal(PERSONAL_TYPE.visible, true);
  if (SAJU.status !== "ok") throw new Error("사주 계산 실패");
  const summary = buildSituationalFreeSummary(sheet28("careful-deep"));
  const title = assessmentTypeTitle({ saju: SAJU, summary }) as TypeTitle;
  assert.ok(title && ["type", "mixed"].includes(title.kind));
  assert.ok(title.why);
  assert.ok(!["안정지향형", "확인추구형", "거리유지형", "탐색지향형"].includes(title.name));
  assert.equal(summary.tendency.name, "상황별 읽기");
});

test("개발용 규칙 리포트 · 확장 · 대화: 28문항 결과로도 모든 칸이 채워지고 점수 · 예전 후보 이름 문장이 섞이지 않는다", () => {
  if (SAJU.status !== "ok") throw new Error("사주 계산 실패");
  const summary = buildSituationalFreeSummary(sheet28("relation-balancer"));
  const extras = buildReportExtras({ summary, saju: SAJU, reference: REF });
  assert.equal(extras.situations.length, 4);
  assert.equal(extras.starterActions.length, 3);
  assert.ok(extras.partner && extras.partner.fits.length >= 3, "어울리는 관계 조건은 가까운 사이 장면 읽기에서 쓴다");
  const text = JSON.stringify(extras);
  assert.ok(!/\d+\s*점|확인추구|거리유지|안정지향|탐색지향/.test(text));
  const report = buildDevReport({ nickname: "지민", knownMbti: "INFJ", birthText: "1995-04-12", summary, saju: SAJU, gender: "female", reference: REF, context: null });
  assert.ok(report.details.mbti.findings.length >= 3 && report.details.temperament.findings.length >= 2 && report.details.relationship.findings.length >= 2);
  assert.equal(report.actions.length, 3);
  assert.ok(report.integrated.common.length >= 1);
  assert.deepEqual([report.temperament, report.relationship, report.mbti.axes], [[], [], []]);
  // 무료 대화 모델도 점수 없이 만들어진다
  const preview = buildFreePreview({ summary, saju: SAJU, reference: REF });
  const model = buildFreeTalkModel({ name: "지민", preview, saju: SAJU, today: { year: 2026, month: 10, day: 20 }, href: "/results/x#r-purchase", owned: false, chat: { state: "locked" } });
  assert.equal(model.tier, "free");
  assert.ok(model.topics.length > 0);
  assert.ok(JSON.stringify(model).includes("상황형 질문 28장면"));
});

test("AI 근거(모의 작성기): 28문항 결과의 근거로 7개 대주제 글이 형식 검사를 통과하고 응답 근거(survey.s28.*)가 쓰인다 — 실제 AI는 부르지 않았다", async () => {
  const p01 = buildPersonas(10)[0];
  const input = { ...p01.input, summary: buildSituationalFreeSummary(sheet28("independent-driver")), knownMbti: "INFJ" };
  const evidence = buildEvidence(input, REF, { fortune: true });
  const survey = evidence.filter((e) => e.source === "survey" && e.id.startsWith("survey.s28."));
  assert.ok(survey.length >= 3, `응답 근거 ${survey.length}개`);
  assert.ok(evidence.some((e) => e.id === "self.mbti"), "입력한 MBTI 참고값은 그대로 더해진다");
  assert.ok(!evidence.some((e) => /^survey\.(ei|sn|tf|jp|novelty|caution|sensitivity|persistence|anxiety|avoidance)\./.test(e.id)), "점수 근거 id가 섞이지 않는다");
  const model = createMockModel({});
  const gen = createAiReportGenerator({ model, format: "story-7", now: () => new Date("2026-10-20T09:00:00+09:00") });
  const report = await gen.generate(input, {});
  assert.equal((report as { layout?: string }).layout, "story7");
  assert.equal(model.calls, 1, "모의 모델 1번 — 실제 AI 호출 없음");
});

test("궁합: 두 사람이 모두 28문항이면 읽힌 구분끼리 같은 쪽 · 다른 쪽으로 비교하고, 한 사람만 28문항이면 응답 비교를 하지 않고 점수 환산 없이 알린다", () => {
  const a28 = buildSituationalFreeSummary(sheet28("independent-driver"));
  const b28 = buildSituationalFreeSummary(sheet28("relation-balancer"));
  const same = pairEvidenceOf({ summary: a28, mbti: null }, { summary: a28, mbti: null });
  assert.ok(same.compared.length >= 3 && same.evidence.every((e) => /^pair\.s28\./.test(e.id)));
  assert.ok(same.evidence.every((e) => /같은 쪽/.test(e.fact)));
  const diff = pairEvidenceOf({ summary: a28, mbti: "INTJ" }, { summary: b28, mbti: "ENFP" });
  assert.ok(diff.evidence.some((e) => /서로 다른 쪽/.test(e.fact)));
  assert.ok(diff.evidence.some((e) => e.id === "pair.mbti"), "입력한 MBTI 비교는 그대로");
  assert.ok(diff.evidence.every((e) => !/\d+\s*점/.test(e.fact)));
  assert.equal(diff.versionMismatch, undefined);
  // 한 사람만 28문항
  const a22 = buildDevFreeSummary(answers22(4));
  for (const [x, y] of [[a28, a22], [a22, a28]] as const) {
    const r = pairEvidenceOf({ summary: x, mbti: null }, { summary: y, mbti: null });
    assert.equal(r.versionMismatch, true);
    assert.deepEqual([r.compared, r.comparedLabels, r.unclear, r.evidence], [[], [], [], []], "서로 다른 질문의 답을 환산해 비교하지 않는다");
  }
  assert.match(PAIR_NOTES.versionMismatch, /서로 다른 버전의 성향 질문/);
  // 22문항끼리는 예전 그대로
  const both22 = pairEvidenceOf({ summary: a22, mbti: null }, { summary: buildDevFreeSummary(answers22(2)), mbti: null });
  assert.equal(both22.versionMismatch, undefined);
  assert.ok(both22.evidence.every((e) => /^pair\.(?!s28)/.test(e.id)));
});

test("예전 22문항 결과 조회: 저장 · 요약 · 유형 · 미리보기 · 개발용 리포트가 예전 점수 규칙 그대로 동작한다", async () => {
  const { saved } = await save(answers22(4));
  assert.ok(saved.ok);
  const a = saved.ok ? saved.assessment : (null as never);
  assert.ok(!a.summary.situational);
  assert.equal(a.summary.temperament.length, 4);
  assert.equal(a.summary.mbti.axes.length, 4);
  assert.equal(answerVersionOf(a.answers), "likert-22");
  assert.match(a.contentVersion, /mbti@/);
  const input = reportInputOf(a);
  const report = buildDevReport(input);
  assert.ok(report.temperament.length === 4 && report.details.temperament.findings.length > 0);
  const t = buildIdentityType({ saju: a.saju, summary: a.summary });
  assert.ok(t && (t.kind === "type" || t.kind === "mixed"));
  assert.equal(t!.why, null, "22문항 결과에는 28문항 근거 문장이 없다");
});

// ───── 결제 · 환불 흐름(가짜 결제사 · 메모리 저장소 — 실제 결제 · 실제 토스 · 실제 AI 없음) ─────

const OTHER = "22222222-2222-4222-8222-222222222222";
function fakeGateway(handler: { confirm?: (i: { paymentKey: string; orderId: string; amount: number }) => GatewayResult; get?: (k: string) => GatewayResult }) {
  const calls = { confirm: 0, get: 0 };
  const gateway: PaymentGateway = {
    provider: "tosspayments",
    async confirm(i) {
      calls.confirm++;
      return handler.confirm ? handler.confirm(i) : { ok: false, code: "NOT_IMPLEMENTED", message: "", retryable: false };
    },
    async getPayment(k) {
      calls.get++;
      return handler.get ? handler.get(k) : { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
    },
    async getPaymentByOrderId() {
      return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
    },
  };
  return { gateway, calls };
}
const doneOf = (orderId: string, amount: number, paymentKey = "pk_q28"): GatewayPayment => ({ paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: "2026-10-20T10:00:00+09:00", mId: "tvivarepublica" });

test("결제 · 환불(가짜 결제사): 28문항 결과도 서버 가격으로 주문 → 승인 → 한 번만 생성 → 환불 반영까지 예전 결과와 같고, 생성 실패를 성공으로 처리하지 않으며 남의 결과는 열리지 않는다", async () => {
  const { mem, saved } = await save(sheet28("fast-doer"));
  assert.ok(saved.ok);
  const assessment = saved.ok ? saved.assessment : (null as never);
  const d = { repo: mem.repo, now: () => TODAY };
  const started = await startCheckout(d, { userId: USER, assessmentId: assessment.id });
  assert.equal(started.kind, "order");
  if (started.kind !== "order") return;
  assert.equal(started.order.amount, PERSONAL_REPORT.priceKrw, "가격은 서버가 정한다(28문항 결과도 같다)");
  assert.equal((await startCheckout(d, { userId: OTHER, assessmentId: assessment.id })).kind, "not-found", "남의 결과로는 주문할 수 없다");
  // 결제 전에는 리포트를 만들지 않는다
  assert.equal(await ensureReport({ repo: mem.repo, generator: devReportGenerator, now: () => TODAY }, started.order), null);

  const { gateway, calls } = fakeGateway({ confirm: (i) => ({ ok: true, payment: doneOf(i.orderId, i.amount, i.paymentKey) }), get: (k) => ({ ok: true, payment: doneOf(started.order.orderNumber, started.order.amount, k) }) });
  const bad = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_q28", amount: 100 });
  assert.equal(bad.kind, "rejected");
  assert.equal(calls.confirm, 0, "금액이 다르면 결제사에 승인 요청을 보내지 않는다");
  const paid = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_q28", amount: started.order.amount });
  assert.equal(paid.kind, "paid");
  if (paid.kind !== "paid") return;
  assert.equal((await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_q28", amount: started.order.amount })).kind, "paid");
  assert.equal(calls.confirm, 1, "같은 요청을 다시 보내도 한 번만 승인한다");

  // 생성 실패는 실패로 남고 결제 상태를 바꾸지 않는다 — 성공으로 처리하지 않는다
  const broken: ReportGenerator = { name: "broken", version: "1", generate: async () => { throw new Error("생성 서버 오류"); } };
  const failed = await ensureReport({ repo: mem.repo, generator: broken, now: () => TODAY }, paid.order);
  assert.equal(failed?.status, "failed");
  assert.equal(mem.orders.get(paid.order.id)?.status, "paid");
  assert.equal((await getResultView(mem.repo, { userId: USER, assessmentId: assessment.id }))?.report?.status, "failed");

  // AI가 꺼진 환경의 개발용 규칙 생성기(호출 없음)로 다시 만들면 28문항 결과로도 모든 칸이 있는 리포트가 된다
  let calls2 = 0;
  const counting: ReportGenerator = { name: "dev-rules", version: "x", generate: async (input) => (calls2++, devReportGenerator.generate(input)) };
  const first = await ensureReport({ repo: mem.repo, generator: counting, now: () => TODAY }, paid.order);
  const second = await ensureReport({ repo: mem.repo, generator: counting, now: () => TODAY }, paid.order);
  assert.equal(first?.status, "ready");
  assert.equal(calls2, 1, "완성된 리포트는 다시 만들지 않는다");
  assert.deepEqual(second?.content, first?.content, "저장된 같은 버전을 다시 보여 준다");
  const content = first?.content as { situational?: unknown; temperament?: unknown[]; extras?: { situations: unknown[] } } | null;
  assert.ok(content?.situational && content.temperament?.length === 0 && content.extras?.situations.length === 4);

  // 모의 AI(실제 호출 없음)로도 같은 흐름
  const model = createMockModel({});
  const ai = createAiReportGenerator({ model, now: () => TODAY, sleep: async () => {} });
  const mem2 = (await save(sheet28("explorer"), OTHER)).mem;
  const a2 = [...mem2.assessments.values()][0];
  const s2 = await startCheckout({ repo: mem2.repo, now: () => TODAY }, { userId: OTHER, assessmentId: a2.id });
  if (s2.kind !== "order") throw new Error();
  const p2 = await confirmPayment({ repo: mem2.repo, gateway }, { userId: OTHER, orderNumber: s2.order.orderNumber, paymentKey: "pk_q28b", amount: s2.order.amount });
  if (p2.kind !== "paid") throw new Error();
  const ready = await runReport({ repo: mem2.repo, generator: ai, now: () => TODAY }, p2.order);
  assert.equal(ready?.status, "ready");
  assert.ok(ready?.content && isReadingReport(ready.content));
  assert.equal(model.calls, 1);

  // 결제사가 취소하면 환불로 맞춘다(결제사 조회 결과로만)
  const cancel = fakeGateway({ get: (k) => ({ ok: true, payment: { ...doneOf(started.order.orderNumber, started.order.amount, k), status: "CANCELED", balanceAmount: 0 } }) });
  await syncPayment({ repo: mem.repo, gateway: cancel.gateway }, { paymentKey: "pk_q28" });
  assert.equal(mem.orders.get(paid.order.id)?.status, "refunded");
  const items = await listMyItems(mem.repo, USER);
  assert.equal(items[0].purchase, "refunded");
  assert.equal(await getResultView(mem.repo, { userId: OTHER, assessmentId: assessment.id }), null, "남의 결과는 열리지 않는다");
});
