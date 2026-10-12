// 계산 결과를 화면용 형태로 바꾼다 (표시 전용 — 해석 문장은 만들지 않는다)

import type { SajuSection } from "../report/types.ts";
import { FIVE_ELEMENTS, PILLAR_LABEL, type SajuResult } from "./engine.ts";
import { describePolicy } from "./policy.ts";

/** 리포트의 원국 표 (전통 표기 순서: 시 · 일 · 월 · 년) */
export function sajuSection(r: SajuResult): SajuSection {
  if (r.status !== "ok") return { status: "not-connected" };
  const byKey = Object.fromEntries(r.pillars.map((p) => [p.key, p]));
  const order = ["hour", "day", "month", "year"] as const;
  return {
    status: "computed",
    pillars: order.map((k) =>
      byKey[k]
        ? { position: PILLAR_LABEL[k] as "년주", stem: byKey[k].stemHanja, branch: byKey[k].branchHanja }
        : { position: PILLAR_LABEL[k] as "시주", stem: "", branch: "", unknown: true },
    ),
    dayMaster: `${r.dayMaster.stem}${r.dayMaster.element}(${r.dayMaster.stemHanja})`,
    elements: FIVE_ELEMENTS.map((name) => ({ name, count: r.elementCounts[name] })),
    notes: r.notes.map((n) => n.message),
    basis: [`만세력 엔진 ${r.engine.name} ${r.engine.version}`, ...describePolicy(r.options)],
  };
}

/** 무료 요약의 "분석에 사용한 정보"용 한 줄 (예: 년주 을해 · 월주 경진 · 일주 계유 · 시주 모름) */
export function pillarsLine(r: SajuResult): string | null {
  if (r.status !== "ok") return null;
  const keys = ["year", "month", "day", "hour"] as const;
  return keys
    .map((k) => {
      const p = r.pillars.find((x) => x.key === k);
      return `${PILLAR_LABEL[k]} ${p ? `${p.stem}${p.branch}` : "모름"}`;
    })
    .join(" · ");
}
