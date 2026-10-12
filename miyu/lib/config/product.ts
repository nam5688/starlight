// 상품 정보. 가격은 가안이며 여기서만 바꾼다.
// 결제 연결 단계(3단계)에서는 서버가 이 값(또는 DB)을 기준으로 금액을 확인하고,
// 브라우저가 보낸 금액은 믿지 않는다.

export const PERSONAL_REPORT = {
  id: "personal-integrated-report",
  name: "개인 통합 리포트",
  priceKrw: 9900,
  /** 화면에 함께 표시하는 가격 상태 */
  priceNote: "가안",
} as const;

/**
 * 무료 미리보기와 구매한 리포트의 범위 — 홈 · 안내 문구는 모두 이 표를 읽는다 (한 곳에서만 고친다).
 * free가 null이면 구매 후에만 보인다. 여기 적힌 것은 실제로 리포트에 들어 있어야 한다 (lib/report/preview.test.ts가 일부를 확인).
 */
export const REPORT_SCOPE: { name: string; desc: string; free: string | null; paid: string }[] = [
  { name: "대표 경향", desc: "지금의 응답에서 가장 두드러진 경향", free: "이름 앞부분 · 내 응답에서 읽은 해석 문단", paid: "이름 전체 · 그렇게 읽은 이유(근거 응답) · 한 줄 요약" },
  { name: "핵심 요약", desc: "편한 환경 · 반복되는 반응 · 스트레스 상황 · 바로 해볼 행동", free: "4가지 중 2가지 (나머지는 어떤 질문에 답하는지만)", paid: "4가지 전체" },
  { name: "사주 원국 풀이", desc: "원국 표, 오행이 뜻하는 것, 그래서 어떤 사람인지", free: "원국 표 · 오행의 뜻과 키워드 · 쉬운 한 줄 풀이", paid: "일간의 잘하는 점 · 과해질 때 주의할 점 · 각 기운이 관계 · 일 · 선택에서 나타나는 모습" },
  { name: "내 원국이 던지는 질문", desc: "내 원국에서 나온 궁금한 점과 쉬운 말 답", free: "질문 2개", paid: "질문 전체와 답" },
  { name: "상황별 잘하는 점 · 주의할 점", desc: "일 · 가까운 사람 · 선택 · 돈 · 갈등 5가지 상황", free: "첫 상황의 짧은 요약 (나머지는 질문만)", paid: "상황마다 이런 모습 → 잘 발휘될 때 → 과해질 때 → 해볼 선택" },
  { name: "MBTI 성향", desc: "에너지 · 인식 · 판단 · 생활 방식의 선호", free: "전체", paid: "전체" },
  { name: "기질 · 관계(애착) 점수", desc: "4가지 기질과 가까운 관계에서의 반응", free: "무엇을 알 수 있는지(질문)만", paid: "점수와 의미" },
  { name: "상세 분석", desc: "각 관점의 근거와 한계", free: null, paid: "근거와 한계를 함께" },
  { name: "어울리는 관계 조건", desc: "상대 없이 보는 잘 맞는 관계 스타일 · 편안한 상대의 성향 · 관계 주제가 두드러지는 해 (나이 · 직업 · 만날 날짜 · 특정인과의 궁합은 다루지 않음)", free: null, paid: "전체" },
  { name: "보완 아이템", desc: "원국에서 적은 기운을 채우는 색 · 소재 · 공간 · 습관", free: null, paid: "전체" },
  { name: "실천 제안", desc: "지금 적용할 행동", free: "3가지 중 1가지", paid: "3가지 전체와 적용 방법" },
  { name: "MY 저장 · 다시보기", desc: "구매한 리포트를 같은 버전으로 다시 보기", free: null, paid: "포함" },
];

export function formatKrw(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}
