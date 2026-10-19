import Link from "next/link";
import { connection } from "next/server";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonSecondary } from "@/components/ui/styles";
import { saleOpenOf } from "@/server/sale-switch";

/**
 * 궁합 세 단계 안내 — 사주 궁합 · 리포트 궁합이 지금 판매 중인지는 요청할 때 판매 스위치로 확인한다(꺼져 있으면 "준비 중"이고 누를 곳이 없다).
 */
export async function CompatLevels() {
  await connection();
  const sajuOpen = saleOpenOf("saju-compat");
  const pairOpen = saleOpenOf("report-compat");
  return (
    <section aria-labelledby="compat-levels" className="mt-14">
      <h2 id="compat-levels" className="text-[18px] font-bold">
        궁합은 세 단계로 준비하고 있어요
      </h2>
      <ul className="mt-4 space-y-3 text-[15px] leading-[1.7] text-ink-2">
        <li>
          <span className="font-semibold text-ink">간단 궁합</span> <StatusBadge>지금 이용 가능</StatusBadge> — 궁합 지수와, 알려 주신 사이에 맞춘 풀이 한 장. 두 사람의 사주만 봐요.
        </li>
        <li>
          <span className="font-semibold text-ink">사주 궁합</span> <StatusBadge>{sajuOpen ? "지금 이용 가능" : "준비 중"}</StatusBadge> — 두 사람의 타고난 관계 흐름을 자세히 풀어요. 간단 궁합과 같은 계산을 길게 읽는 거예요.
        </li>
        <li>
          <span className="font-semibold text-ink">리포트 궁합</span> <StatusBadge>{pairOpen ? "지금 이용 가능" : "준비 중"}</StatusBadge> — 두 사람의 사주에 각자가 직접 답한 성격과 관계 반응까지 함께 비교해요. 서로 동의한 경우에만 연결해요.
        </li>
      </ul>
      {pairOpen && (
        <p className="mt-4">
          <Link href="/pair" className={buttonSecondary}>
            리포트 궁합 시작하기
          </Link>
        </p>
      )}
      <p className="mt-4 text-[13px] leading-[1.7] text-ink-3">
        궁합 결과는 전통 사주 해석을 단순하게 정리한 재미 · 참고용이에요. 두 사람의 사주만 본 것이라 실제 성격이나 마음을 말해 주지 않고, 관계가 이어질 확률을 알려 주지도 않아요. 사주 궁합과 리포트 궁합은 개인 심층 리포트와 별도 서비스이고, 이용 범위와 가격은 정해지면 안내해요.
      </p>
    </section>
  );
}
