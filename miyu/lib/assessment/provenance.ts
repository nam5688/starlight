// 문항 개발 기록 — 화면에 연결된 문항(개발용 예시 22개)마다 "무엇을 알아보려는지 · 어떻게 점수를 읽는지 · 왜 이렇게 썼는지"를 남긴다.
// 공개와 내부를 나눈다(운영자 2026-10-15).
//  - 공개 페이지(/assessment-basis, "미유 성향 질문은 어떻게 만들었나요?")는 요약 다섯 가지만 보여 준다: 어떤 성향을 보는지 · 어떻게 개발했는지 · 참고 자료와 이용 허락 범위 · 실제로 확인한 것과 못 한 것 · 검사 버전과 수정일.
//  - 문항별 기록(ITEM_RECORDS · scoringText · provenanceRows)은 내부에 둔다. `node scripts/render-assessment-item-records.ts`가 docs/assessment-item-records.md를 만든다. 공개 페이지는 문항 문장 · 문항별 기록을 싣지 않는다.
// 새 문항을 화면에 연결하면 여기에도 기록을 더해야 하고, provenance.test.ts가 빠진 문항 · 금지된 표현을 막는다.
//
// 지키는 것
//  - 있는 그대로만 적는다. 하지 않은 것(타당도 · 신뢰도 · 정확도 · 전문가 검토 · 법률 검토)은 했다고 쓰지 않고 "하지 못했다"고만 쓴다.
//  - 외부 검사(TCI · MBTI® · 애착 검사 등)의 문항 · 채점표 · 규준 · 해석 문장 · 응답 데이터를 가져오지 않았다는 것과, 구조(방향 구성)가 기존 이론과 개념적으로 닮았다는 것을 **함께** 적는다.
//    이름을 쉬운 말로 바꿨다고 구조가 독립이 되지는 않는다 — 그래서 이 문항은 "개발용 예시"로만 두고 독립 설계(docs/assessment-life-behavior-v1.md)로 교체한다.
//  - 법적 판단을 하지 않는다. 이 기록은 개발 과정을 투명하게 알리는 것이며 법적으로 문제가 없다는 확인이 아니다.

import { ASSESSMENT_MODULES } from "./modules/index.ts";
import { LIFE_BEHAVIOR_VERSION } from "./drafts/life-behavior-v1.ts";
import type { AssessmentModule, Item, ModuleId } from "./types.ts";

export const PROVENANCE_VERSION = "assessment-provenance-0.2";
/** 문항별 기록을 정리한 날 — 문항을 쓸 당시의 메모가 아니라 문항 문장을 보고 다시 정리한 것이다(내부 기록) */
export const PROVENANCE_DATE = "2026-10-15";

export type ItemRecord = {
  /** 알아보려는 생활 행동 (한 줄) */
  behavior: string;
  /** 이 문항을 이렇게 쓴 이유 */
  why: string;
};

