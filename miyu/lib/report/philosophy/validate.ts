// AI가 돌려준 자기 이해 풀이(비교용 v0)의 형식 · 근거 · 표현 검사. 통과하지 못하면 이유를 알려 한 번 고쳐 쓰게 한다.
// 형식 검사는 개인 종합 리포트(v2)와 같은 금지 표현을 쓰고, 이 구조에서만 막는 것(지어낸 배경 · 결정 대신 내리기 · 고민이 없는데 "알려 주신")을 더한다.
// 낱말 · 표지를 보는 어림이며 좋은 글의 보증이 아니다.
import type { Evidence } from "../evidence.ts";
import { CONCRETE_ACT, CONDITION, QUANTITY } from "../v2/depth.ts";
import { CONTEXT_ATTRIBUTION, FORBIDDEN, sentences } from "../v2/validate.ts";
import type { PBlock, PhilosophicalDraftV0 } from "./types.ts";

export type PhilosophicalValidation = { ok: true; draft: PhilosophicalDraftV0 } | { ok: false; errors: string[] };

/** 지어낸 배경 · 부풀린 추상어 */
export const BACKSTORY = /트라우마|상처|전생|영혼|본질|진정한 자아|내면 깊|(어린 시절|유년|학창 시절|어릴 때)[^.!?]{0,15}(겪|있었|받았|자랐)|부모님|어머니|아버지/;
/** 결정을 대신 내리는 표현 */
export const VERDICT = /(하세요|하십시오)\s*[.!]?$|(옮기|남|그만두|시작하|헤어지|사귀|결혼하)(는 게|는 것이|는 편이) (맞|좋|낫)(습니다|아요|겠습니다)|(?:^|[.!?]\s*)(?:그|이)(?:게|것이)\s*(?:맞|정답)(?:습니다|아요|입니다)/;

const isString = (v: unknown): v is string => typeof v === "string";
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

