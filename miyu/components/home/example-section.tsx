import Link from "next/link";
import { ChatExample } from "@/components/home/chat-example";
import { AdjustIcon, ArrowIcon, StrengthIcon } from "@/components/ui/icons";
import { buttonSecondary, pageWide } from "@/components/ui/styles";
import { sampleReadingReport } from "@/lib/samples/sample-reading-report";

/**
 * 홈의 예시 — 분석 한 장과 그 분석에서 이어지는 대화를 한 사람(가상 인물 서윤)의 것으로 함께 보여 준다.
 * 카드의 글은 서윤 예시 리포트(사람이 쓴 글)의 것이고, 대화는 대화 엔진이 만든 말과 고정 문구 그대로다(`ChatExample`) — 새로 쓴 글이나 후기가 아니다.
 * 무료 미리보기의 잠금 화면 · 사주만 읽을 때와의 비교 예시는 따로 두지 않는다(무료와 심층의 차이는 아래 가격 구역).
 */
export function ExampleSection() {
  const r = sampleReadingReport;
  const [strength, caution] = r.summary;
  return (
    <section aria-labelledby="home-example" className="border-y border-line bg-canvas py-12 md:py-16">
      <div className={`${pageWide} grid gap-8 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-start lg:gap-16`}>
        <div>
          <h2 id="home-example" className="text-[22px] leading-snug font-bold tracking-tight md:text-[28px]">
            내 분석을 읽고, 궁금한 부분은 물어보세요.
          </h2>
          <p className="mt-2 max-w-[34rem] text-[15px] leading-[1.7] text-ink-2">
            분석은 카드 한 장으로 정리되고, 궁금한 점은 미유와 대화로 이어져요. 질문에 답한 내용은 리포트에 반영되고, 대화에서 누른 답이 저장된 리포트를 바꾸지는 않아요.
          </p>

          <div className="mt-6 rounded-3xl bg-page p-5 shadow-soft md:p-6">
            <p className="text-[13px] font-semibold text-ink-3">{r.personName} 님의 분석 요약 · 가상 인물 예시</p>
            <p className="mt-2 text-[20px] leading-snug font-bold md:text-[22px]">{r.headline}</p>
            <ul className="mt-4 space-y-3">
              <li className="flex gap-2.5">
                <StrengthIcon className="mt-0.5 size-5 shrink-0 text-positive" />
                <p className="text-[15px] leading-[1.65]">
                  <span className="block font-semibold text-positive">
                    {strength.label} · {strength.keyword}
                  </span>
                  <span className="text-ink-2">{strength.note}</span>
                </p>
              </li>
              <li className="flex gap-2.5">
                <AdjustIcon className="mt-0.5 size-5 shrink-0 text-caution" />
                <p className="text-[15px] leading-[1.65]">
                  <span className="block font-semibold text-caution">
                    {caution.label} · {caution.keyword}
                  </span>
                  <span className="text-ink-2">{caution.note}</span>
                </p>
              </li>
            </ul>
          </div>

          <div className="mt-5">
            <Link href="/report/sample" className={`${buttonSecondary} w-full sm:w-auto`}>
              전체 리포트 예시 보기
              <ArrowIcon />
            </Link>
          </div>
          <p className="mt-5 max-w-[34rem] text-[13px] leading-[1.7] text-ink-3">
            가상 인물 서윤의 화면 예시이며, 실제 이용 후기나 실제 검사 결과가 아니에요. 이용 후기는 이용자의 동의를 받은 뒤에만 싣겠습니다. 미유는 분석을 풀어 주는 안내이고, 결과를 보장하거나 진단하지 않아요.
          </p>
        </div>
        <ChatExample />
      </div>
    </section>
  );
}
