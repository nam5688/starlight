// 상황형 28문항의 읽기 규칙 — 연결표 B(28문항 전용, 운영자 결정 2026-10-20). 원본 복원이 아니라 미유 쪽이 새로 정한 규칙이고, 사람 시험 · 전문가 검토 전의 설계 가설이다.
//
// 구분: 원본 = 장면 28 · 선택지 112(drafts/situational-v2-draft.ts, 운영자가 보낸 글 그대로, 채점 · 읽기는 원본에 처음부터 없었다).
//        이 파일은 그 선택지가 말해 주는 행동을 "구분의 어느 쪽인지"로 읽는 표와, 여러 장면의 읽기를 가로로 모아 판정하는 규칙이다.
// 읽는 방식 — 22문항 점수 환산과 다르다:
//  · 선택지마다 점수를 더하지 않는다. 고른 선택지는 "행동 한 문장 + 어느 구분의 어느 쪽인지(또는 읽지 않음)"로만 바뀐다. 한 선택지는 최대 하나의 구분만 읽는다(같은 답이 두 번 세어지지 않는다).
//  · 구분마다 여러 장면의 선택을 가로로 읽어 충분(뚜렷한 방향) · 상반(상황별 차이, 평균 내지 않음) · 부족(읽지 않음)으로 판정한다. 부족하면 근거를 만들지 않는다.
//  · 정보를 받는 방식(사실 · 의미)은 이 질문 묶음에 장면이 하나뿐이라 읽지 않는다. 도움 받는 방식도 두 장면뿐이라 지금은 읽지 않는다 — 읽을 수 없는 것을 읽은 것처럼 쓰지 않는다.
//  · 애착에 관련된 세 구분(확인 방식 · 갈등 뒤 회복 · 도움 받는 방식)은 유형 이름이 아니라 방식으로만 말하고 개인 유형 10개의 계산에 쓰지 않는다.
//  · 어떤 사람의 응답도 기본값으로 쓰지 않는다 — 응답이 비면 아무것도 읽지 않는다.
// 이 파일은 순수 계산이다(AI · 네트워크 · 저장 없음). 점수 · 확률 · 정확도를 만들지 않는다.
import type { Group } from "../../saju/interpret/structure.ts";
import { FLAVOR_RULES, MIXED_TYPE, PERSONAL_TYPES, type PersonalTypeId } from "../personal-type.ts";
import { SITUATIONAL_V2_ITEMS, type SituationalItem } from "../drafts/situational-v2-draft.ts";

export const SITUATIONAL_READING_VERSION = "situational-v2-reading-0.2";
/** 화면 · 저장이 쓰는 질문 버전 이름(content_version과 요약 contentVersion) — 원문 초안 이름(situational-v2-draft-0.1)과 다르다: 읽는 규칙이 붙은 연결판이다 */
export const SITUATIONAL_CONTENT_VERSION = "situational-v2-live-0.1";

// ───────────── 구분 ─────────────

export type DistinctionId = "energy" | "basis" | "structure" | "first" | "explore" | "confirm" | "repair" | "help";

export type DistinctionSide = { /** 검토 · 문서용 이름 — 고객 글이 아니다 */ label: string };

export type Distinction = {
  id: DistinctionId;
  name: string;
  /** 무엇을 가르는 구분인지 한 줄 */
  plain: string;
  sides: Record<string, DistinctionSide>;
  /** 가까운 관계의 방식을 읽는 구분인가(유형 이름 · 개인 유형 계산에 쓰지 않는다) */
  attachmentWay?: boolean;
};

export const DISTINCTIONS: Record<DistinctionId, Distinction> = {
  energy: { id: "energy", name: "에너지를 채우는 방식", plain: "사람과 말하며 어울릴 때 힘이 나는가, 혼자 정리하는 시간에 힘이 나는가", sides: { with: { label: "사람과 함께 · 말하며" }, alone: { label: "혼자 정리하며" } } },
  basis: { id: "basis", name: "결정 · 판단 기준", plain: "근거 · 기준이 맞는지를 먼저 보는가, 사람 · 관계에 미칠 영향을 먼저 보는가", sides: { logic: { label: "근거 · 기준 먼저" }, people: { label: "사람 · 관계 먼저" } } },
  structure: { id: "structure", name: "일을 꾸리는 구조", plain: "미리 정해 두는 쪽인가, 열어 두고 그때그때 맞추는 쪽인가", sides: { planned: { label: "미리 정해 둠" }, open: { label: "열어 두고 맞춤" } } },
  first: { id: "first", name: "막히거나 틀어졌을 때의 첫 움직임", plain: "일이 막히거나 기대와 달라졌을 때 가장 먼저 하는 일이 점검 · 실행 · 대화 · 숨 돌리기 중 무엇인가", sides: { check: { label: "점검 · 정리" }, act: { label: "바로 실행" }, talk: { label: "사람과 대화" }, pause: { label: "숨 돌리기 · 시간 두기" } } },
  explore: { id: "explore", name: "시도와 신중 · 새로움", plain: "따져 보고 익숙한 쪽에 서는가, 먼저 해 보고 새로운 쪽으로 가는가", sides: { settled: { label: "따져 보고 익숙한 쪽" }, venture: { label: "먼저 해 보고 새로운 쪽" } } },
  confirm: { id: "confirm", name: "가까운 사람과의 확인 방식", plain: "관계가 달라 보일 때 직접 묻는가, 시간 · 거리를 두는가, 내 쪽을 먼저 살피는가", attachmentWay: true, sides: { ask: { label: "직접 묻는다" }, wait: { label: "시간 · 거리를 둔다" }, reflect: { label: "내 쪽을 먼저 살핀다" } } },
  repair: { id: "repair", name: "갈등 뒤 회복 순서", plain: "갈등이 생겼을 때 바로 푸는가, 시간을 둔 뒤 푸는가, 먼저 정리하고 푸는가", attachmentWay: true, sides: { now: { label: "바로 푼다" }, later: { label: "시간을 둔 뒤 푼다" }, sort: { label: "먼저 정리한다" } } },
  help: { id: "help", name: "도움 받는 방식", plain: "도움을 받을 때 필요한 것을 말하는가, 먼저 혼자 해 보는가, 함께 하는 쪽을 택하는가", attachmentWay: true, sides: { ask: { label: "필요한 것을 말한다" }, self: { label: "먼저 혼자 해 본다" }, together: { label: "함께 하는 쪽" } } },
};

