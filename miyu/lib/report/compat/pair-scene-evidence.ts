// 리포트 궁합(아직 만들지 않음)의 "장면 질문 두 사람 비교" 근거 — 순수 계산, AI 미사용.
// 두 사람이 각자 **직접 고른** 장면 답(lib/assessment/drafts/couple-scenes-v1.ts)을 같은 영역끼리 비교해, 운영자가 정한 흐름의 재료를 만든다:
//   두 사람의 차이 → 그 차이가 만드는 관계 장면 → A가 B를 이해하는 법 → B가 A에게 조금 바꿀 것 → 같이 해 볼 구체적인 행동(건넬 짧은 말 한 문장 포함).
// 지키는 것:
//   · 한 영역은 서로 다른 맥락의 두 장면으로 읽는다 — 두 사람 모두 그 영역의 두 장면에 답했을 때만 근거를 만든다(한 문항으로 사람이나 영역을 정하지 않는다).
//     "거의 없었어요 · 맞는 선택지 없음 · 미응답"은 그 영역을 읽지 않고(held) 없는 응답을 만들어 채우지 않는다.
//   · cross 영역(K1 · K2 · K3 · K5)은 "A가 건네는 방식 ↔ B가 크게 느끼는 방식"이 닿는지 · 엇갈리는지를 두 방향으로 본다. same 영역(K4 · K6 · K7)은 같은 장면의 두 사람 답을 나란히 비교한다.
//   · 속마음을 사실로 말하지 않는다 — 엇갈림은 "마음이 없어서가 아니라 방식이 다른 것일 수 있다"로, 닿음은 "~모양일 수 있다"로만 쓴다. 좋은 답 · 나쁜 답을 가르지 않고 점수 · 궁합 지수를 새로 만들지 않는다.
//   · 사람 이름 대신 "A님 · B님"으로 부른다(사주 궁합 근거와 같은 이름). 이름 · 생년월일 원문은 들어갈 자리가 없다.
//   · 규칙(닿음 · 엇갈림의 읽기, 건넬 말)은 설계 가설이며 전문가 검토 · 실제 사람의 응답으로 확인하지 않았다 — 좋은 궁합 판정의 보증이 아니다.
import { COUPLE_SCENE_BY_ID, COUPLE_THREADS, coupleOption, type CoupleAnswers, type CoupleOption, type CoupleThread } from "../../assessment/drafts/couple-scenes-v1.ts";
import type { Evidence } from "../evidence.ts";

export const PAIR_SCENE_RULE_VERSION = "pair-scene-rules-0.1-draft";

export type PairSceneResult = {
  evidence: Evidence[];
  /** 두 사람 모두 두 장면에 답해 읽은 영역 id */
  compared: string[];
  /** 읽지 않은 영역 id와 이유 — 화면에서 "비교하지 않았어요"로만 알린다(없는 응답을 만들지 않는다) */
  held: { thread: string; reason: "missing" }[];
};

const LIMIT_CUE = "각자가 직접 고른 답을 비교한 한 가지 서술이며 두 사람의 실제 행동을 보증하지 않습니다. 상대의 속마음을 알려 주는 근거가 아니고, 어느 쪽 답이 더 좋다는 뜻도 아닙니다. 점수나 궁합 지수로 바꾸지 않습니다.";

const WHO = { a: "A님", b: "B님" } as const;
type Who = keyof typeof WHO;
const other = (w: Who): Who => (w === "a" ? "b" : "a");

/** 한 사람의 영역 답 두 개가 모두 있을 때만 [첫 장면 답, 둘째 장면 답]을 돌려준다 */
function optionsOf(t: CoupleThread, answers: CoupleAnswers): [CoupleOption, CoupleOption] | null {
  const [s1, s2] = t.scenes;
  const o1 = coupleOption(s1, answers[s1]);
  const o2 = coupleOption(s2, answers[s2]);
  return o1 && o2 ? [o1, o2] : null;
}

