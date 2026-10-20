// 상황형 28문항의 "읽는 규칙" 설계 초안 — 새 설계이며 원본 복원이 아니다 (운영자 요청 2026-10-20, 연결하지 않은 검토용 초안).
//
// 구분: 원본 복원 = 장면 28 · 선택지 112(situational-v2-draft.ts, 운영자가 보낸 글 그대로)이고, 채점 · 읽기는 원본에 처음부터 없었다.
//        이 파일은 그 위에 미유 쪽이 새로 정한 읽기 규칙이다 — 검증되지 않았고, 사람 시험(5~10명) · 운영자 승인 전에는 어디에도 연결하지 않는다.
// 읽는 방식(docs/assessment-situational-v2-review.md 4절 · docs/assessment-situational-v2-reading-design.md):
//  · 선택지마다 점수를 더하지 않는다. 고른 선택지는 "행동 근거 한 문장"과 "주 구분의 어느 쪽인지(또는 읽지 않음)"로만 바뀐다.
//  · 장면마다 주 구분은 하나다(같은 장면이 여러 구분에 겹쳐 반영되지 않게). 주 구분이 아닌 쪽의 읽기는 하지 않는다.
//  · 구분마다 여러 장면의 선택을 가로로 읽어 충분(뚜렷한 방향) · 상반(상황별 차이) · 부족(읽지 않음) 중 하나로 판정한다.
//  · 부족하면 근거를 만들지 않고 유형도 억지로 정하지 않는다("혼합 경향").
//  · 애착은 유형 이름이 아니라 세 가지 방식(확인하는 방식 · 갈등 뒤 회복 순서 · 도움 받는 방식)으로만 읽고, 개인 유형 10개의 계산에는 쓰지 않는다.
//  · 어떤 사람의 응답도 기본값으로 쓰지 않는다 — 예시 응답은 이 파일 밖(시험 · 문서 생성)에서만 쓴다.
// 이 파일은 situational-v2-draft.ts의 장면 · 선택지를 읽기만 하고, 화면 · 서버 · 저장 · 리포트 · 검사 모듈 어디에서도 불러오지 않는다(situational-v2-provenance.test.ts · situational-v2-reading.test.ts가 확인).
import type { Group } from "../../saju/interpret/structure.ts";
import { FLAVOR_RULES, MIXED_TYPE, PERSONAL_TYPES, type PersonalTypeId } from "../personal-type.ts";
import { SITUATIONAL_V2_ITEMS, type SituationalItem } from "./situational-v2-draft.ts";

export const READING_VERSION = "situational-v2-reading-draft-0.1";

// ───────────── 구분 ─────────────

export type DistinctionId = "energy" | "info" | "basis" | "structure" | "first" | "explore" | "confirm" | "repair" | "help";
/** 개인 유형 계산(personal-type.ts FLAVOR_RULES)이 쓰는 응답 행 — 지금 22문항 화면의 행과 같은 이름 */
export type RowId = "ei" | "sn" | "tf" | "jp" | "novelty" | "caution" | "sensitivity" | "persistence" | "anxiety" | "avoidance";
export type RowLean = { row: RowId; toward: "high" | "low" };

export type DistinctionSide = {
  /** 고객 글이 아니라 검토용 이름 — 점수 · 좋고 나쁨이 없다 */
  label: string;
  /** 이 쪽으로 읽혔을 때 개인 유형 계산이 보는 행(없으면 유형 계산에 쓰지 않는다) */
  rows: RowLean[];
};

export type Distinction = {
  id: DistinctionId;
  name: string;
  /** 무엇을 가르는 구분인지 한 줄 */
  plain: string;
  sides: Record<string, DistinctionSide>;
  /** 읽으려면 필요한 최소 장면 수 — 이보다 적게 설계돼 있으면 어떤 답이어도 읽지 않는다 */
  minScenes: 3;
  /** 같은 쪽으로 읽힌 장면이 서로 다른 맥락(일 · 친구 · 가까운 관계 · 혼자)에 걸려야 하는가. 가까운 관계 구분은 맥락이 하나뿐이라 false */
  mixedContext: boolean;
  /** 가까운 관계의 방식을 읽는 구분인가(유형 이름 · 개인 유형 계산에 쓰지 않는다) */
  attachmentWay?: boolean;
};