/** 문항 id → 개발 기록. 점수를 읽는 법은 문항 정의(정문항 · 역문항)에서 계산해 보여 주므로 따로 적지 않는다 */
export const ITEM_RECORDS: Record<string, ItemRecord> = {
  m1: { behavior: "사람들과 시간을 보낸 뒤 에너지를 되찾는 방식", why: "사람 많은 자리를 좋아하는지가 아니라 그 뒤에 어떻게 회복하는지를 물어, '사교적인가'와 구분하려 했어요." },
  m2: { behavior: "처음 만난 사람과 대화를 여는 방식", why: "m1과 다른 장면(처음 만나는 자리)에서 같은 방향을 확인하고, 한쪽으로만 답하는 습관을 가려내려고 반대 방향으로 썼어요." },
  m3: { behavior: "설명을 들을 때 구체적인 사례와 전체 의미 중 무엇이 먼저 궁금한지", why: "배우는 장면에서 정보를 받아들이는 순서를 직접 묻기 위해 썼어요." },
  m4: { behavior: "새로운 일을 배울 때 정해진 순서를 따르는 편안함", why: "m3과 다른 장면(새 일 배우기)에서 같은 방향을 확인하려고 반대 방향으로 썼어요." },
  m5: { behavior: "결정할 때 주변 사람에게 미칠 영향을 먼저 떠올리는지", why: "무엇을 먼저 따지는지(순서)만 묻고, '배려가 깊다' 같은 좋고 나쁨은 묻지 않으려 했어요." },
  m6: { behavior: "의견이 다를 때 감정보다 근거를 먼저 따지는지", why: "m5와 다른 장면(의견이 부딪힐 때)에서 같은 방향을 확인하려고 반대 방향으로 썼어요." },
  m7: { behavior: "계획 없이 그때그때 정하며 움직이는 편안함", why: "계획을 세우는 능력이 아니라 계획이 없을 때의 편안함을 물어 '게으름'과 섞이지 않게 했어요." },
  m8: { behavior: "약속과 일정을 미리 정해 두어야 마음이 놓이는지", why: "m7과 다른 장면(약속 · 일정)에서 같은 방향을 확인하려고 반대 방향으로 썼어요." },
  t1: { behavior: "처음 가 보는 곳 · 처음 해 보는 일에 마음이 먼저 가는지", why: "새로움에 끌리는 마음만 묻고, 위험을 감수하는 용기와는 구분하려 했어요." },
  t2: { behavior: "익숙한 방식을 바꾸고 싶지 않은 정도", why: "t1과 같은 방향을 반대쪽 표현으로 확인했어요." },
  t3: { behavior: "결과가 불확실한 일을 시작하기 전에 따져 보는 정도", why: "걱정이라는 감정이 아니라 '미리 따져 보는 행동'을 물어 마음의 불안과 구분하려 했어요." },
  t4: { behavior: "일단 시작하고 문제가 생기면 그때 고치는 방식", why: "t3과 같은 방향을 반대쪽 표현으로 확인했어요." },
  t5: { behavior: "다른 사람의 칭찬 · 반응이 의욕을 움직이는 정도", why: "반응에 기분이 좋아지는지가 아니라 의욕(하려는 마음)이 달라지는지를 물었어요." },
  t6: { behavior: "다른 사람의 생각과 상관없이 내 판단대로 하는지", why: "t5와 같은 방향을 반대쪽 표현으로 확인했어요." },
  t7: { behavior: "결과가 바로 보이지 않아도 시작한 일을 이어 가는 정도", why: "재능이 아니라 이어 가는 습관을 묻기 위해 '결과가 늦을 때'라는 장면을 넣었어요." },
  t8: { behavior: "흥미가 식으면 하던 일을 멈추고 다른 일로 넘어가는지", why: "t7과 같은 방향을 반대쪽 표현으로 확인했어요." },
  r1: { behavior: "연락이 평소보다 늦을 때 마음에 걸리는 정도", why: "가까운 관계의 불확실한 순간(연락 지연)을 구체적인 장면으로 물었어요." },
  r2: { behavior: "상대도 이 관계를 같은 만큼 중요하게 여기는지 걱정되는 정도", why: "r1과 다른 장면(상대의 마음)에서 같은 방향을 확인했어요." },
  r3: { behavior: "작은 오해가 생겼을 때 흔들리는 정도", why: "r1 · r2와 같은 방향을 반대쪽 표현으로 확인했어요." },
  r4: { behavior: "가까운 사람에게 속마음을 털어놓는 편안함", why: "관계에서 거리를 두는 마음을 '속마음을 말하기'라는 구체적인 행동으로 물었어요." },
  r5: { behavior: "관계가 깊어질수록 혼자 있는 시간이 더 필요해지는지", why: "r4와 다른 장면(관계가 깊어질 때)에서 같은 방향을 확인했어요." },
  r6: { behavior: "힘들 때 가까운 사람에게 기대는 편안함", why: "r4 · r5와 같은 방향을 반대쪽 표현으로 확인했어요." },
};

export type ModuleRecord = {
  moduleId: ModuleId;
  /** 화면에 보이는 이름 */
  title: string;
  /** 방향 구성이 개념적으로 대응하는 기존 이론 (숨기지 않는다) */
  corresponds: string;
  /** 가져오지 않은 것 */
  notUsed: string;
  /** 이 모듈을 어떻게 다루는가 */
  handling: string;
};

