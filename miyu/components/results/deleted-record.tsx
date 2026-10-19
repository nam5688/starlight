import Link from "next/link";
import { talkRoomPath } from "@/components/talk/room-paths";
import { buttonPrimary, buttonSecondary, pageNarrow } from "@/components/ui/styles";

/**
 * 사용자가 "기록 삭제"한 검사 결과의 주소로 들어왔을 때 — 리포트 · 미리보기 · 분석 자료는 지워졌으므로 보이지 않고, 구매나 다시 만들기를 권하지도 않는다.
 * 채팅방(지난 대화는 읽기 전용)과 새 분석으로만 안내한다.
 */
export function DeletedRecordNotice({ assessmentId }: { assessmentId: string }) {
  return (
    <div className={`${pageNarrow} py-14 md:py-20`} data-testid="deleted-record">
      <h1 className="text-[24px] font-bold tracking-tight">삭제한 기록이에요</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
        이 결과의 리포트는 직접 삭제해서 더 볼 수 없어요. 삭제한 글은 되돌릴 수 없고, 이미 결제한 리포트라도 다시 만들거나 다시 구매하지 않아요.
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-3">채팅방과 지난 대화(읽기 전용), 남은 질문권, 주문 · 결제 기록은 그대로 남아 있어요.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href={talkRoomPath(assessmentId, "main")} className={buttonPrimary}>
          채팅방 열기
        </Link>
        <Link href="/my" className={buttonSecondary}>
          MY로 가기
        </Link>
        <Link href="/analyze" className={buttonSecondary}>
          새 분석 시작하기
        </Link>
      </div>
    </div>
  );
}
