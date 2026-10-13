// 미유 자체 성향 질문 30문항(초안 0.2) × 공개 영역 성격 하위 영역(IPIP-NEO) 개념 비교와 수정안 (0.3 제안, 화면 · 저장에 연결하지 않음).
//
// 무엇이고 무엇이 아닌가
// - **개념 비교**다. 미유 관점이 IPIP-NEO-120의 30개 하위 영역 중 어느 것과 가까운지, 한 문항이 서로 다른 구성을 섞어 읽지 않는지를 문항 본문을 읽고 판단했다.
// - IPIP 문항 문구 · 번역 · 응답 데이터는 쓰지 않았다. 하위 영역 이름만 인용했다 (Johnson, 2014, 표에 적힌 영어 이름).
// - 이 비교는 일반 지식과 하위 영역 이름에 기대는 **사람의 판단**이며 통계가 아니다. 미유 문항의 타당도 · 신뢰도 증거가 아니고, 실제 사람의 응답(시범 인터뷰 · 시범 응답)을 대신하지 못한다.
// - 수정안은 **제안**이다. 운영자가 정한 순서(시범 인터뷰 → 문항 수정 → 보강 → 시범 응답)에 따라 0.2를 고치지 않고 따로 둔다.
import type { DraftItem, PerspectiveId } from "./situational-draft.ts";

export const IPIP_REVIEW_VERSION = "ipip-review-0.1";

export const IPIP_REFERENCE = {
  name: "IPIP-NEO-120",
  citation: "Johnson, J. A. (2014). Measuring thirty facets of the Five Factor Model with a 120-item public domain inventory. Journal of Research in Personality, 51, 78–89. doi:10.1016/j.jrp.2014.05.003",
  /** 이용 조건 확인 결과 (docs/data-sources.md) */
  terms: "IPIP 문항 · 척도는 공개 영역(public domain)이라고 논문 서두와 공식 사이트 안내 요약에 적혀 있다. 공식 안내 페이지 원문은 열리지 않아(서버 오류) 직접 확인하지 못했다. 번역본은 번역자 권리가 따로 있을 수 있어 쓰지 않는다.",
} as const;

/** IPIP-NEO-120 하위 영역 이름 (논문 표에 적힌 영어 이름) */
export const IPIP_FACETS: Record<string, string> = {
  N1: "Anxiety", N2: "Anger", N3: "Depression", N4: "Self-Consciousness", N5: "Immoderation", N6: "Vulnerability",
  E1: "Friendliness", E2: "Gregariousness", E3: "Assertiveness", E4: "Activity level", E5: "Excitement Seeking", E6: "Cheerfulness",
  O1: "Imagination", O2: "Artistic interests", O3: "Emotionality", O4: "Adventurousness", O5: "Intellect", O6: "Liberalism",
  A1: "Trust", A2: "Morality", A3: "Altruism", A4: "Cooperation", A5: "Modesty", A6: "Sympathy",
  C1: "Self-Efficacy", C2: "Orderliness", C3: "Dutifulness", C4: "Achievement-striving", C5: "Self-Discipline", C6: "Cautiousness",
};

export type Closeness = "close" | "partial" | "none";

export const CLOSENESS_LABEL: Record<Closeness, string> = { close: "가깝다", partial: "일부만 겹친다", none: "대응하는 하위 영역이 없다" };

export type PerspectiveComparison = {
  /** 가장 가까운 IPIP-NEO 하위 영역 (없으면 빈 배열) */
  nearest: string[];
  closeness: Closeness;
  note: string;
};

