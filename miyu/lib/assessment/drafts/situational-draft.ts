// 출처 점검(2026-10-15, docs/assessment-source-audit.md): 이 파일의 방향 구성은 기존 이론의 구성과 닮았다 — 기질 · 성격 · 가까운 관계로 나누는 구성과 13관점.
// 문장 · 채점표 · 규준 · 유형 이름은 가져오지 않았지만, "자체 개발"이라는 이름만으로 구성이 독립이 되지는 않는다.
// 그래서 화면에 연결하지 않고(또는 개발용 예시로만 두고), 생활 행동에서 출발한 독립 설계(drafts/life-behavior-v1.ts)와 검사 저작권 전문가 검토를 거치기 전에는 쓰지 않는다.
//
// 미유 자체 성향 질문 — 초안 0.2 (검토 전, 화면 · 저장에 연결하지 않음)
// 기질 · 성격 · 가까운 관계를 따로 살펴보는 상황형 30문항. 공식 검사(MBTI · TCI · 애착검사 등)의 문항을 가져오거나
// 표현만 바꾸지 않고 새로 썼다. 결과는 "지금 응답에서 나타난 경향"이며 진단 · 평생 유형이 아니다.
//
// 0.1과 달라진 점 (2026-10-13 운영자 의견 반영 — 문서: docs/assessment-design-v1.md, docs/assessment-design-review-2.md)
// - 문항마다 **주로 보는 관점 하나**(primary)만 정하고, 선택지는 그 관점에만 점수를 준다. 0.1은 한 선택지가 최대 2개 관점에 점수를 줘서
//   문항 30개가 지표 62개로 늘어났고, 같은 답이 두 관점에 함께 반영되어 점수끼리 구조적으로 얽혔다.
// - 관점마다 "무엇이고 무엇이 아닌지 · 이웃 관점과 어떻게 다른지"를 적었다 (특히 "맞춤"을 배려 · 거절하기 어려움 · 갈등 피하기와 구분).
// - 행동은 같아도 이유가 다를 수 있는 문항은 이유를 선택지에 적고, 목표 관점의 이유가 아닌 답은 점수에 넣지 않는다(unscored) — 이유만 따로 남긴다.
// - 같은 관점을 서로 다른 장면(일 · 친구 · 연애 · 가족 · 혼자 · 돈)에서 묻는다.
// - 세기는 두 가지로만 읽는다: 뚜렷한 방향(가운데에서 20 이상) 또는 "현재 응답만으로 뚜렷하지 않음". "약간"과 "고르게"를 나누지 않는다.
// - 문항 30개로 13관점을 모두 읽을 수는 없다: 서로 다른 문항 3개 미만인 관점은 판단을 보류한다 (coverage()).
//
// 이전 초안 0.1은 situational-draft-v01.ts에 동결해 두었다 (가상 응답 점검이 두 구조를 비교하는 용도).
// 검사: lib/assessment/drafts/situational-draft.test.ts

export const DRAFT_CONTENT_VERSION = "situational-0.2-draft";
export const DRAFT_SCORING_VERSION = "situational-scoring-0.2-draft";

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
  /** 이 관점이 가리키는 것 (한 문장) */
  means: string;
  /** 비슷해 보이지만 이 관점이 아닌 것 — 이 관점의 점수로 읽지 않는다 */
  notThis: string;
  /** 이웃 관점과 어떻게 구분하나 (같은 행동이어도 무엇을 보는가) */
  vs: string;
  /** 대표 경향 12유형 설계(tendency-v2)의 7개 관점에 쓰는가 */
  usedByTypes: boolean;
};

