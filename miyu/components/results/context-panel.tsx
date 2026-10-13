import Link from "next/link";
import { buttonSecondary, textLink } from "@/components/ui/styles";
import { CONCERN_REPORT, formatKrw } from "@/lib/config/product";
import { filledFields, topicLabel, type PersonalContext } from "@/lib/personalization/context";

/**
 * 결과 화면의 "내 고민 자세히 알려주기" 안내 (선택 단계).
 * 적은 내용 자체는 여기 다시 보여 주지 않고, 주제와 적은 항목만 보여 준다 (보기 · 고치기 · 새 리포트 발급은 나의 고민 기록소).
 */
export function ContextPanel({
  assessmentId,
  context,
  usesContext,
  reportReady,
}: {
  assessmentId: string;
  context: PersonalContext | null;
  usesContext: boolean;
  reportReady: boolean;
}) {
  const href = `/results/${assessmentId}/context`;
  if (reportReady) {
    return (
      <p className="text-[14px] leading-relaxed text-ink-3">
        내 고민 자세히 알려주기: {context ? topicLabel(context.topic) : "작성 기록 없음"} ·{" "}
        <Link href={href} className={textLink}>
          나의 고민 기록소
        </Link>
        <span className="block">
          고민을 적어 저장한 뒤 ‘이 고민으로 새 리포트 발급’ ({formatKrw(CONCERN_REPORT.priceKrw)})을 따로 누르면, 기존 리포트는 그대로 두고 새 리포트가 별도로 만들어집니다.
        </span>
      </p>
    );
  }
  return (
    <section aria-labelledby="r-context" className="border-y border-line py-6">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 id="r-context" className="text-[18px] font-bold tracking-tight">
          내 고민 자세히 알려주기
        </h2>
        <span className="text-[14px] text-ink-3">선택</span>
      </div>
      {context ? (
        <>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            반영할 주제: <span className="font-semibold text-ink">{topicLabel(context.topic)}</span>
            {filledFields(context).length > 0 && <> · 적은 항목: {filledFields(context).join(", ")}</>}
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-3">
            {usesContext
              ? "개인 통합 리포트를 만들 때 이 고민에 맞춰 해석의 초점과 예시를 고릅니다. 사주 계산은 바뀌지 않습니다."
              : "지금은 AI 해석 연결 전이라, 개발용 리포트에는 반영되지 않습니다."}
          </p>
          <Link href={href} className={`${buttonSecondary} mt-4`}>
            나의 고민 기록소
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            지금 가장 궁금한 문제나 최근 반복되는 상황을 알려 주시면, 리포트를 만들 때 그 고민에 맞춰 해석의 초점과 예시를 고릅니다. 사주 계산은 바뀌지 않고, 리포트에는 &ldquo;알려 주신 고민까지 반영한 해석&rdquo;으로 표시합니다. 개인 통합 리포트를 받은 뒤에도 고민을 적어 새 리포트를 따로 발급받을 수 있어요.
          </p>
          {!usesContext && <p className="mt-1 text-[14px] text-ink-3">지금은 AI 해석 연결 전이라, 개발용 리포트에는 반영되지 않습니다.</p>}
          <p className="mt-3 text-[15px] font-semibold">작성 기록 없음</p>
          <Link href={`${href}?edit=1`} className={`${buttonSecondary} mt-3`}>
            작성하기
          </Link>
        </>
      )}
    </section>
  );
}
