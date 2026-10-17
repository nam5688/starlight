import type { AssessmentModule } from "../types.ts";

// 출처 점검(2026-10-15, docs/assessment-source-audit.md): 이 파일의 방향 구성은 기존 이론의 구성과 닮았다 — 네 방향이 기질을 네 가지로 나누는 기존 모델(자극 추구 · 위험 회피 · 보상 의존 · 인내력)과 이름 · 순서 · 뜻이 대응한다.
// 문장 · 채점표 · 규준 · 유형 이름은 가져오지 않았지만, "자체 개발"이라는 이름만으로 구성이 독립이 되지는 않는다.
// 그래서 화면에 연결하지 않고(또는 개발용 예시로만 두고), 생활 행동에서 출발한 독립 설계(drafts/life-behavior-v1.ts)와 검사 저작권 전문가 검토를 거치기 전에는 쓰지 않는다.

// 개발용 예시 문항 — 직접 작성한 화면 확인용 문항이며 TCI 등 기존 검사의 문항이 아니다.
// 지표 이름도 미유 개발용 임시 이름이다. 운영 척도가 정해지면 교체한다.
export const temperamentModule: AssessmentModule = {
  id: "temperament",
  title: "기질",
  intro: "새로운 일, 불확실한 상황, 다른 사람의 반응, 오래 걸리는 일에 대한 평소 반응을 물어요.",
  status: "dev-example",
  version: "dev-0.1",
  dimensions: [
    {
      id: "novelty",
      label: "새로움 추구",
      lowMeaning: "익숙하고 예측 가능한 방식을 선호해요",
      highMeaning: "새로운 경험과 변화를 찾아 나섭니다",
    },
    {
      id: "caution",
      label: "신중함",
      lowMeaning: "일단 해보면서 조정하는 편이에요",
      highMeaning: "시작 전에 위험과 변수를 먼저 살핍니다",
    },
    {
      id: "sensitivity",
      label: "타인 반응 민감도",
      lowMeaning: "다른 사람의 반응에 비교적 덜 흔들립니다",
      highMeaning: "다른 사람의 반응과 인정에 크게 영향을 받아요",
    },
    {
      id: "persistence",
      label: "지속성",
      lowMeaning: "상황이 바뀌면 방향을 빠르게 바꿉니다",
      highMeaning: "결과가 늦어도 시작한 일을 이어갑니다",
    },
  ],
  items: [
    { id: "t1", dimension: "novelty", text: "가보지 않은 장소나 해보지 않은 일에 먼저 끌린다." },
    { id: "t2", dimension: "novelty", reverse: true, text: "익숙한 방식이 있으면 굳이 바꾸고 싶지 않다." },
    { id: "t3", dimension: "caution", text: "결과가 불확실한 일은 시작 전에 여러 번 따져본다." },
    { id: "t4", dimension: "caution", reverse: true, text: "일단 시작하고 문제가 생기면 그때 고치는 편이다." },
    { id: "t5", dimension: "sensitivity", text: "다른 사람의 칭찬이나 반응이 의욕에 큰 영향을 준다." },
    { id: "t6", dimension: "sensitivity", reverse: true, text: "다른 사람이 어떻게 생각하든 내 판단대로 하는 편이다." },
    { id: "t7", dimension: "persistence", text: "결과가 바로 보이지 않아도 시작한 일은 끝까지 해본다." },
    { id: "t8", dimension: "persistence", reverse: true, text: "흥미가 떨어지면 하던 일을 멈추고 다른 일로 넘어간다." },
  ],
};