export const MODULE_RECORDS: ModuleRecord[] = [
  {
    moduleId: "mbti",
    title: "평소 행동 방식",
    corresponds:
      "네 방향(에너지를 채우는 방식 · 정보를 받아들이는 방식 · 판단하는 기준 · 생활을 꾸리는 방식)이 널리 알려진 성격 유형론의 네 쌍과 개념적으로 대응해요.",
    notUsed:
      "MBTI®의 문항 · 채점표 · 유형 설명 · 네 글자 코드는 가져오지 않았어요. 이 응답을 MBTI 유형으로 바꾸거나 MBTI라고 부르지 않고, 본인이 입력한 MBTI는 참고값으로 따로 보관해요.",
    handling: "개발용 예시 문항이에요. 독립 설계로 바꾸기 전까지 정식 검사로 쓰지 않아요.",
  },
  {
    moduleId: "temperament",
    title: "기질",
    corresponds:
      "네 방향(새로움 · 신중함 · 타인 반응 민감도 · 지속성)이 기질을 네 가지로 나누는 기존 모델(Cloninger의 기질 모델 — 자극 추구 · 위험 회피 · 보상 의존 · 인내력)과 개념적으로 대응해요. 이름을 쉬운 말로 적었다고 해서 구조가 독립이 되지는 않아요.",
    notUsed:
      "TCI(기질 및 성격검사)의 문항 · 채점표 · 규준 · 해석 문장은 가져오지 않았고 가지고 있지도 않아요. 그 검사의 점수나 유형으로 바꾸지 않아요.",
    handling: "개발용 예시 문항이에요. 생활 행동에서 출발한 독립 설계로 교체하는 것을 전제로 하고, 전문가 검토 전에는 정식 검사로 쓰지 않아요.",
  },
  {
    moduleId: "relationship",
    title: "관계(애착)",
    corresponds: "두 방향(관계 불안 · 거리 두기)이 성인 애착 연구에서 쓰는 두 차원(불안 · 회피)과 개념적으로 대응해요.",
    notUsed: "기존 애착 검사(ECR 등)의 문항 · 채점표 · 규준 · 유형 이름은 가져오지 않았어요. 임상 진단 도구가 아니에요.",
    handling: "개발용 예시 문항이에요. 독립 설계로 바꾸기 전까지 정식 검사로 쓰지 않아요.",
  },
];

/** 확인한 것 · 아직 하지 못한 것 — 공개 페이지에 그대로 보인다. 실제로 한 것만 "확인했다"고 적는다(전문가 검토 · 법률 검토 · 타당도는 한 적이 없으므로 아래 "하지 못한 것"에만 있다) */
export const CHECKED = [
  "개발 저장소에 외부 검사의 문항 · 번역문 · 채점표 · 응답 데이터 파일이 없는 것을 점검했어요. 화면에 연결된 22개 문항은 미유 개발 과정에서 직접 쓴 문장이에요.",
  "이용 조건이 불분명한 자료(OpenPsychometrics의 응답 데이터)는 내려받지 않았어요.",
  "점수를 계산하는 규칙(정문항 · 반대 방향 문항 · 영역별 읽기)이 의도한 대로 동작하는지 자동 테스트로 확인했어요. 계산이 의도대로인지를 본 것이고, 검사가 사람을 잘 읽는지를 본 것이 아니에요.",
] as const;

export const NOT_CHECKED = [
  "문항이 사람들에게 의도한 뜻으로 읽히는지(시범 인터뷰)는 아직 확인하지 못했어요.",
  "같은 사람이 다시 답해도 비슷한지, 타당한지(신뢰도 · 타당도)는 확인하지 못했어요. 정확도를 말할 수 없어요.",
  "공식 검사의 문항 원문과 하나하나 대조하지는 못했어요. 그래서 닮은 문장이 없다고 보증하지 않아요.",
  "검사 저작권을 다루는 전문가의 검토와 법률 검토는 받지 않았어요. 이 글은 그런 확인이 아니에요.",
] as const;

/** 어떤 성향을 살펴보는지 — 영역별로 따로 보여 주고 하나의 점수나 유형 이름으로 합치지 않는다 */
export const STANCE_NOTE =
  "세 묶음의 평소 행동을 영역별로 따로 보여 줘요. 한 영역의 점수를 다른 영역과 합치지 않고, 유형 이름을 붙이지 않아요. 응답은 0~100으로 옮긴 값일 뿐 백분위나 정확도가 아니고, 높고 낮음이 좋고 나쁨도 아니에요. 진단이 아니에요.";

