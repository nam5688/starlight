"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * 모달이 열려 있는 동안 뒤쪽 화면이 스크롤되지 않게 막는다.
 *
 * 본문을 `position: fixed`로 고정해 스크롤 위치를 위로 밀어 두던 예전 방식은 쓰지 않는다 — 실기기(iPhone 앱 안 브라우저)에서
 * 확인창이 뜨지 않고 어두운 배경만 남는다는 보고(2026-10-19)가 있었고, 본문을 고정하면 스크롤 위치가 바뀌어 맨 위 기준으로 놓이는 확인창이 어긋날 수 있다.
 * 지금은 문서의 스크롤만 막고(`overflow: hidden`) 스크롤 위치는 건드리지 않는다. 그래서 닫을 때 되돌릴 위치도 없다.
 *  - 데스크톱은 세로 스크롤바가 사라져 화면이 옆으로 밀리므로 그 폭만큼 오른쪽을 채운다(휴대폰은 0).
 *  - `overflow: hidden`을 무시하는 오래된 iOS를 위해, 모달 안에서 스크롤할 수 있는 칸(`[data-scroll-ok]`)이 아닌 곳의 손가락 이동은 막는다.
 * 화면에서 사라질 때(언마운트)도 풀어서, 열린 채로 다른 화면이 되어도 스크롤이 막힌 채 남지 않는다.
 */
export function useBodyScrollLock() {
  const undoRef = useRef<(() => void) | null>(null);

  const release = useCallback(() => {
    const undo = undoRef.current;
    undoRef.current = null;
    undo?.();
  }, []);

  const lock = useCallback(() => {
    if (undoRef.current) return;
    const html = document.documentElement;
    const body = document.body;
    const scrollbar = Math.max(0, window.innerWidth - html.clientWidth);
    const saved = { html: html.style.overflow, body: body.style.overflow, paddingRight: body.style.paddingRight };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    const onTouchMove = (e: TouchEvent) => {
      const scroller = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-scroll-ok]") : null;
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) return;
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    undoRef.current = () => {
      document.removeEventListener("touchmove", onTouchMove);
      html.style.overflow = saved.html;
      body.style.overflow = saved.body;
      body.style.paddingRight = saved.paddingRight;
    };
  }, []);

  useLayoutEffect(() => () => release(), [release]);

  return { lock, release };
}
