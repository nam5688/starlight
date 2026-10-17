import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoginOptions } from "@/components/auth/login-options";
import { PairConsentBox } from "@/components/pair/pair-consent-box";
import { PairInviteForm } from "@/components/pair/pair-forms";
import { PageFallback } from "@/components/ui/page-fallback";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonPrimary, pageNarrow, textLink } from "@/components/ui/styles";
import { formatKrw, PAIR_COMPAT } from "@/lib/config/product";
import { listMyPairs, latestUsableAssessment, type MyPair } from "@/lib/services/pair-service";
import { isAuthConfigured } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { pairDeps } from "@/server/pair";

export const metadata: Metadata = { title: "리포트 궁합 · ME:U 미유", description: "각자의 분석 결과를 서로 동의한 뒤 연결해, 두 사람의 차이와 맞춰 갈 방법을 읽어 드려요.", robots: { index: false, follow: false } };

const STATUS: Record<MyPair["status"], string> = { invited: "상대를 기다리는 중", linked: "연결됨", unlinked: "연결이 끊김" };
const REPORT: Record<MyPair["report"], string> = { none: "아직 결제 전", generating: "만드는 중", failed: "만들지 못함 · 다시 만들 수 있어요", ready: "읽을 수 있어요", blocked: "열람이 막혔어요" };

/**
 * 리포트 궁합 입구 — 서비스 소개 · 내 쌍 목록 · 새 초대 만들기. 판매 스위치가 꺼져 있으면 "준비 중"으로만 안내하고 새 초대는 받지 않는다(이미 있는 쌍의 열람은 그대로).
 */
export default function PairHubPage() {
  return (
    <main className="bg-page pb-20">
      <Suspense fallback={<PageFallback text="리포트 궁합을 불러오고 있어요." className={`${pageNarrow} py-16`} tall />}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  await connection();
  const deps = pairDeps();
  const open = deps.saleOpen === true;
  const member = isAuthConfigured() ? await getMember() : null;
  if (member?.needsConsent) redirect(consentPath("/pair"));
  const mine = member ? await listMyPairs(deps, member.userId).catch(() => [] as MyPair[]) : [];
  const latest = member && open ? await latestUsableAssessment(deps.repo, member.userId).catch(() => null) : null;

  return (
    <div className={`${pageNarrow} pt-8 md:pt-12`}>
      <p className="flex items-center gap-2 text-[13px] font-semibold text-accent">
        리포트 궁합 <StatusBadge>{open ? "이용 가능" : "준비 중"}</StatusBadge>
      </p>
      <h1 className="mt-2 text-[26px] leading-snug font-bold tracking-tight md:text-[32px]">둘의 차이를 알고, 맞춰 가는 법까지</h1>
      <p className="mt-3 text-[16px] leading-[1.75] text-ink-2">
        두 사람의 사주에, 각자가 직접 답한 성향 · 관계 반응에서 뚜렷하게 나온 방향을 같은 영역끼리 비교해 읽어요. 서로 동의한 경우에만 연결하고, 상대의 문항별 답이나 개인 리포트는 보이지 않아요.
      </p>
      <ol className="mt-6 space-y-2 text-[15px] leading-[1.7] text-ink-2">
        <li>1. 두 사람이 각자 무료 분석을 마쳐요.</li>
        <li>2. 한 사람이 초대 링크를 만들고, 상대가 링크로 들어와 동의하면 연결돼요.</li>
        <li>3. 둘 중 한 사람이 {formatKrw(PAIR_COMPAT.priceKrw)}을 한 번 결제하면 두 사람이 같은 글을 읽어요.</li>
      </ol>
      <p className="mt-4 text-[13px] leading-[1.7] text-ink-3">결과는 재미 · 참고용이에요. 두 사람의 실제 마음이나 관계의 결과를 알려 주지 않고, 어떤 일이 일어난다는 예측이 아니에요. 사주 궁합(두 사람의 사주만)과 같은 계산 위에 응답 비교가 더해진 별도 서비스예요.</p>

      {!open && <p className="mt-8 rounded-xl bg-mist px-4 py-3 text-[15px] leading-[1.7] text-ink-2">리포트 궁합은 지금 준비 중이에요. 무료 간단 궁합은 <Link href="/compat" className={textLink}>여기</Link>에서 볼 수 있어요.</p>}

      {member && mine.length > 0 && (
        <section aria-labelledby="pair-mine" className="mt-12">
          <h2 id="pair-mine" className="text-[18px] font-bold">
            내 리포트 궁합
          </h2>
          <ul className="mt-4 space-y-3">
            {mine.map((p) => (
              <li key={p.pairId}>
                <Link href={`/pair/${p.pairId}`} className="block rounded-xl bg-canvas px-4 py-3 shadow-soft hover:bg-mist">
                  <span className="block text-[16px] font-semibold text-ink">{p.otherNickname ? `${p.otherNickname} 님과` : "상대를 기다리는 초대"}</span>
                  <span className="mt-1 block text-[14px] text-ink-3">
                    {STATUS[p.status]} · {REPORT[p.report]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {open && (
        <section aria-labelledby="pair-new" className="mt-12">
          <h2 id="pair-new" className="text-[18px] font-bold">
            새 초대 만들기
          </h2>
          <div className="mt-4 space-y-4">
            {!isAuthConfigured() ? null : !member ? (
              <>
                <p className="text-[15px] leading-[1.75] text-ink-2">초대 링크는 로그인한 뒤 내 분석 결과로 만들어요.</p>
                <LoginOptions next="/pair" />
              </>
            ) : !latest ? (
              <>
                <p className="text-[15px] leading-[1.75] text-ink-2">내 분석 결과가 필요해요. 무료 분석을 먼저 마쳐 주세요.</p>
                <Link href="/analyze" className={buttonPrimary}>
                  무료로 내 사주 보기
                </Link>
              </>
            ) : (
              <>
                <PairConsentBox />
                <PairInviteForm assessmentId={latest.id} myName={latest.nickname} />
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
