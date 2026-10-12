// 미유 자체 성향 질문 — 초안 0.1 (검토 전, 화면 · 저장에 연결하지 않음)
// 기질 · 성격 · 가까운 관계를 따로 살펴보는 상황형 30문항. 공식 검사(MBTI · TCI · 애착검사 등)의 문항을 가져오거나
// 표현만 바꾸지 않고 새로 썼다. 결과는 "지금 응답에서 나타난 경향"이며 진단 · 평생 유형이 아니다.
//
// 설계 문서: docs/assessment-design-v1.md (이 파일의 표를 scripts/render-assessment-draft.ts가 문서로 만든다)
// 검사: lib/assessment/drafts/situational-draft.test.ts

export const DRAFT_CONTENT_VERSION = "situational-0.1-draft";
export const DRAFT_SCORING_VERSION = "situational-scoring-0.1-draft";

export type Domain = "temperament" | "character" | "relation";

export const DOMAIN_LABEL: Record<Domain, string> = {
  temperament: "기질적 경향",
  character: "성격적 경향",
  relation: "가까운 관계 패턴",
};

export type PerspectiveId = "T1" | "T2" | "T3" | "T4" | "T5" | "C1" | "C2" | "C3" | "C4" | "R1" | "R2" | "R3" | "R4";

export type Perspective = {
  domain: Domain;
  name: string;
  /** 점수가 높은 쪽(+)과 낮은 쪽(−)의 모습 — 좋고 나쁨이 아니라 방향 */
  high: string;
  low: string;
  /** 측정하려는 것 (리포트에서 어떻게 쓰는가) */
  purpose: string;
  /** 대표 경향 12유형 설계(tendency-v2)의 7개 관점에 쓰는가 */
  usedByTypes: boolean;
};

export const PERSPECTIVES: Record<PerspectiveId, Perspective> = {
  T1: { domain: "temperament", name: "새로움에 끌리는 정도", high: "새로운 것 · 낯선 것에 먼저 끌린다", low: "익숙한 방식 · 검증된 것이 편하다", purpose: "시작 · 변화 · 낯선 사람 앞에서의 첫 반응", usedByTypes: true },
  T2: { domain: "temperament", name: "불확실함에 대비하는 정도", high: "미리 알아보고 대비한 뒤 움직인다", low: "일단 부딪혀 보고 생기면 대처한다", purpose: "결정 속도 · 준비 방식 · 위험을 대하는 태도", usedByTypes: true },
  T3: { domain: "temperament", name: "감정이 올라오는 크기", high: "감정이 크게 올라오고 오래 남는다", low: "감정이 덜 흔들리고 금세 지나간다", purpose: "예상 밖 · 비판 · 어긋남 앞에서 감정이 움직이는 모양 (좋고 나쁨 아님)", usedByTypes: false },
  T4: { domain: "temperament", name: "주변 반응에 움직이는 정도", high: "주변의 반응 · 인정이 의욕과 방향을 움직인다", low: "주변 반응과 상관없이 내 속도로 한다", purpose: "동기가 어디서 오는지 — 일 · 학업 · 관계에서의 에너지 원천", usedByTypes: true },
  T5: { domain: "temperament", name: "끝까지 이어가는 정도", high: "재미가 줄어도 정한 것을 이어 간다", low: "흥미가 식으면 멈추거나 옮긴다", purpose: "지속 · 마무리 · 루틴 — 장기 목표의 모양", usedByTypes: true },
  C1: { domain: "character", name: "스스로 방향을 세우는 정도", high: "목표와 계획을 스스로 세우고 끌고 간다", low: "상황 · 다른 사람이 정하는 쪽에 맞춰 흘러간다", purpose: "목표를 정하고 실행하는 방식 · 책임을 지는 방식", usedByTypes: true },
  C2: { domain: "character", name: "행동을 늦춰 고르는 정도", high: "느낀 즉시 움직이지 않고 한 박자 쉰 뒤 고른다", low: "느끼는 즉시 말하고 움직인다", purpose: "자기조절 — 충동 · 감정이 올라올 때 행동이 나오는 속도", usedByTypes: false },
  C3: { domain: "character", name: "상대에게 맞추는 정도", high: "상대의 입장 · 필요에 맞추고 협력을 앞세운다", low: "내 기준 · 필요를 앞세운다", purpose: "협력 · 양보 · 자기 주장의 균형", usedByTypes: true },
  C4: { domain: "character", name: "의미 · 이유를 기준으로 고르는 정도", high: "납득되는 이유 · 의미 · 가치가 우선이다", low: "쓸모 · 결과 · 현실 조건이 우선이다", purpose: "가치관과 선택 — 무엇에 돈 · 시간 · 에너지를 쓰는가", usedByTypes: true },
  R1: { domain: "relation", name: "불확실할 때 확인하고 싶은 마음", high: "확인 · 연락 · 대화로 안심을 구한다", low: "확인하지 않고 기다리거나 각자 둔다", purpose: "가까운 사람의 반응이 불확실할 때의 첫 행동", usedByTypes: false },
  R2: { domain: "relation", name: "가까울수록 혼자 시간이 필요한 마음", high: "가까울수록 혼자 있는 시간 · 거리가 필요하다", low: "자주 함께 있고 공유하는 것이 편하다", purpose: "친밀감과 개인 시간의 균형", usedByTypes: false },
  R3: { domain: "relation", name: "불편할 때 말을 꺼내는 속도", high: "불편하면 바로 이야기한다", low: "시간을 두고 정리한 뒤 이야기하거나 넘긴다", purpose: "갈등 해결 — 말을 꺼내는 시점", usedByTypes: false },
  R4: { domain: "relation", name: "마음을 말로 표현하는 정도", high: "마음 · 필요를 말로 직접 표현한다", low: "행동 · 분위기로 드러내거나 삼킨다", purpose: "연락과 표현 방식 — 말과 행동 중 무엇으로 전하는가", usedByTypes: false },
};

