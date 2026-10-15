import { ChevronIcon } from "@/components/ui/icons";

const FAQ = [
  {
    q: "출생시간을 몰라도 되나요?",
    a: "네. 출생시간을 모르면 태어난 시간의 기둥인 시주를 빼고 분석합니다. 임의의 시간을 넣어 계산하지 않습니다.",
  },
  {
    q: "MBTI를 이미 알고 있어요.",
    a: "기본 정보에서 입력할 수 있고, 리포트에는 참고값으로 따로 표시합니다. 미유의 평소 행동 방식 문항은 그대로 진행하고, 입력하신 MBTI는 이 응답과 비교하거나 유형으로 바꾸지 않고 따로 보여드립니다.",
  },
  {
    q: "사주와 심리검사 결과를 합쳐서 점수를 내나요?",
    a: "아니요. 네 가지 관점은 각각 따로 계산하고, 근거와 한계를 나눠 보여드립니다. 사주와 심리검사 점수를 합산한 종합 점수는 만들지 않습니다.",
  },
  {
    q: "리포트를 다시 열면 내용이 바뀌나요?",
    a: "구매한 리포트는 저장된 같은 버전을 다시 보여드립니다. 검사를 새로 하면 새 리포트가 만들어집니다.",
  },
  {
    q: "대화로 풀어보기는 AI가 답하나요?",
    a: "아니요. 지금은 저장된 내 리포트의 글을 대화처럼 나눠 보여 드립니다. AI가 새 글을 쓰지 않고, 눌러 주신 답이 풀이를 바꾸지도 않습니다. 자유롭게 묻는 질문은 준비 중이며, 비용 · 개인정보 · 가격을 정한 뒤에 엽니다.",
  },
  {
    q: "상대의 나이나 직업도 알려 주나요?",
    a: "정해서 말하지 않습니다. 지금은 사주와 내 응답으로 읽은 ‘나에게 편안한 관계의 조건’까지 알려 드립니다. 상대의 생년월일로 상대의 경향을 읽는 기능은 준비 중이며, 만들 때도 실제 모습과 다를 수 있다고 함께 밝힙니다.",
  },
  {
    q: "공식 검사인가요?",
    a: "지금 화면의 문항은 개발용 예시입니다. 정식 운영 문항과 척도는 이용 조건을 확인한 뒤 확정합니다. 미유의 리포트는 자기 이해를 돕는 참고 자료이며 진단이 아닙니다.",
  },
  {
    q: "결제와 환불은 어떻게 되나요?",
    a: "토스페이먼츠로 결제하며, 토스 가입이나 앱 설치 없이 일반 카드로 결제할 수 있습니다. 환불 기준은 출시 전에 확정해 안내합니다.",
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
