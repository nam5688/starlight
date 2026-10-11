// 검사 화면용 샘플 문항.
// 확정된 문항 세트(기존 V6 등)가 정해지면 이 파일만 교체한다.

export type Question = { id: string; text: string };

export type QuestionSection = {
  id: "mbti" | "temperament" | "attachment";
  title: string;
  description: string;
  questions: Question[];
};

export const scaleLabels = [
  "전혀 아니다",
  "아니다",
  "보통이다",
  "그렇다",
  "매우 그렇다",
] as const;

export const questionSections: QuestionSection[] = [
  {
    id: "mbti",
    title: "MBTI",
    description: "에너지 방향, 정보 인식, 판단, 생활 방식에 관한 문항입니다.",
    questions: [
      { id: "m1", text: "여러 사람과 어울린 뒤에는 혼자 쉬는 시간이 필요하다." },
      { id: "m2", text: "처음 만난 사람과도 대화를 쉽게 시작하는 편이다." },
      { id: "m3", text: "구체적인 사실보다 가능성과 아이디어에 더 끌린다." },
      { id: "m4", text: "설명서나 순서를 따라 하는 방식이 편하다." },
      { id: "m5", text: "결정할 때 감정보다 논리와 기준을 먼저 본다." },
      { id: "m6", text: "상대의 기분을 고려해 말을 고르는 편이다." },
      { id: "m7", text: "일정은 미리 정해 두어야 마음이 편하다." },
      { id: "m8", text: "계획이 바뀌어도 크게 개의치 않는다." },
    ],
  },
  {
    id: "temperament",
    title: "기질",
    description: "타고난 반응 경향(자극추구·위험회피·사회적 민감성·인내력)을 봅니다.",
    questions: [
      { id: "t1", text: "새롭고 낯선 경험을 일부러 찾아다니는 편이다." },
      { id: "t2", text: "결과가 불확실한 일은 시작 전에 오래 고민한다." },
      { id: "t3", text: "다른 사람의 인정이나 칭찬에 힘을 많이 얻는다." },
      { id: "t4", text: "보상이 늦더라도 한 번 시작한 일은 끝까지 한다." },
      { id: "t5", text: "지루한 일이 반복되면 금방 다른 것을 찾는다." },
      { id: "t6", text: "작은 실수도 오래 마음에 남는다." },
    ],
  },
  {
    id: "attachment",
    title: "애착",
    description: "가까운 관계에서의 불안과 회피 경향을 봅니다.",
    questions: [
      { id: "a1", text: "연락이 평소보다 늦으면 이유가 계속 신경 쓰인다." },
      { id: "a2", text: "상대가 나만큼 관계를 중요하게 여기는지 걱정된다." },
      { id: "a3", text: "가까운 사람에게 속마음을 털어놓는 것이 어렵다." },
      { id: "a4", text: "관계가 깊어지면 혼자만의 공간이 더 필요해진다." },
      { id: "a5", text: "갈등이 생기면 바로 대화로 풀고 싶다." },
      { id: "a6", text: "다른 사람에게 기대는 것이 불편하다." },
    ],
  },
];
