// 상황형 28문항 결과의 개인 유형 — 사주가 갈래 후보를 정하고(personal-type.ts의 sajuTilt, 22문항 때와 같다) 28문항 읽기가 그 안의 두 모습을 가른다.
// 유형 이름 10개는 그대로이고, 이름을 정하는 근거만 28문항 전용 연결표(reading.ts의 TYPE_SUPPORTS)로 바꿨다. 근거가 부족하거나 엇갈리면 이름을 붙이지 않고 이유와 함께 "혼합 경향"으로 둔다.
// 순수 계산이다. 어떤 응답도 기본값으로 쓰지 않는다.
import type { SajuOk } from "../../saju/engine.ts";
import { PERSONAL_TYPES, sajuTilt, type PersonalType } from "../personal-type.ts";
import { SIDE_COPY } from "./copy.ts";
import { typeFrom28, type DistinctionReading, type SituationalSummary } from "./reading.ts";

/** 이름의 받침이 된 읽기를 고객 말로 — 이름을 강제로 붙이지 않았다는 근거 한 문장 */
function becauseText(because: DistinctionReading[]): string {
  const labels = because.map((r) => SIDE_COPY[r.d]?.[r.side ?? ""]?.strengthLabel).filter((x): x is string => !!x);
  if (labels.length === 0) return "여러 장면의 답이 같은 쪽으로 겹쳐 읽혀서 붙인 이름이에요.";
  const shown = labels.slice(0, 2).map((l) => `‘${l}’`).join("과 ");
  return `${shown} 모습이 서로 다른 장면에서 겹쳐 읽혀서 붙인 이름이에요.`;
}

/** 28문항 읽기 결과 + 사주 → 개인 유형. PersonalType의 모양을 그대로 따른다(why = 근거 한 문장) */
export function personalTypeFromSituational(saju: SajuOk, sit: SituationalSummary): PersonalType {
  const tilt = sajuTilt(saju);
  if (tilt.candidates.length === 0) {
    return { kind: "mixed", tilt, flavor: null, reason: tilt.reason === "month-uncertain" ? "month-uncertain" : "saju-balanced", why: tilt.reason === "month-uncertain" ? "태어난 달의 경계가 걸려 있어 사주에서 큰 방향을 하나로 정하지 않았어요." : "사주에서 큰 방향이 하나로 정해지지 않아 이름을 붙이지 않았어요." };
  }
  const link = typeFrom28(tilt.candidates, sit.readings);
  const flavor = { a: null, b: null, diff: null, winner: link.kind === "type" ? link.flavor.winner : null, reason: link.kind === "type" ? ("ok" as const) : link.flavor?.reason === "no-data" ? ("no-data" as const) : ("unclear" as const) };
  if (link.kind === "type") return { kind: "type", info: PERSONAL_TYPES[link.id], tilt, flavor, why: becauseText(link.because) };
  return { kind: "mixed", tilt, flavor, reason: link.reason === "saju-balanced" ? "saju-balanced" : link.reason, why: link.detail };
}
