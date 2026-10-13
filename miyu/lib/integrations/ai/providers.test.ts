// 실행: npm test — 실제 AI 제공사 연결 코드가 요청을 올바른 모양으로 만들고, 응답 · 오류를 안전하게 읽는지 가짜 fetch로 확인한다.
// 실제 네트워크 호출은 하지 않는다. 키 값은 시험용 가짜 문자열이다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BudgetExceededError, BudgetGuard, DEFAULT_FX_KRW_PER_USD, DEFAULT_SURCHARGE, withBudget } from "../../report/ai/budget.ts";
import { ModelCallError } from "../../report/ai/model.ts";
import { createAnthropicModel, createOpenAiModel, providerError } from "./providers.ts";

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
function fakeFetch(reply: { status?: number; json?: unknown; throws?: Error }) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    if (reply.throws) throw reply.throws;
    const status = reply.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => reply.json };
  };
  return { fetch, calls };
}
const REQ = { system: "시스템 지시문", messages: [{ role: "user" as const, content: "사용자 자료" }, { role: "assistant" as const, content: "앞선 답" }, { role: "user" as const, content: "고쳐 주세요" }], maxOutputTokens: 16000 };
const KEY = "test-key-NOT-REAL";

test("Anthropic: Messages API 요청(머리글 · 적응형 생각 · 강도 중간 · 최대 출력)을 만들고, 글 블록만 모아 사용량과 함께 돌려준다", async () => {
  const f = fakeFetch({ json: { model: "claude-sonnet-5-5", content: [{ type: "thinking", thinking: "비공개 생각" }, { type: "text", text: '{"a":' }, { type: "text", text: "1}" }], usage: { input_tokens: 12000, output_tokens: 9000 }, stop_reason: "end_turn" } });
  const m = createAnthropicModel({ apiKey: KEY, model: "claude-sonnet-5-5", fetch: f.fetch as never });
  assert.equal(m.provider, "anthropic");
  const r = await m.complete(REQ);
  assert.deepEqual(r, { text: '{"a":1}', model: "claude-sonnet-5-5", usage: { inputTokens: 12000, outputTokens: 9000 } });
  const c = f.calls[0];
  assert.equal(c.url, "https://api.anthropic.com/v1/messages");
  assert.equal(c.headers["x-api-key"], KEY);
  assert.equal(c.headers["anthropic-version"], "2023-06-01");
  assert.equal(c.body.model, "claude-sonnet-5-5");
  assert.equal(c.body.max_tokens, 16000);
  assert.equal(c.body.system, "시스템 지시문");
  assert.deepEqual(c.body.messages, REQ.messages);
  assert.deepEqual(c.body.thinking, { type: "adaptive" });
  assert.deepEqual(c.body.output_config, { effort: "medium" });
  assert.ok(!("temperature" in c.body) && !("budget_tokens" in (c.body.thinking as object)), "새 모델이 거절할 수 있는 값은 보내지 않는다");
});

test("OpenAI: Responses API 요청(Bearer · instructions · input · 최대 출력 · 추론 강도 중간 · 저장 안 함)을 만들고, output_text만 모은다", async () => {
  const f = fakeFetch({
    json: { model: "gpt-6.1-sol", output: [{ type: "reasoning", summary: [] }, { type: "message", status: "completed", content: [{ type: "output_text", text: '{"b":' }, { type: "output_text", text: "2}" }] }], usage: { input_tokens: 11000, output_tokens: 8000 } },
  });
  const m = createOpenAiModel({ apiKey: KEY, model: "gpt-6.1-sol", fetch: f.fetch as never });
  assert.equal(m.provider, "openai");
  const r = await m.complete(REQ);
  assert.deepEqual(r, { text: '{"b":2}', model: "gpt-6.1-sol", usage: { inputTokens: 11000, outputTokens: 8000 } });
  const c = f.calls[0];
  assert.equal(c.url, "https://api.openai.com/v1/responses");
  assert.equal(c.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(c.body.instructions, "시스템 지시문");
  assert.deepEqual(c.body.input, REQ.messages);
  assert.equal(c.body.max_output_tokens, 16000);
  assert.deepEqual(c.body.reasoning, { effort: "medium" });
  assert.equal(c.body.store, false);
});

test("두 후보는 같은 강도 설정을 받는다 (한쪽에 유리하지 않게) — 기본은 둘 다 중간", async () => {
  const a = fakeFetch({ json: { content: [], usage: {} } });
  const o = fakeFetch({ json: { output: [], usage: {} } });
  await createAnthropicModel({ apiKey: KEY, model: "m", effort: "low", fetch: a.fetch as never }).complete(REQ);
  await createOpenAiModel({ apiKey: KEY, model: "m", effort: "low", fetch: o.fetch as never }).complete(REQ);
  assert.equal((a.calls[0].body.output_config as { effort: string }).effort, "low");
  assert.equal((o.calls[0].body.reasoning as { effort: string }).effort, "low");
});

test("사용량을 읽지 못하면 usage가 없다 — 예산 관리기가 최악 비용으로 센다", async () => {
  const f = fakeFetch({ json: { output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }] } });
  const r = await createOpenAiModel({ apiKey: KEY, model: "m", fetch: f.fetch as never }).complete(REQ);
  assert.equal(r.usage, undefined);
  const guard = new BudgetGuard({ capKrw: 3000, fxKrwPerUsd: DEFAULT_FX_KRW_PER_USD, surcharge: DEFAULT_SURCHARGE });
  const wrapped = withBudget(createOpenAiModel({ apiKey: KEY, model: "m", fetch: f.fetch as never }), guard, { inputUsdPerMTok: 2, outputUsdPerMTok: 10 });
  await wrapped.complete(REQ);
  assert.ok(guard.spentKrw > 0, "사용량을 모르면 최악 비용을 쓴 것으로 센다");
});

