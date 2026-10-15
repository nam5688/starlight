import type { AssessmentModule } from "../types.ts";

// 개발용 예시 문항 — 직접 작성한 화면 확인용 문항이다. 공식 MBTI® 문항 · 채점표 · 유형 설명을 가져오지 않았고, 결과를 MBTI 유형(네 글자)으로 바꾸거나 MBTI라고 부르지 않는다.
// 이 모듈의 이름은 예전에 "MBTI 성향"이었다(내부 id mbti는 저장된 기록과 맞추려고 그대로 둔다). 지금 화면 이름은 "평소 행동 방식"이고 글자 코드(E/I 같은)는 쓰지 않는다.
// 구조 기록: 네 가지 방향(에너지 · 정보 · 판단 · 생활)이 널리 알려진 성격 유형론의 네 쌍과 개념적으로 대응한다 — 문항별 기록은 내부(lib/assessment/provenance.ts · docs/assessment-item-records.md)에 두고, 공개 페이지(/assessment-basis)는 요약만 보여 준다.
// 운영 문항은 독립 설계(docs/assessment-life-behavior-v1.md)로 교체하기 전까지 status: "dev-example"이며 운영에 쓰지 않는다.
export const mbtiModule: AssessmentModule = {
  id: "mbti",
  title: "평소 행동 방식",
  intro: "평소 에너지를 얻는 방식, 정보를 받아들이는 방식, 결정하는 방식, 생활 방식에 대해 묻습니다.",
  status: "dev-example",
  version: "dev-0.1",
  dimensions: [
    {
      id: "ei",
      label: "에너지를 채우는 방식",
      lowName: "함께하며 채움",
      highName: "혼자 정리하며 채움",
      lowMeaning: "사람·활동과 함께할 때 에너지가 생깁니다",
      highMeaning: "혼자 정리하는 시간에서 에너지가 생깁니다",
    },
    {
      id: "sn",
      label: "정보를 받아들이는 방식",
      lowName: "사실 · 경험 먼저",
      highName: "가능성 · 의미 먼저",
      lowMeaning: "구체적인 사실과 경험을 먼저 봅니다",
      highMeaning: "가능성과 전체적인 의미를 먼저 봅니다",
    },
    {
      id: "tf",
      label: "판단하는 기준",
      lowName: "논리 · 기준 먼저",
      highName: "사람 · 관계 먼저",
      lowMeaning: "논리와 기준이 맞는지를 먼저 따집니다",
      highMeaning: "사람과 관계에 미칠 영향을 먼저 봅니다",
    },
    {
      id: "jp",
      label: "생활을 꾸리는 방식",
      lowName: "미리 정해 두기",
      highName: "그때그때 맞추기",
      lowMeaning: "미리 계획하고 정해 두는 것이 편합니다",
      highMeaning: "상황에 맞춰 유연하게 움직이는 것이 편합니다",
    },
  ],
  items: [
    { id: "m1", dimension: "ei", text: "여러 사람과 시간을 보낸 뒤에는 혼자 쉬는 시간이 필요하다." },
    { id: "m2", dimension: "ei", reverse: true, text: "처음 만난 사람과도 먼저 대화를 시작하는 편이다." },
    { id: "m3", dimension: "sn", text: "설명을 들을 때 구체적인 사례보다 전체적인 의미가 먼저 궁금하다." },
    { id: "m4", dimension: "sn", reverse: true, text: "새로운 일을 배울 때 정해진 순서대로 따라 하는 것이 편하다." },
    { id: "m5", dimension: "tf", text: "결정할 때 그 결정이 주변 사람에게 미칠 영향을 먼저 생각한다." },
    { id: "m6", dimension: "tf", reverse: true, text: "의견이 다를 때는 감정보다 근거가 맞는지를 먼저 따진다." },
    { id: "m7", dimension: "jp", text: "계획이 없어도 그때그때 정하면서 움직이는 것이 편하다." },
    { id: "m8", dimension: "jp", reverse: true, text: "약속이나 일정은 미리 정해 두어야 마음이 놓인다." },
  ],
};
