// 사주 궁합 · 리포트 궁합 리포트(AI 초안)의 형식 검사 — 근거 ID · 글자와 문장 수 · 7개 대주제 순서(사주 궁합은 6번 view를 뺀 여섯 장) · 장마다 맡은 근거(오행 분포 · 시기 · 응답 비교 · 개운) · 행동 셋 묶음 · 추천 질문 · 쉬운 말 · 금지 표현 · 두 사람을 지어내지 않기.
// 이전 읽기 구조와 같은 글 규칙(textIssues)을 쓰고, 궁합에서만 필요한 확인(관계 판정 · 속마음 · 관계 종류 단정 · 시기 이야기는 5번 장에서만)을 더한다.
// 2026-10-17 운영자 확정: 전통 해석 · 개운법은 허용하고 보장하는 말만 막는다 · 명리 풀이를 위해 용어 한도를 넓혔다 · **반복은 낱말 횟수 · 구절 되풀이만으로 저장을 막지 않는다**(같은 구절 · 같은 말로 여는 문단은 읽기 전 지표로만 보고, 새 정보 없이 결론을 되풀이하는지는 사람이 읽고 판단한다).
// 출생 시각을 모르는 사람이 있으면(근거 compat.chart에 "세 기둥(시주 제외)") 오행 · 십성의 없음 · 적음은 범위를 밝히게 하고 시주 풀이(자녀 · 말년) · 신강/신약은 막는다(reading/hour-scope.ts).
// 한계: 낱말 · 길이 · 표지를 센 어림이다. 말을 바꿔 쓴 속마음 단정 · 관계의 좋고 나쁨 판정은 못 찾는다 — 지시문(prompt.ts)과 사람이 읽는 평가가 본다. 좋은 글의 보증이 아니다.
import { relationshipIssues, type CompatRelationship } from "../../compat/relationship.ts";
import { compatFortifyElementsOf, compatFortifyHasTie } from "../../saju/interpret/compat-extra.ts";
import { FORTIFY_TIE_VERDICT, fortuneMentions } from "../../saju/interpret/fortune.ts";
import type { Evidence } from "../evidence.ts";
import { familyPastErrors, hourUnknownErrors } from "../reading/hour-scope.ts";
import { ADVICE_RULES_TRADITIONAL } from "../reading/plan.ts";
import { findRepeatedPhrasesIn, type RepeatedPhrase } from "../reading/repeat.ts";
import { customerVoiceLeaks } from "../reading/customer-voice.ts";
import { distinctTerms } from "../reading/terms.ts";
import { splitWarnings } from "../reading/warn-policy.ts";
import { checkVoice, voiceErrors } from "../style/voice.ts";
import { allowedYearsOf, countSentences, textIssues } from "../reading/validate.ts";
import { COMPAT_LIMITS as L, COMPAT_STEP_GROUPS, hasPairResponseEvidence, hasTimingEvidence, pairSectionsFor, sectionsFor } from "./plan.ts";
import type { CompatDraftV1 } from "./types.ts";

/**
 * 검사 결과 — errors는 BLOCK(저장하지 않고 고쳐 쓰게 한다), warnings는 WARN(설명 없는 용어 · 용어 개수 · 문단 문장 수 — 저장을 막지 않고 고쳐 쓰기도 부탁하지 않으며 글은 그대로 둔다, 운영자 정책 2026-10-17).
 * ok는 BLOCK이 없다는 뜻이고 경고가 있어도 ok일 수 있다 — 통과가 유료 판매 합격은 아니다.
 */
export type CompatValidation = { ok: true; draft: CompatDraftV1; repeats: RepeatedPhrase[]; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] };

const isString = (v: unknown): v is string => typeof v === "string";
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

/** 두 사람을 "A님 · B님"으로만 부른다 — 글자 하나 "A"나 "B"로 부르거나 이름을 지어 쓰지 않는다 */
const BARE_LETTER = /(?<![A-Za-z가-힣])[AB](?![A-Za-z]|님)/;

/** 관계의 좋고 나쁨 판정 · 운명 단정 — 궁합은 어떤 장면에서 어떻게 달라지는지만 쓴다 */
const VERDICT = /천생연분|천생배필|운명의\s*(?:상대|짝|인연)|맞지\s*않는\s*궁합|안\s*맞는\s*궁합|궁합이\s*(?:나쁘|좋지\s*않|안\s*좋|최고|최악)|(?:최고|최악)의\s*궁합|헤어질\s*(?:수밖에|운명|거예요|겁니다)|이어질\s*운명|오래\s*못\s*(?:가|갈)/;

