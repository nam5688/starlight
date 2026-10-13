import Link from "next/link";
import { startConcernCheckoutAction } from "@/app/results/[id]/context/actions";
import { buttonDisabled, buttonSecondary, textLink } from "@/components/ui/styles";
import { CONCERN_REPORT, formatKrw } from "@/lib/config/product";
import { ISSUING_UNAVAILABLE_MESSAGE, type IssueState } from "@/lib/services/concern-service";
import { ConcernIssueSubmit } from "./concern-issue-submit";

/** 결제 시작 전에 돌려보낸 사유 (?issue=...) 안내 — 결제는 시작하지 않았다 */
export const ISSUE_NOTICE: Record<string, string> = {
  payments: "결제 설정이 아직 끝나지 않아 결제를 시작하지 않았습니다. 고민은 저장되어 있습니다.",
  "sales-closed": "지금은 새 리포트 발급 신청이 몰려 잠시 받지 않고 있어요. 결제는 시작하지 않았고, 잠시 뒤 다시 눌러 주세요.",
  "not-purchased": "새 리포트 발급은 개인 통합 리포트를 구매한 분께 열려 있어요. 결제는 시작하지 않았습니다.",
  "base-not-ready": "개인 통합 리포트가 준비된 뒤에 발급할 수 있어요. 결제는 시작하지 않았습니다.",
  "no-concern": "발급하려면 먼저 고민을 적어 저장해 주세요.",
  "not-ready": "이 기능을 쓰려면 운영자가 DB 변경 11번(20261021000000_concern_records.sql)을 먼저 적용해야 합니다. 결제는 시작하지 않았습니다.",
  "ai-not-connected": ISSUING_UNAVAILABLE_MESSAGE["ai-not-connected"],
};

/**
 * 새 리포트 발급 영역 — 저장과 따로 누른다.
 * 고민을 고쳐 저장할 때마다 다시 "발급" 버튼이 되고, 지금의 고민으로 이미 발급했다면 그 리포트로 가는 버튼이 된다.
 */
export function ConcernIssuePanel({ assessmentId, issue }: { assessmentId: string; issue: IssueState }) {
  const price = formatKrw(CONCERN_REPORT.priceKrw);
  const label = `이 고민으로 새 리포트 발급 · ${price}`;
  const base = `/results/${assessmentId}`;

  if (issue.kind === "no-concern") return null;

  if (issue.kind === "issued") {
    return (
      <section aria-labelledby="ctx-issue" className="border-y border-line py-6">
        <h2 id="ctx-issue" className="text-[18px] font-bold tracking-tight">
          새 리포트 발급
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          {issue.generation === "ready"
            ? "지금 적어 둔 고민으로 이미 새 리포트를 발급했습니다. 고민을 고쳐 저장하면 다시 발급할 수 있어요."
            : issue.generation === "failed"
              ? "지금 적어 둔 고민으로 발급한 리포트를 만들지 못했습니다. 결제는 정상이며, 리포트 화면에서 같은 발급 건으로 다시 만들 수 있어요 (추가 결제 없음)."
              : "지금 적어 둔 고민으로 발급한 리포트를 만들고 있어요."}
        </p>
        <Link href={`${base}/context/${issue.recordId}`} className={`${buttonSecondary} mt-4 w-full sm:w-auto`}>
          이 고민이 반영된 리포트 보러가기
        </Link>
      </section>
    );
  }

  const disabledReason =
    issue.kind === "not-purchased"
      ? "새 리포트 발급은 개인 통합 리포트를 구매한 분께 열려 있어요."
      : issue.kind === "base-not-ready"
        ? "개인 통합 리포트가 준비되면 발급할 수 있어요. 이미 준 내용과 다른 해석을 쓰기 위해 준비된 뒤에 발급합니다."
        : issue.kind === "unavailable"
          ? ISSUING_UNAVAILABLE_MESSAGE[issue.reason]
          : null;

  return (
    <section aria-labelledby="ctx-issue" className="border-y border-line py-6">
      <h2 id="ctx-issue" className="text-[18px] font-bold tracking-tight">
        새 리포트 발급
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
        지금 저장된 고민을 중심으로 한 별도의 리포트를 새로 만듭니다. 개인 통합 리포트에 문단을 더하는 것이 아니라, 이 고민의 상황마다 왜 그런지와 해 볼 선택을 새로 풉니다. 기존 리포트는 그대로 보관됩니다.
      </p>
      {disabledReason ? (
        <>
          <button type="button" disabled className={`${buttonDisabled} mt-4 w-full sm:w-auto`}>
            {label}
          </button>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-2">{disabledReason}</p>
          {issue.kind === "not-purchased" && (
            <p className="mt-2 text-[14px]">
              <Link href={`${base}#r-purchase`} className={textLink}>
                개인 통합 리포트 보기
              </Link>
            </p>
          )}
        </>
      ) : (
        <>
          <form action={startConcernCheckoutAction.bind(null, assessmentId)} className="mt-4">
            <ConcernIssueSubmit label={label} />
          </form>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-ink-3">
            <li>고민을 쓰고 · 고치고 · 저장하는 것은 무료입니다. 발급할 때마다 결제합니다 (개인 통합 리포트 구매자 전용 가격).</li>
            <li>발급하면 그때의 고민이 기록으로 남고, 이후에 고민을 고쳐도 이미 발급한 리포트는 바뀌지 않습니다.</li>
            <li>만들기에 실패하면 같은 발급 건으로 다시 시도하며 추가 결제는 없습니다.</li>
          </ul>
        </>
      )}
    </section>
  );
}
