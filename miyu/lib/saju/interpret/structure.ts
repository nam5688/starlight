// 원국의 구조 분석 — 지장간 · 월령 · 계절 · 통근 · 투간 · 득령 · 강약 후보 · 조후 후보 (운영자 2026-10-16: "사주 해석의 재료를 먼저 보강").
// 이 모듈은 순수 계산이다(AI를 쓰지 않고, 만세력 엔진이 계산한 원국의 글자만 입력으로 받는다). 계산은 두 층으로 나눈다.
//  · 기본 자료(조회): 지장간 표 · 월지의 계절 · 각 글자의 자리와 십신 — 위키백과 "지장간"의 12지지 표와 대조해 같은 표를 쓴다(2026-10-16 확인, 오 · 자 · 해 · 사의 학파별 변형은 문서에 없어 확인하지 못했다).
//  · 구조 분석(규칙): 통근 · 투간 · 득령 · 강약 후보 · 조후 후보 — **전통 해석을 단순화한 초안 규칙이며 전문가 검토 전이다.**
//    강약은 점수로 환산하지 않고 어떤 요소가 어느 쪽으로 모였는지를 요소 목록으로 남기며, 요소가 한쪽으로 모이지 않으면 "갈림"으로 두고 단정하지 않는다.
// 하지 않은 것: 격국 · 용신 · 희신 · 기신 · 신살 · 일간과 월별 세부 조후표(궁통보감 계열). 이 모듈의 결과를 그런 판단의 근거로 바로 쓰지 않는다.
import { getBranchTenGod, getTenGod } from "manseryeok";
import type { Evidence } from "../../report/evidence.ts";
import type { FiveElement, PillarKey, SajuOk } from "../engine.ts";
import { PILLAR_LABEL } from "../engine.ts";

type Stem = Parameters<typeof getTenGod>[0];
type Branch = Parameters<typeof getBranchTenGod>[1];

export type Group = "비겁" | "식상" | "재성" | "관성" | "인성";

export const GROUP_OF: Record<string, Group> = {
  비견: "비겁", 겁재: "비겁", 식신: "식상", 상관: "식상", 편재: "재성", 정재: "재성", 편관: "관성", 정관: "관성", 편인: "인성", 정인: "인성",
};

/** 일간을 돕는 쪽(비겁 · 인성)과 덜어내는 쪽(식상 · 재성 · 관성) */
const SUPPORT: Group[] = ["비겁", "인성"];

export type HiddenRole = "여기" | "중기" | "정기";

const STEM_HANJA: Record<string, string> = { 갑: "甲", 을: "乙", 병: "丙", 정: "丁", 무: "戊", 기: "己", 경: "庚", 신: "辛", 임: "壬", 계: "癸" };
const STEM_ELEMENT: Record<string, FiveElement> = { 갑: "목", 을: "목", 병: "화", 정: "화", 무: "토", 기: "토", 경: "금", 신: "금", 임: "수", 계: "수" };
const BRANCH_HANJA: Record<string, string> = { 자: "子", 축: "丑", 인: "寅", 묘: "卯", 진: "辰", 사: "巳", 오: "午", 미: "未", 신: "申", 유: "酉", 술: "戌", 해: "亥" };

/**
 * 지장간 표(여기 · 중기 · 정기) — 위키백과 "지장간"(ko.wikipedia.org/wiki/지장간)의 12지지 표와 같다(2026-10-16 대조).
 * 자 · 묘 · 유는 중기가 없다. 날짜 일수(여기 며칠 · 정기 며칠)는 쓰지 않는다. 학파에 따라 일부 지지의 표기가 다른 표가 있을 수 있으나 문서에서 확인하지 못했다.
 */
