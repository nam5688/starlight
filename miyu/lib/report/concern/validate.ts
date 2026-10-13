// AI가 돌려준 고민 반영 리포트 초안의 형식 · 근거 · 표현 검사. 통과하지 못하면 저장하지 않고 다시 쓰게 한다.
// (형식 검사는 개인 종합 리포트(v2)와 같은 금지 표현 · 근거 규칙을 쓴다. 고민이 실제로 반영됐는지는 depth.ts가 따로 본다.)

import type { Evidence } from "../evidence.ts";
import { CONTEXT_ATTRIBUTION, FORBIDDEN, overlap, sentences } from "../v2/validate.ts";
import type { Paragraph } from "../v2/types.ts";
import type { ConcernDraftV1 } from "./types.ts";

export type ConcernValidation = { ok: true; draft: ConcernDraftV1 } | { ok: false; errors: string[] };

/** 고민 리포트에서만 더 막는 표현 — 만남 시기 · 상대의 조건을 예언하지 않는다 */
const CONCERN_FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /(만나게 될|만날 것|인연이 (올|온다|닿))[^.!?]{0,20}(날|시기|달|해)/, why: "만남 시기 예언" },
  { re: /(상대|그 사람|배우자)[^.!?]{0,12}(나이|직업|연봉|학벌)[^.!?]{0,12}(입니다|일 것|일 거|이에요)/, why: "상대의 나이 · 직업 예측" },
];

const isString = (v: unknown): v is string => typeof v === "string";
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

