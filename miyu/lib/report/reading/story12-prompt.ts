// 12개 고정 섹션 비교 시험용 지시문과 입력 — **제품에 연결하지 않았다**(story12.test.ts가 확인). 실제 서비스 AI에는 이 지시문을 보낸 적이 없고 앞으로도 운영자 승인 없이는 보내지 않는다.
// 목적은 하나다: "12개 장 구조가 같은 입력에서 반복을 줄이는가"를 시험용 대리 작성기(AI 하위 작업자, 실제 서비스 AI가 아님)로 한 건씩 비교하는 것.
// 구조와 무관한 규칙(사주를 읽는 범위 · 용어 · 근거 · 말투 · 없는 기운 읽기 · 방향 제시 · 쓰지 않는 것)은 지금 story-v1 지시문(STORY_SYSTEM_PROMPT)에서 그대로 가져오고, 장의 나눔에 관한 부분(모양 · 장마다 맡은 질문 · 구성과 분량 · 출력)만 새로 쓴다.
// 그대로 가져온 부분에서 "영역"은 "장"으로만 바꿨고, 구조 이름(areas · cards · flow · actions 등)을 가리키던 문장은 12개 장에 맞게 고쳤다(없는 칸을 가리키지 않도록).
import type { Evidence } from "../evidence.ts";
import { glossaryFor } from "../../saju/glossary.ts";
import { READING_LIMITS as L, TERM_LIMITS } from "./plan.ts";
import { FORMULA_BUDGET } from "./story-plan.ts";
import { STORY_SYSTEM_PROMPT } from "./story-prompt.ts";
import { periodRefs } from "./validate.ts";
import { assignPersonal, slotsOf12 } from "./story12-measure.ts";
import { STORY12_SECTIONS } from "./story12-plan.ts";

export const STORY12_PROMPT_VERSION = "story12-experiment-0.1";

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

const SHAPE12 = `[리포트의 모양 — 12개 고정 장, 장마다 다른 질문 하나에만 답한다]
- 이 리포트는 12개 장이 항상 모두 나온다(장을 빼거나 합치지 않는다). 그러나 12개 장을 길게 채우는 것이 목표가 아니다 — 각 장은 읽을 때 새로 이해되는 것이 하나는 있어야 하고, 근거가 적은 장은 짧아도 완결된 한 문단으로 끝낸다. 분량을 맞추려고 앞 장의 말을 다시 쓰지 않는다.
- 장은 두 종류다. owner 장(02 · 03 · 06 · 07 · 08 · 09 · 10 · 11)은 사용자 메시지에서 그 장에 배정된 근거(sajuEvidence · personalEvidence)로 그 장의 질문에만 답한다. synthesis 장(01 · 04 · 05 · 12)은 자기 근거가 없으므로 앞 장에서 이미 푼 내용을 요약하지 않고 mustAdd(새로 보태야 할 것)만 쓴다 — 보탤 것이 없으면 한 문단으로 짧게 쓴다(근거를 지어내지 않는다).
- 한 번 소개한 특징을 다시 설명하지 않는다. 01에서 소개한 특징과 03의 기질은 뒤 장에서 다시 풀지 않고, 그 장의 질문이 만드는 새 조건(어떤 장면 · 속도 · 상대)으로만 쓴다. 같은 장면 · 같은 낱말 · 같은 처방은 한 장에서만 자세히 쓴다. "강점 · 부담"이라는 판단은 05번 장에서만 하고 다른 장에서는 쓰지 않는다.
- 영역(장)의 맺음을 같은 틀로 되풀이하지 않는다. "~쪽이 맞아 보여요. 그래도 ~라면 ~볼 때예요"를 여러 장이 쓰면 글이 틀에 박힌다 — "맞아 보여요"는 리포트 전체에서 ${FORMULA_BUDGET[0].max}번까지, "~볼 때예요"는 ${FORMULA_BUDGET[1].max}번까지만 쓴다.
- 한 낱말(예: 정리 · 확인 · 혼자 · 거리)이 여러 장에 나오면 장마다 같은 이야기를 한 것으로 읽힌다 — 중심 낱말은 한 장에서만 중심으로 쓰고 다른 장은 그 장에서만 새로 알 수 있는 연결과 다른 낱말로 쓴다.
- 시기 이야기(대운 · 세운 · 올해 · 내년 · 연도)는 11번 장에만 쓴다. 다른 장에서는 시기를 말하지 않는다.
- "~해 보세요"처럼 과제를 내는 문장은 장마다 1개를 넘기지 않는다. 구체적인 실천은 12번 장의 actions 세 가지에 모은다.
- 근거가 약한 장은 늘려 쓰지 않는다. 약하면 확인해 볼 질문 한 문장으로 두고 문단 수를 최소로 한다. 작성 과정을 설명하는 문장("이번 분석에서는 ~하지 않았어요")은 쓰지 않는다.`;

const sectionLine = (s: (typeof STORY12_SECTIONS)[number]) =>
  `- ${String(s.no).padStart(2, "0")} ${s.title} (${s.kind}): 질문 — ${s.question}. 들어갈 것 — ${s.must}. 반복 방지 — ${s.repeatGuard}.${s.mustAdd ? ` 새로 보태야 할 것(mustAdd) — ${s.mustAdd}.` : ""}`;

