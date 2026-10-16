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
};

export const COMPARE_STAGES: CompareStageDef[] = [
  { name: "stage-1", label: "1단계: 가상 인물 2명 × 후보 2개 = 생성 4건", personaCount: 2, capKrw: 3000 },
  { name: "stage-2", label: "2단계: 가상 인물 10명 × 후보 2개 = 생성 20건 (1단계 결과를 보고 따로 승인)", personaCount: 10, capKrw: 8000 },
];

/**
 * 1단계 승인(운영자 2026-10-13, 재시도 포함 3,000원)의 사용 기록. 실제 호출은 운영자 PC의 비교 실행(pilot-data, 저장소에 올라가지 않음)이었고 합계는 운영자가 확인한 값이다.
 * 새 호출을 할 때마다 운영자가 확인한 누적액으로 고친다. 이 값은 호출 전 안전선(채팅 시험 상한)의 근거일 뿐 호출을 허락하지 않는다.
 */
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
