import "server-only";
import { cookies } from "next/headers";
import type { Acquisition } from "@/lib/services/ports";

// 광고 · 채널 비교를 위한 익명 방문 번호와 첫 방문 출처 쿠키. 이름 · 생년월일 · 응답 등은 담지 않는다.
export const ANON_COOKIE = "meu_aid";
export const FIRST_TOUCH_COOKIE = "meu_ft";

export type FirstTouch = { s: string | null; m: string | null; c: string | null; r: string | null };

/** 짧은 영문 · 숫자 · 한글 · . _ - 만 남긴다 (길이 제한) */
export function cleanTag(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.toLowerCase().replace(/[^a-z0-9._\-가-힣]/g, "").slice(0, max);
  return v || null;
}

export async function readFirstTouch(): Promise<FirstTouch | null> {
  try {
    const raw = (await cookies()).get(FIRST_TOUCH_COOKIE)?.value;
    if (!raw) return null;
    const d = JSON.parse(raw) as Record<string, unknown>;
    return { s: cleanTag(d.s, 60), m: cleanTag(d.m, 60), c: cleanTag(d.c, 80), r: cleanTag(d.r, 120) };
  } catch {
    return null;
  }
}

/** 결제를 시작할 때 주문에 적어 둘 유입 출처 (없으면 null) */
export async function readAcquisition(): Promise<Acquisition | null> {
  const ft = await readFirstTouch();
  if (!ft) return null;
  const source = ft.s ?? (ft.r ? `${ft.r}` : null);
  return source || ft.m || ft.c ? { source, medium: ft.s ? ft.m : ft.r ? "referral" : null, campaign: ft.c } : null;
}
