// 실행: npm test — 맛보기 리포트(무료 · 로그인한 회원 · 한 계정당 1번): 소유자 · 연결 안 됨 · 저장 · 두 번째는 AI를 부르지 않음 · 동시 요청 · 실패하면 풀기 · 다른 결과에서 이미 받음 · 예산 · DB 변경 전.
import assert from "node:assert/strict";
import test from "node:test";
import { ModelCallError, type ModelRequest, type ModelResult, type TextModel } from "../report/ai/model.ts";
import { createMockTasteModel, TASTE_SAMPLE } from "../report/taste/mock-model.ts";
import type { TasteInput } from "../report/taste/types.ts";
import { createTasteWriter, type TasteWriter } from "../report/taste/writer.ts";
import { NO_LIMITS } from "./capacity-service.ts";
import type { AssessmentRecord, MiyuRepository } from "./ports.ts";
import { requestTasteReport, TASTE_MESSAGES, tasteStateFor, type TasteDeps, type TasteLoad } from "./taste-service.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const INPUT: TasteInput = { profile: { saju: ["큰 강처럼 넓게 흐르는 사람이에요"], response: ["시작하기 전에 여러 번 따져 보는 편일 수 있어요"] }, answers: [] };

async function setup(opts: { model?: TextModel; writer?: "none"; load?: TasteLoad; budget?: number; now?: () => Date } = {}) {
  const now = opts.now ?? (() => new Date("2026-10-16T03:00:00Z"));
  const mem = createMemoryRepository(now);
  const base = { channel: "web", nickname: "서윤", calendar: "solar", isLeapMonth: false, birthYear: 1994, birthMonth: 11, birthDay: 7, birthTime: "08:40", knownMbti: null, answers: {}, contentVersion: "t", source: "sample", summary: {}, saju: { status: "not-connected" } } as unknown as Omit<AssessmentRecord, "id" | "createdAt" | "userId">;
  const first = await mem.repo.insertAssessment({ ...base, userId: "u1" });
  const second = await mem.repo.insertAssessment({ ...base, userId: "u1" });
  const stranger = await mem.repo.insertAssessment({ ...base, userId: "u2" });
  let calls = 0;
  const counting: TextModel = {
    provider: "test",
    model: "scripted",
    async complete(request: ModelRequest): Promise<ModelResult> {
      calls += 1;
      return (opts.model ?? createMockTasteModel()).complete(request);
    },
  };
  const writer: TasteWriter | null = opts.writer === "none" ? null : createTasteWriter({ model: counting, maxRetries: 0, sleep: async () => {} });
  const deps = (over: Partial<TasteDeps> = {}): TasteDeps => ({
    repo: mem.repo,
    writer,
    now,
    capacity: opts.budget ? { ...NO_LIMITS, dailyBudgetKrw: opts.budget, priceInputKrwPerMTok: 1000, priceOutputKrwPerMTok: 1000 } : undefined,
    loadInput: async () => opts.load ?? { ok: true, input: INPUT },
    ...over,
  });
  return { mem, repo: mem.repo as MiyuRepository, first: first.id, second: second.id, stranger: stranger.id, deps, calls: () => calls };
}

test("처음 요청: 글이 저장되고, 사용 기록에는 토큰 수만 남고, 글 · 이름이 어떤 기록에도 없다", async () => {
  const { mem, repo, first, deps } = await setup();
  const r = await requestTasteReport(deps(), { userId: "u1", assessmentId: first });
  assert.ok(r.ok && !r.alreadyHad);
  assert.equal(r.ok && r.report.sections.length, 4);
  const row = await repo.getTasteReport("u1");
  assert.equal(row?.status, "ready");
  assert.equal(row?.assessmentId, first);
  assert.equal(mem.aiUsage.length, 1);
  assert.equal(mem.aiUsage[0].reportId, null);
  assert.ok(!JSON.stringify([mem.aiUsage, mem.opsEvents]).includes(TASTE_SAMPLE.headline));
  const state = await tasteStateFor(repo, "u1", first);
  assert.ok(state.kind === "ready" && state.report.headline === TASTE_SAMPLE.headline);
});