export const DISTINCTIONS: Record<DistinctionId, Distinction> = {
  energy: {
    id: "energy", name: "에너지를 채우는 방식", plain: "사람과 말하며 어울릴 때 힘이 나는가, 혼자 정리하는 시간에 힘이 나는가", minScenes: 3, mixedContext: true,
    sides: { with: { label: "사람과 함께 · 말하며", rows: [{ row: "ei", toward: "low" }] }, alone: { label: "혼자 정리하며", rows: [{ row: "ei", toward: "high" }] } },
  },
  info: {
    id: "info", name: "정보를 받는 방식", plain: "사례 · 사실부터 보는가, 전체 의미 · 목적부터 보는가", minScenes: 3, mixedContext: true,
    sides: { fact: { label: "사실 · 사례 먼저", rows: [{ row: "sn", toward: "low" }] }, meaning: { label: "의미 · 목적 먼저", rows: [{ row: "sn", toward: "high" }] } },
  },
  basis: {
    id: "basis", name: "결정 · 판단 기준", plain: "근거 · 기준이 맞는지를 먼저 보는가, 사람 · 관계에 미칠 영향을 먼저 보는가", minScenes: 3, mixedContext: true,
    sides: { logic: { label: "근거 · 기준 먼저", rows: [{ row: "tf", toward: "low" }] }, people: { label: "사람 · 관계 먼저", rows: [{ row: "tf", toward: "high" }] } },
  },
  structure: {
    id: "structure", name: "일을 꾸리는 구조", plain: "미리 정해 두는 쪽인가, 열어 두고 그때그때 맞추는 쪽인가", minScenes: 3, mixedContext: true,
    sides: { planned: { label: "미리 정해 둠", rows: [{ row: "jp", toward: "low" }] }, open: { label: "열어 두고 맞춤", rows: [{ row: "jp", toward: "high" }] } },
  },
  first: {
    id: "first", name: "예상 밖 상황의 첫 반응", plain: "갑자기 일이 틀어졌을 때 가장 먼저 하는 일이 점검 · 실행 · 대화 · 환기 중 무엇인가", minScenes: 3, mixedContext: true,
    sides: {
      check: { label: "점검 · 정리", rows: [{ row: "caution", toward: "high" }] },
      act: { label: "바로 실행", rows: [{ row: "caution", toward: "low" }] },
      talk: { label: "대화", rows: [] },
      pause: { label: "환기 · 시간 두기", rows: [] },
    },
  },
  explore: {
    id: "explore", name: "시도와 신중 · 새로움", plain: "따져 보고 익숙한 쪽에 서는가, 먼저 해 보고 새로운 쪽으로 가는가", minScenes: 3, mixedContext: true,
    sides: {
      settled: { label: "따져 보고 익숙한 쪽", rows: [{ row: "caution", toward: "high" }, { row: "novelty", toward: "low" }] },
      venture: { label: "먼저 해 보고 새로운 쪽", rows: [{ row: "caution", toward: "low" }, { row: "novelty", toward: "high" }] },
    },
  },
  confirm: {
    id: "confirm", name: "가까운 사람과의 확인 방식", plain: "관계가 달라 보일 때 직접 묻는가, 시간 · 거리를 두는가, 내 쪽을 먼저 살피는가", minScenes: 3, mixedContext: false, attachmentWay: true,
    sides: { ask: { label: "직접 묻는다", rows: [] }, wait: { label: "시간 · 거리를 둔다", rows: [] }, reflect: { label: "내 쪽을 먼저 살핀다", rows: [] } },
  },
  repair: {
    id: "repair", name: "갈등 뒤 회복 순서", plain: "갈등이 생겼을 때 바로 푸는가, 시간을 둔 뒤 푸는가, 먼저 정리하고 푸는가", minScenes: 3, mixedContext: false, attachmentWay: true,
    sides: { now: { label: "바로 푼다", rows: [] }, later: { label: "시간을 둔 뒤 푼다", rows: [] }, sort: { label: "먼저 정리한다", rows: [] } },
  },
  help: {
    id: "help", name: "도움 받는 방식", plain: "도움을 받을 때 필요한 것을 말하는가, 먼저 혼자 해 보는가, 함께 하는 쪽을 택하는가", minScenes: 3, mixedContext: false, attachmentWay: true,
    sides: { ask: { label: "필요한 것을 말한다", rows: [] }, self: { label: "먼저 혼자 해 본다", rows: [] }, together: { label: "함께 하는 쪽", rows: [] } },
  },
};

export const DISTINCTION_IDS = Object.keys(DISTINCTIONS) as DistinctionId[];

// ───────────── 장면 · 선택지 읽기 ─────────────

/** 장면의 맥락 — 같은 쪽 읽기가 한 맥락에서만 나왔는지 보려는 분류(검토자 분류, 운영자 확인 필요) */
export type SceneContext = "work" | "social" | "close" | "solo";
export type Clarity = "clear" | "weak";
/** clear = 선택지 문장만으로 그쪽이라고 말할 수 있음 / weak = 그렇게 읽을 수 있지만 다른 해석도 가능(조건 · 이유가 섞임). weak는 상반을 알아보는 데는 쓰지만 방향을 정하는 데는 clear가 2개 이상 있어야 한다 */

export type OptionReading = {
  /** 이 선택지가 말해 주는 행동 사실 한 문장 — 선택지 문장을 그대로 옮기지 않고 점수 · 유형 이름을 붙이지 않는다(내부 근거) */
  fact: string;
  /** 주 구분의 어느 쪽인지. 읽지 않으면 null이고 이유(why)가 있다 */
  read: { side: string; clarity: Clarity } | null;
  /** read가 null이면 읽지 않는 이유, weak이면 약하게만 읽는 이유 — clear에는 없다 */
  why?: string;
};

export type SceneReading = {
  id: string;
  /** 주 구분 — 없으면 이 장면은 어느 구분도 읽지 않는다 */
  main: DistinctionId | null;
  context: SceneContext;
  options: [OptionReading, OptionReading, OptionReading, OptionReading];
  /** 읽지 않거나 주 구분을 옮긴 이유 · 검토 §3-3 표와 달라진 점 */
  note?: string;
};

const r = (side: string, clarity: Clarity = "clear") => ({ side, clarity });
const o = (fact: string, read: OptionReading["read"], why?: string): OptionReading => ({ fact, read, ...(why ? { why } : {}) });

