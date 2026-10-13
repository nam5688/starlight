import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { KakaoLoginForm } from "@/components/auth/kakao-login-button";
import { ConcernIssuePanel, ISSUE_NOTICE } from "@/components/results/concern-issue-panel";
import { ConcernRecords } from "@/components/results/concern-records";
import { ContextDelete, ContextForm } from "@/components/results/context-form";
import { PageFallback } from "@/components/ui/page-fallback";
import { buttonPrimary, buttonSecondary, textLink } from "@/components/ui/styles";
import { formatDateTime } from "@/components/ui/format";
import { CONTEXT_FIELDS, topicLabel } from "@/lib/personalization/context";
import { getConcernWorkspace } from "@/lib/services/concern-service";
import { isAuthConfigured } from "@/server/env";
import { issuingAvailability } from "@/server/concern";
import { consentPath, getMember } from "@/server/member";
import { readRepository } from "@/server/services";

export const metadata: Metadata = {
  title: "나의 고민 기록소 · ME:U 미유",
  robots: { index: false },
};

/** 화면 맨 위에 항상 보이는 안내 — 저장과 발급이 따로이고, 기존 리포트는 바뀌지 않는다 */
const SAVE_VS_ISSUE_NOTICE = "고민을 작성하거나 수정해도 기존 리포트는 바뀌지 않습니다. 저장 후 ‘이 고민으로 새 리포트 발급하기’를 누르면 변경한 내용이 반영됩니다.";

