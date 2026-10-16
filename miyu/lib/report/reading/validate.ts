// 읽기 구조 리포트(AI 초안)의 형식 검사 — 근거 ID · 글자와 문장 수 · 쉬운 말 · 금지 표현 · 반복을 본다.
// 예시 화면(sample-reading-report.ts)이 이 검사를 그대로 통과해야 한다(sample-reading-report.test.ts) — 예시와 실제 생성의 기준이 같다.
// 한계: 낱말 · 길이 · 표지를 세는 검사다. 좋은 글임을 보증하지 않는다 (가려 읽는 평가가 따로 있다).
import type { Evidence } from "../evidence.ts";
import { FORBIDDEN, CONTEXT_ATTRIBUTION, overlap, sentences } from "../v2/validate.ts";
import { AGE_TEXT, ANSWER_ECHO, BLOCK_PLAN, CAUSE_NARROWING, HEDGE_REPEAT, JARGON, NO_DATA_TEXT, RAW_THEME_TEXT, READING_LIMITS as L, SCORE_TEXT } from "./plan.ts";
import type { ReadingDraftV1 } from "./types.ts";

export type ReadingValidation = { ok: true; draft: ReadingDraftV1 } | { ok: false; errors: string[] };

/** 시기 근거에서 고를 수 있는 시기 이름 — AI는 ref만 고르고, 화면에 보이는 이름(label)은 코드가 붙인다 */
export type PeriodRef = { ref: string; label: string; ids: string[] };

export function periodRefs(evidence: Evidence[]): PeriodRef[] {
  const out: PeriodRef[] = [];
  const idsOf = (prefix: string) => evidence.filter((e) => e.period && (e.id === prefix || e.id.startsWith(`${prefix}.`))).map((e) => e.id);
  const current = idsOf("saju.daeun.current");
  if (current.length) out.push({ ref: "current", label: "지금 지나는 시기", ids: current });
  const next = idsOf("saju.daeun.next");
  if (next.length) out.push({ ref: "next", label: "다음 시기", ids: next });
  const years = [...new Set(evidence.filter((e) => e.period).map((e) => /^saju\.seun\.(\d{4})/.exec(e.id)?.[1]).filter((y): y is string => Boolean(y)))].sort();
  for (const y of years) out.push({ ref: `y${y}`, label: `${y}년`, ids: idsOf(`saju.seun.${y}`) });
  return out;
}

/**
 * 시기 근거의 이름(period.label: "현재 대운 신미" · "다음 대운 경오" · "2026년 병오")을 읽는 사람 화면용 쉬운 이름으로 바꾼다 — 대운 · 간지는 본문에 쓰지 않는다.
 * 고민 반영 리포트가 시기 이름을 그대로 저장하던 것을 같은 규칙으로 맞춘다.
 */
export function plainPeriodLabel(label: string): string {
  if (/^현재 대운/.test(label)) return "지금 지나는 시기";
  if (/^다음 대운/.test(label)) return "다음 시기";
  const year = /^(\d{4})년/.exec(label);
  return year ? `${year[1]}년` : label;
}

const isString = (v: unknown): v is string => typeof v === "string";
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const countSentences = (t: string) => t.split(/(?<=[.!?])\s+/).filter(Boolean).length;