export const PERSPECTIVES: Record<PerspectiveId, Perspective> = {
  T1: {
    domain: "temperament", name: "새로움에 끌리는 정도", high: "새로운 것 · 낯선 것에 먼저 끌린다", low: "익숙한 방식 · 검증된 것이 편하다",
    purpose: "시작 · 변화 · 낯선 사람 앞에서의 첫 반응",
    means: "처음 해 보는 것 · 낯선 것을 마주했을 때 먼저 마음이 가는 정도",
    notThis: "위험을 감수하는 용기, 사교성(낯선 사람 앞에서의 편안함), 충동",
    vs: "T2(대비)는 끌린 뒤에 얼마나 알아보고 움직이는가. T1은 끌리는 마음 자체만 본다. 낯선 사람 장면은 사교성과 섞일 수 있어 시범에서 확인한다",
    usedByTypes: true,
  },
  T2: {
    domain: "temperament", name: "불확실함에 대비하는 정도", high: "미리 알아보고 대비한 뒤 움직인다", low: "일단 부딪혀 보고 생기면 대처한다",
    purpose: "결정 속도 · 준비 방식 · 위험을 대하는 태도",
    means: "앞일이 확실하지 않을 때 미리 알아보고 준비한 뒤 움직이는 정도",
    notThis: "걱정이 많음(T3), 행동이 느림(C2), 새로운 것을 싫어함(T1 낮음)",
    vs: "T1은 끌림, T2는 준비. 새로운 것을 좋아해도 준비를 철저히 할 수 있고(T1 높음 · T2 높음), 익숙한 것을 좋아해도 준비 없이 움직일 수 있다",
    usedByTypes: true,
  },
  T3: {
    domain: "temperament", name: "감정이 올라오는 크기", high: "감정이 크게 올라오고 오래 남는다", low: "감정이 덜 흔들리고 금세 지나간다",
    purpose: "예상 밖 · 어긋남 앞에서 감정이 움직이는 모양 (좋고 나쁨 아님)",
    means: "예상 밖의 일이 있을 때 마음속 감정이 얼마나 크게 · 오래 남는가",
    notThis: "감정을 말이나 표정으로 드러내는 정도(R4), 감정이 올라온 뒤 행동을 늦추는 정도(C2), 관계에서의 불안(R1)",
    vs: "T3은 느끼는 크기, R4는 드러내는 정도, C2는 올라온 뒤 행동까지의 속도. 많이 느끼지만 표현하지 않을 수 있다",
    usedByTypes: false,
  },
  T4: {
    domain: "temperament", name: "주변 반응에 움직이는 정도", high: "주변의 반응 · 인정이 의욕과 방향을 움직인다", low: "주변 반응과 상관없이 내 속도로 한다",
    purpose: "동기가 어디서 오는지 — 일 · 학업 · 관계에서의 에너지 원천",
    means: "주변의 반응 · 인정이 의욕과 방향에 영향을 주는 정도",
    notThis: "상대에게 맞춰 주는 행동(C3), 불편해도 말을 삼키는 것(R3), 예의",
    vs: "T4는 반응이 의욕을 움직이는가, C3는 결정에서 상대 필요를 함께 놓는가. 반응에 움직여도 내 방향을 고집할 수 있다",
    usedByTypes: true,
  },
  T5: {
    domain: "temperament", name: "끝까지 이어가는 정도", high: "재미가 줄어도 정한 것을 이어 간다", low: "흥미가 식으면 멈추거나 옮긴다",
    purpose: "지속 · 마무리 · 루틴 — 장기 목표의 모양",
    means: "흥미가 식은 뒤에도 정해 둔 것을 이어 가는 정도",
    notThis: "계획을 세우는 정도(C1), 의무감 · 책임감, 마감을 지키는 정도(C2)",
    vs: "C1은 방향을 세우는 것, T5는 세운 뒤 흥미가 줄어도 이어 가는 것. 계획은 잘 세워도 금방 식을 수 있다",
    usedByTypes: true,
  },
  C1: {
    domain: "character", name: "스스로 방향을 세우는 정도", high: "목표와 계획을 스스로 세우고 끌고 간다", low: "상황 · 다른 사람이 정하는 쪽에 맞춰 흘러간다",
    purpose: "목표를 정하고 실행하는 방식 · 책임을 지는 방식",
    means: "방향과 목표를 스스로 정하고 이끌어 가는 정도",
    notThis: "고집(남의 의견을 듣지 않음), 리더 직함, 남의 필요를 신경 쓰는 정도(C3)",
    vs: "C1은 방향을 누가 정하는가, C3는 정할 때 상대 필요를 함께 놓는가. 방향을 스스로 세우면서 상대 의견을 충분히 들을 수 있다",
    usedByTypes: true,
  },
  C2: {
    domain: "character", name: "행동을 늦춰 고르는 정도", high: "느낀 즉시 움직이지 않고 한 박자 쉰 뒤 고른다", low: "느끼는 즉시 말하고 움직인다",
    purpose: "자기조절 — 충동 · 감정이 올라올 때 행동이 나오는 속도",
    means: "마음이 올라왔을 때 바로 행동하지 않고 한 박자 쉰 뒤에 고르는 정도",
    notThis: "감정이 작음(T3), 불편한 이야기를 피함(R3), 신중한 성격 전반",
    vs: "T3은 감정의 크기, C2는 그 감정 뒤 행동이 나오는 속도. 감정이 커도 한 박자 쉴 수 있고, 작아도 바로 움직일 수 있다",
    usedByTypes: false,
  },
  C3: {
    domain: "character", name: "상대의 필요를 내 결정에 함께 놓는 정도", high: "결정할 때 상대의 사정 · 필요를 내 것과 같이 놓고 조율한다", low: "내 기준 · 필요를 앞세운다",
    purpose: "협력 · 양보 · 자기 주장의 균형 (배려의 동기)",
    means: "결정할 때 상대의 사정 · 필요를 내 것과 같은 무게로 놓고 조율하려는 정도 (배려 · 협력의 동기)",
    notThis: "거절하기 어려워서 따르는 것, 갈등이 싫어서 맞추는 것, 인정받고 싶어서 맞추는 것",
    vs: "같은 '맞춤' 행동도 이유가 다르면 다른 관점이다 — 거절하기 어려움은 이유로 따로 기록하고 이 점수에 넣지 않는다(unscored), 갈등 피하기는 R3, 인정받으려는 마음은 T4",
    usedByTypes: true,
  },
  C4: {
    domain: "character", name: "의미 · 이유를 기준으로 고르는 정도", high: "납득되는 이유 · 의미 · 가치가 우선이다", low: "쓸모 · 결과 · 현실 조건이 우선이다",
    purpose: "가치관과 선택 — 무엇에 돈 · 시간 · 에너지를 쓰는가",
    means: "선택할 때 납득되는 이유 · 의미 · 가치를 우선하는 정도",
    notThis: "돈에 관심이 없음(현실 조건을 우선하는 것은 나쁜 것이 아니다), 이상주의",
    vs: "C4는 무엇을 기준으로 고르는가. 의미를 우선해도 현실 조건을 꼼꼼히 계산할 수 있다(그때는 T2도 높다)",
    usedByTypes: true,
  },
  R1: {
    domain: "relation", name: "불확실할 때 확인하고 싶은 마음", high: "확인 · 연락 · 대화로 안심을 구한다", low: "확인하지 않고 기다리거나 각자 둔다",
    purpose: "가까운 사람의 반응이 불확실할 때의 마음과 첫 행동",
    means: "가까운 사람의 반응이 불확실할 때 확인으로 안심하고 싶은 마음 (연락하는 행동 자체가 아니라 그 마음)",
    notThis: "일정 · 약속 때문에 연락하는 것, 말을 잘 꺼내는 성격(R4), 불안 진단",
    vs: "연락한다는 행동은 같아도 이유가 다르다 — 마음이 쓰여서(R1)인지 약속을 정해야 해서인지는 이유로 구분하고, 약속 때문인 답은 점수에 넣지 않는다. R3은 서운함을 말하는 속도, R4는 마음을 말로 드러내는 정도",
    usedByTypes: false,
  },
  R2: {
    domain: "relation", name: "가까울수록 혼자 시간이 필요한 마음", high: "가까울수록 혼자 있는 시간 · 거리가 필요하다", low: "자주 함께 있고 공유하는 것이 편하다",
    purpose: "친밀감과 개인 시간의 균형",
    means: "가까운 사이에서도 혼자 있는 시간과 개인 영역이 필요한 정도",
    notThis: "그 사람이 싫음 · 관계에 대한 회피, 내향성 전반, 갈등 때문에 거리를 둠(R3)",
    vs: "R2는 평소의 거리 감각이고, R3은 불편한 일이 생겼을 때 말을 꺼내는 속도다. 혼자 시간이 필요해도 갈등은 바로 이야기할 수 있다",
    usedByTypes: false,
  },
  R3: {
    domain: "relation", name: "불편할 때 말을 꺼내는 속도", high: "불편하면 바로 이야기한다", low: "시간을 두고 정리한 뒤 이야기하거나 넘긴다",
    purpose: "갈등 해결 — 불편함을 상대에게 꺼내는 시점",
    means: "서운함 · 불편함을 느낀 뒤 그것을 상대에게 꺼내기까지의 속도",
    notThis: "화를 내는 정도, 마음을 표현하는 정도 전반(R4), 감정의 크기(T3)",
    vs: "R3은 불편한 일을 꺼내는 시점, R4는 평소 마음을 말로 전하는 정도. 늦게 꺼내는 이유(정리할 시간 · 갈등이 싫어서)는 선택지에 적되 점수는 속도로만 매긴다",
    usedByTypes: false,
  },
  R4: {
    domain: "relation", name: "마음을 말로 표현하는 정도", high: "마음 · 필요를 말로 직접 표현한다", low: "행동 · 분위기로 드러내거나 삼킨다",
    purpose: "연락과 표현 방식 — 말과 행동 중 무엇으로 전하는가",
    means: "고마움 · 바람 · 호감 같은 마음을 말로 직접 전하는 정도 (서운함 · 불편함을 꺼내는 시점은 R3)",
    notThis: "불편한 일을 꺼내는 시점(R3), 감정이 큰 정도(T3), 수다스러움",
    vs: "R4는 마음을 말로 전하는가, R3은 불편한 일을 얼마나 빨리 꺼내는가. 평소 표현을 잘해도 서운함은 한참 뒤에 꺼낼 수 있다",
    usedByTypes: false,
  },
};

