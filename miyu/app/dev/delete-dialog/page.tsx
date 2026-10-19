import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeleteRecordButton } from "@/components/my/delete-record-button";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow } from "@/components/ui/styles";

export const metadata: Metadata = { title: "기록 삭제 확인창 미리보기 · ME:U 미유", robots: { index: false } };

/**
 * 개발용 — 내 컴퓨터에서만 열린다(공개 배포에서는 열리지 않는다). 기록 삭제 확인창을 두 삭제 범위(예전 28번 · 확대 29번)로 열어 보는 화면.
 * 가상 값이고, 여기서 "삭제하기"를 눌러도 로그인한 본인의 기록이 아니므로 아무것도 지워지지 않는다(서버가 소유자를 다시 확인한다).
 */
export default function DevDeleteDialogPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className={`${pageNarrow} py-10 md:py-14`}>
      <StatusBadge>개발용 · 내 컴퓨터에서만 열림</StatusBadge>
      <h1 className="mt-3 text-[24px] leading-snug font-bold tracking-tight">기록 삭제 확인창 미리보기</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">가상 기록이에요. 실제 삭제는 일어나지 않아요.</p>
      {(["all", "legacy"] as const).map((scope) => (
        <section key={scope} className="mt-8 rounded-2xl bg-canvas p-4 shadow-soft" data-testid={`card-${scope}`}>
          <h2 className="text-[16px] font-bold">{scope === "all" ? "삭제 범위 확대(29번)" : "예전 범위(28번)"}</h2>
          <p className="mt-1 text-[14px] text-ink-3">심층 리포트 · 가상 님 · 1995년 4월 12일 (양력)</p>
          <div className="mt-2">
            <DeleteRecordButton assessmentId="00000000-0000-4000-8000-000000000000" productName="심층 리포트" subject="가상 님 · 1995년 4월 12일 (양력)" created="2026. 10. 19." scope={scope} />
          </div>
        </section>
      ))}
    </main>
  );
}