export const DISTINCTION_IDS = Object.keys(DISTINCTIONS) as DistinctionId[];
/** 읽으려면 필요한 최소 장면 수 — 이보다 적게 설계돼 있으면 어떤 답이어도 읽지 않는다 */
export const MIN_SCENES = 3;
/** 한쪽으로 "뚜렷하다"고 하려면 같은 쪽으로 분명하게 읽힌 장면이 이만큼은 있어야 하고, 반대쪽 읽기보다 이만큼 이상 앞서야 한다 */
export const MIN_CLEAR = 2;
export const MIN_LEAD = 2;

// ───────────── 장면 · 선택지 읽기 ─────────────

/** 장면의 맥락 — 같은 쪽 읽기가 어떤 자리에서 나왔는지(고객 글의 "여러 장면에서 / 일에서만" 표현에 쓴다). 검토자 분류 */
export type SceneContext = "work" | "social" | "close" | "solo";
export const CONTEXT_LABEL: Record<SceneContext, string> = { work: "일하는 장면", social: "사람들과 있는 장면", close: "가까운 사이", solo: "혼자 있는 장면" };

export type Clarity = "clear" | "weak";
/** clear = 선택지 문장만으로 그쪽이라고 말할 수 있음 / weak = 그렇게 읽을 수 있지만 다른 해석도 가능. weak는 반대쪽 신호로 세지만 "뚜렷하다"의 근거로는 세지 않는다 */
export type OptionRead = { d: DistinctionId; side: string; clarity: Clarity };

export type OptionReading = {
  /** 이 선택지가 말해 주는 행동 사실 한 문장 — 점수 · 유형 이름을 붙이지 않는다(내부 근거) */
  fact: string;
  /** 읽는 쪽. 읽지 않으면 null이고 이유(why)가 있다 */
  read: OptionRead | null;
  /** read가 null이면 읽지 않는 이유, weak이면 약하게만 읽는 이유 — clear에는 없다 */
  why?: string;
};

export type SceneReading = {
  id: string;
  context: SceneContext;
  options: [OptionReading, OptionReading, OptionReading, OptionReading];
  /** 이 장면을 읽는 방식에 대한 검토 메모 */
  note?: string;
};

const c = (d: DistinctionId, side: string, fact: string): OptionReading => ({ fact, read: { d, side, clarity: "clear" } });
const w = (d: DistinctionId, side: string, fact: string, why: string): OptionReading => ({ fact, read: { d, side, clarity: "weak" }, why });
const n = (fact: string, why: string): OptionReading => ({ fact, read: null, why });
const NO_DIST = "이 장면의 선택으로는 읽을 구분이 없다";

