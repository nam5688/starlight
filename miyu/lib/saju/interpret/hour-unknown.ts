// 출생 시각을 모를 때의 근거 — 시주 없이 연주 · 월주 · 일주 세 기둥(여섯 글자)으로 읽는다(운영자 2026-10-17: "출생시간이 없어도 읽을 내용이 충분한 심층 리포트를 주되, 시주가 있어야 아는 것은 확정하지 않는다").
// 순수 계산이다(AI를 쓰지 않는다). 만세력 엔진이 시주를 비워 계산한 결과(SajuOk.hourPillarOmitted)만 입력으로 받고, 새로운 명리 판정 규칙은 없다 — 이 모듈은 "무엇이 세 기둥 기준인가"를 기록할 뿐이다.
//
// 시주가 없을 때 달라지는 것(만세력 엔진이 센 값 · 코드로 확인): 오행 개수 8 → 6글자, 십성 분포 일곱 → 다섯 자리, 지장간 네 지지 → 세 지지, 강약 후보의 세력 요소 일곱 자리 → 다섯 자리, 개운 보완 후보(오행 개수 기준).
// 그대로 읽을 수 있는 것: 일간 · 일주 · 월령(월지) · 월주의 십성 · 배우자 자리(일지) · 년주와 월주의 육친 대응 · 대운(성별이 있을 때) · 일지끼리의 합 · 충.
// 읽지 않는 것: 시주로 읽는 풀이(자녀 자리 · 말년 · 시주에 놓이는 것) — 계산할 수 없고 계산하지 않았다.
import type { Evidence } from "../../report/evidence.ts";
import type { SajuOk } from "../engine.ts";

export const HOUR_UNKNOWN_ID = "saju.hour.unknown";

/** 근거 문장에 붙이는 기준 말 — 시각을 모르면 "세 기둥(시주 제외)", 알면 빈 문자열 */
export const hourBasis = (saju: Pick<SajuOk, "hourPillarOmitted">): string => (saju.hourPillarOmitted ? "세 기둥(시주 제외) " : "");

/** 시주가 없어 세 기둥으로 읽는가 */
export const isHourUnknown = (saju: Pick<SajuOk, "hourPillarOmitted">): boolean => saju.hourPillarOmitted;

/** 근거 목록(사주 근거)에서 시각을 모른다는 근거가 있는가 — 검사 · 지시문이 쓴다 */
export const hasHourUnknownEvidence = (evidence: Pick<Evidence, "id" | "uncertain">[]): boolean => evidence.some((e) => e.id === HOUR_UNKNOWN_ID && !e.uncertain);

/** 시주에 따라 달라질 수 있는 근거 — 시각을 모를 때 이 근거들의 "없음 · 적음 · 후보"는 세 기둥 기준이다 */
export const HOUR_DEPENDENT_BASIS = ["오행 개수", "십성 분포", "강약 후보(세력)", "개운 보완 후보"] as const;

/** 시각을 모르는 경우의 근거 하나(strong fact) — 시각을 알면 빈 목록. AI가 "무엇을 확정하면 안 되는지"를 알 수 있게 한다 */
export function hourUnknownEvidence(saju: SajuOk): Evidence[] {
  if (!saju.hourPillarOmitted) return [];
  return [
    {
      id: HOUR_UNKNOWN_ID,
      source: "saju",
      topics: ["personality"],
      strength: "strong",
      fact: `출생 시각을 몰라 시주 없이 연주 · 월주 · 일주 세 기둥(여섯 글자)으로 읽음 — 오행 개수 · 십성 개수 · "없음"은 이 세 기둥 기준이며 시주(시간 천간 · 시간 지지)에 있을 수 있는 글자는 세지 못함 / 지장간은 년지 · 월지 · 일지 세 곳만 / 시주에 따라 달라질 수 있는 근거: ${HOUR_DEPENDENT_BASIS.join(" · ")} / 그대로 읽을 수 있는 근거: 일간 · 일주 · 월령 · 월주의 십성 · 배우자 자리(일지) · 년주와 월주의 육친 대응${saju.luck ? " · 대운" : ""} / 시주로 읽는 풀이(자녀와 이어지는 자리 · 말년 · 시주에 놓이는 것)는 읽지 않음`,
      cue: "시주를 모를 때에도 연주 · 월주 · 일주만으로 일간 · 월령 · 십성 · 배우자 자리를 읽을 수 있다고 봅니다. 다만 시주가 없으면 오행 · 십성의 개수가 한 기둥 적게 세어지므로 개수가 적거나 없다는 것을 사주 전체에 없다는 뜻으로 읽지 않고, 시주에 있을 수 있는 글자는 알 수 없다고 봅니다. 시주를 알아야 읽는 풀이(자녀 · 말년 · 시주의 십성에서 나오는 결론)는 읽지 않으며, 강약과 보완 후보는 후보로만 두고 시주를 알면 달라질 수 있다고 봅니다.",
    },
  ];
}

/** 코드가 1번 장 아래에 붙이는 고정 안내(해요체) — AI가 쓰지 않는다 */
export const HOUR_UNKNOWN_CAVEAT =
  "출생 시각을 몰라 시주 없이 연주 · 월주 · 일주 세 기둥으로 읽었어요. 오행이나 십성이 \"없다\"고 한 곳은 이 세 기둥 기준이고, 시주를 알면 개수와 강약 · 개운 후보가 달라질 수 있어요.";