const H = (stem: string, role: HiddenRole) => ({ stem, role });
export const HIDDEN_STEMS: Record<string, { stem: string; role: HiddenRole }[]> = {
  자: [H("임", "여기"), H("계", "정기")],
  축: [H("계", "여기"), H("신", "중기"), H("기", "정기")],
  인: [H("무", "여기"), H("병", "중기"), H("갑", "정기")],
  묘: [H("갑", "여기"), H("을", "정기")],
  진: [H("을", "여기"), H("계", "중기"), H("무", "정기")],
  사: [H("무", "여기"), H("경", "중기"), H("병", "정기")],
  오: [H("병", "여기"), H("기", "중기"), H("정", "정기")],
  미: [H("정", "여기"), H("을", "중기"), H("기", "정기")],
  신: [H("무", "여기"), H("임", "중기"), H("경", "정기")],
  유: [H("경", "여기"), H("신", "정기")],
  술: [H("신", "여기"), H("정", "중기"), H("무", "정기")],
  해: [H("무", "여기"), H("갑", "중기"), H("임", "정기")],
};

export type Season = "봄" | "여름" | "가을" | "겨울";
/** 월지의 계절 — 인묘진 봄 · 사오미 여름 · 신유술 가을 · 해자축 겨울 (월은 절기로 나뉜다) */
export const SEASON_OF_BRANCH: Record<string, Season> = { 인: "봄", 묘: "봄", 진: "봄", 사: "여름", 오: "여름", 미: "여름", 신: "가을", 유: "가을", 술: "가을", 해: "겨울", 자: "겨울", 축: "겨울" };

export type StemInfo = { stem: string; hanja: string; element: FiveElement; /** 일간 기준 십신 (일간 자신은 "일간") */ tenGod: string; group: Group | null };
export type HiddenInfo = StemInfo & { role: HiddenRole };
export type PillarStructure = {
  key: PillarKey;
  stem: StemInfo;
  branch: { branch: string; hanja: string; element: FiveElement; /** 지지의 본기(정기) 십신 — 엔진의 지지 십신과 같다 */ tenGod: string; group: Group; hidden: HiddenInfo[] };
};

export type RootInfo = { pillar: PillarKey; branch: string; stem: string; role: HiddenRole; sameGlyph: boolean };
export type ExposedInfo = { stem: string; role: HiddenRole; where: PillarKey[] };
export type StrengthFactor = { kind: "월령" | "뿌리" | "세력"; toward: "받는 쪽" | "덜 받는 쪽"; text: string };

export type Structure = {
  pillars: PillarStructure[];
  hourKnown: boolean;
  dayMaster: StemInfo;
  month: { branch: string; hanja: string; season: Season; jeonggi: HiddenInfo; deukRyeong: boolean };
  roots: { all: RootInfo[]; strong: RootInfo[] };
  exposed: ExposedInfo[];
  /** 돕는 자리(비겁 · 인성)와 덜어내는 자리(식상 · 재성 · 관성) — 일간 자신은 세지 않고, 지지는 정기 십신으로 센다 */
  power: { support: string[]; drain: string[] };
  strength: { factors: StrengthFactor[]; candidate: "받는 쪽" | "덜 받는 쪽" | "갈림" };
  /** 겨울과 여름만 판단한다(봄 · 가을은 계절의 한열이 치우치지 않아 null) */
  johu: { season: Season; need: FiveElement; visibleCount: number; withHiddenCount: number } | null;
};

export type ChartPillar = { key: PillarKey; stem: string; branch: string };

/** 일간이 아닌 글자의 정보 — 일간과 같은 글자가 다른 자리에 있으면 비견이다(일간 자신만 "일간") */
const stemInfo = (dm: string, stem: string): StemInfo => {
  const tenGod = getTenGod(dm as Stem, stem as Stem);
  return { stem, hanja: STEM_HANJA[stem], element: STEM_ELEMENT[stem], tenGod, group: GROUP_OF[tenGod] ?? null };
};

