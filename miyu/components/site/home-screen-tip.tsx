"use client";

import { useSyncExternalStore } from "react";
import { detectHomeScreenEnv, homeScreenGuide, type HomeScreenEnv } from "@/lib/pwa/home-screen";

// 푸터의 접힌 안내 한 곳 — "홈 화면에 추가하면 앱처럼 열려요".
// 강제 팝업 · 설치 가로채기(beforeinstallprompt) · 자동 설치를 하지 않는다. 이미 홈 화면에서 연 화면(standalone)이면 아무것도 그리지 않는다.
// 서버에서는 그리지 않고(브라우저를 알 수 없다) 화면이 열린 뒤에만 환경에 맞는 안내를 보인다.

const DISPLAY_MODES = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"];

function isInstalled(): boolean {
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true; // iOS Safari의 홈 화면 앱
  return DISPLAY_MODES.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches);
}

/** 화면이 열린 뒤의 값: "<환경>|<설치됨 여부>" — 문자열이라 같은 값이면 다시 그리지 않는다 */
function snapshot(): string {
  const env = detectHomeScreenEnv({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints });
  return `${env}|${isInstalled() ? "installed" : "browser"}`;
}

function subscribe(onChange: () => void): () => void {
  const queries = DISPLAY_MODES.map((mode) => window.matchMedia(`(display-mode: ${mode})`));
  for (const q of queries) q.addEventListener("change", onChange);
  window.addEventListener("appinstalled", onChange);
  return () => {
    for (const q of queries) q.removeEventListener("change", onChange);
    window.removeEventListener("appinstalled", onChange);
  };
}

export function HomeScreenTip() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "other|browser");
  const [env, mode] = value.split("|") as [HomeScreenEnv, string];
  const guide = homeScreenGuide(env, mode === "installed");
  if (!guide) return null;
  return (
    <details data-site-chrome="" data-home-screen-tip={env} className="group pt-1 text-[13px] leading-relaxed text-ink-3">
      <summary className="inline-flex min-h-11 cursor-pointer items-center underline underline-offset-4 hover:text-ink">홈 화면에 추가해서 앱처럼 열기</summary>
      <div className="mt-1 space-y-2 rounded-lg bg-canvas px-4 py-3 shadow-soft">
        <p className="font-semibold text-ink-2">{guide.title}</p>
        <ol className="list-decimal space-y-1 pl-5">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {guide.note && <p className="text-[12px]">{guide.note}</p>}
      </div>
    </details>
  );
}
