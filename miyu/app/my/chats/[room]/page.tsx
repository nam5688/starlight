import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { deleteChatSummaryAction } from "@/app/my/chats/actions";
import { LoginOptions } from "@/components/auth/login-options";
import { DeleteStep } from "@/components/my/delete-step";
import { formatDateTime } from "@/components/ui/format";
import { PageFallback } from "@/components/ui/page-fallback";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { ROOM_COPY, ROOMS } from "@/lib/report/reading/talk-room";
import { listSavedSummaries } from "@/lib/services/summary-service";
import { isAuthConfigured } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { readRepository } from "@/server/services";

export const metadata: Metadata = { title: "저장한 채팅 요약 · ME:U 미유", robots: { index: false } };

export default function SavedRoomChatsPage({ params, searchParams }: PageProps<"/my/chats/[room]">) {
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <p className="flex flex-wrap gap-x-2 text-[14px]">
        <Link href="/my" className={textLink}>
          MY
        </Link>
        <span aria-hidden="true">›</span>
        <Link href="/my/chats" className={textLink}>
          {ROOM_COPY.summary.pageTitle}
        </Link>
      </p>
      <Suspense fallback={<PageFallback className="mt-6" />}>
        <SavedRoomContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function SavedRoomContent({ params, searchParams }: Pick<PageProps<"/my/chats/[room]">, "params" | "searchParams">) {
  await connection();
  const { room } = await params;
  if (!(room in ROOMS)) notFound();
  if (!isAuthConfigured()) return <p className="mt-8 text-[15px] text-ink-2">로그인이 아직 설정되지 않았어요.</p>;
  const member = await getMember();
  if (!member) {
    return (
      <div className="mt-8">
        <LoginOptions next={`/my/chats/${room}`} />
      </div>
    );
  }
  if (member.needsConsent) redirect(consentPath(`/my/chats/${room}`));

  const query = await searchParams;
  const group = (await listSavedSummaries(await readRepository(), member.userId)).find((g) => g.room === room);
  const copy = ROOM_COPY.summary;
  const def = ROOMS[room as keyof typeof ROOMS];
  return (
    <div className="mt-2">
      <h1 className="text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">{def.label}</h1>
      <p className="mt-0.5 text-[14px] text-ink-3">{def.mode === "미유" ? "기본 미유" : def.mode} · 저장한 날짜가 최근인 것부터 보여요</p>
      {query.done === "one" && (
        <p role="status" className="mt-5 rounded-2xl bg-positive-soft px-4 py-3 text-[15px] leading-[1.7] text-positive">
          {copy.deleted}
        </p>
      )}
      {query.error && (
        <p role="alert" className="mt-5 rounded-2xl bg-caution-soft px-4 py-3 text-[15px] leading-[1.7] text-caution">
          지우지 못했어요. 잠시 뒤 다시 시도해 주세요.
        </p>
      )}
      {!group ? (
        <p className="mt-6 rounded-2xl bg-canvas px-4 py-8 text-[15px] leading-[1.7] text-ink-2 shadow-soft">{copy.empty}</p>
      ) : (
        <ol className="mt-6 space-y-6">
          {group.entries.map((e) => (
            <li key={e.id} className="rounded-3xl bg-canvas px-5 py-5 shadow-soft">
              <h2 className="text-[16px] font-bold tabular-nums">{formatDateTime(e.createdAt)} 저장</h2>
              {e.items.read.length > 0 && (
                <p className="mt-2 text-[13px] leading-[1.7] text-ink-3">
                  {copy.readLabel} · {e.items.read.join(" · ")}
                </p>
              )}
              {e.items.qa.length > 0 && (
                <ul className="mt-3 space-y-3.5">
                  {e.items.qa.map((p, i) => (
                    <li key={i}>
                      <p className="text-[13px] font-semibold text-accent-strong">질문</p>
                      <p className="text-[15px] leading-[1.65] font-medium">{p.q}</p>
                      <p className="mt-1.5 text-[13px] font-semibold text-ink-3">답변</p>
                      <p className="text-[15px] leading-[1.65] text-ink-2">{p.a}</p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3">
                <DeleteStep action={deleteChatSummaryAction.bind(null, room, e.id)} label={copy.deleteOne} confirmLabel="지우기" />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
