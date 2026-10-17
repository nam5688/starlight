import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MyPreview } from "@/components/dev/my-preview";
import { StatusBadge } from "@/components/ui/source-badge";

export const metadata: Metadata = { title: "MY 혜택 화면 미리보기 · ME:U 미유", robots: { index: false } };

/** 개발용 — 내 컴퓨터에서만 열린다(공개 배포에서는 열리지 않는다). MY 허브 첫 부분과 /my/benefits의 상태별 화면을 가상 값으로 확인한다. 아무것도 저장하지 않는다 */
export default function DevMyPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="bg-page">
      <div className="mx-auto w-full max-w-[720px] px-5 py-10 md:py-14">
        <StatusBadge>개발용 · 내 컴퓨터에서만 열림</StatusBadge>
        <h1 className="mt-3 text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">MY 혜택 화면 미리보기</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          <b>화면 디자인용 가상 값 · 실제 값이 아닙니다.</b> 포인트 · 질문권 · 초대 현황 · 쿠폰 내역은 모양을 보기 위해 정한 숫자이고, 이 화면의 버튼은 아무것도 저장하거나 바꾸지 않습니다. 실제 화면은 <code>/my</code> · <code>/my/benefits</code>이며 로그인한 본인의 값만 서버에서 읽어 보여 줍니다.
        </p>
        <MyPreview />
      </div>
    </main>
  );
}