export const SCENE_READINGS: SceneReading[] = [
  { id: "s01", context: "solo", options: [
    c("structure", "planned", "비는 날에는 미뤄 둔 일부터 처리한다"),
    c("structure", "open", "비는 날에는 그날 기분이 끌리는 일을 고른다"),
    w("energy", "with", "비는 날에는 사람을 불러 함께할 일을 만든다", "함께 보내려는 쪽이지만 쉬는 날을 어떻게 쓰는지로 에너지를 채우는 방식까지 정하기는 어렵다"),
    w("structure", "open", "비는 날에는 쉬면서 천천히 정한다", "쉬는 것이 목적일 수 있어 열어 두는 방식으로만 읽기 어렵다"),
  ] },
  { id: "s02", context: "social", note: "새로움(2 · 3번)과 판단 기준(1 · 4번)을 가르는 장면이다. 선택지마다 읽는 구분이 다르지만 한 선택은 하나만 읽는다.", options: [
    c("basis", "logic", "여행지를 가격 · 동선 · 일정으로 비교해 제안한다"),
    c("explore", "settled", "여행지로 전에 좋았던 익숙한 곳을 추천한다"),
    c("explore", "venture", "여행지를 새롭고 재미있는 경험 기준으로 고른다"),
    c("basis", "people", "여행지를 정하기 전에 다른 사람이 중요하게 보는 조건부터 묻는다"),
  ] },
  { id: "s03", context: "work", note: "정보를 받는 방식(사실 · 의미)을 가르는 장면이 이것 하나뿐이라 그 구분은 읽지 않고, 막혔을 때의 첫 움직임으로 읽는다.", options: [
    c("first", "act", "처음 해 보는 일은 일단 해 보며 작동 방식을 익힌다"),
    c("first", "check", "처음 해 보는 일은 자료와 예시를 충분히 찾아본다"),
    w("first", "talk", "처음 해 보는 일은 담당자에게 기준과 기대 결과를 확인한다", "담당자에게 확인하는 모습이지만 대화로 푸는 것인지 기준을 점검하는 것인지 문장만으로 정하기 어렵다"),
    w("first", "check", "처음 해 보는 일은 전체 목적부터 이해하고 방식을 정한다", "목적을 먼저 이해하는 모습이지만 점검 · 정리로 읽는 것이 맞는지 문장만으로 정하기 어렵다"),
  ] },
  { id: "s04", context: "social", options: [
    c("energy", "with", "여럿이 대화할 때 떠오른 이야기를 바로 꺼낸다"),
    n("여럿이 대화할 때 다른 사람의 생각을 먼저 듣는다", "듣기 먼저는 함께 · 혼자 어느 쪽인지 문장만으로 정하기 어렵다"),
    c("energy", "with", "여럿이 대화할 때 질문을 던져 이야기를 넓힌다"),
    c("energy", "alone", "여럿이 대화할 때 생각이 확실해진 뒤에 말한다"),
  ] },
  { id: "s05", context: "solo", note: "4개 중 3개가 따져 보는 쪽이라 먼저 해 보는 쪽은 3번(조건부)으로만 읽힌다 — 한쪽에 쏠린 장면.", options: [
    c("explore", "settled", "비싼 물건은 필요성과 예산을 다시 계산한다"),
    w("explore", "settled", "비싼 물건은 다른 브랜드나 대안을 찾아본다", "대안을 따져 보는 모습이지만 새로운 쪽을 찾는 것으로도 읽힌다"),
    w("explore", "venture", "오래 고민한 물건이면 비싸도 산다", "'오래 고민한 경우'라는 조건이 붙어 있어 먼저 해 보는 쪽이라고 확정하기 어렵다"),
    c("explore", "settled", "비싼 물건은 며칠 지나도 계속 갖고 싶은지 본다"),
  ] },
  { id: "s06", context: "work", options: [
    c("first", "check", "계획에 변수가 생기면 우선순위를 다시 정해 새 계획을 세운다"),
    c("first", "act", "계획에 변수가 생기면 지금 가능한 방법부터 실행한다"),
    c("first", "talk", "계획에 변수가 생기면 주변 사람과 해결책을 상의한다"),
    c("first", "check", "계획에 변수가 생기면 원래 목표를 유지할지부터 다시 생각한다"),
  ] },
  { id: "s07", context: "social", options: [
    c("basis", "logic", "반대 의견을 들으면 근거가 무엇인지 자세히 묻는다"),
    n("반대 의견을 들으면 내 생각을 설명하고 의견을 나눈다", "생각을 표현하는 방식이라 판단 기준의 어느 쪽도 아니다"),
    c("basis", "people", "반대 의견을 들으면 상대 관점을 듣고 나중에 판단한다"),
    w("basis", "logic", "반대 의견을 들으면 그 차이가 실제 결정에 중요한지 먼저 본다", "실제 중요도를 따지는 모습이지만 근거 · 기준보다 현실 판단에 가까울 수도 있다"),
  ] },
  { id: "s08", context: "social", options: [
    c("energy", "alone", "사람들과 하루를 보낸 날은 집에서 아무것도 안 하고 쉰다"),
    c("energy", "with", "사람들과 하루를 보낸 날은 친한 사람에게 있었던 일을 이야기한다"),
    c("energy", "alone", "사람들과 하루를 보낸 날은 혼자 좋아하는 활동을 한다"),
    c("energy", "with", "사람들과 하루를 보낸 날도 재미있는 약속이 더 있으면 나간다"),
  ] },
  { id: "s09", context: "work", options: [
    c("first", "act", "중요한 일 앞에서 문제가 생기면 해결할 일부터 차례로 처리한다"),
    n("중요한 일 앞에서 문제가 생기면 가능한 문제들이 머릿속에 빠르게 떠오른다", "행동이 아니라 머릿속 반응이라 다른 선택지와 같은 줄에 놓고 비교할 수 없다"),
    w("first", "check", "중요한 일 앞에서 문제가 생기면 잠깐 시간을 갖고 상황을 정리한다", "시간을 두는 것과 정리하는 것이 함께 들어 있어 숨 돌리기와 구분하기 어렵다"),
    c("first", "talk", "중요한 일 앞에서 문제가 생기면 누군가와 이야기하며 생각을 정돈한다"),
  ] },
  { id: "s10", context: "solo", note: "자극(소음)에 대한 대처를 읽는 구분이 설계에 없다 — 어느 구분과도 이어지지 않아 읽지 않는다.", options: [
    n("집중하는데 주변이 시끄러워지면 자리를 옮긴다", NO_DIST),
    n("집중하는데 주변이 시끄러워지면 이어폰 등으로 환경을 조절한다", NO_DIST),
    n("집중하는데 주변이 시끄러워져도 조금 지나면 적응해 계속한다", NO_DIST),
    n("집중하는데 주변이 시끄러워지면 그날 컨디션에 따라 반응이 다르다", `${NO_DIST}(상황에 따라 다름 선택지)`),
  ] },
  { id: "s11", context: "solo", note: "감정이 가라앉는 방식을 묻는 장면이라 맥락을 혼자(solo)로 분류했다 — 검토자 분류이며 운영자 확인 필요.", options: [
    c("first", "check", "공들인 일이 기대와 다르게 끝나면 어디서 잘못됐는지 분석한다"),
    c("first", "pause", "공들인 일이 기대와 다르게 끝나면 다른 일로 기분을 환기한다"),
    c("first", "talk", "공들인 일이 기대와 다르게 끝나면 가까운 사람에게 이야기한다"),
    w("structure", "planned", "공들인 일이 기대와 다르게 끝나면 다시 시도할 시점을 정해 둔다", "시점을 정해 두는 모습이지만 한동안 쉬는 모습으로도 읽힌다"),
  ] },
  { id: "s12", context: "social", options: [
    c("energy", "with", "아는 사람이 없는 모임에서는 먼저 말을 건다"),
    n("아는 사람이 없는 모임에서는 상황을 살피다 자연스럽게 대화에 낀다", "살피다 어울리는 모습이라 함께 · 혼자 어느 쪽인지 정하기 어렵다"),
    c("energy", "alone", "아는 사람이 없는 모임에서는 혼자 구경하며 분위기에 적응한다"),
    w("energy", "with", "아는 사람이 없는 모임에서는 주최자나 공통 관심사가 있는 사람을 찾아간다", "먼저 다가가지만 아는 사람을 찾는 방식이라 말을 거는 것과는 조금 다르다"),
  ] },
  { id: "s13", context: "work", options: [
    c("structure", "planned", "할 일이 한꺼번에 몰리면 급한 것부터 순서를 매긴다"),
    c("first", "act", "할 일이 한꺼번에 몰리면 눈에 보이는 작은 일부터 시작한다"),
    w("structure", "planned", "할 일이 한꺼번에 몰리면 집중이 필요한 일부터 끝낸다", "순서의 기준이 있는 모습이지만 바로 착수하는 모습으로도 읽힌다"),
    w("first", "talk", "할 일이 한꺼번에 몰리면 도움을 구하거나 일정을 조정한다", "도움을 청하는 쪽이지만 일정 조정(정리)이 함께 들어 있다"),
  ] },
  { id: "s14", context: "solo", options: [
    c("energy", "alone", "정신없던 날 저녁에는 조용히 쉬며 에너지를 회복한다"),
    n("정신없던 날 저녁에는 운동이나 산책으로 몸을 움직인다", "몸을 움직이는 방식이라 함께 · 혼자 어느 쪽인지 정하기 어렵다"),
    c("energy", "with", "정신없던 날 저녁에는 누군가와 이야기하며 풀어낸다"),
    w("energy", "alone", "정신없던 날 저녁에는 좋아하는 취미에 집중한다", "혼자 하는 활동으로 읽히지만 취미를 누구와 하는지는 문장에 없다"),
  ] },
  { id: "s15", context: "close", options: [
    n("가까운 사람과의 약속이 취소되면 사정을 이해하고 다음 약속을 잡는다", "받아들이고 일정을 다시 잡는 모습이라 확인 방식의 어느 쪽도 아니다"),
    n("가까운 사람과의 약속이 취소되면 아쉬움을 말하고 다른 계획을 만든다", "마음을 표현하는 모습이라 확인 방식의 어느 쪽도 아니다"),
    c("confirm", "ask", "가까운 사람과의 약속이 취소되면 왜 취소됐는지 더 물어본다"),
    c("confirm", "wait", "가까운 사람과의 약속이 취소되면 혼자 시간을 보내고 나중에 이야기한다"),
  ] },
  { id: "s16", context: "close", options: [
    c("confirm", "ask", "친한 사람의 말수가 줄면 무슨 일이 있는지 직접 묻는다"),
    c("confirm", "wait", "친한 사람의 말수가 줄면 시간을 주면서 평소처럼 대한다"),
    c("confirm", "reflect", "친한 사람의 말수가 줄면 최근 둘 사이에 있었던 일을 떠올려 본다"),
    w("confirm", "ask", "친한 사람의 말수가 줄면 가볍게 말을 걸고 반응을 살핀다", "묻는 쪽이지만 직접 묻지 않고 반응을 보는 방식이라 1번과 같은 줄로 보기 어렵다"),
  ] },
  { id: "s17", context: "close", options: [
    c("repair", "later", "감정이 올라온 갈등에서는 잠시 멈추고 진정된 뒤 다시 이야기한다"),
    c("repair", "sort", "감정이 올라온 갈등에서는 서로 무엇이 다른지 정리해 본다"),
    c("repair", "now", "감정이 올라온 갈등에서는 오해를 남기지 않으려고 바로 풀려고 한다"),
    w("repair", "later", "감정이 올라온 갈등에서는 상대가 이야기할 준비가 됐는지 확인한다", "상대의 때를 기다리는 모습이지만 직접 묻는 모습으로도 읽힌다"),
  ] },
  { id: "s18", context: "close", note: "도움 받는 방식을 가르는 장면이 s18 · s21 둘뿐이라 이 구분은 어떤 답이어도 읽지 않는다(2 < 3).", options: [
    c("help", "ask", "도움을 주겠다는 사람에게 필요한 부분을 구체적으로 부탁한다"),
    c("help", "self", "도움을 주겠다는 사람에게 먼저 혼자 해 보고 어려우면 받겠다고 한다"),
    c("help", "together", "도움을 주겠다는 사람이 함께 생각해 주는 것만으로 도움이 된다"),
    w("help", "ask", "도움을 받기 전에 원하는 방식을 먼저 정해 상대에게 설명한다", "필요를 말하는 모습이지만 방식을 정해 두는 모습으로도 읽힌다"),
  ] },
  { id: "s19", context: "close", options: [
    c("repair", "now", "서운한 일이 생기면 어떤 점이 서운했는지 비교적 빨리 말한다"),
    c("repair", "sort", "서운한 일이 생기면 왜 그런 일이 생겼는지 먼저 생각한다"),
    c("repair", "later", "서운한 일이 생기면 지나간 뒤 차분하게 이야기한다"),
    c("repair", "sort", "서운한 일이 생기면 반복될 문제인지 판단하고 이야기한다"),
  ] },
  { id: "s20", context: "close", options: [
    c("confirm", "wait", "상대가 혼자 있고 싶어 하면 그동안 내 일이나 취미를 한다"),
    w("confirm", "ask", "상대가 혼자 있고 싶어 하면 얼마나 시간이 필요한지 대략 맞춘다", "필요한 시간을 맞춰 본다는 뜻이라 직접 묻는지는 문장에 없다"),
    c("confirm", "ask", "상대가 혼자 있고 싶어 하면 상황을 이해하려고 짧게 물어본다"),
    n("상대가 혼자 있고 싶어 하면 다음에 함께할 시간을 정해 둔다", "다음 약속으로 마음을 놓는 방식이라 직접 묻기 · 시간 두기 · 내 쪽 살피기 어디에도 넣기 어렵다"),
  ] },
  { id: "s21", context: "close", note: "도움 받는 방식은 s18 · s21 둘뿐이라 읽지 않는다. 선물 장면의 1 · 3번은 어느 구분도 읽지 않는다.", options: [
    n("취향에 안 맞는 선물이어도 마음이 고마워 기쁘게 받는다", "마음을 받는 모습이라 도움 받는 방식의 어느 쪽도 아니다"),
    w("help", "ask", "취향에 안 맞는 선물에는 고마움을 말하고 다음엔 취향도 알려 준다", "필요를 말하는 모습이지만 도움을 받는 장면이 아니라 선물 장면이다"),
    n("취향에 안 맞는 선물이면 왜 그걸 골랐는지 궁금해한다", "궁금해하는 모습이라 어느 구분의 어느 쪽도 아니다"),
    w("help", "together", "취향에 안 맞는 선물이면 같이 활용할 방법을 생각한다", "함께 쓰는 쪽이지만 도움을 받는 방식인지는 문장만으로 정하기 어렵다"),
  ] },
  { id: "s22", context: "social", note: "4개 선택지가 의견 차이를 조율하는 기준(비교 · 번갈아 맞춤 · 둘 다)이라 판단 기준으로 읽는다.", options: [
    w("basis", "people", "가고 싶은 곳이 다르면 시간을 나눠 둘 다 가 본다", "두 사람 모두를 챙기는 모습이지만 시간 배분 방식으로도 읽힌다"),
    n("가고 싶은 곳이 다르면 각자 잠깐 다녀온 뒤 다시 만난다", "따로 움직이는 방식이라 근거 · 사람 어느 쪽인지 정하기 어렵다"),
    c("basis", "logic", "가고 싶은 곳이 다르면 이동 거리와 만족도를 비교해서 정한다"),
    w("basis", "people", "가고 싶은 곳이 다르면 이번엔 한쪽에 맞추고 다음 선택을 바꾼다", "관계의 균형을 보는 모습이지만 번갈아 정하는 규칙에 가깝게도 읽힌다"),
  ] },
  { id: "s23", context: "work", options: [
    c("basis", "logic", "모두 좋아하는 계획이 걱정되면 예상되는 위험을 구체적으로 설명한다"),
    n("모두 좋아하는 계획이 걱정되면 먼저 작은 규모로 해 보자고 한다", "작게 시도하는 제안이라 판단 기준의 어느 쪽도 아니다"),
    w("basis", "people", "모두 좋아하는 계획이 걱정되면 다수의 선택을 존중하되 대비책을 마련한다", "다수를 존중하는 모습이지만 위험을 따져 대비하는 모습도 함께 있다"),
    w("basis", "logic", "모두 좋아하는 계획이 걱정되면 다른 대안도 함께 비교하자고 한다", "비교를 제안하는 모습이지만 근거를 따지는 것인지 의견을 모으는 것인지 문장만으로 정하기 어렵다"),
  ] },
  { id: "s24", context: "close", options: [
    w("repair", "now", "오해를 받으면 내 의도와 당시 상황을 설명한다", "바로 설명하는 모습이지만 자기 입장을 말하는 것이라 풀려는 행동과는 조금 다르다"),
    w("repair", "sort", "오해를 받으면 어떤 부분에서 그렇게 느꼈는지 먼저 묻는다", "먼저 묻는 모습이지만 바로 푸는 모습으로도 읽힌다"),
    c("repair", "now", "오해를 받으면 오해를 풀 수 있는 행동부터 한다"),
    c("repair", "later", "오해를 받으면 서로 진정된 뒤 이야기할 시간을 잡는다"),
  ] },
  { id: "s25", context: "solo", options: [
    c("structure", "planned", "하고 싶은 일과 해야 하는 일이 겹치면 중요한 일을 끝낸 뒤 하고 싶은 것을 한다"),
    n("하고 싶은 일과 해야 하는 일이 겹치면 두 일을 조금씩 나눠 진행한다", "나누는 방식이라 미리 정하는지 열어 두는지 문장만으로 정하기 어렵다"),
    w("structure", "open", "하고 싶은 일과 해야 하는 일이 겹치면 기한이나 조건을 조정할 방법을 찾는다", "열어 두고 맞추는 모습이지만 미리 협상하는 모습으로도 읽힌다"),
    w("structure", "open", "하고 싶은 일과 해야 하는 일이 겹치면 지금 놓치면 아쉬운 쪽이 무엇인지 판단한다", "그때그때 판단하는 모습이지만 기준을 정해 두고 고르는 모습으로도 읽힌다"),
  ] },
  { id: "s26", context: "social", note: "네 선택지가 모두 대화를 이어 가는 방식의 차이(경험 나눔 · 질문 · 정보 · 다음 약속)라 함께 · 혼자를 가르지 못한다. 1번만 약하게 읽는다.", options: [
    w("energy", "with", "공통 관심사를 만나면 관련 경험을 신나게 나눈다", "신나게 나누는 모습이지만 다른 선택지와 같은 줄에 놓기 어렵다"),
    n("공통 관심사를 만나면 상대가 어떤 점에 관심 있는지 더 묻는다", NO_DIST),
    n("공통 관심사를 만나면 추천할 정보나 콘텐츠를 알려 준다", NO_DIST),
    n("공통 관심사를 만나면 다음에 함께할 기회가 있을지 생각한다", NO_DIST),
  ] },
  { id: "s27", context: "solo", note: "계획이 재미없어졌을 때 이어 가는지 바꾸는지를 보는 장면이다. 3개가 이어 가는 쪽이라 한쪽에 쏠린 장면이다.", options: [
    w("explore", "settled", "재미없어진 계획은 처음 목표를 떠올리고 계속할지 판단한다", "목표를 지키는 모습이지만 따져 본 뒤 정하는 모습으로도 읽힌다"),
    w("explore", "venture", "재미없어진 계획은 진행 방식을 바꿔 본다", "새 방식을 시도하는 모습이지만 계획은 이어 가는 모습으로도 읽힌다"),
    c("first", "pause", "재미없어진 계획은 잠시 쉬고 다시 의욕이 생기는지 본다"),
    c("explore", "venture", "재미없어진 계획은 다른 관심사로 넘어가는 것도 고려한다"),
  ] },
  { id: "s28", context: "social", note: "정보가 부족한 약속을 정하는 방식이라 구조로 읽는다.", options: [
    w("structure", "planned", "정보가 부족한 약속은 먼저 날짜를 잡고 세부 사항을 맞춘다", "먼저 정하는 모습이지만 세부를 열어 두는 모습으로도 읽힌다"),
    c("structure", "open", "정보가 부족한 약속은 필요한 정보가 모일 때까지 결정을 미룬다"),
    w("structure", "planned", "정보가 부족한 약속은 선택지 몇 개를 정해 함께 비교한다", "틀을 정해 두는 모습이지만 함께 정하는 모습으로도 읽힌다"),
    c("structure", "open", "정보가 부족한 약속은 바꿀 수 있는 조건을 정한 뒤 임시로 결정한다"),
  ] },
];