/** 두 사람 가운데 한 사람의 속마음 · 감정을 아는 것처럼 쓰는 표현 */
const INNER_MIND = /[AB]님(?:은|는|이|도)?\s*(?:사실은?|속으로|마음속(?:으로)?|속마음)|(?:속마음|속으로는)[^.!?]{0,20}[AB]님|[AB]님(?:은|는|이)?\s*[^.!?]{0,16}(?:좋아하(?:고 있|는 것 같|지 않)|사랑하(?:고 있|지 않)|싫어하(?:고 있|는 것 같)|마음이\s*식)/;

/** 두 사람의 관계 종류를 아는 것처럼 쓰는 낱말 — 연인인지 부부인지 친구인지 모른다 */
const RELATION_KIND = /남편|아내|남자\s*친구|여자\s*친구|남친|여친|애인/;

/** 두 사람의 시기 이야기 — 시기 근거(compat.timing.*)가 없거나 5번 장(love)이 아닌 곳에서는 쓰지 않는다 */
const TIMING_TALK = /올해|내년|작년|내후년|(?<![가-힣\d])\d{1,2}\s*월(?![가-힣]*\s*생)|대운|세운|(?:관계|인연)이\s*(?:깊어지|좋아지|나빠지|풀리)는\s*(?:때|시기|해|달)/;
/** 5번 장의 시기 문단 안에서도 계산하지 않은 것 — 내년 · 달 · 관계가 좋아지거나 나빠지는 때 · 두 시기가 맞물리는 해 · 추천 날짜 · "좋은 시기 / 나쁜 시기" */
const TIMING_NOT_COMPUTED = /내년|작년|내후년|(?<![가-힣\d])\d{1,2}\s*월(?![가-힣]*\s*생)|(?:관계|인연)이\s*(?:깊어지|좋아지|나빠지|풀리)는\s*(?:때|시기|해|달)|맞물리는\s*(?:해|때|시기)|겹치는\s*해|추천\s*(?:날짜|하는\s*날)|(?:좋은|나쁜|안\s*좋은)\s*(?:시기|해|때)/;
/**
 * 두 사람의 시기에 좋고 나쁨을 매기는 말 — 시기 문단은 두 사람의 시기 "주제"가 겹치는지 다른지만 쓴다. 어느 한쪽의 시기가 좋다 · 나쁘다, 한쪽이 더 낫다, 운이 풀린다는 계산하지 않았다.
 * (실제 AI 첫 시험 전에 대리 작성기 글의 반복 · 시기 풀이를 점검하며 더했다 — 사후 수정이고 새 글이 통과한다는 증거가 아니다)
 */
export const TIMING_VERDICT = /시기(?:가|는|도)\s*(?:더\s*)?(?:좋|나쁘|안\s*좋|유리|불리)|(?:운이|운세가|흐름이)\s*(?:좋|나쁘|트이|막히|풀리)|[AB]님(?:의|은|이)?\s*(?:시기|대운|세운)(?:가|는)?[^.!?]{0,14}(?:보다|더)\s*(?:좋|나|유리|앞서|빠르)|(?:막히|풀리|트이)는\s*(?:시기|때|해)/;

/**
 * 입력받지 않은 구체적인 사건을 아는 사실처럼 쓰는 문장 — 두 사람이 다퉜다 · 헤어졌다 · 처음 만났다처럼 지나간 사건을 단정하는 말.
 * "~했던 때가 있었을 거예요 · ~할 수 있어요 · ~기 쉬워요"처럼 조건 · 추측으로 쓴 공감은 막지 않는다(문장에 그런 표지가 있으면 통과).
 */