export const PERSPECTIVE_COMPARISON: Record<PerspectiveId, PerspectiveComparison> = {
  T1: { nearest: ["O4"], closeness: "close", note: "새로운 활동을 해 보려는 마음에 가깝다. 다만 Q05(낯선 모임)는 새로움보다 사교성(E2 · E1)을 더 읽는다 → 교체안." },
  T2: { nearest: ["C6"], closeness: "partial", note: "C6은 '행동 전에 생각하기'와 '실수를 피하려 준비하기'를 함께 담는다. T2(준비)와 C2(감정 뒤 멈춤)가 같은 하위 영역에 걸려 서로 분리되지 않을 수 있다 — 시범 응답에서 두 점수의 움직임을 본다. Q08(물건 비교)은 불확실함에 대한 준비보다 '많이 비교하는 습관'을 읽는다 → 교체안." },
  T3: { nearest: ["N1", "N6", "N2"], closeness: "partial", note: "정서적 반응성(신경성 영역). 미유 문항은 사소한 어긋남에서의 감정 크기만 묻고, 큰 스트레스(N6)는 묻지 않는다. 읽는 범위를 '사소한 일에서의 감정 크기'로 한정한다." },
  T4: { nearest: ["N4"], closeness: "partial", note: "'반응이 의욕을 움직이는가'(Q03)와 '남들이 어떻게 볼지 의식하는가'(Q06)는 서로 다른 구성이다. Q06은 N4(Self-Consciousness)에 가깝다. 한 점수로 합치면 뜻이 섞이므로 T4를 둘로 나누거나 한쪽만 읽는 안을 시범에서 확인한다 (관점 수가 바뀌므로 지금 고치지 않는다)." },
  T5: { nearest: ["C5"], closeness: "close", note: "끝까지 이어 가기는 C5(Self-Discipline)에 가깝다. 그런데 T5의 '아닌 것'에 적은 '마감을 지키는 정도(C2)'와 C2의 정의(감정이 올라온 뒤 멈춤)가 서로 어긋난다 — 마감 · 미루기는 IPIP 기준으로 C5에 해당한다. 용어를 바로잡는다." },
  C1: { nearest: ["E3", "C4"], closeness: "partial", note: "방향을 정하고 이끎은 E3(Assertiveness), 목표 세우기는 C4(Achievement-striving)에 가깝다. Q15는 목표를 날짜까지 구체적으로 적는 정도(C2 Orderliness 성격)를 읽어 의도와 다르다 → 교체안. 미유 관점 이름 C1은 IPIP의 C1(Self-Efficacy)과 다른 것이니 문서에서 섞어 쓰지 않는다." },
  C2: { nearest: ["C6", "N5"], closeness: "partial", note: "한 관점 안에 서로 다른 두 구성이 있다. Q16(올라온 감정 뒤 답장)은 N5 · C6에 가깝고, Q14(마감 vs 방 정리)는 C5(Self-Discipline)에 가깝다. Q14를 감정이 올라온 뒤의 멈춤을 묻는 장면으로 바꾼다 → 교체안." },
  C3: { nearest: ["A3", "A4", "A6"], closeness: "partial", note: "협조 · 이타 쪽 구성이다. 협조에는 '갈등이 싫어서 맞추는 것'이 겹칠 수 있는데, 미유는 그 이유의 답을 점수에서 빼고(unscored) 이유만 남긴다. 이 분리는 비교에서도 의미가 있다." },
  C4: { nearest: [], closeness: "none", note: "IPIP-NEO 30개 하위 영역에는 '납득되는 이유 · 의미 · 가치를 기준으로 고르는 정도'에 직접 대응하는 것이 없다. Big Five 밖의 구성이라 IPIP로는 점검하지 못하고 시범 인터뷰로만 확인한다. 문항 두 개(Q18 · Q21)는 기준이 아니라 '저축 대 의미', '고민의 크기'를 읽고 있어 → 교체안." },
  R1: { nearest: ["N1"], closeness: "partial", note: "관계 속에서 반응을 확인하고 싶은 마음은 일반 불안(N1)과 같지 않다. 애착 불안을 재는 공식 검사 문항은 가져오지 않는다. 읽는 범위를 '가까운 사람의 반응이 불확실할 때'로 한정한다." },
  R2: { nearest: [], closeness: "none", note: "대응하는 하위 영역이 없다. 가까운 사람 곁에서도 혼자 시간이 필요한 마음은 사교성이 낮음(E1 · E2)과 다르다. 시범 인터뷰에서 '그 사람이 싫어서'로 읽히는지 확인한다." },
  R3: { nearest: ["E3", "A4"], closeness: "partial", note: "말을 꺼내는 속도에는 단호함(E3)과 갈등을 피하는 마음(협조 쪽)이 섞인다. 미유는 속도만 점수에 넣고 이유는 따로 남긴다. Q29는 '사과하기' · '먼저 다가가기'가 섞여 있어 → 교체안." },
  R4: { nearest: ["E1", "E6"], closeness: "partial", note: "마음을 말로 전하는 정도. 문항이 1개(Q27)뿐이라 읽지 않는다. Q27은 마음보다 '앞날의 바람을 꺼내는 일'을 물어 정의와도 어긋난다 — 보강 후보 문항으로 다룬다." },
};

