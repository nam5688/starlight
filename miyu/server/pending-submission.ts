import "server-only";
import { cookies } from "next/headers";
import { parseAnswers } from "@/lib/assessment/scoring";
import type { Answers } from "@/lib/assessment/types";
import { parseBasicInfo, type BasicInfo } from "@/lib/profile/basic-info";
import { supabaseEnv } from "./env";
import { deriveKey, open, seal } from "./pending-crypto";
import { getSiteUrl } from "./session";

// 카카오 로그인으로 다른 사이트에 다녀오는 동안 검사 결과를 잠시 보관한다.
// 브라우저 저장소가 아니라 암호화된 HttpOnly 쿠키에 30분만 두고, 저장이 끝나면 지운다.
// 비회원의 생년월일·응답을 서버 DB에 남기지 않기 위한 방식이다.

const COOKIE = "meu_pending";
const MAX_AGE_SECONDS = 30 * 60;

export type PendingSubmission = { info: BasicInfo; answers: Answers; createdAt: number };

function key() {
  return deriveKey(supabaseEnv().secretKey);
}

export async function savePendingSubmission(info: BasicInfo, answers: Answers): Promise<void> {
  const store = await cookies();
  const secure = (await getSiteUrl()).startsWith("https://");
  store.set(COOKIE, seal({ info, answers, createdAt: Date.now() } satisfies PendingSubmission, key()), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readPendingSubmission(): Promise<PendingSubmission | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const data = open<PendingSubmission>(token, key());
  if (!data || Date.now() - data.createdAt > MAX_AGE_SECONDS * 1000) return null;
  const info = parseBasicInfo(data.info);
  const answers = parseAnswers(data.answers);
  return info && answers ? { info, answers, createdAt: data.createdAt } : null;
}

export async function clearPendingSubmission(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
