"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * 모달이 열려 있는 동안 뒤쪽 화면이 스크롤되지 않게 막는다.
 * iOS 사파리 · 카카오톡 같은 앱 안 브라우저는 모달 바깥(어두운 배경)을 문질러도 뒤쪽 화면이 움직이므로
 * `overflow: hidden`만으로는 막히지 않아 본문을 `position: fixed`로 고정하고 지금 스크롤 위치만큼 위로 밀어 둔다.
 *
 * `lock()`은 풀 때 쓸 함수를 돌려주지 않고 훅이 들고 있다가 `release(restore)`로 푼다.
 *  - `release(true)`: 닫기 · 취소 — 열기 전 스크롤 위치로 되돌린다.
 *  - `release(false)`: 일을 마치고 다른 화면으로 가는 경우 — 위치는 건드리지 않는다(이동한 화면이 정한 위치를 따른다).
 * 화면에서 사라질 때(언마운트)도 위치 복원 없이 풀어서, 열린 채로 다른 화면이 되어도 본문이 고정된 채 남지 않는다.
 */
export function useBodyScrollLock() {
  const undoRef = useRef<((restore: boolean) => void) | null>(null);

  const release = useCallback((restore: boolean) => {
    const undo = undoRef.current;
    undoRef.current = null;
    undo?.(restore);
  }, []);

  const lock = useCallback(() => {
    if (undoRef.current) return;
    const body = document.body;
    const y = window.scrollY;
    // 데스크톱은 본문을 고정하면 세로 스크롤바가 사라져 화면이 옆으로 밀리므로 그 폭만큼 채운다(휴대폰은 0)
    const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    const saved = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    };
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    undoRef.current = (restore) => {
      body.style.position = saved.position;
      body.style.top = saved.top;
      body.style.left = saved.left;
      body.style.right = saved.right;
      body.style.width = saved.width;
      body.style.paddingRight = saved.paddingRight;
      if (restore) window.scrollTo(0, y);
    };
  }, []);

  useLayoutEffect(() => () => release(false), [release]);

  return { lock, release };
}