export const SCENE_READINGS: SceneReading[] = [
  { id: "s01", main: "structure", context: "solo", note: "검토 §3-3은 에너지 · 구조 둘에 넣었지만 4개 중 3개가 시간을 정하는 방식이라 구조를 주 구분으로 했다.", options: [
    o("비는 날에는 미뤄 둔 일부터 처리한다", r("planned")),
    o("비는 날에는 그날 기분이 끌리는 일을 고른다", r("open")),
    o("비는 날에는 사람을 불러 함께할 일을 만든다", null, "함께 보내는 방식이라 구조 구분에서는 읽지 않는다"),
    o("비는 날에는 쉬면서 천천히 정한다", r("open")),
  ] },
  { id: "s02", main: "explore", context: "social", note: "검토 §3-3은 정보 · 결정 · 새로움에 걸쳐 넣었다. 2번(익숙한 곳) · 3번(새로운 경험)이 새로움을 가르므로 새로움을 주 구분으로 했다.", options: [
    o("여행지를 가격 · 동선 · 일정으로 비교해 제안한다", null, "비교해 정하는 방식이라 새로움 구분의 어느 쪽도 아니다"),
    o("여행지로 전에 좋았던 익숙한 곳을 추천한다", r("settled")),
    o("여행지를 새롭고 재미있는 경험 기준으로 고른다", r("venture")),
    o("여행지를 정하기 전에 다른 사람이 중요하게 보는 조건부터 묻는다", null, "사람의 조건을 묻는 방식이라 새로움과 무관하다"),
  ] },
  { id: "s03", main: "info", context: "work", note: "정보를 받는 방식을 가르는 장면이 이것 하나뿐이다(검토 §3-3의 '모자람' 그대로).", options: [
    o("처음 해 보는 일은 일단 해 보며 작동 방식을 익힌다", null, "먼저 해 보는지 따져 보는지의 문장이라 정보를 받는 방식으로는 읽지 않는다"),
    o("처음 해 보는 일은 자료와 예시를 충분히 찾아본다", r("fact")),
    o("처음 해 보는 일은 담당자에게 기준과 기대 결과를 확인한다", null, "구체 기준을 묻는 쪽에 가깝지만 사실 · 의미 어느 쪽인지 문장만으로 정하기 어렵다"),
    o("처음 해 보는 일은 전체 목적부터 이해하고 방식을 정한다", r("meaning")),
  ] },
  { id: "s04", main: "energy", context: "social", options: [
    o("여럿이 대화할 때 떠오른 이야기를 바로 꺼낸다", r("with")),
    o("여럿이 대화할 때 다른 사람의 생각을 먼저 듣는다", null, "듣기 먼저는 함께 · 혼자 어느 쪽인지 문장만으로 정하기 어렵다"),
    o("여럿이 대화할 때 질문을 던져 이야기를 넓힌다", r("with")),
    o("여럿이 대화할 때 생각이 확실해진 뒤에 말한다", r("alone")),
  ] },
  { id: "s05", main: "explore", context: "solo", note: "4개 중 3개가 따져 보는 쪽이라 먼저 해 보는 쪽은 3번(조건부)으로만 읽힌다 — 한쪽에 쏠린 장면(균형 표 참고).", options: [
    o("비싼 물건은 필요성과 예산을 다시 계산한다", r("settled")),
    o("비싼 물건은 다른 브랜드나 대안을 찾아본다", r("settled")),
    o("오래 고민한 물건이면 비싸도 산다", r("venture", "weak"), "'오래 고민한 경우'라는 조건이 붙어 있어 먼저 해 보는 쪽이라고 확정하기 어렵다"),
    o("비싼 물건은 며칠 지나도 계속 갖고 싶은지 본다", r("settled")),
  ] },
  { id: "s06", main: "first", context: "work", options: [
    o("계획에 변수가 생기면 우선순위를 다시 정해 새 계획을 세운다", r("check")),
    o("계획에 변수가 생기면 지금 가능한 방법부터 실행한다", r("act")),
    o("계획에 변수가 생기면 주변 사람과 해결책을 상의한다", r("talk")),
    o("계획에 변수가 생기면 원래 목표를 유지할지부터 다시 생각한다", r("check")),
  ] },
  { id: "s07", main: "basis", context: "social", options: [
    o("반대 의견을 들으면 근거가 무엇인지 자세히 묻는다", r("logic")),
    o("반대 의견을 들으면 내 생각을 설명하고 의견을 나눈다", null, "생각을 표현하는 방식이라 판단 기준의 어느 쪽도 아니다"),
    o("반대 의견을 들으면 상대 관점을 듣고 나중에 판단한다", r("people", "weak"), "상대의 입장을 먼저 듣는 모습이지만 판단을 미루는 방식으로도 읽힌다"),
    o("반대 의견을 들으면 그 차이가 실제 결정에 중요한지 먼저 본다", r("logic", "weak"), "실제 중요도를 따지는 모습이지만 근거 · 기준보다 현실 판단에 가까울 수도 있다"),
  ] },
  { id: "s08", main: "energy", context: "social", options: [
    o("사람들과 하루를 보낸 날은 집에서 아무것도 안 하고 쉰다", r("alone")),
    o("사람들과 하루를 보낸 날은 친한 사람에게 있었던 일을 이야기한다", r("with")),
    o("사람들과 하루를 보낸 날은 혼자 좋아하는 활동을 한다", r("alone")),
    o("사람들과 하루를 보낸 날도 재미있는 약속이 더 있으면 나간다", r("with")),
  ] },
  { id: "s09", main: "first", context: "work", options: [
    o("중요한 일 앞에서 문제가 생기면 해결할 일부터 차례로 처리한다", r("act")),
    o("중요한 일 앞에서 문제가 생기면 가능한 문제들이 머릿속에 빠르게 떠오른다", null, "행동이 아니라 머릿속 반응이라 다른 선택지와 같은 줄에 놓고 비교할 수 없다"),
    o("중요한 일 앞에서 문제가 생기면 잠깐 시간을 갖고 상황을 정리한다", r("check", "weak"), "시간을 두는 것과 정리하는 것이 함께 들어 있어 환기와 구분하기 어렵다"),
    o("중요한 일 앞에서 문제가 생기면 누군가와 이야기하며 생각을 정돈한다", r("talk")),
  ] },
  { id: "s10", main: null, context: "solo", note: "자극(소음)에 대한 대처를 읽는 구분이 설계에 없다 — 22문항의 어느 항목과도 이어지지 않아 읽지 않는다.", options: [
    o("집중하는데 주변이 시끄러워지면 자리를 옮긴다", null, "읽는 구분이 없는 장면이다"),
    o("집중하는데 주변이 시끄러워지면 이어폰 등으로 환경을 조절한다", null, "읽는 구분이 없는 장면이다"),
    o("집중하는데 주변이 시끄러워져도 조금 지나면 적응해 계속한다", null, "읽는 구분이 없는 장면이다"),
    o("집중하는데 주변이 시끄러워지면 그날 컨디션에 따라 반응이 다르다", null, "읽는 구분이 없는 장면이다(상황에 따라 다름 선택지)"),
  ] },
  { id: "s11", main: "first", context: "solo", note: "감정이 가라앉는 방식을 묻는 장면이라 맥락을 혼자(solo)로 분류했다 — 첫 반응 구분이 한 맥락(일)에만 쏠리지 않게 하려는 분류이며 운영자 확인 필요.", options: [
    o("공들인 일이 기대와 다르게 끝나면 어디서 잘못됐는지 분석한다", r("check")),
    o("공들인 일이 기대와 다르게 끝나면 다른 일로 기분을 환기한다", r("pause")),
    o("공들인 일이 기대와 다르게 끝나면 가까운 사람에게 이야기한다", r("talk")),
    o("공들인 일이 기대와 다르게 끝나면 다시 시도할 시점을 정해 둔다", null, "분석 · 환기 · 대화 · 실행 중 어느 쪽인지 문장만으로 정하기 어렵다"),
  ] },
  { id: "s12", main: "energy", context: "social", options: [
    o("아는 사람이 없는 모임에서는 먼저 말을 건다", r("with")),
    o("아는 사람이 없는 모임에서는 상황을 살피다 자연스럽게 대화에 낀다", null, "살피다 어울리는 모습이라 함께 · 혼자 어느 쪽인지 정하기 어렵다"),
    o("아는 사람이 없는 모임에서는 혼자 구경하며 분위기에 적응한다", r("alone")),
    o("아는 사람이 없는 모임에서는 주최자나 공통 관심사가 있는 사람을 찾아간다", r("with", "weak"), "먼저 다가가지만 아는 사람을 찾는 방식이라 말을 거는 것과는 조금 다르다"),
  ] },
  { id: "s13", main: "first", context: "work", note: "검토 §3-3은 구조에 넣었다. 4개 선택지가 정리 · 착수 · 도움 요청의 첫 행동이라 첫 반응으로 옮겼다.", options: [
    o("할 일이 한꺼번에 몰리면 급한 것부터 순서를 매긴다", r("check")),
    o("할 일이 한꺼번에 몰리면 눈에 보이는 작은 일부터 시작한다", r("act")),
    o("할 일이 한꺼번에 몰리면 집중이 필요한 일부터 끝낸다", r("check", "weak"), "순서의 기준이 있는 모습이지만 바로 착수하는 모습으로도 읽힌다"),
    o("할 일이 한꺼번에 몰리면 도움을 구하거나 일정을 조정한다", r("talk", "weak"), "도움을 청하는 쪽이지만 일정 조정(정리)이 함께 들어 있다"),
  ] },
  { id: "s14", main: "energy", context: "solo", options: [
    o("정신없던 날 저녁에는 조용히 쉬며 에너지를 회복한다", r("alone")),
    o("정신없던 날 저녁에는 운동이나 산책으로 몸을 움직인다", null, "몸을 움직이는 방식이라 함께 · 혼자 어느 쪽인지 정하기 어렵다"),
    o("정신없던 날 저녁에는 누군가와 이야기하며 풀어낸다", r("with")),
    o("정신없던 날 저녁에는 좋아하는 취미에 집중한다", r("alone", "weak"), "혼자 하는 활동으로 읽히지만 취미를 누구와 하는지는 문장에 없다"),
  ] },
  { id: "s15", main: "confirm", context: "close", options: [
    o("가까운 사람과의 약속이 취소되면 사정을 이해하고 다음 약속을 잡는다", null, "받아들이고 일정을 다시 잡는 모습이라 확인 방식의 어느 쪽도 아니다"),
    o("가까운 사람과의 약속이 취소되면 아쉬움을 말하고 다른 계획을 만든다", null, "마음을 표현하는 모습이라 확인 방식의 어느 쪽도 아니다"),
    o("가까운 사람과의 약속이 취소되면 왜 취소됐는지 더 물어본다", r("ask")),
    o("가까운 사람과의 약속이 취소되면 혼자 시간을 보내고 나중에 이야기한다", r("wait")),
  ] },
  { id: "s16", main: "confirm", context: "close", options: [
    o("친한 사람의 말수가 줄면 무슨 일이 있는지 직접 묻는다", r("ask")),
    o("친한 사람의 말수가 줄면 시간을 주면서 평소처럼 대한다", r("wait")),
    o("친한 사람의 말수가 줄면 최근 둘 사이에 있었던 일을 떠올려 본다", r("reflect")),
    o("친한 사람의 말수가 줄면 가볍게 말을 걸고 반응을 살핀다", r("ask", "weak"), "묻는 쪽이지만 직접 묻지 않고 반응을 보는 방식이라 1번과 같은 줄로 보기 어렵다"),
  ] },
  { id: "s17", main: "repair", context: "close", options: [
    o("감정이 올라온 갈등에서는 잠시 멈추고 진정된 뒤 다시 이야기한다", r("later")),
    o("감정이 올라온 갈등에서는 서로 무엇이 다른지 정리해 본다", r("sort")),
    o("감정이 올라온 갈등에서는 오해를 남기지 않으려고 바로 풀려고 한다", r("now")),
    o("감정이 올라온 갈등에서는 상대가 이야기할 준비가 됐는지 확인한다", r("later", "weak"), "상대의 때를 기다리는 모습이지만 직접 묻는 모습으로도 읽힌다"),
  ] },
  { id: "s18", main: "help", context: "close", options: [
    o("도움을 주겠다는 사람에게 필요한 부분을 구체적으로 부탁한다", r("ask")),
    o("도움을 주겠다는 사람에게 먼저 혼자 해 보고 어려우면 받겠다고 한다", r("self")),
    o("도움을 주겠다는 사람이 함께 생각해 주는 것만으로 도움이 된다", r("together")),
    o("도움을 받기 전에 원하는 방식을 먼저 정해 상대에게 설명한다", r("ask", "weak"), "필요를 말하는 모습이지만 방식을 정해 두는 모습으로도 읽힌다"),
  ] },
  { id: "s19", main: "repair", context: "close", options: [
    o("서운한 일이 생기면 어떤 점이 서운했는지 비교적 빨리 말한다", r("now")),
    o("서운한 일이 생기면 왜 그런 일이 생겼는지 먼저 생각한다", r("sort")),
    o("서운한 일이 생기면 지나간 뒤 차분하게 이야기한다", r("later")),
    o("서운한 일이 생기면 반복될 문제인지 판단하고 이야기한다", r("sort")),
  ] },
  { id: "s20", main: "confirm", context: "close", options: [
    o("상대가 혼자 있고 싶어 하면 그동안 내 일이나 취미를 한다", r("wait")),
    o("상대가 혼자 있고 싶어 하면 얼마나 시간이 필요한지 대략 맞춘다", r("ask", "weak"), "필요한 시간을 맞춰 본다는 뜻이라 직접 묻는지는 문장에 없다"),
    o("상대가 혼자 있고 싶어 하면 상황을 이해하려고 짧게 물어본다", r("ask")),
    o("상대가 혼자 있고 싶어 하면 다음에 함께할 시간을 정해 둔다", null, "다음 약속으로 마음을 놓는 방식이라 직접 묻기 · 시간 두기 · 내 쪽 살피기 어디에도 넣기 어렵다"),
  ] },
  { id: "s21", main: "help", context: "close", note: "도움 받는 방식을 가르는 장면이 s18 · s21 둘뿐이라 어떤 답이어도 읽지 않는다(검토 §3-3의 '모자람' 그대로).", options: [
    o("취향에 안 맞는 선물이어도 마음이 고마워 기쁘게 받는다", null, "마음을 받는 모습이라 도움 받는 방식의 어느 쪽도 아니다"),
    o("취향에 안 맞는 선물에는 고마움을 말하고 다음엔 취향도 알려 준다", r("ask")),
    o("취향에 안 맞는 선물이면 왜 그걸 골랐는지 궁금해한다", null, "궁금해하는 모습이라 도움 받는 방식의 어느 쪽도 아니다"),
    o("취향에 안 맞는 선물이면 같이 활용할 방법을 생각한다", r("together", "weak"), "함께 쓰는 쪽이지만 도움을 받는 방식인지는 문장만으로 정하기 어렵다"),
  ] },
  { id: "s22", main: "basis", context: "social", note: "검토 §3-3은 갈등 뒤 회복에 넣었지만 4개 선택지가 의견 차이를 조율하는 기준(비교 · 번갈아 맞춤)이라 판단 기준으로 옮겼다.", options: [
    o("가고 싶은 곳이 다르면 시간을 나눠 둘 다 가 본다", null, "시간 배분 방식이라 근거 · 사람 어느 쪽인지 정하기 어렵다"),
    o("가고 싶은 곳이 다르면 각자 잠깐 다녀온 뒤 다시 만난다", null, "따로 움직이는 방식이라 근거 · 사람 어느 쪽인지 정하기 어렵다"),
    o("가고 싶은 곳이 다르면 이동 거리와 만족도를 비교해서 정한다", r("logic")),
    o("가고 싶은 곳이 다르면 이번엔 한쪽에 맞추고 다음 선택을 바꾼다", r("people", "weak"), "관계의 균형을 보는 모습이지만 번갈아 정하는 규칙에 가깝게도 읽힌다"),
  ] },
  { id: "s23", main: "basis", context: "work", options: [
    o("모두 좋아하는 계획이 걱정되면 예상되는 위험을 구체적으로 설명한다", r("logic")),
    o("모두 좋아하는 계획이 걱정되면 먼저 작은 규모로 해 보자고 한다", null, "작게 시도하는 제안이라 판단 기준의 어느 쪽도 아니다"),
    o("모두 좋아하는 계획이 걱정되면 다수의 선택을 존중하되 대비책을 마련한다", r("people", "weak"), "다수를 존중하는 모습이지만 위험을 따져 대비하는 모습도 함께 있다"),
    o("모두 좋아하는 계획이 걱정되면 다른 대안도 함께 비교하자고 한다", r("logic", "weak"), "비교를 제안하는 모습이지만 근거를 따지는 것인지 의견을 모으는 것인지 문장만으로 정하기 어렵다"),
  ] },
  { id: "s24", main: "repair", context: "close", options: [
    o("오해를 받으면 내 의도와 당시 상황을 설명한다", r("now", "weak"), "바로 설명하는 모습이지만 자기 입장을 말하는 것이라 풀려는 행동과는 조금 다르다"),
    o("오해를 받으면 어떤 부분에서 그렇게 느꼈는지 먼저 묻는다", r("sort", "weak"), "먼저 묻는 모습이지만 바로 푸는 모습으로도 읽힌다"),
    o("오해를 받으면 오해를 풀 수 있는 행동부터 한다", r("now")),
    o("오해를 받으면 서로 진정된 뒤 이야기할 시간을 잡는다", r("later")),
  ] },
  { id: "s25", main: "structure", context: "solo", options: [
    o("하고 싶은 일과 해야 하는 일이 겹치면 중요한 일을 끝낸 뒤 하고 싶은 것을 한다", r("planned")),
    o("하고 싶은 일과 해야 하는 일이 겹치면 두 일을 조금씩 나눠 진행한다", null, "나누는 방식이라 미리 정하는지 열어 두는지 문장만으로 정하기 어렵다"),
    o("하고 싶은 일과 해야 하는 일이 겹치면 기한이나 조건을 조정할 방법을 찾는다", r("open", "weak"), "열어 두고 맞추는 모습이지만 미리 협상하는 모습으로도 읽힌다"),
    o("하고 싶은 일과 해야 하는 일이 겹치면 지금 놓치면 아쉬운 쪽이 무엇인지 판단한다", r("open", "weak"), "그때그때 판단하는 모습이지만 기준을 정해 두고 고르는 모습으로도 읽힌다"),
  ] },
  { id: "s26", main: null, context: "social", note: "검토 §3-3은 에너지에 넣었다. 네 선택지가 모두 대화를 이어 가는 방식의 차이(경험 나눔 · 질문 · 정보 · 다음 약속)라 함께 · 혼자를 가르지 못해 읽지 않는다.", options: [
    o("공통 관심사를 만나면 관련 경험을 신나게 나눈다", null, "읽는 구분이 없는 장면이다"),
    o("공통 관심사를 만나면 상대가 어떤 점에 관심 있는지 더 묻는다", null, "읽는 구분이 없는 장면이다"),
    o("공통 관심사를 만나면 추천할 정보나 콘텐츠를 알려 준다", null, "읽는 구분이 없는 장면이다"),
    o("공통 관심사를 만나면 다음에 함께할 기회가 있을지 생각한다", null, "읽는 구분이 없는 장면이다"),
  ] },
  { id: "s27", main: "explore", context: "solo", note: "검토 §3-3은 첫 반응 · 새로움에 넣었다. 계획이 재미없어졌을 때 이어 가는지 바꾸는지를 보는 장면이라 새로움으로 옮겼고, 3개가 이어 가는 쪽이라 한쪽에 쏠린 장면이다.", options: [
    o("재미없어진 계획은 처음 목표를 떠올리고 계속할지 판단한다", r("settled", "weak"), "목표를 지키는 모습이지만 따져 본 뒤 정하는 모습으로도 읽힌다"),
    o("재미없어진 계획은 진행 방식을 바꿔 본다", r("venture", "weak"), "새 방식을 시도하는 모습이지만 계획은 이어 가는 모습으로도 읽힌다"),
    o("재미없어진 계획은 잠시 쉬고 다시 의욕이 생기는지 본다", null, "쉬는 모습이라 따져 보는 쪽 · 새로운 쪽 어디에도 넣기 어렵다"),
    o("재미없어진 계획은 다른 관심사로 넘어가는 것도 고려한다", r("venture")),
  ] },
  { id: "s28", main: "structure", context: "social", note: "검토 §3-3은 구조 · 관계 확인에 넣었다. 정보가 부족한 약속을 정하는 방식이라 구조로 읽는다.", options: [
    o("정보가 부족한 약속은 먼저 날짜를 잡고 세부 사항을 맞춘다", r("planned", "weak"), "먼저 정하는 모습이지만 세부를 열어 두는 모습으로도 읽힌다"),
    o("정보가 부족한 약속은 필요한 정보가 모일 때까지 결정을 미룬다", r("open")),
    o("정보가 부족한 약속은 선택지 몇 개를 정해 함께 비교한다", r("planned", "weak"), "틀을 정해 두는 모습이지만 함께 정하는 모습으로도 읽힌다"),
    o("정보가 부족한 약속은 바꿀 수 있는 조건을 정한 뒤 임시로 결정한다", r("open")),
  ] },
];

