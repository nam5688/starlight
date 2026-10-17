import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonPrimary, pageNarrow } from "@/components/ui/styles";

export const metadata: Metadata = { title: "가입 취소 · ME:U 미유", robots: { index: false } };

export default function DeclinedPage({ searchParams }: PageProps<"/auth/declined">) {
  return (
    <main className={`${pageNarrow} py-14 md:py-20`}>
      <Suspense fallback={null}>
        <Message searchParams={searchParams} />
      </Suspense>
      <Link href="/" className={`${buttonPrimary} mt-8`}>
        처음으로
      </Link>
    </main>
  );
}

async function Message({ searchParams }: Pick<PageProps<"/auth/declined">, "searchParams">) {
  const { account } = await searchParams;
  if (account === "kept") {
    return (
      <>
        <h1 className="text-[24px] font-bold tracking-tight">로그아웃했어요</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
          저장된 결과와 구매한 리포트는 그대로 있어요. 바뀐 약관에 동의하면 다시 이용할 수 있어요.
        </p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-[24px] font-bold tracking-tight">가입을 취소했어요</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
        방금 만든 계정과 로그인 전에 보관하던 검사 결과를 삭제했어요.
      </p>
    </>
  );
}
