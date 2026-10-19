// 실제 AI 시험이 "정확히 한 번"만 요청을 보내는지 — 내 컴퓨터(127.0.0.1)의 가짜 서버로 센다. 바깥 네트워크로는 아무것도 보내지 않는다.
// 운영자 지시(2026-10-19): 제공사 SDK의 자동 재시도까지 포함해 실제 네트워크 요청이 1회만 나가야 한다. 이 프로젝트는 제공사 SDK 없이 기본 fetch만 쓰고(providers.ts),
// 실행기(scripts/run-own-story.ts)는 maxRetries 0으로 부른다 — 오류 · 과부하 · 연결 끊김 · 시간 초과에서도 서버가 받은 요청이 1개뿐인지 확인한다.
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import test from "node:test";
import { createModelCaller } from "../../report/ai/model-caller.ts";
import { createAnthropicModel } from "./providers.ts";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

async function withServer(handler: Handler, run: (baseUrl: string, hits: () => number) => Promise<void>) {
  let hits = 0;
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    hits++;
    req.resume();
    req.on("end", () => handler(req, res));
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, () => hits);
  } finally {
    for (const s of sockets) s.destroy();
    await new Promise<void>((r) => server.close(() => r()));
  }
}

/** 실행기와 같은 설정(maxRetries 0)으로 한 번 부른다 */
async function callOnce(baseUrl: string, callTimeoutMs = 5000) {
  const model = createAnthropicModel({ apiKey: "test-key-not-real", model: "claude-sonnet-5-5", baseUrl });
  const caller = createModelCaller({ model, maxRetries: 0, callTimeoutMs, sleep: async () => {} });
  return caller.call([{ role: "user", content: "x" }], {}, { system: "s", promptVersion: "p" });
}

test("한 번만 요청한다: 정상 응답 1개 → 서버가 받은 요청 1개", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ content: [{ type: "text", text: "{}" }], model: "claude-sonnet-5-5", usage: { input_tokens: 1, output_tokens: 1 } }));
    },
    async (url, hits) => {
      const r = await callOnce(url);
      assert.equal(r.result.text, "{}");
      assert.equal(hits(), 1);
    },
  );
});

test("한 번만 요청한다: 과부하(529) · 속도 제한(429) · 서버 오류(500)에도 다시 보내지 않는다", async () => {
  for (const status of [529, 429, 500]) {
    await withServer(
      (_req, res) => {
        res.writeHead(status);
        res.end();
      },
      async (url, hits) => {
        await assert.rejects(callOnce(url), (e: Error) => /Anthropic/.test(e.message));
        assert.equal(hits(), 1, `HTTP ${status}`);
      },
    );
  }
});

test("한 번만 요청한다: 요청을 받은 서버가 연결을 끊어도 다시 보내지 않는다", async () => {
  await withServer(
    (req) => req.socket.destroy(),
    async (url, hits) => {
      await assert.rejects(callOnce(url));
      assert.equal(hits(), 1);
    },
  );
});

test("한 번만 요청한다: 응답이 오지 않아 시간 초과로 중단해도 다시 보내지 않는다(결과 불명 — 제공사에서는 청구됐을 수 있다)", async () => {
  await withServer(
    () => undefined, // 응답하지 않는다
    async (url, hits) => {
      await assert.rejects(callOnce(url, 300), (e: Error & { code?: string }) => e.code === "TIMEOUT");
      await new Promise((r) => setTimeout(r, 400)); // 늦게 다시 보내는 재시도가 있는지 잠깐 더 본다
      assert.equal(hits(), 1);
    },
  );
});
