// 사주 해석 근거 추출 규칙 v0 — 계산 결과(원국 · 대운 · 세운)에서 근거 목록을 만든다.
// 문장은 전통 해석을 "~로 봅니다" 수준으로 정리한 초안이며, 출시 전에 명리 전문가 검토를 받는다 (검토 전 표기).
// 확정 계산(십신 · 오행 개수 · 합충형 관계)과 학파 의존 해석(격국 · 신강약 · 신살)을 구분하고, 후자는 넣지 않는다.

import { getBranchTenGod, getTenGod } from "manseryeok";
import type { Evidence, Topic } from "../../report/evidence.ts";
import type { FiveElement, PillarKey, SajuOk } from "../engine.ts";
import { PILLAR_LABEL } from "../engine.ts";
import { iga, wagwa } from "../josa.ts";
import { yearGanji } from "../yearly.ts";
import { periodPlain, yearTitle } from "./period-plain.ts";
import { branchRelations, stemRelation, type Relation } from "./relations.ts";
import { hourBasis } from "./hour-unknown.ts";

export const SAJU_RULE_VERSION = "saju-rules-0.1-draft";

type Stem = Parameters<typeof getTenGod>[0];
type Branch = Parameters<typeof getBranchTenGod>[1];
// Group · GROUP_OF는 structure.ts에서 정의한다(structure.ts가 rules.ts를 가져오지 않게 — 순환 방지). 다른 파일은 여전히 rules.ts에서 가져다 쓴다.
import { GROUP_OF, structureEvidence, type Group } from "./structure.ts";
export { GROUP_OF };
export type { Group };

const DAY_MASTER_CUE: Record<string, string> = {
  갑: "큰 나무에 비유합니다 — 곧게 뻗으려는 성장 욕구와 자기 방향이 분명한 편으로 봅니다.",
  을: "풀 · 덩굴에 비유합니다 — 환경에 맞춰 유연하게 자리를 넓혀 가는 적응력으로 봅니다.",
  병: "태양에 비유합니다 — 드러내고 퍼뜨리는 힘, 밝고 직접적인 표현으로 봅니다.",
  정: "등불 · 촛불에 비유합니다 — 한곳을 오래 비추는 집중력과 섬세한 온기로 봅니다.",
  무: "큰 산 · 둑에 비유합니다 — 버티고 막아 주는 힘, 중심을 잡는 성향으로 봅니다.",
  기: "밭 · 평지에 비유합니다 — 기르고 정리하는 힘, 현실적인 돌봄으로 봅니다.",
  경: "쇠 · 바위에 비유합니다 — 결단과 원칙, 단단하게 밀고 나가는 힘으로 봅니다.",
  신: "보석 · 칼날에 비유합니다 — 정밀함과 기준의 예리함, 다듬어진 감각으로 봅니다.",
  임: "큰 강 · 바다에 비유합니다 — 넓게 흐르며 받아들이는 힘, 큰 그림을 보는 성향으로 봅니다.",
  계: "비 · 이슬에 비유합니다 — 조용히 스며드는 세심함과 관찰력으로 봅니다.",
};

const ELEMENT_MEANING: Record<FiveElement, string> = {
  목: "성장 · 계획 · 시작",
  화: "표현 · 열정 · 드러냄",
  토: "안정 · 중재 · 유지",
  금: "기준 · 정리 · 결단",
  수: "생각 · 유연함 · 쉼",
};

const GROUP_RULE: Record<Group, { topics: Topic[]; cue: string; timing: string }> = {
  비겁: {
    topics: ["personality", "relationship", "money"],
    cue: "나와 같은 기운(비겁)으로, 자기 기준 · 독립심 · 동료와의 경쟁과 협력이 주제가 되기 쉽다고 봅니다.",
    timing: "자기 주도 · 독립 · 경쟁과 협업이 두드러지는 시기로 봅니다.",
  },
  식상: {
    topics: ["personality", "work"],
    cue: "내가 만들어 내는 기운(식상)으로, 표현 · 재능 · 결과물을 만드는 힘으로 봅니다. 상관이 많으면 기존 틀에 대한 비판적인 시각이 강하다고 봅니다.",
    timing: "표현 · 생산 · 새로운 시도가 늘어나는 시기로 봅니다.",
  },
  재성: {
    topics: ["money", "work", "relationship"],
    cue: "내가 다스리는 기운(재성)으로, 현실 감각 · 성과 · 돈과 자원을 다루는 방식이 주제라고 봅니다.",
    timing: "현실적인 성과 · 수입 · 관리가 주제가 되는 시기로 봅니다.",
  },
  관성: {
    topics: ["work", "marriage", "relationship"],
    cue: "나를 다스리는 기운(관성)으로, 규칙 · 책임 · 평판, 조직 안에서의 역할이 주제라고 봅니다.",
    timing: "책임 · 조직 · 평판, 관계의 틀이 주제가 되는 시기로 봅니다.",
  },
  인성: {
    topics: ["personality", "work"],
    cue: "나를 돕는 기운(인성)으로, 배움 · 검토 · 보살핌의 힘으로 봅니다. 많으면 충분히 생각한 뒤 움직이는 편으로 봅니다.",
    timing: "배움 · 준비 · 도움을 받는 시기로 봅니다.",
  },
};

