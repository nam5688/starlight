import { notFound, redirect } from "next/navigation";
import { LoginOptions } from "@/components/auth/login-options";
import { DeletedRecordNotice } from "@/components/results/deleted-record";
import { ArchivedRoom } from "@/components/talk/archived-room";
import { talkRoomPath } from "@/components/talk/room-paths";
import { LockedRoom } from "@/components/talk/locked-room";
import { TalkView } from "@/components/talk/talk-view";
import { pageNarrow } from "@/components/ui/styles";
import { CONCERN_RECORDS } from "@/lib/config/product";
import { isSimpleRoom } from "@/lib/report/chat/quota";
import { ROOM_ORDER, roomAvailable, roomSaveKey, type RoomId } from "@/lib/report/reading/talk-room";
import type { TalkModel } from "@/lib/report/reading/talk";
import { getResultView } from "@/lib/services/report-service";
import type { TranscriptLine } from "@/lib/report/reading/talk-transcript";
import { listSavedRoomKeys, loadTalkRoom, loadTranscripts, roomEpochOf } from "@/lib/services/talk-service";
import { chatStateFor } from "@/server/chat";
import { isAuthConfigured } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { now, readRepository } from "@/server/services";
import { dayKey, seoulDate } from "@/lib/saju/interpret/day-plain";
import { ownedState, roomModelFor, viewTier, type OwnedState } from "@/server/talk-model";

const ORDER_NUMBER = /^[A-Za-z0-9_-]{6,64}$/;

/** 주소의 paid(유료 질문 결제를 마치고 돌아왔다는 표시, 주문번호) — 모양이 맞을 때만 쓴다. 이 값은 화면이 질문을 이어서 보낼지 정하는 데만 쓰고 권한 판단에는 쓰지 않는다 */
export const paidOf = (query: Record<string, string | string[] | undefined>): string | null => {
  const v = query.paid;
  return typeof v === "string" && ORDER_NUMBER.test(v) ? v : null;
};

/**
 * 대화로 풀어보기 — 구매해 준비된 개인 통합 리포트(읽기 구조)는 저장된 글을 풀이로 쓰고, 그 밖의 경우(무료 분석만 마쳤거나 리포트를 준비 중)는 무료 맛보기로 이야기한다.
 * 어느 쪽이든 새 글을 쓰는 AI를 부르지 않는다. 방마다 새 대화로 시작한다.
 */