test("두 번째 요청은 AI를 부르지 않고 저장된 글을 그대로 돌려준다(한 계정당 1번)", async () => {
  const { first, deps, calls } = await setup();
  const a = await requestTasteReport(deps(), { userId: "u1", assessmentId: first });
  const b = await requestTasteReport(deps(), { userId: "u1", assessmentId: first });
  assert.ok(a.ok && b.ok && b.alreadyHad);
  assert.equal(calls(), 1);
  assert.deepEqual(a.ok && b.ok && b.report, a.ok && a.report);
});

test("다른 결과에서 이미 받았다면 새 결과에서는 받을 수 없다(AI도 부르지 않는다)", async () => {
  const { repo, first, second, deps, calls } = await setup();
  assert.ok((await requestTasteReport(deps(), { userId: "u1", assessmentId: first })).ok);
  const r = await requestTasteReport(deps(), { userId: "u1", assessmentId: second });
  assert.deepEqual(r, { ok: false, reason: "used-elsewhere", message: TASTE_MESSAGES["used-elsewhere"] });
  assert.equal(calls(), 1);
  assert.equal((await tasteStateFor(repo, "u1", second)).kind, "used-elsewhere");
  assert.equal((await tasteStateFor(repo, "u1", first)).kind, "ready");
  // 다른 회원은 영향 없다
  assert.equal((await tasteStateFor(repo, "u2", first)).kind, "none");
});

test("남의 결과는 거절하고, AI가 연결돼 있지 않으면 닫혀 있다", async () => {
  const s = await setup();
  assert.deepEqual(await requestTasteReport(s.deps(), { userId: "u1", assessmentId: s.stranger }), { ok: false, reason: "not-found", message: TASTE_MESSAGES["not-found"] });
  assert.equal(s.calls(), 0);
  const closed = await setup({ writer: "none" });
  assert.deepEqual(await requestTasteReport(closed.deps(), { userId: "u1", assessmentId: closed.first }), { ok: false, reason: "closed", message: TASTE_MESSAGES.closed });
  assert.equal(await closed.repo.getTasteReport("u1"), null);
});

test("심층 리포트를 받은 결과는 맛보기 대신 안내만 하고 예약도 하지 않는다", async () => {
  const { repo, first, deps, calls } = await setup({ load: { ok: false, reason: "owned" } });
  assert.deepEqual(await requestTasteReport(deps(), { userId: "u1", assessmentId: first }), { ok: false, reason: "owned", message: TASTE_MESSAGES.owned });
  assert.equal(calls(), 0);
  assert.equal(await repo.getTasteReport("u1"), null);
});

test("글을 만들지 못하면(호출 실패) 예약을 풀어 받은 것으로 세지 않고, 다시 받을 수 있다", async () => {
  let fail = true;
  const flaky: TextModel = {
    provider: "test",
    model: "flaky",
    async complete(request) {
      if (fail) throw new ModelCallError("down", { retryable: true, code: "UNAVAILABLE" });
      return createMockTasteModel().complete(request);
    },
  };
  const { repo, first, deps } = await setup({ model: flaky });
  const r = await requestTasteReport(deps(), { userId: "u1", assessmentId: first });
  assert.deepEqual(r, { ok: false, reason: "failed", message: TASTE_MESSAGES.failed });
  assert.equal(await repo.getTasteReport("u1"), null);
  fail = false;
  assert.ok((await requestTasteReport(deps(), { userId: "u1", assessmentId: first })).ok);
});

