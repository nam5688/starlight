"use server";

import { cookies } from "next/headers";
import { reportReview } from "@/lib/services/review-service";
import { ANON_COOKIE } from "@/server/acquisition";
import { logError } from "@/server/ops";
import { siteUrl } from "@/server/env";
import { now, reviewRepository } from "@/server/services";

// 공개 후기 신고 — 로그인 없이 누구나 할 수 있다. 신고자의 이름 · 연락처는 받지 않고 익명 방문 번호(쿠키)만 쓴다(같은 방문자가 같은 후기를 두 번 신고하지 않게).
// 1분에 5건까지(같은 방문 번호) — 반복 호출로 신고가 쌓이는 것을 막는다. 신고는 후기를 숨기지 않는다 — 운영자가 글을 읽고 사유 분류와 함께 정한다.

export type ReportFormState = { ok: boolean; message: string } | null;

const recent = new Map<string, number[]>();
const LIMIT_PER_MINUTE = 5;

export async function reportReviewAction(_prev: ReportFormState, formData: FormData): Promise<ReportFormState> {
  try {
    const jar = await cookies();
    let anonId = jar.get(ANON_COOKIE)?.value ?? "";
    if (!/^[0-9a-f-]{36}$/.test(anonId)) {
      anonId = crypto.randomUUID();
      jar.set(ANON_COOKIE, anonId, { httpOnly: true, sameSite: "lax", secure: siteUrl().startsWith("https"), path: "/", maxAge: 365 * 24 * 3600 });
    }
    const t = now().getTime();
    const list = (recent.get(anonId) ?? []).filter((x) => t - x < 60_000);
    if (list.length >= LIMIT_PER_MINUTE) return { ok: false, message: "잠시 뒤에 다시 시도해 주세요." };
    list.push(t);
    recent.set(anonId, list);
    if (recent.size > 2000) recent.clear();

    const r = await reportReview(reviewRepository(), { reviewId: formData.get("reviewId"), reporterKey: anonId, reason: formData.get("reason") });
    switch (r) {
      case "reported":
        return { ok: true, message: "신고를 받았어요. 운영자가 확인해요." };
      case "duplicate":
        return { ok: true, message: "이미 신고하셨어요. 운영자가 확인해요." };
      case "not-public":
        return { ok: false, message: "이 후기는 지금 공개되어 있지 않아요." };
      case "not-ready":
        return { ok: false, message: "신고 기능을 준비하고 있어요." };
      default:
        return { ok: false, message: "신고 내용을 확인해 주세요." };
    }
  } catch (e) {
    logError("reviews.report", e);
    return { ok: false, message: "처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요." };
  }
}