const EVENT_STEM = /처음\s*만났|처음\s*만난|다퉜|다투었|싸웠|싸운\s*(?:적|뒤|후)|헤어졌|헤어진\s*(?:적|뒤|후)|이별했|재결합|재회했|사귀었|사귀고\s*있|사귀는\s*(?:중|사이)|결혼했|결혼한\s*(?:사이|지)|동거했|동거하고|고백했|연락이\s*끊|바람을\s*피|외도|이혼했|임신했|출산했|화해했|상처받았|참아\s*왔|참아왔/;
const HEDGED = /수\s*있|기\s*쉬|있었을\s*(?:거|수)|[ㄹ을]\s*수도|일\s*수도|(?:이|가)\s*있다면|다면|라면|면\s*[^.!?]{0,12}(?:어요|해요)|거예요|것\s*같|(?:읽혀|보여)요/;
/**
 * rel은 사용자가 직접 알려 준 사이다 — 그 사이를 말하는 것은 지어낸 사건이 아니므로 허용한다(결혼함 → "결혼한 사이", 연인 → "사귀고 있"). 다른 사이의 사건은 그대로 막는다
 */
export function unfoundedEventIn(text: string, rel?: CompatRelationship | null): string | null {
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const m = EVENT_STEM.exec(sentence);
    if (!m || HEDGED.test(sentence)) continue;
    if (rel === "married" && /^결혼했|^결혼한/.test(m[0])) continue;
    if (rel === "lover" && /^사귀고\s*있|^사귀는/.test(m[0])) continue;
    return m[0];
  }
  return null;
}

