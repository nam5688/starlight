// 읽기 카드 — 선택된 이야기를 7개 대주제(3 연애 · 5 재물 · 6 과거 회고)의 카드로 만든다. 카드는 AI가 쓰기 전의 "근거 묶음"이고 완성된 문장이 아니다.
// 카드의 각 부분은 출처 종류가 나뉘어 있다: 계산 사실 / 전통 해석 / 공감 소재(가능성) / 설문 응답. 사주 기반 추측과 보편적 인생 경험 연결도 내부적으로 구분한다.
import { leadFaceOf, responseLinkOf, type AreaStory, type PastStory, type PickedInstance, type Selection } from "./select.ts";
import { FRAME_RULE_VERSION, type FrameContext, type FrameDef, type FrameInstance, type Gender, type ResponseLink } from "./types.ts";

export type CardChapter = 3 | 5 | 6;

export type CardTrace = {
  ruleVersion: string;
  frameId: string;
  frameName: string;
  /** 발동한 계산 사실 */
  facts: string[];
  /** 시기 프레임이면 어떤 대운 · 세운이 쓰였나 */
  unit?: { label: string; kind: "대운" | "세운"; ages: string; from: string; to: string; relations: string };
  /** chart: 사주에서 읽은 가능성 / universal: 보편적 인생 경험 연결(사주 근거 아님) */
  basis: "chart" | "universal";
  /** 응답이 선택에 영향을 줬는가 — 프레임이 있고 없음에는 절대 영향이 없다 */
  responseEffect: "없음" | "얼굴 순서만(앞세운 면)" | "차이 설명 표시";
  level: "moderate" | "weak" | "none";
};

export type CardTime = {
  /** "만 24~28세 무렵" · "2027년 무렵" */
  window: string;
  frameId: string;
  tone: "positive" | "hard" | "mixed";
  angles: string[];
  scenes: string[];
  why: string;
  basis: "chart" | "universal";
};

export type ReadingCard = {
  id: string;
  chapter: CardChapter;
  /** 고객 질문 */
  question: string;
  frameIds: string[];
  /** 전통 해석(원칙 설명 — 이 사람의 결론이 아니다) */
  tradition: string[];
  /** 의미 범위 키워드 */
  meaning: string[];
  /** 두 얼굴 — 항상 둘 다 있다. lead가 먼저 */
  lead: "bright" | "hard";
  bright: string[];
  hard: string[];
  /** 공감 소재(가능성) */
  past: CardTime[];
  present: string[];
  future: CardTime[];
  /** 설문 응답 연결 — 없으면 null(관련 없는 응답을 억지로 넣지 않는다) */
  response: ResponseLink;
  /** 계산 사실(발동한 조건) */
  facts: string[];
  limits: string[];
  overlaps: string[];
  trace: CardTrace[];
};

export type CardSet = { cards: ReadingCard[]; skipped: { card: string; reason: string }[] };

const FORBIDDEN_ALWAYS = ["확정된 사건처럼 말하지 않는다", "정확한 날짜 · 금액 · 나이를 지어내지 않는다", "입력받지 않은 가족 · 연인 · 직장 이야기를 사실처럼 쓰지 않는다"];

const windowOf = (i: FrameInstance, clip?: number): string => {
  const u = i.unit;
  if (u.kind === "year") return `${u.from.slice(0, 4)}년 무렵(만 ${u.ageFrom}세)`;
  const a = Math.max(i.ageFrom, 0);
  const b = clip !== undefined ? Math.min(i.ageTo, clip) : i.ageTo;
  return a === b ? `만 ${a}세 무렵` : `만 ${a}~${b}세 무렵`;
};

const relText = (rel: FrameInstance["unit"]["rel"]) =>
  (Object.entries(rel) as [string, string[]][]).filter(([, k]) => k.length).map(([key, k]) => `${({ year: "년", month: "월", day: "일", hour: "시" } as Record<string, string>)[key]}지 ${k.join("·")}`).join(", ") || "관계 없음";

const traceOf = (frame: FrameDef, facts: string[], level: CardTrace["level"], link: ResponseLink, inst?: FrameInstance, basis: "chart" | "universal" = "chart"): CardTrace => ({
  ruleVersion: FRAME_RULE_VERSION,
  frameId: frame.id,
  frameName: frame.name,
  facts,
  ...(inst ? { unit: { label: inst.unit.label, kind: inst.unit.kind === "luck" ? "대운" : "세운", ages: windowOf(inst), from: inst.unit.from, to: inst.unit.to, relations: relText(inst.unit.rel) } } : {}),
  basis,
  responseEffect: !link ? "없음" : link.mode === "differ" ? "차이 설명 표시" : "얼굴 순서만(앞세운 면)",
  level,
});

const facesOf = (frame: FrameDef, g: Gender | null) => (g && frame.facesBy?.[g]) || frame.faces;

