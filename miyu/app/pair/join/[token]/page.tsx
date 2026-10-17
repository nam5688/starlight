import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoginOptions } from "@/components/auth/login-options";
import { PairConsentBox } from "@/components/pair/pair-consent-box";
import { PairJoinForm } from "@/components/pair/pair-forms";
import { PageFallback } from "@/components/ui/page-fallback";
import { buttonPrimary, buttonSecondary, pageNarrow } from "@/components/ui/styles";
import { peekPairInvite, type InvitePeek } from "@/lib/services/pair-service";
import { isAuthConfigured } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { pairDeps } from "@/server/pair";

export const metadata: Metadata = { title: "리포트 궁합 초대 · ME:U 미유", robots: { index: false, follow: false } };

const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

const CLOSED: Record<"taken" | "expired" | "closed" | "not-found" | "not-open" | "db-not-ready", { title: string; body: string }> = {
  taken: { title: "이미 연결된 초대예요", body: "다른 분이 이 초대를 이미 연결했어요. 초대한 분께 새 링크를 부탁해 주세요." },
  expired: { title: "초대 유효 기간이 지났어요", body: "초대한 분께 새 링크를 부탁해 주세요." },
  closed: { title: "끊어진 초대예요", body: "초대한 분이 연결을 끊었어요. 필요하면 새 링크를 부탁해 주세요." },
  "not-found": { title: "초대를 찾을 수 없어요", body: "링크가 잘못됐거나 지워졌어요. 초대한 분께 링크를 다시 받아 주세요." },
  "not-open": { title: "리포트 궁합은 아직 준비 중이에요", body: "이용할 수 있게 되면 이 링크로 다시 들어와 주세요." },
  "db-not-ready": { title: "리포트 궁합을 준비하고 있어요", body: "잠시 뒤에 다시 열어 주세요." },
};

/**
 * 리포트 궁합 초대 링크 화면(초대받은 사람) — 초대한 사람의 닉네임 말고는 아무것도 보이지 않는다.
 * 로그인 → 내 가장 최근 분석 결과로 동의하고 연결. 내 분석 결과가 없으면 무료 분석을 먼저 마친 뒤 이 링크를 다시 연다.
 */
export default function PairJoinPage({ params }: PageProps<"/pair/join/[token]">) {
  return (
    <main className="bg-page pb-20">
      <Suspense fallback={<PageFallback text="초대를 확인하고 있어요." className={`${pageNarrow} py-16`} tall />}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${pageNarrow} py-12 md:py-16`}>
      <h1 className="text-[24px] leading-snug font-bold tracking-tight">{title}</h1>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

async function Content({ params }: Pick<PageProps<"/pair/join/[token]">, "params">) {
  await connection();
  const { token } = await params;
  const here = `/pair/join/${token}`;
  if (!TOKEN.test(token) || !isAuthConfigured()) return <Frame title={CLOSED["not-found"].title}><p className="text-[15px] leading-[1.75] text-ink-2">{CLOSED["not-found"].body}</p></Frame>;
  const member = await getMember();
  if (!member) {
    return (
      <Frame title="리포트 궁합 초대가 왔어요">
        <p className="text-[15px] leading-[1.75] text-ink-2">초대를 확인하려면 로그인이 필요해요. 로그인하면 이 화면으로 돌아와요.</p>
        <LoginOptions next={here} />
      </Frame>
    );
  }
  if (member.needsConsent) redirect(consentPath(here));
  const peek: InvitePeek = await peekPairInvite(pairDeps(), { token, userId: member.userId });
  if (peek.kind === "mine" || peek.kind === "joined") redirect(`/pair/${peek.pairId}`);
  if (peek.kind !== "open") {
    const c = CLOSED[peek.kind];
    return (
      <Frame title={c.title}>
        <p className="text-[15px] leading-[1.75] text-ink-2">{c.body}</p>
        <Link href="/pair" className={buttonSecondary}>
          리포트 궁합 안내 보기
        </Link>
      </Frame>
    );
  }
  return (
    <Frame title={`${peek.inviterNickname} 님이 리포트 궁합에 초대했어요`}>
      <p className="text-[15px] leading-[1.75] text-ink-2">두 사람이 각자 분석 결과를 연결하는 데 동의하면, 같은 영역에서 서로 어떻게 다른지 · 어떻게 맞춰 갈지를 읽어 드려요. 동의는 언제든 철회할 수 있어요.</p>
      <PairConsentBox />
      {peek.myAssessment ? (
        <PairJoinForm token={token} myName={peek.myAssessment.nickname} />
      ) : (
        <div className="space-y-3">
          <p className="text-[15px] leading-[1.75] text-ink-2">연결하려면 내 분석 결과가 필요해요. 무료 분석을 마친 뒤 이 링크를 다시 열어 주세요.</p>
          <Link href="/analyze" className={buttonPrimary}>
            무료로 내 사주 보기
          </Link>
        </div>
      )}
    </Frame>
  );
}