export const PERSPECTIVE_IDS = Object.keys(PERSPECTIVES) as PerspectiveId[];

/** 선택지가 관점 점수에 주는 방향과 세기 (+ 높은 쪽 · − 낮은 쪽, 1~2). 한 선택지는 최대 2개 관점에만 준다 */
export type Weights = Partial<Record<PerspectiveId, -2 | -1 | 1 | 2>>;

export type DraftOption = { id: "a" | "b" | "c" | "d"; text: string; w: Weights };

export type DraftItem = {
  id: string;
  domain: Domain;
  /** 문항 이름 (검토용) */
  topic: string;
  stem: string;
  /** 이 문항으로 알고 싶은 것 */
  purpose: string;
  options: [DraftOption, DraftOption, DraftOption, DraftOption];
};

/** 모든 문항에 같이 붙는 다섯 번째 선택지 — 점수에 넣지 않는다 (경험이 없거나 상황에 따라 너무 다른 경우를 억지로 고르게 하지 않는다) */
export const NA_OPTION_TEXT = "겪어 본 적이 없거나, 상황에 따라 너무 달라서 고르기 어려워요";

export const DRAFT_ITEMS: DraftItem[] = [
  // ── 기질적 경향 (Q01~Q11) ──────────────────────────────
  {
    id: "Q01", domain: "temperament", topic: "즉흥 제안",
    stem: "금요일 저녁, 친구가 \"내일 처음 가 보는 곳으로 당일치기 어때?\"라고 합니다. 가장 먼저 하는 행동에 가까운 것은?",
    purpose: "새로운 제안에 먼저 끌리는지, 준비부터 하는지 (새로움 · 대비)",
    options: [
      { id: "a", text: "일단 가자고 하고, 세부 계획은 가면서 정한다", w: { T1: 2, T2: -1 } },
      { id: "b", text: "가고 싶긴 한데 교통 · 날씨 · 비용부터 찾아본다", w: { T1: 1, T2: 2 } },
      { id: "c", text: "이번엔 쉬고 싶다고 하고, 다음에 평소 가던 곳을 제안한다", w: { T1: -2 } },
      { id: "d", text: "하루 일정이 어떻게 되는지 먼저 물어보고, 정해진 만큼만 간다", w: { T1: -1, T2: 1 } },
    ],
  },
  {
    id: "Q02", domain: "temperament", topic: "새 도구 도입",
    stem: "팀에서 쓰던 업무 도구를 바꿀 수 있다고 합니다. 새 도구는 평이 좋지만 아직 아무도 써 보지 않았습니다. 먼저 떠오르는 생각은?",
    purpose: "변화 앞의 첫 판단 (새로움 · 대비)",
    options: [
      { id: "a", text: "나 혼자 시범으로 써 보고 괜찮으면 팀에 알린다", w: { T1: 1, T2: 1 } },
      { id: "b", text: "지금 도구로 불편한 점이 구체적으로 무엇인지부터 따진다", w: { T1: -1, T2: 1 } },
      { id: "c", text: "쓰던 걸로 충분하다. 바꾸는 데 드는 시간이 아깝다", w: { T1: -2 } },
      { id: "d", text: "써 보면서 맞는지 보자. 안 맞으면 되돌리면 된다", w: { T1: 2, T2: -2 } },
    ],
  },
  {
    id: "Q03", domain: "temperament", topic: "반응 없는 장기 프로젝트",
    stem: "6개월 걸리는 개인 프로젝트를 시작했는데 3개월째 주변 반응이 거의 없습니다. 이때 가장 가까운 모습은?",
    purpose: "동기가 안에서 오는지 밖에서 오는지, 반응 없이 이어 가는지 (꾸준함 · 주변 반응)",
    options: [
      { id: "a", text: "방식을 바꾸거나 일부를 덜어 내서라도 계속 이어 간다", w: { T5: 1 } },
      { id: "b", text: "흥미가 줄면 잠시 두고 다른 일을 하다가, 마음이 돌아오면 다시 한다", w: { T5: -2 } },
      { id: "c", text: "반응과 상관없이 정한 분량을 계속 채운다", w: { T5: 2, T4: -1 } },
      { id: "d", text: "누군가에게 중간 결과를 보여 주고 반응을 받으면 속도가 붙는다", w: { T4: 2 } },
    ],
  },
  {
    id: "Q04", domain: "temperament", topic: "약속 장소가 닫힘",
    stem: "중요한 약속 당일, 예약한 곳이 갑자기 문을 닫았다는 연락을 받았습니다. 첫 몇 분 동안 가장 가까운 상태는?",
    purpose: "계획이 어긋났을 때 감정이 움직이는 모양 (감정 반응 · 상대 맞춤)",
    options: [
      { id: "a", text: "일단 상대에게 상황을 알리고 같이 정하자고 한다", w: { T3: -1, C3: 1 } },
      { id: "b", text: "당황스럽고 마음이 한동안 가라앉지 않는다", w: { T3: 2 } },
      { id: "c", text: "잠깐 짜증이 나지만 곧 다른 곳을 찾기 시작한다", w: { T3: 1 } },
      { id: "d", text: "별로 흔들리지 않고 바로 대안을 정한다", w: { T3: -2 } },
    ],
  },
  {
    id: "Q05", domain: "temperament", topic: "낯선 사람이 많은 모임",
    stem: "아는 사람이 거의 없는 모임에 초대받았습니다. 가기 전 마음에 가까운 것은?",
    purpose: "낯선 자리에 대한 첫 반응 (새로움 · 대비)",
    options: [
      { id: "a", text: "새로운 사람을 만날 수 있어 기대된다", w: { T1: 2, T2: -1 } },
      { id: "b", text: "누가 오는지, 어떤 분위기인지 먼저 알아보고 간다", w: { T2: 2 } },
      { id: "c", text: "아는 사람 한 명이라도 같이 갈 수 있으면 가겠다", w: { T1: -1, T2: 1 } },
      { id: "d", text: "꼭 가야 하는 자리가 아니라면 빠지는 편이다", w: { T1: -2 } },
    ],
  },
  {
    id: "Q06", domain: "temperament", topic: "사람들 앞에서 받은 지적",
    stem: "내가 한 일에 대해 동료가 여러 사람 앞에서 아쉬운 점을 지적했습니다. 그날 저녁의 모습에 가까운 것은?",
    purpose: "비판 앞에서 감정과 행동이 나오는 모양 (감정 반응 · 주변 반응 · 행동 조절)",
    options: [
      { id: "a", text: "다음에는 인정받을 수 있게 어떻게 고칠지부터 생각한다", w: { T4: 2 } },
      { id: "b", text: "맞는 지적인지 내용만 따져 보고, 감정은 금세 지나간다", w: { T3: -2, T4: -1 } },
      { id: "c", text: "그 자리에서 바로 맞받아 말했고, 나중에 말이 지나쳤나 생각한다", w: { T3: 1, C2: -2 } },
      { id: "d", text: "계속 곱씹으며 그때 한 말과 표정이 떠오른다", w: { T3: 2 } },
    ],
  },
  {
    id: "Q07", domain: "temperament", topic: "지루한 반복 업무",
    stem: "사흘 동안 같은 형식의 문서를 100건 정리해야 하는 일을 맡았습니다. 일하는 방식에 가까운 것은?",
    purpose: "지루함을 견디는 방식 (꾸준함 · 행동 조절)",
    options: [
      { id: "a", text: "더 쉬운 방법이나 자동화할 길이 없는지 찾는 데 먼저 시간을 쓴다", w: { T5: -1 } },
      { id: "b", text: "마감 전날까지 미루다가 몰아서 한다", w: { C2: -2 } },
      { id: "c", text: "하루 분량을 정해 두고 순서대로 끝까지 한다", w: { T5: 2, C2: 1 } },
      { id: "d", text: "지루해서 중간에 다른 일을 끼워 가며 한다", w: { T5: -1, C2: -1 } },
    ],
  },
  {
    id: "Q08", domain: "temperament", topic: "큰 구매 전",
    stem: "150만 원쯤 하는 물건을 사기로 마음먹었습니다. 결정하기까지의 모습에 가까운 것은?",
    purpose: "큰 결정 앞의 준비 방식과 기준 (대비 · 주변 반응)",
    options: [
      { id: "a", text: "주변 사람들이 쓰는 것, 평이 좋은 것을 따라 산다", w: { T4: 2, T2: -1 } },
      { id: "b", text: "후기와 가격 비교를 오래 하고, 그래도 불안해서 한 번 더 확인한다", w: { T2: 2 } },
      { id: "c", text: "필요한 기능만 정리해 두세 개로 좁히고 그날 정한다", w: { T2: 1 } },
      { id: "d", text: "내 마음에 들면 남들이 잘 안 쓰는 것도 바로 산다", w: { T2: -2, T4: -1 } },
    ],
  },
  {
    id: "Q09", domain: "temperament", topic: "사소한 일이 연달아 어긋난 아침",
    stem: "출근길에 버스를 놓치고 커피를 쏟는 등 사소한 일이 연달아 어긋났습니다. 그날 기분은 어떻게 흘러가는 편인가요?",
    purpose: "사소한 어긋남이 하루 감정에 미치는 영향 (감정 반응)",
    options: [
      { id: "a", text: "오전 내내 기분이 가라앉고 다른 일에도 영향이 간다", w: { T3: 2 } },
      { id: "b", text: "속상하지만 점심쯤이면 많이 풀린다", w: { T3: 1 } },
      { id: "c", text: "그런 일이 있었구나 하고 금방 잊는다", w: { T3: -2 } },
      { id: "d", text: "기분은 괜찮은데 몸이 피곤해져 일찍 쉬고 싶어진다", w: { T3: -1 } },
    ],
  },
  {
    id: "Q10", domain: "temperament", topic: "새 취미의 흥미가 식음",
    stem: "한 달 전에 시작한 새 취미가 요즘 처음만큼 재미있지 않습니다. 앞으로의 모습에 가까운 것은?",
    purpose: "흥미가 식을 때 이어 가는지 옮기는지 (꾸준함 · 새로움)",
    options: [
      { id: "a", text: "방법이나 도구를 바꿔서 흥미를 되살려 본다", w: { T5: 1, T1: 1 } },
      { id: "b", text: "흥미가 식었으니 접고, 다른 새로운 것을 찾아본다", w: { T5: -2, T1: 1 } },
      { id: "c", text: "가끔 생각날 때만 하고, 억지로 이어 가지는 않는다", w: { T5: -1, T1: -1 } },
      { id: "d", text: "재미가 없어도 일정 수준까지는 계속해 본다", w: { T5: 2 } },
    ],
  },
  {
    id: "Q11", domain: "temperament", topic: "위험이 있는 제안",
    stem: "아는 사람이 \"성공하면 크지만 실패할 수도 있는\" 새 사업을 같이 하자고 합니다. 먼저 하는 행동에 가까운 것은?",
    purpose: "위험이 있는 제안 앞의 첫 판단 (새로움 · 대비 · 의미)",
    options: [
      { id: "a", text: "내가 잘 아는 분야가 아니면 정중히 거절한다", w: { T1: -1, T2: 1 } },
      { id: "b", text: "돈보다, 그 일이 내가 하고 싶은 일인지부터 따져 본다", w: { C4: 2 } },
      { id: "c", text: "성공했을 때의 모습을 먼저 그려 보고 관심이 커진다", w: { T1: 2, T2: -1 } },
      { id: "d", text: "최악의 경우 얼마를 잃는지부터 계산한다", w: { T2: 2 } },
    ],
  },

  // ── 성격적 경향 (Q12~Q21) ──────────────────────────────
  {
    id: "Q12", domain: "character", topic: "모임 장소 정하기",
    stem: "친구 다섯 명이 모이는데 장소를 아직 못 정했습니다. 단체 대화방이 조용합니다. 가장 가까운 행동은?",
    purpose: "방향을 정하는 쪽인지 따르는 쪽인지, 내 의견과 상대 의견의 균형 (방향 · 상대 맞춤)",
    options: [
      { id: "a", text: "다들 편한 곳이 어디인지 한 명씩 물어본다", w: { C1: -1, C3: 2 } },
      { id: "b", text: "내가 후보 두 곳을 정해 올리고 의견을 모은다", w: { C1: 2, C3: 1 } },
      { id: "c", text: "누가 정하겠지 하고 기다렸다가, 정해지면 맞춘다", w: { C1: -2, C3: 1 } },
      { id: "d", text: "가고 싶은 곳이 있으면 분명히 말해서 그쪽으로 가자고 한다", w: { C1: 1, C3: -2 } },
    ],
  },
  {
    id: "Q13", domain: "character", topic: "회의에서 의견이 반박당함",
    stem: "회의에서 내가 낸 의견을 두 사람이 정면으로 반박했습니다. 그 뒤의 행동에 가까운 것은?",
    purpose: "반박 앞에서 방향을 지키는지 조정하는지 (방향 · 상대 맞춤 · 주변 반응)",
    options: [
      { id: "a", text: "근거를 더 모아서 다음 회의에서 다시 이야기한다", w: { C1: 2, C3: -1 } },
      { id: "b", text: "반박한 사람과 따로 이야기해 접점을 찾는다", w: { C1: 1, C3: 1 } },
      { id: "c", text: "다른 사람들이 어떻게 받아들였는지가 신경 쓰여 분위기를 살핀다", w: { T4: 2 } },
      { id: "d", text: "내 의견을 접고 다수 의견에 맞춘다", w: { C1: -2, C3: 1 } },
    ],
  },
  {
    id: "Q14", domain: "character", topic: "마감 앞의 충동",
    stem: "내일 마감인 일이 남았는데, 갑자기 오래 미뤄 둔 방 정리가 하고 싶어졌습니다. 어떻게 하는 편인가요?",
    purpose: "하고 싶은 마음과 해야 하는 일 사이의 조절 (행동 조절 · 방향)",
    options: [
      { id: "a", text: "하고 싶을 때 하는 게 효율적이라 정리부터 하고, 밤에 일을 몰아서 한다", w: { C2: -2 } },
      { id: "b", text: "정리를 20분만 하고 일로 돌아오기로 정해 두고 시작한다", w: { C2: 1, C1: 1 } },
      { id: "c", text: "마음이 안 잡히니 오늘은 정리로 보내고, 마감은 양해를 구한다", w: { C2: -1, C1: -2 } },
      { id: "d", text: "일부터 끝내고 정리는 그 뒤로 미룬다", w: { C2: 2, C1: 1 } },
    ],
  },
  {
    id: "Q15", domain: "character", topic: "새해 목표",
    stem: "새해를 맞아 올해 이루고 싶은 것을 정하려고 합니다. 가장 가까운 방식은?",
    purpose: "목표를 세우고 이어 가는 방식 (방향 · 꾸준함)",
    options: [
      { id: "a", text: "정해도 어차피 바뀌니 생기는 일에 맞춰 흘러가는 편이다", w: { C1: -2 } },
      { id: "b", text: "정해도 두세 달이면 흐지부지돼서 크게 기대하지 않는다", w: { C1: -1, T5: -2 } },
      { id: "c", text: "구체적인 목표와 단계, 날짜까지 적어 둔다", w: { C1: 2, T5: 1 } },
      { id: "d", text: "큰 방향만 정하고, 세부는 상황을 보며 정한다", w: { C1: 1, T5: -1 } },
    ],
  },
  {
    id: "Q16", domain: "character", topic: "화가 나는 메시지",
    stem: "퇴근 후 업무 메시지가 왔는데 나를 탓하는 듯한 말투입니다. 마음이 확 올라온 상태에서 가장 가까운 행동은?",
    purpose: "감정이 올라올 때 행동이 나오는 속도 (행동 조절 · 감정 반응)",
    options: [
      { id: "a", text: "별일 아니라고 생각하고 내일 출근해서 천천히 확인한다", w: { T3: -2, C2: 1 } },
      { id: "b", text: "바로 답장해서 내 입장을 분명하게 말한다", w: { C2: -2, T3: 1 } },
      { id: "c", text: "답장을 쓰다가 지우고, 한참 지난 뒤 정리해서 보낸다", w: { C2: 2, T3: 1 } },
      { id: "d", text: "읽고 넘기려 하지만 계속 신경이 쓰여 잠을 설친다", w: { T3: 2 } },
    ],
  },
  {
    id: "Q17", domain: "character", topic: "두 곳의 이직 제안",
    stem: "이직 제안이 두 곳에서 왔습니다. A는 보수가 높고 하는 일이 평범합니다. B는 보수가 낮지만 하는 일이 의미 있게 느껴집니다. 먼저 드는 생각은?",
    purpose: "선택 기준이 의미인지 현실 조건인지 (의미 · 쓸모)",
    options: [
      { id: "a", text: "생활이 안정돼야 다른 것도 할 수 있으니 A쪽이다", w: { C4: -2 } },
      { id: "b", text: "일이 납득돼야 오래 할 수 있으니 B쪽이다", w: { C4: 2 } },
      { id: "c", text: "B가 맞는 것 같지만 생활비 계산이 서야 정한다", w: { C4: 1 } },
      { id: "d", text: "A에서 경력을 쌓은 뒤 의미 있는 일로 옮길지 정한다", w: { C4: -1 } },
    ],
  },
  {
    id: "Q18", domain: "character", topic: "뜻밖의 100만 원",
    stem: "예상하지 못한 100만 원이 생겼습니다. 먼저 떠오르는 쓰임은?",
    purpose: "돈을 어디에 쓰는가로 보는 가치 기준 (의미 · 대비 · 행동 조절)",
    options: [
      { id: "a", text: "저축하거나 불릴 방법을 찾는다", w: { C4: -2, T2: 1 } },
      { id: "b", text: "필요했던 물건을 바로 산다", w: { C4: -1, C2: -1 } },
      { id: "c", text: "당장 쓸 곳이 떠오르지 않아 일단 두고 생각한다", w: { T2: 1, C2: 1 } },
      { id: "d", text: "배우고 싶던 것이나 의미 있게 느껴지는 곳에 쓴다", w: { C4: 2 } },
    ],
  },
  {
    id: "Q19", domain: "character", topic: "불공평한 일 분담",
    stem: "팀 프로젝트에서 내 몫이 다른 사람보다 눈에 띄게 많아졌습니다. 가장 가까운 대응은?",
    purpose: "내 필요와 팀의 필요가 부딪힐 때 (상대 맞춤 · 갈등 때 말 꺼내는 속도)",
    options: [
      { id: "a", text: "팀이 잘 돌아가는 게 우선이라 내가 더 한다", w: { C3: 2, R3: -1 } },
      { id: "b", text: "내 몫은 정해진 만큼만 하고 더는 맡지 않는다", w: { C3: -1, R3: 1 } },
      { id: "c", text: "내 일이 줄어들도록 분담을 다시 정하자고 말한다", w: { C3: -2, R3: 1 } },
      { id: "d", text: "당장은 말없이 하고, 끝난 뒤에 정리해서 이야기한다", w: { C3: 1, R3: -1 } },
    ],
  },
  {
    id: "Q20", domain: "character", topic: "급한 날의 부탁",
    stem: "내 일이 급한 날, 동료가 \"잠깐만 도와줄 수 있어?\"라고 합니다. 가까운 반응은?",
    purpose: "부탁을 받을 때 내 사정과 상대 사정의 균형 (상대 맞춤 · 마음 표현)",
    options: [
      { id: "a", text: "어렵다고만 말하고 이유는 길게 설명하지 않는다", w: { C3: -2, R4: -1 } },
      { id: "b", text: "내 일이 급하다고 솔직하게 말하고, 나중에 돕겠다고 한다", w: { C3: -1, R4: 1 } },
      { id: "c", text: "일단 도와주고, 내 일은 늦게까지 해서 맞춘다", w: { C3: 2 } },
      { id: "d", text: "부탁하는 사정을 먼저 물어보고, 정말 급하면 돕는다", w: { C3: 1 } },
    ],
  },
  {
    id: "Q21", domain: "character", topic: "가치와 어긋나는 지시",
    stem: "회사 방침이 내가 중요하게 여기는 가치와 어긋나는 일을 하라고 합니다. 먼저 하는 생각은?",
    purpose: "가치와 조직 · 관계의 요구가 부딪힐 때 (의미 · 상대 맞춤)",
    options: [
      { id: "a", text: "내 기준에 맞지 않으면 의견을 내고, 필요하면 거절한다", w: { C4: 2, C3: -1 } },
      { id: "b", text: "조직의 결정이니 따르되, 마음속으로 정리한다", w: { C4: -1, C3: 1 } },
      { id: "c", text: "어디까지 양보할 수 있는지 선을 정하고 그 안에서 협의한다", w: { C4: 1, C3: 1 } },
      { id: "d", text: "내 일이 아니라고 보고 크게 신경 쓰지 않는다", w: { C4: -2 } },
    ],
  },

  // ── 가까운 관계 패턴 (Q22~Q30) ─────────────────────────
  {
    id: "Q22", domain: "relation", topic: "연락이 뜸해짐",
    stem: "가까운 사람이 평소와 달리 이틀째 연락이 뜸합니다. 먼저 하는 행동에 가까운 것은?",
    purpose: "상대의 반응이 불확실할 때의 첫 행동 (확인 마음 · 혼자 시간)",
    options: [
      { id: "a", text: "무슨 일 있는지 직접 물어본다", w: { R1: 2 } },
      { id: "b", text: "내 일을 하며 연락을 기다린다", w: { R1: -2, R2: 1 } },
      { id: "c", text: "나도 연락을 줄이고, 상대가 먼저 연락하는지 본다", w: { R1: 1, R2: 1 } },
      { id: "d", text: "최근에 바쁜 일이 있었는지 떠올리며 가볍게 안부 한 줄을 보낸다", w: { R1: 1, R2: -1 } },
    ],
  },
  {
    id: "Q23", domain: "relation", topic: "이틀을 함께 보낸 뒤",
    stem: "연인이나 아주 친한 친구와 주말 이틀을 내내 함께 보냈습니다. 일요일 저녁의 마음은?",
    purpose: "함께 있은 뒤 필요한 것 — 더 함께인가, 혼자인가 (혼자 시간 · 확인 마음)",
    options: [
      { id: "a", text: "좋았다. 다음 약속을 바로 잡고 싶다", w: { R2: -1, R1: 1 } },
      { id: "b", text: "중간에 혼자 있는 시간이 있었으면 더 좋았을 것 같다", w: { R2: 1 } },
      { id: "c", text: "더 같이 있고 싶고 헤어지는 게 아쉽다", w: { R2: -2 } },
      { id: "d", text: "즐거웠지만 이제 혼자 쉬는 시간이 필요하다", w: { R2: 2 } },
    ],
  },
  {
    id: "Q24", domain: "relation", topic: "사과 없이 늦은 약속",
    stem: "가까운 사람이 약속 시간에 30분 늦으면서 별다른 사과를 하지 않았습니다. 서운한 마음이 들었을 때 가장 가까운 행동은?",
    purpose: "서운함을 말하는 시점과 방식 (말 꺼내는 속도 · 마음 표현)",
    options: [
      { id: "a", text: "별일 아니라고 넘기고, 같은 일이 반복되면 그때 말한다", w: { R3: -2, R4: -1 } },
      { id: "b", text: "그 자리에서 서운하다고 바로 말한다", w: { R3: 2, R4: 2 } },
      { id: "c", text: "그 자리에서는 웃고, 며칠 뒤에 정리해서 이야기한다", w: { R3: -1, R4: 1 } },
      { id: "d", text: "표정이나 말투가 조금 차가워지고, 상대가 알아채기를 기다린다", w: { R3: -1, R4: -2 } },
    ],
  },
  {
    id: "Q25", domain: "relation", topic: "위치 · 일정 공유 제안",
    stem: "연인이 \"서로 위치나 일정을 앱으로 공유하면 편할 것 같아\"라고 제안합니다. 마음에 가까운 것은?",
    purpose: "공유와 개인 영역의 균형 (혼자 시간 · 확인 마음)",
    options: [
      { id: "a", text: "좋다. 서로 어디 있는지 알면 안심이 된다", w: { R2: -2, R1: 1 } },
      { id: "b", text: "필요한 일정만 공유하면 좋겠다", w: { R2: 1 } },
      { id: "c", text: "편하긴 하겠지만 내 시간을 들여다보는 느낌이 들어 부담스럽다", w: { R2: 2 } },
      { id: "d", text: "서로 편한 쪽이면 괜찮다. 크게 상관없다", w: { R2: -1 } },
    ],
  },
  {
    id: "Q26", domain: "relation", topic: "말수가 줄어든 상대",
    stem: "함께 있는 사람이 평소보다 말수가 줄었습니다. 이유는 모르겠습니다. 어떻게 하나요?",
    purpose: "상대의 기분이 불확실할 때 확인하는 방식 (확인 마음 · 마음 표현)",
    options: [
      { id: "a", text: "\"무슨 일 있어?\" 하고 바로 물어본다", w: { R1: 1, R4: 2 } },
      { id: "b", text: "말하고 싶으면 하겠지 하고 평소처럼 대한다", w: { R1: -2, R4: -1 } },
      { id: "c", text: "분위기를 풀어 보려고 가벼운 이야기를 꺼낸다", w: { R1: 1, R4: -2 } },
      { id: "d", text: "혹시 내가 한 일 때문인지 되짚어 보고, 조심스럽게 물어본다", w: { R1: 2, R4: 1 } },
    ],
  },
  {
    id: "Q27", domain: "relation", topic: "관계의 앞날을 이야기할 때",
    stem: "연인이나 가까운 사람과 앞으로의 일(이사, 동거, 진로 등)에 대해 이야기해야 할 때가 왔습니다. 가장 가까운 모습은?",
    purpose: "중요한 이야기를 꺼내는 시점과 방식 (말 꺼내는 속도 · 마음 표현)",
    options: [
      { id: "a", text: "상대가 먼저 말을 꺼내기를 기다린다", w: { R3: -1, R4: -2 } },
      { id: "b", text: "자연스러운 대화 중에 슬쩍 운을 띄우며 반응을 본다", w: { R3: 1, R4: -1 } },
      { id: "c", text: "내가 먼저 꺼내서 생각을 이야기한다", w: { R3: 2, R4: 2 } },
      { id: "d", text: "내 마음이 정리될 때까지 기다렸다가 말한다", w: { R3: -2, R4: 1 } },
    ],
  },
  {
    id: "Q28", domain: "relation", topic: "함께 사는 저녁",
    stem: "연인이나 가족과 함께 사는데, 퇴근 후 저녁을 어떻게 보내는 것이 가장 편한가요?",
    purpose: "일상 속 친밀감과 개인 시간 (혼자 시간 · 마음 표현)",
    options: [
      { id: "a", text: "함께 외출이나 활동을 하는 편이 편하다", w: { R2: -1 } },
      { id: "b", text: "같이 밥 먹고 하루 이야기를 나누는 시간이 있어야 편하다", w: { R2: -2, R4: 1 } },
      { id: "c", text: "같이 있되 각자 할 일을 하는 편이 편하다", w: { R2: 1 } },
      { id: "d", text: "잠깐 혼자만의 시간을 갖고 나서 같이 시간을 보낸다", w: { R2: 2 } },
    ],
  },
  {
    id: "Q29", domain: "relation", topic: "말다툼 뒤의 어색한 하루",
    stem: "가까운 사람과 말다툼을 한 뒤 어색한 하루가 지났습니다. 가장 가까운 행동은?",
    purpose: "갈등 뒤 관계를 풀어 가는 방식 (말 꺼내는 속도 · 상대 맞춤)",
    options: [
      { id: "a", text: "먼저 다가가 이야기를 꺼내 풀려고 한다", w: { R3: 2, C3: 1 } },
      { id: "b", text: "상대가 풀 때까지 시간을 두고 기다린다", w: { R3: -2, C3: -1 } },
      { id: "c", text: "내가 잘못한 부분만 먼저 사과하고, 나머지는 나중에 이야기한다", w: { R3: 1, C3: 2 } },
      { id: "d", text: "분위기를 가볍게 만들며 자연스럽게 풀리게 한다", w: { R3: -1, C3: 1 } },
    ],
  },
  {
    id: "Q30", domain: "relation", topic: "알게 된 지 한 달, 늦어진 답장",
    stem: "알게 된 지 한 달 된 사람에게 호감이 생겼습니다. 상대의 답장이 오전엔 빠르다가 이틀째 늦습니다. 이때 가까운 마음은?",
    purpose: "관계 초기에 반응이 느려질 때의 마음 (확인 마음 · 감정 반응)",
    options: [
      { id: "a", text: "바쁜가 보다 하고 내 일을 한다", w: { R1: -2, T3: -1 } },
      { id: "b", text: "나도 비슷한 속도로 답한다", w: { R1: -1 } },
      { id: "c", text: "궁금하면 바로 한 번 더 연락해 본다", w: { R1: 2, T3: -1 } },
      { id: "d", text: "자꾸 생각이 나서 다른 일에 집중이 안 된다", w: { R1: 1, T3: 2 } },
    ],
  },
];