/** 화면에 그대로 보이는 글을 위치와 함께 모은다 (근거 ID · 시기 ref처럼 보이지 않는 값은 제외) */
export function visibleTexts(d: ReadingDraftV1): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const push = (where: string, text: unknown) => {
    if (isString(text) && text.trim()) out.push({ where, text });
  };
  push("headline", d.headline);
  for (const k of ["strength", "caution", "flow"] as const) {
    push(`cards.${k}.keyword`, d.cards?.[k]?.keyword);
    if (k !== "flow") push(`cards.${k}.note`, (d.cards?.[k] as { note?: string } | undefined)?.note);
  }
  for (const b of d.blocks ?? []) {
    const w = `blocks.${b?.id}`;
    push(`${w}.headline`, b?.headline);
    push(`${w}.summary`, b?.summary);
    push(`${w}.example`, b?.example);
    (b?.details ?? []).forEach((t, i) => push(`${w}.details[${i}]`, t));
    push(`${w}.watch`, b?.watch);
    (b?.sections ?? []).forEach((s, i) => {
      push(`${w}.sections[${i}].title`, s?.title);
      push(`${w}.sections[${i}].body`, s?.body);
      push(`${w}.sections[${i}].tryIt`, s?.tryIt);
    });
    (b?.traits ?? []).forEach((t, i) => {
      for (const f of ["name", "shinesShort", "burdenShort", "shines", "burden", "example"] as const) push(`${w}.traits[${i}].${f}`, t?.[f]);
    });
    (b?.comfort?.comfortable ?? []).forEach((t, i) => push(`${w}.comfort.comfortable[${i}]`, t));
    (b?.comfort?.clash ?? []).forEach((t, i) => push(`${w}.comfort.clash[${i}]`, t));
    if (b?.reactionFlow) {
      push(`${w}.reactionFlow.when`, b.reactionFlow.when);
      (b.reactionFlow.steps ?? []).forEach((s, i) => {
        push(`${w}.reactionFlow.steps[${i}].label`, s?.label);
        push(`${w}.reactionFlow.steps[${i}].text`, s?.text);
      });
      push(`${w}.reactionFlow.helpful`, b.reactionFlow.helpful);
    }
  }
  const f = d.flow;
  push("flow.headline", f?.headline);
  push("flow.summary", f?.summary);
  push("flow.cardText", f?.cardText);
  (f?.years ?? []).forEach((y, i) => push(`flow.years[${i}]`, `${y?.year ?? ""} ${y?.theme ?? ""}`));
  (f?.periods ?? []).forEach((p, i) => push(`flow.periods[${i}]`, `${p?.theme ?? ""} ${p?.watch ?? ""}`));
  (f?.scenarios ?? []).forEach((s, i) => push(`flow.scenarios[${i}]`, `${s?.when ?? ""} ${s?.then ?? ""}`));
  (d.actions ?? []).forEach((a, i) => push(`actions[${i}]`, `${a?.title ?? ""} ${a?.detail ?? ""}`));
  (d.focus ?? []).forEach((p, i) => push(`focus[${i}]`, p?.text));
  return out;
}