export function validatePhilosophicalDraft(raw: unknown, evidence: Evidence[], opts: { hasConcern: boolean }): PhilosophicalValidation {
  const errors: string[] = [];
  const known = new Map(evidence.map((e) => [e.id, e]));
  const periods = new Set(evidence.filter((e) => e.period).map((e) => e.period!.label));
  const periodYears = new Set([...periods].map((p) => p.slice(0, 4)).concat(evidence.flatMap((e) => (e.fact.match(/\b20\d{2}\b/g) ?? []))));
  const d = raw as Partial<PhilosophicalDraftV0> | null;
  if (!d || typeof d !== "object") return { ok: false, errors: ["JSON 객체가 아닙니다."] };

  const ids = (v: unknown, where: string) => {
    if (!isIds(v) || v.length === 0) {
      errors.push(`${where}: 근거 ID가 없습니다.`);
      return;
    }
    for (const id of v) if (!known.has(id)) errors.push(`${where}: 없는 근거 ID ${id}`);
    if (v.every((id) => known.get(id)?.uncertain)) errors.push(`${where}: 확실하지 않은 근거만으로 해석했습니다.`);
  };
  const len = (v: unknown, where: string, min: number, max: number) => {
    if (!isString(v)) {
      errors.push(`${where}: 글이 아닙니다.`);
      return;
    }
    const n = v.trim().length;
    if (n < min || n > max) errors.push(`${where}: 길이 ${n}자 (${min}~${max}자)`);
  };
  const list = <T,>(v: unknown, where: string, min: number, max: number): T[] => {
    if (!Array.isArray(v)) {
      errors.push(`${where}: 목록이 아닙니다.`);
      return [];
    }
    if (v.length < min || v.length > max) errors.push(`${where}: ${v.length}개 (${min}~${max}개)`);
    return v as T[];
  };
  const block = (b: PBlock | undefined, where: string, min: number, max: number) => {
    if (!b || !isString(b.text)) {
      errors.push(`${where}: 문단 형식이 아닙니다.`);
      return;
    }
    len(b.text, where, min, max);
    ids(b.evidence, where);
  };

  len(d.headline, "headline", 8, 60);
  block(d.intro, "intro", 40, 300);
  if (isString(d.intro?.text) && !/가설/.test(d.intro.text)) errors.push('intro: 이 글이 근거에서 읽은 "가설"이라는 안내가 있어야 합니다.');
  if (opts.hasConcern && isString(d.intro?.text) && !CONTEXT_ATTRIBUTION.test(d.intro.text)) errors.push('intro: 알려 준 고민이 있으면 "알려 주신 내용"을 따로 표시했다는 안내가 있어야 합니다.');

  const values = list<NonNullable<PhilosophicalDraftV0["values"]>[number]>(d.values, "values", 3, 3);
  values.forEach((v, i) => {
    if (!v || !isString(v.title) || v.title.trim().length < 3 || v.title.trim().length > 60) errors.push(`values[${i}].title: 3~60자 이름이 필요합니다.`);
    block(v, `values[${i}]`, 150, 600);
  });

  const conflicts = list<NonNullable<PhilosophicalDraftV0["conflicts"]>[number]>(d.conflicts, "conflicts", 2, 3);
  conflicts.forEach((c, i) => {
    if (!c || !isString(c.title)) errors.push(`conflicts[${i}].title이 필요합니다.`);
    if (!c || !Array.isArray(c.between) || c.between.length !== 2 || !c.between.every(isString)) errors.push(`conflicts[${i}].between: 서로 부딪히는 두 마음 두 개가 필요합니다.`);
    block(c, `conflicts[${i}]`, 120, 500);
    if (c && isIds(c.evidence) && c.evidence.every((id) => known.has(id))) {
      const sources = new Set(c.evidence.map((id) => known.get(id)!.source === "saju"));
      if (sources.size < 2) errors.push(`conflicts[${i}]: 사주 근거와 응답 근거를 함께 달아 주세요.`);
    }
  });
  block(d.disagreement, "disagreement", 50, 400);
  if (isString(d.disagreement?.text) && !/합치지|하나의 결론/.test(d.disagreement.text)) errors.push("disagreement: 하나의 결론으로 합치지 않는다는 말이 있어야 합니다.");

  const sc = list<NonNullable<PhilosophicalDraftV0["strengthCost"]>[number]>(d.strengthCost, "strengthCost", 2, 3);
  sc.forEach((s, i) => {
    const where = `strengthCost[${i}]`;
    if (!s) return;
    len(s.strength, `${where}.strength`, 6, 60);
    len(s.when, `${where}.when`, 6, 100);
    len(s.cost, `${where}.cost`, 10, 120);
    len(s.reading, `${where}.reading`, 40, 300);
    ids(s.evidence, where);
  });

  if (opts.hasConcern) {
    const ch = list<NonNullable<PhilosophicalDraftV0["choices"]>[number]>(d.choices, "choices", 2, 4);
    ch.forEach((c, i) => {
      const where = `choices[${i}]`;
      if (!c) return;
      len(c.option, `${where}.option`, 6, 80);
      len(c.protects, `${where}.protects`, 10, 200);
      len(c.costs, `${where}.costs`, 10, 200);
      len(c.check, `${where}.check`, 30, 400);
      ids(c.evidence, where);
    });
    len(d.noVerdict, "noVerdict", 30, 200);
    if (isString(d.noVerdict) && !/정하지 않/.test(d.noVerdict)) errors.push("noVerdict: 어느 쪽이 맞는지 정하지 않는다는 말이 있어야 합니다.");
  } else {
    if (d.choices !== undefined && !(Array.isArray(d.choices) && d.choices.length === 0)) errors.push("choices: 알려 준 고민이 없으므로 쓰지 않습니다.");
    if (d.noVerdict !== undefined && d.noVerdict !== "") errors.push("noVerdict: 알려 준 고민이 없으므로 쓰지 않습니다.");
  }

  block(d.flow, "flow", 80, 500);
  if (isString(d.flow?.text)) {
    if (!/일어난다는 뜻은 아닙니다|예언/.test(d.flow.text)) errors.push("flow: 사건을 예언하지 않는다는 말(\"어떤 일이 일어난다는 뜻은 아닙니다\")이 있어야 합니다.");
    for (const y of d.flow.text.match(/\b20\d{2}\b/g) ?? []) if (!periodYears.has(y)) errors.push(`flow: 계산된 시기에 없는 해(${y})를 썼습니다.`);
    if (d.flow.evidence?.some((id) => known.get(id) && !known.get(id)!.period)) errors.push("flow: 시기 근거(period가 있는 근거)가 아닌 ID로 시기를 설명했습니다.");
  }

  const qa = list<NonNullable<PhilosophicalDraftV0["questionsActions"]>[number]>(d.questionsActions, "questionsActions", 4, 5);
  qa.forEach((q, i) => {
    const where = `questionsActions[${i}]`;
    if (!q) return;
    len(q.when, `${where}.when`, 6, 80);
    if (isString(q.when) && !CONDITION.test(q.when)) errors.push(`${where}.when: "~할 때"처럼 어떤 때인지가 보여야 합니다.`);
    len(q.question, `${where}.question`, 8, 150);
    if (isString(q.question) && !/\?\s*$/.test(q.question)) errors.push(`${where}.question: 물음표로 끝나는 질문이어야 합니다.`);
    len(q.action, `${where}.action`, 15, 300);
    if (isString(q.action) && !(QUANTITY.test(q.action) && CONCRETE_ACT.test(q.action))) errors.push(`${where}.action: 시점이나 분량과 구체적인 행동이 보여야 합니다.`);
    ids(q.evidence, where);
  });

  // 표현 검사와 반복 문장 검사 (글 전체)
  const texts: { where: string; text: string }[] = [];
  const push = (where: string, ...parts: unknown[]) => texts.push({ where, text: parts.filter(isString).join(" ") });
  push("headline", d.headline);
  push("intro", d.intro?.text);
  (d.values ?? []).forEach((v, i) => push(`values[${i}]`, v?.title, v?.text));
  (d.conflicts ?? []).forEach((c, i) => push(`conflicts[${i}]`, c?.title, c?.text));
  push("disagreement", d.disagreement?.text);
  (d.strengthCost ?? []).forEach((s, i) => push(`strengthCost[${i}]`, s?.strength, s?.when, s?.cost, s?.reading));
  (d.choices ?? []).forEach((c, i) => push(`choices[${i}]`, c?.option, c?.protects, c?.costs, c?.check));
  push("flow", d.flow?.text);
  push("noVerdict", d.noVerdict);
  (d.questionsActions ?? []).forEach((q, i) => push(`questionsActions[${i}]`, q?.when, q?.question, q?.action));
  for (const { where, text } of texts) {
    for (const f of FORBIDDEN) if (f.re.test(text)) errors.push(`${where}: 쓰지 않는 표현 (${f.why})`);
    if (BACKSTORY.test(text)) errors.push(`${where}: 지어낸 배경 · 부풀린 추상어를 쓰지 않습니다.`);
    if (VERDICT.test(text.trim())) errors.push(`${where}: 결정을 대신 내리는 표현입니다.`);
    if (!opts.hasConcern && /알려 주신|말씀해 주신/.test(text)) errors.push(`${where}: 알려 준 고민이 없는데 "알려 주신"이라고 썼습니다.`);
  }
  if (opts.hasConcern) {
    const told = [...(d.values ?? []), ...(d.conflicts ?? [])].filter((b) => b && isString(b.text) && /알려 주신|말씀하신/.test(b.text)).length;
    if (told < 2) errors.push('알려 준 고민을 말하는 해석 문단(values · conflicts)에서 "알려 주신"으로 밝힌 것이 2곳 이상 있어야 합니다.');
  }
  const seen = new Map<string, string>();
  for (const { where, text } of texts) {
    for (const s of sentences(text)) {
      const key = s.replace(/[^\p{L}\p{N}]/gu, "");
      if (seen.has(key)) errors.push(`${where}: 같은 문장이 반복됩니다 (${seen.get(key)}와 같음)`);
      else seen.set(key, where);
    }
  }

  return errors.length ? { ok: false, errors: [...new Set(errors)].slice(0, 30) } : { ok: true, draft: d as PhilosophicalDraftV0 };
}