const AREAS12 = `[장마다 맡은 질문]
${STORY12_SECTIONS.map(sectionLine).join("\n")}
- 01 유형 이름은 코드가 붙이므로 이 글에서 새 유형 이름을 만들지 않는다. 04는 이 입력에 "사람 앞에서의 행동"과 "혼자일 때의 반응"을 가르는 근거가 없다 — 근거가 없으면 한 문단으로 짧게 쓰고, "타인에게 보이는 모습"처럼 타인이 평가한 모습을 쓰지 않는다. 08은 신살(귀인)을 계산하지 않았으므로 "귀인이 있다 · 없다"를 쓰지 않는다. 10은 재성이 없다고 돈 관리가 약하다고 쓰지 않는다.`;

const COMPOSE12 = `[구성과 분량] — 글자 수는 공백을 포함한다.
- headline: 이번 리포트의 중심이 된 연결 한 문장 (${L.headline.min}~${L.headline.max}자, 이름을 쓰지 않는다). 유형 이름이 아니라 본문의 결론이다.
- sections: 사용자 메시지의 sections 순서대로 12개(no 1~12). 장마다 headline(그 장의 결론 한 문장, 8~34자) · paragraphs(owner 장 1~3문단, synthesis 장 1~2문단, 문단마다 60~380자 · 3문장 이하) · evidence(본문에서 실제로 쓴 근거 ID). 한 문단에 새로 설명하는 사주 용어는 ${TERM_LIMITS.perParagraphMax}개까지. 근거가 거의 없는 장은 한 문단이어도 된다.
- 12번 장에는 actions(3개)를 더한다: title(어떤 상황에서, 6~30자) · detail(그때 해 볼 작은 행동, 20~220자) · evidence. 서로 다른 앞 장 둘 이상에서 나온 서로 다른 행동으로 쓰고 시점이나 기간을 임의로 정하지 않는다. 12번 장의 문단은 "왜 이 순서인가"를 쓰고 앞 장을 다시 요약하지 않는다.
- 11번 장은 계산된 시기(periods)를 풀이하고 이 사람이 그 시기를 어떻게 받아들일지까지 쓴다. 연도 · 시나리오 표는 코드가 따로 채우므로 쓰지 않는다. periods 목록에 없는 해는 쓰지 않는다.`;

const OUTPUT12 = `[출력]
JSON 객체 하나만 출력한다. 설명 · 마크다운 · 코드 블록 없이.
{"headline": string, "sections": [{"no": 1~12, "headline": string, "paragraphs": [string], "evidence": [id]}], "actions": [{"title": string, "detail": string, "evidence": [id]}]}
(actions는 12번 장의 구체적 행동이며 sections 바깥에 둔다.)`;

/** 그대로 가져온 부분의 "영역" → "장", 그리고 없는 칸(areas · cards · flow · actions · 영역 이름)을 가리키던 문장을 12개 장에 맞게 고친다 */
function carried(text: string, edits: [string, string][] = []): string {
  return edit(text, edits).replaceAll("영역", "장");
}

const PERSONAL12 = carried(part("[개인 성향 자료"), [
  ["영역마다 그 영역과 맞닿는 개인 성향 근거(evidence의 topics, 사용자 메시지 areas[].personalEvidence 참고)를 연결하고 그 ID를 해당 영역의 evidence에 단다. 영역마다 다른 근거에서 출발한다 — 사용자 메시지의 areas[].personalEvidence는 코드가 영역마다 겹치지 않게 나눠 준 \"이 영역이 먼저 쓸 개인 근거\"다.", "그 장과 맞닿는 개인 성향 근거(evidence의 topics, 사용자 메시지 sections[].personalEvidence 참고)를 연결하고 그 ID를 해당 장의 evidence에 단다 — personalEvidence는 코드가 장마다 겹치지 않게 나눠 준 \"이 장이 먼저 쓸 개인 근거\"이고, 근거가 모자란 장은 다른 장의 근거를 빌려 받았을 수 있다(그 경우 앞 장과 다른 연결로만 쓴다)."],
  ["영역마다 그 영역의 근거(핵심: 기질 · 평소 행동 / 관계: 가까운 관계 반응 / 일: 정보 · 판단 · 생활 방식)가 만드는 다른 모습을 쓴다.", "장마다 그 장의 근거가 만드는 다른 모습을 쓴다."],
  ["핵심 · 가까운 관계 · 일과 재물 영역 가운데 두 곳 이상에서", "03 · 06 · 09번 장 가운데 두 곳 이상에서"],
  ["시기 영역(flow)에는 개인 성향 근거를 하나까지만 쓴다.", "11번 장에는 개인 성향 근거를 하나까지만 쓴다."],
]);

