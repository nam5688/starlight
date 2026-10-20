// 무료 미리보기의 "내 이야기를 읽었다"는 문단 — 실제 응답이 뒷받침하는 문장만 모아서 만든다.
// - 문항마다 "이 응답이면 이 문장"을 정해 두고, 그 문항에 해당 방향으로 답했을 때만 문장이 들어간다 (모두에게 붙는 문장이 아니다).
// - 근거 문항이 부족하면(0개) 문단을 만들지 않는다. 화면은 일반 한 줄 요약으로 돌아간다.
// - "~할 수 있어요" 표현으로 쓰고 사건이나 성격을 단정하지 않는다. 사주 근거와 섞지 않는다 (응답만 쓴다).
// 문장은 개발용 예시 문항(dev-example)에 맞춘 초안이며, 상황형 문항으로 바뀌면 함께 바꾼다. 전문가 검토 전.
// 고객이 읽는 글이라 고른 답을 풀어 쓰지 않고(신중하다 · 익숙한 방식이 좋다 · 확인한다 같은 응답 요약 금지), 그 답이 일상에서 어떻게 나타날 수 있는지를 생활 장면의 말로 쓴다.
// 문항이 묻지 않은 구체적 사건 · 지난 경험을 지어내지 않고(과거형 단정 없음), 문장 하나는 "~할 수 있어요."로 끝난다. 문항 · 방향 · 개수(12개)는 그대로다.

import type { TendencyId } from "../assessment/dev-rules.ts";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import type { Answers } from "../assessment/types.ts";

export const INSIGHT_RULE_VERSION = "insight-dev-0.1";

export type InsightBasis = { itemId: string; text: string; answer: number };

export type FreeInsight = {
  version: string;
  /** 무료로 보여 주는 문단 */
  text: string;
  /** 어느 검사 영역의 응답을 근거로 했는지 */
  basisModule: "relationship" | "temperament";
  /** 근거가 된 문항과 응답 — 구매한 리포트에서 "그렇게 읽은 이유"로 보여 준다 (미리보기로는 보내지 않는다) */
  basis: InsightBasis[];
};

type Clause = { item: string; side: "agree" | "disagree"; text: string };

// agree: 4~5점(그렇다), disagree: 1~2점(아니다). 역문항은 문항 문장 그대로의 응답 기준이다.
const CLAUSES: Record<TendencyId, { module: FreeInsight["basisModule"]; clauses: Clause[] }> = {
  reassurance: {
    module: "relationship",
    clauses: [
      { item: "r1", side: "agree", text: "연락이 늦다는 사실보다, 평소와 달라진 이유를 모를 때 더 신경이 쓰일 수 있어요." },
      { item: "r2", side: "agree", text: "상대도 나와 같은 마음인지 확인하고 싶어지는 순간이 있을 수 있어요." },
      { item: "r3", side: "disagree", text: "작은 오해도 마음에 오래 남아, 혼자 여러 가능성을 떠올리게 될 수 있어요." },
    ],
  },
  distance: {
    module: "relationship",
    clauses: [
      { item: "r4", side: "agree", text: "마음이 복잡할 때는 말로 꺼내기 전에 스스로 정리가 끝나야 입이 떨어지는 편일 수 있어요." },
      { item: "r5", side: "agree", text: "가까워질수록 함께 있는 시간만큼 숨 돌리는 시간도 챙겨야 관계가 편해질 수 있어요." },
      { item: "r6", side: "disagree", text: "힘들 때는 기대는 것보다 혼자 견디는 쪽이 더 익숙할 수 있어요." },
    ],
  },
  stability: {
    module: "temperament",
    clauses: [
      { item: "t3", side: "agree", text: "처음 해 보는 일이나 큰 선택 앞에서는 서둘러 정하기보다 한 번 더 살펴본 뒤에 움직이는 편이라, 실수는 줄어도 주변이 먼저 앞서가 보일 때는 마음이 조급해질 수 있어요." },
      { item: "t2", side: "agree", text: "한 번 자리 잡은 방식 안에서 마음이 편해지는 편이라, 바꿔야 할 때는 '왜 지금인지'가 납득돼야 몸이 따라 움직일 수 있어요." },
      { item: "t4", side: "disagree", text: "출발하기 전에 걸림돌이 없을지 미리 그려 보는 편이라, 시작은 느려 보여도 한 번 정한 방향은 쉽게 흔들리지 않을 수 있어요." },
    ],
  },
  exploration: {
    module: "temperament",
    clauses: [
      { item: "t1", side: "agree", text: "낯선 곳이나 새로운 일이 눈에 들어오면 이것저것 따지기 전에 마음이 먼저 그쪽으로 기울 수 있어요." },
      { item: "t2", side: "disagree", text: "같은 방식이 오래 이어지면 슬슬 다른 길을 찾아보고 싶어질 수 있어요." },
      { item: "t4", side: "agree", text: "준비가 다 끝나길 기다리기보다 먼저 움직이면서 방향을 맞춰 가는 쪽이 더 편할 수 있어요." },
    ],
  },
};

const itemText = (id: string) => ASSESSMENT_MODULES.flatMap((m) => m.items).find((i) => i.id === id)?.text ?? "";

/** 근거가 하나도 없으면 null (문단을 만들지 않는다) */
export function buildFreeInsight(answers: Answers, tendency: TendencyId): FreeInsight | null {
  const plan = CLAUSES[tendency];
  const used = plan.clauses.filter((c) => {
    const a = answers[c.item];
    if (!Number.isInteger(a)) return false;
    return c.side === "agree" ? a >= 4 : a <= 2;
  });
  if (used.length === 0) return null;
  return {
    version: INSIGHT_RULE_VERSION,
    text: used.map((c) => c.text).join(" "),
    basisModule: plan.module,
    basis: used.map((c) => ({ itemId: c.item, text: itemText(c.item), answer: answers[c.item] })),
  };
}

/**
 * 이미 저장된 결과의 무료 해석 문단을 지금의 문장으로 다시 만든다 — 저장된 요약(summary.insight.text)에는 저장 당시의 문장이 들어 있어
 * 문장을 고쳐도 예전 결과에는 예전 문장이 남는다. 같은 응답이면 같은 문단이 보이도록 화면(무료 미리보기)만 저장된 응답에서 다시 만든다.
 * 저장된 데이터는 바꾸지 않는다. 구매한 리포트는 저장된 같은 버전을 그대로 보여 주므로 이 함수를 거치지 않는다.
 * 응답이 없거나(예전 문항 구성) 영역이 맞지 않으면 저장된 요약을 그대로 돌려준다.
 */
export function withCurrentInsight<S extends { tendency: { id: TendencyId }; insight?: FreeInsight }>(summary: S, answers: Answers | null | undefined): S {
  if (!answers) return summary;
  const insight = buildFreeInsight(answers, summary.tendency.id);
  if (!insight) return summary;
  return { ...summary, insight };
}

export const ANSWER_LABEL: Record<number, string> = { 1: "전혀 그렇지 않다", 2: "그렇지 않다", 3: "보통이다", 4: "그렇다", 5: "매우 그렇다" };
