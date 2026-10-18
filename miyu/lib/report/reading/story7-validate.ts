// 7개 대주제(story-7, AI 초안)의 형식 검사 — 장 7개가 순서대로 있는가 · 근거 ID · 글자와 문장 수 · 장마다 문단 수 상한 · 근거를 소유하는 장의 개인 성향 근거 연결 · MBTI 쓰임 · 시기 이야기는 6번에만 · 5번의 일 / 재물 소제목 · 쉬운 말 · 금지 표현.
// 영역별 이야기(story-validate.ts)와 같은 글 규칙(textIssues)과 없는 기운 · 십성 풀이(absenceErrors) · 작성 과정 말하기(PROCESS_TALK)를 쓰고, 운영자 확정(2026-10-17) 내용을 코드로 막는다:
//  · 재물은 모든 리포트에 있다 — 돈 이야기가 비면 막는다. 재성 하나로 돈복을 판정하지 않고, 직접 묻지 않은 소비 · 저축 · 투자 습관은 사실처럼 쓰지 않고 조건형 · 질문으로만 쓴다.
//  · 4번의 가족 · 인복 · 귀인 이야기는 전통 육친 대응으로 읽는 조건형 풀이까지만 쓴다(운영자 2026-10-17 — 가족 구성 · 있었던 일을 아는 것처럼 쓰지 않는다). 7번의 조언은 2~3가지이고 알려 준 고민이 없으면 고민을 지어내지 않는다.
//  · 6번은 근거 목록의 개운(`saju.fortify`) 대응 — 방향 · 색 · 숫자 · 장소 — 을 본문이 말해야 하고, 그 기운의 대응과 다르게 쓰면 막는다(개인별 계산 없이 임의로 배정하지 않는다). 전통 개운법 · 재물복 · 연애운은 허용하고 효과를 보장하는 말만 막는다.
// 반복의 기준(운영자 2026-10-17): 낱말 · 성향 · 명리 요소가 여러 번 나왔다는 이유만으로 막지 않는다. 같은 명리 요소가 다른 장에서 다른 해석 · 새 정보를 주는 것은 허용하고, 앞 장의 결론을 새 정보 없이 되풀이하는지는 사람이 읽고 판단한다(코드가 가르지 못한다).
//  · 출생 시각을 모르면(근거 목록에 saju.hour.unknown) 오행 · 십성의 "없음"은 세 기둥 기준으로만 말하고 시주 풀이(자녀 · 말년) · 신강/신약 판정은 막는다(hour-scope.ts). 가족에게 있었던 일을 지난 사실처럼 쓰는 것은 시주 유무와 상관없이 막는다.
// 한계: 낱말 · 길이 · 표지를 세는 검사다 — 같은 결론을 말만 바꿔 되풀이하는 것 · 근거를 제대로 풀었는지 · 9,900원을 낼 만한지는 못 가른다(사람이 읽는 평가가 본다, docs/real-ai-evaluation-rubric.md).
import type { Evidence } from "../evidence.ts";
import { checkVoice, voiceErrors, type VoiceReport } from "../style/voice.ts";
import { CONTEXT_ATTRIBUTION, overlap } from "../v2/validate.ts";
import { ADVICE_RULES_TRADITIONAL, READING_LIMITS as L } from "./plan.ts";
import { fortifyCandidatesOf, fortuneMentions, ELEMENT_FORTUNE, FORTIFY_TIE_VERDICT } from "../../saju/interpret/fortune.ts";
import { hasHourUnknownEvidence } from "../../saju/interpret/hour-unknown.ts";
import { familyPastErrors, hourUnknownErrors } from "./hour-scope.ts";
import { MONEY_WORDS, PERIOD_TALK, PROCESS_TALK, TASK_IMPERATIVE } from "./story-plan.ts";
import { splitSentences } from "./story-motif.ts";
import { absenceErrors } from "./story-validate.ts";
import { story7Evidence } from "./story7-evidence.ts";
import { CONDITIONAL_MARK, FAMILY_CLAIM, MONEY_HABIT, PAST_EVENT_CLAIM, STORY7_FORMULA_BUDGET, STORY7_LIMITS as S, STORY7_MBTI_MIN, STORY7_MBTI_NOS, STORY7_OWNER_NOS, STORY7_PERSONAL_REUSE, STORY7_SECTIONS, STORY7_TASK_MAX, STORY7_TERMS, TRADITION_MARK, WEALTH_FATE } from "./story7-plan.ts";
import { customerVoiceLeaks, customerVoiceMessage } from "./customer-voice.ts";
import { distinctTerms } from "./terms.ts";
import { isTermWarning, splitWarnings } from "./warn-policy.ts";
import type { Story7DraftV1, Story7SectionDraft } from "./types.ts";
import { allowedYearsOf, countSentences, periodRefs, textIssues } from "./validate.ts";
import { audienceErrors, audienceOfEvidence } from "./audience-scope.ts";

/**
 * 검사 결과 — errors는 BLOCK(저장하지 않고 고쳐 쓰게 한다), warnings는 WARN(저장을 막지 않고 고쳐 쓰기도 부탁하지 않으며 글을 그대로 둔 채 경고로만 보인다).
 * ok는 BLOCK이 없다는 뜻이고, 경고가 있어도 ok일 수 있다 — "경고 없음 · 통과"는 유료 판매 합격이 아니다(운영자가 글 전문을 읽고 정한다).
 */
