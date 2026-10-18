// 프레임 이야기 → AI 근거 목록(운영자 2026-10-18 연결 승인). 코드가 근거(프레임 · 시기 · 중복 제거 · 명리 사실)를 정하고 AI는 그 근거 안에서 쓴다.
//  · 구조 프레임(연애 L1~L5 · 재물 W1~W7): `saju.frame.<ID>` — 3번(연애와 애착) · 5번(일과 재물)이 먼저 읽는다
//  · 시기 프레임(연애 L6 · 재물 W8 · 과거 회고 R3~R6): `saju.frame.<ID>.<시기>` — period(연-월)와 ageWindows(만 나이 범위)를 달아 지난 · 지금 · 앞으로의 대운 · 세운을 정확한 나이 범위로 건넨다. 6번(앞으로의 운과 변화)이 읽는다
//  · 기본 풀이(`saju.frame.base-*`): 프레임이 없는 곳을 위치와 운으로 읽는 근거 / 연령대(`saju.frame.audience.*`): 만 19세 미만의 풀이 범위
// 결론 문장은 없다 — fact는 계산 사실이고 cue는 의미 범위와 앞세울 초점이다. 응답은 프레임의 있고 없음을 바꾸지 않고 cue의 마지막 "응답 연결:" 문장만 바꾼다.
import type { Evidence, Topic } from "../../../report/evidence.ts";
import { baseEvidenceOf, forAudience } from "./base.ts";
import { leadFaceOf, responseLinkOf, timeOf, type EvaluatedHit, type PickedInstance, type Selection } from "./select.ts";
import type { FrameContext, FrameDef, FrameInstance, Gender, ResponseLink } from "./types.ts";

export const AXIS_LABEL: Record<string, string> = {
  novelty: "새로움을 대하는 기질", caution: "신중함", sensitivity: "민감함", persistence: "지속성", anxiety: "관계에서의 불안", avoidance: "가까워질 때 거리 두기",
  ei: "에너지를 채우는 방식", sn: "정보를 받아들이는 방식", tf: "판단하는 기준", jp: "생활을 꾸리는 방식",
};
const MODE_TEXT = { match: "사주에서 읽은 모습과 같은 쪽", differ: "사주에서 읽은 모습과 다른 쪽(하나로 맞추지 말고 어떤 상황에서 어느 쪽이 나타나는지로 설명)", complement: "사주 풀이를 이 사람의 장면으로 구체화" } as const;

/** cue의 마지막 문장 — 응답이 바꾸는 것은 이 문장뿐이다(프레임의 있고 없음 · fact는 응답과 무관하다) */
export const RESPONSE_MARK = " 응답 연결:";

function responsePart(link: ResponseLink): string {
  if (!link) return `${RESPONSE_MARK} 관련 응답이 뚜렷하지 않아 연결하지 않아요(억지로 응답을 붙이지 않고 좋은 면부터 풀어요).`;
  const lead = leadFaceOf(link) === "hard" ? "어려운 면부터" : "좋은 면부터";
  return `${RESPONSE_MARK} ${AXIS_LABEL[link.axis] ?? link.axis} ${link.side === "high" ? "높은 쪽" : "낮은 쪽"} → ${MODE_TEXT[link.mode]} — ${link.note}. 이 응답은 프레임이 있는지를 바꾸지 않고 풀이 순서(${lead})와 일치 · 차이를 설명하는 데만 써요.`;
}

const facesOf = (frame: FrameDef, g: Gender | null) => (g && frame.facesBy?.[g]) || frame.faces;
const top = (xs: string[], n = 3) => xs.slice(0, n).join(" · ");

const LOVE_TOPICS = (c: FrameContext): Topic[] => (c.audience === "adult" ? ["love", "marriage", "relationship"] : ["love", "relationship"]);

function structureEvidence(hit: EvaluatedHit, c: FrameContext): Evidence {
  const { frame } = hit;
  const A = (t: string) => forAudience(t, c.audience);
  const f = facesOf(frame, c.gender);
  const link = responseLinkOf(c, frame);
  return {
    id: `saju.frame.${frame.id}`,
    source: "saju",
    topics: frame.area === "love" ? LOVE_TOPICS(c) : ["money", "work"],
    strength: hit.level,
    fact: A(hit.hit.facts.join(" / ")),
    cue: A(`${frame.tradition} 의미 범위: ${frame.meaning.join(" · ")}. 좋은 면: ${top(f.bright)}. 어려운 면: ${top(f.hard)}. 지금 모습 단서: ${top(frame.present, 2)}. 적용 제한: ${top(frame.limits, 2)}.${responsePart(link)}`),
  };
}

const POSITION_WORD = { past: "지난", now: "지금 지나는", future: "앞으로" } as const;
const slugOf = (i: FrameInstance) => (i.unit.kind === "year" ? i.unit.from.slice(0, 4) : `${i.unit.stem}${i.unit.branch}대운`);
const ageWindow = (a: number, b: number) => (a === b ? `만 ${a}세 무렵` : `만 ${a}~${b}세 무렵`);
const ymText = (c: FrameContext) => `${c.reference.year}-${String(c.reference.month).padStart(2, "0")}`;

const STRAND_TOPICS: Record<FrameInstance["strand"], Topic[]> = { love: ["relationship", "timing"], work: ["work", "timing"], family: ["personality", "timing"], growth: ["personality", "timing"] };