function crossEvidence(t: CoupleThread, a: [CoupleOption, CoupleOption], b: [CoupleOption, CoupleOption]): Evidence {
  const person = { a, b };
  const giveIndex = COUPLE_SCENE_BY_ID[t.scenes[0]].role === "give" ? 0 : 1;
  const needIndex = 1 - giveIndex;
  const giveLabel = COUPLE_SCENE_BY_ID[t.scenes[giveIndex]].label;
  const needLabel = COUPLE_SCENE_BY_ID[t.scenes[needIndex]].label;
  const lines: string[] = [];
  const suggestions: string[] = [];
  let matches = 0;
  for (const giver of ["a", "b"] as Who[]) {
    const receiver = other(giver);
    const g = person[giver][giveIndex];
    const r = person[receiver][needIndex];
    const match = g.tag === r.tag;
    if (match) matches++;
    lines.push(`[${giveLabel}] ${WHO[giver]}은 ${g.shows} → [${needLabel}] ${WHO[receiver]}은 ${r.shows} (${match ? "닿는 방식" : "다른 방식"})`);
    if (!match) {
      // 엇갈릴 때: 받는 사람이 크게 느끼는 방식으로 건네는 법(상대가 해 볼 것) + 건네는 사람의 마음을 알아봐 주는 법(받는 사람이 해 볼 것)
      suggestions.push(`${WHO[giver]}이 ${WHO[receiver]}에게 해 볼 수 있는 것: ${r.partnerCanTry}(건넬 말: "${r.sayToThem}")`);
      suggestions.push(`${WHO[receiver]}이 ${WHO[giver]}에게 해 볼 수 있는 것: ${g.partnerCanTry}(건넬 말: "${g.sayToThem}")`);
    }
  }
  const state = matches === 2 ? "둘 다 닿는 방식" : matches === 1 ? "한쪽 방향만 닿는 방식" : "두 방향 모두 다른 방식";
  const tail = [
    matches === 2 ? t.matchNote : t.gapNote,
    suggestions.length ? `읽는 순서: 두 사람의 차이 → 그 차이가 만드는 장면 → 서로가 해 볼 수 있는 것 → 같이 해 볼 행동. ${suggestions.join(" ")}` : "",
    `같이 해 볼 행동: ${t.together}.`,
    `붙이면 안 되는 결론: ${t.notThis.join(" · ")}.`,
  ].filter(Boolean);
  return {
    id: `pair.scene.${t.id}`,
    source: "survey",
    topics: ["love", "relationship"],
    strength: "moderate",
    fact: `${t.area} — ${lines.join(" / ")} → ${state} (각자 두 장면에 직접 고른 답을 비교, 점수 없음)`,
    cue: `${tail.join(" ")} ${LIMIT_CUE}`,
  };
}

function sameEvidence(t: CoupleThread, a: [CoupleOption, CoupleOption], b: [CoupleOption, CoupleOption]): Evidence {
  const lines: string[] = [];
  const suggestions: string[] = [];
  let same = 0;
  for (let i = 0; i < 2; i++) {
    const x = a[i];
    const y = b[i];
    const sameTag = x.tag === y.tag;
    if (sameTag) same++;
    lines.push(`[${COUPLE_SCENE_BY_ID[t.scenes[i]].label}] A님은 ${x.shows}, B님은 ${y.shows} (${sameTag ? "같은 방식" : "다른 방식"})`);
    if (!sameTag) {
      suggestions.push(`${WHO.a}이 ${WHO.b}에게 해 볼 수 있는 것: ${y.partnerCanTry}(건넬 말: "${y.sayToThem}")`);
      suggestions.push(`${WHO.b}이 ${WHO.a}에게 해 볼 수 있는 것: ${x.partnerCanTry}(건넬 말: "${x.sayToThem}")`);
    }
  }
  const state = same === 2 ? "두 장면 모두 같은 방식" : same === 1 ? "한 장면은 같고 한 장면은 다른 방식" : "두 장면 모두 다른 방식";
  const tail = [
    same === 2 ? t.matchNote : t.gapNote,
    suggestions.length ? `읽는 순서: 두 사람의 차이 → 그 차이가 만드는 장면 → 서로가 해 볼 수 있는 것 → 같이 해 볼 행동. ${suggestions.join(" ")}` : "",
    `같이 해 볼 행동: ${t.together}.`,
    `붙이면 안 되는 결론: ${t.notThis.join(" · ")}.`,
  ].filter(Boolean);
  return {
    id: `pair.scene.${t.id}`,
    source: "survey",
    topics: ["love", "relationship"],
    strength: "moderate",
    fact: `${t.area} — ${lines.join(" / ")} → ${state} (각자 두 장면에 직접 고른 답을 같은 장면끼리 비교, 점수 없음)`,
    cue: `${tail.join(" ")} ${LIMIT_CUE}`,
  };
}

/** 두 사람의 장면 답을 영역별로 비교한 근거 목록. 두 사람 모두 그 영역의 두 장면에 선택지로 답했을 때만 만든다 */
export function pairSceneEvidenceOf(a: CoupleAnswers, b: CoupleAnswers): PairSceneResult {
  const evidence: Evidence[] = [];
  const compared: string[] = [];
  const held: PairSceneResult["held"] = [];
  for (const t of COUPLE_THREADS) {
    const oa = optionsOf(t, a);
    const ob = optionsOf(t, b);
    if (!oa || !ob) {
      held.push({ thread: t.id, reason: "missing" });
      continue;
    }
    compared.push(t.id);
    evidence.push(t.kind === "cross" ? crossEvidence(t, oa, ob) : sameEvidence(t, oa, ob));
  }
  return { evidence, compared, held };
}