/** 문항을 어떻게 개발했는지 */
export const DEVELOPMENT = [
  "문항은 외부 검사에서 가져오지 않고 미유 개발 과정에서 직접 썼어요. 초안을 쓸 때 AI 도구의 도움을 받았고, 운영자가 확인하고 있어요.",
  "같은 방향을 서로 다른 장면에서 묻고, 정방향 문항과 반대 방향 문항을 섞어서 한쪽으로만 답하는 습관이 점수로 남지 않게 했어요.",
  "지금 화면의 22개 문항은 모두 개발용 예시이고 정식 검사가 아니에요.",
  "솔직히, 지금 문항의 방향 구성(네 가지 · 네 가지 · 두 가지)이 널리 알려진 성격 유형론 · 기질 모델 · 성인 애착 연구가 다루는 주제와 닮았어요. 문장과 채점표를 가져오지 않았다고 해서 구성까지 독립이 되는 것은 아니라고 보고, 이름만 바꾸지 않고 설계를 새로 하고 있어요.",
  "새 설계는 이론의 틀이 아니라 '계획이 바뀔 때 · 갈등에서 의견을 말할 때 · 시작하고 마무리하는 습관'처럼 미유가 알아보려는 생활 행동에서 출발해요. 아직 화면에 연결하지 않았고, 연결하기 전에 이 글을 함께 고쳐요.",
] as const;

export type SourceRow = { name: string; used: string; scope: string };

/** 참고 자료와 이용 허락 범위 */
export const SOURCES: SourceRow[] = [
  { name: "공식 성격 · 기질 · 애착 검사 (MBTI® · TCI · 성인 애착 척도 등)", used: "문항 · 번역문 · 채점표 · 규준 · 해석 문장을 쓰지 않았고 가지고 있지도 않아요.", scope: "이용 허락을 받지 않았어요. 그래서 결과를 이 검사들의 점수나 유형으로 바꾸지 않고, 이 검사의 이름으로 결과를 보여 주지 않아요." },
  { name: "IPIP-NEO (공개 영역이라고 안내된 성격 문항 모음)", used: "하위 영역의 이름만 개발 문서의 개념 비교에 인용했어요. 문항 문구는 쓰지 않았고, 화면의 문항에는 쓰지 않아요.", scope: "공개 영역이라고 안내돼 있지만 이용 조건은 자료마다 달라서, 문항을 쓰기 전에 조건을 다시 확인해요." },
  { name: "OpenPsychometrics 응답 데이터", used: "내려받지 않았고 어디에도 쓰지 않았어요.", scope: "이용 조건 문구를 찾지 못해 쓰지 않았어요. 공개돼 있다는 이유만으로 쓰지 않아요." },
  { name: "AI가 학습한 일반 지식", used: "문항 초안을 쓸 때 일상 행동에 관한 일반적인 이해를 도움으로 썼어요.", scope: "실제 응답 데이터나 통계처럼 쓰지 않아요." },
];

export type VersionRow = { label: string; version: string; note: string };

/** 검사 버전 · 수정일 — 화면 문항의 버전은 문항 정의에서 읽는다 */
export function versionRows(): VersionRow[] {
  return [
    ...ASSESSMENT_MODULES.map((m) => ({ label: m.title, version: m.version, note: `문항 ${m.items.length}개 · 개발용 예시` })),
    { label: "생활 행동 기준 새 설계", version: LIFE_BEHAVIOR_VERSION, note: "설계 초안 · 화면에 연결하지 않았어요" },
  ];
}

/** 이 안내 글을 마지막으로 고친 날 */
export const PROVENANCE_UPDATED = "2026-10-15";

/** 점수를 읽는 법 — 문항 정의(정문항 · 역문항)에서 계산해 항상 정의와 맞는다 */
export function scoringText(item: Item, module: AssessmentModule): string {
  const dim = module.dimensions.find((d) => d.id === item.dimension);
  if (!dim) return "";
  const high = dim.highName ?? dim.highMeaning;
  const low = dim.lowName ?? dim.lowMeaning;
  const agreeSide = item.reverse ? low : high;
  const disagreeSide = item.reverse ? high : low;
  const kind = item.reverse ? "반대 방향 문항이라 점수를 뒤집어 계산해요" : "그대로 계산해요";
  return `'${dim.label}' · "그렇다" 쪽으로 답할수록 '${agreeSide}' 쪽, "아니다" 쪽일수록 '${disagreeSide}' 쪽으로 읽어요 (${kind}).`;
}

export type ProvenanceRow = { module: AssessmentModule; record: ModuleRecord; items: { item: Item; record: ItemRecord | null; scoring: string }[] };

/** 공개 페이지가 쓰는 모듈별 묶음 */
export function provenanceRows(): ProvenanceRow[] {
  return ASSESSMENT_MODULES.map((module) => ({
    module,
    record: MODULE_RECORDS.find((r) => r.moduleId === module.id)!,
    items: module.items.map((item) => ({ item, record: ITEM_RECORDS[item.id] ?? null, scoring: scoringText(item, module) })),
  }));
}