export type ItemFinding = {
  itemId: string;
  primary: PerspectiveId;
  nearest: string[];
  /** 문항이 서로 다른 구성을 섞거나, 읽는 말이 응답보다 넓어지는 곳 */
  issue: string;
  /** 그대로 두면 리포트에서 무엇이 잘못 읽힐 수 있나 */
  risk: string;
  action: "replace" | "wording" | "note";
};

export const ITEM_FINDINGS: ItemFinding[] = [
  { itemId: "Q05", primary: "T1", nearest: ["E2", "E1", "O4"], issue: "'아는 사람이 거의 없는 모임'은 새로움보다 사교성 · 낯가림에 대한 답을 끌어낸다. 관점 정의(T1 아님: 사교성)와도 어긋난다.", risk: "사교적이지 않은 사람이 '새로움을 싫어한다'고 읽힌다.", action: "replace" },
  { itemId: "Q07", primary: "T5", nearest: ["C5"], issue: "'더 쉬운 방법을 찾다가 일이 밀린다'(-2)는 이어 가지 못함이 아니라 효율을 찾는 모습일 수 있다.", risk: "효율을 찾는 사람이 끝까지 이어 가지 못하는 사람으로 읽힌다.", action: "wording" },
  { itemId: "Q08", primary: "T2", nearest: ["C6", "C5"], issue: "150만 원짜리 물건을 오래 비교하는 모습이 불확실함에 대한 준비인지 비교 습관인지 가를 수 없고, '바로 산다'(-2)는 충동에 가깝다.", risk: "물건을 꼼꼼히 비교하는 습관이 '불확실함에 잘 대비한다'로 넓게 읽힌다.", action: "replace" },
  { itemId: "Q11", primary: "T2", nearest: ["C6", "E5"], issue: "위험한 사업 제안에서의 반응은 준비하는 정도와 위험을 감수하는 마음(위험 추구)이 섞인다.", risk: "위험을 좋아하는 사람이 '대비하지 않는다'로 읽힌다.", action: "note" },
  { itemId: "Q13", primary: "C1", nearest: ["E3", "A4"], issue: "반박을 받고도 방향을 지키는 것(+2)은 방향을 세우는 힘과 협조하지 않는 마음이 섞인다. 반영하며 이끄는 답(+1)이 낮게 읽힌다.", risk: "의견을 받아들이며 이끄는 사람이 방향을 세우는 정도가 낮다고 읽힌다.", action: "note" },
  { itemId: "Q14", primary: "C2", nearest: ["C5"], issue: "'마감 전날 방 정리'는 감정이 올라온 뒤의 멈춤이 아니라 미루기 · 자기 통제를 묻는다. C2 정의와 다른 구성이다.", risk: "미루는 사람이 '감정을 바로 행동으로 옮긴다'로 읽힌다.", action: "replace" },
  { itemId: "Q15", primary: "C1", nearest: ["C2", "C4"], issue: "'목표와 단계, 날짜까지 적어 둔다'(+2)는 방향을 스스로 세우는 정도가 아니라 계획을 구체적으로 적는 정도를 높게 읽는다.", risk: "큰 방향만 정하고 유연하게 움직이는 사람이 방향이 약하다고 읽힌다.", action: "replace" },
  { itemId: "Q06", primary: "T4", nearest: ["N4"], issue: "공개된 자리에서 지적받은 날의 신경 쓰임은 '의욕이 반응에 움직임'(Q03)이 아니라 남의 시선을 의식하는 구성이다.", risk: "T4 점수 하나에 '반응이 동기가 됨'과 '남의 시선을 의식함'이 섞여 읽힌다.", action: "note" },
  { itemId: "Q18", primary: "C4", nearest: [], issue: "'저축하거나 불린다'(-2)는 의미를 기준으로 하지 않는 것이 아니라 재정적으로 신중한 선택이다. 쓰임이 아니라 기준을 물어야 한다.", risk: "저축하는 사람이 의미나 가치를 덜 따진다고 읽힌다.", action: "replace" },
  { itemId: "Q21", primary: "C4", nearest: [], issue: "'가치에 어긋나서 계속 고민된다'(+2)는 가치를 기준으로 고르는 정도가 아니라 고민의 크기(곱씹음)를 높게 읽는다. 담담하게 선을 정하는 사람이 낮게 읽힌다.", risk: "가치가 분명하지만 담담한 사람이 가치 기준이 약하다고 읽힌다.", action: "replace" },
  { itemId: "Q27", primary: "R4", nearest: ["E1"], issue: "관점 정의는 고마움 · 호감을 말로 전하는 정도인데 문항은 앞날의 바람(이사 · 동거)을 꺼내는 일을 묻는다. 문항도 1개뿐이다.", risk: "읽지 않는 관점이라 영향은 없지만, 보강 때 같은 어긋남이 반복될 수 있다.", action: "note" },
  { itemId: "Q29", primary: "R3", nearest: ["E3", "A4"], issue: "다툼 뒤 '사과하기'와 '먼저 다가가기'가 한 문항에 섞여 말을 꺼내는 속도만 보지 못한다.", risk: "사과를 잘하는 사람이 '불편을 빨리 꺼낸다'로 읽힌다.", action: "replace" },
];

