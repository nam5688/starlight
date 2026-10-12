"use server";

import { cookies, headers } from "next/headers";
import { FUNNEL_EVENT_NAMES, type FunnelEventName } from "@/lib/services/ports";
import { ANON_COOKIE, cleanTag, FIRST_TOUCH_COOKIE, readFirstTouch } from "@/server/acquisition";
import { siteUrl } from "@/server/env";
import { now, writeRepository } from "@/server/services";

// 방문 단계 기록. 익명 방문 번호(쿠키) · 화면 경로 · 유입 출처만 남기고, 이름 · 생년월일 · 응답 · 고민 · 리포트 내용은 받지도 남기지도 않는다.
// 결제 · 구매 권한의 기준이 아니다 (서버가 승인을 확인한 orders가 기준). 실패해도 화면에는 영향이 없다.

const recent = new Map<string, number[]>();
const LIMIT_PER_MINUTE = 30;

const BOT = /bot|crawl|spider|preview|slurp|facebookexternalhit/i;

export type TrackInput = { name: string; path?: string; src?: string; medium?: string; campaign?: string; referrer?: string };

export async function trackEventAction(input: TrackInput): Promise<void> {
  try {
    if (!(FUNNEL_EVENT_NAMES as readonly string[]).includes(input?.name)) return;
    const h = await headers();
    // 추적 거부 신호(Do Not Track · Global Privacy Control)가 있으면 기록하지 않는다
    if (h.get("dnt") === "1" || h.get("sec-gpc") === "1") return;
    if (BOT.test(h.get("user-agent") ?? "")) return;

    const jar = await cookies();
    let anonId = jar.get(ANON_COOKIE)?.value ?? "";
    if (!/^[0-9a-f-]{36}$/.test(anonId)) {
      anonId = crypto.randomUUID();
      jar.set(ANON_COOKIE, anonId, { httpOnly: true, sameSite: "lax", secure: siteUrl().startsWith("https"), path: "/", maxAge: 365 * 24 * 3600 });
    }

    // 1분에 30건까지 (같은 방문 번호) — 반복 호출로 기록이 쌓이는 것을 막는다
    const t = now().getTime();
    const list = (recent.get(anonId) ?? []).filter((x) => t - x < 60_000);
    if (list.length >= LIMIT_PER_MINUTE) return;
    list.push(t);
    recent.set(anonId, list);
    if (recent.size > 2000) recent.clear();

    // 첫 방문 출처: 이미 있으면 그대로 쓰고, 없으면 이번 값으로 정한다 (UTM이 있거나 외부에서 들어온 경우만)
    let ft = await readFirstTouch();
    if (!ft) {
      const own = new URL(siteUrl()).host;
      let referrerHost: string | null = null;
      try {
        const host = input.referrer ? new URL(input.referrer).host : "";
        referrerHost = host && host !== own && host !== h.get("host") ? cleanTag(host, 120) : null;
      } catch {
        referrerHost = null;
      }
      const s = cleanTag(input.src, 60);
      const m = cleanTag(input.medium, 60);
      const c = cleanTag(input.campaign, 80);
      if (s || m || c || referrerHost) {
        ft = { s, m, c, r: referrerHost };
        jar.set(FIRST_TOUCH_COOKIE, JSON.stringify(ft), { httpOnly: true, sameSite: "lax", secure: siteUrl().startsWith("https"), path: "/", maxAge: 90 * 24 * 3600 });
      }
    }

    const path = typeof input.path === "string" && input.path.startsWith("/") ? input.path.split(/[?#]/)[0].slice(0, 120) : null;
    await writeRepository().addFunnelEvent({
      anonId,
      name: input.name as FunnelEventName,
      path,
      src: ft?.s ?? null,
      medium: ft?.m ?? null,
      campaign: ft?.c ?? null,
      referrerHost: ft?.r ?? null,
    });
  } catch {
    // 기록 실패는 화면에 영향을 주지 않는다
  }
}