export function validateReadingDraft(raw: unknown, evidence: Evidence[], opts: { hasContext?: boolean } = {}): ReadingValidation {
  const errors: string[] = [];
  const d = raw as Partial<ReadingDraftV1> | null;
  if (!d || typeof d !== "object") return { ok: false, errors: ["JSON 객체가 아닙니다."] };
  const known = new Map(evidence.map((e) => [e.id, e]));
  const refs = periodRefs(evidence);
  const years = new Set(refs.filter((r) => r.ref.startsWith("y")).map((r) => r.ref.slice(1)));
  // 본문에 쓸 수 있는 해: 계산된 해(세운)와 대운 기간의 처음 · 끝 해
  const allowedYears = new Set<string>(years);
  for (const e of evidence) if (e.period) for (const y of [e.period.from.slice(0, 4), e.period.to.slice(0, 4)]) allowedYears.add(y);

  const text = (v: unknown, where: string, min: number, max: number): v is string => {
    if (!isString(v)) {
      errors.push(`${where}: 글이 없습니다.`);
      return false;
    }
    const len = v.trim().length;
    if (len < min || len > max) errors.push(`${where}: 길이 ${len}자 (${min}~${max}자)`);
    return true;
  };
  const ids = (v: unknown, where: string, opt: { needSaju?: boolean; period?: boolean } = {}) => {
    if (!isIds(v) || v.length === 0) {
      errors.push(`${where}: 근거 ID가 없습니다.`);
      return;
    }
    for (const id of v) if (!known.has(id)) errors.push(`${where}: 없는 근거 ID ${id}`);
    if (v.every((id) => known.get(id)?.uncertain)) errors.push(`${where}: 확실하지 않은 근거만으로 해석했습니다.`);
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
  const paragraphLike = (v: unknown, where: string, min: number, max: number, sentencesMax: number) => {
    if (text(v, where, min, max) && countSentences(v as string) > sentencesMax) errors.push(`${where}: ${countSentences(v as string)}문장 (${sentencesMax}문장 이하로 묶어 주세요)`);
  };

  text(d.headline, "headline", L.headline.min, L.headline.max);

  // 첫 화면 카드 3개
  for (const [k, label] of [["strength", "내가 강한 포인트"], ["caution", "내가 힘들 수 있는 포인트"], ["flow", "지금 나의 시기"]] as const) {
    const c = d.cards?.[k];
    if (!c) {
      errors.push(`cards.${k}(${label}): 카드가 없습니다.`);
      continue;
    }
    text(c.keyword, `cards.${k}.keyword`, 4, L.card.keywordMax);
    if (k !== "flow") text((c as { note?: string }).note, `cards.${k}.note`, L.card.noteMin, L.card.noteMax);
  }

  // 핵심 문장 · 카드는 공유용 카드 이미지에 그대로 실린다 — 이름을 쓰지 않는다 (이름은 다른 글에서만 가끔)
  for (const [where, v] of [["headline", d.headline], ["cards.strength.note", d.cards?.strength?.note], ["cards.strength.keyword", d.cards?.strength?.keyword], ["cards.caution.note", d.cards?.caution?.note], ["cards.caution.keyword", d.cards?.caution?.keyword], ["cards.flow.keyword", d.cards?.flow?.keyword]] as const) {
    if (isString(v) && /\{name\}|\s님[은는이가을를의]?(?![가-힣])/.test(v)) errors.push(`${where}: 이름을 쓰지 않습니다 (공유용 카드 이미지에 그대로 실립니다)`);
  }

  // 주제 5개
  const blocks = list<NonNullable<ReadingDraftV1["blocks"]>[number]>(d.blocks, "blocks", BLOCK_PLAN.length, BLOCK_PLAN.length);
  for (const plan of BLOCK_PLAN) {
    const b = blocks.find((x) => x?.id === plan.id);
    const w = `blocks.${plan.id}(${plan.topic})`;
    if (!b) {
      errors.push(`blocks: ${plan.id}(${plan.topic})가 없습니다.`);
      continue;
    }
    text(b.headline, `${w}.headline`, L.blockHeadline.min, L.blockHeadline.max);
    paragraphLike(b.summary, `${w}.summary`, L.summary.min, L.summary.max, L.summary.sentencesMax);
    if (isString(b.summary) && isString(b.headline) && b.summary.includes(b.headline.trim())) errors.push(`${w}: 요약이 제목을 그대로 되풀이합니다.`);
    if (plan.example) {
      paragraphLike(b.example, `${w}.example`, L.example.min, L.example.max, L.example.sentencesMax);
      if (isString(b.example) && isString(b.summary) && b.summary.includes(b.example.trim())) errors.push(`${w}: 예시가 요약과 같습니다.`);
    } else if (b.example) errors.push(`${w}.example: 이 주제는 예시를 따로 두지 않습니다 (${plan.traits ? "특징마다 예시가 있습니다" : "반응 단계 그림이 그 자리를 맡습니다"}).`);
    // 소단락이 있는 주제는 풀이를 소단락이 맡는다 — 자세한 풀이는 0~1문단, 살펴볼 점은 소단락마다 있는 해 볼 것으로 대신한다
    const deep = plan.sections;
    const details = list<string>(b.details, `${w}.details`, plan.traits || deep ? 0 : L.details.min, plan.traits ? 2 : deep ? 1 : L.details.max);
    details.forEach((t, i) => paragraphLike(t, `${w}.details[${i}]`, L.details.textMin, L.details.textMax, L.details.sentencesMax));
    if (deep) {
      if (b.watch !== undefined) text(b.watch, `${w}.watch`, L.watch.min, L.watch.max);
      const secs = list<NonNullable<typeof b.sections>[number]>(b.sections, `${w}.sections`, deep.length, deep.length);
      secs.forEach((s, i) => {
        const sw = `${w}.sections[${i}]`;
        text(s?.title, `${sw}.title`, L.sections.title.min, L.sections.title.max);
        paragraphLike(s?.body, `${sw}.body`, L.sections.body.min, L.sections.body.max, L.sections.body.sentencesMax);
        paragraphLike(s?.tryIt, `${sw}.tryIt`, L.sections.tryIt.min, L.sections.tryIt.max, L.sections.tryIt.sentencesMax);
      });
      if (new Set(secs.map((s) => s?.title)).size !== secs.length) errors.push(`${w}.sections: 소단락 제목이 겹칩니다.`);
      if (isString(b.headline) && secs.some((s) => isString(s?.title) && s.title.trim() === b.headline.trim())) errors.push(`${w}.sections: 소단락 제목이 주제 제목과 같습니다.`);
    } else {
      text(b.watch, `${w}.watch`, L.watch.min, L.watch.max);
      if (b.sections) errors.push(`${w}.sections: 이 주제는 소단락을 쓰지 않습니다.`);
    }

    if (plan.traits) {
      const traits = list<NonNullable<typeof b.traits>[number]>(b.traits, `${w}.traits`, L.trait.count, L.trait.count);
      traits.forEach((t, i) => {
        const tw = `${w}.traits[${i}]`;
        text(t?.name, `${tw}.name`, 3, L.trait.nameMax);
        text(t?.shinesShort, `${tw}.shinesShort`, 3, L.trait.shortMax);
        text(t?.burdenShort, `${tw}.burdenShort`, 3, L.trait.shortMax);
        text(t?.shines, `${tw}.shines`, L.trait.longMin, L.trait.longMax);
        text(t?.burden, `${tw}.burden`, L.trait.longMin, L.trait.longMax);
        paragraphLike(t?.example, `${tw}.example`, L.trait.exampleMin, L.trait.exampleMax, L.trait.exampleSentencesMax);
        if (isString(t?.shines) && isString(t?.burden) && /나쁘|잘못|문제가 있|단점|결함/.test(`${t.shines} ${t.burden}`)) errors.push(`${tw}: 특징을 좋고 나쁨으로 말하지 않습니다.`);
      });
      if (new Set(traits.map((t) => t?.name)).size !== traits.length) errors.push(`${w}.traits: 특징 이름이 겹칩니다.`);
      if (new Set(traits.map((t) => t?.example)).size !== traits.length) errors.push(`${w}.traits: 예시가 같은 장면입니다.`);
    } else if (b.traits) errors.push(`${w}.traits: 이 주제는 특징 카드를 쓰지 않습니다.`);

    if (plan.relation) {
      const c = b.comfort;
      for (const k of ["comfortable", "clash"] as const) {
        const items = list<string>(c?.[k], `${w}.comfort.${k}`, L.comfort.count, L.comfort.count);
        items.forEach((t, i) => text(t, `${w}.comfort.${k}[${i}]`, L.comfort.itemMin, L.comfort.itemMax));
      }
      const r = b.reactionFlow;
      if (!r) errors.push(`${w}.reactionFlow: 반응이 이어지는 모습이 없습니다.`);
      else {
        text(r.when, `${w}.reactionFlow.when`, 6, L.reactionFlow.whenMax);
        const steps = list<{ label: string; text: string }>(r.steps, `${w}.reactionFlow.steps`, L.reactionFlow.steps, L.reactionFlow.steps);
        steps.forEach((s, i) => {
          text(s?.label, `${w}.reactionFlow.steps[${i}].label`, 2, 12);
          text(s?.text, `${w}.reactionFlow.steps[${i}].text`, 4, L.reactionFlow.stepTextMax);
        });
        if (new Set(steps.map((s) => s?.label)).size !== steps.length) errors.push(`${w}.reactionFlow: 단계 이름이 겹칩니다.`);
        text(r.helpful, `${w}.reactionFlow.helpful`, L.reactionFlow.helpfulMin, L.reactionFlow.helpfulMax);
      }
    } else {
      if (b.comfort) errors.push(`${w}.comfort: 이 주제는 관계 스타일을 쓰지 않습니다.`);
      if (b.reactionFlow) errors.push(`${w}.reactionFlow: 이 주제는 반응 단계 그림을 쓰지 않습니다.`);
    }
    ids(b.evidence, `${w}.evidence`, { needSaju: true });
  }

  // 앞으로의 시기
  const f = d.flow;
  if (!f) errors.push("flow: 앞으로의 시기가 없습니다.");
  else {
    text(f.headline, "flow.headline", L.blockHeadline.min, L.flow.headlineMax);
    paragraphLike(f.summary, "flow.summary", L.flow.summaryMin, L.flow.summaryMax, 2);
    paragraphLike(f.cardText, "flow.cardText", L.flow.cardTextMin, L.flow.cardTextMax, 3);
    list<{ year: string; theme: string }>(f.years, "flow.years", refs.length ? L.flow.years.min : 0, L.flow.years.max).forEach((y, i) => {
      if (!isString(y?.year) || !years.has(y.year)) errors.push(`flow.years[${i}]: 계산된 해가 아닙니다 (${y?.year}). ${[...years].join(" · ") || "계산된 해 없음"}만 쓸 수 있습니다.`);
      text(y?.theme, `flow.years[${i}].theme`, 8, L.flow.years.themeMax);
    });
    const periods = list<{ ref: string; theme: string; watch: string }>(f.periods, "flow.periods", refs.length ? L.flow.periods.min : 0, L.flow.periods.max);
    const usedRefs = new Set<string>();
    periods.forEach((p, i) => {
      if (!isString(p?.ref) || !refs.some((r) => r.ref === p.ref)) errors.push(`flow.periods[${i}]: ref가 목록에 없습니다 (${p?.ref}). ${refs.map((r) => r.ref).join(" · ")} 가운데에서 고르세요.`);
      else if (usedRefs.has(p.ref)) errors.push(`flow.periods[${i}]: 같은 시기(${p.ref})를 두 번 썼습니다.`);
      else usedRefs.add(p.ref);
      text(p?.theme, `flow.periods[${i}].theme`, L.flow.periods.themeMin, L.flow.periods.themeMax);
      text(p?.watch, `flow.periods[${i}].watch`, L.flow.periods.watchMin, L.flow.periods.watchMax);
    });
    const scenarios = list<{ when: string; then: string }>(f.scenarios, "flow.scenarios", L.flow.scenarios.min, L.flow.scenarios.max);
    scenarios.forEach((s, i) => {
      text(s?.when, `flow.scenarios[${i}].when`, 10, L.flow.scenarios.whenMax);
      text(s?.then, `flow.scenarios[${i}].then`, 15, L.flow.scenarios.thenMax);
      if (isString(s?.then) && !/수 있(?:습니다|어요|죠)|수도 있(?:습니다|어요|죠)|일 수|가능성/.test(s.then)) errors.push(`flow.scenarios[${i}].then: 확률이 아닌 가능성으로 써 주세요 ("~할 수 있어요").`);
    });
    ids(f.evidence, "flow.evidence", { needSaju: true, period: refs.length > 0 });
  }

  // 실천
  const actions = list<NonNullable<ReadingDraftV1["actions"]>[number]>(d.actions, "actions", L.actions.min, L.actions.max);
  actions.forEach((a, i) => {
    text(a?.title, `actions[${i}].title`, 6, L.actions.titleMax);
    text(a?.detail, `actions[${i}].detail`, L.actions.detailMin, L.actions.detailMax);
    ids(a?.evidence, `actions[${i}].evidence`);
  });
  for (let i = 0; i < actions.length; i++) for (let j = i + 1; j < actions.length; j++) {
    if (actions[i]?.detail && actions[j]?.detail && overlap(actions[i].detail, actions[j].detail) > 0.7) errors.push(`actions[${i}]와 actions[${j}]가 거의 같습니다 — 서로 다른 상황 · 행동으로 바꿔 주세요.`);
  }

  // 알려 주신 고민 (내 고민 자세히 알려주기)
  if (opts.hasContext) {
    const focus = list<{ text: string; evidence: string[] }>(d.focus, "focus", L.focus.min, L.focus.max);
    focus.forEach((p, i) => {
      text(p?.text, `focus[${i}]`, L.focus.textMin, L.focus.textMax);
      ids(p?.evidence, `focus[${i}].evidence`, { needSaju: true });
    });
    if (focus[0] && isString(focus[0].text) && !CONTEXT_ATTRIBUTION.test(focus[0].text)) errors.push('focus[0]: 고객이 알려 준 내용임을 밝히며 시작해야 합니다 (예: "알려 주신 고민을 반영하면").');
  } else if (Array.isArray(d.focus) && d.focus.length > 0) errors.push("focus: 알려 주신 고민이 없는데 focus를 썼습니다.");

  // 쉬운 말 · 금지 표현 · 해 · 반복 (화면에 보이는 모든 글)
  const texts = visibleTexts(d as ReadingDraftV1);
  for (const { where, text: t } of texts) {
    if (JARGON.test(t)) errors.push(`${where}: 사주 전문 용어(${JARGON.exec(t)![0]})는 본문에 쓰지 않습니다 — 쉬운 말로 풀어 쓰고 용어는 근거로만 남깁니다.`);
    if (RAW_THEME_TEXT.test(t)) errors.push(`${where}: 해석 키워드 나열("${RAW_THEME_TEXT.exec(t)![0]}")을 그대로 옮기지 않습니다 — 쉬운 제목 → 생활에서 뜻하는 것 → 예시로 풀어 쓰세요(예: 배운 것을 일에 써 보는 것, 내 의견을 말하는 것).`);
    if (SCORE_TEXT.test(t)) errors.push(`${where}: 점수 · 퍼센트 · 확률 표현은 본문에 쓰지 않습니다.`);
    if (CAUSE_NARROWING.test(t)) errors.push(`${where}: 원인을 하나로 좁혀 말하지 않습니다 ("~때문이에요" 대신 "~일 수 있어요").`);
    if (ANSWER_ECHO.test(t)) errors.push(`${where}: 응답을 그대로 읽어 주는 말("${ANSWER_ECHO.exec(t)![0]}")을 쓰지 않습니다 — 사주에서 읽은 성향이 이 사람에게 어떤 장면으로 나타나는지로 풀어 쓰세요.`);
    if (HEDGE_REPEAT.test(t)) errors.push(`${where}: 풀이마다 "사주만으로는 알 수 없어요" 같은 경고를 붙이지 않습니다 — 조건("~할 때는")으로 풀이 안에 녹이세요(한계 안내는 한곳에 모읍니다).`);
    if (NO_DATA_TEXT.test(t)) errors.push(`${where}: 응답이나 자료가 없다는 말("${NO_DATA_TEXT.exec(t)![0]}")을 본문에 쓰지 않습니다 — 응답 근거가 없는 주제는 사주 근거만으로 풀이를 끝까지 쓰세요(필요한 안내는 코드가 한곳에 붙입니다).`);
    if (AGE_TEXT.test(t)) errors.push(`${where}: 나이를 쓰지 않습니다.`);
    for (const f of FORBIDDEN) if (f.re.test(t)) errors.push(`${where}: 쓰지 않는 표현 (${f.why})`);
    for (const y of t.match(/(?<![\d.])(?:19|20)\d{2}(?![\d.])/g) ?? []) if (!allowedYears.has(y)) errors.push(`${where}: 계산되지 않은 해 ${y}`);
    if (!opts.hasContext && /알려 주신/.test(t)) errors.push(`${where}: 고민을 알려 주지 않았는데 "알려 주신"을 썼습니다.`);
  }
  const seen = new Map<string, string>();
  for (const { where, text: t } of texts) {
    for (const s of sentences(t)) {
      const key = s.replace(/[^\p{L}\p{N}]/gu, "");
      if (seen.has(key)) errors.push(`${where}: 같은 문장이 반복됩니다 (${seen.get(key)}와 같음)`);
      else seen.set(key, where);
    }
  }

  return errors.length ? { ok: false, errors: [...new Set(errors)].slice(0, 30) } : { ok: true, draft: d as ReadingDraftV1 };
}
