// 사주 궁합(유료)의 "실제 계산된 범위의 관계 시기" 근거 — 순수 계산, AI 미사용(운영자 확정 2026-10-17, D5: 시기는 계산 가능한 범위만).
// 두 사람 각자의 **이미 계산된** 대운(지금 지나는 10년 시기)과 세운(기준 연도의 간지)을 각자의 일간 기준 십신 그룹으로 읽어 나란히 놓는다.
// 하는 것: "지금 두 사람이 각자 어떤 주제가 중요한 시기를 지나는가"를 두 사람의 시기 주제가 겹치는지 다른지로 보여 준다.
// 하지 않는 것: 두 사람의 관계가 좋아지거나 나빠지는 해 · 달 · 인연이 깊어지는 때 · 추천 날짜 · 사건 예언 · 두 사람의 시기가 "맞물리는 해"를 새로 만드는 것(그런 계산은 하지 않았다).
//   대운은 성별을 입력했을 때만 계산돼 있다(없으면 대운 근거는 만들지 않는다 — held). 대운의 시작 · 끝은 엔진이 계산한 대략적인 시점(연-월)이다.
// 규칙은 전통 해석(십신 그룹이 읽는 주제)을 단순화한 초안이며 전문가 검토 전이다(COMPAT_TIMING_RULE_META). 시기가 관계의 결과를 정한다는 근거는 없다.
import { getBranchTenGod, getTenGod } from "manseryeok";
import type { Evidence } from "../../report/evidence.ts";
import type { PillarKey, SajuOk } from "../engine.ts";
import { yearGanji } from "../yearly.ts";
import { periodPlain, yearTitle } from "./period-plain.ts";
import { GROUP_THEME_SHORT, luckTimeline } from "./rules.ts";
import { GROUP_OF, type Group } from "./structure.ts";

export const COMPAT_TIMING_VERSION = "compat-timing-0.1-draft";

type Stem = Parameters<typeof getTenGod>[0];
type Branch = Parameters<typeof getBranchTenGod>[1];

export type CompatTimingResult = {
  evidence: Evidence[];
  /** 만들지 못한 근거와 이유 — luck: 성별을 입력하지 않았거나 기준 시점이 대운 범위 밖 / (year는 항상 만든다) */
  held: { id: "luck"; reason: "no-luck" }[];
};

const NAMES = { a: "A님", b: "B님" } as const;

const uncertainDay = (s: SajuOk): boolean => s.notes.some((n) => (n.kind === "jeolgi-day" || n.kind === "near-boundary" || n.kind === "jasi-school") && n.pillars.includes("day" as PillarKey));

const overlapText = (ga: Group[], gb: Group[]): string => {
  const shared = ga.filter((g) => gb.includes(g));
  return shared.length ? `두 시기가 모두 "${[...new Set(shared)].map((g) => GROUP_THEME_SHORT[g]).join(" · ")}" 주제를 포함해요(겹치는 주제)` : "두 시기의 주제가 서로 달라요(겹치는 주제 없음)";
};

const LIMIT_CUE = "두 사람 각자의 대운 · 세운 계산 결과를 일간 기준으로 읽어 나란히 놓은 것이며, 관계가 좋아지거나 나빠지는 때를 말하지 않습니다. 사건 예측 · 추천 날짜가 아니고 이 시기 때문에 어떤 일이 생긴다는 근거도 없습니다.";

export function compatTimingOf(sa: SajuOk, sb: SajuOk, reference: { year: number; month: number }): CompatTimingResult {
  const evidence: Evidence[] = [];
  const held: CompatTimingResult["held"] = [];
  const uncertain = uncertainDay(sa) || uncertainDay(sb);
  const people = { a: sa, b: sb };

  // 1) 지금 지나는 10년 시기(대운) — 두 사람 모두 계산돼 있을 때만
  const slots = (["a", "b"] as const).map((k) => luckTimeline(people[k], reference).find((s) => s.role === "current") ?? null);
  if (slots[0] && slots[1]) {
    const [x, y] = slots;
    const px = periodPlain(x.stemGroup, x.branchGroup);
    const py = periodPlain(y.stemGroup, y.branchGroup);
    evidence.push({
      id: "compat.timing.luck",
      source: "saju",
      topics: ["timing", "relationship"],
      strength: "weak",
      fact: `지금(${reference.year}-${String(reference.month).padStart(2, "0")}) 각자 지나는 10년 시기(대운, 엔진이 계산한 대략적인 시점) — ${NAMES.a}: ${x.from}~${x.to}, "${px.title}" / ${NAMES.b}: ${y.from}~${y.to}, "${py.title}" → ${overlapText([x.stemGroup, x.branchGroup], [y.stemGroup, y.branchGroup])}`,
      cue: `두 사람이 지금 각자 중요하게 다루는 주제를 나란히 놓은 것입니다. 겹치는 주제가 있으면 같은 이야기를 함께 하기 쉽다고, 다르면 서로 신경 쓰는 주제가 다를 수 있어 서로의 주제를 물어봐 주는 것이 도움이 된다고 읽습니다. (쉬운 말: ${NAMES.a} — ${px.meaning} ${NAMES.b} — ${py.meaning}) ${LIMIT_CUE}`,
      period: { from: x.from < y.from ? x.from : y.from, to: x.to > y.to ? x.to : y.to, label: "두 사람의 현재 대운" },
      ...(uncertain ? { uncertain: true } : {}),
    });
  } else {
    held.push({ id: "luck", reason: "no-luck" });
  }

  // 2) 기준 연도의 세운 — 일간 기준 십신 그룹이 사람마다 다르다(성별 입력과 무관)
  const g = yearGanji(reference.year);
  const per = (k: "a" | "b") => {
    const dm = people[k].dayMaster.stem as Stem;
    const tgStem = getTenGod(dm, g.stem as Stem);
    const tgBranch = getBranchTenGod(dm, g.branch as Branch);
    const sg = GROUP_OF[tgStem];
    const bg = GROUP_OF[tgBranch];
    return { sg, bg, plain: periodPlain(sg, bg), tgStem, tgBranch };
  };
  const ya = per("a");
  const yb = per("b");
  evidence.push({
    id: "compat.timing.year",
    source: "saju",
    topics: ["timing", "relationship"],
    strength: "weak",
    fact: `${reference.year}년 세운 ${g.stem}${g.branch}를 각자의 일간으로 읽으면 — ${NAMES.a}: "${yearTitle(ya.plain)}" / ${NAMES.b}: "${yearTitle(yb.plain)}" → ${overlapText([ya.sg, ya.bg], [yb.sg, yb.bg])}`,
    cue: `같은 해의 기운이라도 일간이 다르면 읽는 주제가 달라진다고 봅니다. 겹치는 주제가 있으면 올해 같은 이야기를 함께 하기 쉽다고, 다르면 서로 신경 쓰는 일이 다를 수 있다고 읽습니다. (쉬운 말: ${NAMES.a} — ${ya.plain.meaning} ${NAMES.b} — ${yb.plain.meaning}) ${LIMIT_CUE}`,
    period: { from: `${reference.year}-01`, to: `${reference.year}-12`, label: `${reference.year}년 ${g.stem}${g.branch}` },
    ...(uncertain ? { uncertain: true } : {}),
  });
  return { evidence, held };
}