/** 같은 구절이 서로 다른 글 조각에 되풀이되는 것의 읽기 전 지표 기준(12자 이상 같은 토막, repeat.ts) — 2026-10-17부터 저장을 막지 않고 보고만 한다 */
export const COMPAT_REPEAT_MAX = 2;
/** 문단이 같은 다섯 글자로 시작하는 것을 몇 개 문단까지 봐줄까 — 읽기 전 지표 기준이며 저장을 막지 않는다(장이 일곱이라 넓혔다) */
export const COMPAT_OPENER_MAX = 4;
const norm = (t: string) => t.replace(/^\s*\[[^\]]*\]/, "").replace(/[\s.,!?·'"“”‘’()\-]/g, "");
/** 리포트 궁합: 근거(pair.*)에 적힌 "응답에서 나타난 경향" 풀이 문구를 글에 그대로 옮긴 곳 — 띄어쓰기를 뺀 연속 글자 수 */
export const PAIR_MEANING_RUN = 12;
/** 이 수까지의 옮김은 허용한다(한 번쯤 닮은 구절이 나오는 것은 자연스럽다) — 넘으면 응답을 그대로 읽어 주는 글로 보고 고쳐 쓰게 한다 */
export const PAIR_MEANING_ECHO_MAX = 1;

const squash = (t: string) => t.replace(/[\s"'“”‘’.,·]/g, "");

/**
 * 두 사람의 응답 비교 근거(pair.*)에서 A님 · B님의 "경향" 풀이 문구를 꺼내, 글 조각이 그 문구를 연속 PAIR_MEANING_RUN글자 이상 그대로 담았는지 센다.
 * 응답을 재진술한 글(근거의 문구를 말투만 바꿔 옮긴 글)을 찾는 어림이다 — 말을 바꿔 다시 쓴 재진술은 못 찾으므로 사람이 읽는 평가가 따로 본다.
 */
export function echoedMeaningsIn(texts: { where: string; text: string }[], evidence: Evidence[]): { where: string; run: string }[] {
  const meanings: string[] = [];
  for (const e of evidence) {
    if (!e.id.startsWith("pair.") || e.id === "pair.mbti") continue;
    const m = /경향은 "([^"]+)", B님은 "([^"]+)"/.exec(e.fact);
    if (m) meanings.push(squash(m[1]!), squash(m[2]!));
  }
  const found: { where: string; run: string }[] = [];
  for (const { where, text } of texts) {
    const t = squash(text);
    for (const m of meanings) {
      let hit: string | null = null;
      for (let i = 0; i + PAIR_MEANING_RUN <= m.length; i++) {
        const run = m.slice(i, i + PAIR_MEANING_RUN);
        if (t.includes(run)) {
          hit = run;
          break;
        }
      }
      if (hit) {
        found.push({ where, run: hit });
        break;
      }
    }
  }
  return found;
}

export function repeatedOpeners(texts: { where: string; text: string }[]): { opener: string; count: number }[] {
  const count = new Map<string, number>();
  for (const { where, text } of texts) if (/paragraphs\[/.test(where)) count.set(norm(text).slice(0, 5), (count.get(norm(text).slice(0, 5)) ?? 0) + 1);
  return [...count].filter(([k, n]) => k.length === 5 && n > COMPAT_OPENER_MAX).map(([opener, n]) => ({ opener, count: n }));
}

/** 건넬 말(say)은 따옴표로 감싸지 않는다(화면이 따옴표를 붙인다) */
const QUOTE_WRAP = /["“”‘’「」『』]/;

/**
 * 쓸 수 있는 연도 — 근거의 기간(period) 양 끝 + 시기 근거(compat.timing.*)의 사실 문장에 적힌 연-월의 연도.
 * 시기 근거의 period는 두 사람의 대운을 합친 범위라서 한 사람의 시작 · 끝 연도(예: A님 2024~2034, B님 2021~2031의 2024 · 2031)가 빠진다 — 근거 문장에 적힌 연도는 계산된 값이므로 허용한다.
 * (실제 대리 작성기 글이 근거에 적힌 연도를 그대로 쓰고도 걸린 뒤에 고친 사후 수정이다 — 새 글이 통과한다는 증거가 아니다.)
 */
export function compatAllowedYears(evidence: Evidence[]): Set<string> {
  const years = allowedYearsOf(evidence);
  for (const e of evidence) if (e.id.startsWith("compat.timing.")) for (const m of e.fact.matchAll(/(?<!\d)(20\d{2})-\d{2}/g)) years.add(m[1]);
  return years;
}

/** 화면에 그대로 보이는 글을 위치와 함께 모은다 (근거 ID는 제외) */
export function visibleCompatTexts(d: CompatDraftV1): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const push = (where: string, text: unknown) => {
    if (isString(text) && text.trim()) out.push({ where, text });
  };
  push("headline", d.headline);
  for (const s of d.sections ?? []) {
    push(`sections.${s?.id}.headline`, s?.headline);
    (s?.paragraphs ?? []).forEach((t, i) => push(`sections.${s?.id}.paragraphs[${i}]`, t));
  }
  for (const g of COMPAT_STEP_GROUPS) {
    const list = d.steps?.[g.id];
    (Array.isArray(list) ? list : []).forEach((a, i) => push(`steps.${g.id}[${i}]`, `${a?.title ?? ""} ${a?.detail ?? ""} ${a?.say ?? ""}`));
  }
  (Array.isArray(d.questions) ? d.questions : []).forEach((q, i) => push(`questions[${i}]`, q));
  return out;
}

/** 리포트 궁합에서 응답을 읽어 주는 말 — 두 사람의 원래 답을 옮기는 표현만 막는다("같은 쪽으로 답한" 같은 영역 수준 말은 허용) */
const PAIR_ECHO = /[라다]고 (?:답|응답)|(?:답|응답)하셨|(?:답|응답)(?:했|하셨)(?:으므로|기에|기 때문)|문항(?:에서|에는|에 )|검사 결과|고르(?:셨|신)|선택(?:하셨|한 답)/;
/** 애착 유형 이름 — 가까운 관계 반응은 어떤 장면에서 나타나는지로만 쓴다(단정 금지) */
const ATTACHMENT_TYPE = /(?:안정|불안|회피|혼란)\s*(?:형|애착)|애착\s*유형|(?:불안|회피)(?:형|적)\s*(?:인|사람|성향)/;

export type CompatValidateOptions = {
  /** 리포트 궁합 — 영역에 응답(response)이 더해지고(비교 근거가 있을 때) 응답을 읽어 주는 말 검사가 달라진다 */
  pair?: boolean;
  /** 사용자가 알려 준 두 사람의 사이 — 있으면 그 사이에 맞지 않는 말(친구 · 기타의 연애 · 결혼 이야기, 썸의 마음 확정, 결혼 사이의 앞날 보장 등)을 막는다. 없으면 예전 검사 그대로 */
  relationship?: CompatRelationship | null;
};

export function validateCompatDraft(raw: unknown, evidence: Evidence[], opts: CompatValidateOptions = {}): CompatValidation {
  const errors: string[] = [];
  const d = raw as Partial<CompatDraftV1> | null;
  if (!d || typeof d !== "object") return { ok: false, errors: ["JSON 객체가 아닙니다."], warnings: [] };
  const known = new Map(evidence.map((e) => [e.id, e]));

  const text = (v: unknown, where: string, min: number, max: number): v is string => {
    if (!isString(v)) {
      errors.push(`${where}: 글이 없습니다.`);
      return false;
    }
    const len = v.trim().length;
    if (len < min || len > max) errors.push(`${where}: 길이 ${len}자 (${min}~${max}자)`);
    return true;
  };
  const ids = (v: unknown, where: string) => {
    if (!isIds(v) || v.length === 0) {
      errors.push(`${where}: 근거 ID가 없습니다.`);
      return;
    }
    for (const id of v) if (!known.has(id)) errors.push(`${where}: 없는 근거 ID ${id}`);
    if (v.every((id) => known.get(id)?.uncertain)) errors.push(`${where}: 확실하지 않은 근거만으로 해석했습니다.`);
  };

  text(d.headline, "headline", L.headline.min, L.headline.max);

  // 7개 대주제가 정해진 순서로 모두 있어야 한다 — 사주 궁합은 6번(view)을 뺀 여섯 장, 리포트 궁합은 일곱 장
  const pair = opts.pair === true;
  const expected = pair ? pairSectionsFor(evidence) : sectionsFor(evidence);
  const sections = Array.isArray(d.sections) ? d.sections : [];
  if (!Array.isArray(d.sections)) errors.push("sections: 목록이 아닙니다.");
  else if (sections.length !== expected.length || expected.some((p, i) => sections[i]?.id !== p.id)) errors.push(`sections: ${expected.map((s) => s.id).join(" · ")} 순서로 ${expected.length}개를 모두 써야 합니다(장을 빼거나 합치지 않습니다).`);
  const reuse = new Map<string, Set<string>>();
  for (const plan of expected) {
    const s = sections.find((x) => x?.id === plan.id);
    if (!s) continue;
    const where = `sections.${plan.id}`;
    text(s.headline, `${where}.headline`, L.sectionHeadline.min, L.sectionHeadline.max);
    const ps = Array.isArray(s.paragraphs) ? s.paragraphs : [];
    if (!Array.isArray(s.paragraphs) || ps.length < plan.paragraphs.min || ps.length > plan.paragraphs.max) errors.push(`${where}.paragraphs: ${ps.length}문단 (${plan.paragraphs.min}~${plan.paragraphs.max}문단)`);
    ps.forEach((p, i) => {
      if (!text(p, `${where}.paragraphs[${i}]`, L.paragraph.min, L.paragraph.max)) return;
      const n = countSentences(p);
      if (n > L.paragraph.sentencesMax) errors.push(`${where}.paragraphs[${i}]: ${n}문장 (${L.paragraph.sentencesMax}문장 이하로 묶어 주세요)`);
      const terms = distinctTerms(p);
      if (terms.length > L.terms.perParagraphMax) errors.push(`${where}.paragraphs[${i}]: 한 문단에 사주 용어가 ${terms.length}개(${terms.join(" · ")}) — ${L.terms.perParagraphMax}개까지만 쓰고 나머지는 쉬운 말로 바꾸세요.`);
      if (i === 0 && terms.length > L.terms.firstParagraphMax) errors.push(`${where}.paragraphs[0]: 첫 문단에 사주 용어(${terms.join(" · ")})가 ${terms.length}개 — 두 사람이 함께 있는 장면부터 쓰고 용어는 ${L.terms.firstParagraphMax}개까지만, 나머지는 둘째 문단부터 풀이와 함께 쓰세요.`);
    });
    ids(s.evidence, `${where}.evidence`);
    const cited = isIds(s.evidence) ? s.evidence : [];
    const usable = (id: string) => evidence.some((e) => e.id === id && !e.uncertain);
    if (plan.id === "harmony" && usable("compat.chart") && !cited.includes("compat.chart")) errors.push(`${where}.evidence: 오행 조화 장은 두 사람의 오행 분포 근거(compat.chart)를 써야 합니다.`);
    if (plan.id === "love" && hasTimingEvidence(evidence) && !cited.some((id) => id.startsWith("compat.timing."))) errors.push(`${where}.evidence: 근거 목록에 시기(compat.timing.*)가 있으면 5번 장이 마지막 문단으로 쓰고 그 근거를 달아야 합니다.`);
    if (plan.id === "view" && hasPairResponseEvidence(evidence) && !cited.some((id) => id.startsWith("pair.") && id !== "pair.mbti")) errors.push(`${where}.evidence: 6번 장은 두 사람의 응답을 비교한 근거(pair.*, 입력한 MBTI 비교만은 안 됩니다)를 하나 이상 써야 합니다.`);
    if (plan.id === "advice" && usable("compat.fortify")) {
      if (!cited.includes("compat.fortify")) errors.push(`${where}.evidence: 개운 풀이의 근거(compat.fortify)를 달아 주세요.`);
      // 개운(방향 · 색 · 숫자 · 장소)은 근거에 적힌 보완 후보 기운의 전통 대응을 말해야 한다 — 임의로 다른 기운을 배정하지 않는다
      const elements = compatFortifyElementsOf(evidence);
      const body = ps.filter(isString).join("\n");
      const kinds = { 방향: false, 색: false, 숫자: false, 장소: false };
      for (const el of elements) {
        const m = fortuneMentions(body, el);
        kinds.방향 ||= m.direction;
        kinds.색 ||= m.color;
        kinds.숫자 ||= m.number;
        kinds.장소 ||= m.place;
      }
      const said = Object.values(kinds).filter(Boolean).length;
      if (elements.length > 0 && said < 3) errors.push(`${where}: 개운 풀이에서 방향 · 색 · 숫자 · 장소 가운데 ${said}개만 말했습니다 — 근거(compat.fortify)에 적힌 보완 후보 기운(${elements.join(" · ")})의 대응을 셋 이상 그대로 쓰세요(빠진 것: ${Object.entries(kinds).filter(([, v]) => !v).map(([k]) => k).join(" · ")}).`);
      if (compatFortifyHasTie(evidence)) {
        const verdict = FORTIFY_TIE_VERDICT.exec(body);
        if (verdict) errors.push(`${where}: 보완 후보 가운데 개수가 같은 동점 후보가 있어 "${verdict[0]}"처럼 하나를 먼저 · 가장 필요한 기운으로 정해 말할 수 없어요 — 같은 무게의 후보로 소개하세요(근거 compat.fortify에 적혀 있어요).`);
      }
    }
    if (isIds(s.evidence)) for (const id of new Set(s.evidence)) reuse.set(id, (reuse.get(id) ?? new Set()).add(plan.id));
  }
  for (const [id, where] of reuse) if (where.size > L.evidenceReuseMax) errors.push(`근거 ${id}를 ${where.size}개 영역(${[...where].join(" · ")})이 씁니다 — ${L.evidenceReuseMax}개 영역까지만. 영역마다 다른 근거의 연결을 앞세우세요.`);

  // 행동 — A님이 B님에게 · B님이 A님에게 · 함께, 묶음마다 1~2개, 건넬 말 한 문장 포함
  const steps = d.steps && typeof d.steps === "object" ? d.steps : null;
  if (!steps) errors.push("steps: aToB · bToA · together가 없습니다.");
  const stepDetails: string[] = [];
  const stepSays: string[] = [];
  for (const g of COMPAT_STEP_GROUPS) {
    const list = steps ? (steps as Record<string, unknown>)[g.id] : undefined;
    if (!Array.isArray(list) || list.length < L.steps.perGroup.min || list.length > L.steps.perGroup.max) {
      errors.push(`steps.${g.id}: ${Array.isArray(list) ? list.length : 0}개 (${L.steps.perGroup.min}~${L.steps.perGroup.max}개)`);
      continue;
    }
    list.forEach((a, i) => {
      const where = `steps.${g.id}[${i}]`;
      text(a?.title, `${where}.title`, L.steps.titleMin, L.steps.titleMax);
      text(a?.detail, `${where}.detail`, L.steps.detailMin, L.steps.detailMax);
      if (text(a?.say, `${where}.say`, L.steps.sayMin, L.steps.sayMax)) {
        if (QUOTE_WRAP.test(a.say)) errors.push(`${where}.say: 건넬 말은 따옴표로 감싸지 않습니다(화면이 붙입니다).`);
        if (countSentences(a.say) > 2) errors.push(`${where}.say: 건넬 말은 짧은 한 문장으로 씁니다.`);
        stepSays.push(a.say.trim());
      }
      if (isString(a?.detail)) stepDetails.push(a.detail.trim());
      ids(a?.evidence, `${where}.evidence`);
    });
  }
  if (new Set(stepDetails).size < stepDetails.length) errors.push("steps: 같은 행동 문장이 되풀이됩니다 — 묶음마다 서로 다른 상황의 서로 다른 행동으로 쓰세요.");
  if (new Set(stepSays).size < stepSays.length) errors.push("steps: 같은 건넬 말이 되풀이됩니다.");

  // 추천 질문 — 서로에게 물어보면 좋은 질문 2~3개(물음표로 끝, 속마음 단정은 아래 글 규칙이 막는다)
  const questions = Array.isArray(d.questions) ? d.questions : null;
  if (!questions || questions.length < L.questions.min || questions.length > L.questions.max) errors.push(`questions: ${questions ? questions.length : 0}개 (${L.questions.min}~${L.questions.max}개)`);
  else {
    questions.forEach((q, i) => {
      const where = `questions[${i}]`;
      if (text(q, where, L.questions.textMin, L.questions.textMax)) {
        if (!/[?？]\s*$/.test(q.trim())) errors.push(`${where}: 추천 질문은 물음표로 끝나는 질문 한 문장으로 씁니다.`);
        if (QUOTE_WRAP.test(q)) errors.push(`${where}: 따옴표로 감싸지 않습니다.`);
      }
    });
    if (new Set(questions.filter(isString).map((q) => q.trim())).size < questions.length) errors.push("questions: 같은 질문이 되풀이됩니다.");
  }

  // 글 규칙 — 이전 읽기 구조와 같은 검사 + 궁합에서만 필요한 검사
  const texts = visibleCompatTexts(d as CompatDraftV1);
  errors.push(...textIssues(texts, evidence, { allowedYears: compatAllowedYears(evidence), hasContext: false, adviceRules: ADVICE_RULES_TRADITIONAL, perSentenceMax: L.terms.perSentenceMax, ...(pair ? { echo: PAIR_ECHO } : {}) }));
  // 가족에게 있었던 일을 지난 사실처럼 쓰지 않는다 · 출생 시각을 모르는 사람이 있으면 세 기둥 기준 범위 · 시주 풀이 · 신강/신약 금지(reading/hour-scope.ts)
  errors.push(...familyPastErrors(texts));
  // (compat.chart가 절기 · 경계로 uncertain이어도 시각을 모른다는 사실은 그대로이므로 uncertain 여부와 상관없이 본다)
  if (evidence.some((e) => e.id === "compat.chart" && /세 기둥\(시주 제외\)/.test(e.fact))) errors.push(...hourUnknownErrors(texts));
  // 미유 문체 — 합쇼체 · 당신/귀하 · 금지 문구 · AI 어휘 · 억지 공감 · 이모지는 저장하지 않는다(추상어 예산 · 대조형 틀 같은 것은 고쳐 쓰기 대상이 아니라 읽기 전 지표로만 본다)
  errors.push(...voiceErrors(checkVoice(texts)));
  for (const { where, text: t } of texts) {
    if (pair && ATTACHMENT_TYPE.test(t)) errors.push(`${where}: 가까운 관계 반응을 애착 유형 이름("${ATTACHMENT_TYPE.exec(t)![0]}")으로 부르지 않습니다 — 어떤 장면에서 어떻게 나타나는지로 쓰세요.`);
    if (BARE_LETTER.test(t)) errors.push(`${where}: 두 사람을 "A님 · B님"으로만 부릅니다("A"나 "B" 한 글자로 부르지 않습니다).`);
    if (VERDICT.test(t)) errors.push(`${where}: 관계의 좋고 나쁨을 판정하거나 운명으로 단정하는 표현("${VERDICT.exec(t)![0]}")을 쓰지 않습니다 — 어떤 장면에서 어떻게 달라지는지로 쓰세요.`);
    if (INNER_MIND.test(t)) errors.push(`${where}: 두 사람 가운데 한 사람의 속마음 · 감정을 아는 것처럼 쓰지 않습니다.`);
    if (RELATION_KIND.test(t)) errors.push(`${where}: 두 사람의 관계 종류(남편 · 아내 · 남자친구 · 여자친구 · 애인)를 알고 있는 것처럼 쓰지 않습니다 — "두 분"으로 씁니다.`);
    const inTiming = where.startsWith("sections.love") && hasTimingEvidence(evidence);
    if (!inTiming && TIMING_TALK.test(t)) errors.push(`${where}: 두 사람의 시기("${TIMING_TALK.exec(t)![0]}")는 ${hasTimingEvidence(evidence) ? "5번 장(연애와 결혼 궁합)에서만" : "시기 근거가 없어"} 쓰지 않습니다.`);
    if (inTiming && TIMING_VERDICT.test(t)) errors.push(`${where}: 두 사람의 시기에 좋고 나쁨을 매기지 않습니다("${TIMING_VERDICT.exec(t)![0]}") — 시기 문단은 두 시기의 주제가 겹치는지 다른지만 쓰세요.`);
    const ev = unfoundedEventIn(t, opts.relationship);
    if (ev) errors.push(`${where}: 입력받지 않은 두 사람의 사건("${ev}")을 아는 사실처럼 쓰지 않습니다 — "~했던 때가 있었을 수 있어요"처럼 조건 · 추측으로 쓰거나 장면의 가능성("~기 쉬워요")으로 바꾸세요.`);
    if (inTiming && TIMING_NOT_COMPUTED.test(t)) errors.push(`${where}: "${TIMING_NOT_COMPUTED.exec(t)![0]}"는 계산하지 않은 시기 이야기라 쓰지 않습니다 — 근거(compat.timing.*)에 적힌 시기 · 연도 안에서 두 시기의 주제가 겹치는지 다른지만 쓰세요.`);
  }

  // 고객이 읽는 글(지시문 0.6 · 0.4) — 본문에 명리 용어 · 한자 · 간지가 새어 나왔는지는 경고(WARN)로만 센다(저장을 막지 않고 고쳐 쓰기도 부탁하지 않는다, 기존 BLOCK은 하나도 낮추지 않았다).
  // 오행 이름("물의 기운")은 오행 조화(2번)와 개운(7번) 장에서만 허용한다. 개인 심층 리포트의 같은 지표(customer-voice.ts)를 쓰되 궁합의 두 장 예외만 다르다.
  for (const { where, text: t } of texts) {
    const leaks = customerVoiceLeaks(t, { allowElementTalk: /^sections\.(?:harmony|advice)\./.test(where) });
    if (leaks.length > 0) errors.push(`${where}: 본문에 명리 용어(${leaks.join(" · ")})가 있어요 — 두 사람의 행동 · 함께 정하고 대화하는 상황으로 풀어 쓰세요(경고만 하고 저장은 막지 않습니다).`);
  }

  // 알려 준 사이에 맞는 글인가 — 사이를 고른 것으로 풀이의 관점만 바뀌고, 사이에 맞지 않는 단정은 저장하지 않는다
  for (const issue of relationshipIssues(texts, opts.relationship)) errors.push(`${issue.where}: ${issue.message}`);

  // 되풀이 — 같은 구절 · 같은 말로 여는 문단은 읽기 전 지표로만 센다(2026-10-17 운영자: 낱말 · 구절 반복만으로 저장을 막지 않는다). 앞 장의 결론을 새 정보 없이 되풀이하는지는 사람이 읽고 판단한다
  const repeats = findRepeatedPhrasesIn(texts);

  // 리포트 궁합 — 근거에 적힌 응답 풀이 문구를 그대로 옮긴 글(응답 재진술)
  if (pair) {
    const echoed = echoedMeaningsIn(texts, evidence);
    if (echoed.length > PAIR_MEANING_ECHO_MAX) {
      for (const e of echoed.slice(0, 4)) errors.push(`${e.where}: 근거의 응답 풀이 문구를 그대로 옮겼어요("${e.run}…") — 응답이 두 사람의 어떤 장면에서 어떻게 나타날지로 바꿔 쓰세요.`);
      errors.push(`응답을 그대로 읽어 주는 글이 ${echoed.length}곳이에요 — ${PAIR_MEANING_ECHO_MAX}곳 이하로 줄이세요.`);
    }
  }

  const { blocks, warnings } = splitWarnings(errors);
  if (blocks.length > 0) return { ok: false, errors: blocks, warnings };
  return { ok: true, draft: d as CompatDraftV1, repeats, warnings };
}