export default function ContextPage({ params, searchParams }: PageProps<"/results/[id]/context">) {
  return (
    <main className="bg-page">
      <div className="mx-auto w-full max-w-[720px] px-5 py-8 md:py-12">
        <Suspense fallback={<PageFallback />}>
          <ContextContent params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function ContextContent({ params, searchParams }: Pick<PageProps<"/results/[id]/context">, "params" | "searchParams">) {
  const { id } = await params;
  const query = await searchParams;
  if (!isAuthConfigured()) notFound();
  const member = await getMember();
  if (!member) {
    return (
      <div>
        <h1 className="text-[24px] font-bold tracking-tight">로그인이 필요합니다</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">적은 내용은 본인만 볼 수 있습니다. 카카오로 로그인해 주세요.</p>
        <div className="mt-8">
          <KakaoLoginForm next={`/results/${id}/context`} />
        </div>
      </div>
    );
  }
  if (member.needsConsent) redirect(consentPath(`/results/${id}/context`));

  // 로그인한 사용자 권한으로 조회 — 다른 회원의 결과 · 적은 내용은 DB 접근 정책에서도 걸러진다
  const workspace = await getConcernWorkspace(await readRepository(), { userId: member.userId, assessmentId: id, issuing: issuingAvailability() });
  if (!workspace) notFound();
  const { context, entries, issue } = workspace;
  const editing = query.edit === "1";
  const saved = query.saved === "1";
  const same = query.saved === "same";
  const deleted = query.deleted === "1";
  const issueNotice = typeof query.issue === "string" ? ISSUE_NOTICE[query.issue] : undefined;
  const redacted = typeof query.redacted === "string" ? Number(query.redacted) : 0;
  const filled = context ? CONTEXT_FIELDS.filter((f) => context[f.id].length > 0) : [];

  return (
    <div>
      <p className="text-[13px] font-semibold text-accent">내 고민 자세히 알려주기</p>
      <h1 className="mt-1.5 text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">나의 고민 기록소</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
        지금 가장 궁금한 문제와 반복되는 상황을 적어 두세요. 같은 사주라도 고민에 따라 더 자세히 봐야 할 부분이 다릅니다. 고민을 저장한 뒤 새 리포트를 발급하면, 그 고민의 상황마다 왜 그런지와 해 볼 선택을 풀어 드립니다.
      </p>

      <p className="mt-6 rounded-lg border border-line bg-mist px-4 py-3 text-[15px] leading-relaxed text-ink-2">{SAVE_VS_ISSUE_NOTICE}</p>

      <div className="mt-4 space-y-3" aria-live="polite">
        {saved && (
          <p role="status" className="rounded-lg bg-accent-soft px-4 py-3 text-[15px] text-accent">
            저장했습니다. 리포트는 아직 만들어지지 않았어요.{redacted > 0 && ` 연락처 · 이메일처럼 보이는 내용 ${redacted}곳을 가려서 저장했습니다.`}
          </p>
        )}
        {same && (
          <p role="status" className="rounded-lg bg-accent-soft px-4 py-3 text-[15px] text-accent">
            바뀐 내용이 없어 그대로 두었습니다.
          </p>
        )}
        {deleted && (
          <p role="status" className="rounded-lg bg-accent-soft px-4 py-3 text-[15px] text-accent">
            적어 둔 고민을 지웠습니다. 이미 발급한 리포트와 고민 기록은 그대로 남아 있습니다.
          </p>
        )}
        {issueNotice && (
          <p role="alert" className="rounded-lg border border-line px-4 py-3 text-[15px] leading-relaxed text-ink">
            {issueNotice}
          </p>
        )}
      </div>

      <section aria-labelledby="ctx-current" className="mt-10">
        <h2 id="ctx-current" className="text-[20px] font-bold tracking-tight">
          지금 적어 둔 고민
        </h2>
        {editing ? (
          <div className="mt-6">
            <ContextForm
              assessmentId={id}
              cancelHref={`/results/${id}/context`}
              initial={
                context
                  ? { topic: context.topic, question: context.question, situation: context.situation, matched: context.matched, differed: context.differed, excerpt: context.excerpt }
                  : null
              }
            />
          </div>
        ) : context ? (
          <div className="mt-4">
            <p className="text-[13px] text-ink-3">마지막으로 쓴 시점 {formatDateTime(context.updatedAt)}</p>
            <p className="mt-2 text-[16px]">
              <span className="text-ink-3">주제 </span>
              <span className="font-semibold">{topicLabel(context.topic)}</span>
            </p>
            {filled.length > 0 ? (
              <dl className="mt-3 space-y-4 border-l-2 border-line pl-4 text-[15px] leading-relaxed">
                {filled.map((f) => (
                  <div key={f.id}>
                    <dt className="text-[14px] font-medium text-ink-3">{f.label}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-ink">{context[f.id]}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-[14px] text-ink-3">주제만 골랐고 적은 글은 없어요.</p>
            )}
            <Link href={`/results/${id}/context?edit=1`} className={`${buttonSecondary} mt-5 w-full sm:w-auto`}>
              수정하기
            </Link>
          </div>
        ) : (
          <div className="mt-4 border-y border-line py-8">
            <p className="text-[17px] font-semibold">작성 기록 없음</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-3">아직 적어 둔 고민이 없어요. 주제만 골라도 되고, 나머지는 적고 싶은 것만 적어 주세요.</p>
            <Link href={`/results/${id}/context?edit=1`} className={`${buttonPrimary} mt-5 w-full sm:w-auto`}>
              작성하기
            </Link>
          </div>
        )}
      </section>

      {!editing && context && (
        <div className="mt-8 space-y-8">
          <ConcernIssuePanel assessmentId={id} issue={issue} />
          <ContextDelete assessmentId={id} />
        </div>
      )}

      <section aria-labelledby="ctx-records" className="mt-12">
        <h2 id="ctx-records" className="text-[20px] font-bold tracking-tight">
          고민 기록과 발급한 리포트
        </h2>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-3">발급할 때마다 그때의 고민이 기록으로 남고, 그 고민을 반영한 리포트가 한 칸씩 쌓입니다. 최근 발급이 위에 있어요.</p>
        <ConcernRecords assessmentId={id} entries={entries} />
      </section>

      <p className="mt-10 text-[15px]">
        <Link href={`/results/${id}`} className={textLink}>
          결과 화면으로 돌아가기
        </Link>
      </p>
    </div>
  );
}
