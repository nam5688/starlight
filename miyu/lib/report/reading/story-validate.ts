// 영역별 이야기(story-v1, AI 초안)의 형식 검사 — 근거 ID · 글자와 문장 수 · 영역마다 개인 성향 근거 연결 · MBTI 쓰임 · 시기 이야기는 흐름에만 · 행동은 마지막에만 · 쉬운 말 · 금지 표현 · 반복.
// 이전 읽기 구조(validate.ts)와 같은 글 규칙(textIssues)을 쓰고, 달라진 구조에 맞는 확인만 더한다. 예시(sample-story-report.ts)가 이 검사를 그대로 통과해야 한다.
// 0.2(운영자 2차 검토 2026-10-16): 영역의 첫 문단은 사주 용어 없이 이 사람의 모습부터 · 없는 기운/십성을 생활 기능의 부족이나 원인으로 풀지 않기 · 같은 개인 성향 근거를 세 영역 이상이 앞세우지 않기를 더했다.
// 한계: 낱말 · 길이 · 표지를 세는 검사다. 같은 결론을 말만 바꿔 되풀이하는 것(구조 반복)은 이 검사가 아니라 칸의 나눔(영역마다 하나의 연결)과 사람이 읽는 평가가 본다.
import type { Evidence } from "../evidence.ts";
import { CONTEXT_ATTRIBUTION, overlap } from "../v2/validate.ts";
import { READING_LIMITS as L, TERM_LIMITS } from "./plan.ts";
import { ABSENCE_MAPPING, FIRST_PARAGRAPH_TERMS_MAX, FORMULA_BUDGET, MBTI_AREAS, MONEY_WORDS, PERIOD_TALK, PERSONAL_REUSE, PROCESS_TALK, STORY_AREAS, STORY_FLOW_TOPIC, STORY_LIMITS as S, TASK_IMPERATIVE, TASK_PER_AREA_MAX } from "./story-plan.ts";
import { splitSentences } from "./story-motif.ts";
import { distinctTerms } from "./terms.ts";
import type { StoryDraftV1 } from "./types.ts";
import { allowedYearsOf, countSentences, periodRefs, textIssues } from "./validate.ts";

export type StoryValidation = { ok: true; draft: StoryDraftV1 } | { ok: false; errors: string[] };

const isString = (v: unknown): v is string => typeof v === "string";
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

/** 알파벳 네 글자 유형 코드 — 본문에 쓰지 않는다(입력한 MBTI는 "입력해 주신 성향"으로 부른다) */
const TYPE_CODE = /(?<![A-Za-z])[EI][NS][TF][JP](?![A-Za-z])/i;
/** 본문이 입력한 MBTI를 실제로 쓰고 있는가 — 근거 ID만 달고 본문에는 쓰지 않는 것을 막는 어림 */
const MBTI_MENTION = /입력(?:해|하)?\s*(?:주신|신|하신)|알려\s*주신|MBTI/;

/** 화면에 그대로 보이는 글을 위치와 함께 모은다 (근거 ID처럼 보이지 않는 값은 제외) */
export function visibleStoryTexts(d: StoryDraftV1): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const push = (where: string, text: unknown) => {
    if (isString(text) && text.trim()) out.push({ where, text });
  };
  push("headline", d.headline);
  for (const k of ["strength", "caution", "flow"] as const) {
    push(`cards.${k}.keyword`, d.cards?.[k]?.keyword);
    if (k !== "flow") push(`cards.${k}.note`, (d.cards?.[k] as { note?: string } | undefined)?.note);
  }
  for (const a of d.areas ?? []) {
    push(`areas.${a?.id}.headline`, a?.headline);
    (a?.paragraphs ?? []).forEach((t, i) => push(`areas.${a?.id}.paragraphs[${i}]`, t));
  }
  const f = d.flow;
  push("flow.headline", f?.headline);
  (f?.paragraphs ?? []).forEach((t, i) => push(`flow.paragraphs[${i}]`, t));
  (f?.years ?? []).forEach((y, i) => push(`flow.years[${i}]`, `${y?.year ?? ""} ${y?.theme ?? ""}`));
  (f?.scenarios ?? []).forEach((s, i) => push(`flow.scenarios[${i}]`, `${s?.when ?? ""} ${s?.then ?? ""}`));
  (d.focus ?? []).forEach((p, i) => push(`focus[${i}]`, p?.text));
  (d.actions ?? []).forEach((a, i) => push(`actions[${i}]`, `${a?.title ?? ""} ${a?.detail ?? ""}`));
  return out;
}