/** 시기 cue 끝에 붙이는 쉬운 말 설명 — 해석 키워드("성과 · 수입 · 관리")를 그대로 옮기지 않고 생활에서 뜻하는 것으로 풀어 쓰게 한다(period-plain.ts) */
function plainCue(stemGroup: Group, branchGroup: Group, unit: "period" | "year"): string {
  const p = periodPlain(stemGroup, branchGroup);
  return `(쉬운 말: ${unit === "year" ? yearTitle(p) : p.title} — ${p.meaning})`;
}

const SPOUSE_PALACE_CUE: Record<Group, string> = {
  비겁: "가까운 관계에서 동등함과 각자의 영역을 중요하게 여기는 자리로 봅니다.",
  식상: "가까운 관계에서 함께 즐기고 마음을 표현하는 것을 중요하게 여기는 자리로 봅니다.",
  재성: "가까운 관계를 현실적으로 꾸려 가려는 기대가 큰 자리로 봅니다.",
  관성: "가까운 관계에서 책임 · 신뢰 · 안정감을 중요하게 여기는 자리로 봅니다.",
  인성: "가까운 관계에서 이해받고 보살핌을 주고받는 것을 중요하게 여기는 자리로 봅니다.",
};

const PILLAR_AREA: Record<PillarKey, string> = {
  year: "어린 시절 · 바깥 환경",
  month: "사회 · 일 · 성장 환경",
  day: "나 자신 · 가까운 관계",
  hour: "앞으로의 방향 · 결과",
};

const RELATION_CUE: Record<Relation["kind"], string> = {
  천간합: "두 기운이 서로 묶이는 관계로, 해당 영역이 서로 영향을 주고받는다고 봅니다.",
  육합: "두 자리가 서로 끌어당기는 관계로, 맞춰 가려는 힘이 생긴다고 봅니다.",
  반합: "같은 기운으로 모이는 관계로, 그 오행의 힘이 커진다고 봅니다.",
  충: "서로 부딪히는 관계로, 변화 · 이동 · 긴장이 생기기 쉬운 지점으로 봅니다.",
  형: "서로 조정이 필요한 관계로, 익숙한 방식이 흔들리거나 다듬어지는 지점으로 봅니다.",
};

const ELEMENT_OF_RELATION = (r: Relation) => (r.forms ? ` (${r.forms} 기운)` : "");

function ym(d: { year: number; month: number }) {
  return `${d.year}-${String(d.month).padStart(2, "0")}`;
}

/** 대운 한 칸 — 화면의 "지금 지나는 시기" 타임라인용 (계산 결과와 위 GROUP_RULE의 주제 이름만 쓰고 새 해석을 만들지 않는다) */
export type LuckSlot = {
  role: "previous" | "current" | "next";
  /** 예: 신미(辛未) */
  label: string;
  /** 양력 연-월 (엔진이 계산한 대략적 시점) */
  from: string;
  to: string;
  /** 기준 월이 이 기간에서 지난 비율 0~1 — 현재 대운일 때만. 운세의 좋고 나쁨이 아니라 기간 안의 위치다 */
  progress?: number;
  stemGroup: Group;
  branchGroup: Group;
  /** 천간 · 지지가 읽히는 주제의 짧은 이름 (중복 없음) */
  themes: string[];
};

/** 십신 그룹의 짧은 주제 이름 — GROUP_RULE.timing 문장의 앞부분과 같은 뜻 */
export const GROUP_THEME_SHORT: Record<Group, string> = {
  비겁: "자기 주도 · 독립 · 경쟁과 협업",
  식상: "표현 · 생산 · 새로운 시도",
  재성: "성과 · 수입 · 관리",
  관성: "책임 · 조직 · 평판",
  인성: "배움 · 준비 · 도움 받기",
};

