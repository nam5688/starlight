// 공개 안내(/assessment-basis)의 상황형 28문항 판 — 지금 화면의 질문이 28문항일 때 이 글이 보인다(lib/config/product.ts의 ASSESSMENT.active).
// 있는 그대로만 적되 짧게: 문항 문장은 외부 AI 도구의 추천을 받아 정리한 후보이고 미유가 처음부터 직접 쓴 문항이라고 말하지 않는다. 읽는 규칙은 미유가 정한 설계다.
// 하지 않은 것(타당도 · 신뢰도 · 정확도 · 전문가 검토 · 법률 검토 · 문장의 독립성 확인)은 했다고 쓰지 않고 "하지 못했다"고만 쓴다. 법적으로 문제가 없다는 확인이 아니다.
import { ASSESSMENT_MODULES } from "../modules/index.ts";
import { SITUATIONAL_CONTENT_VERSION, SITUATIONAL_READING_VERSION } from "./reading.ts";

export const SITUATIONAL_BASIS_UPDATED = "2026-10-20";

// 공개 안내는 짧게 쓴다(운영자 2026-10-20: 비진단 자기이해 서비스로 간결히 · 개발 내역을 길게 늘어놓지 않는다). 없는 확인을 했다고 쓰지 않는 규칙은 그대로다.

/** 어떤 성향을 살펴보나요 — 장면마다 무엇을 읽는지는 싣지 않는다(예측해서 답하게 되므로) */
export const SITUATIONAL_WHAT = [
  "일상 · 감정 · 가까운 관계 · 선택의 장면 28개에서, 내가 실제로 가장 먼저 할 것 같은 행동을 골라요. 좋고 나쁜 답은 없어요.",
  "한 장면의 답으로 성향을 정하지 않아요. 여러 장면의 답을 함께 보고, 답이 갈리면 평균 내지 않고 '상황에 따라 달라요'로 보여 줘요. 한쪽으로 읽을 만큼 모이지 않으면 읽지 않았다고 말해요.",
  "미유는 진단이 아니라 자기 이해를 돕는 서비스예요. 점수 · 백분위 · 정확도로 바꾸지 않아요.",
] as const;

export const SITUATIONAL_DEVELOPMENT = [
  "질문 문장은 외부 AI 도구의 추천을 받아 정리한 상황형 후보예요. 미유가 처음부터 직접 쓴 문항이라고 말하지 않아요.",
  "답을 읽는 방법은 미유가 정했고, 아직 사람들에게 시험해 보지 않은 설계예요. 정식 검사가 아니에요.",
] as const;

export const SITUATIONAL_SOURCES = [
  { name: "외부 AI 도구가 추천한 문항 후보", used: "장면 28개와 선택지 112개의 문장을 그대로 쓰고 있어요.", scope: "문장의 출처 · 기존 검사와 닮은 정도 · 이용 조건은 확인하지 못했어요." },
  { name: "공식 성격 · 기질 · 애착 검사 (MBTI® · TCI · 성인 애착 척도 등)", used: "문항 · 번역문 · 채점표 · 규준 · 해석 문장을 가져오지 않았어요.", scope: "이용 허락을 받지 않았어요. 그래서 결과를 이 검사들의 점수나 유형으로 바꾸지 않고, 그 이름으로 보여 주지 않아요." },
] as const;

export const SITUATIONAL_CHECKED = [
  "읽는 규칙이 설계한 대로 계산되는지 가상의 응답으로 확인했어요. 검사가 사람을 잘 읽는지를 본 것은 아니에요.",
  "예전 22문항으로 저장된 결과는 바뀌지 않고, 두 질문의 답을 서로 환산하지 않아요.",
] as const;

export const SITUATIONAL_NOT_CHECKED = [
  "질문이 사람들에게 의도한 뜻으로 읽히는지, 같은 사람이 다시 답해도 비슷한지(신뢰도 · 타당도)는 확인하지 못했어요. 정확도를 말할 수 없어요.",
  "문장이 기존 검사와 닮았는지, 검사 저작권 · 법률 전문가의 검토는 받지 않았어요. 이 글은 그런 확인이 아니에요.",
] as const;

export const SITUATIONAL_STANCE_NOTE =
  "사주를 중심에 두고, 이 질문의 답은 그 풀이가 나에게 어떤 모습으로 나타나는지 구체적으로 보여 주는 데 써요. 높고 낮음이 좋고 나쁨도 아니에요.";

export type SituationalVersionRow = { label: string; version: string; note: string };

export function situationalVersionRows(): SituationalVersionRow[] {
  return [
    { label: "지금 화면의 질문 (상황형 28문항)", version: SITUATIONAL_CONTENT_VERSION, note: "장면 28개 · 선택지 112개" },
    { label: "읽는 방법", version: SITUATIONAL_READING_VERSION, note: "여러 장면을 함께 읽는 규칙" },
    ...ASSESSMENT_MODULES.map((m) => ({ label: `예전 22문항 · ${m.title}`, version: m.version, note: "이미 저장된 결과가 쓰는 질문 · 지금은 새로 묻지 않아요" })),
  ];
}