export function validateConcernDraft(raw: unknown, evidence: Evidence[]): ConcernValidation {
  const errors: string[] = [];
  const known = new Map(evidence.map((e) => [e.id, e]));
  const periods = new Set(evidence.filter((e) => e.period).map((e) => e.period!.label));
  const d = raw as Partial<ConcernDraftV1> | null;
  if (!d || typeof d !== "object") return { ok: false, errors: ["JSON 객체가 아닙니다."] };

  const checkIds = (ids: unknown, where: string) => {
    if (!isIds(ids) || ids.length === 0) {
      errors.push(`${where}: 근거 ID가 없습니다.`);
      return;
    }
    for (const id of ids) if (!known.has(id)) errors.push(`${where}: 없는 근거 ID ${id}`);
    if (ids.every((id) => known.get(id)?.uncertain)) errors.push(`${where}: 확실하지 않은 근거만으로 해석했습니다.`);
  };
  const list = <T,>(v: unknown, where: string, min: number, max: number): T[] => {
    if (!Array.isArray(v)) {
      errors.push(`${where}: 목록이 아닙니다.`);
      return [];
    }
    if (v.length < min || v.length > max) errors.push(`${where}: ${v.length}개 (${min}~${max}개)`);
    return v as T[];
  };
  const len = (text: unknown, where: string, min: number, max: number) => {
    if (!isString(text)) {
      errors.push(`${where}: 글이 아닙니다.`);
      return;
    }
    const n = text.trim().length;
    if (n < min || n > max) errors.push(`${where}: 길이 ${n}자 (${min}~${max}자)`);
  };
  const paragraph = (p: Paragraph | undefined, where: string, min: number, max: number) => {
    if (!p || !isString(p.text)) {
      errors.push(`${where}: 문단 형식이 아닙니다.`);
      return;
    }
    len(p.text, where, min, max);
    checkIds(p.evidence, where);
  };

  if (!isString(d.headline) || d.headline.trim().length < 8 || d.headline.trim().length > 60) errors.push("headline: 8~60자 한 문장이어야 합니다.");

  const understanding = list<Paragraph>(d.understanding, "understanding", 1, 2);
  understanding.forEach((p, i) => paragraph(p, `understanding[${i}]`, 80, 500));
  if (understanding[0] && isString(understanding[0].text) && !CONTEXT_ATTRIBUTION.test(understanding[0].text)) {
    errors.push('understanding[0]: 고객이 알려 준 내용임을 밝히며 시작해야 합니다 (예: "알려 주신 고민을").');
  }
  list<Paragraph>(d.pattern, "pattern", 2, 3).forEach((p, i) => paragraph(p, `pattern[${i}]`, 120, 600));

  list<ConcernDraftV1["situations"][number]>(d.situations, "situations", 3, 5).forEach((s, i) => {
    const where = `situations[${i}]`;
    if (!s || !isString(s.situation) || !isString(s.reading) || !isString(s.suggestion)) {
      errors.push(`${where}: situation · reading · suggestion이 필요합니다.`);
      return;
    }
    len(s.situation, `${where}.situation`, 10, 220);
    len(s.reading, `${where}.reading`, 60, 520);
    len(s.suggestion, `${where}.suggestion`, 30, 420);
    checkIds(s.evidence, where);
  });

  list<ConcernDraftV1["timeline"][number]>(d.timeline, "timeline", periods.size ? 1 : 0, 3).forEach((t, i) => {
    const where = `timeline[${i}]`;
    if (!t || !isString(t.period) || !isString(t.theme) || !isString(t.opportunity) || !isString(t.caution)) {
      errors.push(`${where}: period · theme · opportunity · caution이 필요합니다.`);
      return;
    }
    if (!periods.has(t.period)) errors.push(`${where}: 계산된 시기가 아닙니다 (${t.period}). 근거의 period.label만 쓸 수 있습니다.`);
    checkIds(t.evidence, where);
    if (t.evidence?.some((id) => known.get(id) && !known.get(id)!.period)) errors.push(`${where}: 시기 근거가 아닌 ID로 시기를 설명했습니다.`);
  });

  list<Paragraph>(d.differences, "differences", 0, 2).forEach((p, i) => paragraph(p, `differences[${i}]`, 60, 500));

  const actions = list<ConcernDraftV1["actions"][number]>(d.actions, "actions", 4, 6);
  actions.forEach((a, i) => {
    const where = `actions[${i}]`;
    if (!a || !isString(a.situation) || !isString(a.action)) {
      errors.push(`${where}: situation · action이 필요합니다.`);
      return;
    }
    len(a.situation, `${where}.situation`, 6, 200);
    len(a.action, `${where}.action`, 15, 400);
    checkIds(a.evidence, where);
  });
  for (let i = 0; i < actions.length; i++) {
    for (let j = i + 1; j < actions.length; j++) {
      if (actions[i]?.action && actions[j]?.action && overlap(actions[i].action, actions[j].action) > 0.7) {
        errors.push(`actions[${i}]와 actions[${j}]가 거의 같습니다 — 서로 다른 상황 · 행동으로 바꿔 주세요.`);
      }
    }
  }

  // 표현 검사와 반복 문장 검사 (리포트 전체)
  const texts: { where: string; text: string }[] = [];
  const push = (where: string, ...parts: unknown[]) => texts.push({ where, text: parts.filter(isString).join(" ") });
  push("headline", d.headline);
  (d.understanding ?? []).forEach((p, i) => push(`understanding[${i}]`, p?.text));
  (d.pattern ?? []).forEach((p, i) => push(`pattern[${i}]`, p?.text));
  (d.situations ?? []).forEach((s, i) => push(`situations[${i}]`, s?.situation, s?.reading, s?.suggestion));
  (d.timeline ?? []).forEach((t, i) => push(`timeline[${i}]`, t?.theme, t?.opportunity, t?.caution));
  (d.differences ?? []).forEach((p, i) => push(`differences[${i}]`, p?.text));
  (d.actions ?? []).forEach((a, i) => push(`actions[${i}]`, a?.situation, a?.action));
  for (const { where, text } of texts) {
    for (const f of [...FORBIDDEN, ...CONCERN_FORBIDDEN]) if (f.re.test(text)) errors.push(`${where}: 쓰지 않는 표현 (${f.why})`);
  }
  const seen = new Map<string, string>();
  for (const { where, text } of texts) {
    for (const s of sentences(text)) {
      const key = s.replace(/[^\p{L}\p{N}]/gu, "");
      if (seen.has(key)) errors.push(`${where}: 같은 문장이 반복됩니다 (${seen.get(key)}와 같음)`);
      else seen.set(key, where);
    }
  }

  return errors.length ? { ok: false, errors: [...new Set(errors)].slice(0, 30) } : { ok: true, draft: d as ConcernDraftV1 };
}