export type Story7Validation = { ok: true; draft: Story7DraftV1; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] };

/** WARN으로 보는 오류 문구(설명 없는 용어 · 용어 개수 · 문단 문장 수) — 궁합 풀이와 같은 표지를 쓴다(warn-policy.ts) */
export const isStory7Warning = isTermWarning;

const isString = (v: unknown): v is string => typeof v === "string";
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

/** 알파벳 네 글자 유형 코드 — 본문에 쓰지 않는다(입력한 MBTI는 "입력해 주신 성향"으로 부른다) */
const TYPE_CODE = /(?<![A-Za-z])[EI][NS][TF][JP](?![A-Za-z])/i;
/** 과거를 가리키는 말 — 나이 범위 · 연도 · "그 무렵" · "지난 시기" */
const PAST_ANCHOR = /만\s*\d{1,2}|(?<![\d.])(?:19|20)\d{2}\s*년|그 무렵|그때|그 시기|지난 |지나온|지나간|[1-9]0대/;
/** 본문이 입력한 MBTI를 실제로 쓰고 있는가 — 근거 ID만 달고 본문에는 쓰지 않는 것을 막는 어림 */
const MBTI_MENTION = /입력(?:해|하)?\s*(?:주신|신|하신)|알려\s*주신|MBTI/;

/** 장의 문단 목록 — 소제목이 있는 장은 소제목 순서대로 이어 붙인다 */
export const story7Paragraphs = (s: Pick<Story7SectionDraft, "paragraphs" | "parts">): string[] => {
  if (Array.isArray(s.parts)) return s.parts.flatMap((p) => (Array.isArray(p?.paragraphs) ? p.paragraphs.filter(isString) : []));
  return Array.isArray(s.paragraphs) ? s.paragraphs.filter(isString) : [];
};

/** 화면에 그대로 보이는 글을 위치와 함께 모은다 (근거 ID처럼 보이지 않는 값은 제외) */
export function visibleStory7Texts(d: Story7DraftV1): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const push = (where: string, text: unknown) => {
    if (isString(text) && text.trim()) out.push({ where, text });
  };
  push("headline", d.headline);
  for (const k of ["strength", "caution"] as const) {
    push(`cards.${k}.keyword`, d.cards?.[k]?.keyword);
    push(`cards.${k}.note`, d.cards?.[k]?.note);
  }
  for (const s of d.sections ?? []) {
    const w = `sections.${s?.no}`;
    push(`${w}.headline`, s?.headline);
    (s?.paragraphs ?? []).forEach((t, i) => push(`${w}.paragraphs[${i}]`, t));
    (s?.parts ?? []).forEach((p, pi) => (p?.paragraphs ?? []).forEach((t, i) => push(`${w}.parts[${pi}].paragraphs[${i}]`, t)));
    (s?.years ?? []).forEach((y, i) => push(`${w}.years[${i}]`, `${y?.year ?? ""} ${y?.theme ?? ""}`));
    (s?.scenarios ?? []).forEach((x, i) => push(`${w}.scenarios[${i}]`, `${x?.when ?? ""} ${x?.then ?? ""}`));
  }
  (d.actions ?? []).forEach((a, i) => push(`actions[${i}]`, `${a?.title ?? ""} ${a?.detail ?? ""}`));
  return out;
}

/** 글 조각 위치를 장 이름으로 — "head"는 제목 · 카드, s1~s7은 대주제, actions는 7번의 조언 행동(반복 · 모티프 검사가 쓴다) */
export const story7BlockOf = (where: string): string => {
  if (where === "headline" || where.startsWith("cards.")) return "head";
  const m = /^sections\.(\d)\./.exec(where);
  if (m) return `s${m[1]}`;
  if (where.startsWith("actions")) return "actions";
  return where;
};
export const STORY7_MOTIF_BLOCKS = { of: story7BlockOf, main: STORY7_SECTIONS.map((s) => `s${s.no}`) };

/** 섹션 객체에서 actions 칸만 뺀 사본(입력은 바꾸지 않는다) */
function withoutActions<S extends object>(section: S): S {
  const copy = { ...section } as Record<string, unknown>;
  delete copy.actions;
  return copy as S;
}

/**
 * 모델이 낸 글의 **위치만** 바로잡는다(글자는 한 글자도 바꾸거나 나누거나 지우지 않는다): 조언 행동(actions)을 sections 바깥이 아니라 7번 장 안에 넣은 글은 sections 바깥으로 옮긴다
 * (실제 AI 시험 2026-10-17에서 7번 장 안에 넣은 글이 나왔다 — 지시문은 바깥이라고 두 번 적었지만 모델이 안쪽에 놓았다). 바깥 actions가 이미 목록이면 건드리지 않는다. 입력은 바꾸지 않는다.
 * 예전에는 문장 수 한도(4문장)를 넘은 문단을 문단 나눔만 바꿔 나눴다 — 운영자 정책(2026-10-17)으로 문단 길이는 경고(WARN)만 하고 생성된 원문은 그대로 보존하므로 더 나누지 않는다.
 */
