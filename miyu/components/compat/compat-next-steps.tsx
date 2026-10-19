import Link from "next/link";
import { connection } from "next/server";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonDisabled, buttonSecondary } from "@/components/ui/styles";
import { saleOpenOf } from "@/server/sale-switch";

/**
 * 간단 궁합 결과 아래 "다음 단계" 안내 — 사주 궁합 · 리포트 궁합이 지금 열려 있는지는 요청할 때 판매 스위치로 확인해 같은 값을 보인다(`CompatLevels` · `CompatPaidSection`과 같은 `saleOpenOf`).
 * 예전에는 두 상품의 "준비 중" 표시와 비활성 버튼이 화면 코드에 고정돼 있어, 스위치가 켜진 시험 환경에서도 "준비 중"으로 보였다.
 * 판매 스위치가 꺼져 있는 지금은 두 상품 모두 "준비 중"이고 누를 곳이 없다 — 이 컴포넌트가 판매를 열지는 않는다.
 */
export async function CompatNextSteps() {
  await connection();
  const sajuOpen = saleOpenOf("saju-compat");
  const pairOpen = saleOpenOf("report-compat");
  return (
    <div className="rounded-2xl bg-canvas p-5 shadow-soft md:p-6">
      <h3 className="text-[17px] font-bold">이건 두 사람의 사주만으로 본 간단 궁합이에요</h3>
      <p className="mt-2 text-[15px] leading-[1.75] text-ink-2">왜 잘 맞는지, 어디에서 부딪히는지는 두 사주를 더 자세히 풀어야 알 수 있어요. 두 사람이 각자 답한 성격 · 기질 · 애착까지 함께 보면, 같은 사주 위에서 실제로 어떻게 다르게 반응하는지까지 이야기할 수 있어요.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        <li className="rounded-xl bg-page p-4">
          <p className="flex flex-wrap items-center gap-2 text-[16px] font-bold">
            사주 궁합 <StatusBadge>{sajuOpen ? "지금 이용 가능" : "준비 중"}</StatusBadge>
          </p>
          <p className="mt-2 text-[14px] leading-[1.7] text-ink-2">두 사람의 타고난 관계 흐름을 자세히 풀어요. 같은 계산 위에서 이 결과를 더 길게 읽어요.</p>
          {sajuOpen ? (
            <a href="#compat-paid" className={`${buttonSecondary} mt-3 w-full`}>
              사주 궁합 받기
            </a>
          ) : (
            <button type="button" disabled aria-disabled="true" className={`${buttonDisabled} mt-3 w-full`}>
              자세히 보기 · 준비 중
            </button>
          )}
        </li>
        <li className="rounded-xl bg-page p-4">
          <p className="flex flex-wrap items-center gap-2 text-[16px] font-bold">
            리포트 궁합 <StatusBadge>{pairOpen ? "지금 이용 가능" : "준비 중"}</StatusBadge>
          </p>
          <p className="mt-2 text-[14px] leading-[1.7] text-ink-2">두 사람의 사주에 각자가 직접 답한 성격과 관계 반응까지 함께 비교해요.</p>
          {pairOpen ? (
            <Link href="/pair" className={`${buttonSecondary} mt-3 w-full`}>
              리포트 궁합 시작하기
            </Link>
          ) : (
            <button type="button" disabled aria-disabled="true" className={`${buttonDisabled} mt-3 w-full`}>
              리포트로 보기 · 준비 중
            </button>
          )}
        </li>
      </ul>
      <p className="mt-3 text-[13px] leading-[1.7] text-ink-3">
        {sajuOpen || pairOpen ? "사주 궁합과 리포트 궁합은 개인 심층 리포트와 별도 서비스예요. 이용 범위와 가격은 각 안내에서 확인해 주세요." : "사주 궁합과 리포트 궁합은 개인 심층 리포트와 별도 서비스예요. 아직 열리지 않았고, 이용 범위와 가격은 정해지면 안내해요."}
      </p>
    </div>
  );
}