export async function TalkRoomContent({ id, room, paid = null }: { id: string; room: RoomId; paid?: string | null }) {
  const here = talkRoomPath(id, room);
  if (!isAuthConfigured()) notFound();
  const member = await getMember();
  if (!member) {
    return (
      <div className={`${pageNarrow} py-14 md:py-20`}>
        <h1 className="text-[24px] font-bold tracking-tight">로그인이 필요해요</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">저장된 결과는 본인만 볼 수 있어요. 로그인해 주세요.</p>
        <div className="mt-8">
          <LoginOptions next={here} />
        </div>
      </div>
    );
  }
  if (member.needsConsent) redirect(consentPath(here));

  // 로그인한 사용자 권한으로 조회 — 다른 회원의 결과는 DB 접근 정책에서도 걸러진다
  const view = await getResultView(await readRepository(), { userId: member.userId, assessmentId: id });
  if (!view) notFound();
  const { assessment } = view;
  const created = new Date(assessment.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  const roomHrefs = Object.fromEntries(ROOM_ORDER.map((r) => [r, talkRoomPath(id, r)]));
  const repo = await readRepository();
  // 리포트를 삭제한 기록 — 채팅방은 그대로 열리고, 삭제 전에 오간 대화는 읽기용으로 보인다(리포트 · 구매 안내는 없다)
  // 삭제 범위 확대(29번)로 삭제한 기록은 채팅방 · 지난 대화까지 지웠으므로 열 방이 없다 — 삭제했다는 안내만 보인다
  if (view.purged) return <DeletedRecordNotice assessmentId={id} purged />;
  if (view.deleted) return <DeletedRecordRoom view={view} userId={member.userId} id={id} room={room} paid={paid} created={created} roomHrefs={roomHrefs} />;
  /** 서버에 저장된 이 방의 대화와 저장된 방 목록 — 폰을 바꿔도 이어 본다 */
  const persistFor = async (model: TalkModel) => ({
    assessmentId: id,
    initial: await loadTalkRoom(repo, { userId: member.userId, assessmentId: id, roomKey: roomSaveKey(model, room) }).catch(() => []),
    savedKeys: await listSavedRoomKeys(repo, { userId: member.userId, assessmentId: id }).catch(() => []),
  });

  // 구매해 준비된 개인 통합 리포트(읽기 구조)는 저장된 글을 풀이로 쓰고, 그 밖에는 무료 맛보기(잠긴 내용 없음)로 이야기한다
  const tier = viewTier(view);
  // 방마다 무료 질문 수 · 결제해 둔 질문을 센다 — 오늘의 운세 방은 날짜별 방이라 오늘 날짜로 센다
  const roomKey = room === "daily" ? `daily:${seoulDate(now())}` : room;
  const chat = await chatStateFor(tier, member.userId, room, roomKey);
  const { model } = roomModelFor(view, { paid: chat, free: chat }, room);
  if (tier === "paid") {
    if (!roomAvailable(model, room)) notFound();
    const reportContent = view.report?.content;
    const sample = !!reportContent && "source" in reportContent && reportContent.source === "sample";
    return (
      <TalkView
        key={paid ?? "-"}
        payReturn={paid !== null}
        model={model}
        room={room}
        scope={id}
        dateLabel={created}
        reportHref={`/results/${id}`}
        dataHref={`/results/${id}#r-data`}
        contextHref={CONCERN_RECORDS.visible ? `/results/${id}/context` : undefined}
        roomHrefs={roomHrefs}
        persist={await persistFor(model)}
        badge={{ label: sample ? "개발용 샘플" : "내 리포트", text: `저장된 리포트 · 검사일 ${created}${sample ? " · 개발용 샘플" : ""}` }}
      />
    );
  }

  const owned = Boolean(view.paidOrder);
  // 무료 리포트로는 열리지 않는 방(올해의 흐름 · 결혼 · 진로 · 재무)은 심층 리포트로 이어 주는 안내만 보인다
  if (!isSimpleRoom(room)) return <LockedRoom room={room} ownedState={ownedState(view)} buyHref={owned ? `/results/${id}` : `/results/${id}#r-purchase`} backHref={`/results/${id}`} />;
  if (!roomAvailable(model, room)) notFound();
  return (
    <TalkView
      key={paid ?? "-"}
      payReturn={paid !== null}
      model={model}
      room={room}
      scope={id}
      dateLabel={created}
      reportHref={`/results/${id}`}
      dataHref={`/results/${id}`}
      roomHrefs={roomHrefs}
      persist={await persistFor(model)}
      badge={ownedState(view) ? ownedNotReadyBadge(ownedState(view)!, created) : { label: "무료 맛보기", text: `무료 분석으로 만든 맛보기예요 · 검사일 ${created}. 이어지는 깊은 풀이는 리포트에서 볼 수 있어요.` }}
    />
  );
}

const RESTRICTED_REASON =
  "리포트를 삭제한 기록이라 이 방에서는 새 대화를 이어 갈 수 없어요. 이 방의 풀이는 삭제한 리포트의 글에서 가져오던 것이라서요. 지난 대화는 아래에서 그대로 읽을 수 있어요.";

/**
 * 리포트를 삭제한 기록의 채팅방. 삭제 전에 이 방에 이미 표시된 말(읽기용 대화 기록)을 위쪽에 읽기 전용으로 보이고, 이어 갈 수 있는 방(무료 리포트로 열리는 방)은 그 아래에서 새 대화를 계속한다.
 * 리포트 글로 풀이를 가져오던 방(올해의 흐름 · 결혼 · 진로 · 재무)은 지난 대화만 읽을 수 있고 새 대화는 이어 갈 수 없는 이유를 알린다. 리포트 · 결과 화면 · 구매 안내로 가는 링크는 없다.
 */
async function DeletedRecordRoom({ view, userId, id, room, paid, created, roomHrefs }: { view: NonNullable<Awaited<ReturnType<typeof getResultView>>>; userId: string; id: string; room: RoomId; paid: string | null; created: string; roomHrefs: Record<string, string> }) {
  const repo = await readRepository();
  const transcripts = await loadTranscripts(repo, { userId, assessmentId: id }).catch(() => []);
  const today = seoulDate(now());
  const roomKey = room === "daily" ? `daily:${dayKey(today)}` : room;
  // 오늘의 한 장은 날짜별 방이라, 오늘 것이 없으면 가장 최근에 남은 날짜의 대화를 읽는다
  const found = room === "daily" ? [...transcripts.filter((t) => t.roomKey.startsWith("daily:"))].sort((a, b) => b.roomKey.localeCompare(a.roomKey))[0] : transcripts.find((t) => t.roomKey === roomKey);
  const lines: TranscriptLine[] = found?.lines ?? [];
  const mainHref = talkRoomPath(id, "main");
  if (!isSimpleRoom(room)) return <ArchivedRoom room={room} lines={lines} reason={RESTRICTED_REASON} backHref="/my" talkHref={mainHref} />;
  const chat = await chatStateFor("free", userId, room, roomKey);
  const { model } = roomModelFor(view, { paid: chat, free: chat }, room);
  if (!roomAvailable(model, room)) return <ArchivedRoom room={room} lines={lines} reason="이 방은 지금 새 대화를 이어 갈 수 없어요. 지난 대화는 아래에서 읽을 수 있어요." backHref="/my" talkHref={mainHref} />;
  return (
    <TalkView
      key={paid ?? "-"}
      payReturn={paid !== null}
      model={model}
      room={room}
      scope={id}
      dateLabel={created}
      reportHref="/my"
      dataHref="/my"
      roomHrefs={roomHrefs}
      persist={{
        assessmentId: id,
        initial: await loadTalkRoom(repo, { userId, assessmentId: id, roomKey: roomSaveKey(model, room) }).catch(() => []),
        savedKeys: await listSavedRoomKeys(repo, { userId, assessmentId: id }).catch(() => []),
        epoch: roomEpochOf(true, transcripts, roomKey),
      }}
      archive={lines.length > 0 ? { lines } : undefined}
      badge={{ label: "삭제한 기록", text: `리포트를 삭제한 기록이에요 · 검사일 ${created}. 리포트 글은 지워졌고 채팅은 그대로 이어져요. 지난 대화는 읽기만 할 수 있어요.` }}
    />
  );
}

/** 구매한 리포트가 있는데 이 방에서 풀이로 쓰지 못할 때의 이름표 — 이유를 사실대로 알린다 (이유는 server/talk-model.ts의 ownedState) */
function ownedNotReadyBadge(state: OwnedState, created: string): { label: string; text: string } {
  if (state === "failed") return { label: "리포트 만들기 실패", text: `검사일 ${created} · 리포트를 만들지 못했어요. 결과 화면에서 다시 만들 수 있어요. 지금은 무료 맛보기로 이야기해요.` };
  if (state === "old-format") {
    return {
      label: "예전 형식 리포트",
      text: `검사일 ${created} · 예전 형식으로 저장된 리포트라 같은 방에서 풀이를 이어 볼 수 없어요. 지금은 무료 맛보기로 이야기해요. 새 형식 리포트는 결과 화면에서 다시 받을 수 있어요.`,
    };
  }
  return { label: "리포트 준비 중", text: `검사일 ${created} · 리포트를 준비하고 있어요. 준비되면 같은 방에서 전체 풀이를 이어 볼 수 있어요.` };
}