// ───────────── 읽기 쉬운 조회 · 점검 ─────────────

const SCENE_BY_ID = new Map(SCENE_READINGS.map((s) => [s.id, s]));
export const sceneReadingOf = (id: string): SceneReading | undefined => SCENE_BY_ID.get(id);
export const itemOf = (id: string): SituationalItem | undefined => SITUATIONAL_V2_ITEMS.find((i) => i.id === id);

/** 구분마다 설계된 장면 목록 */
export function scenesOf(d: DistinctionId): SceneReading[] {
  return SCENE_READINGS.filter((s) => s.main === d);
}

/** 장면에서 어느 쪽이 읽힐 수 있는지(선택지 4개를 모두 보았을 때) — 한쪽만 읽히면 그 장면은 반대쪽 방향을 보여 줄 수 없다 */
export function sceneBalance(s: SceneReading): { sides: Record<string, { clear: number; weak: number }>; oneSided: boolean; readable: number } {
  const sides: Record<string, { clear: number; weak: number }> = {};
  let readable = 0;
  for (const opt of s.options) {
    if (!opt.read) continue;
    readable += 1;
    const cell = (sides[opt.read.side] ??= { clear: 0, weak: 0 });
    cell[opt.read.clarity] += 1;
  }
  const hasClear = Object.values(sides).filter((c) => c.clear > 0).length;
  return { sides, readable, oneSided: s.main !== null && hasClear < 2 && Object.keys(sides).length > 0 };
}

