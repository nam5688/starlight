// 맛보기 리포트 아래의 "여기서부터는 심층 리포트에서" 목록 — 운영자가 정한 유료 핵심(실제 연애의 진행 · 어울리는 사람 · 연애운이 강해지는 시기)과 나머지 잠긴 풀이를
// 무료 미리보기가 이미 약속하는 질문(preview.answers)에서 골라 보여 준다. 구매한 리포트가 실제로 답하는 질문만 쓰고(preview.test.ts가 확인), 답이 없는 질문은 약속하지 않는다.
import type { FreePreview } from "../preview.ts";
import { PARTNER_HOOKS } from "../reading/talk-code.ts";

export type TasteLockedItem = { title: string; question: string };

export function tasteLockedItems(preview: FreePreview): TasteLockedItem[] {
  const answer = (id: string) => preview.answers.find((a) => a.id === id)?.question ?? null;
  const hasPartner = preview.answers.some((a) => a.id === "partner");
  const rows: { title: string; question: string | null }[] = [
    { title: "실제 연애는 어떻게 흘러갈까?", question: answer("repeat") },
    { title: "나에게 어울리는 사람은?", question: answer("partner") },
    { title: "연애운이 강해지는 시기는?", question: hasPartner ? PARTNER_HOOKS[0] : null },
    { title: "지칠 때 어떻게 풀까?", question: answer("stress") },
    { title: "일 · 돈은 어떻게 흘러갈까?", question: answer("work") },
    { title: "오늘부터 해 볼 수 있는 일은?", question: answer("actions") },
  ];
  return rows.filter((r): r is TasteLockedItem => Boolean(r.question));
}
