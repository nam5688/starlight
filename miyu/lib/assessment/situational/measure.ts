// 28문항 읽기의 도달 가능성 · 분포 측정 도구 — 시험과 문서 생성이 같이 쓴다(순수 계산, 결정적 난수). 화면 · 서버는 이 파일을 불러오지 않는다.
// 이 측정은 "가상 응답 시트로 규칙이 어떻게 움직이는가"일 뿐이다 — 실제 사람의 응답 분포가 아니고 정확도 · 신뢰도를 말하지 않는다.
import { FLAVOR_RULES, type PersonalTypeId } from "../personal-type.ts";
import type { Group } from "../../saju/interpret/structure.ts";
import { SCENE_READINGS, TYPE_SUPPORTS, judgeAll, typeFrom28, type AnswerSheet } from "./reading.ts";

/** 결정적 난수(mulberry32) — 같은 씨앗이면 같은 수열이라 측정 결과 · 문서가 늘 같다 */
export function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 유형을 받치는 읽기(구분의 쪽)를 가진 선택지 번호들 — 분명한(clear) 읽기를 먼저 */
function supportingOptions(type: PersonalTypeId, scene: (typeof SCENE_READINGS)[number]): { clear: number[]; weak: number[] } {
  const sup = TYPE_SUPPORTS[type];
  const out = { clear: [] as number[], weak: [] as number[] };
  scene.options.forEach((o, i) => {
    const r = o.read;
    if (r && sup.some((s) => s.d === r.d && s.side === r.side)) (r.clarity === "clear" ? out.clear : out.weak).push(i + 1);
  });
  return out;
}

/** 그 유형을 가장 일관되게 받치는 응답 시트 — 장면마다 받치는 선택지가 있으면 그것(분명한 읽기 먼저), 없으면 어느 구분도 읽지 않는 선택지, 그것도 없으면 반대 방향이 아닌 선택지 */
export function consistentSheet(type: PersonalTypeId): AnswerSheet {
  const sup = TYPE_SUPPORTS[type];
  const sheet: AnswerSheet = {};
  for (const scene of SCENE_READINGS) {
    const s = supportingOptions(type, scene);
    if (s.clear.length) sheet[scene.id] = s.clear[0] as 1 | 2 | 3 | 4;
    else if (s.weak.length) sheet[scene.id] = s.weak[0] as 1 | 2 | 3 | 4;
    else {
      const neutral = scene.options.findIndex((o) => !o.read || !sup.some((x) => x.d === o.read!.d));
      sheet[scene.id] = ((neutral >= 0 ? neutral : 0) + 1) as 1 | 2 | 3 | 4;
    }
  }
  return sheet;
}

/** 세기 p로 그 유형 쪽에 기운 응답 시트 — 장면마다 확률 p로 받치는 선택지(있으면), 아니면 네 선택지 중 아무거나 */
export function preferenceSheet(type: PersonalTypeId, p: number, rng: () => number): AnswerSheet {
  const sheet: AnswerSheet = {};
  for (const scene of SCENE_READINGS) {
    const s = supportingOptions(type, scene);
    const pool = [...s.clear, ...s.weak];
    const pick = pool.length && rng() < p ? pool[Math.floor(rng() * pool.length)] : Math.floor(rng() * 4) + 1;
    sheet[scene.id] = pick as 1 | 2 | 3 | 4;
  }
  return sheet;
}

export type Measure = { p: number; runs: number; right: number; wrong: number; mixed: number };

const GROUPS = Object.keys(FLAVOR_RULES) as Group[];

/** 10개 유형 각각에 대해 runs번씩 — 사주가 그 유형의 갈래 하나만 후보로 정했다고 가정하고(사주 계산은 따로다) 응답만으로 맞는 이름 · 반대 모습 · 혼합이 어떻게 나오는지 센다 */
export function measurePreference(p: number, runsPerType: number, seed: number): Measure {
  const rng = rngOf(seed);
  let right = 0;
  let wrong = 0;
  let mixed = 0;
  let runs = 0;
  for (const group of GROUPS) {
    for (const id of [FLAVOR_RULES[group].a, FLAVOR_RULES[group].b]) {
      for (let k = 0; k < runsPerType; k++) {
        const t = typeFrom28([group], judgeAll(preferenceSheet(id, p, rng)));
        runs++;
        if (t.kind === "mixed") mixed++;
        else if (t.id === id) right++;
        else wrong++;
      }
    }
  }
  return { p, runs, right, wrong, mixed };
}
