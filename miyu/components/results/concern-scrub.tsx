"use client";

import { useState } from "react";
import { scrubConcernRecordAction } from "@/app/results/[id]/context/actions";
import { buttonSecondary } from "@/components/ui/styles";

const dangerButton =
  "inline-flex h-12 items-center justify-center rounded-lg border border-danger bg-canvas px-6 text-[16px] font-semibold text-danger hover:bg-mist";

/** 그때 적은 고민 내용 지우기 — 글만 지우고 리포트 · 기록 자리 · 주제 · 작성 시점은 남는다 */
export function ConcernScrub({ assessmentId, recordId }: { assessmentId: string; recordId: string }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div>
      <p className="text-[14px] leading-relaxed text-ink-2">그때 적은 고민 내용을 지울 수 있어요. 지워도 이 리포트와 주제 · 작성 시점은 남아요. 리포트에는 알려 주신 내용을 받아 쓴 문장이 있을 수 있고 그 문장은 리포트와 함께 보관돼요. 지운 내용은 되돌릴 수 없어요.</p>
      {confirm ? (
        <form action={scrubConcernRecordAction.bind(null, assessmentId, recordId)} className="mt-3 flex flex-wrap gap-2">
          <button type="submit" className={dangerButton}>
            지우기 확정
          </button>
          <button type="button" onClick={() => setConfirm(false)} className={buttonSecondary}>
            취소
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} className={`${buttonSecondary} mt-3`}>
          그때 적은 고민 지우기
        </button>
      )}
    </div>
  );
}