export const ITEM_BY_ID: Record<string, DraftItem> = Object.fromEntries(DRAFT_ITEMS.map((i) => [i.id, i]));

/** 관점별 지표 수 — 어떤 문항이 그 관점에 점수를 주는가 */
export function indicatorCounts(): Record<PerspectiveId, number> {
  const out = Object.fromEntries(PERSPECTIVE_IDS.map((p) => [p, 0])) as Record<PerspectiveId, number>;
  for (const item of DRAFT_ITEMS) {
    const touched = new Set<PerspectiveId>();
    for (const o of item.options) for (const p of Object.keys(o.w) as PerspectiveId[]) touched.add(p);
    for (const p of touched) out[p] += 1;
  }
  return out;
}

// ───────────────────────── 채점 (초안 규칙) ─────────────────────────

export type DraftAnswers = Record<string, "a" | "b" | "c" | "d" | "na">;

export type Strength = "clear" | "slight" | "even";

export type PerspectiveResult =
  | { status: "hold"; reason: "too-few-indicators"; answered: number }
  | {
      status: "ok";
      /** 0~100 응답 환산값 (50이 가운데). 백분위 · 정확도가 아니다 */
      score: number;
      /** 뚜렷(가운데에서 20 이상) · 약간(10~20) · 고르게(10 미만) */
      strength: Strength;
      direction: "high" | "low" | "even";
      /** 문항마다 방향이 갈렸는가 — 상황에 따라 달라지는 편 */
      situational: boolean;
      answered: number;
    };

