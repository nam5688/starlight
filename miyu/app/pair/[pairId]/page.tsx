import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoginOptions } from "@/components/auth/login-options";
import { CopyLinkBox, PairChangeButtons, PairPayButton } from "@/components/pair/pair-forms";
import { PairStatusPoller } from "@/components/pair/pair-status-poller";
import { CompatReportView } from "@/components/report/compat-report-view";
import { ReviewLink } from "@/components/reviews/review-link";
import { ResultHeader } from "@/components/report/result-header";
import { PageFallback } from "@/components/ui/page-fallback";
import { buttonPrimary, buttonSecondary, pageNarrow } from "@/components/ui/styles";
import { formatKrw } from "@/lib/config/product";
import { getPairView, paidPairOrder, type PairView } from "@/lib/services/pair-service";
import { isAuthConfigured, siteUrl } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { pairDeps } from "@/server/pair";
import { reconcileUserInBackground } from "@/server/reconcile";

export const metadata: Metadata = { title: "리포트 궁합 · ME:U 미유", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f-]{36}$/;

/**
 * 리포트 궁합 한 쌍의 화면 — 쌍의 구성원만 열 수 있다(아니면 없는 화면). 상태에 따라 초대 링크 · 연결 · 결제 · 만드는 중 · 완성된 글을 보인다.
 * 완성된 글은 저장된 것을 그대로 보여 주고 열 때마다 새로 만들지 않는다. 결제한 사람도 상대도 같은 글을 읽는다.
 */
export default function PairPage({ params }: PageProps<"/pair/[pairId]">) {
  return (
    <main className="bg-page">
      <Suspense fallback={<PageFallback text="리포트 궁합을 불러오고 있어요." className={`${pageNarrow} py-16`} tall />}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className={`${pageNarrow} py-12 md:py-16`}>{children}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[18px] font-bold">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-[1.75] text-ink-2">{children}</div>
    </section>
  );
}

async function Content({ params }: Pick<PageProps<"/pair/[pairId]">, "params">) {
  await connection();
  const { pairId } = await params;
  if (!UUID.test(pairId) || !isAuthConfigured()) notFound();
  const here = `/pair/${pairId}`;
  const member = await getMember();
  if (!member) {
    return (
      <Frame>
        <h1 className="text-[24px] font-bold tracking-tight">로그인이 필요해요</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">리포트 궁합은 연결된 두 사람만 볼 수 있어요. 로그인해 주세요.</p>
        <div className="mt-8">
          <LoginOptions next={here} />
        </div>
      </Frame>
    );
  }
  if (member.needsConsent) redirect(consentPath(here));
  // 결제 승인이 났는데 돌아오지 못한 주문이 있으면 응답 뒤에 결제사 기록과 맞춘다
  reconcileUserInBackground(member.userId);

  const view = await getPairView(pairDeps(), { pairId, userId: member.userId });
  if (view.kind === "not-found") notFound();
  if (view.kind === "db-not-ready") {
    return (
      <Frame>
        <h1 className="text-[22px] font-bold tracking-tight">리포트 궁합을 준비하고 있어요</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">잠시 뒤에 다시 열어 주세요.</p>
      </Frame>
    );
  }
  // 후기 입구는 결제한 사람에게만(구매 한 건에 후기와 보상은 한 번 — 상대는 같은 글을 읽어도 후기 대상이 아니다). 자격은 서버가 후기를 쓸 때 다시 확인한다
  const deps = pairDeps();
  const reviewRef = view.report.state === "ready" && view.purchase.state === "paid" && view.purchase.buyer === "me" ? ((await paidPairOrder(deps, { pairId, userId: member.userId }))?.id ?? null) : null;
  return <Body view={view} reviewRef={reviewRef} />;
}