const monthIndex = (ymText: string) => {
  const [y, m] = ymText.split("-").map(Number);
  return y * 12 + (m - 1);
};

/** 기준 월이 속한 대운과 그 앞 · 뒤 대운. 성별이 없어 대운을 계산하지 않았으면 빈 배열 */
export function luckTimeline(saju: SajuOk, reference: { year: number; month: number }): LuckSlot[] {
  if (!saju.luck) return [];
  const dm = saju.dayMaster.stem as Stem;
  const periods = saju.luck.periods;
  const ref = ym(reference);
  const idx = periods.findIndex((p) => p.from <= ref && ref <= p.to);
  const slot = (i: number, role: LuckSlot["role"]): LuckSlot | null => {
    const p = periods[i];
    if (!p) return null;
    const stemGroup = GROUP_OF[getTenGod(dm, p.stem as Stem)];
    const branchGroup = GROUP_OF[getBranchTenGod(dm, p.branch as Branch)];
    const out: LuckSlot = {
      role,
      label: `${p.stem}${p.branch}(${p.stemHanja}${p.branchHanja})`,
      from: p.from,
      to: p.to,
      stemGroup,
      branchGroup,
      themes: [...new Set([GROUP_THEME_SHORT[stemGroup], GROUP_THEME_SHORT[branchGroup]])],
    };
    if (role === "current") {
      const total = monthIndex(p.to) - monthIndex(p.from) + 1;
      out.progress = Math.min(1, Math.max(0, (monthIndex(ref) - monthIndex(p.from)) / total));
    }
    return out;
  };
  if (idx >= 0) return [slot(idx - 1, "previous"), slot(idx, "current"), slot(idx + 1, "next")].filter((x): x is LuckSlot => x !== null);
  if (periods.length && ref < periods[0].from) return [slot(0, "next")].filter((x): x is LuckSlot => x !== null);
  return [slot(periods.length - 1, "previous")].filter((x): x is LuckSlot => x !== null);
}

/** 원국 · 대운 · 세운 → 근거 목록. reference는 시기 해석의 기준 날짜(한국 날짜) */
/** 배우자 자리(일지)의 십신과 그룹 — 어울리는 관계 조건 규칙이 쓴다 */
export function spousePalace(saju: SajuOk): { branch: string; tenGod: string; group: Group } {
  const dayBranch = saju.pillars.find((p) => p.key === "day")?.branch ?? "";
  const tenGod = getBranchTenGod(saju.dayMaster.stem as Stem, dayBranch as Branch);
  return { branch: dayBranch, tenGod, group: GROUP_OF[tenGod] };
}