export const PERSPECTIVE_IDS = Object.keys(PERSPECTIVES) as PerspectiveId[];

/** 선택지가 주 관점 점수에 주는 방향과 세기 (+ 높은 쪽 · − 낮은 쪽, 1~2). 한 선택지는 그 문항의 주 관점에만 준다 */
export type Weights = Partial<Record<PerspectiveId, -2 | -1 | 1 | 2>>;

export type DraftOption = {
  id: "a" | "b" | "c" | "d";
  text: string;
  w: Weights;
  /** true면 이 문항의 주 관점의 증거로 쓰지 않는다 — 같은 행동이어도 이유가 다른 답 (이유만 따로 남긴다) */
  unscored?: boolean;
  /** 이 선택지가 말하는 이유 (검토용 · 이유를 묻는 문항에서) */
  reason?: string;
};

/** 문항의 장면 — 같은 관점을 서로 다른 장면에서 묻는지 확인하는 데 쓴다 */
export type Scene = "일" | "친구" | "연애" | "가족" | "혼자" | "돈" | "낯선 자리";

/** 문항이 묻는 것: feeling 마음의 크기 · behavior 행동의 속도 · 방식 · reason 같은 행동의 이유 */
export type ItemKind = "feeling" | "behavior" | "reason";

export type DraftItem = {
  id: string;
  domain: Domain;
  /** 문항 이름 (검토용) */
  topic: string;
  scene: Scene;
  /** 이 문항이 주로 보는 관점 하나 */
  primary: PerspectiveId;
  kind: ItemKind;
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
    id: "Q01", domain: "temperament", topic: "즉흥 제안", scene: "친구", primary: "T1", kind: "feeling",
    stem: "금요일 저녁, 친구가 \"내일 처음 가 보는 곳으로 당일치기 어때?\"라고 합니다. 가장 먼저 드는 마음에 가까운 것은?",
    purpose: "처음 가 보는 곳이라는 말에 먼저 마음이 가는지 (새로움에 끌림)",
    options: [
      { id: "a", text: "늘 가던 곳으로 가자고 하고 싶다", w: { T1: -2 } },
      { id: "b", text: "처음 가 보는 곳이라는 말에 마음이 먼저 움직인다", w: { T1: 2 } },
      { id: "c", text: "가 보고 싶긴 한데, 익숙한 곳이 더 마음 편하긴 하다", w: { T1: 1 } },
      { id: "d", text: "가 본 적 없는 곳이라 선뜻 내키지 않는다", w: { T1: -1 } },
    ],
  },
  {
    id: "Q02", domain: "temperament", topic: "새 도구 도입", scene: "일", primary: "T1", kind: "feeling",
    stem: "팀에서 쓰던 업무 도구를 바꿀 수 있다고 합니다. 새 도구는 아직 아무도 써 본 적이 없습니다. 가장 먼저 드는 마음은?",
    purpose: "아직 아무도 써 보지 않은 새것 앞의 첫 마음 (새로움에 끌림)",
    options: [
      { id: "a", text: "궁금하긴 하지만 지금 도구에도 익숙해서 급하진 않다", w: { T1: 1 } },
      { id: "b", text: "바꾸지 않고 지금 도구를 계속 쓰고 싶다", w: { T1: -2 } },
      { id: "c", text: "새것이 더 나을 수도 있으니 일단 써 보고 싶다", w: { T1: 2 } },
      { id: "d", text: "쓰던 도구가 편하다. 다시 익히는 게 번거롭다", w: { T1: -1 } },
    ],
  },
  {
    id: "Q03", domain: "temperament", topic: "반응 없는 장기 프로젝트", scene: "혼자", primary: "T4", kind: "reason",
    stem: "6개월 걸리는 개인 프로젝트를 시작했는데 3개월째 주변 반응이 거의 없습니다. 의욕은 어떻게 되는 편인가요?",
    purpose: "의욕이 안에서 오는지 주변 반응에서 오는지 (주변 반응에 움직임)",
    options: [
      { id: "a", text: "반응이 없으면 의욕이 눈에 띄게 줄어든다", w: { T4: 1 } },
      { id: "b", text: "반응이 없어도 의욕은 크게 줄지 않지만, 가끔은 반응이 궁금하다", w: { T4: -1 } },
      { id: "c", text: "반응이 있든 없든 의욕은 그대로다", w: { T4: -2 } },
      { id: "d", text: "누군가에게 보여 주고 반응을 받아야 속도가 붙는다", w: { T4: 2 } },
    ],
  },
  {
    id: "Q04", domain: "temperament", topic: "약속 장소가 닫힘", scene: "친구", primary: "T3", kind: "feeling",
    stem: "중요한 약속 당일, 예약한 곳이 갑자기 문을 닫았다는 연락을 받았습니다. 연락을 받은 직후 마음의 상태에 가장 가까운 것은?",
    purpose: "계획이 어긋났을 때 마음속 감정의 크기와 남는 시간 (감정이 올라오는 크기)",
    options: [
      { id: "a", text: "당황스럽고 마음이 한동안 가라앉지 않는다", w: { T3: 2 } },
      { id: "b", text: "잠깐 아쉽지만 금방 잊는다", w: { T3: -1 } },
      { id: "c", text: "속이 상하고, 한두 시간은 그 생각이 계속 난다", w: { T3: 1 } },
      { id: "d", text: "별로 흔들리지 않는다", w: { T3: -2 } },
    ],
  },
  {
    id: "Q05", domain: "temperament", topic: "낯선 사람이 많은 모임", scene: "낯선 자리", primary: "T1", kind: "feeling",
    stem: "아는 사람이 거의 없는 모임에 초대받았습니다. 가기 전 마음에 가까운 것은?",
    purpose: "낯선 자리 앞의 첫 마음 (새로움에 끌림 — 사교성과 섞일 수 있어 시범에서 확인)",
    options: [
      { id: "a", text: "꼭 가야 하는 자리가 아니라면 가지 않고 싶다", w: { T1: -2 } },
      { id: "b", text: "아는 사람이 한 명이라도 있으면 좋겠다는 생각이 먼저 든다", w: { T1: -1 } },
      { id: "c", text: "새로운 사람을 만날 수 있어서 기대된다", w: { T1: 2 } },
      { id: "d", text: "기대되는 마음과 부담되는 마음이 비슷하다", w: { T1: 1 } },
    ],
  },
  {
    id: "Q06", domain: "temperament", topic: "사람들 앞에서 받은 지적", scene: "일", primary: "T4", kind: "reason",
    stem: "내가 한 일에 대해 동료가 여러 사람 앞에서 아쉬운 점을 지적했습니다. 그날 저녁 가장 신경 쓰이는 것은?",
    purpose: "무엇이 마음에 걸리는가 — 주변의 시선인가, 내용인가 (주변 반응에 움직임)",
    options: [
      { id: "a", text: "그 지적이 맞는 말인지", w: { T4: -1 } },
      { id: "b", text: "다른 사람들이 나를 어떻게 봤을지", w: { T4: 2 } },
      { id: "c", text: "다음에 인정받으려면 무엇을 고쳐야 할지", w: { T4: 1 } },
      { id: "d", text: "특별히 신경 쓰이는 게 없다. 필요하면 고치면 된다", w: { T4: -2 } },
    ],
  },
  {
    id: "Q07", domain: "temperament", topic: "지루한 반복 업무", scene: "일", primary: "T5", kind: "behavior",
    stem: "사흘 동안 같은 형식의 문서를 100건 정리해야 하는 일을 맡았습니다. 일하는 방식에 가장 가까운 것은?",
    purpose: "지루함이 커져도 정한 일을 이어 가는지 (끝까지 이어감)",
    options: [
      { id: "a", text: "더 쉬운 방법이 없는지 찾다가 원래 일이 자꾸 밀린다", w: { T5: -2 } },
      { id: "b", text: "계획대로 하되 지루해지면 쉬는 시간을 자주 넣는다", w: { T5: 1 } },
      { id: "c", text: "하루 분량을 정해 두고 지루해도 끝까지 한다", w: { T5: 2 } },
      { id: "d", text: "지루해서 중간에 다른 일을 끼워 가며 한다", w: { T5: -1 } },
    ],
  },
  {
    id: "Q08", domain: "temperament", topic: "큰 구매 전", scene: "돈", primary: "T2", kind: "behavior",
    stem: "150만 원쯤 하는 물건을 사기로 마음먹었습니다. 사기까지의 모습에 가장 가까운 것은?",
    purpose: "큰 결정 앞에서 얼마나 알아보고 움직이는지 (불확실함에 대비)",
    options: [
      { id: "a", text: "필요한 기능을 정리해 두세 개로 좁히고 그날 정한다", w: { T2: 1 } },
      { id: "b", text: "마음에 드는 것을 찾으면 한두 가지만 확인하고 정한다", w: { T2: -1 } },
      { id: "c", text: "후기와 가격을 오래 비교하고, 정한 뒤에도 한 번 더 확인한다", w: { T2: 2 } },
      { id: "d", text: "보자마자 마음이 가면 알아보지 않고 바로 산다", w: { T2: -2 } },
    ],
  },
  {
    id: "Q09", domain: "temperament", topic: "사소한 일이 연달아 어긋난 아침", scene: "혼자", primary: "T3", kind: "feeling",
    stem: "출근길에 버스를 놓치고 커피를 쏟는 등 사소한 일이 연달아 어긋났습니다. 그날 마음은 어떻게 흘러가는 편인가요?",
    purpose: "사소한 어긋남이 하루 감정에 남는 정도 (감정이 올라오는 크기)",
    options: [
      { id: "a", text: "그런 일이 있었구나 하고 금방 잊는다", w: { T3: -2 } },
      { id: "b", text: "속상하지만 점심쯤이면 많이 풀린다", w: { T3: 1 } },
      { id: "c", text: "오전 내내 기분이 가라앉고 다른 일에도 영향이 간다", w: { T3: 2 } },
      { id: "d", text: "한숨 한두 번 쉬면 지나간다", w: { T3: -1 } },
    ],
  },
  {
    id: "Q10", domain: "temperament", topic: "새 취미의 흥미가 식음", scene: "혼자", primary: "T5", kind: "behavior",
    stem: "한 달 전에 시작한 새 취미가 요즘 처음만큼 재미있지 않습니다. 앞으로의 모습에 가장 가까운 것은?",
    purpose: "흥미가 식은 뒤에도 이어 가는지 (끝까지 이어감)",
    options: [
      { id: "a", text: "재미가 없어도 일정 수준까지는 계속해 본다", w: { T5: 2 } },
      { id: "b", text: "생각날 때만 하고, 억지로 이어 가지는 않는다", w: { T5: -1 } },
      { id: "c", text: "방법이나 도구를 바꿔 가며 이어 간다", w: { T5: 1 } },
      { id: "d", text: "흥미가 식었으니 접는다", w: { T5: -2 } },
    ],
  },
  {
    id: "Q11", domain: "temperament", topic: "위험이 있는 제안", scene: "일", primary: "T2", kind: "behavior",
    stem: "아는 사람이 \"성공하면 크지만 실패할 수도 있는\" 새 사업을 같이 하자고 합니다. 가장 먼저 하는 행동에 가까운 것은?",
    purpose: "위험이 있는 제안 앞에서 알아보고 준비하는 정도 (불확실함에 대비)",
    options: [
      { id: "a", text: "최악의 경우 얼마를 잃게 되는지부터 계산해 본다", w: { T2: 2 } },
      { id: "b", text: "필요한 정보와 비슷한 사례를 찾아본 뒤에 답한다", w: { T2: 1 } },
      { id: "c", text: "하겠다고 먼저 말해 두고, 문제가 생기면 그때 방법을 찾는다", w: { T2: -2 } },
      { id: "d", text: "일단 만나서 이야기를 더 들어 보고 마음이 가는지 본다", w: { T2: -1 } },
    ],
  },

  // ── 성격적 경향 (Q12~Q21) ──────────────────────────────
  {
    id: "Q12", domain: "character", topic: "모임 장소 정하기", scene: "친구", primary: "C1", kind: "behavior",
    stem: "친구 다섯 명이 모이는데 장소를 아직 못 정했습니다. 단체 대화방이 조용합니다. 가장 가까운 행동은?",
    purpose: "방향을 내가 정해 이끄는지 따르는지 (스스로 방향을 세움)",
    options: [
      { id: "a", text: "내 의견도 말하고, 다른 사람 의견도 들어 같이 정한다", w: { C1: 1 } },
      { id: "b", text: "누가 정하겠지 하고 기다린다", w: { C1: -2 } },
      { id: "c", text: "내가 후보 두 곳을 정해 올리고 정하자고 한다", w: { C1: 2 } },
      { id: "d", text: "누군가 정하면 거기에 맞추는 게 편하다", w: { C1: -1 } },
    ],
  },
  {
    id: "Q13", domain: "character", topic: "회의에서 의견이 반박당함", scene: "일", primary: "C1", kind: "behavior",
    stem: "회의에서 내가 낸 의견을 두 사람이 정면으로 반박했습니다. 그 뒤 일을 어떻게 이어 가는 편인가요?",
    purpose: "반박을 받은 뒤에도 내 방향을 이끄는지 (스스로 방향을 세움)",
    options: [
      { id: "a", text: "반박을 반영해 방향을 일부 고치고 계속 이끈다", w: { C1: 1 } },
      { id: "b", text: "근거를 더 모아 다음 회의에서 내 방향을 다시 제안한다", w: { C1: 2 } },
      { id: "c", text: "다수 의견이 정해지면 따르고 내 몫만 한다", w: { C1: -1 } },
      { id: "d", text: "내 의견을 접고 정해진 쪽에 맞춘다", w: { C1: -2 } },
    ],
  },
  {
    id: "Q14", domain: "character", topic: "마감 앞의 충동", scene: "혼자", primary: "C2", kind: "behavior",
    stem: "내일 마감인 일이 남았는데, 갑자기 오래 미뤄 둔 방 정리가 하고 싶어졌습니다. 어떻게 하는 편인가요?",
    purpose: "하고 싶은 마음이 올라왔을 때 바로 움직이는지 한 박자 쉬는지 (행동을 늦춰 고름)",
    options: [
      { id: "a", text: "마음이 안 잡혀서 오늘은 정리로 보내고 마감은 양해를 구한다", w: { C2: -1 } },
      { id: "b", text: "일을 끝낸 뒤에 정리한다", w: { C2: 2 } },
      { id: "c", text: "하고 싶을 때 바로 정리부터 시작하고, 일은 밤에 몰아서 한다", w: { C2: -2 } },
      { id: "d", text: "정리를 20분만 하기로 정해 두고 시작한다", w: { C2: 1 } },
    ],
  },
  {
    id: "Q15", domain: "character", topic: "새해 목표", scene: "혼자", primary: "C1", kind: "behavior",
    stem: "새해를 맞아 올해 이루고 싶은 것을 정하려고 합니다. 가장 가까운 방식은?",
    purpose: "목표를 스스로 세우는지 주어진 것을 따르는지 (스스로 방향을 세움)",
    options: [
      { id: "a", text: "정해도 어차피 바뀌니 생기는 일에 맞춰 흘러간다", w: { C1: -2 } },
      { id: "b", text: "구체적인 목표와 단계, 날짜까지 적어 둔다", w: { C1: 2 } },
      { id: "c", text: "큰 방향만 정하고 세부는 상황을 보며 정한다", w: { C1: 1 } },
      { id: "d", text: "회사나 주변에서 정해 주는 목표를 따라가는 편이다", w: { C1: -1 } },
    ],
  },
  {
    id: "Q16", domain: "character", topic: "화가 나는 메시지", scene: "일", primary: "C2", kind: "behavior",
    stem: "퇴근 후 업무 메시지가 왔는데 나를 탓하는 듯한 말투입니다. 마음이 확 올라온 상태에서 가장 가까운 행동은?",
    purpose: "마음이 올라왔을 때 행동이 나오는 속도 (행동을 늦춰 고름)",
    options: [
      { id: "a", text: "그날은 답하지 않고 다음 날 정리해서 답한다", w: { C2: 2 } },
      { id: "b", text: "바로 쓰되 보내기 전에 한 번 읽어 보고 보낸다", w: { C2: -1 } },
      { id: "c", text: "읽고 나서 한 시간쯤 다른 일을 하다가 답한다", w: { C2: 1 } },
      { id: "d", text: "바로 답장해서 내 생각을 보낸다", w: { C2: -2 } },
    ],
  },
  {
    id: "Q17", domain: "character", topic: "두 곳의 이직 제안", scene: "일", primary: "C4", kind: "reason",
    stem: "이직 제안이 두 곳에서 왔습니다. A는 보수가 높고 하는 일이 평범합니다. B는 보수가 낮지만 하는 일이 의미 있게 느껴집니다. 먼저 드는 생각은?",
    purpose: "선택의 기준이 의미인지 현실 조건인지 (의미 · 이유를 기준으로 고름)",
    options: [
      { id: "a", text: "A에서 경력을 쌓은 뒤 의미 있는 일로 옮길지 정한다", w: { C4: -1 } },
      { id: "b", text: "B가 맞는 것 같지만 생활비 계산이 서야 정한다", w: { C4: 1 } },
      { id: "c", text: "생활이 안정돼야 다른 것도 할 수 있으니 A쪽이다", w: { C4: -2 } },
      { id: "d", text: "일이 납득돼야 오래 할 수 있으니 B쪽이다", w: { C4: 2 } },
    ],
  },
  {
    id: "Q18", domain: "character", topic: "뜻밖의 100만 원", scene: "돈", primary: "C4", kind: "reason",
    stem: "예상하지 못한 100만 원이 생겼습니다. 먼저 떠오르는 쓰임은?",
    purpose: "돈을 어디에 쓰고 싶은가로 보는 가치 기준 (의미 · 이유를 기준으로 고름)",
    options: [
      { id: "a", text: "저축하거나 불릴 방법을 찾는다", w: { C4: -2 } },
      { id: "b", text: "배우고 싶던 것이나 의미 있게 느껴지는 곳에 쓴다", w: { C4: 2 } },
      { id: "c", text: "내게 중요한 사람이나 뜻을 같이하는 곳에 보탠다", w: { C4: 1 } },
      { id: "d", text: "필요했던 물건을 바로 산다", w: { C4: -1 } },
    ],
  },
  {
    id: "Q19", domain: "character", topic: "불공평한 일 분담", scene: "친구", primary: "C3", kind: "reason",
    stem: "친구들과 준비하는 단체 여행에서 내가 맡은 일이 다른 사람보다 눈에 띄게 많아졌습니다. 가장 가까운 대응은?",
    purpose: "같은 '더 맡는' 행동이어도 이유가 상대 사정을 고려해서인지, 말을 꺼내기 어려워서인지 (상대의 필요를 함께 놓음)",
    options: [
      { id: "a", text: "친구들 사정을 알고 있어서, 이번엔 내가 더 하는 게 낫다고 본다", w: { C3: 2 }, reason: "상대 사정을 고려해서" },
      { id: "b", text: "내 일이 줄어들도록 분담을 다시 정하자고 요청한다", w: { C3: -2 } },
      { id: "c", text: "내 몫은 정해진 만큼만 하고 더는 맡지 않는다", w: { C3: -1 } },
      { id: "d", text: "내 몫을 줄여 달라는 말을 꺼내기 어려워서 그냥 더 한다", w: {}, unscored: true, reason: "말을 꺼내기 어려워서" },
    ],
  },
  {
    id: "Q20", domain: "character", topic: "급한 날의 부탁", scene: "일", primary: "C3", kind: "reason",
    stem: "내 일이 급한 날, 동료가 \"잠깐만 도와줄 수 있어?\"라고 합니다. 가장 가까운 반응은?",
    purpose: "같은 '돕는' 행동이어도 이유가 상대 사정 때문인지, 거절하기 어려워서인지 (상대의 필요를 함께 놓음)",
    options: [
      { id: "a", text: "동료 사정을 먼저 묻고, 정말 급한 일이면 내 일을 미루고 돕는다", w: { C3: 2 }, reason: "상대 사정을 고려해서" },
      { id: "b", text: "거절하기 어려워서 일단 돕고, 내 일은 늦게까지 해서 맞춘다", w: {}, unscored: true, reason: "거절하기 어려워서" },
      { id: "c", text: "내 일이 급해서 어렵다고 하고 돕지 않는다", w: { C3: -2 } },
      { id: "d", text: "내 일이 급하다고 말하고, 가능한 시간을 정해 나중에 돕겠다고 한다", w: { C3: -1 } },
    ],
  },
  {
    id: "Q21", domain: "character", topic: "가치와 어긋나는 부탁", scene: "가족", primary: "C4", kind: "reason",
    stem: "가족 모임에서 내가 중요하게 여기는 가치와 어긋나는 일을 같이 하자고 합니다. 먼저 드는 마음은?",
    purpose: "가치와 어긋나는 일 앞에서 의미가 얼마나 기준이 되는지 (의미 · 이유를 기준으로 고름)",
    options: [
      { id: "a", text: "마음은 불편하지만 가족 일이라 일단 한다", w: { C4: -1 } },
      { id: "b", text: "내 일이 아니라고 보고 크게 신경 쓰지 않는다", w: { C4: -2 } },
      { id: "c", text: "선을 정해 두고 그 안에서만 한다", w: { C4: 1 } },
      { id: "d", text: "가치에 어긋나서 그 일을 하는 이유가 흔들리고 계속 고민된다", w: { C4: 2 } },
    ],
  },

  // ── 가까운 관계 패턴 (Q22~Q30) ─────────────────────────
  {
    id: "Q22", domain: "relation", topic: "연락이 뜸해짐", scene: "친구", primary: "R1", kind: "reason",
    stem: "가까운 사람이 평소와 달리 이틀째 연락이 뜸합니다. 가장 가까운 마음과 행동은?",
    purpose: "같은 '연락한다'여도 마음이 쓰여서인지 약속 때문인지 (불확실할 때 확인하고 싶은 마음)",
    options: [
      { id: "a", text: "크게 신경 쓰이지 않아서 내 일을 한다", w: { R1: -2 } },
      { id: "b", text: "계속 신경이 쓰여서 무슨 일 있는지 먼저 물어본다", w: { R1: 2 }, reason: "마음이 쓰여서" },
      { id: "c", text: "마음과는 상관없이, 정해 둔 약속 때문에 확인차 연락한다", w: {}, unscored: true, reason: "약속 · 일정을 정해야 해서" },
      { id: "d", text: "신경은 쓰이지만 바쁘겠거니 하고 하루 더 기다린다", w: { R1: 1 } },
    ],
  },
  {
    id: "Q23", domain: "relation", topic: "이틀을 함께 보낸 뒤", scene: "친구", primary: "R2", kind: "feeling",
    stem: "친한 친구나 가족과 주말 이틀을 내내 함께 보냈습니다. 일요일 저녁의 마음은?",
    purpose: "함께 있은 뒤 더 함께이고 싶은지, 혼자 있고 싶은지 (혼자 시간이 필요한 마음)",
    options: [
      { id: "a", text: "중간에 혼자 있는 시간이 있었으면 더 좋았을 것 같다", w: { R2: 1 } },
      { id: "b", text: "즐거웠고 이 정도로 또 같이 보내도 좋다", w: { R2: -1 } },
      { id: "c", text: "더 같이 있고 싶고 헤어지는 게 아쉽다", w: { R2: -2 } },
      { id: "d", text: "즐거웠지만 이제 혼자 쉬는 시간이 필요하다", w: { R2: 2 } },
    ],
  },
  {
    id: "Q24", domain: "relation", topic: "사과 없이 늦은 약속", scene: "친구", primary: "R3", kind: "behavior",
    stem: "친한 친구가 약속 시간에 30분 늦으면서 별다른 사과를 하지 않았습니다. 서운한 마음이 들었을 때 가장 가까운 행동은?",
    purpose: "서운함을 느낀 뒤 말을 꺼내기까지의 속도 (불편할 때 말을 꺼내는 속도)",
    options: [
      { id: "a", text: "별일 아니라고 넘기고, 같은 일이 반복되면 그때 말한다", w: { R3: -1 } },
      { id: "b", text: "그 자리에서 서운하다고 바로 말한다", w: { R3: 2 } },
      { id: "c", text: "말을 꺼내면 분위기가 나빠질 것 같아 그냥 넘기고 만다", w: { R3: -2 }, reason: "분위기가 나빠질까 봐" },
      { id: "d", text: "그 자리에서는 웃고, 마음이 정리되면 며칠 안에 이야기한다", w: { R3: 1 }, reason: "정리할 시간이 필요해서" },
    ],
  },
  {
    id: "Q25", domain: "relation", topic: "위치 · 일정 공유 제안", scene: "연애", primary: "R2", kind: "feeling",
    stem: "연인이 \"서로 위치나 일정을 앱으로 공유하면 편할 것 같아\"라고 제안합니다. 마음에 가까운 것은?",
    purpose: "공유와 개인 영역 사이에서 편한 거리 (혼자 시간이 필요한 마음)",
    options: [
      { id: "a", text: "필요한 일정만 공유하면 좋겠다", w: { R2: 1 } },
      { id: "b", text: "서로 편한 쪽이면 괜찮다. 크게 상관없다", w: { R2: -1 } },
      { id: "c", text: "공유하는 게 자연스럽고 편하다", w: { R2: -2 } },
      { id: "d", text: "편하긴 하겠지만 내 시간을 들여다보는 느낌이 들어 부담스럽다", w: { R2: 2 } },
    ],
  },
  {
    id: "Q26", domain: "relation", topic: "말수가 줄어든 상대", scene: "가족", primary: "R1", kind: "reason",
    stem: "함께 있는 가족이 평소보다 말수가 줄었는데 이유를 모릅니다. 가장 가까운 마음과 행동은?",
    purpose: "상대의 기분이 불확실할 때 확인하고 싶은 마음 (불확실할 때 확인하고 싶은 마음)",
    options: [
      { id: "a", text: "혹시 내가 한 일 때문일까 자꾸 생각나서 조심스럽게 물어본다", w: { R1: 2 }, reason: "내 탓일까 마음이 쓰여서" },
      { id: "b", text: "신경 쓰이지 않아서 평소처럼 대한다", w: { R1: -2 } },
      { id: "c", text: "마음에 걸리지만 말하고 싶으면 하겠지 하고 지켜본다", w: { R1: 1 } },
      { id: "d", text: "신경은 쓰이지만 확인하지 않고 내 할 일을 한다", w: { R1: -1 } },
    ],
  },
  {
    id: "Q27", domain: "relation", topic: "관계의 앞날을 이야기할 때", scene: "연애", primary: "R4", kind: "behavior",
    stem: "연인과 앞으로의 일(이사, 동거, 진로 등)에 대해 이야기해야 할 때가 왔습니다. 내 마음을 전하는 방식에 가장 가까운 것은?",
    purpose: "마음 · 바람을 말로 직접 전하는지 (마음을 말로 표현하는 정도)",
    options: [
      { id: "a", text: "내가 먼저 꺼내서 내 마음과 바람을 말로 이야기한다", w: { R4: 2 } },
      { id: "b", text: "행동이나 분위기로 내 마음을 알리고 상대가 알아채기를 기다린다", w: { R4: -1 } },
      { id: "c", text: "자연스러운 대화 중에 운을 띄우며 반응을 본다", w: { R4: 1 } },
      { id: "d", text: "상대가 먼저 말을 꺼내기를 기다린다", w: { R4: -2 } },
    ],
  },
  {
    id: "Q28", domain: "relation", topic: "함께 사는 저녁", scene: "가족", primary: "R2", kind: "feeling",
    stem: "가족이나 연인과 함께 사는데, 퇴근 후 저녁을 어떻게 보내는 것이 가장 편한가요?",
    purpose: "일상 속에서 편한 거리 (혼자 시간이 필요한 마음)",
    options: [
      { id: "a", text: "같이 있되 각자 할 일을 하는 편이 편하다", w: { R2: 1 } },
      { id: "b", text: "같이 밥 먹고 하루 이야기를 나누는 시간이 있어야 편하다", w: { R2: -2 } },
      { id: "c", text: "함께 외출이나 활동을 하는 편이 편하다", w: { R2: -1 } },
      { id: "d", text: "잠깐 혼자만의 시간을 갖고 나서 같이 시간을 보낸다", w: { R2: 2 } },
    ],
  },
  {
    id: "Q29", domain: "relation", topic: "말다툼 뒤의 어색한 하루", scene: "연애", primary: "R3", kind: "behavior",
    stem: "연인과 말다툼을 한 뒤 어색한 하루가 지났습니다. 풀기 위해 가장 가까운 행동은?",
    purpose: "갈등 뒤에 이야기를 꺼내는 속도 (불편할 때 말을 꺼내는 속도)",
    options: [
      { id: "a", text: "내 잘못이 있는 부분만 먼저 사과하고, 나머지는 나중에 이야기한다", w: { R3: 1 } },
      { id: "b", text: "상대가 풀 때까지 시간을 두고 기다린다", w: { R3: -1 } },
      { id: "c", text: "먼저 다가가 이야기를 꺼낸다", w: { R3: 2 } },
      { id: "d", text: "아무 일 없었다는 듯 지내며 자연스럽게 풀리게 둔다", w: { R3: -2 } },
    ],
  },
  {
    id: "Q30", domain: "relation", topic: "알게 된 지 한 달, 늦어진 답장", scene: "연애", primary: "R1", kind: "reason",
    stem: "알게 된 지 한 달 된 사람에게 호감이 생겼습니다. 상대의 답장이 오전엔 빠르다가 이틀째 늦습니다. 가장 가까운 마음과 행동은?",
    purpose: "관계 초기에 반응이 느려질 때 확인하고 싶은 마음 (불확실할 때 확인하고 싶은 마음)",
    options: [
      { id: "a", text: "자꾸 생각이 나서 궁금한 마음에 한 번 더 연락해 본다", w: { R1: 2 }, reason: "궁금하고 마음이 쓰여서" },
      { id: "b", text: "나도 비슷한 속도로 답한다", w: { R1: -1 } },
      { id: "c", text: "바쁜가 보다 하고 내 일에 집중한다", w: { R1: -2 } },
      { id: "d", text: "마음은 쓰이지만 상대 속도에 맞춰 기다린다", w: { R1: 1 } },
    ],
  },
];

