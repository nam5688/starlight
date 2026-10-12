// 텔레그램 운영 알림 (서버 전용 — 봇 토큰 사용). 키가 설정된 경우에만 서버에서 만든다.
// 보내는 글에는 주문번호 · 오류 식별번호 · 종류만 담기며(lib/ops/alerts.ts), 실패해도 던지지 않는다.

import type { Notifier } from "../../ops/alerts.ts";

/** 텔레그램에 보낸 결과 — 실패 이유를 구분한다 (토큰 · 채팅 번호 같은 값은 담지 않는다) */
export type TelegramResult =
  | { ok: true }
  | {
      ok: false;
      /** bad_token: 봇 토큰이 맞지 않음 · chat_not_found: 채팅 번호가 맞지 않거나 봇에게 먼저 말을 걸지 않음 · blocked: 봇이 차단됨/채팅에서 쫓겨남 · rate_limited: 너무 자주 보냄 · network: 접속 실패 · other: 그 밖 */
      reason: "bad_token" | "chat_not_found" | "blocked" | "rate_limited" | "network" | "other";
      status?: number;
    };

export const TELEGRAM_REASON_HELP: Record<Extract<TelegramResult, { ok: false }>["reason"], string> = {
  bad_token: "봇 토큰이 맞지 않습니다. BotFather에서 받은 토큰을 다시 확인하세요.",
  chat_not_found: "채팅 번호가 맞지 않거나, 내 텔레그램에서 이 봇과 대화를 시작(Start)하지 않았습니다.",
  blocked: "봇이 차단되었거나 채팅에서 빠졌습니다. 봇 대화창에서 다시 Start를 누르세요.",
  rate_limited: "텔레그램이 너무 자주 보낸다고 잠시 막았습니다. 잠시 뒤 다시 시도하세요.",
  network: "텔레그램 서버에 접속하지 못했습니다. 인터넷 연결을 확인하세요.",
  other: "텔레그램이 메시지를 받지 않았습니다. 잠시 뒤 다시 시도하세요.",
};

export function createTelegramNotifier(opts: { botToken: string; chatId: string; fetch?: typeof fetch; timeoutMs?: number; apiBase?: string }): Notifier & {
  /** 보내고 결과(실패 이유 포함)를 돌려준다 — 연결 시험용 */
  check(text: string): Promise<TelegramResult>;
} {
  const doFetch = opts.fetch ?? fetch;
  async function check(text: string): Promise<TelegramResult> {
    try {
      const res = await doFetch(`${opts.apiBase ?? "https://api.telegram.org"}/bot${opts.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: opts.chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
        cache: "no-store",
      });
      if (res.ok) return { ok: true };
      let description = "";
      try {
        description = String(((await res.json()) as { description?: unknown }).description ?? "").toLowerCase();
      } catch {
        // 본문을 읽지 못해도 상태 코드로 판단한다
      }
      const status = res.status;
      if (status === 401 || status === 404) return { ok: false, reason: "bad_token", status };
      if (status === 429) return { ok: false, reason: "rate_limited", status };
      if (status === 403) return { ok: false, reason: "blocked", status };
      if (status === 400 && (description.includes("chat not found") || description.includes("chat_id"))) return { ok: false, reason: "chat_not_found", status };
      return { ok: false, reason: "other", status };
    } catch {
      return { ok: false, reason: "network" };
    }
  }
  return {
    check,
    async send(text) {
      return (await check(text)).ok;
    },
  };
}

/** 알림 보낼 곳이 없을 때(키 미설정)와 개발 환경: 서버 로그에만 남긴다 (이미 가려진 글) */
export function createLogNotifier(log: (line: string) => void = (l) => console.error(l)): Notifier {
  return {
    async send(text) {
      log(`[alert] ${text.replace(/\n/g, " | ")}`);
      return true;
    },
  };
}

/** 두 곳에 보낸다. 하나라도 보냈으면 true */
export function combineNotifiers(...list: Notifier[]): Notifier {
  return {
    async send(text) {
      const results = await Promise.all(list.map((n) => n.send(text).catch(() => false)));
      return results.some(Boolean);
    },
  };
}
