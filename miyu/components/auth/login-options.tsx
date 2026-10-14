import Link from "next/link";
import { KakaoLoginForm } from "@/components/auth/kakao-login-button";
import { textLink } from "@/components/ui/styles";

/** 로그인이 필요한 화면의 로그인 방법 — 카카오(기본)와 이메일(자체 로그인). 로그인 뒤 next로 돌아온다 */
export function LoginOptions({ next, kakaoLabel }: { next: string; kakaoLabel?: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <KakaoLoginForm next={next} label={kakaoLabel} />
      <Link href={`/auth/email?next=${encodeURIComponent(next)}`} className={`${textLink} text-[15px]`}>
        이메일로 로그인 · 가입
      </Link>
    </div>
  );
}
