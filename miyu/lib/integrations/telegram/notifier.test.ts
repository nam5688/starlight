// 실행: npm test — 텔레그램 알림 형식 (실제 텔레그램에 접속하지 않는다)
import assert from "node:assert/strict";
import { test } from "node:test";
import { combineNotifiers, createLogNotifier, createTelegramNotifier } from "./notifier.ts";

test("텔레그램: 메시지 형식, 시간 초과 · 오류 응답은 false, 봇 토큰은 주소에만 쓰이고 글에는 없다", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const ok = createTelegramNotifier({ botToken: "123456:SECRETTOKEN", chatId: "-100", fetch: (async (url: string, init: RequestInit) => (calls.push({ url, body: JSON.parse(String(init.body)) }), new Response("{}", { status: 200 }))) as unknown as typeof fetch });
  assert.equal(await ok.send("[미유 오류] 테스트\n주문번호 MEU-1"), true);
  assert.equal(calls[0].url, "https://api.telegram.org/bot123456:SECRETTOKEN/sendMessage");
  assert.equal(calls[0].body.chat_id, "-100");
  assert.doesNotMatch(String(calls[0].body.text), /SECRETTOKEN/);

  const bad = createTelegramNotifier({ botToken: "t", chatId: "c", fetch: (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch });
  assert.equal(await bad.send("x"), false);
  const down = createTelegramNotifier({ botToken: "t", chatId: "c", fetch: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch });
  assert.equal(await down.send("x"), false);

  const lines: string[] = [];
  const both = combineNotifiers(down, createLogNotifier((l) => lines.push(l)));
  assert.equal(await both.send("a\nb"), true);
  assert.deepEqual(lines, ["[alert] a | b"]);
});

test("텔레그램 연결 시험: 실패 이유를 구분하고(토큰 · 채팅 번호 · 차단 · 접속), 값은 결과에 담지 않는다", async () => {
  const reply = (status: number, description = "") => (async () => new Response(JSON.stringify({ ok: status === 200, description }), { status })) as unknown as typeof fetch;
  const make = (f: typeof fetch) => createTelegramNotifier({ botToken: "123456:SECRET-TOKEN", chatId: "99887766", fetch: f });
  assert.deepEqual(await make(reply(200)).check("x"), { ok: true });
  assert.deepEqual(await make(reply(401, "Unauthorized")).check("x"), { ok: false, reason: "bad_token", status: 401 });
  assert.deepEqual(await make(reply(404, "Not Found")).check("x"), { ok: false, reason: "bad_token", status: 404 });
  assert.deepEqual(await make(reply(400, "Bad Request: chat not found")).check("x"), { ok: false, reason: "chat_not_found", status: 400 });
  assert.deepEqual(await make(reply(403, "Forbidden: bot was blocked by the user")).check("x"), { ok: false, reason: "blocked", status: 403 });
  assert.deepEqual(await make(reply(429, "Too Many Requests")).check("x"), { ok: false, reason: "rate_limited", status: 429 });
  assert.deepEqual(await make((async () => { throw new Error("offline"); }) as unknown as typeof fetch).check("x"), { ok: false, reason: "network" });
  // 결과 어디에도 토큰 · 채팅 번호가 없다
  const failure = JSON.stringify(await make(reply(401, "Unauthorized")).check("x"));
  assert.doesNotMatch(failure, /SECRET-TOKEN|99887766/);
  // send()는 던지지 않고 성공 여부만 돌려준다
  assert.equal(await make(reply(401)).send("x"), false);
  assert.equal(await make(reply(200)).send("x"), true);
});