const SCENE_BY_ID = new Map(SCENE_READINGS.map((s) => [s.id, s]));
export const sceneReadingOf = (id: string): SceneReading | undefined => SCENE_BY_ID.get(id);
export const SCENE_IDS = SCENE_READINGS.map((s) => s.id);
export const itemOf = (id: string): SituationalItem | undefined => SITUATIONAL_V2_ITEMS.find((i) => i.id === id);

/** 구분마다 읽을 수 있는 장면(그 구분으로 읽히는 선택지가 하나라도 있는 장면) */
export function scenesOf(d: DistinctionId): SceneReading[] {
  return SCENE_READINGS.filter((s) => s.options.some((o) => o.read?.d === d));
}

// ───────────── 응답 ─────────────

/** 1~4 = 고른 선택지 번호, null = 답하지 않음 */
export type Answer = 1 | 2 | 3 | 4 | null;
export type AnswerSheet = Partial<Record<string, Answer>>;

/** 저장된 응답(id → 숫자)에서 28문항 응답만 안전하게 꺼낸다 — 알 수 없는 id · 1~4가 아닌 값은 버린다 */
export function pickSceneAnswers(raw: unknown): AnswerSheet {
  const out: AnswerSheet = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const id of SCENE_IDS) {
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 4) out[id] = v as 1 | 2 | 3 | 4;
  }
  return out;
}

