// 명리 조합 해석 프레임 — 타입 (운영자 2026-10-18: "계산 → 조합 해석 → 인생 이야기 후보 → 실제 설문과 연결 → AI 서술").
// 프레임은 "서로 다른 사실 둘 이상이 겹칠 때만 발동하는 조합 조건 + 그 조합이 전통에서 읽히는 의미 범위(키워드) + 좋은 면 · 어려운 면 · 과거 · 미래의 얼굴"이다.
// 결론 문장을 미리 써 두지 않는다 — 키워드와 초점만 두고 이야기는 AI가 쓴다. 전통 해석을 단순화한 설계 가설이며 전문가 검토 전 초안이다(검증됨이라고 쓰지 않는다).
import type { PillarKey } from "../../engine.ts";
import type { Group } from "../structure.ts";

export type FrameArea = "love" | "wealth" | "past";
export const AREA_LABEL: Record<FrameArea, string> = { love: "연애 · 배우자", wealth: "재물", past: "과거 회고" };

/** structure: 원국 구조로 발동 / timing: 대운 · 세운 시기로 발동(인스턴스 = 어느 시기에 났는가) */
export type FrameKind = "structure" | "timing";
export type FrameGrade = "통설" | "단순화" | "자체조합";
export type Gender = "male" | "female";
export type Audience = "adult" | "teen" | "child";

/** 연령대 구분 — 만 19세 이상 연애 · 배우자 · 결혼 풀이 / 만 16~18세 호감 · 관계 경험 중심(결혼 · 배우자 확정 풀이 제한) / 만 16세 미만 또래 관계 중심 */
export const audienceOf = (age: number): Audience => (age >= 19 ? "adult" : age >= 16 ? "teen" : "child");

/** 대운 한 칸 또는 세운 한 해 */
export type FrameUnit = {
  kind: "luck" | "year";
  /** 사람이 읽는 이름 — "병오 대운" · "2013년 계사" */
  label: string;
  stem: string;
  branch: string;
  /** 일간 기준 십성 이름 (천간 · 지지 본기) */
  stemGod: string;
  branchGod: string;
  stemGroup: Group | null;
  branchGroup: Group | null;
  /** 시기가 시작하는 달과 끝나는 달의 만 나이(생일의 일은 따지지 않는다 — "무렵"으로만 말한다) */
  ageFrom: number;
  ageTo: number;
  /** 양력 연-월 */
  from: string;
  to: string;
  /** 이 시기의 지지가 원국 각 기둥의 지지와 이루는 관계(합 · 반합 · 충 · 형) */
  rel: Partial<Record<PillarKey, string[]>>;
  position: "past" | "current" | "future";
};

export type FrameContext = {
  /** 성별을 받지 않았으면 null — 배우자 별을 쓰는 프레임은 발동하지 않는다(지어내지 않는다) */
  gender: Gender | null;
  /** 배우자 별 — 남성 재성 · 여성 관성(전통 한 가지 기준, 운영자 2026-10-18) */
  star: Group | null;
  dayMaster: string;
  hourKnown: boolean;
  birthYear: number;
  birthMonth: number;
  /** 기준 연-월의 만 나이(생일의 일은 따지지 않아 "무렵"으로만 말한다) */
  age: number;
  /** 읽는 사람의 연령대 — 만 19세 이상 adult / 만 16~18세 teen / 만 16세 미만 child (운영자 2026-10-18) */
  audience: Audience;
  reference: { year: number; month: number };
  /** 절기 경계 · 야자시 관법 때문에 달라질 수 있는 기둥 — 그 기둥에 기대는 근거는 쓰지 않는다 */
  uncertain: PillarKey[];
  pillars: Partial<Record<PillarKey, FramePillar>>;
  /** 천간(일간 제외) + 지지 본기에서 센 그룹별 자리 수 */
  visible: Record<Group, number>;
  /** 천간에서만 센 자리 수 */
  stems: Record<Group, number>;
  /** 천간 + 지장간 전부에서 센 자리 수(있음 · 없음 판단용) */
  anywhere: Record<Group, number>;
  /** 천간 · 지지 본기에서 센 십성 이름별 자리 수 */
  godCount: Record<string, number>;
  /** 배우자 별이 드러난 자리 */
  starOnStem: string[];
  starOnBranch: string[];
  starInHidden: string[];
  monthGroup: Group;
  monthExposed: Group[];
  monthGot: boolean;
  rootStrong: boolean;
  strength: "받는 쪽" | "덜 받는 쪽" | "갈림";
  /** 일지와 다른 기둥 지지의 관계 */
  dayRel: Partial<Record<PillarKey, string[]>>;
  luck: FrameUnit[];
  years: FrameUnit[];
  /** 응답에서 뚜렷하게 읽힌 축 — survey.<축>.<high|low> 근거에서 온다. 프레임의 있고 없음에는 쓰지 않는다 */
  survey: Record<string, "high" | "low">;
};