export function normalizeStory7Draft<T>(raw: T): T {
  const d = raw as Partial<Story7DraftV1> | null;
  if (!d || typeof d !== "object" || !Array.isArray(d.sections)) return raw;
  type WithActions = { actions?: unknown };
  const nested = Array.isArray(d.actions)
    ? undefined
    : d.sections.find((s) => s && typeof s === "object" && Number(s.no) === 7 && Array.isArray((s as WithActions).actions));
  if (!nested) return raw;
  const liftedActions = (nested as WithActions).actions as Story7DraftV1["actions"];
  // 옮긴 행동은 7번 장에서 빼 같은 글이 두 곳에 있지 않게 한다
  const sections = d.sections.map((section) => (section === nested ? withoutActions(section) : section));
  return { ...d, sections, actions: liftedActions } as T;
}

/**
 * 미유 문체 점검(style/voice.ts) — 글의 합쇼체 · 당신/귀하 · 금지 문구 · AI 어휘 · 억지 공감 · 이모지는 실패(저장하지 않는다)이고, 추상어 예산 · 대조형 틀 · 같은 시작/마무리 · 이름 호칭 · 근거 문구 옮김은 고쳐 쓰기 안내(repair),
 * 같은 뜻 반복 의심은 사람이 읽고 판단하는 목록(review)이다. 단어 하나로 실패시키지 않고 맥락 · 빈도로 판단한다.
 */
export function story7VoiceReport(d: Story7DraftV1, evidence: Evidence[]): VoiceReport {
  return checkVoice(visibleStory7Texts(d), { evidenceTexts: evidence.filter((e) => !e.uncertain).flatMap((e) => [e.fact, e.cue]), blockOf: story7BlockOf });
}