/**
 * 없는 기운 · 십성을 생활 기능의 부족이나 원인으로 풀지 않는다 — 한 문장에 이름 + 없음 + (기능어 또는 인과 연결)이 함께 있으면 막는다.
 * 영역별 이야기(story-v1)와 7개 대주제(story-7)가 같은 검사를 쓴다.
 */
/** 전통 해석으로 읽는 말이거나 조건형인 문장 — 사주 중심 풀이(7개 대주제)는 이런 문장은 막지 않는다 */
const TRADITION_FRAME = /(?:전통|읽혀요|읽어요|읽을 수|봐요|보는 해석|해석에서|수 있|기 쉬)/;

/**
 * 없는 기운 · 십성을 생활 기능의 부족이나 원인으로 단정하는 문장을 찾는다. `relaxed`(7개 대주제, 운영자 2026-10-17)에서는 "전통에서는 ~로 읽어요 · ~기 쉬워요 · ~할 수 있어요"처럼
 * 전통 해석이거나 조건형인 문장은 허용하고, 조건 없이 "~가 없어서 ~가 약해요 · ~를 못 해요"로 단정한 문장만 막는다.
 */
export function absenceErrors(paragraphs: unknown[], where: string, o: { relaxed?: boolean } = {}): string[] {
  const out: string[] = [];
  for (const p of paragraphs.filter(isString)) {
    for (const sentence of p.split(/(?<=[.!?])\s+/)) {
      if (!ABSENCE_MAPPING.kind.test(sentence) || !ABSENCE_MAPPING.absent.test(sentence)) continue;
      if (o.relaxed && TRADITION_FRAME.test(sentence)) continue;
      const hit = ABSENCE_MAPPING.gloss.exec(sentence) ?? ABSENCE_MAPPING.causal.exec(sentence) ?? (ABSENCE_MAPPING.allowedFrame.test(sentence) ? null : ABSENCE_MAPPING.causalLoose.exec(sentence));
      if (hit) out.push(`${where}: "${sentence.slice(0, 40)}…" — 원국에 없는 기운 · 십성을 생활 기능의 부족이나 원인("${hit[0]}")으로 풀지 않습니다. 근거는 "전통 해석에서 생활에서 채우라고 권하는 경우가 많다 · 시기에 그 주제가 크게 느껴질 수 있다"까지만 말하고, 이 사람의 행동은 응답 근거로 쓰세요.`);
    }
  }
  return out;
}

