// 공개 안내(/assessment-basis)의 상황형 28문항 판 — 지금 화면의 질문이 28문항일 때 이 글이 보인다(lib/config/product.ts의 ASSESSMENT.active).
// 있는 그대로만 적는다: 문항 문장은 운영자가 외부 AI 도구의 추천을 받아 전달한 후보이고 미유가 처음부터 직접 쓴 문항이라고 말하지 않는다. 읽는 규칙은 미유가 새로 정한 설계 가설이다.
// 하지 않은 것(타당도 · 신뢰도 · 정확도 · 전문가 검토 · 법률 검토 · 문장의 독립성 확인)은 했다고 쓰지 않고 "하지 못했다"고만 쓴다. 법적으로 문제가 없다는 확인이 아니다.
import { SITUATIONAL_V2_PARTS, SITUATIONAL_V2_VERSION } from "../drafts/situational-v2-draft.ts";
import { ASSESSMENT_MODULES } from "../modules/index.ts";
import { SITUATIONAL_CONTENT_VERSION, SITUATIONAL_READING_VERSION } from "./reading.ts";

export const SITUATIONAL_BASIS_UPDATED = "2026-10-20";

/** 어떤 성향을 살펴보나요 — 묶음 이름은 알려 주되 장면마다 무엇을 읽는지는 싣지 않는다(예측해서 답하게 되므로) */
export const SITUATIONAL_WHAT = [
  `일상과 판단 · 에너지와 감정 반응 · 가까운 관계에서 · 선택과 관계의 실제 조율, 이렇게 네 묶음의 장면 ${SITUATIONAL_V2_PARTS.length * 7}개에서 내가 실제로 가장 먼저 할 것 같은 행동을 하나 골라요. 좋고 나쁜 답은 없어요.`,
  "한 장면의 답으로 성향을 정하지 않아요. 여러 장면의 답을 가로로 읽어서, 같은 모습이 서로 다른 장면에서 되풀이되는지, 장면에 따라 달라지는지를 봐요.",
  "장면마다 답이 갈리면 평균을 내지 않고 '상황에 따라 달라요'로 그대로 보여 줘요. 한쪽으로 읽을 만큼 장면이 모이지 않으면 읽지 않았다고 말해요.",
  "점수 · 백분위 · 정확도로 바꾸지 않아요. 진단이 아니에요.",
] as const;

export const SITUATIONAL_DEVELOPMENT = [
  "장면 28개와 선택지 112개의 문장은 운영자가 외부 AI 도구의 추천을 받아 전달한 후보 문항이에요. 미유가 처음부터 직접 쓴 문항이라고 말하지 않아요.",
  "문장은 받은 그대로 보존하고 있어요(글자까지 같은지 자동 테스트로 확인해요). 원문에는 점수나 읽는 규칙이 처음부터 없었어요.",
  "어느 선택지가 어떤 행동을 말하는지, 여러 장면을 가로로 읽는 방법, 개인 유형 이름을 붙이는 조건은 미유가 새로 정한 설계예요. 아직 사람에게 시험하지 않은 설계 가설이에요.",
  "읽을 수 없는 것은 읽지 않아요. 정보를 받는 방식(사실 · 의미)과 도움을 받는 방식은 이 질문 묶음에 장면이 모자라 지금은 읽지 못해요.",
  "지금 화면의 질문은 모두 개발용 예시이고 정식 검사가 아니에요.",
] as const;

export const SITUATIONAL_SOURCES = [
  { name: "외부 AI 도구가 추천한 문항 후보 (운영자 전달)", used: "장면 28개와 선택지 112개의 문장을 그대로 화면에 쓰고 있어요.", scope: "AI가 추천한 문장의 출처 · 기존 검사와 닮은 정도 · 이용 조건은 확인하지 못했어요. 정식 검사로 쓰기 전에 확인해야 해요." },
  { name: "공식 성격 · 기질 · 애착 검사 (MBTI® · TCI · 성인 애착 척도 등)", used: "문항 · 번역문 · 채점표 · 규준 · 해석 문장을 가져오지 않았고 가지고 있지도 않아요.", scope: "이용 허락을 받지 않았어요. 그래서 결과를 이 검사들의 점수나 유형으로 바꾸지 않고, 이 검사의 이름으로 결과를 보여 주지 않아요." },
  { name: "OpenPsychometrics 응답 데이터", used: "내려받지 않았고 어디에도 쓰지 않았어요.", scope: "이용 조건 문구를 찾지 못해 쓰지 않았어요. 공개돼 있다는 이유만으로 쓰지 않아요." },
] as const;

export const SITUATIONAL_CHECKED = [
  "읽는 규칙이 설계한 대로 움직이는지 자동 테스트로 확인했어요. 가상의 응답으로 본 것이고, 계산이 의도대로인지를 본 것이지 검사가 사람을 잘 읽는지를 본 것이 아니에요.",
  "일관되게 답한 가상 응답에는 개인 유형 이름 10개가 모두 붙을 수 있고, 장면마다 답이 엇갈리면 이름을 붙이지 않는 것을 확인했어요.",
  "예전 22문항으로 저장된 결과는 바뀌지 않고 그대로 열리는지, 두 질문의 답을 서로 환산하지 않는지 확인했어요.",
  "개발 저장소에 외부 검사의 문항 · 번역문 · 채점표 · 응답 데이터 파일이 없는 것을 점검했어요.",
] as const;

export const SITUATIONAL_NOT_CHECKED = [
  "장면과 선택지가 사람들에게 의도한 뜻으로 읽히는지(시범 인터뷰)는 아직 확인하지 못했어요.",
  "같은 사람이 다시 답해도 비슷한지, 타당한지(신뢰도 · 타당도)는 확인하지 못했어요. 정확도를 말할 수 없어요.",
  "AI가 추천한 문장이 기존 검사와 닮았는지, 이용해도 되는지 하나하나 대조하지 못했어요.",
  "검사 저작권을 다루는 전문가의 검토와 법률 검토는 받지 않았어요. 이 글은 그런 확인이 아니에요.",
] as const;

export const SITUATIONAL_STANCE_NOTE =
  "여러 장면의 답을 가로로 읽어 평소 행동 방식 · 막혔을 때의 첫 움직임 · 시도와 신중함 · 가까운 사이에서의 확인하는 방식과 갈등 뒤 푸는 순서를 따로 보여 줘요. 점수로 합치지 않고, 높고 낮음이 좋고 나쁨도 아니에요. 진단이 아니에요.";

export type SituationalVersionRow = { label: string; version: string; note: string };

export function situationalVersionRows(): SituationalVersionRow[] {
  return [
    { label: "지금 화면의 질문 (상황형 28문항)", version: SITUATIONAL_CONTENT_VERSION, note: "장면 28개 · 선택지 112개 · 개발용 예시" },
    { label: "문장 원문(받은 그대로)", version: SITUATIONAL_V2_VERSION, note: "운영자 전달 후보 문항" },
    { label: "읽는 규칙", version: SITUATIONAL_READING_VERSION, note: "미유가 정한 설계 가설 · 사람 시험 전" },
    ...ASSESSMENT_MODULES.map((m) => ({ label: `예전 22문항 · ${m.title}`, version: m.version, note: "이미 저장된 결과가 쓰는 질문 · 지금은 새로 묻지 않아요" })),
  ];
}