/** 원국의 글자(년 · 월 · 일 · (시)의 천간 · 지지)에서 구조를 계산한다. 시주를 모르면 시주 없이 계산한다 */
export function analyzeStructure(input: { dayMaster: string; pillars: ChartPillar[] }): Structure {
  const dm = input.dayMaster;
  const dmInfo: StemInfo = { stem: dm, hanja: STEM_HANJA[dm], element: STEM_ELEMENT[dm], tenGod: "일간", group: null };
  const pillars: PillarStructure[] = input.pillars.map((p) => {
    const mainGod = getBranchTenGod(dm as Stem, p.branch as Branch);
    return {
      key: p.key,
      stem: p.key === "day" ? dmInfo : stemInfo(dm, p.stem),
      branch: {
        branch: p.branch,
        hanja: BRANCH_HANJA[p.branch],
        element: STEM_ELEMENT[HIDDEN_STEMS[p.branch].find((h) => h.role === "정기")!.stem],
        tenGod: mainGod,
        group: GROUP_OF[mainGod],
        hidden: HIDDEN_STEMS[p.branch].map((h) => ({ ...stemInfo(dm, h.stem), role: h.role })),
      },
    };
  });
  const get = (key: PillarKey) => pillars.find((p) => p.key === key);
  const monthP = get("month")!;
  const jeonggi = monthP.branch.hidden.find((h) => h.role === "정기")!;
  const deukRyeong = jeonggi.group !== null && SUPPORT.includes(jeonggi.group);

  // 통근 — 일간과 같은 오행이 지지의 지장간에 있는가 (정기에 있으면 단단한 뿌리, 중기 · 여기뿐이면 약한 뿌리)
  const all: RootInfo[] = [];
  for (const p of pillars)
    for (const h of p.branch.hidden) if (h.element === dmInfo.element) all.push({ pillar: p.key, branch: p.branch.branch, stem: h.stem, role: h.role, sameGlyph: h.stem === dm });
  const strong = all.filter((r) => r.role === "정기");

  // 투간 — 월지 지장간의 글자가 천간(년 · 월 · 시, 그리고 일간)에 같은 글자로 드러났는가
  const visibleStems = pillars.map((p) => ({ key: p.key, stem: p.stem.stem }));
  const exposed: ExposedInfo[] = monthP.branch.hidden
    .map((h) => ({ stem: h.stem, role: h.role, where: visibleStems.filter((v) => v.stem === h.stem).map((v) => v.key) }))
    .filter((e) => e.where.length > 0);

  // 세력 — 천간(일간 제외)과 지지(정기 십신)가 일간을 돕는 쪽인지 덜어내는 쪽인지 센다
  const support: string[] = [];
  const drain: string[] = [];
  for (const p of pillars) {
    if (p.key !== "day") (p.stem.group && SUPPORT.includes(p.stem.group) ? support : drain).push(`${PILLAR_LABEL[p.key]} 천간 ${p.stem.stem}(${p.stem.tenGod})`);
    (SUPPORT.includes(p.branch.group) ? support : drain).push(`${PILLAR_LABEL[p.key]} 지지 ${p.branch.branch}(${p.branch.tenGod})`);
  }

  // 강약 후보 — 세 요소(월령 · 뿌리 · 세력)의 방향을 기록한다. 점수가 아니다: 한쪽 방향이 둘 이상이고 반대쪽이 없을 때만 한쪽, 아니면 갈림
  const factors: StrengthFactor[] = [
    { kind: "월령", toward: deukRyeong ? "받는 쪽" : "덜 받는 쪽", text: deukRyeong ? `월령을 얻음(월지 정기가 ${jeonggi.group})` : `월령을 얻지 못함(월지 정기가 ${jeonggi.group})` },
    { kind: "뿌리", toward: strong.length > 0 ? "받는 쪽" : "덜 받는 쪽", text: strong.length > 0 ? "일간과 같은 오행이 지지의 정기에 뿌리내림" : all.length > 0 ? "일간과 같은 오행이 중기 · 여기에만 있어 뿌리가 약함" : "일간과 같은 오행이 지지의 지장간에 없음" },
    // 세는 자리는 일곱 곳(시각을 모르면 다섯 곳)이라 홀수이므로 돕는 자리와 덜어내는 자리가 같을 수 없다
    { kind: "세력", toward: support.length > drain.length ? "받는 쪽" : "덜 받는 쪽", text: `돕는 자리 ${support.length}곳, 덜어내는 자리 ${drain.length}곳` },
  ];
  const toward = (t: StrengthFactor["toward"]) => factors.filter((f) => f.toward === t).length;
  const candidate: Structure["strength"]["candidate"] = toward("받는 쪽") >= 2 && toward("덜 받는 쪽") === 0 ? "받는 쪽" : toward("덜 받는 쪽") >= 2 && toward("받는 쪽") === 0 ? "덜 받는 쪽" : "갈림";

  // 조후 후보 — 겨울(해 · 자 · 축)에는 따뜻한 火, 여름(사 · 오 · 미)에는 식히는 水가 반갑다고 보는 가장 큰 원칙만. 일간 · 월별 세부 표는 쓰지 않는다
  const season = SEASON_OF_BRANCH[monthP.branch.branch];
  const need: FiveElement | null = season === "겨울" ? "화" : season === "여름" ? "수" : null;
  // 원국 글자 수(천간 + 지지)와 지장간까지 센 수(천간 + 지장간 전부, 지지는 정기가 대신한다)를 따로 적는다
  const stemsN = need ? pillars.filter((p) => p.stem.element === need).length : 0;
  const branchesN = need ? pillars.filter((p) => p.branch.element === need).length : 0;
  const hiddenN = need ? pillars.reduce((n, p) => n + p.branch.hidden.filter((h) => h.element === need).length, 0) : 0;
  const johu = need ? { season, need, visibleCount: stemsN + branchesN, withHiddenCount: stemsN + hiddenN } : null;

  return {
    pillars,
    hourKnown: Boolean(get("hour")),
    dayMaster: dmInfo,
    month: { branch: monthP.branch.branch, hanja: monthP.branch.hanja, season, jeonggi, deukRyeong },
    roots: { all, strong },
    exposed,
    power: { support, drain },
    strength: { factors, candidate },
    johu,
  };
}

