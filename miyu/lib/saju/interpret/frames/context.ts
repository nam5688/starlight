// 프레임이 읽는 재료 — 만세력 엔진이 계산한 원국 · 대운 · 세운 값만으로 만든다(새 명리 계산은 없다).
// 구조 분석은 structure.ts(analyzeStructure), 관계는 relations.ts(branchRelations), 세운 간지는 yearly.ts를 그대로 쓴다.
import { getBranchTenGod, getTenGod } from "manseryeok";
import type { PillarKey, SajuOk } from "../../engine.ts";
import { yearGanji } from "../../yearly.ts";
import { branchRelations } from "../relations.ts";
import { analyzeStructure, GROUP_OF, type Group } from "../structure.ts";
import { audienceOf, type FrameContext, type FramePillar, type FrameUnit } from "./types.ts";

type Stem = Parameters<typeof getTenGod>[0];
type Branch = Parameters<typeof getBranchTenGod>[1];

const GROUPS: Group[] = ["비겁", "식상", "재성", "관성", "인성"];
const zero = (): Record<Group, number> => ({ 비겁: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 });
export const KEY_LABEL: Record<string, string> = { year: "년", month: "월", day: "일", hour: "시" };
const kinds = (a: string, b: string) => branchRelations(a, b).map((r) => r.kind as string);

/** 원국에 실제로 있는 기둥(시각을 모르면 시주가 빠진다) */
export const presentKeys = (c: Pick<FrameContext, "pillars">): PillarKey[] => (["year", "month", "day", "hour"] as PillarKey[]).filter((k) => c.pillars[k]);

/** 근거 목록의 survey.<축>.<high|low> ID에서 뚜렷한 응답 축을 읽는다(그 밖의 ID는 무시) */
export function surveyAxesOf(evidence: { id: string }[]): Record<string, "high" | "low"> {
  const out: Record<string, "high" | "low"> = {};
  for (const e of evidence) {
    const m = /^survey\.([a-z]+)\.(high|low)$/.exec(e.id);
    if (m) out[m[1]] = m[2] as "high" | "low";
  }
  return out;
}

export type ContextOptions = {
  reference: { year: number; month: number };
  survey?: Record<string, "high" | "low">;
  /** 리포트 입력의 성별 — 없으면 계산 결과에 적힌 성별을 쓴다(둘 다 없으면 배우자 별을 쓰는 프레임은 발동하지 않는다) */
  gender?: "male" | "female" | null;
};