/** 한 관점의 점수가 의미를 가지려면 필요한 응답한 지표 수 */
export const MIN_INDICATORS = 3;
export const CLEAR_DISTANCE = 20;
export const SLIGHT_DISTANCE = 10;
/** 문항별 기여값의 표준편차가 이 값 이상이고 양쪽 방향이 모두 뚜렷하면 "상황에 따라 다름" */
export const SITUATIONAL_SPREAD = 0.7;
/** 위 · 아래 방향(±0.5 이상)이 각각 이 수 이상 있어야 한다 */
export const SITUATIONAL_MIN_EACH = 1;

export type SituationalRule = { spread: number; minEach: number };
export const SITUATIONAL_RULE: SituationalRule = { spread: SITUATIONAL_SPREAD, minEach: SITUATIONAL_MIN_EACH };

/** 문항별 기여값이 양쪽으로 크게 갈렸는가. 규칙은 시범 응답으로 다시 맞춘다 (reliability-sim.ts: 지금 규칙은 소음에도 자주 켜진다) */
export function isSituational(values: number[], rule: SituationalRule = SITUATIONAL_RULE): boolean {
  if (values.length === 0) return false;
  const mean = values.reduce((n, v) => n + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((n, v) => n + (v - mean) ** 2, 0) / values.length);
  const strongUp = values.filter((v) => v >= 0.5).length;
  const strongDown = values.filter((v) => v <= -0.5).length;
  return sd >= rule.spread && strongUp >= rule.minEach && strongDown >= rule.minEach;
}

