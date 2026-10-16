// 맛보기 리포트의 AI 근거 만들기 — 실제 응답(문항 + 고른 답)을 읽을 수 있는 짧은 목록으로 바꾼다.
// 보통(3)은 어느 쪽도 아니라 담지 않고, 가장 뚜렷한 답(전혀 아니다 · 매우 그렇다)부터 한도까지만 담는다. 이름 · 생년월일은 여기에 없다.
import type { Answers, AssessmentModule } from "../../assessment/types.ts";
import type { TasteAnswer } from "./types.ts";

/** AI에 보내는 응답 개수 한도 — 입력이 길어져 비용이 커지지 않게 */
export const TASTE_ANSWERS_MAX = 16;

const AREA: Record<AssessmentModule["id"], TasteAnswer["area"]> = { mbti: "평소 행동 방식", temperament: "기질", relationship: "관계" };
const LABEL: Record<number, TasteAnswer["answer"] | null> = { 1: "전혀 아니다", 2: "아니다", 3: null, 4: "그렇다", 5: "매우 그렇다" };

export function tasteAnswersOf(answers: Answers, modules: readonly AssessmentModule[]): TasteAnswer[] {
  const picked: { a: TasteAnswer; strength: number; order: number }[] = [];
  let order = 0;
  for (const m of modules) {
    for (const item of m.items) {
      const v = answers[item.id];
      const label = typeof v === "number" ? LABEL[v] : undefined;
      order++;
      if (!label) continue;
      picked.push({ a: { area: AREA[m.id], statement: item.text, answer: label }, strength: Math.abs((v as number) - 3), order });
    }
  }
  // 뚜렷한 답부터(같으면 문항 순서), 그 안에서 한도까지 — 보낸 뒤에는 문항 순서로 다시 놓는다
  return picked
    .sort((x, y) => y.strength - x.strength || x.order - y.order)
    .slice(0, TASTE_ANSWERS_MAX)
    .sort((x, y) => x.order - y.order)
    .map((x) => x.a);
}