test("오류 응답: 속도 제한은 재시도 · 청구 없음, 인증 · 요청 오류는 재시도 없음 · 청구 없음, 서버 오류는 재시도하되 청구 없음으로 보증하지 않는다", () => {
  const rate = providerError("X", 429);
  assert.deepEqual([rate.retryable, rate.code], [true, "RATE_LIMITED"]);
  for (const s of [401, 403]) assert.deepEqual([providerError("X", s).retryable, providerError("X", s).code], [false, "AUTH"]);
  for (const s of [400, 404, 413, 422]) assert.deepEqual([providerError("X", s).retryable, providerError("X", s).code], [false, "INVALID_REQUEST"]);
  for (const s of [500, 502, 503, 529]) {
    const e = providerError("X", s);
    assert.equal(e.retryable, true);
    assert.equal(e.code, `HTTP_${s}`);
  }
});

test("오류 문구에 키 · 요청 본문 · 응답 본문이 들어가지 않는다", async () => {
  for (const make of [
    (fetch: never) => createAnthropicModel({ apiKey: KEY, model: "m", fetch }),
    (fetch: never) => createOpenAiModel({ apiKey: KEY, model: "m", fetch }),
  ]) {
    for (const status of [401, 429, 500]) {
      const f = fakeFetch({ status, json: { error: { message: `echo ${KEY} 사용자 자료` } } });
      await assert.rejects(make(f.fetch as never).complete(REQ), (e: unknown) => {
        assert.ok(e instanceof ModelCallError);
        assert.doesNotMatch(e.message, new RegExp(KEY));
        assert.doesNotMatch(e.message, /사용자 자료|시스템 지시문/);
        return true;
      });
    }
    const net = fakeFetch({ throws: new Error(`connect failed with ${KEY}`) });
    await assert.rejects(make(net.fetch as never).complete(REQ), (e: unknown) => e instanceof ModelCallError && e.code === "NETWORK_ERROR" && !e.message.includes(KEY));
  }
});

test("모양이 다른 응답은 재시도 없이 오류(INVALID_RESPONSE)로 멈춘다 — 같은 비용을 두 번 쓰지 않는다", async () => {
  for (const [make, json] of [
    [createAnthropicModel, { content: "문자열" }],
    [createOpenAiModel, { output: "문자열" }],
  ] as const) {
    const f = fakeFetch({ json });
    await assert.rejects(make({ apiKey: KEY, model: "m", fetch: f.fetch as never }).complete(REQ), (e: unknown) => e instanceof ModelCallError && e.code === "INVALID_RESPONSE" && !e.retryable);
  }
  const broken = { fetch: async () => ({ ok: true, status: 200, json: async () => Promise.reject(new Error("bad json")) }) };
  await assert.rejects(createOpenAiModel({ apiKey: KEY, model: "m", fetch: broken.fetch as never }).complete(REQ), (e: unknown) => e instanceof ModelCallError && e.code === "INVALID_RESPONSE");
});

test("시간 제한 · 중단 신호로 끊긴 요청은 그대로 넘겨 호출한 쪽이 시간 초과로 구분한다", async () => {
  const ctl = new AbortController();
  ctl.abort();
  const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
  const f = fakeFetch({ throws: abortErr });
  await assert.rejects(createAnthropicModel({ apiKey: KEY, model: "m", fetch: f.fetch as never }).complete({ ...REQ, signal: ctl.signal }), (e: unknown) => e === abortErr);
});

test("예산 관리기 안에서: 한도가 모자라면 제공사에 요청을 보내지 않는다 (승인한 금액을 넘기지 않는다)", async () => {
  const f = fakeFetch({ json: { content: [{ type: "text", text: "{}" }], usage: { input_tokens: 1, output_tokens: 1 } } });
  const guard = new BudgetGuard({ capKrw: 10, fxKrwPerUsd: DEFAULT_FX_KRW_PER_USD, surcharge: DEFAULT_SURCHARGE });
  const wrapped = withBudget(createAnthropicModel({ apiKey: KEY, model: "m", fetch: f.fetch as never }), guard, { inputUsdPerMTok: 2, outputUsdPerMTok: 10 });
  await assert.rejects(wrapped.complete(REQ), BudgetExceededError);
  assert.equal(f.calls.length, 0, "요청 자체를 보내지 않았다");
});
