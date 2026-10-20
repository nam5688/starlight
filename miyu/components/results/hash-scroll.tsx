"use client";

import { useEffect } from "react";

/**
 * 다른 화면에서 #주소로 들어왔을 때 그 자리까지 내려가게 한다 — 예: 상담방 안내에서 /results/<번호>#r-purchase로 오면 모바일에서 구매 영역까지 내려가지 못하고 결과 화면 맨 위에 멈추던 문제.
 * 결과 화면은 일부가 늦게 그려질 수 있어 대상이 나타날 때까지 잠깐 기다렸다가(최대 약 3초) 한 번만 이동한다. 사용자가 그 사이에 직접 스크롤하면 끼어들지 않는다.
 */
export function HashScroll() {
  useEffect(() => {
    let tries = 0;
    let done = false;
    let userMoved = false;
    const stop = () => {
      userMoved = true;
    };
    const go = () => {
      const raw = window.location.hash.slice(1);
      if (!raw || done || userMoved) return;
      let id = raw;
      try {
        id = decodeURIComponent(raw);
      } catch {
        // 잘못된 모양의 주소는 그대로 쓴다
      }
      const el = document.getElementById(id);
      if (el) {
        done = true;
        el.scrollIntoView({ block: "start" });
        return;
      }
      if (++tries < 20) timer = window.setTimeout(go, 150);
    };
    let timer = window.setTimeout(go, 120);
    const onHash = () => {
      done = false;
      userMoved = false;
      tries = 0;
      window.clearTimeout(timer);
      timer = window.setTimeout(go, 0);
    };
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("hashchange", onHash);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);
  return null;
}