/** 계산 결과에서 프레임 재료를 만든다. 계산에 실패한 결과(성별 없음 등)는 있는 만큼만 채운다 */
export function buildFrameContext(saju: SajuOk, opts: ContextOptions): FrameContext {
  const dm = saju.dayMaster.stem;
  const st = analyzeStructure({ dayMaster: dm, pillars: saju.pillars.map((p) => ({ key: p.key, stem: p.stem, branch: p.branch })) });
  const gender = opts.gender ?? saju.gender ?? null;
  const star: Group | null = gender === "female" ? "관성" : gender === "male" ? "재성" : null;
  const visible = zero();
  const stems = zero();
  const anywhere = zero();
  const godCount: Record<string, number> = {};
  const starOnStem: string[] = [];
  const starOnBranch: string[] = [];
  const starInHidden: string[] = [];
  const pillars: FrameContext["pillars"] = {};
  for (const p of st.pillars) {
    const stemGroup = p.key === "day" ? null : (p.stem.group as Group | null);
    const fp: FramePillar = {
      key: p.key,
      stem: p.stem.stem,
      branch: p.branch.branch,
      stemGod: p.key === "day" ? null : p.stem.tenGod,
      branchGod: p.branch.tenGod,
      stemGroup,
      branchGroup: p.branch.group as Group,
      hidden: p.branch.hidden.map((h) => ({ stem: h.stem, role: h.role, god: h.tenGod, group: h.group as Group | null })),
    };
    pillars[p.key] = fp;
    if (stemGroup) {
      visible[stemGroup]++;
      stems[stemGroup]++;
      godCount[p.stem.tenGod] = (godCount[p.stem.tenGod] ?? 0) + 1;
      if (stemGroup === star) starOnStem.push(`${KEY_LABEL[p.key]}간 ${p.stem.tenGod}`);
    }
    visible[fp.branchGroup]++;
    godCount[fp.branchGod] = (godCount[fp.branchGod] ?? 0) + 1;
    if (fp.branchGroup === star) starOnBranch.push(`${KEY_LABEL[p.key]}지 ${fp.branchGod}`);
    for (const h of fp.hidden) {
      if (!h.group) continue;
      anywhere[h.group]++;
      // 지지 본기(정기)로 이미 센 자리는 "숨은 자리"에서 뺀다
      if (h.group === star && !(h.role === "정기" && fp.branchGroup === star)) starInHidden.push(`${KEY_LABEL[p.key]}지 지장간 ${h.god}(${h.role})`);
    }
  }
  for (const g of GROUPS) anywhere[g] += stems[g];

  const day = pillars.day!;
  const dayRel: FrameContext["dayRel"] = {};
  for (const k of ["year", "month", "hour"] as PillarKey[]) {
    const other = pillars[k];
    if (other) dayRel[k] = kinds(day.branch, other.branch);
  }

  const birthYear = saju.solarDate.year;
  const birthMonth = saju.solarDate.month;
  /** 그 달의 만 나이 — 생일의 일은 따지지 않으므로 "무렵"으로만 말한다(연도 차이만 쓰면 최대 한 살 크게 나온다) */
  const ageAt = (y: number, m: number) => y - birthYear - (m < birthMonth ? 1 : 0);
  const ymOf = (s: string): [number, number] => [Number(s.slice(0, 4)), Number(s.slice(5, 7))];
  const ref = opts.reference;
  const refYm = `${ref.year}-${String(ref.month).padStart(2, "0")}`;
  const unit = (kind: FrameUnit["kind"], label: string, stem: string, branch: string, from: string, to: string): FrameUnit => {
    const stemGod = getTenGod(dm as Stem, stem as Stem);
    const branchGod = getBranchTenGod(dm as Stem, branch as Branch);
    const rel: FrameUnit["rel"] = {};
    for (const k of ["year", "month", "day", "hour"] as PillarKey[]) {
      const p = pillars[k];
      if (p) rel[k] = kinds(branch, p.branch);
    }
    return {
      kind, label, stem, branch, stemGod, branchGod,
      stemGroup: (GROUP_OF[stemGod] as Group) ?? null,
      branchGroup: (GROUP_OF[branchGod] as Group) ?? null,
      ageFrom: ageAt(...ymOf(from)), ageTo: ageAt(...ymOf(to)), from, to, rel,
      position: to < refYm ? "past" : from <= refYm ? "current" : "future",
    };
  };
  const luck: FrameUnit[] = (saju.luck?.periods ?? []).map((p) => unit("luck", `${p.stem}${p.branch} 대운`, p.stem, p.branch, p.from, p.to));
  const years: FrameUnit[] = [];
  // 세운은 만 8세 무렵부터 올해 + 2년까지(근거 목록의 "올해부터 3년"과 같은 끝)
  for (let y = birthYear + 8; y <= ref.year + 2; y++) {
    const g = yearGanji(y);
    years.push(unit("year", `${y}년 ${g.stem}${g.branch}`, g.stem, g.branch, `${y}-01`, `${y}-12`));
  }

  const refAge = ageAt(ref.year, ref.month);
  const uncertain = [...new Set(saju.notes.filter((n) => n.kind === "jeolgi-day" || n.kind === "near-boundary" || n.kind === "jasi-school").flatMap((n) => n.pillars))];

  return {
    gender, star, dayMaster: dm, hourKnown: !saju.hourPillarOmitted, birthYear, birthMonth, age: refAge, audience: audienceOf(refAge), reference: ref, uncertain,
    pillars, visible, stems, anywhere, godCount, starOnStem, starOnBranch, starInHidden,
    monthGroup: st.month.jeonggi.group as Group,
    monthExposed: st.exposed.map((e) => GROUP_OF[getTenGod(dm as Stem, e.stem as Stem)] as Group).filter(Boolean),
    monthGot: st.month.deukRyeong,
    rootStrong: st.roots.strong.length > 0,
    strength: st.strength.candidate,
    dayRel, luck, years, survey: opts.survey ?? {},
  };
}
