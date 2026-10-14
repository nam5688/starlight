import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { deleteAllChatSummariesAction } from "@/app/my/chats/actions";
import { LoginOptions } from "@/components/auth/login-options";
import { DeleteStep } from "@/components/my/delete-step";
import { formatDateTime } from "@/components/ui/format";
import { PageFallback } from "@/components/ui/page-fallback";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { ROOM_COPY } from "@/lib/report/reading/talk-room";
import { listSavedSummaries } from "@/lib/services/summary-service";
import { isAuthConfigured } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { readRepository } from "@/server/services";

export const metadata: Metadata = { title: "저장한 채팅 요약 · ME:U 미유", robots: { index: false } };

export default function SavedChatsPage({ searchParams }: PageProps<"/my/chats">) {
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <p className="text-[14px]">
        <Link href="/my" className={textLink}>
          MY
        </Link>
      </p>
      <h1 className="mt-2 text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">{ROOM_COPY.summary.pageTitle}</h1>
      <p className="mt-1.5 text-[14px] leading-[1.65] text-ink-2">{ROOM_COPY.summary.pageLead}</p>
      <Suspense fallback={<PageFallback className="mt-6" />}>
        <SavedChatsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function SavedChatsContent({ searchParams }: Pick<PageProps<"/my/chats">, "searchParams">) {
  await connection();
  if (!isAuthConfigured()) return <p className="mt-8 text-[15px] text-ink-2">로그인이 아직 설정되지 않았어요.</p>;
  const member = await getMember();
  if (!member) {
    return (
      <div className="mt-8">
        <LoginOptions next="/my/chats" />
      </div>
    );
  }
  if (member.needsConsent) redirect(consentPath("/my/chats"));

  const query = await searchParams;
  const groups = await listSavedSummaries(await readRepository(), member.userId);
  const copy = ROOM_COPY.summary;
  return (
    <div className="mt-6 space-y-10">
      {query.done === "all" && (
        <p role="status" className="rounded-2xl bg-positive-soft px-4 py-3 text-[15px] leading-[1.7] text-positive">
          {copy.deletedAll}
        </p>
      )}
      {query.error && (
        <p role="alert" className="rounded-2xl bg-caution-soft px-4 py-3 text-[15px] leading-[1.7] text-caution">
          지우지 못했어요. 잠시 뒤 다시 시도해 주세요.
        </p>
      )}

      {groups.length === 0 ? (
        <p className="rounded-2xl bg-canvas px-4 py-8 text-[15px] leading-[1.7] text-ink-2 shadow-soft">{copy.empty}</p>
      ) : (
        <ul className="space-y-3" aria-label="채팅방 카테고리">
          {groups.map((g) => (
            <li key={g.room}>
              <Link href={`/my/chats/${g.room}`} className="block rounded-2xl bg-canvas px-4 py-4 shadow-soft transition-colors hover:bg-accent-soft/60">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-[17px] font-bold">{g.label}</span>
                  <span className="text-[14px] font-semibold text-accent-strong tabular-nums">{g.entries.length}개 저장</span>
                </span>
                <span className="mt-0.5 block text-[13px] text-ink-3">
                  {g.mode === "미유" ? "기본 미유" : g.mode} · 가장 최근 {formatDateTime(g.entries[0].createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="chats-delete-all">
        <h2 id="chats-delete-all" className="sr-only">
          대화 기록 지우기
        </h2>
        <DeleteStep action={deleteAllChatSummariesAction} label={copy.deleteAll} confirmLabel={copy.deleteAll}>
          {copy.deleteAllNote}
        </DeleteStep>
      </section>
    </div>
  );
}