export function validateStoryDraft(raw: unknown, evidence: Evidence[], opts: { hasContext?: boolean } = {}): StoryValidation {
  const errors: string[] = [];
  const d = raw as Partial<StoryDraftV1> | null;
  if (!d || typeof d !== "object") return { ok: false, errors: ["JSON 객체가 아닙니다."] };
  const known = new Map(evidence.map((e) => [e.id, e]));
  const refs = periodRefs(evidence);
  const years = new Set(refs.filter((r) => r.ref.startsWith("y")).map((r) => r.ref.slice(1)));
  const allowedYears = allowedYearsOf(evidence);

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
  const paragraph = (v: unknown, where: string) => {
    if (text(v, where, S.paragraph.min, S.paragraph.max)) {
      const n = countSentences(v as string);
      if (n > S.paragraph.sentencesMax) errors.push(`${where}: ${n}문장 (${S.paragraph.sentencesMax}문장 이하로 묶어 주세요)`);
      const terms = distinctTerms(v as string);
      if (terms.length > TERM_LIMITS.perParagraphMax) errors.push(`${where}: 한 문단에 사주 용어가 ${terms.length}개(${terms.join(" · ")}) — 문단 하나에서 새 개념을 여럿 배우지 않게 ${TERM_LIMITS.perParagraphMax}개까지만 쓰고, 나머지는 쉬운 말로 바꾸세요.`);
    }
  };
  const tasks = (paragraphs: unknown[], where: string) => {
    const n = paragraphs.filter(isString).reduce((sum, p) => sum + p.split(/(?<=[.!?])\s+/).filter((s) => TASK_IMPERATIVE.test(s)).length, 0);
    if (n > TASK_PER_AREA_MAX) errors.push(`${where}: "~해 보세요" 같은 행동 과제 문장이 ${n}개 — 영역 본문에는 ${TASK_PER_AREA_MAX}개까지만 두고 구체적인 실천은 마지막 actions에 모으세요.`);
  };

  const absenceIssues = (paragraphs: unknown[], where: string) => errors.push(...absenceErrors(paragraphs, where));

  // 핵심 문장 · 첫 화면 카드 — 공유용 카드 이미지에 그대로 실리므로 이름을 쓰지 않는다
  text(d.headline, "headline", L.headline.min, L.headline.max);
  for (const [k, label] of [["strength", "내가 강한 포인트"], ["caution", "내가 힘들 수 있는 포인트"], ["flow", "지금 나의 시기"]] as const) {
    const c = d.cards?.[k];
    if (!c) {
      errors.push(`cards.${k}(${label}): 카드가 없습니다.`);
      continue;
    }
    text(c.keyword, `cards.${k}.keyword`, 4, L.card.keywordMax);
    if (k !== "flow") text((c as { note?: string }).note, `cards.${k}.note`, L.card.noteMin, L.card.noteMax);
  }
  for (const [where, v] of [["headline", d.headline], ["cards.strength.note", d.cards?.strength?.note], ["cards.strength.keyword", d.cards?.strength?.keyword], ["cards.caution.note", d.cards?.caution?.note], ["cards.caution.keyword", d.cards?.caution?.keyword], ["cards.flow.keyword", d.cards?.flow?.keyword]] as const) {
    if (isString(v) && /\{name\}|\s님[은는이가을를의]?(?![가-힣])/.test(v)) errors.push(`${where}: 이름을 쓰지 않습니다 (공유용 카드 이미지에 그대로 실립니다)`);
  }

  // 영역 — 핵심 · 가까운 관계 · 일과 재물
  const areas = list<NonNullable<StoryDraftV1["areas"]>[number]>(d.areas, "areas", STORY_AREAS.length, STORY_AREAS.length);
  const personal = evidence.filter((e) => (e.source === "survey" || e.source === "self") && !e.uncertain);
  const mbtiAvailable = personal.some((e) => e.id === "self.mbti");
  let mbtiAreas = 0;
  for (const plan of STORY_AREAS) {
    const a = areas.find((x) => x?.id === plan.id);
    const w = `areas.${plan.id}(${plan.topic})`;
    if (!a) {
      errors.push(`areas: ${plan.id}(${plan.topic})가 없습니다.`);
      continue;
    }
    text(a.headline, `${w}.headline`, S.areaHeadline.min, S.areaHeadline.max);
    const lim = S.paragraphs[plan.id];
    const paragraphs = list<string>(a.paragraphs, `${w}.paragraphs`, lim.min, lim.max);
    paragraphs.forEach((t, i) => paragraph(t, `${w}.paragraphs[${i}]`));
    // 첫 문단은 이 사람이 어떤 사람인지 일상의 말로 — 사주 용어는 둘째 문단부터(고객은 첫 장부터 용어를 배우러 온 것이 아니다)
    if (isString(paragraphs[0])) {
      const firstTerms = distinctTerms(paragraphs[0]);
      if (firstTerms.length > FIRST_PARAGRAPH_TERMS_MAX) errors.push(`${w}.paragraphs[0]: 첫 문단에 사주 용어(${firstTerms.join(" · ")})를 쓰지 않습니다 — 이 사람이 어떤 사람인지를 일상의 말로 먼저 쓰고, 그렇게 읽은 이유(사주)는 둘째 문단부터 쓰세요.`);
    }
    absenceIssues(paragraphs, w);
    // 일과 재물 영역에는 돈 이야기가 실제로 있어야 한다 — 작성 과정을 말하는 문장("근거가 약해 길게 풀지 않았어요")은 돈 이야기로 세지 않는다
    if (plan.id === "work-money") {
      const money = paragraphs.filter(isString).flatMap(splitSentences).filter((s) => !PROCESS_TALK.test(s)).join(" ");
      if (!MONEY_WORDS.test(money)) errors.push(`${w}: 일과 재물 영역에 돈 이야기가 없습니다 — 재물 해석 근거가 약하면 1~2문장으로 짧게, 평소 행동 경향(신중함 · 지속성 등)이 돈 앞의 선택(지출 · 저축 · 큰 결정)에서 어떻게 나타날 수 있는지를 조건형으로 쓰세요. "근거가 약해 다루지 않았다"고 쓰지 않습니다.`);
    }
    if (isString(a.headline) && paragraphs.some((t) => isString(t) && t.includes(a.headline.trim()))) errors.push(`${w}: 문단이 제목을 그대로 되풀이합니다 — 제목은 본문을 다 쓴 뒤의 결론이고 문단은 그 연결을 풀어 쓰는 글입니다.`);
    tasks(paragraphs, w);
    for (const t of paragraphs) if (isString(t) && PERIOD_TALK.test(t)) errors.push(`${w}: 시기 이야기("${PERIOD_TALK.exec(t)![0]}")는 "${STORY_FLOW_TOPIC}" 영역에만 씁니다 — 이 영역에서는 시기를 말하지 않고, 같은 이야기를 두 번 풀지 않습니다.`);
    ids(a.evidence, `${w}.evidence`, { needSaju: true });
    // 영역마다 그 영역과 맞닿는 개인 성향 근거(응답 · MBTI)를 연결한다 — 사주가 이 사람에게 어떻게 나타나는지 구체화하는 재료
    const pool = personal.filter((e) => e.topics.some((t) => plan.personalTopics.includes(t)));
    const cited = isIds(a.evidence) ? a.evidence.filter((id) => pool.some((e) => e.id === id)) : [];
    const need = Math.min(plan.personalMin, pool.length);
    if (cited.length < need) errors.push(`${w}.evidence: 이 영역과 맞닿는 개인 성향 근거(응답 · MBTI)를 ${need}개 이상 연결해 주세요 — 고를 수 있는 것: ${pool.map((e) => e.id).join(" · ")}`);
    const citesMbti = isIds(a.evidence) && a.evidence.includes("self.mbti");
    if (citesMbti) {
      mbtiAreas++;
      if (!paragraphs.some((t) => isString(t) && MBTI_MENTION.test(t))) errors.push(`${w}: 입력한 MBTI 근거를 달았는데 본문에서 쓰지 않았습니다 — "입력해 주신 성향까지 함께 보면 ~"처럼 이 영역의 장면을 구체화하는 데 쓰거나 근거에서 빼세요.`);
    }
  }
  // 같은 개인 성향 근거(MBTI 제외)를 세 영역 이상이 앞세우지 않는다 — 한 가지 응답이 모든 영역을 끌고 가면 글 전체가 한 모티프의 되풀이가 된다
  const nonMbti = personal.filter((e) => e.id !== "self.mbti");
  if (nonMbti.length >= PERSONAL_REUSE.minPoolToCheck) {
    const usedIn = new Map<string, string[]>();
    const addUse = (id: string, area: string) => usedIn.set(id, [...new Set([...(usedIn.get(id) ?? []), area])]);
    for (const a of areas) if (a && isIds(a.evidence)) for (const id of a.evidence) if (nonMbti.some((e) => e.id === id)) addUse(id, a.id);
    if (d.flow && isIds(d.flow.evidence)) for (const id of d.flow.evidence) if (nonMbti.some((e) => e.id === id)) addUse(id, "flow");
    for (const [id, where] of usedIn) if (where.length > PERSONAL_REUSE.maxAreas) errors.push(`areas: 개인 성향 근거 ${id}를 ${where.length}개 영역(${where.join(" · ")})이 앞세웠습니다 — 같은 응답이 모든 영역을 끌고 가면 글이 한 가지 모티프의 되풀이가 됩니다. ${PERSONAL_REUSE.maxAreas}개 영역까지만 쓰고, 나머지 영역은 그 영역에 맞닿는 다른 근거에서 출발하세요(사용자 메시지 areas[].personalEvidence가 영역마다 나눠 준 것).`);
  }
  if (mbtiAvailable && mbtiAreas < MBTI_AREAS.min) errors.push(`areas: 입력한 MBTI(self.mbti)를 핵심 · 가까운 관계 · 일과 재물 영역 가운데 ${MBTI_AREAS.min}곳 이상에 연결해 주세요 (지금 ${mbtiAreas}곳). 맞닿는 곳에서 한 영역에 한 번, 알파벳 글자 없이 "입력해 주신 성향"으로.`);

  // 영역 제목끼리 · 핵심 문장과 겹치지 않는다 — 영역마다 그 영역에서만 말하는 연결이어야 한다
  const heads = areas.filter((a) => isString(a?.headline)).map((a) => ({ id: a.id, h: a.headline }));
  for (let i = 0; i < heads.length; i++) for (let j = i + 1; j < heads.length; j++) {
    if (overlap(heads[i].h, heads[j].h) > S.headlineOverlapMax) errors.push(`areas.${heads[i].id}와 areas.${heads[j].id}: 제목이 거의 같은 말입니다 — 영역마다 그 영역에서만 말하는 연결을 쓰세요.`);
  }
  if (isString(d.headline)) for (const h of heads) if (overlap(d.headline, h.h) > 0.6) errors.push(`headline과 areas.${h.id}.headline이 거의 같은 말입니다 — 핵심 문장은 영역 제목을 옮기지 말고 이 사람의 중심이 되는 연결 하나를 쓰세요.`);

  // 현재와 앞으로의 흐름 — 시기 이야기는 여기에만 모은다
  const f = d.flow;
  if (!f) errors.push("flow: 현재와 앞으로의 흐름이 없습니다.");
  else {
    text(f.headline, "flow.headline", L.blockHeadline.min, S.flow.headlineMax);
    const fp = list<string>(f.paragraphs, "flow.paragraphs", S.paragraphs.flow.min, S.paragraphs.flow.max);
    fp.forEach((t, i) => paragraph(t, `flow.paragraphs[${i}]`));
    tasks(fp, "flow");
    absenceIssues(fp, "flow");
    list<{ year: string; theme: string }>(f.years, "flow.years", refs.length ? S.flow.years.min : 0, S.flow.years.max).forEach((y, i) => {
      // "2026"과 "2026년"을 모두 받는다(조립할 때 숫자 네 자리로 맞춘다) — 대리 작성기 두 건이 "2026년"으로 써서 해는 맞는데 형식만으로 걸렸다
      if (!isString(y?.year) || !years.has(y.year.replace(/\s*년$/, ""))) errors.push(`flow.years[${i}]: 계산된 해가 아닙니다 (${y?.year}). ${[...years].join(" · ") || "계산된 해 없음"}만 쓸 수 있습니다.`);
      text(y?.theme, `flow.years[${i}].theme`, 8, S.flow.years.themeMax);
    });
    list<{ when: string; then: string }>(f.scenarios, "flow.scenarios", S.flow.scenarios.min, S.flow.scenarios.max).forEach((s, i) => {
      text(s?.when, `flow.scenarios[${i}].when`, 10, S.flow.scenarios.whenMax);
      text(s?.then, `flow.scenarios[${i}].then`, 15, S.flow.scenarios.thenMax);
      if (isString(s?.then) && !/수 있(?:습니다|어요|죠)|수도 있(?:습니다|어요|죠)|일 수|가능성/.test(s.then)) errors.push(`flow.scenarios[${i}].then: 확률이 아닌 가능성으로 써 주세요 ("~할 수 있어요").`);
    });
    ids(f.evidence, "flow.evidence", { needSaju: true, period: refs.length > 0 });
    const flowPersonal = isIds(f.evidence) ? f.evidence.filter((id) => personal.some((e) => e.id === id && id !== "self.mbti")) : [];
    if (flowPersonal.length > 1) errors.push(`flow.evidence: 시기 풀이에는 개인 성향 근거를 하나까지만 연결합니다(지금 ${flowPersonal.length}개: ${flowPersonal.join(" · ")}) — 시기는 거의 사주만으로 쓰고, 이 사람이 시기를 받아들이는 모습 한 군데에만 씁니다.`);
    if (isIds(f.evidence) && f.evidence.includes("self.mbti")) errors.push('flow.evidence: 입력한 MBTI는 시기 풀이에 쓰지 않습니다(시기나 운 때문에 성향이 바뀐다고 읽히지 않게).');
  }

  // 알려 주신 고민
  if (opts.hasContext) {
    const focus = list<{ text: string; evidence: string[] }>(d.focus, "focus", L.focus.min, L.focus.max);
    focus.forEach((p, i) => {
      text(p?.text, `focus[${i}]`, L.focus.textMin, L.focus.textMax);
      ids(p?.evidence, `focus[${i}].evidence`, { needSaju: true });
    });
    if (focus[0] && isString(focus[0].text) && !CONTEXT_ATTRIBUTION.test(focus[0].text)) errors.push('focus[0]: 고객이 알려 준 내용임을 밝히며 시작해야 합니다 (예: "알려 주신 고민을 반영하면").');
  } else if (Array.isArray(d.focus) && d.focus.length > 0) errors.push("focus: 알려 주신 고민이 없는데 focus를 썼습니다.");

  // 지금 해 볼 행동 세 가지 — 앞 영역에서 나온 것을 한곳에 모은다
  const actions = list<NonNullable<StoryDraftV1["actions"]>[number]>(d.actions, "actions", S.actions.count, S.actions.count);
  const areaIds = new Set<string>([...STORY_AREAS.map((a) => a.id), "flow"]);
  actions.forEach((a, i) => {
    text(a?.title, `actions[${i}].title`, 6, S.actions.titleMax);
    text(a?.detail, `actions[${i}].detail`, S.actions.detailMin, S.actions.detailMax);
    ids(a?.evidence, `actions[${i}].evidence`);
    if (!isString(a?.area) || !areaIds.has(a.area)) errors.push(`actions[${i}].area: 어느 영역의 풀이에서 나온 행동인지 고르세요 (${[...areaIds].join(" · ")}).`);
  });
  if (actions.length === S.actions.count && new Set(actions.map((a) => a?.area)).size < 2) errors.push("actions: 행동 세 가지가 모두 같은 영역에서 나왔습니다 — 적어도 두 영역에서 나온 서로 다른 행동으로 모으세요.");
  for (let i = 0; i < actions.length; i++) for (let j = i + 1; j < actions.length; j++) {
    if (actions[i]?.detail && actions[j]?.detail && overlap(actions[i].detail, actions[j].detail) > 0.7) errors.push(`actions[${i}]와 actions[${j}]가 거의 같습니다 — 서로 다른 상황 · 행동으로 바꿔 주세요.`);
  }

  // 쉬운 말 · 금지 표현 · 해 · 반복 (화면에 보이는 모든 글 — 이전 형식과 같은 규칙)
  const texts = visibleStoryTexts(d as StoryDraftV1);
  // 영역 본문 · 흐름 문단 전체에서 같은 맺음 틀이 예산을 넘는지(표지를 센 어림)
  const bodyText = texts.filter((t) => /^(areas\.[\w-]+\.paragraphs|flow\.paragraphs)/.test(t.where)).map((t) => t.text).join("\n");
  for (const f of FORMULA_BUDGET) {
    const n = bodyText.match(f.re)?.length ?? 0;
    if (n > f.max) errors.push(`areas: "${f.label}"이(가) ${n}곳에 나와요(${f.max}곳까지) — 영역마다 같은 틀로 맺지 말고, 방향을 질문 · 기준 · 건넬 말 · 조건처럼 영역에 맞는 다른 모양으로 쓰세요.`);
  }
  // 글이 아니라 글을 쓴 사정을 말하는 문장 — 읽는 사람에게는 풀이가 아니라 빈칸이다
  for (const { where, text: t } of texts) {
    const hit = PROCESS_TALK.exec(t);
    if (hit) errors.push(`${where}: 작성 과정을 말하는 문장("${t.slice(Math.max(0, hit.index - 8), hit.index + hit[0].length).trim().slice(0, 50)}")은 쓰지 않습니다 — 쓸 것이 없으면 그 이야기를 하지 않고, 쓸 수 있는 근거로 이 사람의 모습을 풀어 쓰세요.`);
  }
  errors.push(...textIssues(texts, evidence, { allowedYears, hasContext: Boolean(opts.hasContext) }));
  for (const { where, text: t } of texts) if (TYPE_CODE.test(t)) errors.push(`${where}: 알파벳 유형 코드("${TYPE_CODE.exec(t)![0]}")를 쓰지 않습니다 — 입력한 MBTI는 "입력해 주신 성향"으로 부릅니다.`);

  return errors.length ? { ok: false, errors: [...new Set(errors)].slice(0, 30) } : { ok: true, draft: d as StoryDraftV1 };
}
