// 실행: npm test — 회원 탈퇴: 개인정보는 지우고 거래 기록만 남기며, 진행 중인 결제 · 생성이 있으면 막고, 여러 번 해도 같은 결과
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { WITHDRAWAL_DELETED, WITHDRAWAL_KEPT } from "../membership/withdrawal.ts";
import { EMPTY_BASIC_INFO } from "../profile/basic-info.ts";
import { devReportGenerator } from "../report/generate-dev-report.ts";
import { manseryeokEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { confirmPayment, startCheckout } from "./order-service.ts";
import { withdrawalBlockers, withdrawMember } from "./member-service.ts";
import { queueReport, runReport } from "./report-service.ts";
import { createFakeToss } from "./testing/fake-toss.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, 4])));
const info = (nickname: string) => ({ ...EMPTY_BASIC_INFO, nickname, birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true, knownMbti: "INFJ" });

async function setup() {
  const now = () => new Date("2026-10-12T00:00:00Z");
  const mem = createMemoryRepository(now);
  const toss = createFakeToss(now);
  for (const u of [ME, OTHER]) await mem.repo.ensureProfile(u);
  const save = async (userId: string, nickname: string) => {
    const r = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId, channel: "web", info: info(nickname), answers, today: now() });
    if (!r.ok) throw new Error("save");
    return r.assessment;
  };
  const paid = await save(ME, "구매한분");
  const free = await save(ME, "무료만");
  const others = await save(OTHER, "다른회원");
  const started = await startCheckout({ repo: mem.repo, now }, { userId: ME, assessmentId: paid.id });
  if (started.kind !== "order") throw new Error("order");
  const confirmed = await confirmPayment({ repo: mem.repo, gateway: toss.gateway }, { userId: ME, orderNumber: started.order.orderNumber, paymentKey: "pk_w1", amount: started.order.amount });
  if (confirmed.kind !== "paid") throw new Error("pay");
  await queueReport({ repo: mem.repo }, confirmed.order);
  await runReport({ repo: mem.repo, generator: devReportGenerator, now }, confirmed.order);
  await mem.repo.upsertContext({ assessmentId: paid.id, userId: ME, topic: "work", question: "이직", situation: "", matched: "", differed: "", excerpt: "", agreedAt: now().toISOString() });
  return { mem, now, paid, free, others, order: confirmed.order };
}

test("탈퇴: 검사 결과 · 리포트 · 고민 입력은 지우고, 주문에 연결된 검사는 내용을 비우며, 주문 · 결제 기록은 남긴다", async () => {
  const s = await setup();
  const result = await withdrawMember(s.mem.repo, ME);
  assert.equal(result.kind, "done");
  assert.equal(result.kind === "done" && result.counts.reports, 1);
  assert.equal(result.kind === "done" && result.counts.assessments_deleted, 1, "주문 없는 무료 검사는 삭제");
  assert.equal(result.kind === "done" && result.counts.assessments_emptied, 1, "주문이 있는 검사는 비움");

  assert.equal(s.mem.assessments.has(s.free.id), false);
  const shell = s.mem.assessments.get(s.paid.id)!;
  assert.equal(shell.nickname, "탈퇴");
  assert.equal(shell.knownMbti, null);
  assert.deepEqual(shell.answers, {});
  assert.doesNotMatch(JSON.stringify(shell), /구매한분|INFJ/);
  assert.equal([...s.mem.reports.values()].filter((r) => r.userId === ME).length, 0, "리포트 내용 삭제");
  assert.equal(s.mem.contexts.size, 0, "내 고민 자세히 알려주기 입력 삭제");

  const order = s.mem.orders.get(s.order.id)!;
  assert.equal(order.status, "paid", "주문은 남는다");
  assert.equal(order.amount, 9900);
  assert.equal(s.mem.events.filter((e) => e.orderId === order.id).length > 0, true, "결제 처리 기록도 남는다");
  assert.equal(s.mem.profiles.get(ME)?.nickname, null);
});

test("탈퇴는 그 회원의 것만 다룬다: 다른 회원의 검사 · 주문 · 리포트는 그대로", async () => {
  const s = await setup();
  await withdrawMember(s.mem.repo, ME);
  assert.equal(s.mem.assessments.get(s.others.id)?.nickname, "다른회원");
  assert.equal(s.mem.profiles.has(OTHER), true);
});

test("탈퇴를 여러 번 불러도 같은 결과이고 오류가 나지 않는다 (뒤 단계 실패 후 재시도)", async () => {
  const s = await setup();
  assert.equal((await withdrawMember(s.mem.repo, ME)).kind, "done");
  const again = await withdrawMember(s.mem.repo, ME);
  assert.equal(again.kind, "done");
  assert.equal(again.kind === "done" && again.counts.reports, 0);
  assert.equal(again.kind === "done" && again.counts.assessments_emptied, 0);
});

test("진행 중인 결제 확인 · 리포트 생성이 있으면 탈퇴하지 않고, 화면에도 미리 알린다", async () => {
  const s = await setup();
  // 방금 시작한 대기 주문
  const second = await submitAssessment({ repo: s.mem.repo, saju: manseryeokEngine }, { userId: ME, channel: "web", info: info("세번째"), answers, today: s.now() });
  if (!second.ok) throw new Error("save");
  const started = await startCheckout({ repo: s.mem.repo, now: s.now }, { userId: ME, assessmentId: second.assessment.id });
  assert.equal(started.kind, "order");
  assert.deepEqual(await withdrawalBlockers(s.mem.repo, ME, s.now()), ["pending-order"]);
  const blocked = await withdrawMember(s.mem.repo, ME);
  assert.deepEqual(blocked, { kind: "blocked", reason: "pending-order" });
  assert.equal(s.mem.assessments.get(s.paid.id)?.nickname, "구매한분", "막힌 경우 아무것도 지우지 않는다");

  // 1시간이 지난 대기 주문은 막지 않는다
  const later = new Date(s.now().getTime() + 2 * 3600_000);
  assert.deepEqual(await withdrawalBlockers(s.mem.repo, ME, later), []);
});

test("안내 문구: 지워지는 것 · 남는 것 목록이 있고, 남는 것에 이름 · 생년월일 · 응답이 없다고 밝힌다", () => {
  assert.ok(WITHDRAWAL_DELETED.length >= 4 && WITHDRAWAL_KEPT.length >= 2);
  assert.match(WITHDRAWAL_KEPT[0], /이름 · 생년월일 · 응답은 포함되지 않으며/);
  assert.match(WITHDRAWAL_DELETED.join("\n"), /구매한 리포트의 내용/);
});