const timeOfPick = (p: PickedInstance, clip?: number): CardTime => ({ window: windowOf(p.instance, clip), frameId: p.frame.id, tone: p.instance.tone, angles: p.instance.angles, scenes: p.frame.pastScenes, why: p.instance.why, basis: "chart" });
const futureOfPick = (p: PickedInstance): CardTime => ({ window: windowOf(p.instance), frameId: p.frame.id, tone: p.instance.tone, angles: p.instance.angles, scenes: p.frame.future, why: p.instance.why, basis: "chart" });

function structureCard(c: FrameContext, s: AreaStory, chapter: CardChapter, id: string): ReadingCard | null {
  if (!s.structure) return null;
  const { core, side } = s.structure;
  const link = responseLinkOf(c, core.frame);
  const f = facesOf(core.frame, c.gender);
  const frames = [core, ...(side ? [side] : [])];
  return {
    id, chapter, question: core.frame.question,
    frameIds: frames.map((h) => h.frame.id),
    tradition: frames.map((h) => h.frame.tradition),
    meaning: [...new Set(frames.flatMap((h) => h.frame.meaning))].slice(0, 8),
    lead: leadFaceOf(link), bright: f.bright, hard: f.hard,
    past: core.frame.pastScenes.map((scene) => ({ window: "시기는 시기 카드에서", frameId: core.frame.id, tone: "mixed" as const, angles: [scene], scenes: [scene], why: "구조에서 읽히는 가능성(시기 미정)", basis: "chart" as const })).slice(0, 2),
    present: core.frame.present,
    future: [],
    response: link,
    facts: core.hit.facts,
    limits: [...core.frame.limits, ...FORBIDDEN_ALWAYS],
    overlaps: core.frame.overlaps,
    trace: frames.map((h) => traceOf(h.frame, h.hit.facts, h.level, responseLinkOf(c, h.frame))),
  };
}

function timingCard(c: FrameContext, s: AreaStory, chapter: CardChapter, id: string): ReadingCard | null {
  if (!s.timingFrame || (!s.past && !s.ahead)) return null;
  const frame = s.timingFrame;
  const link = responseLinkOf(c, frame);
  const picks = [s.past, s.ahead].filter((p): p is PickedInstance => !!p);
  const f = facesOf(frame, c.gender);
  return {
    id, chapter, question: frame.question, frameIds: [frame.id],
    tradition: [frame.tradition], meaning: frame.meaning,
    lead: leadFaceOf(link), bright: f.bright, hard: f.hard,
    past: s.past ? [timeOfPick(s.past, c.age)] : [],
    present: s.past ? frame.present : [],
    future: s.ahead ? [futureOfPick(s.ahead)] : [],
    response: link,
    facts: picks.map((p) => p.instance.why),
    limits: [...frame.limits, ...FORBIDDEN_ALWAYS],
    overlaps: frame.overlaps,
    trace: picks.map((p) => traceOf(frame, [p.instance.why], "moderate", link, p.instance)),
  };
}

function pastCard(c: FrameContext, p: PastStory): ReadingCard | null {
  if (p.basis === "universal") {
    if (!p.universal.length) return null;
    return {
      id: "ch6-past", chapter: 6, question: "지나온 시기를 돌아보면 어떤 이야기가 보일까요?", frameIds: [],
      tradition: [], meaning: ["보편적인 인생 경험 연결"], lead: "bright", bright: [], hard: [],
      past: p.universal.map((u) => ({ window: "나이대 공통", frameId: "-", tone: "mixed" as const, angles: [u], scenes: [u], why: "사주에서 읽은 시기가 없어 많은 사람이 겪는 경험으로만 연결(사주 근거 아님)", basis: "universal" as const })),
      present: [], future: [], response: null, facts: ["이 사람의 지난 대운 · 세운에서 발동한 과거 프레임이 없음"],
      limits: ["사주에서 읽었다고 말하지 않는다(보편적인 경험 연결임을 밝힌다)", ...FORBIDDEN_ALWAYS], overlaps: [],
      trace: [{ ruleVersion: FRAME_RULE_VERSION, frameId: "-", frameName: "보편 경험 연결", facts: ["발동한 과거 프레임 없음"], basis: "universal", responseEffect: "없음", level: "none" }],
    };
  }
  const first = p.picks[0];
  if (!first) return null;
  const link = responseLinkOf(c, first.frame);
  const frames = p.picks.map((x) => x.frame);
  const f = facesOf(first.frame, c.gender);
  return {
    id: "ch6-past", chapter: 6, question: first.frame.question, frameIds: [...new Set(frames.map((x) => x.id))],
    tradition: [...new Set(frames.map((x) => x.tradition))], meaning: [...new Set(frames.flatMap((x) => x.meaning))].slice(0, 8),
    lead: leadFaceOf(link), bright: f.bright, hard: f.hard,
    past: p.picks.map((x) => timeOfPick(x, c.age)),
    present: [...new Set(frames.flatMap((x) => x.present))].slice(0, 3),
    future: [], response: link,
    facts: p.picks.map((x) => x.instance.why),
    limits: [...new Set(frames.flatMap((x) => x.limits)), ...FORBIDDEN_ALWAYS],
    overlaps: [...new Set(frames.flatMap((x) => x.overlaps))],
    trace: p.picks.map((x) => traceOf(x.frame, [x.instance.why], "moderate", responseLinkOf(c, x.frame), x.instance)),
  };
}

