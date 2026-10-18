// 읽는 사람의 연령대별 풀이 범위 검사 — story-7에서 근거 목록에 saju.frame.audience.*가 있을 때만 쓴다(운영자 2026-10-18).
//  · 만 16~18세(teen): 호감 · 연애 · 관계 경험 중심 — 결혼 · 배우자 · 자녀 같은 어른의 풀이를 쓰지 않는다
//  · 만 16세 미만(child): 또래 관계와 대인관계 성장 중심 — 위에 더해 연애 · 이성 이야기도 쓰지 않는다
// 낱말을 센 어림이다 — 범위를 지켰는지(실제 관계 경험을 사실처럼 쓰지 않았는지)는 사람이 읽는 평가가 본다.
import type { Evidence } from "../evidence.ts";

type Piece = { where: string; text: string };

export const ADULT_ONLY_WORDS = /결혼|배우자|남편|아내|신랑|신부|혼인|부부|약혼|청혼|출산|자녀|자식/;
export const ROMANCE_WORDS = /연애|애인|이성|연인|썸|짝사랑|고백|사귀|데이트|커플|호감/;

export type TextAudience = "adult" | "teen" | "child";

export function audienceOfEvidence(evidence: Evidence[]): TextAudience {
  if (evidence.some((e) => e.id === "saju.frame.audience.child")) return "child";
  if (evidence.some((e) => e.id === "saju.frame.audience.teen")) return "teen";
  return "adult";
}

export function audienceErrors(texts: Piece[], audience: TextAudience): string[] {
  if (audience === "adult") return [];
  const out: string[] = [];
  for (const { where, text } of texts) {
    const adult = ADULT_ONLY_WORDS.exec(text);
    if (adult) out.push(`${where}: 읽는 사람이 만 19세 미만이라 "${adult[0]}" 같은 어른의 관계 풀이는 쓰지 않아요 — ${audience === "teen" ? "호감 · 친밀감 · 관계에서 마음을 쓰는 방식 중심으로" : "친구 · 또래 관계와 마음을 표현하는 방식 중심으로"} 쓰세요.`);
    if (audience === "child") {
      const romance = ROMANCE_WORDS.exec(text);
      if (romance) out.push(`${where}: 읽는 사람이 만 16세 미만이라 "${romance[0]}" 같은 연애 이야기는 쓰지 않아요 — 친구 · 또래 관계와 성장기 대인관계 중심으로 쓰세요.`);
    }
  }
  return out;
}