test("검사를 통과하지 못한 글은 저장하지 않고(잘못된 글을 보이지 않는다) 풀어서 다시 받을 수 있다", async () => {
  const bad: TextModel = {
    provider: "test",
    model: "bad",
    async complete() {
      return { text: JSON.stringify({ headline: "짧음", sections: [] }), model: "bad", usage: { inputTokens: 100, outputTokens: 20 } };
    },
  };
  const { repo, mem, first, deps } = await setup({ model: bad });
  const r = await requestTasteReport(deps(), { userId: "u1", assessmentId: first });
  assert.ok(!r.ok && r.reason === "failed");
  assert.equal(await repo.getTasteReport("u1"), null);
  // 두 번 부른 비용(처음 + 고쳐 쓰기)은 사용 기록에 남는다
  assert.equal(mem.aiUsage.length, 2);
  assert.ok(mem.aiUsage.every((u) => u.outcome === "invalid"));
});

test("같은 요청이 동시에 와도(두 번 누름) AI는 한 번만 부르고 한 줄만 저장한다", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const slow: TextModel = {
    provider: "test",
    model: "slow",
    async complete(request) {
      await gate;
      return createMockTasteModel().complete(request);
    },
  };
  const { repo, first, deps, calls } = await setup({ model: slow });
  const a = requestTasteReport(deps(), { userId: "u1", assessmentId: first });
  const b = requestTasteReport(deps(), { userId: "u1", assessmentId: first });
  // 둘째는 첫째가 예약한 자리를 보고 쓰는 중이라고 답한다
  const second = await b;
  assert.deepEqual(second, { ok: false, reason: "busy", message: TASTE_MESSAGES.busy });
  assert.equal((await tasteStateFor(repo, "u1", first)).kind, "pending");
  release();
  assert.ok((await a).ok);
  assert.equal(calls(), 1);
  assert.equal((await tasteStateFor(repo, "u1", first)).kind, "ready");
});

test("서버가 죽어 남은 예약은 5분이 지나면 이어받는다(영원히 잠기지 않는다)", async () => {
  let t = new Date("2026-10-16T03:00:00Z").getTime();
  const { repo, first, deps } = await setup({ now: () => new Date(t) });
  // 예약만 하고 끝나지 않은 요청
  assert.deepEqual(await repo.reserveTasteReport({ userId: "u1", assessmentId: first }), { state: "reserved" });
  assert.deepEqual(await requestTasteReport(deps(), { userId: "u1", assessmentId: first }), { ok: false, reason: "busy", message: TASTE_MESSAGES.busy });
  t += 5 * 60_000 + 1000;
  assert.ok((await requestTasteReport(deps(), { userId: "u1", assessmentId: first })).ok);
});

test("하루 AI 예산에 닿으면 새 맛보기만 멈춘다(예약도 하지 않는다)", async () => {
  const { repo, first, deps, calls } = await setup({ budget: 10 });
  await repo.addAiUsage({ reportId: null, provider: "test", model: "m", promptVersion: "p", inputTokens: 1, outputTokens: 1, estCostKrw: 10, latencyMs: 1, outcome: "ok", errorCode: null });
  assert.deepEqual(await requestTasteReport(deps(), { userId: "u1", assessmentId: first }), { ok: false, reason: "budget", message: TASTE_MESSAGES.budget });
  assert.equal(calls(), 0);
  assert.equal(await repo.getTasteReport("u1"), null);
});

test("DB 변경 17번 전(표 없음)에는 닫혀 있고 결과 화면은 깨지지 않는다", async () => {
  const { repo, first, deps, calls } = await setup();
  const missing = Object.assign(new Error("relation does not exist (DB 변경 17번 필요)"), { code: "42P01" });
  const noTable = new Proxy(repo, {
    get(target, prop, receiver) {
      if (prop === "getTasteReport" || prop === "reserveTasteReport") return async () => Promise.reject(missing);
      return Reflect.get(target, prop, receiver);
    },
  }) as MiyuRepository;
  assert.deepEqual(await requestTasteReport(deps({ repo: noTable }), { userId: "u1", assessmentId: first }), { ok: false, reason: "not-ready", message: TASTE_MESSAGES["not-ready"] });
  assert.deepEqual(await tasteStateFor(noTable, "u1", first), { kind: "unavailable" });
  assert.equal(calls(), 0);
});
