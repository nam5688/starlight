"use client";

import { useEffect } from "react";
import { DRAFT_KEY } from "@/lib/profile/draft";

/** 결과가 서버에 저장되었으므로 이 탭에 임시 보관하던 입력을 지운다 */
export function ClearAnalyzeDraft() {
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // 무시
    }
  }, []);
  return null;
}
