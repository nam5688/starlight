"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { trackEventAction } from "@/app/track/actions";
import type { FunnelEventName } from "@/lib/services/ports";

/** 같은 단계를 중복해서 보내지 않는다. 추적 거부 신호가 있으면 보내지 않는다 */
export function trackOnce(name: FunnelEventName): void {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl === true) return;
    // 방문은 탭마다 한 번(처음 들어온 화면), 결과 · 리포트 조회는 화면(주소)마다 한 번
    const key = name === "visit" ? "meu-evt:visit" : `meu-evt:${name}:${location.pathname}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const q = new URLSearchParams(location.search);
    // 주소의 UTM 값과 이전 사이트의 도메인만 보낸다 (다른 쿼리 · 입력값은 보내지 않는다)
    void trackEventAction({
      name,
      path: location.pathname,
      src: q.get("utm_source") ?? undefined,
      medium: q.get("utm_medium") ?? undefined,
      campaign: q.get("utm_campaign") ?? undefined,
      referrer: document.referrer || undefined,
    }).catch(() => {});
  } catch {
    // 저장소 · 네트워크를 쓸 수 없어도 화면에는 영향이 없다
  }
}

/** 화면이 열릴 때 단계 하나를 기록한다 */
export function Track({ name }: { name: FunnelEventName }) {
  useEffect(() => trackOnce(name), [name]);
  return null;
}

const PUBLIC_PATHS = new Set(["/", "/analyze", "/report/sample", "/terms", "/privacy"]);

/** 공개 안내 화면에 들어오면 방문으로 센다 (개인 결과 · 결제 · 관리자 화면은 세지 않는다) */
export function VisitTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (PUBLIC_PATHS.has(pathname)) trackOnce("visit");
  }, [pathname]);
  return null;
}