export function sajuEvidence(saju: SajuOk, input: { reference: { year: number; month: number }; gender?: "male" | "female" | null }): Evidence[] {
  const out: Evidence[] = [];
  const dm = saju.dayMaster.stem as Stem;
  const pillars = saju.pillars;
  const uncertainPillars = new Set(saju.notes.filter((n) => n.kind === "jeolgi-day" || n.kind === "near-boundary" || n.kind === "jasi-school").flatMap((n) => n.pillars));

  // 1. 일간
  out.push({
    id: "saju.daymaster",
    source: "saju",
    topics: ["personality"],
    strength: "strong",
    fact: `일간 ${saju.dayMaster.stem}${saju.dayMaster.element}(${saju.dayMaster.stemHanja}), ${saju.dayMaster.yinYang}의 ${saju.dayMaster.element}`,
    cue: DAY_MASTER_CUE[saju.dayMaster.stem],
  });

  // 2. 오행 분포 (원국 글자 기준, 지장간 제외)
  for (const [el, n] of Object.entries(saju.elementCounts) as [FiveElement, number][]) {
    if (n >= 3) {
      out.push({
        id: `saju.element.${el}.many`,
        source: "saju",
        topics: ["personality"],
        strength: n >= 4 ? "strong" : "moderate",
        fact: saju.hourPillarOmitted ? `세 기둥(시주 제외) 글자 중 ${el} ${n}개 (지장간 제외)` : `원국 글자 중 ${el} ${n}개 (지장간 제외)`,
        cue: `${el} 기운(${ELEMENT_MEANING[el]})이 두드러지는 원국으로 봅니다.`,
      });
    } else if (n === 0) {
      out.push({
        id: `saju.element.${el}.none`,
        source: "saju",
        topics: ["personality"],
        strength: saju.hourPillarOmitted ? "weak" : "moderate",
        fact: saju.hourPillarOmitted ? `세 기둥(시주 제외) 글자에 ${iga(el)} 없음 (지장간 제외 — 시주에 있을 수 있어 원국 전체에 없다는 뜻이 아님)` : `원국 글자에 ${iga(el)} 없음 (지장간 제외)`,
        cue: `전통 해석에서는 ${el} 기운(${ELEMENT_MEANING[el]}의 주제)이 원국에 없으면 그 기운이 들어오는 시기에 그 주제가 상대적으로 크게 느껴질 수 있다고 보고, 생활에서 의식적으로 채우는 쪽을 권하는 경우가 많습니다. 없다는 것이 결함이거나 그 기능이 부족하다는 뜻은 아닙니다.${saju.hourPillarOmitted ? " 시주를 몰라 이 \"없음\"은 세 기둥 기준이라 시주에 있을 수 있는 글자는 알 수 없고, 시기에 그 주제가 크게 느껴질 수 있다는 정도로만 읽습니다." : ""}`,
      });
    }
  }

  // 3. 십신 분포 (일간 제외 7~5자리)
  const counts: Record<Group, { n: number; where: string[]; names: string[] }> = {
    비겁: { n: 0, where: [], names: [] }, 식상: { n: 0, where: [], names: [] }, 재성: { n: 0, where: [], names: [] }, 관성: { n: 0, where: [], names: [] }, 인성: { n: 0, where: [], names: [] },
  };
  for (const p of pillars) {
    for (const [part, tg] of [["천간", p.tenGod.stem], ["지지", p.tenGod.branch]] as const) {
      const g = GROUP_OF[tg];
      if (!g) continue; // 일간 자신
      counts[g].n += 1;
      counts[g].where.push(`${PILLAR_LABEL[p.key]} ${part}`);
      counts[g].names.push(tg);
    }
  }
  for (const [g, c] of Object.entries(counts) as [Group, (typeof counts)[Group]][]) {
    if (c.n >= 3) {
      out.push({
        id: `saju.tengod.${g}.many`,
        source: "saju",
        topics: GROUP_RULE[g].topics,
        strength: c.n >= 4 ? "strong" : "moderate",
        fact: `${hourBasis(saju)}${g} ${c.n}자리 (${c.names.join(" · ")} — ${c.where.join(", ")})`,
        cue: GROUP_RULE[g].cue,
      });
    } else if (c.n === 0) {
      out.push({
        id: `saju.tengod.${g}.none`,
        source: "saju",
        topics: GROUP_RULE[g].topics,
        strength: "weak",
        fact: saju.hourPillarOmitted ? `세 기둥(시주 제외) 기준 ${g}이 없음 (시주에 있을 수 있음)` : `원국에 ${g}이 없음`,
        cue: `${saju.hourPillarOmitted ? "세 기둥에 보이지 않는 기운이라" : "원국에 없는 기운이라"}, 대운 · 세운에서 ${g}을 만나는 시기에 그 주제가 상대적으로 크게 느껴질 수 있다고 봅니다.${saju.hourPillarOmitted ? " 시주를 몰라 원국 전체에 없다고 읽지 않습니다." : ""}`,
      });
    }
  }
  const has = (g: Group, n: number) => counts[g].n >= n;
  const sanggwan = counts.식상.names.filter((x) => x === "상관").length;
  if (has("인성", 2) && sanggwan >= 2) {
    out.push({
      id: "saju.combo.sanggwan-paein",
      source: "saju",
      topics: ["personality", "work"],
      strength: "moderate",
      fact: `인성 ${counts.인성.n}자리 + 상관 ${sanggwan}자리`,
      cue: "날카로운 표현력(상관)을 배움 · 검토(인성)가 다듬는 구조로 봅니다. 말과 글, 전문성을 다루는 일과 연결해 해석하는 경우가 많습니다.",
    });
  }
  if (has("식상", 2) && has("재성", 1)) {
    out.push({
      id: "saju.combo.siksang-saengjae",
      source: "saju",
      topics: ["work", "money"],
      strength: "moderate",
      fact: `식상 ${counts.식상.n}자리 + 재성 ${counts.재성.n}자리`,
      cue: "만들어 낸 결과물이 성과 · 수입으로 이어지는 흐름으로 봅니다.",
    });
  }
  if (has("재성", 2) && has("인성", 2)) {
    out.push({
      id: "saju.combo.jae-in",
      source: "saju",
      topics: ["personality", "money"],
      strength: "weak",
      fact: `재성 ${counts.재성.n}자리 + 인성 ${counts.인성.n}자리`,
      cue: "현실 판단(재성)과 배움 · 이상(인성) 사이에서 고민이 길어질 수 있다고 봅니다.",
    });
  }
  if (has("관성", 2) && has("인성", 1)) {
    out.push({
      id: "saju.combo.gwan-in",
      source: "saju",
      topics: ["work"],
      strength: "moderate",
      fact: `관성 ${counts.관성.n}자리 + 인성 ${counts.인성.n}자리`,
      cue: "책임 · 조직 안에서 배움을 통해 인정받는 흐름으로 봅니다.",
    });
  }
  if (input.gender) {
    const star: Group = input.gender === "female" ? "관성" : "재성";
    out.push({
      id: "saju.spouse-star",
      source: "saju",
      topics: ["love", "marriage"],
      strength: "weak",
      fact: `전통 해석의 배우자 별(${input.gender === "female" ? "여성 원국: 관성" : "남성 원국: 재성"}) ${hourBasis(saju)}${counts[star].n}자리`,
      cue: "전통 해석에서 배우자 · 연애와 관련해 보는 기운입니다. 개수만으로 관계의 좋고 나쁨이나 시기를 단정하지 않습니다.",
    });
  }

  // 4. 배우자 자리 (일지)
  const day = pillars.find((p) => p.key === "day")!;
  const palaceGroup = GROUP_OF[day.tenGod.branch];
  if (palaceGroup) {
    out.push({
      id: "saju.spouse-palace",
      source: "saju",
      topics: ["love", "marriage", "relationship"],
      strength: "moderate",
      fact: `배우자 자리(일지) ${day.branch}(${day.branchHanja}) — ${day.tenGod.branch}`,
      cue: SPOUSE_PALACE_CUE[palaceGroup],
    });
  }

  // 5. 원국 안의 합 · 충 · 형
  for (let i = 0; i < pillars.length; i++) {
    for (let j = i + 1; j < pillars.length; j++) {
      const a = pillars[i];
      const b = pillars[j];
      const rels = [stemRelation(a.stem, b.stem), ...branchRelations(a.branch, b.branch)].filter(Boolean) as Relation[];
      for (const r of rels) {
        const touchesDay = a.key === "day" || b.key === "day";
        out.push({
          id: `saju.relation.${a.key}-${b.key}.${r.kind}`,
          source: "saju",
          topics: touchesDay ? ["relationship", "personality"] : ["personality"],
          strength: "weak",
          fact: `${PILLAR_LABEL[a.key]}(${PILLAR_AREA[a.key]})와 ${PILLAR_LABEL[b.key]}(${PILLAR_AREA[b.key]})의 ${r.a}${r.b} ${r.kind}${ELEMENT_OF_RELATION(r)}`,
          cue: RELATION_CUE[r.kind],
          uncertain: uncertainPillars.has(a.key) || uncertainPillars.has(b.key) || undefined,
        });
      }
    }
  }

  // 6. 공망
  const voidHits = pillars.filter((p) => p.key !== "day" && saju.voidBranches.includes(p.branch));
  if (voidHits.length) {
    out.push({
      id: "saju.void",
      source: "saju",
      topics: ["personality"],
      strength: "weak",
      fact: `공망 ${saju.voidBranches.join(" · ")} — ${voidHits.map((p) => PILLAR_LABEL[p.key]).join(", ")}에 해당`,
      cue: "공망 자리는 기대만큼 채워지지 않거나 늦게 채워진다고 보는 해석이 있어, 단정하지 않고 참고로만 봅니다.",
    });
  }

  // 7. 확실하지 않은 기둥 (경계 · 학파)
  for (const n of saju.notes) {
    if (n.kind === "hour-unknown" || n.kind === "historical-clock") continue;
    out.push({
      id: `saju.uncertain.${n.kind}`,
      source: "saju",
      topics: ["personality"],
      strength: "weak",
      fact: n.message,
      cue: `${n.pillars.map((k) => PILLAR_LABEL[k]).join(" · ")} 관련 해석은 단정하지 않고, 달라질 수 있다고 안내합니다.`,
      uncertain: true,
    });
  }

  // 7-2. 원국의 구조 — 여덟 글자와 자리 · 지장간 · 월령 · 통근 · 투간 · 강약 후보 · 조후 후보 (structure.ts, 규칙은 전문가 검토 전 초안)
  out.push(...structureEvidence(saju, uncertainPillars));

  // 8. 대운 (성별이 있을 때)
  const refYm = ym(input.reference);
  const branches = pillars.map((p) => ({ key: p.key, branch: p.branch }));
  const relationsWithChart = (branch: string) =>
    branches.flatMap((b) => branchRelations(branch, b.branch).map((r) => ({ r, key: b.key })));
  if (saju.luck) {
    const idx = saju.luck.periods.findIndex((p) => p.from <= refYm && refYm <= p.to);
    const targets = idx >= 0 ? [idx, idx + 1] : saju.luck.periods.length && refYm < saju.luck.periods[0].from ? [0] : [];
    for (const [order, i] of targets.entries()) {
      const p = saju.luck.periods[i];
      if (!p) continue;
      const tgStem = getTenGod(dm, p.stem as Stem);
      const tgBranch = getBranchTenGod(dm, p.branch as Branch);
      const label = order === 0 && idx >= 0 ? "현재 대운" : "다음 대운";
      out.push({
        id: `saju.daeun.${order === 0 && idx >= 0 ? "current" : "next"}`,
        source: "saju",
        topics: ["timing", ...GROUP_RULE[GROUP_OF[tgStem]].topics],
        strength: "moderate",
        fact: `${label} ${p.stem}${p.branch}(${p.stemHanja}${p.branchHanja}) ${p.from}~${p.to} — 천간 ${tgStem}, 지지 ${tgBranch}`,
        cue: `천간이 ${GROUP_OF[tgStem]}: ${GROUP_RULE[GROUP_OF[tgStem]].timing} 지지가 ${GROUP_OF[tgBranch]}: ${GROUP_RULE[GROUP_OF[tgBranch]].timing} ${plainCue(GROUP_OF[tgStem], GROUP_OF[tgBranch], "period")}`,
        period: { from: p.from, to: p.to, label: `${label} ${p.stem}${p.branch}` },
      });
      for (const { r, key } of relationsWithChart(p.branch)) {
        out.push({
          id: `saju.daeun.${order === 0 && idx >= 0 ? "current" : "next"}.${key}.${r.kind}`,
          source: "saju",
          topics: ["timing"],
          strength: "weak",
          fact: `${label} 지지 ${wagwa(p.branch)} 원국 ${PILLAR_LABEL[key]}의 ${r.kind}${ELEMENT_OF_RELATION(r)}`,
          cue: `${RELATION_CUE[r.kind]} (${PILLAR_AREA[key]} 영역)`,
          period: { from: p.from, to: p.to, label: `${label} ${p.stem}${p.branch}` },
        });
      }
    }
  }

  // 9. 세운 — 기준 연도부터 3년
  for (let k = 0; k < 3; k++) {
    const year = input.reference.year + k;
    const g = yearGanji(year);
    const tgStem = getTenGod(dm, g.stem as Stem);
    const tgBranch = getBranchTenGod(dm, g.branch as Branch);
    const period = { from: `${year}-01`, to: `${year}-12`, label: `${year}년 ${g.stem}${g.branch}` };
    out.push({
      id: `saju.seun.${year}`,
      source: "saju",
      topics: ["timing", ...GROUP_RULE[GROUP_OF[tgStem]].topics],
      strength: "moderate",
      fact: `${year}년 세운 ${g.stem}${g.branch} — 천간 ${tgStem}, 지지 ${tgBranch}`,
      cue: `천간이 ${GROUP_OF[tgStem]}: ${GROUP_RULE[GROUP_OF[tgStem]].timing} 지지가 ${GROUP_OF[tgBranch]}: ${GROUP_RULE[GROUP_OF[tgBranch]].timing} ${plainCue(GROUP_OF[tgStem], GROUP_OF[tgBranch], "year")}`,
      period,
    });
    for (const { r, key } of relationsWithChart(g.branch)) {
      out.push({
        id: `saju.seun.${year}.${key}.${r.kind}`,
        source: "saju",
        topics: ["timing"],
        strength: "weak",
        fact: `${year}년 세운 지지 ${wagwa(g.branch)} 원국 ${PILLAR_LABEL[key]}의 ${r.kind}${ELEMENT_OF_RELATION(r)}`,
        cue: `${RELATION_CUE[r.kind]} (${PILLAR_AREA[key]} 영역)`,
        period,
      });
    }
  }

  return out;
}
