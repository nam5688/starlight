import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabaseEnv } from "./env";

/**
 * Next.js는 화면을 그리는 동안(그리고 그 뒤의 after 안에서도) 같은 주소의 GET 요청을 한 번만 보내고 결과를 재사용한다.
 * DB 조회에는 맞지 않는다 — 방금 저장한 것을 같은 요청 안에서 다시 읽으면 저장 전의 결과가 돌아와
 * (예: 대기열에 올린 리포트가 "없음"으로 읽혀 생성이 시작되지 않음) 결제 · 리포트 흐름이 어긋난다.
 * AbortController 신호를 붙이면 이 재사용에서 빠진다 (Next.js fetch 문서의 Memoization 항목).
 */
const freshFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store", signal: init?.signal ?? new AbortController().signal });

/**
 * 로그인한 사용자 권한의 클라이언트 (쿠키의 세션 사용).
 * DB 접근 정책(RLS)이 적용되어 본인 데이터만 읽을 수 있다.
 */
export async function createServerSupabase() {
  // 요청 시점에만 만든다 (Supabase 클라이언트는 현재 시각을 읽으므로 미리 그리기 단계에서 실행하지 않는다)
  await connection();
  const { url, publishableKey } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, publishableKey, {
    global: { fetch: freshFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다 — 세션 갱신은 proxy.ts가 맡는다
        }
      },
    },
  });
}

/**
 * 서버 비밀키 클라이언트 — 쓰기 전용으로 쓴다. RLS를 우회하므로
 * 반드시 서비스에서 소유자를 확인한 뒤에만 사용한다. 브라우저 코드에서 절대 import하지 않는다.
 */
export function createAdminSupabase() {
  const { url, secretKey } = supabaseEnv();
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: freshFetch },
  });
}
