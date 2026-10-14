import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { withdrawAction } from "@/app/my/withdraw/actions";
import { PageFallback } from "@/components/ui/page-fallback";
import { pageNarrow, textLink } from "@/components/ui/styles";
import {
  TRANSACTION_RETENTION_YEARS,
  WITHDRAWAL_BLOCKER_TEXT,
  WITHDRAWAL_CONFIRM_WORD,
  WITHDRAWAL_DELETED,
  WITHDRAWAL_KEPT,
  type WithdrawalBlocker,
} from "@/lib/membership/withdrawal";
import { withdrawalBlockers } from "@/lib/services/member-service";
import { consentPath, getMember } from "@/server/member";
import { now, writeRepository } from "@/server/services";

export const metadata: Metadata = { title: "회원 탈퇴 · ME:U 미유", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  confirm: `확인 항목에 체크하고 입력창에 "${WITHDRAWAL_CONFIRM_WORD}"를 정확히 적어 주세요.`,
  failed: "탈퇴 처리 중 오류가 났습니다. 잠시 뒤 다시 시도해 주세요. 계속되면 문의해 주세요.",
  auth: "개인정보 삭제는 끝났지만 로그인 연결을 지우는 단계가 끝나지 않았습니다. 같은 화면에서 한 번 더 눌러 마무리해 주세요.",
  "pending-order": WITHDRAWAL_BLOCKER_TEXT["pending-order"],
  "report-in-progress": WITHDRAWAL_BLOCKER_TEXT["report-in-progress"],
  "cash-balance": WITHDRAWAL_BLOCKER_TEXT["cash-balance"],
};

export default function WithdrawPage({ searchParams }: PageProps<"/my/withdraw">) {
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <h1 className="text-[26px] font-bold tracking-tight md:text-[30px]">회원 탈퇴</h1>
      <Suspense fallback={<PageFallback className="mt-8" />}>
        <WithdrawContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function WithdrawContent({ searchParams }: Pick<PageProps<"/my/withdraw">, "searchParams">) {
  await connection();
  const member = await getMember();
  if (!member) redirect("/my");
  if (member.needsConsent) redirect(consentPath("/my/withdraw"));
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const blockers: WithdrawalBlocker[] = await withdrawalBlockers(writeRepository(), member.userId, now());

  return (
    <div className="mt-6">
      <p className="text-[15px] leading-relaxed text-ink-2">탈퇴하면 아래 내용이 바로 삭제되며 되돌릴 수 없습니다. 환불이 필요하다면 탈퇴하기 전에 문의해 주세요.</p>
      <section aria-labelledby="wd-deleted" className="mt-6">
        <h2 id="wd-deleted" className="text-[18px] font-bold">
          바로 삭제되는 것
        </h2>
        <ul className="mt-3 divide-y divide-line border-y border-line text-[15px] leading-relaxed">
          {WITHDRAWAL_DELETED.map((t) => (
            <li key={t} className="py-3">
              {t}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="wd-kept" className="mt-6">
        <h2 id="wd-kept" className="text-[18px] font-bold">
          남는 것 (이름 없이, 법령이 정한 기간 동안)
        </h2>
        <ul className="mt-3 divide-y divide-line border-y border-line text-[15px] leading-relaxed">
          {WITHDRAWAL_KEPT.map((t) => (
            <li key={t} className="py-3">
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-ink-3">보관 기간({TRANSACTION_RETENTION_YEARS}년)과 항목은 약관 · 개인정보 처리방침 확정 전 초안입니다.</p>
      </section>

      {error && (
        <p role="alert" className="mt-6 rounded-md border border-danger px-4 py-3 text-[14px] text-danger">
          {error}
        </p>
      )}
      {blockers.length > 0 ? (
        <div className="mt-6 rounded-md bg-mist px-4 py-3 text-[14px] leading-relaxed" role="status">
          {blockers.map((b) => (
            <p key={b}>{WITHDRAWAL_BLOCKER_TEXT[b]}</p>
          ))}
        </div>
      ) : (
        <form action={withdrawAction} className="mt-6 space-y-4">
          <label className="flex items-start gap-3 text-[15px] leading-relaxed" htmlFor="wd-agree">
            <input id="wd-agree" name="agree" type="checkbox" required className="mt-1 size-5 shrink-0" />
            <span>위 내용을 확인했고, 삭제된 결과와 리포트는 복구할 수 없다는 것에 동의합니다.</span>
          </label>
          <div>
            <label htmlFor="wd-confirm" className="text-[15px] font-medium">
              확인을 위해 &quot;{WITHDRAWAL_CONFIRM_WORD}&quot;를 입력해 주세요
            </label>
            <input id="wd-confirm" name="confirm" autoComplete="off" required className="mt-2 h-12 w-full rounded-lg border border-line-strong px-4 text-[16px] sm:max-w-xs" />
          </div>
          <button type="submit" className="inline-flex h-12 items-center justify-center rounded-lg border border-danger px-6 text-[16px] font-semibold text-danger transition-colors hover:bg-mist">
            회원 탈퇴하기
          </button>
        </form>
      )}
      <p className="mt-6 text-[14px]">
        <Link href="/my" className={textLink}>
          MY로 돌아가기
        </Link>
      </p>
    </div>
  );
}
