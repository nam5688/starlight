import type { AssessmentModule } from "../types.ts";

// 출처 점검(2026-10-15, docs/assessment-source-audit.md): 이 파일의 방향 구성은 기존 이론의 구성과 닮았다 — 두 방향이 성인 애착 연구의 두 차원(불안 · 회피)과 대응한다.
// 문장 · 채점표 · 규준 · 유형 이름은 가져오지 않았지만, "자체 개발"이라는 이름만으로 구성이 독립이 되지는 않는다.
// 그래서 화면에 연결하지 않고(또는 개발용 예시로만 두고), 생활 행동에서 출발한 독립 설계(drafts/life-behavior-v1.ts)와 검사 저작권 전문가 검토를 거치기 전에는 쓰지 않는다.

// 개발용 예시 문항 — 직접 작성한 화면 확인용 문항이며 기존 애착 검사(ECR 등)의 문항이 아니다.
// 임상 진단 도구가 아니다. 운영 척도가 정해지면 교체한다.
export const relationshipModule: AssessmentModule = {
  id: "relationship",
  title: "관계(애착)",
  intro: "가까운 관계에서 느끼는 마음과 평소 행동에 대해 물어요.",
  status: "dev-example",
  version: "dev-0.1",
  dimensions: [
    {
      id: "anxiety",
      label: "관계 불안",
      lowMeaning: "관계의 작은 신호에 크게 흔들리지 않아요",
      highMeaning: "관계가 불확실하면 상대의 반응을 확인하고 싶어집니다",
    },
    {
      id: "avoidance",
      label: "거리 두기",
      lowMeaning: "가까워지고 기대는 것이 비교적 편해요",
      highMeaning: "가까워질수록 혼자만의 거리가 필요해요",
    },
  ],
  items: [
    { id: "r1", dimension: "anxiety", text: "연락이 평소보다 늦으면 이유가 계속 신경 쓰인다." },
    { id: "r2", dimension: "anxiety", text: "상대가 나만큼 이 관계를 중요하게 여기는지 걱정될 때가 있다." },
    { id: "r3", dimension: "anxiety", reverse: true, text: "관계에서 작은 오해가 생겨도 크게 불안하지 않다." },
    { id: "r4", dimension: "avoidance", text: "가까운 사람에게도 속마음을 털어놓기가 어렵다." },
    { id: "r5", dimension: "avoidance", text: "관계가 깊어질수록 혼자만의 시간이 더 필요해진다." },
    { id: "r6", dimension: "avoidance", reverse: true, text: "힘들 때 가까운 사람에게 기대는 것이 편하다." },
  ],
};
