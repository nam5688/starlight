// 7개 대주제 비교 시험용 지시문과 입력 — **제품에 연결하지 않았다**(story7.test.ts가 확인). 실제 서비스 AI에는 이 지시문을 보낸 적이 없고 앞으로도 운영자 승인 없이는 보내지 않는다.
// 목적은 하나다: "7개 대주제 구조가 같은 입력에서 지금 story-v1보다 반복 · 근거 재사용 · 정보량이 어떤가"를 시험용 대리 작성기(AI 하위 작업자, 실제 서비스 AI가 아님)로 한 건씩 비교하는 것.
// 구조와 무관한 규칙(사주를 읽는 범위 · 용어 · 근거 · 말투 · 없는 기운 읽기 · 방향 제시 · 쓰지 않는 것)은 지금 story-v1 지시문(STORY_SYSTEM_PROMPT)에서 그대로 가져오고, 장의 나눔에 관한 부분(모양 · 장마다 맡은 질문 · 구성과 분량 · 출력)만 새로 쓴다.
// 그대로 가져온 부분에서 "영역"은 "장"으로만 바꿨고, 없는 칸(areas · cards · flow · actions · 영역 이름)을 가리키던 문장은 7개 대주제에 맞게 고쳤다.
import type { Evidence } from "../evidence.ts";
import { glossaryFor } from "../../saju/glossary.ts";
import { READING_LIMITS as L, TERM_LIMITS } from "./plan.ts";
import { FORMULA_BUDGET } from "./story-plan.ts";
import { STORY_SYSTEM_PROMPT } from "./story-prompt.ts";
import { periodRefs } from "./validate.ts";
import { assignPersonal, slotsOf7 } from "./story7-measure.ts";
import { STORY7_SECTIONS } from "./story7-plan.ts";

export const STORY7_PROMPT_VERSION = "story7-experiment-0.1";