// ───────────── 근거 목록으로 옮기기 ─────────────

const POS = (key: PillarKey) => PILLAR_LABEL[key];
const S = (s: StemInfo) => `${s.stem}(${s.hanja})`;
const ELEMENT_NAME: Record<FiveElement, string> = { 목: "목(나무)", 화: "화(불)", 토: "토(흙)", 금: "금(쇠)", 수: "수(물)" };

/**
 * 구조 분석 결과를 근거 목록(Evidence)으로 만든다. 월주가 절기 경계에 걸려 달라질 수 있으면(uncertainPillars에 month) 월지에 기대는 근거는 uncertain으로 표시해
 * 해석의 근거로 쓰지 않게 한다. 근거 ID는 saju.structure.* — 규칙 이력은 rule-meta.ts의 structure-* 항목.
 */
export function structureEvidence(saju: SajuOk, uncertainPillars: Set<PillarKey>): Evidence[] {
  const st = analyzeStructure({ dayMaster: saju.dayMaster.stem, pillars: saju.pillars.map((p) => ({ key: p.key, stem: p.stem, branch: p.branch })) });
  const monthUncertain = uncertainPillars.has("month");
  const out: Evidence[] = [];

  // 1) 원국의 여덟 글자와 자리
  const row = (p: PillarStructure) => (p.key === "day" ? `${POS(p.key)} ${p.stem.stem}${p.branch.branch}(${p.stem.hanja}${p.branch.hanja}) — 천간 일간 · 지지 ${p.branch.tenGod}` : `${POS(p.key)} ${p.stem.stem}${p.branch.branch}(${p.stem.hanja}${p.branch.hanja}) — 천간 ${p.stem.tenGod} · 지지 ${p.branch.tenGod}`);
  out.push({
    id: "saju.structure.chart",
    source: "saju",
    topics: ["personality"],
    strength: "strong",
    fact: `원국 ${st.hourKnown ? "여덟" : "여섯"} 글자와 일간 기준 십신${st.hourKnown ? "" : "(출생 시각을 몰라 시주 없음)"}: ${st.pillars.map(row).join(" / ")}${uncertainPillars.size ? ` (${[...uncertainPillars].map(POS).join(" · ")}는 절기 · 자시 경계에 걸려 달라질 수 있음)` : ""}`,
    cue: "원국 전체의 구조를 보는 기본 자료로 봅니다. 같은 십신이라도 어느 기둥의 천간인지 지지인지에 따라 읽는 방식이 달라진다고 봅니다 — 년주는 바깥 환경과 바탕, 월주는 사회와 일의 자리, 일주는 나와 가까운 관계, 시주는 앞으로의 방향으로 읽는 해석이 일반적입니다.",
  });

  // 2) 지장간
  out.push({
    id: "saju.structure.hidden",
    source: "saju",
    topics: ["personality"],
    strength: "moderate",
    fact: `지장간(지지 속에 숨은 글자, 여기 · 중기 · 정기) 일간 기준 십신${st.hourKnown ? "" : "(시지 없음 — 년지 · 월지 · 일지 속 글자만)"}: ${st.pillars.map((p) => `${POS(p.key)} 지지 ${p.branch.branch}(${p.branch.hanja}) — ${p.branch.hidden.map((h) => `${S(h)} ${h.role} ${h.tenGod}`).join(", ")}`).join(" / ")}`,
    cue: "지장간은 겉으로 드러나지 않고 지지 안에 숨어 있는 기운으로 봅니다. 정기가 그 지지의 중심 기운이고 여기 · 중기는 보조로 읽습니다. 표는 통용되는 표 하나를 썼고 학파에 따라 일부 달리 쓰는 표기가 있을 수 있습니다.",
  });

  // 3) 월령
  out.push({
    id: "saju.structure.month",
    source: "saju",
    topics: ["personality"],
    strength: "moderate",
    fact: `월령(태어난 달의 기운): 월지 ${st.month.branch}(${st.month.hanja}) ${st.month.season} — 정기 ${S(st.month.jeonggi)}는 일간 기준 ${st.month.jeonggi.tenGod}(${st.month.jeonggi.group}) → ${st.month.deukRyeong ? "월령을 얻음(득령)" : "월령을 얻지 못함(실령)"}`,
    cue: "월령은 일간이 태어난 계절의 도움을 받는지 보는 가장 기본 자료로 봅니다. 월지의 중심 기운이 나와 같은 기운(비겁)이거나 나를 돕는 기운(인성)이면 득령, 식상 · 재성 · 관성이면 실령으로 읽는 것이 일반적입니다. 득령 여부만으로 강약을 정하지 않습니다.",
    ...(monthUncertain ? { uncertain: true } : {}),
  });

  // 4) 통근 · 투간
  const rootText = st.roots.all.length
    ? st.roots.all.map((r) => `${POS(r.pillar)} 지지 ${r.branch}의 ${r.stem}(${STEM_HANJA[r.stem]}) ${r.role}${r.sameGlyph ? "(일간과 같은 글자)" : ""}`).join(", ")
    : "지지의 지장간에 같은 오행 없음";
  const whereText = (k: PillarKey) => (k === "day" ? "일간(일주 천간, 나 자신)" : `${POS(k)} 천간`);
  const exposedText = st.exposed.length ? st.exposed.map((e) => `${e.stem}(${STEM_HANJA[e.stem]}) ${e.role}가 ${e.where.map(whereText).join(" · ")}에 드러남`).join(", ") : "월지 지장간의 글자가 천간에 드러나지 않음";
  out.push({
    id: "saju.structure.roots",
    source: "saju",
    topics: ["personality"],
    strength: "moderate",
    fact: `일간 ${S(st.dayMaster)} ${ELEMENT_NAME[st.dayMaster.element]}의 뿌리(통근${st.hourKnown ? "" : ", 시지 제외"}): ${rootText}${st.roots.strong.length ? "" : st.roots.all.length ? " — 정기에는 없음" : ""} / 투간(월지 ${st.month.branch} 지장간 ${HIDDEN_STEMS[st.month.branch].map((h) => h.stem).join(" · ")}): ${exposedText}`,
    cue: "뿌리(통근)는 일간과 같은 오행이 지지의 지장간에 있는지로 보며 정기에 있으면 단단한 뿌리, 중기 · 여기에만 있으면 약한 뿌리로 읽습니다. 투간은 월지 지장간의 글자가 천간에 드러난 것으로, 숨어 있던 기운이 겉으로 쓰이는 정도로 읽습니다.",
    ...(monthUncertain ? { uncertain: true } : {}),
  });

  // 5) 강약 후보 — 요소를 기록한다
  out.push({
    id: "saju.structure.strength",
    source: "saju",
    topics: ["personality"],
    strength: st.strength.candidate === "갈림" || !st.hourKnown ? "weak" : "moderate",
    fact: `일간 강약 후보(요소 기록, 점수 아님): ${st.strength.factors.map((f, i) => `${"①②③"[i]} ${f.kind} — ${f.text}`).join(" / ")} / 돕는 자리: ${st.power.support.join(", ") || "없음"} / 덜어내는 자리: ${st.power.drain.join(", ") || "없음"} → 후보: ${st.strength.candidate === "갈림" ? "갈림(요소가 한쪽으로 모이지 않음)" : `힘을 ${st.strength.candidate}`}${st.hourKnown ? "" : " / 시주를 몰라 세력은 시주 천간 · 지지를 뺀 다섯 자리 기준이고 뿌리도 시지를 뺀 값이라 시주에 따라 달라질 수 있음 — 후보를 확정하지 않고 신강 · 신약으로 부르지 않음"}`,
    cue: "신강 · 신약이라 부르는 판단의 재료입니다. 점수로 환산하지 않고 월령 · 뿌리 · 세력 세 요소가 모인 방향으로 후보만 적었습니다 — 두 요소 이상이 한쪽이고 반대쪽이 없을 때만 한쪽으로, 아니면 갈림으로 두며 갈림이면 강약을 단정하지 않습니다. 이 후보만으로 어떤 기운이 꼭 필요하다고 정하지는 않았습니다.",
    ...(monthUncertain ? { uncertain: true } : {}),
  });

  // 6) 조후 후보 — 겨울과 여름만
  if (st.johu) {
    const need = ELEMENT_NAME[st.johu.need];
    out.push({
      id: "saju.structure.johu",
      source: "saju",
      topics: ["personality"],
      strength: st.johu.visibleCount === 0 ? "moderate" : "weak",
      fact: `조후(계절의 한열): 월지 ${st.month.branch}(${st.month.hanja}) ${st.johu.season} — ${st.johu.season === "겨울" ? "차갑고 습한 계절" : "덥고 마른 계절"}로 읽음. ${need} 기운은 ${st.hourKnown ? "원국" : "세 기둥(시주 제외)"} 글자 ${st.johu.visibleCount}개(지장간까지 ${st.johu.withHiddenCount}개)`,
      cue: `조후는 계절의 춥고 더움이 치우친 사주에서 계절에 맞는 기운으로 균형을 잡는다는 해석입니다. ${st.johu.season === "겨울" ? "겨울에는 따뜻하게 하는 화(불)" : "여름에는 식히는 수(물)"} 기운을 반긴다고 보는 것이 가장 큰 원칙이며, 일간과 달마다 달라지는 세부 기준(궁통보감 계열)은 아직 적용하지 않았습니다. 봄 · 가을은 한열이 크게 치우치지 않아 조후 후보를 만들지 않습니다.`,
      ...(monthUncertain ? { uncertain: true } : {}),
    });
  }
  return out;
}
