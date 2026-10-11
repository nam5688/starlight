import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 로그인 세션 갱신 (Next.js 16의 Proxy, 예전 이름은 Middleware).
// 페이지를 그리기 전에 만료된 세션을 새로 고쳐 쿠키에 다시 써 둔다.
// 권한 확인 자체는 각 페이지·서버 함수에서 다시 한다.

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // 세션 쿠키가 담긴 응답은 캐시하지 않는다
        for (const [header, value] of Object.entries(headers ?? {})) response.headers.set(header, value);
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/analyze", "/my/:path*", "/results/:path*", "/checkout/:path*", "/payments/:path*", "/auth/:path*"],
};