/** 선택된 이야기를 7개 대주제의 카드로 연결한다. 근거가 없는 카드는 만들지 않고 이유를 남긴다(거짓 근거를 생성하지 않는다) */
export function buildCards(c: FrameContext, sel: Selection): CardSet {
  const cards: ReadingCard[] = [];
  const skipped: CardSet["skipped"] = [];
  const add = (card: ReadingCard | null, name: string, reason: string) => (card ? cards.push(card) : skipped.push({ card: name, reason }));
  if (!c.gender) skipped.push({ card: "3장 연애", reason: "성별 정보가 없어 배우자 별을 쓰는 연애 프레임을 쓰지 않음" });
  if (sel.love) {
    add(structureCard(c, sel.love, 3, "ch3-love-structure"), "3장 연애 · 인연의 모양", "발동한 연애 구조 프레임이 없음");
    add(timingCard(c, sel.love, 3, "ch3-love-timing"), "3장 연애 · 인연이 움직이는 시기", "배우자 별 × 일지 관계가 겹친 시기가 없음");
  } else if (c.gender) skipped.push({ card: "3장 연애", reason: "발동한 연애 프레임이 없음" });
  if (sel.wealth) {
    add(structureCard(c, sel.wealth, 5, "ch5-wealth-structure"), "5장 재물 · 재물복의 모양", "발동한 재물 구조 프레임이 없음");
    add(timingCard(c, sel.wealth, 5, "ch5-wealth-timing"), "5장 재물 · 수입 · 일이 움직이는 시기", "재성 × 월지 관계가 겹친 시기가 없음");
  } else skipped.push({ card: "5장 재물", reason: "발동한 재물 프레임이 없음" });
  add(pastCard(c, sel.past), "6장 과거 회고", "과거 회고를 쓸 수 있는 나이가 아니거나 근거가 없음");
  return { cards, skipped };
}

/** 사람이 읽는 카드 — 개발 · 검토 화면용. 완성된 글이 아니라 AI에게 주는 근거 묶음을 읽기 좋게 펼친 것이다 */
export function renderCard(card: ReadingCard): string {
  const L: string[] = [];
  L.push(`### ${card.chapter}장 · ${card.id} — ${card.question}`);
  L.push(`- **쓰는 프레임**: ${card.frameIds.join(" · ") || "(보편 경험 연결)"}`);
  L.push(`- **발동한 계산 사실**: ${card.facts.join(" / ")}`);
  if (card.tradition.length) L.push(`- **전통 해석(원칙)**: ${card.tradition.join(" / ")}`);
  if (card.meaning.length) L.push(`- **의미 범위**: ${card.meaning.join(" · ")}`);
  const face = (k: "bright" | "hard") => (k === "bright" ? `좋은 면: ${card.bright.join(" · ")}` : `어려운 면: ${card.hard.join(" · ")}`);
  if (card.bright.length || card.hard.length) L.push(`- **얼굴(앞세울 순서)**: ${[face(card.lead), face(card.lead === "bright" ? "hard" : "bright")].join(" → ")}`);
  for (const p of card.past) L.push(`- **과거 가능성**[${p.basis === "universal" ? "보편 경험" : "사주 기반"}] ${p.window}: ${p.angles.join(" · ")} — 장면 후보: ${p.scenes.slice(0, 3).join(" / ")}`);
  if (card.present.length) L.push(`- **현재 모습**: ${card.present.join(" / ")}`);
  for (const p of card.future) L.push(`- **앞으로 흐름** ${p.window}: ${p.angles.join(" · ")} — 키워드: ${p.scenes.slice(0, 2).join(" / ")}`);
  L.push(`- **설문 연결**: ${card.response ? `${card.response.axis} ${card.response.side === "high" ? "높음" : "낮음"} → ${({ match: "사주와 일치", differ: "사주와 차이(상황별 차이로 설명)", complement: "사주 풀이를 구체화" } as const)[card.response.mode]} — ${card.response.note}` : "관련 응답 없음(억지로 넣지 않음)"}`);
  L.push(`- **적용 제한**: ${card.limits.join(" / ")}`);
  return L.join("\n");
}
