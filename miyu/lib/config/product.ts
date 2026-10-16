// 상품 정보. 가격은 가안이며 여기서만 바꾼다.
// 결제 연결 단계(3단계)에서는 서버가 이 값(또는 DB)을 기준으로 금액을 확인하고,
// 브라우저가 보낸 금액은 믿지 않는다.

export const PERSONAL_REPORT = {
  id: "personal-integrated-report",
  /** 결제하는 상품의 이름 — 개인 통합 리포트는 무료 리포트와 심층 리포트 두 버전이고 결제하는 쪽이 심층 리포트다(운영자 2026-10-15) */
  name: "심층 리포트",
  /** 두 버전을 함께 부를 때의 이름(소개 · 약관 · 안내 문구) */
  lineName: "개인 통합 리포트",
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
 * 무료 분석(검사)에 걸리는 시간 안내 — 운영자 요청(2026-10-15). **직접 재서 얻은 값이 아니라 어림**이다(기본 정보 + 문항 약 22개를 한 문항 10초 안팎으로 읽고 고르는 것으로 셈).
 * 시범 응답으로 실제 시간을 재면 여기서만 고친다.
 */
export const FREE_ANALYSIS_TIME = "약 5분";

/**
 * 채팅 요약 — 저장하지 않고 끝낸 대화의 "보이지 않는 참고 기록"을 며칠 보관하나(운영자 2026-10-15: 일정 기간 뒤 자동 삭제, 기간은 90일로 시작).
 * 직접 저장한 요약은 이 기간과 상관없이 회원이 지울 때까지 남는다. 바꿀 때는 여기서만 바꾼다(안내창 · 처리방침 문구가 이 값을 읽거나 같은 숫자를 적었다 — 처리방침 3-1 · docs/chat-summary.md도 함께 고친다).
 */
export const CHAT_SUMMARY_POLICY = { referenceKeepDays: 90 } as const;

/**
 * 개인 통합 리포트의 두 버전 이름 — 무료 분석으로 받는 "무료 리포트"와 결제하는 "심층 리포트"(운영자 2026-10-15).
 * 상담방 구성 · 안내 문구가 이 이름을 쓰고, 결제하는 상품 이름(PERSONAL_REPORT.name)도 심층 리포트다. 두 버전을 함께 부르는 이름은 PERSONAL_REPORT.lineName(개인 통합 리포트).
 */
export const REPORT_TIER_NAMES = { simple: "무료 리포트", deep: "심층 리포트" } as const;

/**
 * 상담방 등급 — 어떤 방이 무료 리포트(무료)로 열리고 방마다 무료 질문이 몇 번인지 (운영자 2026-10-15). 바꿀 때는 여기서만 바꾼다.
 *  - simple: 무료 리포트로 열리는 방 → 방마다 무료 질문 수. 0이면 질문이 없고 "자세한 이야기는 심층 리포트에서"로 이어 준다. **여기 없는 방(올해의 흐름 · 결혼 · 진로 · 재무)은 심층 리포트로만 열린다.**
 *  - deepFreeQuestions: 심층 리포트를 가진 분이 방마다 쓸 수 있는 무료 질문 수 (모든 방).
 *  - 무료 질문을 다 쓰면 질문 3개 묶음 결제(MIYU_CASH · QUESTION_PACK_PRICE_KRW)로 이어서 물을 수 있다(단 질문이 없는 방 · 심층 리포트로만 열리는 방을 무료 리포트 회원이 결제로 여는 것은 아니다).
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
 * 출시 초기 결제수단(운영자 방향 2026-10-16: "출시 초기에는 카드만 운영해 복잡함을 줄인다").
 * 카드 취소는 기한 제한이 따로 없다(카드사 데이터 보관 기간에 따라 1년을 넘기면 안 될 수 있다). 반면 계좌이체는 180일, 가상계좌는 보통 365일, 휴대폰 결제는 결제한 달에만 취소할 수 있어
 * 결제수단마다 환불 절차가 달라진다(토스페이먼츠 결제 취소 가이드, 2026-10-16 확인).
 * 코드가 결제창에서 결제수단을 막지는 못한다 — 토스 개발자센터의 결제위젯 설정에서 카드만 보이게 운영자가 맞춘다(docs/setup-guide.md).
 * 카드가 아닌 결제수단으로 승인되면 운영자에게 알린다(`lib/commerce/payment-method.ts`의 `nonCardNotice`).
 */
export const LAUNCH_PAYMENT_METHODS = { cardOnly: true } as const;

/**
 * 유료 질문 — 무료 질문을 다 쓴 뒤 **질문 3개 묶음(2,500원, 부가세 포함)** 을 결제해서 이어 간다(운영자 2026-10-15: "3개 2,500원이 고정이고 앞으로 1개씩 안 하고 무조건 3개씩").
 * 낱개(1개) 결제는 없다. 선불 충전 금액 입력 · 보너스 · 지갑 화면도 없다(고정 묶음 하나뿐). 값은 모두 **제안(가안)** 이며 바꿀 때는 여기 한 곳에서만 바꾼다
 * (결제 금액은 서버가 이 값으로 계산해 주문에 적고, 브라우저가 보낸 금액은 믿지 않는다).
 *  - 묶음 하나 = 질문 3개 = 2,500원(부가세 포함, 가안 — 공급가 약 2,273원 + 부가세 약 227원). 질문 1개로 나누면 약 833원이다.
 *    장부 단위(perQuestion)와 값(priceKrw)은 따로 정한다 — 가격을 바꿔도 장부 단위 · DB 13번 트리거는 그대로다.
 *  - 내부적으로는 DB 13번의 지갑 표를 "결제한 질문을 쓸 때까지 보관하는 장부"로 쓴다. 결제 한 건 = perQuestion × questionsPerPack(9) 단위가 들어오고 질문 한 번이 perQuestion(3) 단위를 쓴다.
 *    답을 받지 못하면 되돌려 그 질문이 남고(같은 결제로 다시 물을 수 있다), 결제한 질문이 하나라도 남아 있으면 새로 결제받지 않는다 — 그래서 **쓰지 않은 질문은 최대 2개**까지 남는다.
 *    **남은 질문이 있다는 점에서 선불 결제와 닮았다.** 선불 결제수단 · 상품권에 해당하는지, 미사용분의 환불 · 청약철회 · 유효기간 · 탈퇴 처리는 판단하지 않았고 법적 검토가 필요하다(docs/question-payment.md의 결정 항목).
 *  - 마감 타이머 · "원래 가격" 같은 표시는 쓰지 않는다.
 * 환불 · 유효기간 같은 이용 기준은 운영자(필요하면 법무) 확인 전이며 화면에는 "정책 확정 전"으로 밝힌다.
 */
export const MIYU_CASH = {
  /** 상품 번호 접두 — DB 13번 트리거가 `cash-charge:<들어올 단위>:<보너스>:<번호>` 형식을 읽는다 */
  id: "cash-charge",
  /** 화면에 보이는 상품 이름 */
  name: "유료 질문",
  /** 화면에 함께 표시하는 가격 상태 */
  priceNote: "가안",
  /** 묶음 하나(질문 3개)의 값 (원, 부가세 포함) — 서버가 주문 금액으로 쓴다. 이미 만든 주문은 만들 때의 금액 그대로다 */
  priceKrw: 2500,
  /** 한 번 결제로 생기는 질문 수 — 고정이다(낱개 결제는 없다) */
  questionsPerPack: 3,
  /** 질문 한 번에 쓰는 장부 단위 */
  perQuestion: 3,
  /** 환불 · 유효기간 같은 이용 기준을 운영자가 확정했는가 — false인 동안 화면은 "아직 정해지지 않았다"고 밝힌다(docs/question-payment.md). 확정하면 true로 바꾸고 화면 문구를 정책에 맞게 고친다 */
  policyDecided: false,
} as const;

/**
 * 실결제로 질문 묶음을 팔아도 되는가 — 이용 기준(환불 · 유효기간 · 탈퇴 · 서비스 종료)을 운영자가 확정했고(MIYU_CASH.policyDecided) 고객 문의 채널이 정해졌을 때만 true.
 * 테스트 결제는 이 값과 상관없이 열려 있다. 둘 중 하나라도 없으면 실결제 모드의 질문 결제는 "준비 중"으로 막힌다(결제 시작도 하지 않는다 — 돈이 빠지지 않는다).
 */
export const questionPackSalesOpen = (policyDecided: boolean, hasContact: boolean): boolean => policyDecided && hasContact;

/** 질문 묶음 하나의 값 (원, 부가세 포함) — 서버가 주문 금액으로 쓴다 */
export const QUESTION_PACK_PRICE_KRW = MIYU_CASH.priceKrw;
/** 묶음 하나로 생기는 질문 수 (3) */
export const QUESTION_PACK_SIZE = MIYU_CASH.questionsPerPack;
/** 묶음 하나가 장부에 넣는 단위 (질문 수 × 질문 한 번의 단위 = 9) — 상품 번호에 적힌다 */
export const QUESTION_PACK_UNITS = MIYU_CASH.questionsPerPack * MIYU_CASH.perQuestion;

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
 * 유료 질문 주문의 상품 번호 — `cash-charge:<장부에 들어올 단위>:<보너스>:<번호>`. 질문 묶음 결제는 항상 `cash-charge:9:0:<방이름 + 임의 10자>`다(질문 3개 = 9단위).
 * 낱개(1개, 3단위) 결제는 묶음 전 버전이 만든 주문(`cash-charge:3:0:…`)에만 있고 기록은 그대로 남는다.
 * 서버가 주문을 만들 때 정한 값을 번호에 함께 적는다(결제 승인 때 DB가 이 값을 읽어 장부에 넣는다 — 승인과 같은 처리 안에서).
 * 번호의 앞부분은 질문한 방의 이름이라 결제가 끝난 뒤 그 방으로 돌아올 수 있다(lib/commerce/cash.ts의 questionRoomOf).
 * 예전 선불 충전 주문(`cash-charge:50:5:…` 등)도 같은 형식이라 읽을 수 있고, 기록은 그대로 남는다.
 */
export const cashProductId = (p: { cash: number; bonus: number; nonce: string }) => `${MIYU_CASH.id}:${p.cash}:${p.bonus}:${p.nonce}`;

const CASH_PRODUCT = /^cash-charge:([0-9]{1,6}):([0-9]{1,6}):([A-Za-z0-9]{6,32})$/;

/** 상품 번호에서 장부 단위 · 보너스를 꺼낸다. 유료 질문(또는 예전 충전) 주문이 아니면 null */
export function parseCashProductId(productId: string): { cash: number; bonus: number; nonce: string } | null {
  const m = CASH_PRODUCT.exec(productId);
  if (!m) return null;
  return { cash: Number(m[1]), bonus: Number(m[2]), nonce: m[3] };
}

/**
 * 질문 결제 주문의 종류 — pack: 지금의 질문 3개 묶음(9단위) · single: 묶음 전 버전의 질문 1개 결제(3단위, 기록만 남아 있다) · legacy: 그보다 앞선 선불 충전(보너스 포함).
 * 장부에 들어간 단위는 어느 종류든 DB 트리거가 상품 번호에서 읽는다.
 */
export function cashOrderKind(p: { cash: number; bonus: number }): "pack" | "single" | "legacy" {
  if (p.bonus !== 0) return "legacy";
  if (p.cash === QUESTION_PACK_UNITS) return "pack";
  if (p.cash === MIYU_CASH.perQuestion) return "single";
  return "legacy";
}

/** 유료 질문(또는 예전 충전) 주문인가 (리포트 주문이 아니다 — 리포트를 만들지 않고 장부에 질문 한 개를 넣는다) */
export const isCashProduct = (productId: string) => parseCashProductId(productId) !== null;

/**
 * 개인 통합 리포트 주문의 상품 번호 — 첫 구매는 `personal-integrated-report`(이미 저장된 주문 그대로),
 * 같은 결과로 새 리포트를 다시 받는 주문(운영자 2026-10-15: "한 사람이 여러 개의 리포트를 받을 수 있고 재결제도 가능")은 `personal-integrated-report:r<번째>`.
 * 번째가 달라야 DB의 "같은 검사 · 상품에 결제 완료 · 결제 대기 하나" 조건과 부딪히지 않고(기존 주문 · 인덱스는 그대로), 같은 번째를 동시에 두 번 만들면 그 조건이 막는다.
 */
export const personalProductId = (seq: number) => (seq <= 1 ? PERSONAL_REPORT.id : `${PERSONAL_REPORT.id}:r${seq}`);

const PERSONAL_REPEAT = new RegExp(`^${PERSONAL_REPORT.id}:r([0-9]{1,3})$`);

/** 개인 통합 리포트 주문이면 몇 번째 구매인지(1 = 첫 구매), 아니면 null */
export function parsePersonalSeq(productId: string): number | null {
  if (productId === PERSONAL_REPORT.id) return 1;
  const m = PERSONAL_REPEAT.exec(productId);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 2 ? n : null;
}

/** 개인 통합 리포트 주문인가 (첫 구매 · 다시 받기 모두. 고민 반영 리포트 주문과 구분 — 같은 검사 결과에 여러 종류가 함께 붙는다) */
export const isPersonalProduct = (productId: string) => parsePersonalSeq(productId) !== null;

/** 상품 번호 → 화면에 보이는 상품 이름 */
export function productNameOf(productId: string): string {
  const seq = parsePersonalSeq(productId);
  if (seq !== null) return seq > 1 ? `${PERSONAL_REPORT.name} (${seq}번째 받기)` : PERSONAL_REPORT.name;
  const cash = parseCashProductId(productId);
  if (cash) {
    const kind = cashOrderKind(cash);
    return kind === "pack" ? `${MIYU_CASH.name} ${QUESTION_PACK_SIZE}개` : kind === "single" ? `${MIYU_CASH.name} 1개` : `미유캐시 ${cash.cash}개 충전 (예전 방식)`;
  }
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
  { name: "평소 행동 방식", desc: "에너지를 채우는 방식 · 정보를 받아들이는 방식 · 판단하는 기준 · 생활을 꾸리는 방식", free: "전체", paid: "전체" },
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
