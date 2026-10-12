// 무료 미리보기의 "내 이야기를 읽었다"는 문단 — 실제 응답이 뒷받침하는 문장만 모아서 만든다.
// - 문항마다 "이 응답이면 이 문장"을 정해 두고, 그 문항에 해당 방향으로 답했을 때만 문장이 들어간다 (모두에게 붙는 문장이 아니다).
// - 근거 문항이 부족하면(0개) 문단을 만들지 않는다. 화면은 일반 한 줄 요약으로 돌아간다.
// - "~할 수 있어요" 표현으로 쓰고 사건이나 성격을 단정하지 않는다. 사주 근거와 섞지 않는다 (응답만 쓴다).
// 문장은 개발용 예시 문항(dev-example)에 맞춘 초안이며, 상황형 문항으로 바뀌면 함께 바꾼다. 전문가 검토 전.

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
      { item: "r4", side: "agree", text: "가까운 사람에게도 속마음을 꺼내기까지 시간이 걸릴 수 있어요." },
      { item: "r5", side: "agree", text: "관계가 깊어질수록, 혼자 정리하는 시간이 있어야 마음이 편해질 수 있어요." },
      { item: "r6", side: "disagree", text: "힘들 때는 기대는 것보다 혼자 견디는 쪽이 더 익숙할 수 있어요." },
    ],
  },
  stability: {
    module: "temperament",
    clauses: [
      { item: "t3", side: "agree", text: "결과가 불확실한 일일수록 시작하기 전에 여러 번 따져 보는 편일 수 있어요." },
      { item: "t2", side: "agree", text: "익숙한 방식이 이미 잘 돌아가고 있으면, 굳이 바꾸지 않는 쪽이 편할 수 있어요." },
      { item: "t4", side: "disagree", text: "일단 해 보고 고치기보다, 큰 문제가 없는지 먼저 확인하고 시작하는 편일 수 있어요." },
    ],
  },
  exploration: {
    module: "temperament",
    clauses: [
      { item: "t1", side: "agree", text: "가 보지 않은 곳이나 해 보지 않은 일에 먼저 마음이 갈 수 있어요." },
      { item: "t2", side: "disagree", text: "익숙한 방식이 오래 이어지면, 슬슬 다른 방법을 찾고 싶어질 수 있어요." },
      { item: "t4", side: "agree", text: "일단 시작하고, 문제가 생기면 그때 고치는 편일 수 있어요." },
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

export const ANSWER_LABEL: Record<number, string> = { 1: "전혀 그렇지 않다", 2: "그렇지 않다", 3: "보통이다", 4: "그렇다", 5: "매우 그렇다" };