// ───────────── 판정: 충분 · 상반 · 부족 ─────────────

/** 1~4 = 고른 선택지 번호, "na" = 이런 일이 거의 없었어요 · 맞는 선택지가 없어요(제안 — 원본에는 없는 다섯째 선택, 운영자 승인 필요), null = 답하지 않음 */
export type Answer = 1 | 2 | 3 | 4 | "na" | null;
export type AnswerSheet = Partial<Record<string, Answer>>;

export type ReadStatus = "sufficient" | "contrast" | "insufficient";
export type InsufficientCode = "design-short" | "few-answered" | "few-read" | "weak-only" | "one-context";

export type SceneHit = { scene: string; side: string; clarity: Clarity; context: SceneContext; fact: string };

export type DistinctionReading = {
  d: DistinctionId;
  status: ReadStatus;
  /** sufficient일 때 뚜렷한 쪽 */
  side?: string;
  /** sufficient일 때 — 3장면 이상이 같은 쪽이면 strong, 2장면이면 moderate */
  strength?: "strong" | "moderate";
  /** insufficient일 때 이유 */
  code?: InsufficientCode;
  /** 설계된 장면 수 · 답한 장면 수 · 읽힌 장면 수 */
  designed: number;
  answered: number;
  read: number;
  counts: Record<string, number>;
  hits: SceneHit[];
};