/** 수정안 0.3 (제안) — 같은 주 관점, 선택지 4개, 점수는 주 관점 하나에만. 문항 순서와 번호는 0.2와 같다 */
export const PROPOSAL_VERSION = "situational-0.3-proposal";

const opt = (id: "a" | "b" | "c" | "d", text: string, p: PerspectiveId, w: -2 | -1 | 1 | 2) => ({ id, text, w: { [p]: w } as DraftItem["options"][number]["w"] });

export const PROPOSED_ITEMS: DraftItem[] = [
  {
    id: "Q05", domain: "temperament", topic: "낯선 메뉴", scene: "혼자", primary: "T1", kind: "feeling",
    stem: "여행 중 혼자 들어간 식당의 메뉴판에 처음 보는 음식만 가득합니다. 가장 먼저 드는 마음은?",
    purpose: "처음 보는 것 앞에서 먼저 마음이 가는지 (사교성이 아니라 새로움에 끌림)",
    options: [
      opt("a", "무슨 맛일지 궁금해서 처음 보는 것부터 고르고 싶다", "T1", 2),
      opt("b", "아는 음식과 가장 비슷해 보이는 것을 고르고 싶다", "T1", -1),
      opt("c", "궁금한 마음과 익숙한 쪽으로 가려는 마음이 비슷하다", "T1", 1),
      opt("d", "익숙한 음식이 없으면 다른 식당을 찾고 싶다", "T1", -2),
    ],
  },
  {
    id: "Q07", domain: "temperament", topic: "반복 업무", scene: "일", primary: "T5", kind: "behavior",
    stem: "사흘 동안 같은 형식의 문서를 100건 정리해야 하는 일을 맡았습니다. 일하는 방식에 가장 가까운 것은?",
    purpose: "지루해져도 정해 둔 일을 이어 가는지 (효율을 찾는 것과 구분)",
    options: [
      opt("a", "지루해지면 손을 놓았다가, 마감이 가까워져야 다시 잡는다", "T5", -2),
      opt("b", "계획대로 하되 지루해지면 쉬는 시간을 자주 넣는다", "T5", 1),
      opt("c", "하루 분량을 정해 두고 지루해도 끝까지 한다", "T5", 2),
      opt("d", "지루해서 중간에 다른 일을 끼워 가며 한다", "T5", -1),
    ],
  },
  {
    id: "Q08", domain: "temperament", topic: "불확실한 여행 준비", scene: "혼자", primary: "T2", kind: "behavior",
    stem: "이틀 뒤 혼자 떠나는 여행인데 날씨와 교통 사정이 아직 불확실합니다. 출발 전 준비에 가장 가까운 것은?",
    purpose: "앞일이 불확실할 때 미리 알아보고 준비하는지 (물건을 비교하는 습관이 아니라)",
    options: [
      opt("a", "어디를 갈지만 대략 정하고 나머지는 그때 보고 정한다", "T2", -1),
      opt("b", "날씨와 교통을 확인하고 대체 일정까지 미리 만들어 둔다", "T2", 2),
      opt("c", "아무것도 정하지 않고 떠나서 생기는 대로 대처한다", "T2", -2),
      opt("d", "숙소와 교통만 확인하고 나머지는 가서 정한다", "T2", 1),
    ],
  },
  {
    id: "Q14", domain: "character", topic: "큰 결정 충동", scene: "혼자", primary: "C2", kind: "behavior",
    stem: "아무에게도 말하지 않은 채 큰 결정(오래 다닌 곳을 그만두는 일 등)을 하고 싶다는 마음이 갑자기 강하게 올라온 밤입니다. 가장 가까운 행동은?",
    purpose: "마음이 크게 올라왔을 때 바로 옮기지 않고 한 박자 쉬는지 (마감 · 미루기가 아니라)",
    options: [
      opt("a", "오늘 밤 안에 정리해서 가까운 사람에게 먼저 이야기해 본다", "C2", -1),
      opt("b", "마음이 올라온 김에 바로 결정하고 행동으로 옮긴다", "C2", -2),
      opt("c", "며칠 두고 같은 마음이 남는지 본다", "C2", 2),
      opt("d", "하루는 두고 다음 날 다시 생각해 본다", "C2", 1),
    ],
  },
  {
    id: "Q15", domain: "character", topic: "올해의 방향", scene: "혼자", primary: "C1", kind: "behavior",
    stem: "새해를 맞아 올해 이루고 싶은 것을 정하려고 합니다. 방향을 정하는 방식에 가장 가까운 것은?",
    purpose: "방향을 내가 하고 싶은 것에서 정하는지, 주변의 기대나 흐름에 맡기는지 (계획을 얼마나 구체적으로 적는지가 아니라)",
    options: [
      opt("a", "주변이 기대하는 것이 무엇인지 보고 그에 맞춰 정한다", "C1", -1),
      opt("b", "정하지 않고 생기는 일에 맞춰 지낸다", "C1", -2),
      opt("c", "하고 싶은 것과 해야 하는 것을 섞어서 정한다", "C1", 1),
      opt("d", "내가 하고 싶은 일이 먼저 떠올라서 그것을 중심으로 정한다", "C1", 2),
    ],
  },
  {
    id: "Q18", domain: "character", topic: "쓰임의 기준", scene: "돈", primary: "C4", kind: "reason",
    stem: "예상하지 못한 100만 원이 생겼습니다. 쓰임을 정할 때 가장 먼저 따지는 기준은?",
    purpose: "쓰임이 아니라 기준 — 의미 · 가치를 먼저 따지는지 (저축 자체를 낮게 읽지 않는다)",
    options: [
      opt("a", "얼마나 안전하고 이득이 되는가", "C4", -2),
      opt("b", "내가 중요하게 여기는 가치와 맞는가", "C4", 2),
      opt("c", "지금 꼭 필요한 것인가", "C4", -1),
      opt("d", "내게 의미 있는 사람이나 일에 닿는가", "C4", 1),
    ],
  },
  {
    id: "Q21", domain: "character", topic: "가치와 어긋나는 부탁", scene: "가족", primary: "C4", kind: "reason",
    stem: "가족 모임에서 내가 중요하게 여기는 가치와 어긋나는 일을 같이 하자고 합니다. 따를지 정할 때 가장 크게 작용하는 것은?",
    purpose: "고민의 크기가 아니라 고르는 기준 — 가치에 어긋나는지를 먼저 따지는지",
    options: [
      opt("a", "가족이 기대하는 모습에 맞추는 것", "C4", -1),
      opt("b", "그 일이 내가 납득할 수 있는 선 안인지", "C4", 1),
      opt("c", "가족 관계가 나빠지지 않는 것", "C4", -2),
      opt("d", "그 일이 내 가치에 어긋나지 않는지", "C4", 2),
    ],
  },
  {
    id: "Q29", domain: "relation", topic: "서운함을 말하는 때", scene: "연애", primary: "R3", kind: "behavior",
    stem: "연인이 약속을 두 번 연속으로 미뤄서 서운한 마음이 들었습니다. 그 마음을 이야기하는 때에 가장 가까운 것은?",
    purpose: "서운함을 느낀 뒤 말을 꺼내기까지의 속도만 (사과 · 화해 방식이 아니라)",
    options: [
      opt("a", "같은 일이 또 있으면 그때 말한다", "R3", -1),
      opt("b", "말하지 않고 넘어간다", "R3", -2),
      opt("c", "서운한 마음이 들면 그날 바로 말한다", "R3", 2),
      opt("d", "마음이 정리되면 며칠 안에 말한다", "R3", 1),
    ],
  },
];

