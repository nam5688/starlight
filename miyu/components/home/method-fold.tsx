import Link from "next/link";
import { ChevronIcon } from "@/components/ui/icons";

/**
 * "분석 방법과 한계" — 분석에 쓰는 정보와 각각의 한계를 한 곳에 접어 둔다(운영자 제안 2026-10-16).
 * 첫 화면에는 한계를 짧게 먼저 알리고(정직 안내 한 줄) 자세한 내용은 여기로 연결한다. 정보 개수(다섯 가지 · 네 가지)는 내세우지 않는다 —
 * MBTI는 본인이 입력하는 정보이고, 평소 행동 방식 · 기질 · 가까운 관계는 미유가 직접 만든 질문에 답한 내용이며, 사주는 생년월일로 계산한다.
 */
const INFORMATION: { name: string; sees: string; limit: string }[] = [
  {
    name: "사주",
    sees: "생년월일 · 출생시간으로 계산한 원국과 오행 분포 (출생시간을 모르면 그 부분을 빼고 계산합니다)",
    limit: "전통 해석 체계이며, 해석 규칙은 전문가 검토 전 초안입니다. 심리 응답 점수와 합산하지 않습니다.",
  },
  {
    name: "입력한 MBTI",
    sees: "알고 있을 때만 직접 입력하는 유형입니다. 리포트에 참고값으로 따로 표시합니다.",
    limit: "공식 MBTI 검사 결과가 아니며, 미유 질문의 응답과 합치거나 다른 유형으로 바꾸지 않습니다.",
  },
  {
    name: "평소 행동 방식",
    sees: "에너지를 채우는 방식, 정보를 받아들이는 방식, 판단하는 기준, 생활을 꾸리는 방식",
    limit: "선호 경향이며 능력이나 성격 전체를 판정하지 않습니다. 지금 문항은 개발용 예시입니다.",
  },
  {
    name: "기질",
    sees: "새로운 일, 불확실함, 타인의 반응, 오래 걸리는 일에 대한 평소 반응",
    limit: "현재 응답 기준의 경향이며, 높고 낮음이 좋고 나쁨이 아닙니다.",
  },
  {
    name: "가까운 관계(애착)",
    sees: "가까운 관계에서의 불안과 거리 두기",
    limit: "임상 진단이 아니며 관계와 시기에 따라 달라질 수 있습니다.",
  },
];

export function MethodFold() {
  return (
    <details id="home-method" className="group border-b border-line">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-semibold hover:text-accent [&::-webkit-details-marker]:hidden">
        분석 방법과 한계 보기
        <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-6">
        <p className="text-[15px] leading-[1.7] text-ink-2">
          미유는 아래 정보를 한 사람의 해석으로 읽습니다. 사주와 심리 응답은 따로 계산하고 근거와 한계를 나눠 보여 드리며, 서로 합산한 종합 점수는 만들지 않습니다.
        </p>
        <dl className="mt-4 border-t border-ink">
          {INFORMATION.map((p) => (
            <div key={p.name} className="border-b border-line py-4">
              <dt className="text-[16px] font-semibold">{p.name}</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-ink-2">{p.sees}</dd>
              <dd className="mt-1 text-[13px] leading-relaxed text-ink-3">한계 · {p.limit}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[13px] leading-[1.7] text-ink-3">
          공식 심리검사나 진단이 아닌 자기이해 콘텐츠이며, 해석의 정확도는 검증하지 않았습니다.{" "}
          <Link href="/assessment-basis" className="underline underline-offset-2 hover:text-ink">
            질문은 어떻게 만들었나요?
          </Link>
        </p>
      </div>
    </details>
  );
}
