import { ChevronIcon } from "@/components/ui/icons";
import { CHAT_ROOMS, formatKrw, PERSONAL_REPORT, REPORT_TIER_NAMES } from "@/lib/config/product";

/**
 * 홈의 자주 묻는 질문 — 모두 접어 두고 질문 제목만 보인다. 맨 앞이 가장 자주 묻는 것(출생시간 · MBTI · 상담 무료 범위 · 궁합 이용 방식 · 공식 검사 · 결제 환불)이다(운영자 방향 2026-10-16).
 * 무료 질문 수는 `CHAT_ROOMS`에서 읽어 채팅 화면과 어긋나지 않게 한다. 여기에 적은 기능은 실제로 구현된 것만이며, 가격 · 환불 기준은 확정된 것만 적는다.
 */
const FAQ = [
  {
    q: "출생시간을 몰라도 되나요?",
    a: "네. 출생시간을 모르면 태어난 시간의 기둥인 시주를 빼고 분석해요. 임의의 시간을 넣어 계산하지 않아요.",
  },
  {
    q: "MBTI를 몰라도 되나요?",
    a: "네. MBTI는 알고 있을 때만 직접 입력하는 참고값이에요. 몰라도 분석은 그대로 진행돼요. 입력하면 리포트에 참고값으로 따로 표시하며, 미유 질문의 응답과 합치거나 유형으로 바꾸지 않아요.",
  },
  {
    q: "상담은 어디까지 무료인가요?",
    a: `${REPORT_TIER_NAMES.simple}로는 오늘의 운세(하루 무료 질문 ${CHAT_ROOMS.simple.daily}번) · 연애(무료 질문 ${CHAT_ROOMS.simple.love}번) · 고민 상담(무료 질문 ${CHAT_ROOMS.simple.concern}번) 방이 열려요. 나를 알아보기 방은 질문 없이 분석 한 장과 주제별 풀이를 보여 드려요. ${REPORT_TIER_NAMES.deep}(${formatKrw(PERSONAL_REPORT.priceKrw)})를 받으면 올해의 흐름 · 결혼 · 일 · 진로 · 재무까지 모든 방이 열리고 방마다 무료 질문 ${CHAT_ROOMS.deepFreeQuestions}번을 드려요. 무료 질문을 모두 쓴 뒤 이어서 묻는 방법은 채팅 화면에서 안내해요. 자세한 제공 범위는 리포트 예시 페이지에서 비교할 수 있어요.`,
  },
  {
    q: "궁합은 어떻게 이용하나요?",
    a: "궁합은 세 단계로 나누어 준비하고 있어요. 간단 궁합(두 사람의 생년월일과 성별, 지금의 사이로 궁합 지수와 그 사이에 맞춘 풀이를 보는 가벼운 화면)은 지금 무료로 이용할 수 있고 입력한 정보를 서버에 저장하지 않아요. 사주 궁합(두 사주를 영역별로 길게 풀이)과 각자의 분석 결과를 서로 동의한 뒤 연결하는 리포트 궁합은 아직 준비 중이에요. 사주 궁합과 리포트 궁합은 개인 심층 리포트와 별도 서비스이며, 이용 범위와 가격은 정해지면 안내해요. 궁합 지수는 재미로 보는 참고용이며 관계가 이어질 확률이나 정확도가 아니에요.",
  },
  {
    q: "공식 검사인가요?",
    a: "아니에요. 지금 화면의 문항은 개발용 예시이고, 정식 운영 문항과 척도는 이용 조건을 확인한 뒤 확정해요. 미유의 리포트는 자기 이해를 돕는 참고 자료이며 진단이 아니에요.",
  },
  {
    q: "결제와 환불은 어떻게 되나요?",
    a: "토스페이먼츠로 결제하며, 토스 가입이나 앱 설치 없이 일반 카드로 결제할 수 있어요. 환불 기준은 출시 전에 확정해 안내해요.",
  },
  {
    q: "채팅에서 직접 묻는 질문은 AI가 답하나요?",
    a: "풀이 버튼으로 보는 내용은 저장된 내 리포트의 글이에요. 직접 적은 질문에는 AI가 답하며(질문 기능이 열려 있을 때), 이름과 생년월일 원문은 AI에 보내지 않아요. 답변은 입력해 주신 정보를 바탕으로 한 해석이며 정확한 예측이나 진단이 아니에요.",
  },
  {
    q: "사주와 심리검사 결과를 합쳐서 점수를 내나요?",
    a: "아니요. 사주와 성향 · 관계 응답은 각각 따로 계산하고, 한계를 함께 밝혀요. 서로 합산한 종합 점수는 만들지 않아요.",
  },
  {
    q: "리포트를 다시 열면 내용이 바뀌나요?",
    a: "구매한 리포트는 저장된 같은 버전을 다시 보여 드려요. 검사를 새로 하면 새 리포트가 만들어져요.",
  },
  {
    q: "상대의 나이나 직업도 알려 주나요?",
    a: "정확한 나이나 직업은 말하지 않아요. 사주로 읽은 ‘마음이 가는 상대의 큰 분위기’(연상 · 또래 · 연하 쪽 같은 느낌)와 나에게 편안한 관계의 조건까지 알려 드리며, 전통 해석을 단순화한 것이라 실제와 다를 수 있고 검증된 사실이 아니에요. 상대의 생년월일로 보는 궁합은 간단 궁합에서 가볍게 볼 수 있고, 더 자세한 사주 궁합은 준비 중이에요.",
  },
];

export function Faq() {
  return (
    <div className="border-t border-ink">
      {FAQ.map((item) => (
        <details key={item.q} className="group border-b border-line">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-semibold hover:text-accent [&::-webkit-details-marker]:hidden">
            {item.q}
            <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
          </summary>
          <p className="pb-5 text-[15px] leading-relaxed text-ink-2">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
