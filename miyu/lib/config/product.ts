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
 * - 가격 4,900원은 운영자가 확정했다 (2026-10-13). 바꿀 때는 여기서만 바꾼다.
 * - 고민을 쓰고 · 고치고 · 저장하는 것은 무료이고, 기존 리포트는 그대로 보관된다. 발급할 때마다 결제한다.
 * - 생성에 실패하면 같은 발급 건으로 다시 시도한다 (추가 결제 없음).
 * - 최초 구매에 무료 발급을 몇 회 포함할지는 정해지지 않았다 — 지금은 포함하지 않는다 (필요하면 결제 없는 발급 경로를 따로 설계한다).
 */
export const CONCERN_REPORT = {
  id: "concern-report",
  name: "내 고민 반영 리포트",
  priceKrw: 4900,
  priceNote: "기존 구매자 전용",
} as const;

/**
 * 리포트 두 단계의 이름 — 무료 분석으로 받는 "간단 리포트"와 결제하는 "심층 리포트(개인 통합 리포트)"(운영자 2026-10-15).
 * 상담방 구성 · 안내 문구가 이 이름을 쓴다. 상품 이름(PERSONAL_REPORT.name = 개인 통합 리포트)을 이 이름으로 통일할지는 운영자가 정한다.
 */
export const REPORT_TIER_NAMES = { simple: "간단 리포트", deep: "심층 리포트" } as const;

/**
 * 상담방 등급 — 어떤 방이 간단 리포트(무료)로 열리고 방마다 무료 질문이 몇 번인지 (운영자 2026-10-15). 바꿀 때는 여기서만 바꾼다.
 *  - simple: 간단 리포트로 열리는 방 → 방마다 무료 질문 수. 0이면 질문이 없고 "자세한 이야기는 심층 리포트에서"로 이어 준다. **여기 없는 방(올해의 흐름 · 결혼 · 진로 · 재무)은 심층 리포트로만 열린다.**
 *  - deepFreeQuestions: 심층 리포트를 가진 분이 방마다 쓸 수 있는 무료 질문 수 (모든 방).
 *  - 무료 질문을 다 쓰면 미유캐시(MIYU_CASH)로 이어서 물을 수 있다(단 질문이 없는 방 · 심층 리포트로만 열리는 방을 간단 리포트 회원이 캐시로 여는 것은 아니다).
 *  - 무료 질문은 방 단위로 센다. 오늘의 운세 방은 날짜별 방이라 하루 1번씩이다(운영자 확인 필요 — 평생 1번으로 줄이려면 daily 방을 날짜 없이 세면 된다).
 */
export const CHAT_ROOMS = {
  simple: { main: 0, daily: 1, concern: 2, love: 2 } as Readonly<Record<string, number>>,
  deepFreeQuestions: 3,
} as const;

/**
 * 나의 고민 기록소(/results/[id]/context · 고민 반영 리포트 4,900원 발급) 노출 스위치 — 운영자 2026-10-15: "고민 기록소는 지워 버려, 오래 걸리면 노출을 막아".
 * 기능은 지우지 않고 **보이지 않게만** 한다(주소는 없는 화면, 진입 버튼 · MY 목록 숨김, 새 발급 · 저장 동작은 거절). 코드 · DB 표(personal_contexts · concern_records)는 그대로 남아 있다.
 * 이전에 발급한 고민 반영 리포트의 주문 · 결제 기록은 그대로 남는다(결제내역에는 계속 보인다). 완전히 지울지는 운영자가 따로 정한다(DB 표를 지우는 것은 파괴적이라 확인 뒤에만).
 */
export const CONCERN_RECORDS = { visible: false } as const;

/**
 * 미유캐시 — 자유 질문을 무료 한도 밖에서 이어 갈 때 쓰는 선불 충전 포인트(운영자 2026-10-15: "1질문당 캐시 3개 · 10개 단위 충전 · 많이 충전하면 보너스").
 * 아래 값은 모두 **제안(가안)** 이다 — 운영자가 확정하기 전에는 "가안"으로 다루고, 바꿀 때는 여기 한 곳에서만 바꾼다(결제 금액은 서버가 이 값으로 계산해 주문에 적고, 브라우저가 보낸 금액은 믿지 않는다).
 *  - 1캐시 = 100원(가안). 질문 한 번에 3캐시 → 한 번에 300원 안팎. 한 번 호출 비용 어림(약 17원)과 결제 수수료 · 운영비를 넘기는 폭을 두고 정한 제안이다.
 *  - 충전은 10캐시 단위(1,000원)이고 한 번에 최대 500캐시(50,000원).
 *  - 보너스: 한 번에 충전한 캐시가 구간 기준 이상이면 비율만큼 더 얹는다(소수점은 버림). 보너스 캐시도 질문에 똑같이 쓰이지만, 결제를 취소하면 함께 회수된다.
 *  - 마감 타이머 · "원래 가격" 같은 표시는 쓰지 않는다. 보너스는 항상 같은 표(아래)로 보인다.
 * 환불 · 유효기간 · 보너스의 환불 여부 같은 정책은 운영자(필요하면 법무) 확인 전이며 화면에는 "정책 확정 전"으로 밝힌다(docs/cash-policy.md).
 */
