import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { signOut } from "@/app/auth/actions";
import { KakaoLoginForm } from "@/components/auth/kakao-login-button";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonPrimary, buttonSecondary, pageNarrow } from "@/components/ui/styles";
import { listMyItems, type MyItem } from "@/lib/services/report-service";
import { isAuthConfigured } from "@/server/env";
import { readRepository } from "@/server/services";
import { getSessionUserId } from "@/server/session";

export const metadata: Metadata = {
  title: "MY · ME:U 미유",
  robots: { index: false },
};

export default function MyPage() {
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <h1 className="text-[26px] font-bold tracking-tight md:text-[30px]">MY</h1>
      <p className="mt-2 text-[16px] text-ink-2">저장한 결과와 구매한 리포트를 저장된 그대로 다시 볼 수 있습니다.</p>
      <Suspense fallback={<p className="mt-8 text-[16px] text-ink-2">불러오고 있어요.</p>}>
        <MyContent />
      </Suspense>
    </main>
  );
}

async function MyContent() {
  await connection(); // 환경변수·로그인 상태를 요청 때마다 확인한다
  if (!isAuthConfigured()) {
    return (
      <div className="mt-8 border-y border-line py-8">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[17px] font-semibold">로그인이 아직 설정되지 않았습니다</p>
          <StatusBadge>설정 전</StatusBadge>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          Supabase와 카카오 로그인 설정을 마치면 이곳에서 저장한 결과를 볼 수 있습니다.
        </p>
        <Actions />
      </div>
    );
  }

  const userId = await getSessionUserId();
  if (!userId) {
    return (
      <div className="mt-8 border-y border-line py-8">
        <p className="text-[17px] font-semibold">로그인하고 내 결과를 확인하세요</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">카카오 계정으로 가입·로그인합니다. 토스 가입이나 앱 설치는 필요 없습니다.</p>
        <div className="mt-6">
          <KakaoLoginForm next="/my" />
        </div>
      </div>
    );
  }

  const items = await listMyItems(await readRepository(), userId);
  return (
    <>
      <section aria-labelledby="my-list" className="mt-8">
        <h2 id="my-list" className="text-[18px] font-bold">
          내 결과
        </h2>
        {items.length === 0 ? (
          <p className="mt-3 border-y border-line py-8 text-[15px] text-ink-2">아직 저장한 결과가 없습니다.</p>
        ) : (
          <ul className="mt-3 border-t border-ink">
            {items.map((item) => (
              <li key={item.assessment.id} className="border-b border-line">
                <Link
                  href={`/results/${item.assessment.id}`}
                  className="flex items-center justify-between gap-4 py-4 hover:bg-mist/60"
                >
                  <span className="min-w-0">
                    <span className="block text-[16px] font-semibold">
                      {item.assessment.tendencyName}
                      <span className="ml-2 text-[14px] font-normal text-ink-3">{item.assessment.nickname} 님</span>
                    </span>
                    <span className="mt-0.5 block text-[14px] text-ink-3">
                      {new Date(item.assessment.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
                    </span>
                  </span>
                  <StatusBadge>{statusLabel(item)}</StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Actions signedIn />
    </>
  );
}

function statusLabel(item: MyItem): string {
  if (item.purchase === "paid") {
    if (item.reportStatus === "ready") return "리포트 보기";
    if (item.reportStatus === "failed") return "리포트 생성 실패";
    return "리포트 준비 중";
  }
  if (item.purchase === "refunded") return "환불됨";
  return "무료 요약";
}

function Actions({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <Link href="/analyze" className={buttonPrimary}>
        새 분석 시작하기
      </Link>
      {signedIn ? (
        <form action={signOut}>
          <button type="submit" className={`${buttonSecondary} w-full sm:w-auto`}>
            로그아웃
          </button>
        </form>
      ) : (
        <Link href="/report/sample" className={buttonSecondary}>
          리포트 예시 보기
        </Link>
      )}
    </div>
  );
}
