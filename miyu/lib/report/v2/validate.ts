// AI가 돌려준 리포트 초안의 형식 · 근거 · 표현 검사. 통과하지 못하면 저장하지 않고 다시 쓰게 한다.

import type { Evidence } from "../evidence.ts";
import { SECTION_PLAN, type Paragraph, type ReportDraftV2 } from "./types.ts";

export type ValidationResult = { ok: true; draft: ReportDraftV2 } | { ok: false; errors: string[] };

/** 단정 · 진단 · 과장 표현과 구체적인 날짜 예언 */
const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /정확도|적중률/, why: "정확도 · 적중률 표현" },
  { re: /진단(합니다|됩니다|입니다)|장애가 있/, why: "진단처럼 쓰는 표현" },
  { re: /100\s*%|틀림없|확실히 (일어|됩|합)|반드시 (일어|됩니다|하게 됩)/, why: "단정 표현" },
  { re: /운명(입니다|이에요|적으로 정해)/, why: "운명 단정" },
  { re: /\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/, why: "특정 날짜 예언" },
  { re: /(결혼|이혼|이별|사고)(하게 될|할) (것입니다|겁니다)/, why: "사건 예언" },
  { re: /숨겨진 (위험|단점)|후회하게|불행해질/, why: "불안을 자극하는 표현" },
  // "사주로 알아맞힌 것이 아닙니다" 같은 부정 안내는 허용한다
  {
    re: /(알아맞|꿰뚫어)(?![^.!?]{0,15}(아니|아닙|아님|않))|사주(에|가|로)\s*(이미|벌써)\s*(다\s*)?(나와|드러나|보여|정해)(?![^.!?]{0,12}(아니|아닙|아님|않))/,
    why: "알려 준 이야기를 사주로 맞힌 것처럼 쓰는 표현",
  },
];

/** focus 첫 문단은 고객이 알려 준 내용임을 밝혀야 한다 */
const CONTEXT_ATTRIBUTION = /(알려|말씀해|적어|남겨) 주신|말씀하신/;

const sentences = (text: string) =>
  text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 12);

const words = (s: string) => new Set(s.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1));