export function answeredCount(sheet: AnswerSheet): number {
  return SCENE_IDS.filter((id) => sheet[id] !== undefined && sheet[id] !== null).length;
}

// ───────────── 판정: 충분 · 상반 · 부족 ─────────────

export type ReadStatus = "sufficient" | "contrast" | "insufficient";
export type InsufficientCode = "design-short" | "few-read" | "weak-only" | "no-answer";

/** 읽힌 장면 하나 — 선택한 번호와 읽은 쪽(점수 없음) */
export type SceneHit = { scene: string; option: 1 | 2 | 3 | 4; side: string; clarity: Clarity; context: SceneContext };

export type DistinctionReading = {
  d: DistinctionId;
  status: ReadStatus;
  /** sufficient일 때 뚜렷한 쪽 */
  side?: string;
  /** sufficient일 때 — 같은 쪽으로 읽힌 장면이 3개 이상이면 strong, 2개면 moderate */
  strength?: "strong" | "moderate";
  /** sufficient인데 반대쪽으로 읽힌 장면이 있었으면 true("대체로") — 예외 장면이 hits에 남아 있다 */
  leaning?: boolean;
  /** 같은 쪽으로 읽힌 장면이 서로 다른 자리(일 · 사람들 · 가까운 사이 · 혼자)에 걸쳐 있는가 */
  spread?: "wide" | "narrow";
  /** insufficient일 때 이유 */
  code?: InsufficientCode;
  /** 읽을 수 있게 설계된 장면 수 · 읽힌 장면 수 */
  designed: number;
  read: number;
  counts: Record<string, number>;
  hits: SceneHit[];
};

