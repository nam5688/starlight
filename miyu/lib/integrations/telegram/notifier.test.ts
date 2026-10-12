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
