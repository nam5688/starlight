// 실행: npm test — 내 고민 자세히 알려주기: 저장과 발급의 분리 · 발급 기록(저장본) · 별도 주문 · 기존 리포트 보존 · 중복 방지 · 재시도.
// 메모리 저장소 + 가짜 결제사 + 모의 AI. 실제 AI · 결제사를 부르지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import type { GatewayPayment } from "../commerce/order.ts";
import { CONCERN_REPORT, concernProductId, PERSONAL_REPORT } from "../config/product.ts";
import { EMPTY_BASIC_INFO, type BasicInfo } from "../profile/basic-info.ts";
import { createAiReportGenerator } from "../report/ai/generator.ts";
import { createMockModel } from "../report/ai/mock-model.ts";
import type { TextModel } from "../report/ai/model.ts";
import { isConcernReport } from "../report/concern/types.ts";
import { devReportGenerator } from "../report/generate-dev-report.ts";
import { manseryeokEngine as sajuEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import {
  getConcernRecordView,
  getConcernWorkspace,
  scrubRecordContent,
  startConcernCheckout,
  type IssuingAvailability,
} from "./concern-service.ts";
import { saveContext, deleteContext } from "./context-service.ts";
import { getMyPage } from "./my-service.ts";
import { confirmPayment, startCheckout } from "./order-service.ts";
import type { PaymentGateway } from "./ports.ts";
import { ensureReport, getResultView, runReport } from "./report-service.ts";
import { withdrawMember } from "./member-service.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const T0 = new Date("2026-10-13T00:00:00Z");
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ENABLED: IssuingAvailability = { enabled: true };

const INFO: BasicInfo = { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true, gender: "female", knownMbti: "INFJ", regionProvince: "서울특별시", regionDistrict: "마포구" };
const answersAll = (v: number) => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, v])));

const WORK = {
  topic: "work",
  question: "지금 다니는 회사를 계속 다닐지 이직을 준비할지 결정을 못 하고 있어요.",
  situation: "새로운 제안이 오면 처음엔 끌리다가 연봉 협상 이야기가 나오면 계속 미루게 돼요. 팀장님 앞에서는 말이 잘 안 나와요.",
};
const LOVE = {
  topic: "love",
  question: "소개팅에서 만난 사람과 다음 약속을 잡아야 할지 고민이에요.",
  situation: "연락이 오면 반가운데 답장을 하루씩 미루게 돼요. 만나기로 한 주말 약속을 취소하고 싶어질 때가 많아요.",
};

function done(orderId: string, amount: number, paymentKey: string): GatewayPayment {
  return { paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: "2026-10-13T10:00:00+09:00", mId: "fake" };
}
const gatewayOk = (): PaymentGateway => ({
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
});

/** 요청 내용을 기억하는 모의 모델 */
function recordingModel() {
  const inner = createMockModel();
  const requests: string[] = [];
  const model: TextModel & { requests: string[]; calls: number } = {
    provider: "mock",
    model: "mock-0",
    requests,
    get calls() {
      return inner.calls;
    },
    complete: (req) => (requests.push(req.messages[0].content), inner.complete(req)),
  };
  return model;
}

async function setup() {
  const clock = { now: T0 };
  const mem = createMemoryRepository(() => clock.now);
  const saved = await submitAssessment({ repo: mem.repo, saju: sajuEngine }, { userId: USER, channel: "web", info: INFO, answers: answersAll(4), today: T0 });
  assert.ok(saved.ok);
  const assessment = saved.ok ? saved.assessment : (null as never);
  const model = recordingModel();
  const generator = createAiReportGenerator({ model, now: () => T0, sleep: async () => {} });
  const base = () => ({ repo: mem.repo, now: () => clock.now });
  const gen = () => ({ repo: mem.repo, generator, now: () => clock.now });
  const ids = { userId: USER, assessmentId: assessment.id };

  async function buyPersonal() {
    const started = await startCheckout(base(), ids);
    if (started.kind !== "order") throw new Error("주문 실패");
    const paid = await confirmPayment({ repo: mem.repo, gateway: gatewayOk() }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_personal", amount: started.order.amount });
    if (paid.kind !== "paid") throw new Error("결제 실패");
    const report = await ensureReport(gen(), paid.order);
    assert.equal(report?.status, "ready");
    return { order: paid.order, report: report! };
  }
  const write = (raw: Record<string, unknown>) => saveContext(mem.repo, { ...ids, raw, agreed: true, now: () => clock.now });
  const workspace = (issuing: IssuingAvailability = ENABLED) => getConcernWorkspace(mem.repo, { ...ids, issuing });
  async function issue(key: string) {
    const started = await startConcernCheckout({ ...base(), issuing: ENABLED }, ids);
    if (started.kind !== "order") throw new Error(`발급 시작 실패: ${started.kind}`);
    const paid = await confirmPayment({ repo: mem.repo, gateway: gatewayOk() }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: key, amount: started.order.amount });
    if (paid.kind !== "paid") throw new Error("결제 실패");
    const report = await ensureReport(gen(), paid.order);
    return { record: started.record, order: paid.order, report: report! };
  }
  return { mem, clock, assessment, ids, base, gen, model, generator, buyPersonal, write, workspace, issue };
}

