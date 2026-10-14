import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { KakaoLoginForm } from "@/components/auth/kakao-login-button";
import { EmailForm, type EmailMode } from "@/components/auth/email-form";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { isAuthConfigured } from "@/server/env";
import { getSessionUserId, safeNextPath } from "@/server/session";

export const metadata: Metadata = { title: "이메일 로그인 · ME:U 미유", robots: { index: false } };

const MODES: EmailMode[] = ["login", "signup", "reset"];

export default function EmailAuthPage({ searchParams }: PageProps<"/auth/email">) {
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <Suspense fallback={<p className="text-[16px] text-ink-2">잠시만 기다려 주세요.</p>}>
        <EmailAuthContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const TITLES: Record<string, { title: string; lead: string }> = {
  login: { title: "이메일로 로그인", lead: "가입한 이메일과 비밀번호로 들어와요. 카카오로 가입했다면 아래 카카오 버튼을 눌러 주세요." },
  signup: { title: "이메일로 가입", lead: "카카오 없이 이메일로도 시작할 수 있어요. 확인 메일의 링크를 누르면 가입이 끝나요." },
  reset: { title: "비밀번호 재설정", lead: "가입한 이메일을 적으면 비밀번호를 바꾸는 링크를 보내 드려요." },
};

async function EmailAuthContent({ searchParams }: Pick<PageProps<"/auth/email">, "searchParams">) {
  // 요청이 들어온 뒤의 값(주소의 검색어)을 먼저 읽는다 — 그래야 설정 · 로그인 확인이 빌드가 아니라 요청 때 실행된다
  const params = await searchParams;
  if (!isAuthConfigured()) redirect("/auth/error?reason=not-configured");
  const next = safeNextPath(params.next);
  const mode = (MODES as string[]).includes(String(params.mode)) ? (params.mode as EmailMode) : "login";
  if (await getSessionUserId()) redirect(next);
  const t = TITLES[mode];
  return (
    <>
      <h1 className="text-[24px] font-bold tracking-tight md:text-[28px]">{t.title}</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{t.lead}</p>
      <EmailForm mode={mode} next={next} />
      {mode !== "reset" && (
        <div className="mt-8 border-t border-line pt-6">
          <p className="mb-3 text-[14px] text-ink-3">카카오로 시작하려면</p>
          <KakaoLoginForm next={next} />
        </div>
      )}
      <p className="mt-6 text-[13px] leading-relaxed text-ink-3">
        이메일 주소는 로그인과 비밀번호 재설정에만 쓰고, 비밀번호는 미유가 보관하지 않고 로그인 서비스(Supabase)가 암호화된 값으로만 보관합니다.{" "}
        <Link href="/privacy" className={textLink}>
          개인정보 처리방침(초안)
        </Link>
      </p>
    </>
  );
}