const PARTS = STORY_SYSTEM_PROMPT.split(/\n\n(?=\[)/);
const part = (startsWith: string): string => {
  const found = PARTS.find((p) => p.startsWith(startsWith));
  if (!found) throw new Error(`story-v1 지시문에서 "${startsWith}" 부분을 찾지 못했습니다.`);
  return found;
};
const edit = (text: string, edits: [from: string, to: string][]): string =>
  edits.reduce((acc, [from, to]) => {
    if (!acc.includes(from)) throw new Error(`바꿀 문장을 찾지 못했습니다: ${from.slice(0, 40)}`);
    return acc.replace(from, to);
  }, text);

const SHAPE7 = `[리포트의 모양 — 7개 고정 대주제, 장마다 다른 질문 하나에만 답한다]
- 이 리포트는 7개 대주제가 항상 모두 나온다(장을 빼거나 합치지 않는다). 그러나 7개를 길게 채우는 것이 목표가 아니다 — 각 장은 읽을 때 새로 이해되는 것이 하나는 있어야 하고, 근거가 적은 장은 짧아도 완결된 한 문단으로 끝낸다. 분량을 맞추려고 앞 장의 말을 다시 쓰지 않는다. 장마다 문단 수 상한(maxParagraphs)이 있다.
- 장은 두 종류다. owner 장(1 · 3 · 4 · 5 · 6)은 사용자 메시지에서 그 장에 배정된 근거(sajuEvidence · personalEvidence)로 그 장의 질문에만 답한다. synthesis 장(2 · 7)은 자기 근거가 없으므로 앞 장에서 이미 푼 내용을 요약하지 않고 mustAdd(새로 보태야 할 것)만 쓴다 — 보탤 것이 없으면 한 문단으로 짧게 쓴다(근거를 지어내지 않는다).
- 한 번 소개한 특징을 다시 설명하지 않는다. 1번에서 소개한 특징은 뒤 장에서 다시 풀지 않고, 그 장의 질문이 만드는 새 조건(어떤 장면 · 속도 · 상대)으로만 쓴다. 같은 장면 · 같은 낱말 · 같은 처방은 한 장에서만 자세히 쓴다. "강점 · 부담"이라는 판단은 2번에서만 하고 다른 장에서는 쓰지 않는다.
- 장의 맺음을 같은 틀로 되풀이하지 않는다. "~쪽이 맞아 보여요. 그래도 ~라면 ~볼 때예요"를 여러 장이 쓰면 글이 틀에 박힌다 — "맞아 보여요"는 리포트 전체에서 ${FORMULA_BUDGET[0].max}번까지, "~볼 때예요"는 ${FORMULA_BUDGET[1].max}번까지만 쓴다. "계속 ~하다면 ~물어볼 차례예요 · 살펴보는 게 좋아요" 같은 변형도 같은 틀이므로 장마다 되풀이하지 않는다.
- 한 낱말(예: 정리 · 확인 · 혼자 · 거리)이 여러 장에 나오면 장마다 같은 이야기를 한 것으로 읽힌다 — 중심 낱말은 한 장에서만 중심으로 쓰고 다른 장은 그 장에서만 새로 알 수 있는 연결과 다른 낱말로 쓴다. "없는 기운은 전통 해석에서 생활에서 채우는 쪽을 권해요" 같은 풀이 틀은 리포트 전체에서 한 번만 쓴다.
- 시기 이야기(대운 · 세운 · 올해 · 내년 · 연도)는 6번 장에만 쓴다. 다른 장에서는 시기를 말하지 않는다.
- "~해 보세요"처럼 과제를 내는 문장은 장마다 1개를 넘기지 않는다. 구체적인 실천은 7번 장의 actions 2~3가지에 모은다.
- 근거가 약한 장은 늘려 쓰지 않는다. 약하면 확인해 볼 질문 한 문장으로 두고 문단 수를 최소로 한다. 근거가 없는 것을 있는 것처럼 결론 내리지 않는다. 작성 과정을 설명하는 문장("이번 분석에서는 ~하지 않았어요")은 쓰지 않는다.`;

const sectionLine = (s: (typeof STORY7_SECTIONS)[number]) =>
  `- ${s.no} ${s.title} (${s.kind}): 다루는 것 — ${s.includes.join(" · ")}. 질문 — ${s.question}. 반복 방지 — ${s.repeatGuard}.${s.parts ? ` 소제목 — ${s.parts.join(" · ")}(소제목마다 문단을 따로 쓴다).` : ""}${s.mustAdd ? ` 새로 보태야 할 것(mustAdd) — ${s.mustAdd}.` : ""} 문단은 ${s.maxParagraphs}개까지.`;

const AREAS7 = `[장마다 맡은 질문]
${STORY7_SECTIONS.map(sectionLine).join("\n")}
- 대표 유형 이름(OOO형)은 코드가 붙이므로 이 글에서 새 유형 이름을 만들지 않는다. 4번은 연애 밖의 사람들(친구 · 가족 · 동료)을 다루지만 가족 구성 · 가족과 있었던 일은 입력에 없으므로 쓰지 않고, 귀인 · 사람복은 계산하지 않았으므로 "귀인이 있다 · 없다"를 쓰지 않는다. 5번의 재물은 재성이 없다고 돈 관리가 약하다고 쓰지 않는다. 7번은 알려 준 고민(context)이 있으면 그 고민에 적용하고, 없으면 고민을 지어내지 않고 이 분석에서 읽힌 우선순위로 쓴다.`;

const COMPOSE7 = `[구성과 분량] — 글자 수는 공백을 포함한다.
- headline: 이번 리포트의 중심이 된 연결 한 문장 (${L.headline.min}~${L.headline.max}자, 이름을 쓰지 않는다). 유형 이름이 아니라 본문의 결론이다.
- sections: 사용자 메시지의 sections 순서대로 7개(no 1~7). 장마다 headline(그 장의 결론 한 문장, 8~34자) · 문단(한 문단은 60~380자 · 3문장 이하) · evidence(본문에서 실제로 쓴 근거 ID). 문단은 일반 장은 paragraphs로, 소제목이 있는 5번은 parts([{"title": "일", "paragraphs": [..]}, {"title": "재물", "paragraphs": [..]}])로 쓰고 소제목마다 1개 이상이다. 장마다 문단 수는 maxParagraphs 이하(근거가 거의 없는 장은 한 문단이어도 된다). 한 문단에 새로 설명하는 사주 용어는 ${TERM_LIMITS.perParagraphMax}개까지.
- 7번 장에는 actions(2~3개)를 더한다: title(어떤 상황에서, 6~30자) · detail(그때 해 볼 작은 행동, 20~220자) · evidence. 서로 다른 앞 장 둘 이상에서 나온 서로 다른 행동으로 쓰고 시점이나 기간을 임의로 정하지 않는다. 7번 장의 문단은 "왜 이 순서인가"를 쓰고 앞 장을 다시 요약하지 않는다.
- 6번 장은 계산된 시기(periods)를 풀이하고 이 사람이 그 시기를 어떻게 받아들일지까지 쓴다. 연도 · 시나리오 표는 코드가 따로 채우므로 쓰지 않는다. periods 목록에 없는 해는 쓰지 않는다.`;

const OUTPUT7 = `[출력]
JSON 객체 하나만 출력한다. 설명 · 마크다운 · 코드 블록 없이.
{"headline": string, "sections": [{"no": 1~7, "headline": string, "paragraphs": [string], "evidence": [id]}, ... (5번만 "paragraphs" 대신 "parts": [{"title": "일", "paragraphs": [string]}, {"title": "재물", "paragraphs": [string]}])], "actions": [{"title": string, "detail": string, "evidence": [id]}]}
(actions는 7번 장의 구체적 행동이며 sections 바깥에 둔다.)`;

/** 그대로 가져온 부분의 "영역" → "장", 그리고 없는 칸(areas · cards · flow · actions · 영역 이름)을 가리키던 문장을 7개 대주제에 맞게 고친다 */
function carried(text: string, edits: [string, string][] = []): string {
  return edit(text, edits).replaceAll("영역", "장");
}

const PERSONAL7 = carried(part("[개인 성향 자료"), [
  ["영역마다 그 영역과 맞닿는 개인 성향 근거(evidence의 topics, 사용자 메시지 areas[].personalEvidence 참고)를 연결하고 그 ID를 해당 영역의 evidence에 단다. 영역마다 다른 근거에서 출발한다 — 사용자 메시지의 areas[].personalEvidence는 코드가 영역마다 겹치지 않게 나눠 준 \"이 영역이 먼저 쓸 개인 근거\"다.", "그 장과 맞닿는 개인 성향 근거(evidence의 topics, 사용자 메시지 sections[].personalEvidence 참고)를 연결하고 그 ID를 해당 장의 evidence에 단다 — personalEvidence는 코드가 장마다 겹치지 않게 나눠 준 \"이 장이 먼저 쓸 개인 근거\"이고, 근거가 모자란 장은 다른 장의 근거를 빌려 받았을 수 있다(그 경우 앞 장과 다른 연결로만 쓴다)."],
  ["영역마다 그 영역의 근거(핵심: 기질 · 평소 행동 / 관계: 가까운 관계 반응 / 일: 정보 · 판단 · 생활 방식)가 만드는 다른 모습을 쓴다.", "장마다 그 장의 근거가 만드는 다른 모습을 쓴다."],
  ["핵심 · 가까운 관계 · 일과 재물 영역 가운데 두 곳 이상에서", "1 · 3 · 5번 장 가운데 두 곳 이상에서"],
  ["시기 영역(flow)에는 개인 성향 근거를 하나까지만 쓴다.", "6번 장에는 개인 성향 근거를 하나까지만 쓴다."],
]);

const EVIDENCE7 = carried(part("[근거]"), [
  ["- 영역(areas)마다 evidence 배열에 본문에서 실제로 쓴 근거 ID를 단다. 모든 영역에 사주 근거(source가 saju)를 하나 이상 넣고, 위 [개인 성향 자료] 규칙대로 개인 성향 근거를 연결한다.", "- 장(sections)마다 evidence 배열에 본문에서 실제로 쓴 근거 ID를 단다. owner 장은 배정된 사주 근거(sajuEvidence)를 하나 이상 넣고, synthesis 장(2 · 7)은 앞 장에서 이미 쓴 근거를 인용하더라도 앞 장과 다른 연결일 때만 달며 근거가 없으면 비워도 된다."],
]);

const RELATION_WORK7 = carried(part("[가까운 관계와 일과 재물"), [
  ["[가까운 관계와 일과 재물 영역을 쓸 때]", "[연애와 애착 · 인간관계 · 일과 재물 장(3 · 4 · 5번)을 쓸 때]"],
  ["이 영역이나 actions 한 곳에는 실제로 건넬 수 있는 짧은 말 한 문장을 넣을 수 있다", "3번 장이나 7번 장 한 곳에는 실제로 건넬 수 있는 짧은 말 한 문장을 넣을 수 있다"],
  ["일과 재물 영역에는 돈 이야기가 1~2문장이라도 있어야 한다(검사가 확인한다)", "5번 장의 재물 소제목에는 돈 이야기가 1~2문장이라도 있어야 한다"],
  ["일 영역에서 시기(올해 · 대운 · 연도)를 말하지 않는다 — 그것은 \"현재와 앞으로의 흐름\" 영역의 몫이다.", "6번 장 밖에서는 시기(올해 · 대운 · 연도)를 말하지 않는다."],
]);

const TITLES7 = carried(part("[제목은 풀이의 결론이다"), [
  ["맨 위 headline · 영역 headline · cards의 keyword는 풀이를 다 쓴 뒤", "맨 위 headline · 장 headline은 풀이를 다 쓴 뒤"],
  ["제목 · 카드 · 영역 첫 문단의 중심은", "제목 · 장 첫 문단의 중심은"],
  ["- 화면의 이름표(내가 강한 포인트 · 내가 힘들 수 있는 포인트)가 그렇더라도 cards의 note와 본문에는 \"단점\"이라고 쓰지 않는다.", "- 2번 장에서도 \"단점\"이라고 쓰지 않는다 — 강점이 부담으로 바뀌는 조건으로 쓴다."],
]);

export const STORY7_SYSTEM_PROMPT = [
  PARTS[0],
  part("[이 글이 해내야 하는 것"),
  SHAPE7,
  AREAS7,
  PERSONAL7.replace("제목(맨 위 headline · 장 headline · cards)", "제목(맨 위 headline · 장 headline)").replace("제목 · 카드 · 첫 문단은", "제목 · 첫 문단은"),
  EVIDENCE7,
  part("[사주를 읽는 범위"),
  part("[사주 용어"),
  part("[자료의 종류를 섞지 않는다]"),
  part("[원국에 \"없는\""),
  RELATION_WORK7,
  carried(part("[말투와 구체성]")),
  TITLES7,
  part("[방향을 제시한다"),
  part("[보완 아이템"),
  part("[쓰지 않는 것"),
  COMPOSE7,
  OUTPUT7,
]
  .join("\n\n")
  .replace("headline · cards는", "headline은")
  .replace("제목이나 카드의 주제로", "제목의 주제로");

/** 7개 대주제 비교 시험의 사용자 메시지 — 장마다 배정된 근거(코드가 정함)와 근거 목록 전체. 고민(context)은 넣지 않는다(지금 화면에 입력 경로가 없다) */
export function buildStory7UserMessage(evidence: Evidence[], referenceDate: string): string {
  const a = assignPersonal(evidence, slotsOf7());
  const saju = evidence.filter((e) => e.source === "saju" && !e.uncertain);
  const mbti = evidence.some((e) => e.id === "self.mbti") ? ["self.mbti"] : [];
  const payload = {
    referenceDate,
    terms: glossaryFor(evidence).map((g) => ({ term: g.term, plain: g.plain })),
    sections: STORY7_SECTIONS.map((s) => {
      const key = String(s.no);
      return {
        no: s.no,
        title: s.title,
        kind: s.kind,
        includes: s.includes,
        question: s.question,
        maxParagraphs: s.maxParagraphs,
        ...(s.parts ? { parts: s.parts } : {}),
        ...(s.mustAdd ? { mustAdd: s.mustAdd } : {}),
        sajuEvidence: saju.filter((e) => s.sajuOwns.some((re) => re.test(e.id))).map((e) => e.id),
        personalEvidence: [...a.owned[key], ...a.borrowed[key], ...([1, 3, 5].includes(s.no) ? mbti : [])],
      };
    }),
    periods: periodRefs(evidence).map((p) => ({ ref: p.ref, label: p.label, evidence: p.ids })),
    evidence: evidence.map((e) => ({ id: e.id, source: e.source, topics: e.topics, strength: e.strength, fact: e.fact, cue: e.cue, ...(e.period ? { period: e.period } : {}), ...(e.uncertain ? { uncertain: true } : {}) })),
  };
  return `다음 자료로 개인 심층 리포트(7개 고정 대주제) JSON을 써 주세요.\n${JSON.stringify(payload)}`;
}