export const INSUFFICIENT_TEXT: Record<InsufficientCode, string> = {
  "design-short": "이 구분을 읽는 장면이 3개보다 적게 설계돼 있어 어떤 답이어도 읽지 않는다",
  "few-read": "고른 답 가운데 이 구분으로 읽히는 장면이 2개보다 적어 읽지 않는다",
  "weak-only": "같은 쪽으로 읽힌 장면은 있지만 분명하게 읽히는 장면이 2개보다 적어 방향으로 쓰지 않는다",
  "no-answer": "답한 장면이 없어 읽지 않는다",
};

/**
 * 한 구분을 여러 장면의 선택으로 판정한다(점수를 더하지 않는다).
 *  1) 설계된 장면이 3개보다 적으면 부족(design-short)
 *  2) 읽힌 장면이 2개보다 적으면 부족(few-read)
 *  3) 가장 많이 읽힌 쪽이 분명하게(clear) 2개 이상이고 반대쪽 읽기(약한 읽기 포함)보다 2개 이상 앞서면 충분.
 *     반대쪽 읽기가 하나도 없으면 일관, 있으면 "대체로"(leaning)로 예외 장면을 함께 둔다. 읽힌 장면이 3개 이상이면 strong, 2개면 moderate
 *  4) 그렇지 않고 읽힌 쪽이 둘 이상이면 상반(상황별 차이) — 평균 내지 않고 둘 다 보인다
 *  5) 읽힌 쪽이 하나인데 분명한 장면이 2개보다 적으면 부족(weak-only)
 */
export function judgeDistinction(d: DistinctionId, sheet: AnswerSheet): DistinctionReading {
  const dist = DISTINCTIONS[d];
  const designed = scenesOf(d).length;
  const counts: Record<string, number> = Object.fromEntries(Object.keys(dist.sides).map((k) => [k, 0]));
  const hits: SceneHit[] = [];
  for (const scene of SCENE_READINGS) {
    const a = sheet[scene.id];
    if (a === undefined || a === null) continue;
    const read = scene.options[a - 1].read;
    if (!read || read.d !== d) continue;
    counts[read.side] += 1;
    hits.push({ scene: scene.id, option: a, side: read.side, clarity: read.clarity, context: scene.context });
  }
  const base = { d, designed, read: hits.length, counts, hits };
  const insufficient = (code: InsufficientCode): DistinctionReading => ({ ...base, status: "insufficient", code });
  if (designed < MIN_SCENES) return insufficient("design-short");
  if (hits.length < 2) return insufficient(hits.length === 0 && !Object.values(sheet).some((a) => a !== undefined && a !== null) ? "no-answer" : "few-read");
  const sides = Object.entries(counts).filter(([, k]) => k > 0).sort((x, y) => y[1] - x[1]);
  const [topSide, topCount] = sides[0];
  const other = hits.length - topCount;
  const topClear = hits.filter((h) => h.side === topSide && h.clarity === "clear").length;
  if (sides.length >= 2) {
    const tied = sides[1][1] === topCount;
    if (!tied && topClear >= MIN_CLEAR && topCount - other >= MIN_LEAD) {
      const topContexts = new Set(hits.filter((h) => h.side === topSide).map((h) => h.context));
      return { ...base, status: "sufficient", side: topSide, strength: topCount >= 3 ? "strong" : "moderate", leaning: true, spread: topContexts.size >= 2 ? "wide" : "narrow" };
    }
    return { ...base, status: "contrast" };
  }
  if (topClear < MIN_CLEAR) return insufficient("weak-only");
  const contexts = new Set(hits.map((h) => h.context));
  return { ...base, status: "sufficient", side: topSide, strength: topCount >= 3 ? "strong" : "moderate", leaning: false, spread: contexts.size >= 2 ? "wide" : "narrow" };
}