const EVIDENCE12 = carried(part("[근거]"), [
  ["- 영역(areas)마다 evidence 배열에 본문에서 실제로 쓴 근거 ID를 단다. 모든 영역에 사주 근거(source가 saju)를 하나 이상 넣고, 위 [개인 성향 자료] 규칙대로 개인 성향 근거를 연결한다.", "- 장(sections)마다 evidence 배열에 본문에서 실제로 쓴 근거 ID를 단다. owner 장은 배정된 사주 근거(sajuEvidence)를 하나 이상 넣고, synthesis 장(01 · 04 · 05 · 12)은 앞 장에서 이미 쓴 근거를 인용하더라도 앞 장과 다른 연결일 때만 달며 근거가 없으면 비워도 된다."],
]);

const RELATION_WORK12 = carried(part("[가까운 관계와 일과 재물"), [
  ["[가까운 관계와 일과 재물 영역을 쓸 때]", "[연애 · 애착 · 인간관계 · 일 · 재물 장(06~10)을 쓸 때]"],
  ["이 영역이나 actions 한 곳에는 실제로 건넬 수 있는 짧은 말 한 문장을 넣을 수 있다", "06 · 07번 장이나 12번 장 한 곳에는 실제로 건넬 수 있는 짧은 말 한 문장을 넣을 수 있다"],
  ["일과 재물 영역에는 돈 이야기가 1~2문장이라도 있어야 한다(검사가 확인한다)", "10번 재물 장에는 돈 이야기가 1~2문장이라도 있어야 한다"],
  ["일 영역에서 시기(올해 · 대운 · 연도)를 말하지 않는다 — 그것은 \"현재와 앞으로의 흐름\" 영역의 몫이다.", "11번 장 밖에서는 시기(올해 · 대운 · 연도)를 말하지 않는다."],
]);

const TITLES12 = carried(part("[제목은 풀이의 결론이다"), [
  ["맨 위 headline · 영역 headline · cards의 keyword는 풀이를 다 쓴 뒤", "맨 위 headline · 장 headline은 풀이를 다 쓴 뒤"],
  ["제목 · 카드 · 영역 첫 문단의 중심은", "제목 · 장 첫 문단의 중심은"],
  ["- 화면의 이름표(내가 강한 포인트 · 내가 힘들 수 있는 포인트)가 그렇더라도 cards의 note와 본문에는 \"단점\"이라고 쓰지 않는다.", "- 05번 장에서도 \"단점\"이라고 쓰지 않는다 — 강점이 부담으로 바뀌는 조건으로 쓴다."],
]);

export const STORY12_SYSTEM_PROMPT = [
  PARTS[0],
  part("[이 글이 해내야 하는 것"),
  SHAPE12,
  AREAS12,
  PERSONAL12.replace("제목(맨 위 headline · 장 headline · cards)", "제목(맨 위 headline · 장 headline)").replace("제목 · 카드 · 첫 문단은", "제목 · 첫 문단은"),
  EVIDENCE12,
  part("[사주를 읽는 범위"),
  part("[사주 용어"),
  part("[자료의 종류를 섞지 않는다]"),
  part("[원국에 \"없는\""),
  RELATION_WORK12,
  carried(part("[말투와 구체성]")),
  TITLES12,
  part("[방향을 제시한다"),
  part("[보완 아이템"),
  part("[쓰지 않는 것"),
  COMPOSE12,
  OUTPUT12,
].join("\n\n")
  .replace("headline · cards는", "headline은")
  .replace("제목이나 카드의 주제로", "제목의 주제로");

/** 12개 장 비교 시험의 사용자 메시지 — 장마다 배정된 근거(코드가 정함)와 근거 목록 전체 */
export function buildStory12UserMessage(evidence: Evidence[], referenceDate: string): string {
  const a = assignPersonal(evidence, slotsOf12());
  const saju = evidence.filter((e) => e.source === "saju" && !e.uncertain);
  const mbti = evidence.some((e) => e.id === "self.mbti") ? ["self.mbti"] : [];
  const payload = {
    referenceDate,
    terms: glossaryFor(evidence).map((g) => ({ term: g.term, plain: g.plain })),
    sections: STORY12_SECTIONS.map((s) => {
      const key = String(s.no).padStart(2, "0");
      return {
        no: s.no,
        title: s.title,
        kind: s.kind,
        question: s.question,
        ...(s.mustAdd ? { mustAdd: s.mustAdd } : {}),
        sajuEvidence: saju.filter((e) => s.sajuOwns.some((re) => re.test(e.id))).map((e) => e.id),
        personalEvidence: [...a.owned[key], ...a.borrowed[key], ...(a.mbti.includes(key) && [3, 6, 9].includes(s.no) ? mbti : [])],
      };
    }),
    periods: periodRefs(evidence).map((p) => ({ ref: p.ref, label: p.label, evidence: p.ids })),
    evidence: evidence.map((e) => ({ id: e.id, source: e.source, topics: e.topics, strength: e.strength, fact: e.fact, cue: e.cue, ...(e.period ? { period: e.period } : {}), ...(e.uncertain ? { uncertain: true } : {}) })),
  };
  return `다음 자료로 개인 심층 리포트(12개 고정 장) JSON을 써 주세요.\n${JSON.stringify(payload)}`;
}