function overlap(a: string, b: string) {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

const isString = (v: unknown): v is string => typeof v === "string";
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

export function validateDraft(raw: unknown, evidence: Evidence[], opts: { hasContext?: boolean } = {}): ValidationResult {
  const errors: string[] = [];
  const known = new Map(evidence.map((e) => [e.id, e]));
  const periods = new Set(evidence.filter((e) => e.period).map((e) => e.period!.label));
  const d = raw as Partial<ReportDraftV2> | null;
  if (!d || typeof d !== "object") return { ok: false, errors: ["JSON 객체가 아닙니다."] };

  const checkIds = (ids: unknown, where: string) => {
    if (!isIds(ids) || ids.length === 0) {
      errors.push(`${where}: 근거 ID가 없습니다.`);
      return;
    }
    for (const id of ids) if (!known.has(id)) errors.push(`${where}: 없는 근거 ID ${id}`);
    if (ids.every((id) => known.get(id)?.uncertain)) errors.push(`${where}: 확실하지 않은 근거만으로 해석했습니다.`);
  };
  const checkParagraph = (p: Paragraph | undefined, where: string, min = 40, max = 700) => {
    if (!p || !isString(p.text)) {
      errors.push(`${where}: 문단 형식이 아닙니다.`);
      return;
    }
    const len = p.text.trim().length;
    if (len < min || len > max) errors.push(`${where}: 길이 ${len}자 (${min}~${max}자)`);
    checkIds(p.evidence, where);
  };
  const list = <T,>(v: unknown, where: string, min: number, max: number): T[] => {
    if (!Array.isArray(v)) {
      errors.push(`${where}: 목록이 아닙니다.`);
      return [];
    }
    if (v.length < min || v.length > max) errors.push(`${where}: ${v.length}개 (${min}~${max}개)`);
    return v as T[];
  };

  if (!isString(d.headline) || d.headline.trim().length < 8 || d.headline.trim().length > 60) errors.push("headline: 8~60자 한 문장이어야 합니다.");
  list<Paragraph>(d.summary, "summary", 1, 3).forEach((p, i) => checkParagraph(p, `summary[${i}]`));

  const sections = list<{ id: string; paragraphs: Paragraph[] }>(d.sections, "sections", SECTION_PLAN.length, SECTION_PLAN.length);
  for (const plan of SECTION_PLAN) {
    const s = sections.find((x) => x?.id === plan.id);
    if (!s) {
      errors.push(`sections: ${plan.id}(${plan.title})가 없습니다.`);
      continue;
    }
    list<Paragraph>(s.paragraphs, `sections.${plan.id}`, 1, 4).forEach((p, i) => checkParagraph(p, `sections.${plan.id}[${i}]`));
  }

  list<ReportDraftV2["timeline"][number]>(d.timeline, "timeline", periods.size ? 1 : 0, 6).forEach((t, i) => {
    const where = `timeline[${i}]`;
    if (!t || !isString(t.period) || !isString(t.theme) || !isString(t.opportunity) || !isString(t.caution)) {
      errors.push(`${where}: period · theme · opportunity · caution이 필요합니다.`);
      return;
    }
    if (!periods.has(t.period)) errors.push(`${where}: 계산된 시기가 아닙니다 (${t.period}). 근거의 period.label만 쓸 수 있습니다.`);
    checkIds(t.evidence, where);
    if (t.evidence?.some((id) => known.get(id) && !known.get(id)!.period)) errors.push(`${where}: 시기 근거가 아닌 ID로 시기를 설명했습니다.`);
  });

  list<Paragraph>(d.differences, "differences", 0, 3).forEach((p, i) => checkParagraph(p, `differences[${i}]`));

  const actions = list<ReportDraftV2["actions"][number]>(d.actions, "actions", 3, 5);
  actions.forEach((a, i) => {
    if (!a || !isString(a.situation) || !isString(a.action)) errors.push(`actions[${i}]: situation · action이 필요합니다.`);
    else checkIds(a.evidence, `actions[${i}]`);
  });
  for (let i = 0; i < actions.length; i++) {
    for (let j = i + 1; j < actions.length; j++) {
      if (actions[i]?.action && actions[j]?.action && overlap(actions[i].action, actions[j].action) > 0.7) {
        errors.push(`actions[${i}]와 actions[${j}]가 거의 같습니다 — 서로 다른 상황 · 행동으로 바꿔 주세요.`);
      }
    }
  }

  // 알려 주신 고민 (나를 더 반영하기)
  if (opts.hasContext) {
    const focus = list<Paragraph>(d.focus, "focus", 1, 3);
    focus.forEach((p, i) => checkParagraph(p, `focus[${i}]`, 80, 700));
    if (focus[0] && isString(focus[0].text) && !CONTEXT_ATTRIBUTION.test(focus[0].text)) {
      errors.push("focus[0]: 고객이 알려 준 내용임을 밝히며 시작해야 합니다 (예: \"알려 주신 고민을 반영하면\").");
    }
  } else if (Array.isArray(d.focus) && d.focus.length > 0) {
    errors.push("focus: 알려 주신 고민이 없는데 focus를 썼습니다.");
  }

  // 표현 검사와 반복 문장 검사 (리포트 전체)
  const texts: { where: string; text: string }[] = [];
  if (isString(d.headline)) texts.push({ where: "headline", text: d.headline });
  (d.summary ?? []).forEach((p, i) => isString(p?.text) && texts.push({ where: `summary[${i}]`, text: p.text }));
  sections.forEach((s) => (s?.paragraphs ?? []).forEach((p, i) => isString(p?.text) && texts.push({ where: `sections.${s.id}[${i}]`, text: p.text })));
  (d.timeline ?? []).forEach((t, i) => texts.push({ where: `timeline[${i}]`, text: [t?.theme, t?.opportunity, t?.caution].filter(isString).join(" ") }));
  (d.differences ?? []).forEach((p, i) => isString(p?.text) && texts.push({ where: `differences[${i}]`, text: p.text }));
  actions.forEach((a, i) => texts.push({ where: `actions[${i}]`, text: [a?.situation, a?.action].filter(isString).join(" ") }));
  (opts.hasContext && Array.isArray(d.focus) ? d.focus : []).forEach((p, i) => isString(p?.text) && texts.push({ where: `focus[${i}]`, text: p.text }));
  for (const { where, text } of texts) {
    for (const f of FORBIDDEN) if (f.re.test(text)) errors.push(`${where}: 쓰지 않는 표현 (${f.why})`);
  }
  const seen = new Map<string, string>();
  for (const { where, text } of texts) {
    for (const s of sentences(text)) {
      const key = s.replace(/[^\p{L}\p{N}]/gu, "");
      if (seen.has(key)) errors.push(`${where}: 같은 문장이 반복됩니다 (${seen.get(key)}와 같음)`);
      else seen.set(key, where);
    }
  }

  return errors.length ? { ok: false, errors: [...new Set(errors)].slice(0, 30) } : { ok: true, draft: d as ReportDraftV2 };
}