export function judgeAll(sheet: AnswerSheet): DistinctionReading[] {
  return DISTINCTION_IDS.map((d) => judgeDistinction(d, sheet));
}

// ───────────── 개인 유형 10개 연결(28문항 전용 연결표) ─────────────

export type Support = { d: DistinctionId; side: string };

/**
 * 유형마다 받쳐 주는 읽기 — 22문항 때의 행(점수)이 아니라 28문항으로 읽을 수 있는 구분의 쪽으로 새로 정했다(미유가 정한 설계 가설, 전문가 검토 전).
 * 같은 갈래의 두 모습은 같은 구분의 반대쪽으로 가능한 한 맞췄다(독립 추진형 ↔ 관계 조율형처럼). 애착에 관련된 구분(확인 · 회복 · 도움)은 쓰지 않는다.
 * 사주가 갈래를 정하고 응답이 그 안의 두 모습을 가르는 구조는 22문항 때와 같다(personal-type.ts).
 */
export const TYPE_SUPPORTS: Record<PersonalTypeId, Support[]> = {
  "careful-deep": [{ d: "first", side: "check" }, { d: "explore", side: "settled" }, { d: "basis", side: "logic" }],
  "gentle-empathic": [{ d: "first", side: "talk" }, { d: "basis", side: "people" }, { d: "energy", side: "with" }],
  "independent-driver": [{ d: "energy", side: "alone" }, { d: "basis", side: "logic" }, { d: "first", side: "act" }],
  "relation-balancer": [{ d: "energy", side: "with" }, { d: "basis", side: "people" }, { d: "first", side: "talk" }],
  "fast-doer": [{ d: "first", side: "act" }, { d: "structure", side: "planned" }, { d: "basis", side: "logic" }],
  explorer: [{ d: "explore", side: "venture" }, { d: "structure", side: "open" }, { d: "energy", side: "with" }],
  "steady-builder": [{ d: "structure", side: "planned" }, { d: "first", side: "check" }, { d: "explore", side: "settled" }],
  "flexible-adapter": [{ d: "structure", side: "open" }, { d: "first", side: "act" }, { d: "explore", side: "venture" }],
  "standard-keeper": [{ d: "basis", side: "logic" }, { d: "first", side: "check" }, { d: "structure", side: "planned" }],
  "duty-finisher": [{ d: "basis", side: "people" }, { d: "first", side: "act" }, { d: "energy", side: "with" }],
};

/** 한 유형을 받치는 읽기 — 충분으로 읽힌 구분 가운데 유형이 말하는 쪽과 같은 것 */
export function evidenceFor(type: PersonalTypeId, readings: DistinctionReading[]): DistinctionReading[] {
  const by = new Map(readings.map((r) => [r.d, r]));
  return TYPE_SUPPORTS[type].map((s) => by.get(s.d)).filter((r): r is DistinctionReading => !!r && r.status === "sufficient" && r.side === TYPE_SUPPORTS[type].find((s) => s.d === r.d)!.side);
}

/** 유형 결정에 필요한 받침 수와 앞서야 하는 폭 — 임의로 정한 값, 검증되지 않음 */
export const TYPE_MIN_EVIDENCE = 2;
export const TYPE_MIN_LEAD = 2;

export type FlavorRead28 = {
  winner: "a" | "b" | null;
  reason: "ok" | "no-data" | "unclear";
  /** 두 모습을 받치는 구분의 수(충분으로 읽힌 것) */
  evidence: { a: number; b: number };
};

/** 한 갈래 안의 두 모습 가르기 — 받침이 TYPE_MIN_EVIDENCE개 이상이고 다른 모습보다 TYPE_MIN_LEAD개 이상 앞서야 정한다. 읽힌 것이 하나도 없으면 no-data, 아니면 unclear */
export function readFlavor28(group: Group, readings: DistinctionReading[]): FlavorRead28 {
  const rule = FLAVOR_RULES[group];
  const a = evidenceFor(rule.a, readings).length;
  const b = evidenceFor(rule.b, readings).length;
  const touched = [...TYPE_SUPPORTS[rule.a], ...TYPE_SUPPORTS[rule.b]].some((s) => readings.find((r) => r.d === s.d)?.status !== "insufficient");
  if (a >= TYPE_MIN_EVIDENCE && a - b >= TYPE_MIN_LEAD) return { winner: "a", reason: "ok", evidence: { a, b } };
  if (b >= TYPE_MIN_EVIDENCE && b - a >= TYPE_MIN_LEAD) return { winner: "b", reason: "ok", evidence: { a, b } };
  return { winner: null, reason: touched ? "unclear" : "no-data", evidence: { a, b } };
}

export type TypeLink28 =
  | { kind: "type"; id: PersonalTypeId; name: string; group: Group; /** 이름의 받침이 된 읽기 */ because: DistinctionReading[]; flavor: FlavorRead28 }
  | { kind: "mixed"; reason: "saju-balanced" | "response-missing" | "response-unclear"; name: string; /** 고객에게 보이는 이유 한 문장 */ detail: string; flavor: FlavorRead28 | null };

