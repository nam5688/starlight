// 텔레그램 운영 알림 (서버 전용 — 봇 토큰 사용). 키가 설정된 경우에만 서버에서 만든다.
// 보내는 글에는 주문번호 · 오류 식별번호 · 종류만 담기며(lib/ops/alerts.ts), 실패해도 던지지 않는다.

import type { Notifier } from "../../ops/alerts.ts";

export function createTelegramNotifier(opts: { botToken: string; chatId: string; fetch?: typeof fetch; timeoutMs?: number }): Notifier {
  const doFetch = opts.fetch ?? fetch;
  return {
    async send(text) {
      try {
        const res = await doFetch(`https://api.telegram.org/bot${opts.botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: opts.chatId, text, disable_web_page_preview: true }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
          cache: "no-store",
        });
        return res.ok;
      } catch {
        return false;
      }
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
