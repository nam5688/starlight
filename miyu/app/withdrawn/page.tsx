import type { Metadata } from "next";
import Link from "next/link";
import { buttonPrimary, pageNarrow } from "@/components/ui/styles";

export const metadata: Metadata = { title: "탈퇴 완료 · ME:U 미유", robots: { index: false, follow: false } };

export default function WithdrawnPage() {
  return (
    <main className={`${pageNarrow} py-16 md:py-24`}>
      <h1 className="text-[26px] font-bold tracking-tight">탈퇴가 완료되었어요</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
        검사 결과 · 구매한 리포트 내용 · 내 고민 자세히 알려주기 입력 · 고민 기록과 카카오 로그인 연결 정보를 삭제했어요. 주문 · 결제 기록만 법령이 정한 기간 동안 이름 없이 보관해요.
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-3">같은 카카오 계정으로 다시 가입하면 새 계정이 만들어지며, 이전 결과는 복구되지 않아요.</p>
      <div className="mt-8">
        <Link href="/" className={buttonPrimary}>
          처음 화면으로
        </Link>
      </div>
    </main>
  );
}
