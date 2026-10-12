// 천간 · 지지 관계표 (계산으로 확정되는 관계만). 해석 강도는 rules.ts에서 정한다.
// 1차 범위: 천간합, 지지 육합 · 삼합(왕지를 포함한 반합) · 충 · 형. 방합 · 파 · 해 · 천간충은 학파 차이가 커서 제외.

export type RelationKind = "천간합" | "육합" | "반합" | "충" | "형";

export type Relation = { kind: RelationKind; a: string; b: string; /** 합으로 생기는 오행 (합일 때) */ forms?: string };

const STEM_COMBINE: Record<string, [string, string]> = {
  갑: ["기", "토"], 기: ["갑", "토"],
  을: ["경", "금"], 경: ["을", "금"],
  병: ["신", "수"], 신: ["병", "수"],
  정: ["임", "목"], 임: ["정", "목"],
  무: ["계", "화"], 계: ["무", "화"],
};

const SIX_COMBINE: Record<string, [string, string]> = {
  자: ["축", "토"], 축: ["자", "토"],
  인: ["해", "목"], 해: ["인", "목"],
  묘: ["술", "화"], 술: ["묘", "화"],
  진: ["유", "금"], 유: ["진", "금"],
  사: ["신", "수"], 신: ["사", "수"],
  오: ["미", "화"], 미: ["오", "화"],
};

/** 삼합: [생지, 왕지, 고지, 오행] — 반합은 왕지를 포함한 두 글자 */
const TRIPLES: [string, string, string, string][] = [
  ["신", "자", "진", "수"],
  ["해", "묘", "미", "목"],
  ["인", "오", "술", "화"],
  ["사", "유", "축", "금"],
];

const CLASH: Record<string, string> = { 자: "오", 오: "자", 축: "미", 미: "축", 인: "신", 신: "인", 묘: "유", 유: "묘", 진: "술", 술: "진", 사: "해", 해: "사" };

/** 형: 인사신 · 축술미 삼형의 두 글자, 자묘 상형, 진 · 오 · 유 · 해 자형 */
const PUNISH_PAIRS = new Set(["인사", "사신", "인신", "축술", "술미", "축미", "자묘", "진진", "오오", "유유", "해해"]);

export function stemRelation(a: string, b: string): Relation | null {
  const c = STEM_COMBINE[a];
  return c && c[0] === b ? { kind: "천간합", a, b, forms: c[1] } : null;
}

/** 두 지지 사이의 관계들 (한 쌍에 여러 관계가 있을 수 있다. 예: 축미 = 충 + 형) */
export function branchRelations(a: string, b: string): Relation[] {
  const out: Relation[] = [];
  const six = SIX_COMBINE[a];
  if (six && six[0] === b) out.push({ kind: "육합", a, b, forms: six[1] });
  for (const [s, w, g, el] of TRIPLES) {
    const pair = new Set([a, b]);
    if (a !== b && pair.has(w) && (pair.has(s) || pair.has(g))) out.push({ kind: "반합", a, b, forms: el });
  }
  if (CLASH[a] === b) out.push({ kind: "충", a, b });
  if (PUNISH_PAIRS.has(a + b) || PUNISH_PAIRS.has(b + a)) out.push({ kind: "형", a, b });
  return out;
}