export const INSUFFICIENT_TEXT: Record<InsufficientCode, string> = {
  "design-short": "이 구분을 읽는 장면이 3개보다 적게 설계돼 있어 어떤 답이어도 읽지 않는다",
  "few-answered": "답한 장면이 3개보다 적어 읽지 않는다",
  "few-read": "고른 답 가운데 이 구분으로 읽히는 장면이 2개보다 적어 읽지 않는다",
  "weak-only": "같은 쪽으로 읽힌 장면은 있지만 뚜렷하게 읽히는 장면이 2개보다 적어 방향으로 쓰지 않는다",
  "one-context": "같은 쪽으로 읽힌 장면이 한 가지 맥락(일 · 친구 · 가까운 관계 · 혼자)에만 있어 방향으로 쓰지 않는다",
};

/**
 * 한 구분을 여러 장면의 선택으로 판정한다(점수를 더하지 않는다).
 *  1) 설계된 장면이 3개보다 적으면 부족(design-short)
 *  2) 답한 장면(1~4번을 고름, "na" · 미응답 제외)이 3개보다 적으면 부족(few-answered)
 *  3) 답한 장면 가운데 읽힌 장면이 2개보다 적으면 부족(few-read)
 *  4) 읽힌 쪽이 둘 이상이면 상반(상황별 차이) — 평균 내지 않고 장면 이름과 함께 둘 다 보인다. weak 읽기도 반대쪽 신호로 센다
 *  5) 읽힌 쪽이 하나이고 clear가 2개 이상이면 충분. 읽힌 장면이 3개 이상이면 strong, 2개면 moderate
 *     (clear가 2개보다 적으면 부족(weak-only) · 같은 쪽이 한 맥락에만 있으면 부족(one-context))
 */
