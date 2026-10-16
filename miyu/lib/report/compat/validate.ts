// 사주 궁합 리포트(AI 초안)의 형식 검사 — 근거 ID · 글자와 문장 수 · 영역 순서 · 같은 근거 되풀이 · 쉬운 말 · 금지 표현 · 두 사람을 지어내지 않기.
// 이전 읽기 구조와 같은 글 규칙(textIssues)을 쓰고, 궁합에서만 필요한 확인(관계 판정 · 속마음 · 관계 종류 단정 · 시기 이야기 금지)을 더한다.
// 한계: 낱말 · 길이 · 표지를 센 어림이다. 말을 바꿔 쓴 속마음 단정 · 관계의 좋고 나쁨 판정은 못 찾는다 — 지시문(prompt.ts)과 사람이 읽는 평가가 본다. 좋은 글의 보증이 아니다.
import type { Evidence } from "../evidence.ts";
import { findRepeatedPhrasesIn, type RepeatedPhrase } from "../reading/repeat.ts";
import { distinctTerms } from "../reading/terms.ts";
import { allowedYearsOf, countSentences, textIssues } from "../reading/validate.ts";
import { COMPAT_ACTION_AREAS, COMPAT_LIMITS as L, COMPAT_SECTIONS, COMPAT_TIMING_BUILT } from "./plan.ts";
import type { CompatDraftV1 } from "./types.ts";

export type CompatValidation = { ok: true; draft: CompatDraftV1; repeats: RepeatedPhrase[] } | { ok: false; errors: string[] };

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

/** 두 사람의 시기 이야기 — 관계 시기(대운 · 세운이 겹치는 때)는 아직 계산하지 않았다 */
const TIMING_TALK = /올해|내년|작년|내후년|(?<![가-힣\d])\d{1,2}\s*월(?![가-힣]*\s*생)|대운|세운|(?:관계|인연)이\s*(?:깊어지|좋아지|나빠지|풀리)는\s*(?:때|시기|해|달)/;

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
  (d.actions ?? []).forEach((a, i) => push(`actions[${i}]`, `${a?.title ?? ""} ${a?.detail ?? ""}`));
  return out;
}

export function validateCompatDraft(raw: unknown, evidence: Evidence[]): CompatValidation {
  const errors: string[] = [];
  const d = raw as Partial<CompatDraftV1> | null;
  if (!d || typeof d !== "object") return { ok: false, errors: ["JSON 객체가 아닙니다."] };
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

  // 영역 다섯 개가 정해진 순서로 모두 있어야 한다
  const sections = Array.isArray(d.sections) ? d.sections : [];
  if (!Array.isArray(d.sections)) errors.push("sections: 목록이 아닙니다.");
  else if (sections.length !== COMPAT_SECTIONS.length || COMPAT_SECTIONS.some((p, i) => sections[i]?.id !== p.id)) errors.push(`sections: ${COMPAT_SECTIONS.map((s) => s.id).join(" · ")} 순서로 ${COMPAT_SECTIONS.length}개를 모두 써야 합니다.`);
  const reuse = new Map<string, Set<string>>();
  for (const plan of COMPAT_SECTIONS) {
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
      if (terms.length > L.termsPerParagraphMax) errors.push(`${where}.paragraphs[${i}]: 한 문단에 사주 용어가 ${terms.length}개(${terms.join(" · ")}) — ${L.termsPerParagraphMax}개까지만 쓰고 나머지는 쉬운 말로 바꾸세요.`);
      if (i === 0 && terms.length > 0) errors.push(`${where}.paragraphs[0]: 첫 문단에는 사주 용어를 쓰지 않습니다(${terms.join(" · ")}) — 두 사람이 함께 있는 장면부터 쓰고 용어는 뒤 문단에서 풀이와 함께 쓰세요.`);
    });
    ids(s.evidence, `${where}.evidence`);
    if (isIds(s.evidence)) for (const id of new Set(s.evidence)) reuse.set(id, (reuse.get(id) ?? new Set()).add(plan.id));
  }
  for (const [id, where] of reuse) if (where.size > L.evidenceReuseMax) errors.push(`근거 ${id}를 ${where.size}개 영역(${[...where].join(" · ")})이 씁니다 — ${L.evidenceReuseMax}개 영역까지만. 영역마다 다른 근거의 연결을 앞세우세요.`);

  // 행동
  const actions = Array.isArray(d.actions) ? d.actions : [];
  if (!Array.isArray(d.actions) || actions.length < L.actions.min || actions.length > L.actions.max) errors.push(`actions: ${actions.length}개 (${L.actions.min}~${L.actions.max}개)`);
  actions.forEach((a, i) => {
    text(a?.title, `actions[${i}].title`, L.actions.titleMin, L.actions.titleMax);
    text(a?.detail, `actions[${i}].detail`, L.actions.detailMin, L.actions.detailMax);
    if (!(COMPAT_ACTION_AREAS as readonly string[]).includes(String(a?.area)) || a?.area === "overview") errors.push(`actions[${i}].area: fit · friction · love · long 가운데 하나여야 합니다.`);
    ids(a?.evidence, `actions[${i}].evidence`);
  });
  if (new Set(actions.map((a) => a?.area)).size < Math.min(2, actions.length)) errors.push("actions: 적어도 두 영역에서 나온 서로 다른 행동이어야 합니다.");

  // 글 규칙 — 이전 읽기 구조와 같은 검사 + 궁합에서만 필요한 검사
  const texts = visibleCompatTexts(d as CompatDraftV1);
  errors.push(...textIssues(texts, evidence, { allowedYears: allowedYearsOf(evidence), hasContext: false }));
  for (const { where, text: t } of texts) {
    if (BARE_LETTER.test(t)) errors.push(`${where}: 두 사람을 "A님 · B님"으로만 부릅니다("A"나 "B" 한 글자로 부르지 않습니다).`);
    if (VERDICT.test(t)) errors.push(`${where}: 관계의 좋고 나쁨을 판정하거나 운명으로 단정하는 표현("${VERDICT.exec(t)![0]}")을 쓰지 않습니다 — 어떤 장면에서 어떻게 달라지는지로 쓰세요.`);
    if (INNER_MIND.test(t)) errors.push(`${where}: 두 사람 가운데 한 사람의 속마음 · 감정을 아는 것처럼 쓰지 않습니다.`);
    if (RELATION_KIND.test(t)) errors.push(`${where}: 두 사람의 관계 종류(남편 · 아내 · 남자친구 · 여자친구 · 애인)를 알고 있는 것처럼 쓰지 않습니다 — "두 분"으로 씁니다.`);
    if (!COMPAT_TIMING_BUILT && TIMING_TALK.test(t)) errors.push(`${where}: 두 사람의 시기("${TIMING_TALK.exec(t)![0]}")는 아직 계산하지 않아 쓰지 않습니다.`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, draft: d as CompatDraftV1, repeats: findRepeatedPhrasesIn(texts) };
}