export function validateStory7Draft(raw: unknown, evidence: Evidence[], opts: { hasContext?: boolean } = {}): Story7Validation {
  const errors: string[] = [];
  const d = raw as Partial<Story7DraftV1> | null;
  if (!d || typeof d !== "object") return { ok: false, errors: ["JSON 객체가 아닙니다."], warnings: [] };
  const known = new Map(evidence.map((e) => [e.id, e]));
  const refs = periodRefs(evidence);
  const years = new Set(refs.filter((r) => r.ref.startsWith("y")).map((r) => r.ref.slice(1)));
  const allowedYears = allowedYearsOf(evidence);
  const mine = story7Evidence(evidence);
  const personal = evidence.filter((e) => (e.source === "survey" || e.source === "self") && !e.uncertain);
  const personalIds = new Set(personal.map((e) => e.id));
  const mbtiAvailable = personal.some((e) => e.id === "self.mbti");

  // soft: 길이 한도를 넘거나 모자라도 글이 있으면 경고(WARN)만 한다(운영자 정책 2026-10-18 — 제목이 한 글자 길거나 문단이 몇 글자 짧다고 고객 리포트를 저장하지 못하게 하지 않는다).
  //   글이 아예 없거나 비어 있으면(내용 누락)은 soft여도 BLOCK이다.
  const text = (v: unknown, where: string, min: number, max: number, soft: { min?: boolean; max?: boolean } = {}): v is string => {
    if (!isString(v) || v.trim().length === 0) {
      errors.push(`${where}: 글이 없습니다.`);
      return false;
    }
    const len = v.trim().length;
    if (len < min || len > max) errors.push(`${where}: 길이 ${len}자 (${(len < min ? soft.min : soft.max) ? `권장 ${min}~${max}자 — 경고만 하고 저장은 막지 않습니다` : `${min}~${max}자`})`);
    return true;
  };
  const checkIds = (v: unknown, where: string, opt: { required?: boolean; needSaju?: boolean; period?: boolean } = {}) => {
    if (!isIds(v) || (opt.required && v.length === 0)) {
      errors.push(`${where}: 근거 ID가 없습니다.`);
      return;
    }
    for (const id of v) if (!known.has(id)) errors.push(`${where}: 없는 근거 ID ${id}`);
    if (v.length > 0 && v.every((id) => known.get(id)?.uncertain)) errors.push(`${where}: 확실하지 않은 근거만으로 해석했습니다.`);
    if (opt.needSaju && !v.some((id) => known.get(id)?.source === "saju")) errors.push(`${where}: 사주 근거가 없습니다 (사주가 해석의 틀입니다).`);
    if (opt.period && !v.some((id) => known.get(id)?.period)) errors.push(`${where}: 시기 근거(period가 있는 ID)가 없습니다.`);
  };
  const list = <T,>(v: unknown, where: string, min: number, max: number): T[] => {
    if (!Array.isArray(v)) {
      errors.push(`${where}: 목록이 아닙니다.`);
      return [];
    }
    if (v.length < min || v.length > max) errors.push(`${where}: ${v.length}개 (${min}~${max}개)`);
    return v as T[];
  };
  const paragraph = (v: unknown, where: string) => {
    if (text(v, where, S.paragraph.min, S.paragraph.max, { min: true })) {
      const n = countSentences(v);
      if (n > S.paragraph.sentencesMax) errors.push(`${where}: ${n}문장 (${S.paragraph.sentencesMax}문장 이하로 묶어 주세요)`);
      const terms = distinctTerms(v);
      if (terms.length > STORY7_TERMS.perParagraphMax) errors.push(`${where}: 한 문단에 사주 용어가 ${terms.length}개(${terms.join(" · ")}) — 문단 하나에서 새 개념을 여럿 배우지 않게 ${STORY7_TERMS.perParagraphMax}개까지만 쓰고, 나머지는 쉬운 말로 바꾸세요.`);
    }
  };

  // 핵심 문장 · 첫 화면 카드 — 공유용 카드 이미지에 그대로 실리므로 이름을 쓰지 않는다
  text(d.headline, "headline", S.headline.min, S.headline.max);
  for (const [k, label] of [["strength", "내가 강한 포인트"], ["caution", "내가 힘들 수 있는 포인트"]] as const) {
    const c = d.cards?.[k];
    if (!c) {
      errors.push(`cards.${k}(${label}): 카드가 없습니다.`);
      continue;
    }
    text(c.keyword, `cards.${k}.keyword`, 4, L.card.keywordMax);
    text(c.note, `cards.${k}.note`, L.card.noteMin, L.card.noteMax);
  }
  for (const [where, v] of [["headline", d.headline], ["cards.strength.note", d.cards?.strength?.note], ["cards.strength.keyword", d.cards?.strength?.keyword], ["cards.caution.note", d.cards?.caution?.note], ["cards.caution.keyword", d.cards?.caution?.keyword]] as const) {
    if (isString(v) && /\{name\}|\s님[은는이가을를의]?(?![가-힣])/.test(v)) errors.push(`${where}: 이름을 쓰지 않습니다 (공유용 카드 이미지에 그대로 실립니다)`);
    if (isString(v) && PERIOD_TALK.test(v)) errors.push(`${where}: 시기 이야기("${PERIOD_TALK.exec(v)![0]}")는 6번 "앞으로의 운과 변화" 장에만 씁니다.`);
  }

  // 7개 대주제 — 순서대로 모두 있어야 한다
  const sections = list<Story7SectionDraft>(d.sections, "sections", STORY7_SECTIONS.length, STORY7_SECTIONS.length);
  sections.forEach((s, i) => {
    if (Number(s?.no) !== i + 1) errors.push(`sections[${i}]: no가 ${i + 1}번이어야 합니다 (7개 대주제는 순서가 정해져 있고 빼거나 합치지 않습니다).`);
  });
  const sectionTexts = new Map<number, string>();
  const usedIn = new Map<string, number[]>();
  let mbtiSections = 0;
  for (const plan of STORY7_SECTIONS) {
    const s = sections.find((x) => Number(x?.no) === plan.no);
    const w = `sections.${plan.no}(${plan.title})`;
    if (!s) {
      errors.push(`sections: ${plan.no}번 ${plan.title}이(가) 없습니다.`);
      continue;
    }
    text(s.headline, `${w}.headline`, S.sectionHeadline.min, S.sectionHeadline.max, { min: true, max: true });

    // 문단 — 소제목이 있는 5번만 parts, 나머지는 paragraphs
    let paragraphs: string[] = [];
    if (plan.parts) {
      if (s.paragraphs !== undefined) errors.push(`${w}: 이 장은 paragraphs가 아니라 소제목(${plan.parts.join(" · ")})별 parts로 씁니다.`);
      const parts = list<{ title: string; paragraphs: string[] }>(s.parts, `${w}.parts`, plan.parts.length, plan.parts.length);
      parts.forEach((p, pi) => {
        if (p?.title !== plan.parts![pi]) errors.push(`${w}.parts[${pi}]: 소제목이 "${plan.parts![pi]}"이어야 합니다 (지금 "${p?.title}").`);
        const ps = list<string>(p?.paragraphs, `${w}.parts[${pi}](${plan.parts![pi]}).paragraphs`, S.part.min, S.part.max);
        ps.forEach((t, i) => paragraph(t, `${w}.parts[${pi}].paragraphs[${i}]`));
      });
      paragraphs = story7Paragraphs(s);
      if (paragraphs.length > plan.maxParagraphs) errors.push(`${w}: 문단이 모두 ${paragraphs.length}개입니다 — 이 장은 ${plan.maxParagraphs}개까지(근거가 많지 않은 장을 길게 늘려 쓰지 않습니다).`);
    } else {
      if (s.parts !== undefined) errors.push(`${w}: 소제목(parts)은 5번 일과 재물에만 있습니다.`);
      const ps = list<string>(s.paragraphs, `${w}.paragraphs`, 1, plan.maxParagraphs);
      ps.forEach((t, i) => paragraph(t, `${w}.paragraphs[${i}]`));
      paragraphs = story7Paragraphs(s);
    }
    sectionTexts.set(plan.no, paragraphs.join("\n"));

    // 첫 문단은 결론을 쉬운 말로 먼저 — 사주 용어는 풀이를 붙여 둘까지(사주에서 출발하는 풀이라 0에서 넓혔다, 6번 시기 장은 대운 · 세운을 풀이와 함께 써야 하므로 제외)
    if (plan.no !== 6 && isString(paragraphs[0])) {
      const firstTerms = distinctTerms(paragraphs[0]);
      if (firstTerms.length > STORY7_TERMS.firstParagraphMax) errors.push(`${w}: 첫 문단에 사주 용어(${firstTerms.join(" · ")})가 ${firstTerms.length}개 — 첫 문단은 이 장의 결론을 쉬운 말로 먼저 쓰고 용어는 ${STORY7_TERMS.firstParagraphMax}개까지만, 나머지는 둘째 문단부터 쓰세요.`);
    }
    errors.push(...absenceErrors(paragraphs, w, { relaxed: true, lifeWords: true }));
    if (isString(s.headline) && paragraphs.some((t) => t.includes(s.headline.trim()))) errors.push(`${w}: 문단이 제목을 그대로 되풀이합니다 — 제목은 본문을 다 쓴 뒤의 결론이고 문단은 그 연결을 풀어 쓰는 글입니다.`);
    const tasks = paragraphs.reduce((n, p) => n + p.split(/(?<=[.!?])\s+/).filter((x) => TASK_IMPERATIVE.test(x)).length, 0);
    const taskMax = plan.no === 6 ? STORY7_TASK_MAX[6] : STORY7_TASK_MAX.default;
    if (tasks > taskMax) errors.push(`${w}: "~해 보세요" 같은 행동 과제 문장이 ${tasks}개 — 이 장에는 ${taskMax}개까지만 두고 구체적인 실천은 7번 장의 조언(actions)에 모으세요.`);
    if (plan.no !== 6) {
      for (const [where, t] of [[`${w}.headline`, s.headline], ...paragraphs.map((p, i) => [`${w}.paragraphs[${i}]`, p] as const)] as const) {
        if (isString(t) && PERIOD_TALK.test(t)) errors.push(`${where}: 시기 이야기("${PERIOD_TALK.exec(t)![0]}")는 6번 "앞으로의 운과 변화" 장에만 씁니다 — 이 장에서는 시기를 말하지 않고, 같은 이야기를 두 번 풀지 않습니다.`);
      }
      if (s.years !== undefined || s.scenarios !== undefined) errors.push(`${w}: years · scenarios는 6번 장에만 있습니다.`);
    }

    // 5번 — 재물은 모든 리포트에 있다(비어 있지 않게). 재성 하나로 돈복을 판정하지 않고, 직접 묻지 않은 돈 습관은 조건형 · 질문으로만
    if (plan.no === 5 && Array.isArray(s.parts)) {
      const money = s.parts.find((p) => p?.title === "재물");
      const moneyText = Array.isArray(money?.paragraphs) ? money!.paragraphs.filter(isString) : [];
      const body = moneyText.flatMap(splitSentences).filter((x) => !PROCESS_TALK.test(x)).join(" ");
      if (!MONEY_WORDS.test(body)) errors.push(`${w}.parts(재물): 재물 소제목에 돈 이야기가 없습니다 — 재물 해석 근거가 약하면 1문단으로 짧게, 평소 행동 경향(신중함 · 지속성 등)이 돈 앞의 선택(지출 · 저축 · 큰 결정)에서 어떻게 나타날 수 있는지를 조건형으로 쓰세요. "근거가 약해 다루지 않았다"고 쓰지 않습니다.`);
      for (const sentence of moneyText.flatMap(splitSentences)) {
        if (MONEY_HABIT.test(sentence) && !CONDITIONAL_MARK.test(sentence)) errors.push(`${w}.parts(재물): "${sentence.slice(0, 40)}…" — 소비 · 저축 · 투자 습관을 직접 물은 응답이 없으므로 이 사람의 습관을 사실처럼 쓰지 않습니다 — "~할 때는 ~기 쉬워요 · ~는 어떤 편인지 살펴볼 만해요"처럼 조건이나 질문으로 쓰세요.`);
      }
    }

    // 근거 — 근거를 소유하는 장은 사주 근거가 있어야 하고 개인 성향 근거(응답 · MBTI)를 연결한다. 앞 장을 엮는 장(2 · 7번)은 비워도 된다
    const owner = plan.kind === "owner";
    checkIds(s.evidence, `${w}.evidence`, { required: owner, needSaju: owner, period: plan.no === 6 && refs.length > 0 });
    const cited = isIds(s.evidence) ? s.evidence : [];
    const pool = mine.personal[plan.no].filter((id) => id !== "self.mbti");
    const citedPersonal = cited.filter((id) => pool.includes(id));
    const need = Math.min(plan.personalMin, pool.length);
    if (owner && citedPersonal.length < need) errors.push(`${w}.evidence: 이 장과 맞닿는 개인 성향 근거(응답)를 ${need}개 이상 연결해 주세요 — 고를 수 있는 것: ${pool.join(" · ")}`);
    const citesMbti = cited.includes("self.mbti");
    if (citesMbti) {
      if (!(STORY7_MBTI_NOS as readonly number[]).includes(plan.no)) errors.push(`${w}.evidence: 입력한 MBTI(self.mbti)는 ${STORY7_MBTI_NOS.join(" · ")}번 장에서만 연결합니다(시기나 운 때문에 성향이 바뀐다고 읽히지 않게).`);
      else {
        mbtiSections++;
        if (!paragraphs.some((t) => MBTI_MENTION.test(t))) errors.push(`${w}: 입력한 MBTI 근거를 달았는데 본문에서 쓰지 않았습니다 — "입력해 주신 성향까지 함께 보면 ~"처럼 이 장의 장면을 구체화하는 데 쓰거나 근거에서 빼세요.`);
      }
    }
    if (plan.no === 6) {
      const flowPersonal = cited.filter((id) => personalIds.has(id) && id !== "self.mbti");
      if (flowPersonal.length > 1) errors.push(`${w}.evidence: 시기 풀이에는 개인 성향 근거를 하나까지만 연결합니다(지금 ${flowPersonal.length}개: ${flowPersonal.join(" · ")}) — 시기는 거의 사주만으로 쓰고, 이 사람이 시기를 받아들이는 모습 한 군데에만 씁니다.`);
    }
    if ((STORY7_OWNER_NOS as readonly number[]).includes(plan.no)) for (const id of cited) if (personalIds.has(id) && id !== "self.mbti") usedIn.set(id, [...(usedIn.get(id) ?? []), plan.no]);

    // 6번 — 개운(방향 · 색 · 숫자 · 장소): 근거 목록의 보완 후보 기운의 전통 대응을 본문이 말해야 한다(개인별 계산 없이 임의로 배정하지 않는다).
    // 개수가 같은 후보가 둘 이상이면(동점) 그중 한 기운의 대응을 모두 말하면 되고, 어느 쪽을 최우선 · 가장 필요한 기운으로 정해 말하지 않는다.
    if (plan.no === 6) {
      const candidates = fortifyCandidatesOf(evidence);
      if (candidates.length > 0) {
        const body = paragraphs.join("\n");
        if (!cited.includes("saju.fortify")) errors.push(`${w}.evidence: 개운 풀이의 근거(saju.fortify)를 달아 주세요.`);
        const per = candidates.map((el) => ({ el, f: ELEMENT_FORTUNE[el], m: fortuneMentions(body, el) }));
        const complete = per.some((x) => x.m.direction && x.m.color && x.m.number && x.m.place);
        if (!complete) {
          const x = per[0];
          const missing = [x.m.direction ? "" : `방향(${x.f.direction})`, x.m.color ? "" : `색(${x.f.colors.join(" · ")})`, x.m.number ? "" : `숫자(${x.f.numbers.join(" · ")})`, x.m.place ? "" : "장소(자주 머무는 환경)"].filter(Boolean);
          const list = per.map((y) => `${y.el}(${y.f.image}) 방향 ${y.f.direction}, 색 ${y.f.colors.join(" · ")}, 숫자 ${y.f.numbers.join(" · ")}, 장소 ${y.f.places.join(" · ")}`).join(" / ");
          errors.push(`${w}: 개운 풀이(행운의 색 · 방향 · 숫자 · 장소)에서 ${missing.join(" · ")}이(가) 빠졌습니다 — 근거 목록의 보완 후보(${candidates.join(" · ")}) 기운의 전통 대응을 그대로 쓰세요: ${list}. 임의로 다른 기운의 색 · 방향 · 숫자를 쓰지 않습니다.`);
        }
        if (candidates.length > 1) {
          const verdict = FORTIFY_TIE_VERDICT.exec(body);
          if (verdict) errors.push(`${w}: 보완 후보 ${candidates.join(" · ")}은(는) 개수가 같은 동점 후보라 "${verdict[0]}"처럼 하나를 먼저 · 가장 필요한 기운으로 정해 말할 수 없어요 — 둘 다 같은 무게의 후보로 소개하세요(개수만으로 우선순위를 가릴 수 없다고 근거에 적혀 있어요).`);
        }
      }
    }

    // 6번 — 가까운 세 해 · 응답으로 본 가능성
    if (plan.no === 6) {
      list<{ year: string; theme: string }>(s.years, `${w}.years`, refs.length ? S.years.min : 0, S.years.max).forEach((y, i) => {
        // "2026"과 "2026년"을 모두 받는다(조립할 때 숫자 네 자리로 맞춘다)
        if (!isString(y?.year) || !years.has(y.year.replace(/\s*년$/, ""))) errors.push(`${w}.years[${i}]: 계산된 해가 아닙니다 (${y?.year}). ${[...years].join(" · ") || "계산된 해 없음"}만 쓸 수 있습니다.`);
        text(y?.theme, `${w}.years[${i}].theme`, 8, S.years.themeMax);
      });
      list<{ when: string; then: string }>(s.scenarios, `${w}.scenarios`, S.scenarios.min, S.scenarios.max).forEach((x, i) => {
        text(x?.when, `${w}.scenarios[${i}].when`, 10, S.scenarios.whenMax);
        text(x?.then, `${w}.scenarios[${i}].then`, 15, S.scenarios.thenMax);
        if (isString(x?.then) && !/수 있(?:습니다|어요|죠)|수도 있(?:습니다|어요|죠)|일 수|가능성/.test(x.then)) errors.push(`${w}.scenarios[${i}].then: 확률이 아닌 가능성으로 써 주세요 ("~할 수 있어요").`);
      });
    }
    // 7번 — 알려 준 고민이 있을 때만 첫 문단이 그 고민을 밝힌다(없으면 textIssues가 "알려 주신"을 막는다)
    if (plan.no === 7 && opts.hasContext && isString(paragraphs[0]) && !CONTEXT_ATTRIBUTION.test(paragraphs[0])) errors.push(`${w}.paragraphs[0]: 고객이 알려 준 고민을 밝히며 시작해야 합니다 (예: "알려 주신 고민을 반영하면").`);
  }

  // 같은 개인 성향 근거(MBTI 제외)를 근거를 소유하는 장 셋 이상이 앞세우지 않는다 — 한 가지 응답이 모든 장을 끌고 가면 글 전체가 한 모티프의 되풀이가 된다
  const nonMbti = personal.filter((e) => e.id !== "self.mbti");
  if (nonMbti.length >= STORY7_PERSONAL_REUSE.minPoolToCheck) {
    for (const [id, nos] of usedIn) if (nos.length > STORY7_PERSONAL_REUSE.maxAreas) errors.push(`sections: 개인 성향 근거 ${id}를 ${nos.length}개 장(${nos.join(" · ")}번)이 앞세웠습니다 — 같은 응답이 거의 모든 장을 끌고 가면 글이 한 가지 모티프의 되풀이가 됩니다. ${STORY7_PERSONAL_REUSE.maxAreas}개 장까지만 쓰고, 나머지 장은 그 장에 맞닿는 사주 근거에서 출발하세요(사용자 메시지 sections[].personalEvidence가 장마다 나눠 준 것).`);
  }
  if (mbtiAvailable && mbtiSections < STORY7_MBTI_MIN) errors.push(`sections: 입력한 MBTI(self.mbti)를 ${STORY7_MBTI_NOS.join(" · ")}번 장 가운데 ${STORY7_MBTI_MIN}곳 이상에 연결해 주세요 (지금 ${mbtiSections}곳). 맞닿는 곳에서 한 장에 한 번, 알파벳 글자 없이 "입력해 주신 성향"으로.`);

  // 장 제목끼리 · 핵심 문장과 겹치지 않는다 — 장마다 그 장에서만 말하는 연결이어야 한다
  const heads = sections.filter((s) => isString(s?.headline)).map((s) => ({ no: Number(s.no), h: s.headline }));
  for (let i = 0; i < heads.length; i++) for (let j = i + 1; j < heads.length; j++) {
    if (overlap(heads[i].h, heads[j].h) > S.headlineOverlapMax) errors.push(`sections ${heads[i].no}번과 ${heads[j].no}번: 제목이 거의 같은 말입니다 — 장마다 그 장에서만 말하는 연결을 쓰세요.`);
  }
  if (isString(d.headline)) for (const h of heads) if (overlap(d.headline, h.h) > 0.6) errors.push(`headline과 sections ${h.no}번 제목이 거의 같은 말입니다 — 핵심 문장은 장 제목을 옮기지 말고 이 사람의 중심이 되는 연결 하나를 쓰세요.`);

  // 7번 장의 조언 2~3가지 — 앞 장에서 나온 서로 다른 행동
  const actions = list<NonNullable<Story7DraftV1["actions"]>[number]>(d.actions, "actions", S.actions.min, S.actions.max);
  actions.forEach((a, i) => {
    text(a?.title, `actions[${i}].title`, 6, S.actions.titleMax);
    text(a?.detail, `actions[${i}].detail`, S.actions.detailMin, S.actions.detailMax);
    checkIds(a?.evidence, `actions[${i}].evidence`, { required: true });
    for (const [where, t] of [[`actions[${i}].title`, a?.title], [`actions[${i}].detail`, a?.detail]] as const) {
      if (isString(t) && PERIOD_TALK.test(t)) errors.push(`${where}: 조언에 시점이나 기간("${PERIOD_TALK.exec(t)![0]}")을 임의로 정하지 않습니다.`);
    }
  });
  for (let i = 0; i < actions.length; i++) for (let j = i + 1; j < actions.length; j++) {
    if (actions[i]?.detail && actions[j]?.detail && overlap(actions[i].detail, actions[j].detail) > 0.7) errors.push(`actions[${i}]와 actions[${j}]가 거의 같습니다 — 서로 다른 상황 · 행동으로 바꿔 주세요.`);
  }

  // 쉬운 말 · 금지 표현 · 해 · 반복 (화면에 보이는 모든 글 — 이전 형식과 같은 규칙)
  const texts = visibleStory7Texts(d as Story7DraftV1);
  const bodyText = texts.filter((t) => /^sections\.\d\.(?:paragraphs|parts)/.test(t.where)).map((t) => t.text).join("\n");
  for (const f of STORY7_FORMULA_BUDGET) {
    const n = bodyText.match(f.re)?.length ?? 0;
    if (n > f.max) errors.push(`sections: "${f.label}"이(가) ${n}곳에 나와요(${f.max}곳까지) — 장마다 같은 틀로 맺지 말고, 방향을 질문 · 기준 · 건넬 말 · 조건처럼 장에 맞는 다른 모양으로 쓰세요.`);
  }
  for (const { where, text: t } of texts) {
    const hit = PROCESS_TALK.exec(t);
    if (hit) errors.push(`${where}: 작성 과정을 말하는 문장("${t.slice(Math.max(0, hit.index - 8), hit.index + hit[0].length).trim().slice(0, 50)}")은 쓰지 않습니다 — 쓸 것이 없으면 그 이야기를 하지 않고, 쓸 수 있는 근거로 이 사람의 모습을 풀어 쓰세요.`);
    // 가족 이야기는 전통 육친 대응으로 읽는 조건형까지만 — 가족 구성 · 가족과 있었던 일을 아는 것처럼 쓰지 않는다(운영자 2026-10-17: 가족 인연은 풀이하되 없는 사건을 만들지 않는다)
    for (const sentence of t.split(/(?<=[.!?])\s+/)) {
      const family = FAMILY_CLAIM.exec(sentence);
      if (family && !CONDITIONAL_MARK.test(sentence) && !TRADITION_MARK.test(sentence)) errors.push(`${where}: "${sentence.slice(0, 40)}…" — 가족("${family[0]}") 이야기는 입력받은 것이 없으므로 사실처럼 쓰지 않습니다 — "전통에서는 ~로 읽어요 · ~기 쉬워요 · ~일 수 있어요"처럼 사주에서 읽은 경향과 조건으로 쓰세요(가족 구성 · 가족과 있었던 일 · 관계의 좋고 나쁨을 정하지 않습니다).`);
    }
    const fate = WEALTH_FATE.exec(t);
    if (fate) errors.push(`${where}: 재물의 결과를 확정하는 말("${fate[0]}")을 쓰지 않습니다 — 재물복 · 돈이 들어오고 나가는 양상은 근거(saju.wealth)가 읽는 구조까지 조건형으로 쓰고, 부자가 된다 · 평생 가난하다처럼 결과를 정하지 않습니다.`);
  }
  // 가족에게 있었던 일을 지난 사실로 쓰지 않는다(입력받은 가족 정보 없음) · 출생 시각을 모를 때는 세 기둥 기준 범위 · 시주 풀이 금지 · 신강/신약 금지(hour-scope.ts)
  errors.push(...familyPastErrors(texts));
  if (hasHourUnknownEvidence(evidence)) errors.push(...hourUnknownErrors(texts, { lifeWords: true }));
  // 지난 시기를 사실처럼 쓰지 않는다 — 지난 대운 · 세운의 연애 · 일 · 재물 이야기는 사주에서 읽은 가능성이지 입력받은 사건이 아니다(운영자 2026-10-18).
  //   과거를 가리키는 말(나이 범위 · 연도 · 그 무렵 · 지난 시기)과 사건 동사가 함께 있고 조건형 · 전통 해석 표지가 없는 문장을 막는다
  for (const { where, text: t } of texts) {
    for (const sentence of t.split(/(?<=[.!?])\s+/)) {
      if (PAST_ANCHOR.test(sentence) && PAST_EVENT_CLAIM.test(sentence) && !CONDITIONAL_MARK.test(sentence) && !TRADITION_MARK.test(sentence)) {
        errors.push(`${where}: "${sentence.slice(0, 40)}…" — 지난 시기에 실제로 있었던 일은 입력받은 것이 없어요. "~했을 수 있어요 · ~했을 가능성이 있어요 · 전통에서는 ~로 읽어요"처럼 사주에서 읽은 가능성으로 쓰세요.`);
      }
    }
  }
  // 읽는 사람이 만 19세 미만이면 어른의 관계 풀이를 쓰지 않는다(근거 목록의 saju.frame.audience.*)
  errors.push(...audienceErrors(texts, audienceOfEvidence(evidence)));
  // 지난 대운 · 세운은 근거에 적힌 만 나이 범위 안에서만 말한다(6번 장 — 그 밖의 장은 시기를 말하지 않는다)
  const ageWindows = evidence.filter((e) => !e.uncertain).flatMap((e) => e.ageWindows ?? []);
  errors.push(...textIssues(texts, evidence, { allowedYears, hasContext: Boolean(opts.hasContext), adviceRules: ADVICE_RULES_TRADITIONAL, perSentenceMax: STORY7_TERMS.perSentenceMax, ageWindows, ageWhere: (w) => w.startsWith("sections.6.") }));
  for (const { where, text: t } of texts) if (TYPE_CODE.test(t)) errors.push(`${where}: 알파벳 유형 코드("${TYPE_CODE.exec(t)![0]}")를 쓰지 않습니다 — 입력한 MBTI는 "입력해 주신 성향"으로 부릅니다.`);
  // 고객이 읽는 글에 명리 용어 · 한자 · 간지가 새어 나왔는지 — 경고(WARN)만 한다(저장을 막지 않고 BLOCK 정책은 바뀌지 않는다). 6번 개운 문단의 "물의 기운"류 한글 이름만 허용한다
  for (const { where, text: t } of texts) {
    const found = customerVoiceLeaks(t, { allowElementTalk: where.startsWith("sections.6.") });
    if (found.length) errors.push(customerVoiceMessage(where, found));
  }
  // 미유 문체 — 분명한 위반만 실패로 센다(나머지는 고쳐 쓰기 안내로 생성기가 따로 부탁한다)
  errors.push(...voiceErrors(checkVoice(texts, { blockOf: story7BlockOf })));

  const { blocks, warnings } = splitWarnings(errors);
  return blocks.length ? { ok: false, errors: blocks.slice(0, 30), warnings } : { ok: true, draft: d as Story7DraftV1, warnings };
}