export function judgeDistinction(d: DistinctionId, sheet: AnswerSheet): DistinctionReading {
  const dist = DISTINCTIONS[d];
  const designed = scenesOf(d);
  const counts: Record<string, number> = Object.fromEntries(Object.keys(dist.sides).map((k) => [k, 0]));
  const hits: SceneHit[] = [];
  let answered = 0;
  for (const scene of designed) {
    const a = sheet[scene.id];
    if (a === undefined || a === null || a === "na") continue;
    answered += 1;
    const opt = scene.options[a - 1];
    if (!opt.read) continue;
    counts[opt.read.side] += 1;
    hits.push({ scene: scene.id, side: opt.read.side, clarity: opt.read.clarity, context: scene.context, fact: opt.fact });
  }
  const base = { d, designed: designed.length, answered, read: hits.length, counts, hits };
  const insufficient = (code: InsufficientCode): DistinctionReading => ({ ...base, status: "insufficient", code });
  if (designed.length < dist.minScenes) return insufficient("design-short");
  if (answered < dist.minScenes) return insufficient("few-answered");
  if (hits.length < 2) return insufficient("few-read");
  const sides = Object.entries(counts).filter(([, n]) => n > 0).map(([k]) => k);
  if (sides.length >= 2) return { ...base, status: "contrast" };
  const side = sides[0];
  const clearCount = hits.filter((h) => h.clarity === "clear").length;
  if (clearCount < 2) return insufficient("weak-only");
  if (dist.mixedContext && new Set(hits.map((h) => h.context)).size < 2) return insufficient("one-context");
  return { ...base, status: "sufficient", side, strength: hits.length >= 3 ? "strong" : "moderate" };
}

export function judgeAll(sheet: AnswerSheet): DistinctionReading[] {
  return DISTINCTION_IDS.map((d) => judgeDistinction(d, sheet));
}

// ───────────── 개인 유형 10개 연결안(기존 FLAVOR_RULES 그대로, 점수 대신 읽기 상태로) ─────────────

export type RowRead = { row: RowId; dir: "high" | "low" | "split" | "unread"; strength?: "strong" | "moderate"; from: DistinctionId[] };

const ROWS: RowId[] = ["ei", "sn", "tf", "jp", "novelty", "caution", "sensitivity", "persistence", "anxiety", "avoidance"];

/** 행마다 이 설계에서 읽을 수 있는 구분이 있는가(설계 장면 3개 이상) — 없으면 그 행은 어떤 답이어도 읽지 않는다 */
export function readableRows(): Record<RowId, DistinctionId[]> {
  const out = Object.fromEntries(ROWS.map((row) => [row, [] as DistinctionId[]])) as Record<RowId, DistinctionId[]>;
  for (const d of DISTINCTION_IDS) {
    if (scenesOf(d).length < DISTINCTIONS[d].minScenes) continue;
    for (const side of Object.values(DISTINCTIONS[d].sides)) for (const rl of side.rows) if (!out[rl.row].includes(d)) out[rl.row].push(d);
  }
  return out;
}

/** 충분으로 읽힌 구분들이 가리키는 행의 방향을 모은다. 서로 다른 방향이 나오면 split, 충분한 구분이 없고 상반만 있으면 split, 아무것도 없으면 unread */
export function rowReads(readings: DistinctionReading[]): Record<RowId, RowRead> {
  const out = Object.fromEntries(ROWS.map((row) => [row, { row, dir: "unread", from: [] } as RowRead])) as Record<RowId, RowRead>;
  const dirs: Record<string, { dir: "high" | "low"; strength: "strong" | "moderate"; d: DistinctionId }[]> = {};
  const contrasted = new Set<RowId>();
  for (const rd of readings) {
    const dist = DISTINCTIONS[rd.d];
    if (rd.status === "sufficient" && rd.side && rd.strength) for (const rl of dist.sides[rd.side].rows) (dirs[rl.row] ??= []).push({ dir: rl.toward, strength: rd.strength, d: rd.d });
    if (rd.status === "contrast") for (const side of Object.values(dist.sides)) for (const rl of side.rows) contrasted.add(rl.row);
  }
  for (const row of ROWS) {
    const list = dirs[row] ?? [];
    if (list.length === 0) {
      if (contrasted.has(row)) out[row] = { row, dir: "split", from: readings.filter((x) => x.status === "contrast" && Object.values(DISTINCTIONS[x.d].sides).some((s) => s.rows.some((rl) => rl.row === row))).map((x) => x.d) };
      continue;
    }
    const set = new Set(list.map((x) => x.dir));
    const from = [...new Set(list.map((x) => x.d))];
    out[row] = set.size > 1 ? { row, dir: "split", from } : { row, dir: list[0].dir, strength: list.some((x) => x.strength === "strong") ? "strong" : "moderate", from };
  }
  return out;
}

export type FlavorRead28 = {
  winner: "a" | "b" | null;
  reason: "ok" | "no-data" | "unclear" | "weak";
  /** 각 모습을 받치는 행(읽은 것만) */
  support: { a: RowId[]; b: RowId[] };
  /** 이 갈래의 유형을 정하는 데 쓰는 행 가운데 이 설계로는 읽을 수 없는 행 */
  unreadable: RowId[];
};