export const ITEM_BY_ID: Record<string, DraftItem> = Object.fromEntries(DRAFT_ITEMS.map((i) => [i.id, i]));

/** 관점별 지표 수 — 그 관점을 주로 보는 문항 수 (문항 하나는 지표 하나) */
export function indicatorCountsOf(items: readonly DraftItem[]): Record<PerspectiveId, number> {
  const out = Object.fromEntries(PERSPECTIVE_IDS.map((p) => [p, 0])) as Record<PerspectiveId, number>;
  for (const item of items) out[item.primary] += 1;
  return out;
}
export const indicatorCounts = () => indicatorCountsOf(DRAFT_ITEMS);

/** 한 관점의 점수가 의미를 가지려면 필요한 응답한 지표 수 */
export const MIN_INDICATORS = 3;

/**
 * 이 문항 세트가 읽을 수 있는 관점과 보강이 필요한 관점.
 * 읽을 수 있음 = 서로 다른 문항 MIN_INDICATORS개 이상이 그 관점을 주로 본다 (응답이 하나도 빠지지 않았을 때 기준 — 건너뛰면 더 줄어든다).
 * 3개는 "방향을 말할 수 있는 최소"이지 안정적으로 읽는다는 뜻이 아니다 — 한 문항만 건너뛰어도 그 관점은 보류된다.
 */