/** 0.2 문항에 제안을 입힌 0.3 후보 전체 (0.2 원본은 바꾸지 않는다) */
export function applyProposals(items: readonly DraftItem[], proposals: readonly DraftItem[] = PROPOSED_ITEMS): DraftItem[] {
  const by = new Map(proposals.map((p) => [p.id, p]));
  return items.map((i) => by.get(i.id) ?? i);
}

/** 관점마다 리포트가 쓸 수 있는 말 · 쓰지 않는 말 — 읽을 수 있는 다섯 관점만 (응답보다 해석이 넓어지는 것을 막는 기준) */
export const READING_LIMITS: Partial<Record<PerspectiveId, { may: string; mayNot: string }>> = {
  T1: { may: "처음 보는 것 · 낯선 것 앞에서 먼저 마음이 가는지에 대한 응답 경향", mayNot: "사교적이다 · 모험을 좋아한다 · 변화를 싫어한다 같은 성격 전반" },
  C1: { may: "방향과 목표를 내가 정하는 쪽인지 주변 기대나 흐름에 맡기는 쪽인지에 대한 응답 경향", mayNot: "리더십이 있다 · 고집이 세다 · 계획성이 좋다" },
  C4: { may: "선택할 때 납득되는 이유 · 의미 · 가치를 먼저 따지는지에 대한 응답 경향", mayNot: "돈에 관심이 없다 · 이상주의자다 · 도덕적이다 · 고민이 깊다" },
  R1: { may: "가까운 사람의 반응이 불확실할 때 확인하고 싶은 마음이 드는지에 대한 응답 경향", mayNot: "애착 유형을 진단한다 · 불안이 높다 · 집착한다 · 상대 마음을 안다" },
  R2: { may: "가까운 사이에서도 혼자 시간이 필요한 마음이 드는지에 대한 응답 경향", mayNot: "그 사람을 덜 좋아한다 · 회피형이다 · 내향적이다" },
};