function timingEvidence(pick: PickedInstance, c: FrameContext): Evidence {
  const { frame, instance: inst } = pick;
  const A = (t: string) => forAudience(t, c.audience);
  const pos = timeOf(frame, inst);
  const u = inst.unit;
  // 과거 회고 프레임이 지금 지나는 대운을 짚은 경우 — "지금까지" 지나온 부분만 과거로 쓴다(아직 오지 않은 해 · 나이는 말하지 않는다)
  const retro = pos === "past" && u.position === "current";
  const posWord = retro ? "지금까지 지나온" : POSITION_WORD[pos];
  const from = inst.ageFrom;
  const to = pos === "past" ? Math.min(inst.ageTo, c.age) : inst.ageTo;
  const years = u.kind === "year" ? `${u.from.slice(0, 4)}년 무렵` : `${u.from.slice(0, 4)}년 무렵~${retro ? "지금" : `${u.to.slice(0, 4)}년 무렵`}`;
  const f = facesOf(frame, c.gender);
  const link = responseLinkOf(c, frame);
  const scenes = pos === "past" ? `과거 장면 후보(가능성으로만): ${top(frame.pastScenes, 2)}` : `앞으로 흐름 단서: ${top(frame.future, 2)}`;
  return {
    id: `saju.frame.${frame.id}.${slugOf(inst)}`,
    source: "saju",
    topics: frame.id === "L6" ? ["love", "timing"] : frame.id === "W8" ? ["money", "work", "timing"] : STRAND_TOPICS[inst.strand],
    strength: frame.id === "L6" || frame.id === "W8" ? "moderate" : "weak",
    fact: A(`${posWord} ${u.kind === "luck" ? "대운" : "세운"} ${u.label}(천간 ${u.stemGod} · 지지 ${u.branchGod}) · ${years} · ${ageWindow(from, to)} — ${inst.why}`),
    cue: A(`${frame.tradition} 읽는 각도: ${inst.angles.join(" · ")}. ${scenes}. 좋은 면: ${top(f.bright, 2)}. 어려운 면: ${top(f.hard, 2)}. 이 시기는 확인된 사건이 아니라 ${pos === "past" ? (retro ? "지금까지 이 주제가 두드러졌을 가능성" : "그 무렵 이 주제가 두드러졌을 가능성") : "이 주제가 두드러질 가능성"}이에요 — 나이와 연도는 이 근거에 적힌 범위 안에서만 말하고, 구체적인 사건 · 금액 · 날짜를 지어내지 않아요.${responsePart(link)}`),
    period: { from: u.from, to: retro ? ymText(c) : u.to, label: `${posWord} ${u.kind === "luck" ? "대운" : "세운"} ${u.label.replace(/ 대운$/, "")}` },
    ageWindows: [{ from, to }],
  };
}

/** 읽는 사람의 연령대 안내 — 만 19세 미만에게만 있다(코드가 풀이 범위를 정하고 검사가 확인한다) */
export function audienceEvidence(c: FrameContext): Evidence | null {
  if (c.audience === "adult") return null;
  const teen = c.audience === "teen";
  return {
    id: `saju.frame.audience.${c.audience}`,
    source: "saju",
    topics: ["relationship"],
    strength: "moderate",
    fact: teen ? "읽는 사람의 연령대: 만 16~18세" : "읽는 사람의 연령대: 만 16세 미만",
    cue: teen
      ? "3번 연애 풀이는 호감 · 첫 연애 · 친밀감 · 관계에서 마음을 쓰는 방식 중심으로 쓰고, 결혼 · 배우자 · 평생의 인연을 확정하는 풀이는 하지 않아요. 실제 연애나 관계 경험이 있다고 가정하지 않고, 운명적인 인연이나 특정 관계를 강요하는 말도 쓰지 않아요. 5번 재물은 용돈 · 돈에 대한 태도 · 진로 준비 중심으로만 읽어요."
      : "3번은 연애 대신 친구 · 또래 관계, 마음을 표현하는 방식, 도움을 받는 모습, 성장기 대인관계 중심으로 쓰고 연애 · 이성 · 결혼 · 배우자 이야기는 하지 않아요. 5번은 재물 구조 풀이 없이 배우고 해 보고 싶은 일의 방향 중심으로 쓰고, 돈 이야기는 용돈 · 돈에 대한 태도 정도로만 가볍게 읽어요.",
  };
}

/** 선택된 이야기 + 기본 풀이를 AI 근거 목록으로 — 같은 입력이면 늘 같은 결과다 */
export function frameEvidenceOf(c: FrameContext, sel: Selection): Evidence[] {
  const out: Evidence[] = [];
  const aud = audienceEvidence(c);
  if (aud) out.push(aud);
  for (const story of [sel.love, sel.wealth]) {
    if (!story?.structure) continue;
    out.push(structureEvidence(story.structure.core, c));
    if (story.structure.side) out.push(structureEvidence(story.structure.side, c));
  }
  const picks: PickedInstance[] = [sel.love?.past, sel.love?.ahead, sel.wealth?.past, sel.wealth?.ahead, ...sel.past.picks].filter((p): p is PickedInstance => !!p);
  const seen = new Set<string>();
  for (const p of picks) {
    const e = timingEvidence(p, c);
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  out.push(...baseEvidenceOf(c, sel));
  return out;
}
