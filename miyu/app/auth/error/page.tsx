import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { KakaoLoginForm } from "@/components/auth/kakao-login-button";
import { buttonSecondary, pageNarrow } from "@/components/ui/styles";

export const metadata: Metadata = { title: "로그인 안내 · ME:U 미유" };

const MESSAGES: Record<string, string> = {
  denied: "카카오 로그인이 취소되었습니다.",
  exchange: "로그인 정보를 확인하지 못했습니다. 다시 시도해 주세요.",
  "missing-code": "로그인 정보가 전달되지 않았습니다. 다시 시도해 주세요.",
  save: "검사 결과를 저장하지 못했습니다. 검사를 다시 진행해 주세요.",
  start: "카카오 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  "not-configured": "로그인이 아직 설정되지 않았습니다.",
  db: "카카오 로그인은 됐지만 회원 정보를 저장할 DB가 준비되지 않았습니다. 운영자는 개발 서버의 /setup 화면에서 DB 상태를 확인해 주세요.",
};

export default function AuthErrorPage({ searchParams }: PageProps<"/auth/error">) {
  return (
    <main className={`${pageNarrow} py-14 md:py-20`}>
      <h1 className="text-[24px] font-bold tracking-tight">로그인을 완료하지 못했어요</h1>
      <Suspense fallback={<p className="mt-3 text-[16px] text-ink-2">잠시만 기다려 주세요.</p>}>
        <Reason searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Reason({ searchParams }: Pick<PageProps<"/auth/error">, "searchParams">) {
  const { reason } = await searchParams;
  const key = typeof reason === "string" ? reason : "";
  return (
    <>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">{MESSAGES[key] ?? MESSAGES.exchange}</p>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-3">
        로그인 전에 마친 검사 결과는 30분 동안 보관됩니다. 그 안에 다시 로그인하면 이어서 저장됩니다.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {key !== "not-configured" && <KakaoLoginForm next="/my" label="카카오로 다시 로그인" />}
        <Link href="/" className={buttonSecondary}>
          처음으로
        </Link>
      </div>
    </>
  );
}