/**
 * 한 갈래 안의 두 모습 가르기 — personal-type.ts의 FLAVOR_RULES를 그대로 쓰고 점수 차이 대신 읽기 상태로 정한다.
 *  · 한 모습만 받쳐지고(반대 모습의 행이 같은 방향으로 읽힌 것도 같은 말이다) 받치는 행이 둘 이상이거나 strong이 하나라도 있을 때만 정한다.
 *  · 두 모습이 모두 받쳐지거나 이기는 모습의 다른 행이 상황별 차이로 읽혔으면 unclear, 받침이 하나뿐이고 strong이 아니면 weak(정하지 않음), 읽은 행이 하나도 없으면 no-data.
 */
export function readFlavor28(group: Group, rows: Record<RowId, RowRead>): FlavorRead28 {
  const rule = FLAVOR_RULES[group];
  const parts = (side: "a" | "b") => (side === "a" ? rule.aParts : rule.bParts);
  const supporting = (side: "a" | "b") => parts(side).filter((p) => rows[p.row as RowId].dir === p.toward);
  const a = supporting("a");
  const b = supporting("b");
  const touched = [...rule.aParts, ...rule.bParts].some((p) => rows[p.row as RowId].dir !== "unread");
  const unreadable = [...new Set([...rule.aParts, ...rule.bParts].map((p) => p.row as RowId))].filter((row) => readableRows()[row].length === 0);
  const support = { a: a.map((p) => p.row as RowId), b: b.map((p) => p.row as RowId) };
  if (!touched) return { winner: null, reason: "no-data", support, unreadable };
  if (a.length > 0 && b.length > 0) return { winner: null, reason: "unclear", support, unreadable };
  const side = a.length > 0 ? "a" : b.length > 0 ? "b" : null;
  if (!side) return { winner: null, reason: "unclear", support, unreadable };
  const picked = side === "a" ? a : b;
  // 이기는 모습의 다른 행이 "상황별 차이(갈림)"로 읽혔다면 그 모습에는 엇갈리는 근거가 있는 것이라 정하지 않는다(지금 22문항 규칙보다 보수적이다)
  if (parts(side).some((p) => rows[p.row as RowId].dir === "split")) return { winner: null, reason: "unclear", support, unreadable };
  const firm = picked.length >= 2 || picked.some((p) => rows[p.row as RowId].strength === "strong");
  return firm ? { winner: side, reason: "ok", support, unreadable } : { winner: null, reason: "weak", support, unreadable };
}

export type TypeLink28 =
  | { kind: "type"; id: PersonalTypeId; name: string; group: Group; support: RowId[]; unreadable: RowId[] }
  | { kind: "mixed"; reason: "saju-balanced" | "response-missing" | "response-unclear"; name: string; detail: string };

/**
 * 사주에서 정해진 갈래 후보(personal-type.ts의 sajuTilt가 정한 값, 이 파일은 사주를 계산하지 않는다)와 28문항 읽기로 개인 유형 10개 중 하나를 연결한다.
 * 읽기가 부족하면 유형을 억지로 정하지 않고 혼합 경향으로 둔다.
 */
export function typeFrom28(candidates: Group[], readings: DistinctionReading[]): TypeLink28 {
  if (candidates.length === 0) return { kind: "mixed", reason: "saju-balanced", name: MIXED_TYPE.name, detail: "사주에서 큰 방향이 하나로 정해지지 않아 이름을 붙이지 않아요" };
  const rows = rowReads(readings);
  const reads = candidates.map((group) => ({ group, flavor: readFlavor28(group, rows) }));
  const decided = reads.filter((x) => x.flavor.winner);
  if (decided.length === 0) {
    const missing = reads.every((x) => x.flavor.reason === "no-data");
    return { kind: "mixed", reason: missing ? "response-missing" : "response-unclear", name: MIXED_TYPE.name, detail: missing ? "이 갈래를 가르는 행이 읽히지 않아 응답으로 모습을 정할 수 없어요" : "읽힌 응답이 한쪽으로 모이지 않거나 받침이 약해 이름을 붙이지 않아요" };
  }
  // 후보 갈래가 둘 이상이면 받침이 가장 많은 하나만 고른다. 같으면 정하지 않는다
  const ranked = [...decided].sort((x, y) => y.flavor.support[y.flavor.winner!].length - x.flavor.support[x.flavor.winner!].length);
  const best = ranked[0];
  const second = ranked[1];
  const bestN = best.flavor.support[best.flavor.winner!].length;
  if (second && second.flavor.support[second.flavor.winner!].length >= bestN) return { kind: "mixed", reason: "response-unclear", name: MIXED_TYPE.name, detail: "사주 후보가 둘 이상이고 응답이 어느 한쪽 갈래를 더 받쳐 주지 않아 이름을 붙이지 않아요" };
  const rule = FLAVOR_RULES[best.group];
  const id = best.flavor.winner === "a" ? rule.a : rule.b;
  return { kind: "type", id, name: PERSONAL_TYPES[id].name, group: best.group, support: best.flavor.support[best.flavor.winner!], unreadable: best.flavor.unreadable };
}

/** 10개 유형마다 이 설계로 읽을 수 있는 응답 행 — 읽을 수 없는 행이 있는 유형은 그 행으로는 근거를 만들지 못한다 */
export function typeCoverage(): { id: PersonalTypeId; name: string; group: Group; parts: { row: RowId; toward: "high" | "low"; readable: boolean; via: DistinctionId[] }[]; reachable: boolean }[] {
  const readable = readableRows();
  const out: ReturnType<typeof typeCoverage> = [];
  for (const group of Object.keys(FLAVOR_RULES) as Group[]) {
    const rule = FLAVOR_RULES[group];
    for (const side of ["a", "b"] as const) {
      const id = side === "a" ? rule.a : rule.b;
      const parts = (side === "a" ? rule.aParts : rule.bParts).map((p) => ({ row: p.row as RowId, toward: p.toward, readable: readable[p.row as RowId].length > 0, via: readable[p.row as RowId] }));
      out.push({ id, name: PERSONAL_TYPES[id].name, group, parts, reachable: parts.some((p) => p.readable) });
    }
  }
  return out;
}

