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
 * 내 고민 반영 리포트 — 개인 통합 리포트를 이미 구매한 사람이 고민(내 고민 자세히 알려주기)을 적고, 그 고민으로 새 리포트를 따로 발급받는 상품.
 * - 가격은 운영자가 지정한 가안이다 (2026-10-13, 새 고민이 충분히 다른 해석으로 나올 때). 여기서만 바꾼다.
 * - 고민을 쓰고 · 고치고 · 저장하는 것은 무료이고, 기존 리포트는 그대로 보관된다. 발급할 때마다 결제한다.
 * - 생성에 실패하면 같은 발급 건으로 다시 시도한다 (추가 결제 없음).
 * - 최초 구매에 무료 발급을 몇 회 포함할지는 정해지지 않았다 — 지금은 포함하지 않는다 (필요하면 결제 없는 발급 경로를 따로 설계한다).
 */
export const CONCERN_REPORT = {
  id: "concern-report",
  name: "내 고민 반영 리포트",
  priceKrw: 4900,
  priceNote: "가안 · 기존 구매자 전용",
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 고민 반영 리포트 주문의 상품 번호 — 고민 기록(발급 당시 고민의 저장본)마다 하나씩 갖는다.
 * 같은 기록에는 결제 완료 · 결제 대기 주문이 하나만 생기므로(DB 고유 조건), 버튼을 여러 번 눌러도 한 건만 발급된다.
 */
export const concernProductId = (recordId: string) => `${CONCERN_REPORT.id}:${recordId}`;

/** 상품 번호에서 고민 기록 번호를 꺼낸다. 고민 반영 리포트 주문이 아니면 null */
export function parseConcernProductId(productId: string): string | null {
  if (!productId.startsWith(`${CONCERN_REPORT.id}:`)) return null;
  const id = productId.slice(CONCERN_REPORT.id.length + 1);
  return UUID.test(id) ? id.toLowerCase() : null;
}

/** 개인 통합 리포트 주문인가 (고민 반영 리포트 주문과 구분 — 같은 검사 결과에 두 종류가 함께 붙는다) */
export const isPersonalProduct = (productId: string) => productId === PERSONAL_REPORT.id;

/** 상품 번호 → 화면에 보이는 상품 이름 */
export function productNameOf(productId: string): string {
  if (productId === PERSONAL_REPORT.id) return PERSONAL_REPORT.name;
  return parseConcernProductId(productId) ? CONCERN_REPORT.name : productId;
}

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
