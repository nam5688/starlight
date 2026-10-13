import Link from "next/link";
import { AdjustIcon, ArrowIcon, StrengthIcon } from "@/components/ui/icons";
import { buttonSecondary, pageWide } from "@/components/ui/styles";

/**
 * 홈 비교 영역 — "1,000원대 사주도 있는데, 미유는 무엇이 다른가요?"
 * 지금 구현돼 팔리는 리포트에 실제로 있는 것만 적는다(REPORT_SCOPE 기준). 정확도 · 적중 · 후기 같은 주장은 쓰지 않고,
 * 다른 서비스를 평가하지 않는다(생년월일만 받는 일반적인 구성을 가정한 비교이며, 모든 저가 서비스가 같지는 않다).
 * 아직 연결되지 않은 것(큰 흐름 · 고민 반영 · 궁합 · 상담)은 "준비 중"으로만 밝힌다.
 */
const ROWS: { item: string; other: string; miyu: string }[] = [
  {
    item: "분석에 쓰는 정보",
    other: "생년월일 · 태어난 시간",
    miyu: "생년월일 · 출생시간에 더해, 내가 답한 기질 · 성격 · 가까운 관계 반응과 입력한 MBTI",
  },
  {
    item: "성향 설명",
    other: "사주 원국에서 읽은 일반적인 설명",
    miyu: "사주 풀이와 내 응답에서 읽은 경향을 나란히 놓고, 겹치는 부분과 다른 부분을 나눠 설명",
  },
  {
    item: "일상 적용",
    other: "풀이 문장 중심인 경우가 많고, 적용 방식은 서비스마다 다름",
    miyu: "일 · 가까운 사람 · 선택 · 돈 · 갈등 상황별로 잘 발휘될 때, 과해질 때, 해볼 선택",
  },
  {
    item: "앞으로의 방향",
    other: "시기별 풀이를 넣는 서비스도 있음",
    miyu: "관계 주제가 두드러질 수 있는 해(연 단위, 예측이 아님). 큰 흐름 풀이는 준비 중",
  },
  {
    item: "해석 확인",
    other: "근거를 보여 주는 방식은 서비스마다 다름",
    miyu: "영역마다 무엇을 근거로 봤는지와 한계를 함께 적음",
  },
];

export function CompareSection() {
  return (
    <section aria-labelledby="home-compare" className="border-y border-line bg-canvas py-12 md:py-16">
      <div className={pageWide}>
        <div className="mx-auto max-w-[760px]">
          <h2 id="home-compare" className="text-[22px] leading-snug font-bold tracking-tight md:text-[28px]">
            1,000원대 사주도 있는데, 미유는 무엇이 다른가요?
          </h2>
          <p className="mt-2 text-[15px] leading-[1.7] text-ink-2">
            생년월일만 입력하는 사주 풀이는 간단하고 빠릅니다. 미유는 거기에 내가 직접 답한 응답을 연결해, 같은 사주도 내 상황에서 어떻게 나타나는지를 읽습니다.
          </p>

          <dl className="mt-6 border-t border-ink">
            <div className="hidden grid-cols-[132px_minmax(0,1fr)_minmax(0,1.25fr)] gap-x-5 border-b border-line py-3 text-[13px] font-semibold md:grid">
              <dt className="text-ink-3">비교 항목</dt>
              <dd className="text-ink-2">생년월일 중심 사주 풀이*</dd>
              <dd className="text-accent-strong">미유 종합분석 리포트</dd>
            </div>
            {ROWS.map((r) => (
              <div key={r.item} className="grid gap-x-5 gap-y-2 border-b border-line py-4 md:grid-cols-[132px_minmax(0,1fr)_minmax(0,1.25fr)]">
                <dt className="text-[16px] font-bold md:text-[15px]">{r.item}</dt>
                <dd className="text-[15px] leading-[1.65] text-ink-2">
                  <span className="mb-0.5 block text-[13px] font-semibold text-ink-3 md:hidden">생년월일 중심 사주 풀이*</span>
                  {r.other}
                </dd>
                <dd className="text-[15px] leading-[1.65]">
                  <span className="mb-0.5 block text-[13px] font-semibold text-accent-strong md:hidden">미유 종합분석 리포트</span>
                  {r.miyu}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[13px] leading-[1.7] text-ink-3">
            * 모든 저가 사주 서비스가 같지는 않습니다. 이 표는 생년월일만 입력받는 일반적인 구성을 가정한 비교이며, 특정 서비스를 평가한 것이 아닙니다.
            미유의 응답 문항은 지금 개발용 예시이고 사주 해석 규칙은 전문가 검토 전 초안입니다. 정확도는 아직 검증하지 않았고, 더 정확하다고 주장하지 않습니다.
          </p>

          <h3 className="mt-10 text-[18px] font-bold tracking-tight">같은 사주, 이렇게 달라집니다</h3>
          <p className="mt-1 text-[13px] leading-[1.6] text-ink-3">미유가 직접 쓴 예시입니다. 가상 인물 서윤의 형식 예시이며 실제 검사 결과가 아닙니다.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-page p-4">
              <p className="text-[13px] font-semibold text-ink-3">성향 설명 · 사주만 읽었을 때</p>
              <p className="mt-2 text-[15px] leading-[1.7] text-ink-2">
                한곳을 오래 비추는 촛불처럼 집중력이 있고 섬세한 사람입니다. 배우고 정리하는 힘이 있습니다.
              </p>
              <p className="mt-3 text-[13px] text-ink-3">쓴 자료 · 사주 원국</p>
            </div>
            <div className="rounded-xl border border-accent bg-canvas p-4">
              <p className="text-[13px] font-semibold text-accent-strong">미유가 제공하려는 종합 해석</p>
              <p className="mt-2 text-[15px] leading-[1.7]">
                충분히 알아보고 다듬은 뒤에 움직입니다. 그래서 완성도가 중요한 일에서는 힘이 되고, 빠른 시작이 필요한 일에서는 힘들 수 있습니다.
              </p>
              <p className="mt-3 text-[13px] text-ink-3">쓴 자료 · 사주 원국 · 기질 응답 · 입력한 MBTI</p>
              <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-[14px]">
                <li className="flex items-center gap-1.5 font-semibold text-positive">
                  <StrengthIcon />
                  완성도가 중요한 일
                </li>
                <li className="flex items-center gap-1.5 font-semibold text-caution">
                  <AdjustIcon />
                  빠른 시작이 필요한 일
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6">
            <Link href="/report/sample" className={`${buttonSecondary} w-full sm:w-auto`}>
              내 리포트는 어떻게 나올까?
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
