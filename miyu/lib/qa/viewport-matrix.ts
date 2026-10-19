// 접이식(폴더블) · 큰 화면 기기를 가정한 "반응형 모의 검사"의 화면 크기 표.
//
// ⚠ 이 표는 실제 기기를 대신하지 않는다.
//  - 공식 사양 페이지에 있는 것은 "물리 해상도(픽셀)"와 화면 크기뿐이고, 브라우저가 보는 CSS 폭(viewport)이나 화면 배율(DPR)은 적혀 있지 않다.
//    그래서 물리 해상도를 CSS 폭으로 쓰지 않고, 배율을 2 · 2.5 · 3으로 가정해 나눈 값(가정)을 여러 개 시험한다. 어느 배율이 실제인지는 모른다.
//  - 접힘 / 펼침은 "창 크기를 바꿔 본 것"일 뿐이다. 실제 접이식 기기의 힌지 · 화면 전환 · 앱 재개 동작을 보지 않았다.
//  - 키보드는 "보이는 높이를 줄인 것"이다. iOS · Android 키보드가 화면을 줄이는 방식은 다르고 실제 키보드로 보지 않았다.
// 그래서 결과는 항상 "반응형 모의 검사(Chromium 크기 조정)"로만 기록하고 "실제 폰 통과"로 쓰지 않는다.

/** 공식 사양 페이지의 숫자 (조회: 2026-10-19, 페이지 본문을 요약 도구로 읽은 값 — 운영자가 한 번 더 눈으로 확인하는 것을 권한다) */
export const DISPLAY_SPECS = [
  {
    id: "iphone-duo-inner",
    label: "iPhone Duo 안쪽 화면",
    physical: { width: 1878, height: 2670 },
    ppi: 430,
    source: "https://www.apple.com/iphone-duo/specs/",
    note: "7.6인치 접이식 OLED. 사양 페이지에 CSS 폭 · 배율은 없다.",
  },
  {
    id: "iphone-duo-outer",
    label: "iPhone Duo 바깥 화면",
    physical: { width: 1398, height: 2034 },
    ppi: 460,
    source: "https://www.apple.com/iphone-duo/specs/",
    note: "5.4인치 OLED. 사양 페이지에 CSS 폭 · 배율은 없다.",
  },
  {
    id: "fold8-main",
    label: "Galaxy Z Fold8 메인(안쪽) 화면",
    physical: { width: 1848, height: 2448 },
    ppi: undefined,
    source: "https://www.samsung.com/uk/business/smartphones/galaxy-z/galaxy-z-fold8-lavender-256gb-sm-f971blvbeub/",
    note: "7.6인치 4:3. 사양 페이지에 CSS 폭 · 배율은 없다. 펼친 크기가 가로로 넓은 쪽(161.4 × 123.9mm)이라 세로 · 가로 둘 다 본다.",
  },
  {
    id: "fold8-cover",
    label: "Galaxy Z Fold8 커버(바깥) 화면",
    physical: { width: 1248, height: 1972 },
    ppi: undefined,
    source: "https://www.samsung.com/uk/business/smartphones/galaxy-z/galaxy-z-fold8-lavender-256gb-sm-f971blvbeub/",
    note: "5.5인치 10:16 (사양에는 1972 × 1248로 적혀 있어 세로로 세워 1248 × 1972로 썼다).",
  },
] as const;

/** 물리 해상도를 CSS 폭으로 바꾸는 배율 후보 — 실제 값은 모른다(가정) */
export const ASSUMED_DPRS = [2, 2.5, 3] as const;

export type ViewportGroup =
  | "baseline" // 일반 폰
  | "stress" // 아주 좁은 폭 · 아주 낮은 높이
  | "folded" // 접힌(바깥) 화면을 가정
  | "unfolded" // 펼친(안쪽) 화면을 가정
  | "split" // 분할 창 · 작은 창
  | "keyboard"; // 키보드로 보이는 높이가 줄어든 상태

export type ViewportCase = {
  id: string;
  width: number;
  height: number;
  /** 화면 배율(스크린샷 선명도에만 영향) */
  dpr: number;
  group: ViewportGroup;
  orientation: "portrait" | "landscape";
  /** 이 크기를 어떻게 정했는지 — 물리 해상도 ÷ 가정한 배율 등 */
  basis: string;
  /** 실제 값이 아니라 가정으로 정한 크기인가 (항상 true — 여기 있는 모든 크기는 가정이다) */
  assumed: true;
};

export function cssFromPhysical(physical: number, dpr: number): number {
  return Math.round(physical / dpr);
}

function swap(v: ViewportCase): ViewportCase {
  return { ...v, id: `${v.id}-landscape`, width: v.height, height: v.width, orientation: "landscape" };
}