export function coverageOf(items: readonly DraftItem[]): { readable: PerspectiveId[]; needMore: { id: PerspectiveId; have: number; short: number }[] } {
  const counts = indicatorCountsOf(items);
  const readable = PERSPECTIVE_IDS.filter((p) => counts[p] >= MIN_INDICATORS);
  const needMore = PERSPECTIVE_IDS.filter((p) => counts[p] < MIN_INDICATORS).map((id) => ({ id, have: counts[id], short: MIN_INDICATORS - counts[id] }));
  return { readable, needMore };
}
export const coverage = () => coverageOf(DRAFT_ITEMS);

// ───────────────────────── 채점 (초안 규칙) ─────────────────────────

export type DraftAnswers = Record<string, "a" | "b" | "c" | "d" | "na">;

/** 뚜렷한 방향(가운데에서 CLEAR_DISTANCE 이상) 또는 뚜렷하지 않음 — "약간"과 "고르게"를 나누지 않는다 */
export type Strength = "clear" | "unclear";

export type PerspectiveResult =
  | { status: "hold"; reason: "too-few-indicators"; answered: number }
  | {
      status: "ok";
      /** 0~100 응답 환산값 (50이 가운데). 백분위 · 정확도가 아니다. 화면에는 숫자보다 방향을 쓴다 */
      score: number;
      strength: Strength;
      /** high · low는 뚜렷할 때만. 뚜렷하지 않으면 "현재 응답만으로 뚜렷하지 않음" */
      direction: "high" | "low" | "unclear";
      /** 문항마다 방향이 갈렸는가 — 진단용이며 리포트에서 사람마다 판정하지 않는다 */
      situational: boolean;
      answered: number;
    };

