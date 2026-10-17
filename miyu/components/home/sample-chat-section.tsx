import { HeroChat } from "@/components/home/hero-chat";
import { pageWide } from "@/components/ui/styles";

/**
 * 첫 화면 바로 아래의 짧은 예시 구역(운영자 결정 2026-10-17): 가상 인물 서윤의 풀이 예시 대화(HeroChat — 누르는 버튼이 아니라 "이런 묶음을 고를 수 있다"는 그림).
 * 첫 화면의 말풍선은 화면 구성 예시이고, 여기는 대화 엔진이 만든 말(서윤의 예시 리포트에 저장된 글)이다 — 둘 다 실제 AI의 새 글이나 이용 후기가 아니다.
 */
export function SampleChatSection() {
  return (
    <section aria-labelledby="home-sample" className="border-t border-line">
      <div className={`${pageWide} py-12 md:py-16`}>
        <div className="mx-auto max-w-[34rem]">
          <h2 id="home-sample" className="text-center text-[22px] leading-snug font-bold tracking-tight md:text-[28px]">
            미유가 이렇게 풀어줘요
          </h2>
          <p className="mt-2 text-center text-[15px] leading-[1.7] text-balance text-ink-2">핵심부터 말풍선으로 풀어주고, 궁금한 묶음을 골라 이어가요.</p>
          <div className="mt-6">
            <HeroChat />
          </div>
        </div>
      </div>
    </section>
  );
}