test("저장과 발급은 따로다: 고민을 쓰고 · 고치고 · 저장해도 주문 · 리포트가 생기지 않는다", async () => {
  const s = await setup();
  await s.buyPersonal();
  const ordersBefore = s.mem.orders.size;
  const reportsBefore = s.mem.reports.size;
  const calls = s.model.calls;

  assert.equal((await s.workspace())?.issue.kind, "no-concern", "작성 기록 없음");
  assert.equal((await s.write(WORK)).kind, "saved");
  assert.equal((await s.write(LOVE)).kind, "saved");
  assert.equal(s.mem.orders.size, ordersBefore);
  assert.equal(s.mem.reports.size, reportsBefore);
  assert.equal(s.mem.concernRecords.size, 0, "발급 전에는 고민 기록(저장본)도 만들지 않는다");
  assert.equal(s.model.calls, calls, "AI도 부르지 않는다");
  assert.deepEqual((await s.workspace())?.issue, { kind: "can-issue", priceKrw: CONCERN_REPORT.priceKrw });
  assert.equal(CONCERN_REPORT.priceKrw, 4900);
});

test("발급 조건: 개인 통합 리포트를 산 사람만, 리포트가 준비된 뒤에만, 고민을 반영하는 AI가 연결됐을 때만 (개발용 생성기에서는 비활성)", async () => {
  const s = await setup();
  await s.write(WORK);
  assert.equal((await s.workspace())?.issue.kind, "not-purchased");
  assert.equal((await startConcernCheckout({ ...s.base(), issuing: ENABLED }, s.ids)).kind, "not-purchased");

  // 결제는 했지만 리포트를 아직 만들지 않은 상태
  const started = await startCheckout(s.base(), s.ids);
  if (started.kind !== "order") throw new Error();
  const paid = await confirmPayment({ repo: s.mem.repo, gateway: gatewayOk() }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_p", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error();
  assert.equal((await s.workspace())?.issue.kind, "base-not-ready");
  assert.equal((await startConcernCheckout({ ...s.base(), issuing: ENABLED }, s.ids)).kind, "base-not-ready");

  await ensureReport(s.gen(), paid.order);
  assert.equal((await s.workspace())?.issue.kind, "can-issue");
  const off: IssuingAvailability = { enabled: false, reason: "ai-not-connected" };
  assert.deepEqual((await s.workspace(off))?.issue, { kind: "unavailable", reason: "ai-not-connected" });
  assert.deepEqual(await startConcernCheckout({ ...s.base(), issuing: off }, s.ids), { kind: "unavailable", reason: "ai-not-connected" });
  assert.equal(s.mem.orders.size, 1, "발급할 수 없는 환경에서는 주문을 만들지 않는다");
  assert.equal(devReportGenerator.generateConcern, undefined, "개발용 규칙 생성기는 고민 리포트를 만들지 못한다");
});

test("발급: 그 순간의 고민을 기록으로 남기고, 4,900원 별도 주문을 만든다 (개인 통합 주문과 구분)", async () => {
  const s = await setup();
  const base = await s.buyPersonal();
  const w = await s.write(WORK);
  if (w.kind !== "saved") throw new Error();

  const started = await startConcernCheckout({ ...s.base(), issuing: ENABLED }, s.ids);
  if (started.kind !== "order") throw new Error(started.kind);
  assert.equal(started.order.amount, 4900);
  assert.equal(started.order.productId, concernProductId(started.record.id));
  assert.notEqual(started.order.productId, PERSONAL_REPORT.id);
  assert.equal(started.record.question, WORK.question);
  assert.equal(started.record.writtenAt, w.context.updatedAt, "작성 시점이 함께 남는다");
  assert.equal(started.record.scrubbedAt, null);

  // 결제 전: 기록은 있지만 발급 목록에는 없고, 개인 통합 리포트는 그대로 구매 완료
  assert.deepEqual((await s.workspace())?.entries, []);
  const view = await getResultView(s.mem.repo, s.ids);
  assert.equal(view?.paidOrder?.id, base.order.id, "결과 화면의 구매 권한은 개인 통합 주문 기준");
  assert.equal(view?.report?.id, base.report.id);
});

test("같은 저장본으로 두 번 눌러도(더블 클릭) 기록 · 주문은 하나, 시간이 지난 뒤 다시 누르면 이전 대기 주문만 대체한다", async () => {
  const s = await setup();
  await s.buyPersonal();
  await s.write(WORK);

  const [a, b] = await Promise.all([startConcernCheckout({ ...s.base(), issuing: ENABLED }, s.ids), startConcernCheckout({ ...s.base(), issuing: ENABLED }, s.ids)]);
  if (a.kind !== "order" || b.kind !== "order") throw new Error(`${a.kind}/${b.kind}`);
  assert.equal(a.record.id, b.record.id);
  assert.equal(a.order.orderNumber, b.order.orderNumber);
  assert.equal(s.mem.concernRecords.size, 1);
  assert.equal([...s.mem.orders.values()].filter((o) => o.productId === a.order.productId).length, 1);

  const again = await startConcernCheckout({ ...s.base(), issuing: ENABLED }, s.ids);
  if (again.kind !== "order") throw new Error();
  assert.equal(again.order.orderNumber, a.order.orderNumber, "방금 만든 대기 주문은 그대로 쓴다");

  s.clock.now = new Date(T0.getTime() + 120_000);
  const later = await startConcernCheckout({ ...s.base(), issuing: ENABLED }, s.ids);
  if (later.kind !== "order") throw new Error();
  assert.notEqual(later.order.orderNumber, a.order.orderNumber);
  assert.equal(later.record.id, a.record.id, "같은 저장본이므로 같은 기록");
  assert.equal(s.mem.orders.get(a.order.id)?.status, "canceled");
  assert.equal(s.mem.concernRecords.size, 1);
});

test("발급한 리포트: 기존 리포트를 덮어쓰지 않고 별도 기록으로 남고, 발급 당시 고민 기록 번호 · 작성 시점이 붙는다", async () => {
  const s = await setup();
  const base = await s.buyPersonal();
  const baseBefore = JSON.stringify(base.report.content);
  await s.write(WORK);
  const first = await s.issue("pk_c1");

  assert.equal(first.report.status, "ready");
  assert.ok(first.report.content && isConcernReport(first.report.content));
  assert.notEqual(first.report.id, base.report.id);
  assert.notEqual(first.report.orderId, base.report.orderId);
  assert.equal(first.report.content.basis.concern.recordId, first.record.id);
  assert.equal(first.report.content.basis.concern.writtenAt, first.record.writtenAt);
  assert.equal(first.report.content.basis.concern.topic, "work");
  assert.equal((await s.mem.repo.getReportByOrder(base.order.id))?.content && JSON.stringify((await s.mem.repo.getReportByOrder(base.order.id))!.content), baseBefore, "기존 개인 통합 리포트는 그대로");

  // AI에는 이미 준 리포트의 요지를 "되풀이하지 말 것"으로만 보낸다
  const request = s.model.requests.at(-1)!;
  assert.match(request, /"task":"concern-report"/);
  assert.match(request, /"alreadyProvided":\{/);
  assert.doesNotMatch(request, /지민/);

  const ws = await s.workspace();
  assert.deepEqual(ws?.issue, { kind: "issued", recordId: first.record.id, generation: "ready" });
  assert.equal(ws?.entries.length, 1);
  assert.equal(ws?.entries[0].isCurrent, true);
  assert.equal(ws?.entries[0].state, "ready");
  assert.equal((await s.mem.repo.listReportStatuses(USER)).length, 2);
});

test("고민을 고치면 발급 버튼이 다시 살아나고, 과거 기록 · 리포트의 고민과 해석은 바뀌지 않는다 (고친 내용으로 새 리포트를 따로 발급)", async () => {
  const s = await setup();
  await s.buyPersonal();
  await s.write(WORK);
  const first = await s.issue("pk_c1");
  const firstReport = JSON.stringify(first.report.content);

  // 같은 내용을 다시 저장하면 바뀐 것이 없다 → 저장 시점도 그대로, 여전히 "보러가기"
  const same = await s.write(WORK);
  assert.ok(same.kind === "saved" && same.changed === false);
  assert.equal((await s.workspace())?.issue.kind, "issued");

  // 한 글자라도 고치면 새 고민 → 다시 발급 가능
  const edited = await s.write({ ...WORK, situation: `${WORK.situation} 요즘은 퇴근 후에도 생각이 나요.` });
  assert.ok(edited.kind === "saved" && edited.changed === true);
  const afterEdit = await s.workspace();
  assert.deepEqual(afterEdit?.issue, { kind: "can-issue", priceKrw: 4900 });
  assert.equal(afterEdit?.entries[0].isCurrent, false, "이전 기록은 현재 고민이 아님");

  // 과거 기록 · 리포트는 그대로
  const oldRecord = await s.mem.repo.getConcernRecord(first.record.id);
  assert.equal(oldRecord?.situation, WORK.situation);
  assert.equal(JSON.stringify((await s.mem.repo.getReportByOrder(first.order.id))?.content), firstReport);

  // 두 번째 발급: 별도 기록 · 별도 주문 · 별도 리포트, 이전 고민 리포트는 "다르게 쓰라"는 참고로 전달
  const second = await s.issue("pk_c2");
  assert.notEqual(second.record.id, first.record.id);
  assert.notEqual(second.order.id, first.order.id);
  assert.equal(second.record.situation.includes("퇴근 후"), true);
  assert.ok(second.report.content && isConcernReport(second.report.content));
  assert.equal(second.report.content.basis.concern.recordId, second.record.id);
  assert.match(s.model.requests.at(-1)!, /"previousConcerns":\[\{/);

  const ws = await s.workspace();
  assert.equal(ws?.entries.length, 2);
  assert.deepEqual(ws?.entries.map((e) => e.isCurrent), [true, false], "최근 발급이 먼저");
  assert.deepEqual(ws?.issue, { kind: "issued", recordId: second.record.id, generation: "ready" });
  assert.equal(s.mem.concernRecords.size, 2);
});

test("이전 고민 내용으로 되돌려 저장하면 새로 결제하지 않고 그 기록의 리포트로 안내한다", async () => {
  const s = await setup();
  await s.buyPersonal();
  await s.write(WORK);
  const first = await s.issue("pk_c1");
  await s.write(LOVE);
  assert.equal((await s.workspace())?.issue.kind, "can-issue");
  await s.write(WORK);
  const ws = await s.workspace();
  assert.deepEqual(ws?.issue, { kind: "issued", recordId: first.record.id, generation: "ready" });
  const again = await startConcernCheckout({ ...s.base(), issuing: ENABLED }, s.ids);
  assert.equal(again.kind, "already-issued");
});

test("결제 없이 남은 임시 저장본은 고민을 고치면 내용이 지워지고, 결제 대기 중인 기록은 그대로 둔다", async () => {
  const s = await setup();
  await s.buyPersonal();
  await s.write(WORK);
  const started = await startConcernCheckout({ ...s.base(), issuing: ENABLED }, s.ids);
  if (started.kind !== "order") throw new Error();
  // 결제 대기 중에 고민을 고쳐도 대기 주문의 기록은 발급 시점의 고민 그대로
  await s.write(LOVE);
  const pendingRecord = await s.mem.repo.getConcernRecord(started.record.id);
  assert.equal(pendingRecord?.scrubbedAt, null);
  assert.equal(pendingRecord?.question, WORK.question);

  // 결제하지 않고 취소된 뒤에는 다음 저장 때 지운다
  await s.mem.repo.updateOrder(started.order.id, ["pending"], { status: "canceled", failureCode: "USER_CANCEL" });
  await s.write({ ...LOVE, situation: `${LOVE.situation} 더 적어요.` });
  assert.ok((await s.mem.repo.getConcernRecord(started.record.id))?.scrubbedAt);
  assert.equal((await s.mem.repo.getConcernRecord(started.record.id))?.question, "");

  // 고민을 지워도 마찬가지, 발급한 기록은 남는다
  await s.write(WORK);
  const issued = await s.issue("pk_c1");
  assert.equal(await deleteContext(s.mem.repo, { ...s.ids, now: () => s.clock.now }), true);
  assert.equal((await s.mem.repo.getConcernRecord(issued.record.id))?.question, WORK.question);
  assert.equal((await s.workspace())?.issue.kind, "no-concern");
  assert.equal((await s.workspace())?.entries.length, 1, "고민을 지워도 발급한 기록과 리포트는 남는다");
});

test("생성 실패: 같은 발급 건(같은 주문)으로 다시 시도하고 추가 결제는 없다", async () => {
  const s = await setup();
  await s.buyPersonal();
  await s.write(WORK);
  const started = await startConcernCheckout({ ...s.base(), issuing: ENABLED }, s.ids);
  if (started.kind !== "order") throw new Error();
  const paid = await confirmPayment({ repo: s.mem.repo, gateway: gatewayOk() }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_c1", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error();

  const flaky = createAiReportGenerator({ model: createMockModel({ failTimes: 3 }), now: () => T0, sleep: async () => {} });
  const failed = await runReport({ repo: s.mem.repo, generator: flaky, now: () => s.clock.now }, paid.order);
  assert.equal(failed?.status, "failed");
  assert.equal(s.mem.orders.get(paid.order.id)?.status, "paid", "결제는 그대로 유효");
  const ws = await s.workspace();
  assert.equal(ws?.entries[0].state, "failed");
  assert.deepEqual(ws?.issue, { kind: "issued", recordId: started.record.id, generation: "failed" });

  const ordersBefore = s.mem.orders.size;
  const retried = await runReport({ repo: s.mem.repo, generator: s.generator, now: () => s.clock.now }, paid.order, { retryFailed: true, ignoreCooldown: true });
  assert.equal(retried?.status, "ready");
  assert.equal(retried?.id, failed?.id, "같은 리포트 건으로 다시 만든다");
  assert.equal(s.mem.orders.size, ordersBefore, "새 주문 · 추가 결제 없음");
  assert.equal([...s.mem.orders.values()].filter((o) => o.status === "paid").length, 2);
});

test("고민을 반영하지 못하는 일반 해석 · 기존 리포트를 베낀 해석은 저장하지 않고 실패로 남긴다 (결제는 유지, 같은 건으로 재시도)", async () => {
  const s = await setup();
  await s.buyPersonal();
  await s.write(WORK);
  const started = await startConcernCheckout({ ...s.base(), issuing: ENABLED }, s.ids);
  if (started.kind !== "order") throw new Error();
  const paid = await confirmPayment({ repo: s.mem.repo, gateway: gatewayOk() }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_c1", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error();

  // 고민 내용을 하나도 받지 않은 답만 하는 모델
  const bland = (i: number) => `[모의 생성] 원국의 기운이 고르게 퍼져 있어 전체적으로 안정된 구조를 이루는 편이라는 해석 ${"가나다라마바사아자차"[i % 10]}번째 문단입니다. 이런 특징은 삶의 여러 장면에서 비슷하게 나타나는 경향이 있고 ${["차분함", "꾸준함", "신중함", "균형감", "절제력"][i % 5]}이 도드라지는 편입니다.`;
  const inner = createMockModel();
  const generic: TextModel = {
    provider: "mock",
    model: "mock-0",
    async complete(req) {
      const out = await inner.complete(req);
      if (!req.messages[0].content.includes('"task":"concern-report"')) return out;
      const d = JSON.parse(out.text);
      d.understanding.forEach((p: { text: string }, i: number) => (p.text = `알려 주신 내용이 있어서 ${bland(i)}`));
      d.pattern.forEach((p: { text: string }, i: number) => (p.text = bland(2 + i) + " 다만 이것은 한 가지 읽기입니다."));
      d.situations.forEach((x: { situation: string; reading: string; suggestion: string }, i: number) => {
        x.situation = `[모의 생성] 어떤 상황 ${i}에서 일반적으로 나타나는 모습`;
        x.reading = bland(4 + i);
        x.suggestion = `[모의 생성] ${["산책을 하며", "음악을 들으며", "차를 마시며", "일기를 쓰며", "스트레칭을 하며"][i % 5]} 마음을 편하게 가지고 천천히 생각해 보는 선택을 해 볼 수 있습니다.`;
      });
      d.actions.forEach((a: { situation: string; action: string }, i: number) => {
        a.situation = `[모의 생성] 일반 상황 ${i}`;
        a.action = ["[모의 생성] 숨을 깊게 쉬면서 어깨의 힘을 풀고 잠시 쉬어 갑니다.", "[모의 생성] 따뜻한 물을 천천히 마시며 오늘 하루를 돌아봅니다.", "[모의 생성] 좋아하는 노래를 한 곡 듣고 기분이 어떻게 변하는지 느껴 봅니다.", "[모의 생성] 창밖의 풍경을 한동안 바라보며 생각을 비워 봅니다."][i % 4];
      });
      return { ...out, text: JSON.stringify(d) };
    },
  };
  const g = createAiReportGenerator({ model: generic, now: () => T0, sleep: async () => {} });
  const failed = await runReport({ repo: s.mem.repo, generator: g, now: () => s.clock.now }, paid.order);
  assert.equal(failed?.status, "failed");
  assert.match(failed?.lastError ?? "", /고민 리포트 검사 실패/);
  assert.equal(failed?.content, null, "검사를 통과하지 못한 글은 저장하지 않는다");
  assert.equal(s.mem.orders.get(paid.order.id)?.status, "paid");
});

test("고민 반영 리포트를 만들 수 없는 생성기(개발용)로는 실패 처리하고 결제 · 기존 리포트는 건드리지 않는다", async () => {
  const s = await setup();
  const base = await s.buyPersonal();
  await s.write(WORK);
  const started = await startConcernCheckout({ ...s.base(), issuing: ENABLED }, s.ids);
  if (started.kind !== "order") throw new Error();
  const paid = await confirmPayment({ repo: s.mem.repo, gateway: gatewayOk() }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_c1", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error();
  const r = await runReport({ repo: s.mem.repo, generator: devReportGenerator, now: () => s.clock.now }, paid.order);
  assert.equal(r?.status, "failed");
  assert.match(r?.lastError ?? "", /고민 반영 리포트를 만들 수 없어요/);
  assert.equal((await s.mem.repo.getReportByOrder(base.order.id))?.status, "ready");
});

test("본인만: 다른 회원은 기록소 · 발급 · 기록 보기를 할 수 없다", async () => {
  const s = await setup();
  await s.buyPersonal();
  await s.write(WORK);
  const first = await s.issue("pk_c1");
  const other = { userId: OTHER, assessmentId: s.assessment.id };
  assert.equal(await getConcernWorkspace(s.mem.repo, { ...other, issuing: ENABLED }), null);
  assert.deepEqual(await startConcernCheckout({ ...s.base(), issuing: ENABLED }, other), { kind: "not-found" });
  assert.equal(await getConcernRecordView(s.mem.repo, { ...other, recordId: first.record.id }), null);
  assert.deepEqual(await scrubRecordContent(s.mem.repo, { ...other, recordId: first.record.id, now: () => T0 }), { kind: "not-found" });
  // 다른 검사 결과 번호로 기록을 열 수 없다
  assert.equal(await getConcernRecordView(s.mem.repo, { ...s.ids, assessmentId: "33333333-3333-4333-8333-333333333333", recordId: first.record.id }), null);
});

test("고민 기록 내용 지우기: 리포트가 준비된 기록만 지울 수 있고, 지워도 리포트 · 기록 자리 · 주제 · 시점은 남는다", async () => {
  const s = await setup();
  await s.buyPersonal();
  await s.write(WORK);
  const started = await startConcernCheckout({ ...s.base(), issuing: ENABLED }, s.ids);
  if (started.kind !== "order") throw new Error();
  const paid = await confirmPayment({ repo: s.mem.repo, gateway: gatewayOk() }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_c1", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error();
  await s.mem.repo.insertReport({ userId: USER, orderId: paid.order.id, assessmentId: s.assessment.id, status: "queued", attempts: 0 });
  const args = { ...s.ids, recordId: started.record.id, now: () => s.clock.now };
  assert.deepEqual(await scrubRecordContent(s.mem.repo, args), { kind: "report-not-finished" }, "생성 중에는 지우지 않는다");

  await runReport({ repo: s.mem.repo, generator: s.generator, now: () => s.clock.now }, paid.order);
  const before = JSON.stringify((await s.mem.repo.getReportByOrder(paid.order.id))?.content);
  assert.deepEqual(await scrubRecordContent(s.mem.repo, args), { kind: "scrubbed" });
  const rec = await s.mem.repo.getConcernRecord(started.record.id);
  assert.equal(rec?.question, "");
  assert.equal(rec?.situation, "");
  assert.equal(rec?.topic, "work");
  assert.equal(rec?.writtenAt, started.record.writtenAt);
  assert.ok(rec?.scrubbedAt);
  assert.equal(JSON.stringify((await s.mem.repo.getReportByOrder(paid.order.id))?.content), before);
  // 지운 뒤에도 같은 저장본이면 다시 결제하지 않는다
  assert.equal((await s.workspace())?.issue.kind, "issued");
  assert.equal((await startConcernCheckout({ ...s.base(), issuing: ENABLED }, s.ids)).kind, "already-issued");
});

test("MY: 개인 통합 리포트와 고민 반영 리포트를 발급일 · 고민 주제로 구분해 보여 주고, 결제내역에는 상품 이름이 따로 나온다", async () => {
  const s = await setup();
  await s.buyPersonal();
  await s.write(WORK);
  const first = await s.issue("pk_c1");
  s.clock.now = new Date(T0.getTime() + 3 * 3600_000);
  await s.write(LOVE);
  const second = await s.issue("pk_c2");

  const my = await getMyPage(s.mem.repo, USER, s.clock.now);
  assert.equal(my.cards.length, 1);
  assert.equal(my.cards[0].productName, PERSONAL_REPORT.name);
  assert.equal(my.cards[0].entitlement, "purchased");
  assert.equal(my.cards[0].generation, "ready");
  assert.equal(my.concerns.length, 2);
  assert.deepEqual(my.concerns.map((c) => c.recordId).sort(), [first.record.id, second.record.id].sort());
  assert.deepEqual(my.concerns.map((c) => c.topicLabel), [my.concerns[0].topicLabel, my.concerns[1].topicLabel]);
  assert.notEqual(my.concerns[0].topic, my.concerns[1].topic);
  assert.ok(my.concerns[0].issuedAt >= my.concerns[1].issuedAt, "발급일 최근 순");
  assert.ok(my.concerns.every((c) => c.generation === "ready" && c.entitlement === "purchased" && c.writtenAt && c.subject.includes("지민")));
  const names = my.orders.map((o) => o.productName);
  assert.equal(names.filter((n) => n === CONCERN_REPORT.name).length, 2);
  assert.equal(names.filter((n) => n === PERSONAL_REPORT.name).length, 1);
});

test("회원 탈퇴: 고민 기록(내용)도 함께 지워지고 주문 · 결제 기록은 남는다", async () => {
  const s = await setup();
  await s.buyPersonal();
  await s.write(WORK);
  await s.issue("pk_c1");
  const orders = s.mem.orders.size;
  const result = await withdrawMember(s.mem.repo, USER);
  assert.equal(result.kind, "done");
  assert.equal(s.mem.concernRecords.size, 0);
  assert.equal(s.mem.orders.size, orders);
});

test("개인 통합 리포트 결제 시작은 고민 반영 리포트의 대기 주문을 취소하지 않는다", async () => {
  const s = await setup();
  await s.buyPersonal();
  await s.write(WORK);
  const started = await startConcernCheckout({ ...s.base(), issuing: ENABLED }, s.ids);
  if (started.kind !== "order") throw new Error();
  // 이미 구매한 사람이 개인 통합 결제를 다시 시작해도 (이미 구매 안내) 고민 주문은 그대로
  const again = await startCheckout(s.base(), s.ids);
  assert.equal(again.kind, "already-paid");
  assert.equal(s.mem.orders.get(started.order.id)?.status, "pending");
});

test("상품 이름: 주문 목록에서 두 상품이 구분되고, 알 수 없는 상품 번호는 번호 그대로 보인다", async () => {
  const { productNameOf } = await import("../config/product.ts");
  assert.equal(productNameOf(PERSONAL_REPORT.id), PERSONAL_REPORT.name);
  assert.equal(productNameOf(concernProductId("11111111-1111-4111-8111-111111111111")), CONCERN_REPORT.name);
  assert.equal(productNameOf("concern-report:abc"), "concern-report:abc");
});