export const CLEAR_DISTANCE = 20;
/** 문항별 기여값의 표준편차가 이 값 이상이고 양쪽 방향이 모두 뚜렷하면 "상황에 따라 다름" (진단용 — 사람마다 판정하지 않는다) */
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
 * 문항 하나가 그 문항의 주 관점에 주는 기여값(−1~1). 점수를 주는 선택지 세 · 네 개를 같은 확률로 고르는 사람이 0이 되도록 맞춘다
 * (선택지의 점수가 한쪽으로 치우친 문항도 점수를 한쪽으로 끌지 않게 한다). 가장 먼 선택지가 ±1이다.
 * 주 관점이 아닌 관점 · 이유가 다른 답(unscored)을 고른 경우는 null — 그 문항은 이 관점의 증거가 아니다.
 * 이 기준점은 시범 응답의 실제 분포로 다시 맞춘다 (docs/assessment-design-v1.md 8장).
 */
export function contribution(item: DraftItem, option: DraftOption["id"], p: PerspectiveId): number | null {
  if (item.primary !== p) return null;
  const chosenOption = item.options.find((o) => o.id === option);
  if (!chosenOption || chosenOption.unscored) return null;
  const scored = item.options.filter((o) => !o.unscored);
  const values: number[] = scored.map((o) => o.w[p] ?? 0);
  const mean = values.reduce((n, v) => n + v, 0) / values.length;
  const reach = Math.max(...values.map((v) => Math.abs(v - mean)));
  if (reach === 0) return null;
  return ((chosenOption.w[p] ?? 0) - mean) / reach;
}