const NONE: FlavorRead28 = { winner: null, reason: "no-data", evidence: { a: 0, b: 0 } };

/** 읽기가 상반(상황별 차이)으로 나온 구분의 이름 — 혼합 경향의 이유 문장에 쓴다 */
function contrastNames(readings: DistinctionReading[]): string[] {
  return readings.filter((r) => r.status === "contrast" && !DISTINCTIONS[r.d].attachmentWay).map((r) => DISTINCTIONS[r.d].name);
}

/**
 * 사주에서 정해진 갈래 후보(personal-type.ts의 sajuTilt가 정한 값 — 이 파일은 사주를 계산하지 않는다)와 28문항 읽기로 개인 유형 10개 중 하나를 연결한다.
 * 읽기가 부족하거나 엇갈리면 유형을 억지로 정하지 않고 혼합 경향으로 두고 이유를 한 문장으로 남긴다. 후보가 둘 이상이면 받침이 가장 많은 하나만 고르고 둘째보다 1개 이상 앞서지 않으면 정하지 않는다.
 */
export function typeFrom28(candidates: Group[], readings: DistinctionReading[]): TypeLink28 {
  if (candidates.length === 0) return { kind: "mixed", reason: "saju-balanced", name: MIXED_TYPE.name, detail: "사주에서 큰 방향이 하나로 정해지지 않아 이름을 붙이지 않았어요.", flavor: null };
  const reads = candidates.map((group) => ({ group, flavor: readFlavor28(group, readings) }));
  const decided = reads.filter((x) => x.flavor.winner);
  if (decided.length === 0) {
    const missing = reads.every((x) => x.flavor.reason === "no-data");
    const names = contrastNames(readings);
    const detail = missing
      ? "이 이름을 가르는 장면들의 답이 한쪽으로 읽힐 만큼 모이지 않아 이름을 붙이지 않았어요."
      : names.length
        ? `${names.slice(0, 2).join(" · ")}처럼 장면마다 다르게 답한 부분이 있고, 한쪽으로 모이는 근거가 충분하지 않아 이름을 붙이지 않았어요.`
        : "읽힌 답이 한쪽으로 충분히 모이지 않아 이름을 붙이지 않았어요.";
    return { kind: "mixed", reason: missing ? "response-missing" : "response-unclear", name: MIXED_TYPE.name, detail, flavor: reads[0]?.flavor ?? NONE };
  }
  const score = (x: (typeof decided)[number]) => x.flavor.evidence[x.flavor.winner!];
  const ranked = [...decided].sort((x, y) => score(y) - score(x));
  const best = ranked[0];
  const second = ranked[1];
  if (second && score(second) >= score(best)) return { kind: "mixed", reason: "response-unclear", name: MIXED_TYPE.name, detail: "사주에서 읽힌 방향이 둘 이상이고, 답이 그중 한쪽을 더 받쳐 주지 않아 이름을 붙이지 않았어요.", flavor: best.flavor };
  const rule = FLAVOR_RULES[best.group];
  const id = best.flavor.winner === "a" ? rule.a : rule.b;
  return { kind: "type", id, name: PERSONAL_TYPES[id].name, group: best.group, because: evidenceFor(id, readings), flavor: best.flavor };
}

/** 유형마다 28문항으로 읽을 수 있는 받침이 몇 개 구분에 걸쳐 있는지 — 읽을 수 없는 구분이 끼어 있으면 그만큼 도달 가능성이 줄어든다(시험 · 문서용) */
export function typeCoverage(): { id: PersonalTypeId; name: string; group: Group; supports: { d: DistinctionId; side: string; designed: number; clearScenes: number }[]; reachable: boolean }[] {
  const out: ReturnType<typeof typeCoverage> = [];
  for (const group of Object.keys(FLAVOR_RULES) as Group[]) {
    const rule = FLAVOR_RULES[group];
    for (const id of [rule.a, rule.b]) {
      const supports = TYPE_SUPPORTS[id].map((s) => ({ ...s, designed: scenesOf(s.d).length, clearScenes: SCENE_READINGS.filter((sc) => sc.options.some((o) => o.read?.d === s.d && o.read.side === s.side && o.read.clarity === "clear")).length }));
      out.push({ id, name: PERSONAL_TYPES[id].name, group, supports, reachable: supports.filter((s) => s.designed >= MIN_SCENES && s.clearScenes >= MIN_CLEAR).length >= TYPE_MIN_EVIDENCE });
    }
  }
  return out;
}

// ───────────── 저장하는 읽기 결과 ─────────────

/**
 * 요약(FreeSummary.situational)에 저장하는 읽기 결과 — 점수 없이 구분마다의 판정과 읽힌 장면(선택한 번호 · 읽은 쪽)만 담는다.
 * 응답 원본(assessments.answers)은 따로 저장되고, 이 값은 같은 응답에서 늘 같게 다시 계산된다(readSituational).
 */
export type SituationalSummary = {
  version: string;
  readingVersion: string;
  /** 답한 장면 수(28이 정상) */
  answered: number;
  readings: DistinctionReading[];
};

export function readSituational(sheet: AnswerSheet): SituationalSummary {
  return { version: SITUATIONAL_CONTENT_VERSION, readingVersion: SITUATIONAL_READING_VERSION, answered: answeredCount(sheet), readings: judgeAll(sheet) };
}

/** 저장된 요약에서 꺼낸 값이 읽을 수 있는 모양인가 — 아니면 읽지 않는다(없는 결과를 지어내지 않는다) */
export function isSituationalSummary(v: unknown): v is SituationalSummary {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<SituationalSummary>;
  return typeof s.version === "string" && typeof s.answered === "number" && Array.isArray(s.readings) && s.readings.every((r) => r && typeof r === "object" && (DISTINCTION_IDS as string[]).includes(r.d) && typeof r.status === "string");
}
