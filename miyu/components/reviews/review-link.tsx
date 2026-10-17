import Link from "next/link";
import { textLink } from "@/components/ui/styles";
import type { ReviewKind } from "@/lib/commerce/reviews";

/**
 * 구매한 리포트 · 궁합 화면 아래의 작은 후기 입구 — 누르면 MY의 후기 화면에서 이 이용 건의 작성 칸이 펼쳐진다. 기존 레이아웃은 바꾸지 않고 한 줄만 더한다.
 * 좋은 후기를 부탁하는 문구가 아니다 — 좋았던 점도 아쉬웠던 점도 같다.
 */
export function ReviewLink({ kind, subjectRef }: { kind: ReviewKind; subjectRef: string }) {
  return (
    <p className="text-[14px] leading-[1.65] text-ink-3">
      이용해 보셨다면 어땠는지 후기를 남겨 주세요. 좋았던 점도 아쉬웠던 점도 괜찮아요.{" "}
      <Link href={`/my/reviews?kind=${kind}&ref=${subjectRef}#write-${subjectRef}`} className={textLink}>
        후기 남기기
      </Link>
    </p>
  );
}
