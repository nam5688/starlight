// 카드 → AI 근거 목록 변환(어댑터). **아직 어디에도 연결하지 않았다** — 지금 AI 근거 목록(`buildEvidence`)은 그대로이고, 이 변환은 운영자가 0원 카드 결과를 본 뒤
// 지시문 0.6과 함께 연결한다(지난 대운 · 세운을 AI에게 건네는 일이 여기서 시작된다). 연결 전에는 호출 비용 · 승인 범위 · 검사에 영향이 없다.
// 근거 ID는 saju.frame.<프레임> 또는 saju.frame.<프레임>.<시기> — 연결할 때 규칙 이력(rule-meta)에 같은 이름을 더해야 한다.
import type { Evidence, Topic } from "../../../report/evidence.ts";
import type { ReadingCard } from "./cards.ts";

const TOPICS: Record<string, Topic[]> = {
  "3": ["love", "marriage", "relationship"],
  "5": ["money", "work"],
  "6": ["timing", "personality"],
};

const idOf = (card: ReadingCard, i: number) => {
  const t = card.trace[i];
  const frame = t && t.frameId !== "-" ? t.frameId : (card.frameIds[0] ?? "universal");
  return `saju.frame.${frame}${t?.unit ? `.${t.unit.label.replace(/\s+/g, "-")}` : ""}`;
};

/** 카드의 사실 · 전통 해석 · 키워드를 근거 목록 모양으로 옮긴다. 결론 문장은 없다 — cue는 의미 범위와 앞세울 얼굴의 초점이다 */
export function cardsToEvidence(cards: ReadingCard[]): Evidence[] {
  const out: Evidence[] = [];
  for (const card of cards) {
    const n = Math.max(card.trace.length, 1);
    for (let i = 0; i < n; i++) {
      const t = card.trace[i];
      const time = [...card.past, ...card.future].find((x) => x.frameId === t?.frameId && (t?.unit ? x.window === t.unit.ages : true));
      const face = card.lead === "bright" ? card.bright : card.hard;
      out.push({
        id: idOf(card, i),
        source: "saju",
        topics: TOPICS[String(card.chapter)] ?? ["personality"],
        strength: t?.level === "moderate" ? "moderate" : "weak",
        fact: t ? t.facts.join(" / ") : card.facts.join(" / "),
        cue: `${card.tradition[i] ?? card.tradition[0] ?? "보편적인 인생 경험으로만 연결합니다(사주에서 읽은 것이 아닙니다)."} 의미 범위: ${card.meaning.join(" · ")}. 앞세울 초점: ${face.slice(0, 2).join(" · ")}.${time ? ` 시기 창: ${time.window}(${time.angles.join(" · ")}).` : ""}`,
        ...(t?.unit ? { period: { from: t.unit.from, to: t.unit.to, label: t.unit.label } } : {}),
        ...(t?.basis === "universal" ? { uncertain: true } : {}),
      });
    }
  }
  return out;
}
