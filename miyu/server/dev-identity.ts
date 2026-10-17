// 개발용 — 개인 유형명 · 럭키 지수 확인 화면의 가상 인물. 공개 배포에서는 쓰지 않는다(화면이 production에서 notFound).
// 생년월일은 가상이고, 응답 점수는 유형이 갈라지는 모양을 보려고 직접 정한 값이다(실제 사람의 응답이 아니다). 아무것도 저장하지 않는다.
import { calculateSaju } from "@/lib/saju/manseryeok-engine";
import { buildIdentity, type IdentityView } from "@/lib/report/identity";
import type { FreeSummary } from "@/lib/report/types";

type Birth = [year: number, month: number, day: number, time: string | null];
type Row = { id: string; label: string; note: string; birth: Birth; scores: Partial<Record<string, number>> };

const ROWS: Row[] = [
  { id: "T1", label: "신중 · 논리 쪽 응답", note: "신중함 높음 · 판단 기준 낮음(논리 먼저)", birth: [1996, 3, 29, "09:30"], scores: { caution: 90, tf: 10, persistence: 70 } },
  { id: "T2", label: "민감 · 관계 쪽 응답", note: "민감함 높음 · 판단 기준 높음(관계 먼저)", birth: [1996, 3, 29, "09:30"], scores: { sensitivity: 90, tf: 90 } },
  { id: "T3", label: "독립 · 혼자 쪽 응답", note: "회피 높음 · 혼자 정리하며 채움", birth: [1990, 5, 17, "09:30"], scores: { avoidance: 90, ei: 90, persistence: 85, sn: 15 } },
  { id: "T4", label: "함께 · 가까움 쪽 응답", note: "회피 낮음 · 함께하며 채움", birth: [1990, 5, 17, "09:30"], scores: { avoidance: 10, ei: 10, novelty: 80, sn: 90 } },
  { id: "T5", label: "응답이 가운데인 사람", note: "뚜렷한 응답이 없어 이름을 붙이지 않는 모양(혼합 경향)", birth: [2001, 1, 9, "09:30"], scores: {} },
  { id: "T6", label: "출생 시각을 모르는 사람", note: "시주 없이 계산한다는 안내가 붙는 모양", birth: [1988, 8, 8, null], scores: { caution: 85, jp: 15, novelty: 20 } },
];

const summaryOf = (scores: Row["scores"]): Pick<FreeSummary, "temperament" | "relationship" | "mbti"> => {
  const row = (id: string) => ({ id, label: id, score: scores[id] ?? 50, lowMeaning: "", highMeaning: "" });
  const axis = (id: string) => ({ ...row(id), lowName: "", highName: "" });
  return { temperament: ["novelty", "caution", "sensitivity", "persistence"].map(row), relationship: ["anxiety", "avoidance"].map(row), mbti: { axes: ["ei", "sn", "tf", "jp"].map(axis) } };
};

export function devIdentityRows(): { id: string; label: string; note: string; identity: IdentityView | null }[] {
  return ROWS.map((r) => {
    const [year, month, day, birthTime] = r.birth;
    const saju = calculateSaju({ year, month, day, calendar: "solar", isLeapMonth: false, birthTime, gender: "female" });
    return { id: r.id, label: r.label, note: r.note, identity: buildIdentity({ saju, summary: summaryOf(r.scores) }) };
  });
}
