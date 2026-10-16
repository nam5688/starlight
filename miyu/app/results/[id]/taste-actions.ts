"use server";

import { getResultView } from "@/lib/services/report-service";
import { requestTasteReport, TASTE_MESSAGES } from "@/lib/services/taste-service";
import { getMember } from "@/server/member";
import { logError } from "@/server/ops";
import { readRepository } from "@/server/services";
import { tasteDeps, tasteInputOf } from "@/server/taste";

export type TasteActionResult = { ok: true } | { ok: false; message: string };

/**
 * 맛보기 리포트 받기 — 로그인한 회원이 자기 결과에서만, 한 계정에 한 번(서비스 · DB가 지킨다).
 * 근거는 브라우저가 아니라 서버가 저장된 결과에서 다시 만든다(브라우저가 보내는 것은 결과 번호뿐이다). 글 내용은 어떤 기록에도 남기지 않고 서버 로그에는 가린 오류만 남는다.
 */
export async function makeTasteReportAction(input: { assessmentId: unknown }): Promise<TasteActionResult> {
  const notFound = { ok: false as const, message: TASTE_MESSAGES["not-found"] };
  if (typeof input?.assessmentId !== "string") return notFound;
  const assessmentId = input.assessmentId;
  const member = await getMember();
  if (!member || member.needsConsent) return notFound;
  try {
    const r = await requestTasteReport(
      tasteDeps(async () => {
        const view = await getResultView(await readRepository(), { userId: member.userId, assessmentId });
        return view ? tasteInputOf(view) : { ok: false, reason: "not-found" };
      }),
      { userId: member.userId, assessmentId },
    );
    return r.ok ? { ok: true } : { ok: false, message: r.message };
  } catch (e) {
    logError("taste.make", e);
    return { ok: false, message: TASTE_MESSAGES.failed };
  }
}