export type DraftScore = { perspectives: Record<PerspectiveId, PerspectiveResult>; skipped: number; answered: number };

/** 문항 묶음 하나를 채점한다 — 현재 초안(DRAFT_ITEMS)과 보강 후보를 더한 가상의 묶음을 같은 규칙으로 재는 데도 쓴다 */
export function scoreItems(items: readonly DraftItem[], answers: DraftAnswers): DraftScore {
  const perspectives = {} as Record<PerspectiveId, PerspectiveResult>;
  for (const p of PERSPECTIVE_IDS) {
    const values: number[] = [];
    for (const item of items) {
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
    const clear = Math.abs(score - 50) >= CLEAR_DISTANCE;
    perspectives[p] = {
      status: "ok",
      score,
      strength: clear ? "clear" : "unclear",
      direction: !clear ? "unclear" : score > 50 ? "high" : "low",
      situational: isSituational(values),
      answered: values.length,
    };
  }
  const answered = items.filter((i) => answers[i.id] && answers[i.id] !== "na").length;
  return { perspectives, skipped: items.length - answered, answered };
}

export const scoreDraft = (answers: DraftAnswers) => scoreItems(DRAFT_ITEMS, answers);

/** 결과를 말로 옮길 때 쓰는 두 가지 표현 — 뚜렷하지 않을 때 "약간 ~한 편"처럼 방향을 억지로 붙이지 않는다 */
export const UNCLEAR_TEXT = "현재 응답만으로 뚜렷하지 않음";
export const HOLD_TEXT = "문항이 부족해 판단을 보류";

/** 건너뛴(해당 없음 · 무응답) 문항이 이 수 이상이면 결과의 해석을 줄이고 다시 응답을 권한다 */
export const MANY_SKIPPED = 6;
