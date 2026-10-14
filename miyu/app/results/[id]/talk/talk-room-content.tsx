import { notFound, redirect } from "next/navigation";
import { KakaoLoginForm } from "@/components/auth/kakao-login-button";
import { TalkView } from "@/components/talk/talk-view";
import { pageNarrow } from "@/components/ui/styles";
import { isReadingReport } from "@/lib/report/generator";
import { buildTalkModel } from "@/lib/report/reading/talk";
import { ROOM_ORDER, roomAvailable, type RoomId } from "@/lib/report/reading/talk-room";
import { getResultView } from "@/lib/services/report-service";
import { isAuthConfigured } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { readRepository } from "@/server/services";

/** 방(상담 모드)의 주소 — 기본 방은 /talk, 나머지는 /talk/방이름 */
export const talkRoomPath = (id: string, room: RoomId) => (room === "main" ? `/results/${id}/talk` : `/results/${id}/talk/${room}`);

/**
 * 구매해 준비된 개인 통합 리포트(읽기 구조)만 대화로 풀어 볼 수 있다 — 저장된 글을 나눠서 보여 줄 뿐 AI를 부르지 않는다.
 * 방마다 새 대화로 시작하고, 이어 보기는 이 기기의 브라우저에만 남는다.
 */
export async function TalkRoomContent({ id, room }: { id: string; room: RoomId }) {
  const here = talkRoomPath(id, room);
  if (!isAuthConfigured()) notFound();
  const member = await getMember();
  if (!member) {
    return (
      <div className={`${pageNarrow} py-14 md:py-20`}>
        <h1 className="text-[24px] font-bold tracking-tight">로그인이 필요합니다</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">저장된 결과는 본인만 볼 수 있습니다. 카카오로 로그인해 주세요.</p>
        <div className="mt-8">
          <KakaoLoginForm next={here} />
        </div>
      </div>
    );
  }
  if (member.needsConsent) redirect(consentPath(here));

  // 로그인한 사용자 권한으로 조회 — 다른 회원의 결과는 DB 접근 정책에서도 걸러진다
  const view = await getResultView(await readRepository(), { userId: member.userId, assessmentId: id });
  if (!view) notFound();
  const { assessment, report } = view;
  // 구매 전 · 생성 중 · 이전 형식의 리포트는 대화로 풀지 않고 결과 화면으로 돌려보낸다
  if (!view.paidOrder || report?.status !== "ready" || !report.content || !isReadingReport(report.content)) redirect(`/results/${id}`);

  const content = report.content;
  const model = buildTalkModel(content);
  if (!roomAvailable(model, room)) notFound();
  const created = new Date(assessment.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  const sample = content.source === "sample";
  return (
    <TalkView
      model={model}
      room={room}
      scope={id}
      dateLabel={created}
      reportHref={`/results/${id}`}
      dataHref={`/results/${id}#r-data`}
      contextHref={`/results/${id}/context`}
      roomHrefs={Object.fromEntries(ROOM_ORDER.map((r) => [r, talkRoomPath(id, r)]))}
      badge={{ label: sample ? "개발용 샘플" : "내 리포트", text: `저장된 리포트 · 검사일 ${created}${sample ? " · 개발용 샘플" : ""}` }}
    />
  );
}