function Body({ view, reviewRef }: { view: Extract<PairView, { kind: "ok" }>; reviewRef: string | null }) {
  const price = formatKrw(view.priceKrw);
  const names = view.otherNickname ? `${view.myNickname ?? "나"} 님 · ${view.otherNickname} 님` : null;

  // 완성된 글 — 읽을 수 있을 때는 연결 상태와 관계없이 그대로 보인다(연결 해제는 열람을 막지 않는다)
  if (view.report.state === "ready") {
    return (
      <>
        <ResultHeader title="리포트 궁합" subtitle="두 사람의 사주와, 각자 직접 답한 응답의 방향을 같은 영역끼리 비교해 읽었어요. 재미 · 참고용이고 관계의 결과를 알려 주지 않아요." source={view.report.report.placeholder ? "dev-scoring" : undefined} meta={`저장된 리포트${names ? ` · ${names}` : ""}`} tone="love" />
        <div className={`${pageNarrow} pb-14`}>
          <CompatReportView report={view.report.report} viewer={view.role} />
          {reviewRef && (
            <div className="mt-8">
              <ReviewLink kind="pair_compat" subjectRef={reviewRef} />
            </div>
          )}
          <Section title="연결 · 동의 관리">
            <p>연결을 끊어도 이미 만들어진 글은 두 사람 모두 계속 읽을 수 있어요. 동의를 철회하면 내 자료는 새 궁합에 더 쓰이지 않고, 나는 이 글을 더 읽을 수 없어요.</p>
            <PairChangeButtons pairId={view.pairId} canUnlink={view.can.unlink} canWithdraw={view.can.withdraw} />
          </Section>
          <div className="mt-8">
            <Link href="/my" className={buttonSecondary}>
              MY로 가기
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <ResultHeader title="리포트 궁합" subtitle="각자의 분석 결과를 서로 동의한 뒤 연결해 읽는 궁합이에요." meta={names ?? "상대를 기다리는 중"} tone="love" />
      <div className={`${pageNarrow} pb-14`}>
        {view.report.state === "blocked" ? (
          <Section title={view.report.why === "refunded" ? "환불된 주문이에요" : view.report.why === "unfinished" ? "연결이 끊겨 글을 만들 수 없어요" : "동의를 철회해 이 글을 볼 수 없어요"}>
            <p>
              {view.report.why === "refunded"
                ? "이 리포트 궁합 주문은 환불되어 두 사람 모두 글을 열 수 없어요."
                : view.report.why === "unfinished"
                  ? "결제는 됐지만 글이 만들어지기 전에 연결이 끊겨 더 만들 수 없어요. 운영자가 환불 여부를 확인하고 있어요. 궁금한 점은 문의해 주세요."
                  : "내가 동의를 철회해서 이 글을 더 읽을 수 없어요. 상대는 계속 읽을 수 있어요. 이미 만들어진 글의 삭제 · 처리정지가 필요하면 문의해 주세요."}
            </p>
          </Section>
        ) : view.purchase.state === "paid" ? (
          <Section title="리포트 궁합을 만들고 있어요">
            <PairStatusPoller pairId={view.pairId} initial={view.report.state === "failed" ? "failed" : "generating"} />
            <p className="text-[13px] text-ink-3">{view.purchase.buyer === "me" ? "내가 결제했어요." : "상대가 결제했어요."} 한 쌍에 한 번만 결제하고, 두 사람이 같은 글을 읽어요.</p>
          </Section>
        ) : view.status === "invited" ? (
          <Section title="상대에게 초대 링크를 보내 주세요">
            <p>상대가 링크를 열고 자기 분석 결과로 동의하면 연결돼요. 링크는 {new Date(view.expiresAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}까지 쓸 수 있어요. 링크에는 이름 · 생년월일이 들어 있지 않아요.</p>
            {view.token && <CopyLinkBox url={`${siteUrl()}/pair/join/${view.token}`} />}
          </Section>
        ) : view.status === "unlinked" ? (
          <Section title="연결이 끊겼어요">
            <p>이 쌍은 더 이상 새 궁합을 만들지 않아요. 아직 결제하지 않았다면 어떤 글도 만들어지지 않아요.</p>
          </Section>
        ) : (
          <Section title={`${names ?? "두 사람"}이 연결됐어요`}>
            <p>두 사람이 모두 동의했어요. 이제 둘 중 한 사람이 한 번 결제하면 같은 글을 둘 다 읽어요. 결제하기 전에는 어떤 글도 만들어지지 않아요.</p>
            {view.purchase.state === "other-pending" ? (
              <p className="rounded-xl bg-mist px-4 py-3">상대가 지금 결제를 진행하고 있어요. 잠시 뒤에 이 화면을 다시 열어 주세요.</p>
            ) : view.purchase.state === "mine-pending" ? (
              <div className="space-y-3">
                <p>결제를 시작해 둔 주문이 있어요.</p>
                <Link href={`/checkout/${view.purchase.orderNumber}`} className={buttonPrimary}>
                  이어서 결제하기
                </Link>
              </div>
            ) : view.purchase.state === "refunded" ? (
              <p className="rounded-xl bg-mist px-4 py-3">환불된 쌍이라 다시 결제할 수 없어요. 문의해 주세요.</p>
            ) : view.can.pay ? (
              <PairPayButton pairId={view.pairId} priceLabel={price} />
            ) : (
              <p className="rounded-xl bg-mist px-4 py-3">지금은 결제를 받지 않고 있어요. 이미 연결된 쌍은 그대로 유지돼요.</p>
            )}
          </Section>
        )}

        {view.status !== "unlinked" && view.report.state !== "blocked" && (
          <Section title="연결 · 동의 관리">
            <PairChangeButtons pairId={view.pairId} canUnlink={view.can.unlink} canWithdraw={view.can.withdraw} />
          </Section>
        )}
        <div className="mt-8">
          <Link href="/pair" className={buttonSecondary}>
            리포트 궁합 목록
          </Link>
        </div>
      </div>
    </>
  );
}