function portrait(id: string, width: number, height: number, dpr: number, group: ViewportGroup, basis: string): ViewportCase {
  return { id, width, height, dpr, group, orientation: "portrait", basis, assumed: true };
}

/** 일반 폰 · 아주 좁은 폭(스트레스) — 사양에서 온 것이 아니라 흔한 크기와 최악 폭으로 고른 값 */
const GENERIC: ViewportCase[] = [
  portrait("stress-280", 280, 653, 3, "stress", "접이식 바깥 화면 중 가장 좁은 쪽을 가정한 최악 폭(사양에서 온 값이 아님)"),
  portrait("base-320", 320, 568, 2, "baseline", "작은 폰(기준 최소 폭)"),
  portrait("base-360", 360, 780, 3, "baseline", "흔한 Android 폭"),
  portrait("base-390", 390, 844, 3, "baseline", "흔한 iPhone 폭"),
  portrait("base-412", 412, 915, 2.625, "baseline", "큰 Android 폭"),
];

/** 공식 사양 × 배율 가정에서 나온 크기 */
function fromSpecs(): ViewportCase[] {
  const out: ViewportCase[] = [];
  for (const spec of DISPLAY_SPECS) {
    const folded = spec.id.endsWith("outer") || spec.id.endsWith("cover");
    for (const dpr of ASSUMED_DPRS) {
      const w = cssFromPhysical(spec.physical.width, dpr);
      const h = cssFromPhysical(spec.physical.height, dpr);
      out.push(portrait(`${spec.id}-dpr${dpr}`, w, h, dpr, folded ? "folded" : "unfolded", `${spec.label}: 물리 ${spec.physical.width}×${spec.physical.height} ÷ 가정 배율 ${dpr} = ${w}×${h} (배율은 가정)`));
    }
  }
  return out;
}

/** 분할 창 · 키보드 — 위 크기를 바탕으로 만든 변형 */
function variants(base: ViewportCase[]): ViewportCase[] {
  const unfolded = base.filter((v) => v.group === "unfolded");
  const out: ViewportCase[] = [];
  for (const v of unfolded) {
    // 펼친 화면을 둘로 나눈 창(반 폭)과 셋으로 나눈 창(1/3 폭) — 접이식에서 앱 두 개를 나란히 쓰는 경우
    // 240px 밑으로는 줄이지 않는다 — 기기가 그보다 좁은 창을 허용하는지 모르기 때문(좁은 쪽 최악은 stress-280이 맡는다)
    out.push(portrait(`${v.id}-split-half`, Math.max(240, Math.round(v.width / 2)), v.height, v.dpr, "split", `${v.basis} → 분할 창 반 폭(최소 240)`));
    out.push(portrait(`${v.id}-split-third`, Math.max(240, Math.round(v.width / 3)), v.height, v.dpr, "split", `${v.basis} → 분할 창 1/3 폭(최소 240)`));
  }
  out.push(portrait("popup-400x600", 400, 600, 2, "split", "작은 떠 있는 창(가정)"));
  // 키보드: 보이는 높이를 절반 남짓으로 줄인 상태 (실제 키보드는 기기마다 다르다)
  for (const v of [...base.filter((x) => x.group === "baseline" || x.group === "folded" || x.group === "unfolded"), ...GENERIC.filter((x) => x.group === "stress")]) {
    out.push(portrait(`${v.id}-keyboard`, v.width, Math.max(240, Math.round(v.height * 0.55)), v.dpr, "keyboard", `${v.basis} → 키보드로 보이는 높이를 약 55%로 줄임(가정)`));
  }
  return out;
}

/** 전체 표: 세로 + 가로(너비 · 높이를 바꾼 것). 키보드 · 분할 변형은 가로 변형을 따로 만들지 않는다. */
export function viewportMatrix(): ViewportCase[] {
  const base = [...GENERIC, ...fromSpecs()];
  const landscape = base.filter((v) => v.group !== "stress").map(swap);
  return [...base, ...landscape, ...variants(base)];
}

/** 빠른 확인용: 대표 크기만 */
export function quickMatrix(): ViewportCase[] {
  const keep = new Set([
    "stress-280",
    "base-320",
    "base-390",
    "iphone-duo-outer-dpr3",
    "fold8-cover-dpr3",
    "iphone-duo-inner-dpr3",
    "iphone-duo-inner-dpr2",
    "fold8-main-dpr3",
    "fold8-main-dpr2",
    "fold8-main-dpr2-landscape",
    "fold8-main-dpr3-split-third",
    "iphone-duo-inner-dpr3-split-half",
    "base-390-keyboard",
    "fold8-main-dpr3-keyboard",
  ]);
  return viewportMatrix().filter((v) => keep.has(v.id));
}

/** 글자 확대 시험 배율 (루트 글자 크기에 곱함) */
export const TEXT_ZOOMS = [1.3, 1.5, 2] as const;
