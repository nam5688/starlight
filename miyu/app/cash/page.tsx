import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { startCashChargeAction } from "@/app/cash/actions";
import { LoginOptions } from "@/components/auth/login-options";
import { BonusTable, ChargeForm } from "@/components/cash/charge-form";
import { formatDateTime } from "@/components/ui/format";
import { PageFallback } from "@/components/ui/page-fallback";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonPrimary, textLink } from "@/components/ui/styles";
import { MIYU_CASH, parseCashProductId } from "@/lib/config/product";
import { salesClosedMessage } from "@/lib/services/capacity-service";
import { getCashView } from "@/lib/services/cash-service";
import { currentSaleGate } from "@/server/capacity";
import { isAuthConfigured, paymentConfig } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { reconcileUserInBackground } from "@/server/reconcile";
import { readRepository } from "@/server/services";

export const metadata: Metadata = { title: "미유캐시 충전 · ME:U 미유", robots: { index: false } };

const ASSESSMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_NUMBER = /^[A-Za-z0-9_-]{6,64}$/;

const ERRORS: Record<string, string> = {
  payments: "지금은 결제를 열 수 없어요. 잠시 뒤 다시 시도해 주세요.",
  amount: `충전은 ${MIYU_CASH.unit}개 단위로 ${MIYU_CASH.minCash}~${MIYU_CASH.maxCash}캐시까지 할 수 있어요. 개수를 다시 정해 주세요.`,
  closed: "지금은 새 결제를 받지 않아요. 잠시 뒤 다시 시도해 주세요.",
  unavailable: "충전을 준비하고 있어요. 아직 충전할 수 없어요.",
};