export const MIYU_CASH = {
  id: "cash-charge",
  name: "미유캐시",
  /** 화면에 함께 표시하는 가격 상태 */
  priceNote: "가안",
  /** 충전은 이 개수의 배수로만 */
  unit: 10,
  /** 1캐시의 값 (원) */
  krwPerCash: 100,
  /** 질문 한 번에 쓰는 캐시 */
  perQuestion: 3,
  /** 한 번에 충전할 수 있는 범위 (개) */
  minCash: 10,
  maxCash: 500,
  /** 보너스 구간 — 충전 캐시가 minCash 이상이면 ratePct(%)를 더 얹는다 (가장 높은 구간 하나만 적용) */
  bonusTiers: [
    { minCash: 50, ratePct: 10 },
    { minCash: 100, ratePct: 15 },
    { minCash: 300, ratePct: 20 },
  ],
  /** 충전 화면의 빠른 선택 (개) */
  packages: [10, 30, 50, 100, 300],
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

/**
 * 미유캐시 충전 주문의 상품 번호 — `cash-charge:<충전 캐시>:<보너스 캐시>:<임의 번호>`.
 * 서버가 주문을 만들 때 금액에서 정한 충전량을 번호에 함께 적는다(결제 승인 때 DB가 이 값을 읽어 지갑에 넣는다 — 승인과 같은 처리 안에서).
 * 임의 번호는 같은 검사 결과에서 충전을 여러 번 해도 주문마다 번호가 달라지게 한다(DB의 "같은 검사 · 상품에 결제 완료 하나" 조건을 피하는 용도가 아니라, 충전은 반복해도 되는 상품이기 때문이다).
 */
export const cashProductId = (p: { cash: number; bonus: number; nonce: string }) => `${MIYU_CASH.id}:${p.cash}:${p.bonus}:${p.nonce}`;

const CASH_PRODUCT = /^cash-charge:([0-9]{1,6}):([0-9]{1,6}):([A-Za-z0-9]{6,32})$/;

/** 상품 번호에서 충전 캐시 · 보너스 캐시를 꺼낸다. 미유캐시 충전 주문이 아니면 null */
export function parseCashProductId(productId: string): { cash: number; bonus: number; nonce: string } | null {
  const m = CASH_PRODUCT.exec(productId);
  if (!m) return null;
  return { cash: Number(m[1]), bonus: Number(m[2]), nonce: m[3] };
}

/** 미유캐시 충전 주문인가 (리포트 주문이 아니다 — 리포트를 만들지 않고 지갑에 캐시를 넣는다) */
export const isCashProduct = (productId: string) => parseCashProductId(productId) !== null;

/** 개인 통합 리포트 주문인가 (고민 반영 리포트 주문과 구분 — 같은 검사 결과에 두 종류가 함께 붙는다) */
export const isPersonalProduct = (productId: string) => productId === PERSONAL_REPORT.id;

/** 상품 번호 → 화면에 보이는 상품 이름 */
export function productNameOf(productId: string): string {
  if (productId === PERSONAL_REPORT.id) return PERSONAL_REPORT.name;
  const cash = parseCashProductId(productId);
  if (cash) return `${MIYU_CASH.name} ${cash.cash}개 충전`;
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
  { name: "상황별 잘하는 점 · 주의할 점", desc: "일 · 가까운 사람 · 선택 · 갈등 4가지 상황", free: "첫 상황의 짧은 요약 (나머지는 질문만)", paid: "상황마다 이런 모습 → 잘 발휘될 때 → 과해질 때 → 해볼 선택" },
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

/**
 * 원데이 미유(오늘의 한 장) 무료 정책 — 운영자 2026-10-15: "일일 운세는 하루 한 번 무료(초기에만)".
 * 오늘의 한 장은 날짜별 방이라 하루에 한 장이고, 켜져 있으면 무료 맛보기에서도 그날의 한 장을 전부 보여 준다.
 * 초기 혜택을 끝낼 때는 enabled를 false로 바꾼다 — 무료 맛보기에서는 "리포트를 받으면 열려요"와 이어지는 질문만 보이고, 구매한 분은 그대로 본다.
 */
export const DAILY_FREE = { enabled: true } as const;

/**
 * "사주로 읽은 인연의 경향" 중 나이 차의 큰 방향(연상 · 또래 · 연하 쪽) 표시 — 운영자 2026-10-15 결정으로 켜 두었다.
 * 일지(배우자 자리)의 십신 그룹을 육친의 세대 비유로 옮긴 전통 해석 규칙이다(근거 점검 docs/partner-rules-audit.md — 운영자가 유지하기로 결정, 사용한 기준은 화면에 설명한다).
 * 끄고 싶으면 enabled를 false로 — 구매한 풀이에서는 나이 방향 문장이, 무료 맛보기에서는 그 질문이 빠지고 분위기 · 오래 가는 관계 풀이는 그대로 남는다.
 */
export const PARTNER_AGE_DIRECTION = { enabled: true } as const;