export type FramePillar = {
  key: PillarKey;
  stem: string;
  branch: string;
  stemGod: string | null;
  branchGod: string;
  stemGroup: Group | null;
  branchGroup: Group;
  hidden: { stem: string; role: string; god: string; group: Group | null }[];
};

export type Strand = "love" | "work" | "family" | "growth";
export type Tone = "positive" | "hard" | "mixed";

export type FrameInstance = {
  /** 프레임 ID + 시기 — 같은 시기가 두 장에 쓰였는지 확인하는 열쇠 */
  id: string;
  unit: FrameUnit;
  /** 과거로 말할 때 쓰는 나이 범위(현재 나이로 자른다) */
  ageFrom: number;
  ageTo: number;
  strand: Strand;
  tone: Tone;
  /** 이 시기를 어떤 각도로 읽을지 키워드 후보 */
  angles: string[];
  /** 왜 이 시기가 뽑혔는지 — 계산값으로 쓴 문장 */
  why: string;
  /** 어떤 기둥에 기댔는가(절기 경계로 흔들리는 기둥이면 제외한다) */
  uses: PillarKey[];
};

export type FrameHit = {
  /** 발동한 계산 사실 — 둘 이상 */
  facts: string[];
  uses: PillarKey[];
  instances?: FrameInstance[];
};

export type Hook = {
  /** 응답 축 — survey.<axis>.<side> 근거 */
  axis: string;
  side: "high" | "low";
  /** match: 사주에서 읽은 모습과 같은 쪽 / differ: 다른 쪽(상황별 차이로 설명) / complement: 사주 풀이를 구체화 */
  mode: "match" | "differ" | "complement";
  /** 이 응답이 닿는 얼굴 */
  face: "bright" | "hard";
  note: string;
};

export type Faces = { bright: string[]; hard: string[] };

export type FrameDef = {
  id: string;
  area: FrameArea;
  kind: FrameKind;
  /** 내부 라벨 — 고객 화면에 나가지 않는다 */
  name: string;
  /** 고객이 궁금해하는 질문 */
  question: string;
  /** 전통에서 이 조합을 어떻게 읽는지(원칙 설명 — 이 사람의 결론이 아니다) */
  tradition: string;
  /** 의미 범위 키워드(8개 이내, 문장 아님) */
  meaning: string[];
  faces: Faces;
  /** 성별에 따라 얼굴이 달라지는 프레임 */
  facesBy?: Partial<Record<Gender, Faces>>;
  /** 과거 경험으로 나타났을 가능성이 있는 장면(명사구, 가능성으로만) */
  pastScenes: string[];
  /** 지금 모습으로 이어질 수 있는 키워드 */
  present: string[];
  /** 앞으로의 연애 · 재물 · 직업 · 인연 흐름 키워드 */
  future: string[];
  hooks: Hook[];
  /** 시기 프레임의 과거 나이 하한(그 나이 이전의 시기는 쓰지 않는다) */
  minAge?: number;
  /** 필요한 데이터 — 없으면 발동하지 않는다 */
  needs: ("gender" | "luck")[];
  /**
   * 해석 근거의 성격(미유 판단 — 전문가 검토 전) — 통설: 전통에서 이름이 있는 구조를 그대로 / 단순화: 통설 구조를 한두 조건으로 줄인 것 / 자체조합: 통설 이름이 없고 미유가 조건을 조합한 것.
   * 자체조합은 AI 근거로 쓰지 않는다(운영자 2026-10-18: 근거가 불분명한 프레임은 쓰지 말고 제외 사유를 기록한다).
   */
  grade: FrameGrade;
  /** 그렇게 매긴 이유 한두 문장 — 제외한 프레임은 제외 사유다 */
  gradeNote: string;
  /** 발동 조건(사람이 읽는 줄 — 모두 동시에 맞아야 한다. `check`와 같은 기준이며 문서에 그대로 실린다) */
  condition: string[];
  /** 쓰는 데이터 키 — `data.ts`의 DATA_NOTES에서 엔진 계산 여부 · AI 근거로 건네지는지를 확인한다 */
  data: string[];
  /** 해석의 적용 제한 */
  limits: string[];
  /** 다른 프레임과의 중복 · 배타 관계 */
  overlaps: string[];
  check: (c: FrameContext) => FrameHit | null;
};

/** 설문 연결 결과 — 프레임의 있고 없음을 바꾸지 않고 어느 얼굴을 앞세울지만 정한다 */
export type ResponseLink = {
  axis: string;
  side: "high" | "low";
  mode: Hook["mode"];
  face: "bright" | "hard";
  note: string;
} | null;

/** 0.2(2026-10-18): AI 근거 연결 · 자체조합 프레임(W5 · R1 · R2) 제외 · 정확한 만 나이 · 연령대 분기 · 기본 풀이 층 */
export const FRAME_RULE_VERSION = "saju-frames-0.2-draft";