/**
 * 문항 하나가 한 관점에 주는 기여값(−1~1). 그 문항의 선택지 네 개를 같은 확률로 고르는 사람이 0이 되도록 맞춘다
 * (선택지의 점수가 한쪽으로 치우친 문항도 점수를 한쪽으로 끌지 않게 한다). 가장 먼 선택지가 ±1이다.
 * 이 기준점은 시범 응답의 실제 분포로 다시 맞춘다 (docs/assessment-design-v1.md 8장).
 */
export function contribution(item: DraftItem, option: DraftOption["id"], p: PerspectiveId): number | null {
  const touched = item.options.some((o) => o.w[p] !== undefined);
  if (!touched) return null;
  const values: number[] = item.options.map((o) => o.w[p] ?? 0);
  const mean = values.reduce((n, v) => n + v, 0) / values.length;
  const reach = Math.max(...values.map((v) => Math.abs(v - mean)));
  if (reach === 0) return null;
  const chosen = item.options.find((o) => o.id === option)?.w[p] ?? 0;
  return (chosen - mean) / reach;
}

export function scoreDraft(answers: DraftAnswers): { perspectives: Record<PerspectiveId, PerspectiveResult>; skipped: number; answered: number } {
  const perspectives = {} as Record<PerspectiveId, PerspectiveResult>;
  for (const p of PERSPECTIVE_IDS) {
    const values: number[] = [];
    for (const item of DRAFT_ITEMS) {
      const a = answers[item.id];
      if (!a || a === "na") continue;
      const c = contribution(item, a, p);
      if (c !== null) values.push(c);
    }
    if (values.length < MIN_INDICATORS) {
      perspectives[p] = { status: "hold", reason: "too-few-indicators", answered: values.length };
      continue;
    }
    const mean = values.reduce((n, v) => n + v, 0) / values.length;
    const score = Math.round(50 + 50 * mean);
    const distance = Math.abs(score - 50);
    const strength: Strength = distance >= CLEAR_DISTANCE ? "clear" : distance >= SLIGHT_DISTANCE ? "slight" : "even";
    perspectives[p] = {
      status: "ok",
      score,
      strength,
      direction: strength === "even" ? "even" : score > 50 ? "high" : "low",
      situational: isSituational(values),
      answered: values.length,
    };
  }
  const answered = DRAFT_ITEMS.filter((i) => answers[i.id] && answers[i.id] !== "na").length;
  const skipped = DRAFT_ITEMS.length - answered;
  return { perspectives, skipped, answered };
}

/** 건너뛴(해당 없음 · 무응답) 문항이 이 수 이상이면 결과의 해석을 줄이고 다시 응답을 권한다 */
export const MANY_SKIPPED = 6;
