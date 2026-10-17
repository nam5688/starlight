// AI 품질 비교 후보 2개 — 공식 문서에서 확인한 모델 ID · 가격. 비교 전용이며 서비스 설정(AI_PROVIDER)과 별개다.
// 가격 · 모델 ID는 바뀔 수 있다. 가입 · 연결 전에 아래 공식 링크에서 다시 확인한다 (docs/ai-quality-comparison-plan.md).
// 이 파일은 연결 코드가 아니다. 예산이 승인되기 전에는 어떤 호출도 하지 않는다.
import type { ModelPrice } from "../report/ai/budget.ts";

export type AiCandidate = {
  /** 비교에서 쓰는 이름 (A · B) — 평가 때는 가려서 본다 */
  key: "A" | "B";
  company: string;
  /** API에 넣는 실제 모델 ID */
  modelId: string;
  price: ModelPrice;
  /** 가격 기준 설명 */
  priceNote: string;
  priceSource: string;
  modelSource: string;
  /** 확인한 날 */
  checkedAt: string;
  /** 같은 조건으로 맞추는 값 — 한쪽에 유리하지 않게 */
  settings: string;
};

export const AI_CANDIDATES: AiCandidate[] = [
  {
    key: "A",
    company: "Anthropic",
    modelId: "claude-sonnet-5-5",
    price: { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
    priceNote: "100만 토큰당 입력 $2 · 출력 $10. 생각하는 데 쓰는 토큰은 출력으로 과금되고 최대 출력 토큰에 합산된다.",
    priceSource: "https://platform.claude.com/docs/en/about-claude/pricing",
    modelSource: "https://platform.claude.com/docs/en/about-claude/models/overview",
    checkedAt: "2026-10-12",
    settings: "생각 모드는 적응형, 생각 강도는 중간으로 맞춘다 (기본값은 높음).",
  },
  {
    key: "B",
    company: "OpenAI",
    modelId: "gpt-6.1-sol",
    price: { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
    priceNote: "100만 토큰당 입력 $2 · 출력 $10 (입력 27만 2천 토큰 이하 기준). 추론 토큰은 출력으로 과금되고 최대 출력 토큰에 합산된다.",
    priceSource: "https://developers.openai.com/api/docs/pricing",
    modelSource: "https://developers.openai.com/api/docs/models/gpt-6.1-sol",
    checkedAt: "2026-10-12",
    settings: "추론 강도는 중간으로 맞춘다 (기본값도 중간).",
  },
];

/** 비교 단계 — 단계마다 운영자가 따로 승인한다. 승인 전에는 한도가 있어도 호출하지 않는다 */
export type CompareStageDef = {
  name: string;
  label: string;
  /** 가상 인물 수 (후보마다 각각 한 번씩 생성) */
  personaCount: number;
  /** 이 단계 전체의 하드스톱 한도 (원) — 예산 승인 요청 금액과 같다 */
  capKrw: number;
  /**
   * 승인 범위가 좁은 단계의 제한. 있으면 실행기가 이 값과 다른 변형 · 모델 · 인물 · 이미 쓴 금액 누락 · 최악 비용 초과를
   * 드라이런에서도, 실제 호출에서도 거절한다(승인 범위를 말이 아니라 코드로 지킨다).
   */
  restrict?: StageRestriction;
};

export type StageRestriction = {
  /** 쓸 수 있는 지시문 형식 */
  variant: string;
  /** 쓸 수 있는 후보 (A=Claude) */
  only: "A" | "B";
  /** 쓸 수 있는 가상 인물 */
  persona: string;
  /** 한 번 실행의 "모두 고쳐 쓰기까지 가는 최악" 비용 상한 (원) — 반올림 없이 그대로 비교하고, 넘으면 실행하지 않고 운영자가 다시 확인한다 */
  runCeilingKrw: number;
  /** 같은 승인 총액 안에서 이미 쓴 금액을 반드시 적게 한다 (--already-spent-krw — 빠뜨리면 총액을 처음부터 쓰는 것처럼 계산된다) */
  requireAlreadySpent: boolean;
  /** 승인받은 실행 횟수와 이미 마친 횟수 — 다 썼으면 드라이런은 되지만 --execute는 거절한다(새 실행은 운영자가 다시 승인해 이 값을 고친다) */
  runsApproved: number;
  runsDone: number;
  /** 마친 실행의 기록 한 줄(날짜 · 호출 수 · 비용 · 결과) — 거절 안내에 보인다 */
  lastRun?: string;
};

export const COMPARE_STAGES: CompareStageDef[] = [
  { name: "stage-1", label: "1단계: 가상 인물 2명 × 후보 2개 = 생성 4건", personaCount: 2, capKrw: 3000 },
  { name: "stage-2", label: "2단계: 가상 인물 10명 × 후보 2개 = 생성 20건 (1단계 결과를 보고 따로 승인)", personaCount: 10, capKrw: 8000 },
  // 운영자 승인 2026-10-17(1차): AI 테스트 총 승인 한도 4,000원(누적 사용액 포함). story-v1 + 현재 지시문, 가상 인물 P01 실제 AI 1건만(1회 상한 1,230원) — 마쳤다(371원 · 형식 검사 불통과).
  // 운영자 승인 2026-10-17(2차, A안): **총 6,000원(누적 사용액 2,468원 포함 → 지금부터 추가 지출 상한 3,532원, 6,000원을 더 써도 된다는 뜻이 아니다)**, 모델 claude-sonnet-5-5.
  //   이 단계는 story-v1 재시험 1회(생성 + 필요하면 고쳐 쓰기 = 호출 최대 2회) · 1회 상한은 승인안의 최악 비용 1,234.03원 — 드라이런의 재작성 포함 최악이 1,234.03원을 0.01원 미만으로 넘어 거절돼 **운영자가 같은 날 1,234.04원으로 확인했다**(반올림 없이 그대로 비교 — 넘으면 호출 전에 멈추고 다시 승인받는다).
  //   다른 인물 · 추가 비교에는 쓰지 않는다. 사주 궁합 · 리포트 궁합은 아래 COMPAT_LIVE_STAGES에서 각각 따로 승인했다.
  {
    name: "story-p01",
    label: "story-v1 P01 실제 AI 재시험 1건 (운영자 승인 2026-10-17 A안 — 총 6,000원, 누적 사용액 2,468원 포함)",
    personaCount: 1,
    capKrw: 6000,
    restrict: {
      variant: "story-v1",
      only: "A",
      persona: "P01",
      runCeilingKrw: 1234.04,
      requireAlreadySpent: true,
      // 승인된 실행 2건 = 1차(2026-10-17 운영자 PC: 호출 2회(재작성 1회 포함) · 371원 · 형식 검사 0/1 · 저장되지 않음, 마침) + 2차 재시험 1건(A안, 아직 실행하지 않음). 실행하면 runsDone · lastRun을 고친다.
      runsApproved: 2,
      runsDone: 1,
      lastRun: "2026-10-17 · 호출 2회(재작성 1회) · 371원 · 형식 검사 불통과 · 저장되지 않음",
    },
  },
];

/**
 * 궁합 실제 AI 시험 단계 — 운영자가 모델 · 호출 수 · 최대 비용을 정해 승인한 값이 `runsApproved`와 `runCeilingKrw`(반올림 없이 그대로 비교하는 최악 비용 상한)다.
 * 승인된 횟수를 마쳤거나 승인이 없으면(0회 · 1회 상한 0원) 드라이런만 되고 `--execute`는 거절된다. 제안과 비용은 docs/real-ai-approval-proposal.md. 가상 인물만 쓴다(실제 고객 정보 금지).
 */
export type CompatLiveStageDef = {
  name: "compat-saju-p1" | "compat-pair-p1";
  label: string;
  kind: "saju" | "pair";
  /** 승인 총액(원, 누적 사용액 포함) — 하드스톱 한도의 바탕 */
  capKrw: number;
  restrict: { runCeilingKrw: number; runsApproved: number; runsDone: number; lastRun?: string };
};

// 운영자 승인 2026-10-17(A안): 총 6,000원(누적 2,468원 포함 → 추가 지출 상한 3,532원), 모델 claude-sonnet-5-5, 각 시험 호출 최대 2회(생성 + 고쳐 쓰기).
// 1회 상한은 운영자가 정한 최악 비용이다 — 사주 궁합 635원(지금 최악 634.99원) · 리포트 궁합 680원이었으나 지금 입력으로 센 최악이 680.15원이라 거절돼 **운영자가 같은 날 680.15원으로 확인했다**(반올림 없이 그대로 비교).
export const COMPAT_LIVE_STAGES: CompatLiveStageDef[] = [
  { name: "compat-saju-p1", label: "사주 궁합 실제 AI 1건 (가상 쌍 C1) — 운영자 승인 2026-10-17 A안(총 6,000원, 누적 2,468원 포함)", kind: "saju", capKrw: 6000, restrict: { runCeilingKrw: 635, runsApproved: 1, runsDone: 0 } },
  { name: "compat-pair-p1", label: "리포트 궁합 실제 AI 1건 (가상 인물 P01 · P02) — 운영자 승인 2026-10-17 A안(총 6,000원, 누적 2,468원 포함)", kind: "pair", capKrw: 6000, restrict: { runCeilingKrw: 680.15, runsApproved: 1, runsDone: 0 } },
];

/**
 * 1단계 승인(운영자 2026-10-13, 재시도 포함 3,000원)의 사용 기록. 실제 호출은 운영자 PC의 비교 실행(pilot-data, 저장소에 올라가지 않음)이었고 합계는 운영자가 확인한 값이다.
 * 새 호출을 할 때마다 운영자가 확인한 누적액으로 고친다. 이 값은 호출 전 안전선(채팅 시험 상한)의 근거일 뿐 호출을 허락하지 않는다.
 */
// 2026-10-17: story-p01 실행(371원)은 4,000원 승인(누적 2,097원 포함)의 사용분이라 이 1단계 장부(3,000원 승인 · 채팅 시험 상한의 근거)를 바꾸지 않는다 — 누적 2,468원 · 남은 1,532원은 story-p01 단계 설명과 docs에 적었다.
export const STAGE1_LEDGER = { approvedKrw: 3000, spentKrw: 2097, asOf: "2026-10-16" } as const;

/**
 * 채팅 자유 질문의 실제 AI 시험이 넘을 수 없는 상한 — 남은 승인 금액(approved − spent) 안에서 여유를 둔 값이다.
 * 이 안에서도 호출하려면 운영자가 .env.local에 승인 금액 · 호출 수 · 기간을 직접 적어야 한다(AI_CHAT_APPROVED_*). 적지 않으면 호출하지 않는다.
 */
export const CHAT_TEST_LIMITS = { maxCapKrw: 900, maxCalls: 40, maxDays: 3 } as const;

/** 채팅 질문에 쓰는 모델 — 후보 A. 가격 · 모델 ID가 어긋나지 않게 이 한 곳에서만 정한다 */
export const CHAT_AI_MODEL = AI_CANDIDATES[0];

/**
 * 실제 AI 시험(리포트 생성 + 채팅 질문)의 승인 — 운영자 승인 2026-10-15: **5,000원**. 1단계 비교 승인(3,000원, STAGE1_LEDGER)과 별개다.
 * 코드가 넘을 수 없는 상한이며, 이 안에서도 운영자가 .env.local에 승인 금액 · 호출 수 · 기간(AI_APPROVED_KRW · CALLS · FROM · THROUGH)을 직접 적어야만 호출한다.
 * 리포트 한 건은 고쳐 쓰기를 포함해 대략 300원대(8-4 기록 305~333원), 채팅 질문 한 건은 십여 원대(어림)라 호출 수 상한은 금액보다 먼저 닿지 않게 넉넉히 둔다.
 */
export const LIVE_TEST_LIMITS = { maxCapKrw: 5000, maxCalls: 60, maxDays: 7 } as const;
export const LIVE_TEST_APPROVAL = { approvedKrw: 5000, approvedOn: "2026-10-15", scope: "개인 통합 리포트 생성 + 채팅 질문 답변" } as const;

/** 리포트 생성에 쓰는 모델 — 후보 A(채팅과 같은 모델). 가격 · 모델 ID는 이 한 곳에서만 정한다 */
export const REPORT_AI_MODEL = AI_CANDIDATES[0];