export default function CashPage({ searchParams }: PageProps<"/cash">) {
  return (
    <main className="bg-page">
      <div className="mx-auto w-full max-w-[720px] px-5 py-8 md:py-12">
        <Suspense fallback={<PageFallback />}>
          <CashContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function CashContent({ searchParams }: Pick<PageProps<"/cash">, "searchParams">) {
  await connection();
  const query = await searchParams;
  const one = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : null);
  const requested = one("a") && ASSESSMENT_ID.test(one("a")!) ? one("a")! : null;
  const doneNumber = one("done") && ORDER_NUMBER.test(one("done")!) ? one("done")! : null;
  const error = one("error");
  const here = `/cash${requested ? `?a=${requested}` : ""}`;

  if (!isAuthConfigured()) {
    return (
      <div>
        <h1 className="text-[24px] font-bold tracking-tight">미유캐시</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">로그인이 아직 설정되지 않았어요.</p>
      </div>
    );
  }
  const member = await getMember();
  if (!member) {
    return (
      <div>
        <h1 className="text-[24px] font-bold tracking-tight">로그인이 필요해요</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">미유캐시는 로그인한 회원의 지갑에 쌓여요.</p>
        <div className="mt-8">
          <LoginOptions next={here} />
        </div>
      </div>
    );
  }
  if (member.needsConsent) redirect(consentPath(here));
  // 결제 승인이 났는데 돌아오지 못한 충전이 있으면 응답 뒤에 결제사 기록과 맞춘다
  reconcileUserInBackground(member.userId);

  const repo = await readRepository();
  const assessments = await repo.listAssessments(member.userId);
  // 충전 주문은 본인의 검사 결과 하나에 붙는다 — 주소로 받은 번호가 내 것이 아니면 가장 최근 결과를 쓴다
  const anchor = assessments.find((a) => a.id === requested) ?? assessments[0] ?? null;
  const [view, gate] = await Promise.all([getCashView(repo, member.userId), currentSaleGate().catch(() => null)]);
  const payment = paymentConfig();

  // 방금 끝난 충전 (결제 승인이 확인된 내 주문만)
  let done: { cash: number; bonus: number } | null = null;
  if (doneNumber) {
    const order = await repo.getOrderByNumber(doneNumber);
    const parsed = order && order.userId === member.userId && order.status === "paid" ? parseCashProductId(order.productId) : null;
    if (parsed) done = { cash: parsed.cash, bonus: parsed.bonus };
  }

  const disabledNote = !anchor
    ? "먼저 무료 분석을 한 번 해 주세요. 분석을 마치면 충전할 수 있어요."
    : !view.ready
      ? "충전을 준비하고 있어요. 아직 충전할 수 없어요."
      : !payment.ok
      ? "결제 연결 전이라 아직 충전할 수 없어요."
      : gate && !gate.open
        ? salesClosedMessage(gate.reason)
        : null;

  return (
    <div className="space-y-10">
      <header>
        <p className="text-[13px] font-semibold text-accent">미유캐시</p>
        <h1 className="mt-1 text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">질문을 이어 가는 충전</h1>
        <p className="mt-2 text-[15px] leading-[1.7] text-ink-2">
          무료 질문을 다 쓴 뒤에는 캐시로 이어서 물어볼 수 있어요. 질문 한 번에 {MIYU_CASH.perQuestion}캐시가 쓰이고, 유료 질문은 글자 수 제한이 1,000자로 늘어요.
        </p>
      </header>

      {done && (
        <p role="status" className="rounded-2xl bg-positive-soft px-4 py-3.5 text-[15px] leading-[1.7] text-positive">
          충전이 완료됐어요. {done.cash}캐시{done.bonus > 0 ? ` + 보너스 ${done.bonus}캐시` : ""}가 지갑에 들어왔어요.
        </p>
      )}
      {error && ERRORS[error] && (
        <p role="alert" className="rounded-2xl bg-caution-soft px-4 py-3.5 text-[15px] leading-[1.7] text-caution">
          {ERRORS[error]}
        </p>
      )}

      <section aria-labelledby="cash-balance" className="rounded-3xl bg-canvas px-5 py-6 shadow-soft">
        <h2 id="cash-balance" className="text-[15px] font-semibold text-ink-3">
          내 지갑
        </h2>
        <p className="mt-1 text-[34px] leading-tight font-bold tracking-tight tabular-nums">
          {view.balance}
          <span className="ml-1 text-[18px] font-semibold text-ink-2">캐시</span>
        </p>
        <p className="mt-1 text-[14px] text-ink-3">질문 {view.questions}번 정도 물어볼 수 있어요.</p>
      </section>

      <section aria-labelledby="cash-charge">
        <h2 id="cash-charge" className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
          충전하기
        </h2>
        <div className="mt-4">
          {anchor ? (
            <ChargeForm action={startCashChargeAction.bind(null, anchor.id)} disabledNote={disabledNote} />
          ) : (
            <div>
              <p className="text-[15px] leading-[1.7] text-ink-2">{disabledNote}</p>
              <Link href="/analyze" className={`${buttonPrimary} mt-4`}>
                무료 분석 해보기
              </Link>
            </div>
          )}
        </div>
        {payment.ok && !payment.liveMode && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-[14px] text-ink-2">
            <StatusBadge>테스트 결제</StatusBadge>
            실제로 돈이 결제되지 않는 테스트 환경입니다.
          </p>
        )}
      </section>

      <section aria-labelledby="cash-bonus">
        <h2 id="cash-bonus" className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
          많이 충전하면 보너스
        </h2>
        <div className="mt-4">
          <BonusTable />
        </div>
      </section>

      <section aria-labelledby="cash-notes">
        <h2 id="cash-notes" className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
          알아 두세요
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] leading-[1.7] text-ink-2">
          <li>
            충전 금액과 보너스는 <StatusBadge>가격 {MIYU_CASH.priceNote}</StatusBadge>이에요. 결제 금액은 서버가 개수로 계산해서 정해요.
          </li>
          <li>답을 받지 못한 무료 질문과 캐시 질문은 차감되지 않거나 지갑으로 되돌아와요.</li>
          <li>결제가 취소되면 그 충전으로 들어온 캐시(보너스 포함)는 지갑에서 회수돼요.</li>
          {!MIYU_CASH.policyDecided && <li>환불과 유효기간 기준은 아직 정해지지 않았어요. 정해지면 이곳에 알려 드려요.</li>}
        </ul>
      </section>

      <section aria-labelledby="cash-ledger">
        <h2 id="cash-ledger" className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
          최근 내역
        </h2>
        {view.ledger.length === 0 ? (
          <p className="mt-3 text-[15px] text-ink-2">아직 내역이 없어요.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-canvas shadow-soft">
            {view.ledger.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium">{l.label}</span>
                  <span className="block text-[13px] text-ink-3">{formatDateTime(l.at)}</span>
                </span>
                <span className={`shrink-0 text-[16px] font-semibold tabular-nums ${l.amount >= 0 ? "text-positive" : "text-ink-2"}`}>
                  {l.amount > 0 ? "+" : ""}
                  {l.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
        {anchor && (
          <Link href={`/results/${anchor.id}`} className={textLink}>
            내 결과로 돌아가기
          </Link>
        )}
        <Link href="/my" className={textLink}>
          MY로 가기
        </Link>
      </p>
    </div>
  );
}
