// 사주 용어 사용 검사 — "용어 0건"이 아니라 "설명 없는 용어 나열 · 근거 없는 판정 0건"을 확인한다(운영자 2026-10-16).
//   · 풀이에 필요한 용어는 쓸 수 있다. 처음 쓸 때 쉬운 풀이를 바로 붙인다("월령(태어난 달의 기운)", "일간이란 나 자신을 나타내는 글자예요").
//   · 한 문장에 용어 두 개까지(세 개 이상 늘어놓으면 풀이가 아니라 용어 나열이 된다).
//   · 엔진이 계산한 근거가 있는 용어만 이 사람의 것으로 쓴다: 월령 · 지장간 · 통근 · 투간 · 조후는 근거 ID(saju.structure.*)가 있을 때만, 신강 · 신약은 강약 후보가 한쪽으로 모였을 때만.
//   · 개인의 격국 · 용신 · 희신 · 기신 · 신살은 엔진이 계산하지 않으므로 근거 목록에 없으면 쓰지 않는다(이 사람의 판정으로 만들어 내지 않는다).
// 낱말 · 문장을 센 어림이다 — 설명이 정말 쉬운지, 용어가 풀이에 도움이 되는지는 사람이 읽는 평가로 본다.
import type { Evidence } from "../evidence.ts";
import { TERM_LIMITS } from "./plan.ts";

type TermClass = "explain" | "structure" | "verdict-strength" | "never";
type Term = { name: string; re: RegExp; cls: TermClass; /** 이 용어를 쓰려면 있어야 하는 근거 ID 가운데 하나(uncertain이 아닌 것) */ needs?: string[] };

const term = (name: string, re: RegExp, cls: TermClass, needs?: string[]): Term => ({ name, re, cls, needs });

/** 설명과 함께 쓸 수 있는 용어(전통 명리의 기본 낱말) — 일상어와 겹치는 말은 앞뒤 조건으로 걸리지 않게 한다 */
const EXPLAIN_TERMS: Term[] = [
  ["비겁", /비겁/], ["식상", /식상/], ["관성", /관성/], ["인성", /인성/], ["재성", /재성/],
  ["정관", /정관/], ["편관", /편관/], ["비견", /비견/], ["겁재", /겁재/], ["식신", /식신/],
  ["상관", /상관(?!없|이 없)/], ["편재", /편재/], ["정재", /정재/], ["정인", /정인/], ["편인", /편인(?![데지가])/],
  ["일지", /(?<![가-힣])일지(?![도가-힣])/], ["일간", /일간/], ["천간", /천간/], ["지지", /(?<![가-힣])지지(?![가-힣])/],
  ["원국", /원국/], ["오행", /오행/], ["세운", /세운(?=[은는이가을를의에도(·,)]|$)/], ["대운", /대운/], ["십신", /십신/],
].map(([n, re]) => term(n as string, re as RegExp, "explain"));

/** 구조 분석 근거(saju.structure.*)가 있을 때만 이 사람의 것으로 쓸 수 있는 용어 */
const STRUCTURE_TERMS: Term[] = [
  term("월령", /월령/, "structure", ["saju.structure.month"]),
  term("득령", /득령/, "structure", ["saju.structure.month"]),
  term("실령", /실령/, "structure", ["saju.structure.month"]),
  term("지장간", /지장간/, "structure", ["saju.structure.hidden"]),
  term("통근", /통근(?! ?(?:시간|버스|길|거리|열차|지하철|수단)|하)/, "structure", ["saju.structure.roots"]),
  term("투간", /투간/, "structure", ["saju.structure.roots"]),
  term("조후", /조후/, "structure", ["saju.structure.johu"]),
];

/** 강약 후보가 한쪽으로 모였을 때만(갈림이 아닐 때만) 쓸 수 있는 판정 용어 */
const STRENGTH_TERMS: Term[] = [term("신강", /신강/, "verdict-strength", ["saju.structure.strength"]), term("신약", /신약(?! ?(?:개발|연구|후보|회사|임상|시험))/, "verdict-strength", ["saju.structure.strength"])];

/** 엔진이 계산하지 않는 개인 판정 — 근거 목록의 글에 그 낱말이 실제로 있을 때만 쓸 수 있다(지금은 없다) */
const NEVER_TERMS: Term[] = [
  term("격국", /격국/, "never"), term("용신", /용신/, "never"), term("희신", /희신/, "never"), term("기신", /기신/, "never"), term("신살", /신살/, "never"),
  ...["도화", "역마", "화개", "양인", "괴강", "백호", "홍염", "귀문"].map((n) => term(`${n}살`, new RegExp(`${n}살`), "never")),
];

export const ALL_TERMS: Term[] = [...EXPLAIN_TERMS, ...STRUCTURE_TERMS, ...STRENGTH_TERMS, ...NEVER_TERMS];

/** 낱말 뒤에 바로 붙은 괄호가 쉬운 풀이인지(한자만 있는 괄호는 풀이가 아니다) */
const PAREN_EXPLAIN = /^\s?\(([^)]{2,60})\)/;
const sentencesOf = (t: string) => t.match(/[^.!?。\n]+[.!?。]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [];

function explainedHere(name: string, sentence: string, after: string): boolean {
  const paren = PAREN_EXPLAIN.exec(after);
  if (paren && paren[1].replace(/[^가-힣]/g, "").length >= 4) return true; // 한글 풀이가 네 글자 이상(한자만 있는 괄호는 풀이가 아니다)
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`${escaped}(?:이란|란|이라는|라는|이라고 (?:해요|부르|불러|하는)|라고 (?:해요|부르|불러|하는)|이라 (?:부르|불러)|라 (?:부르|불러))`).test(sentence)) return true;
  if (new RegExp(`${escaped}(?:은|는|이|가)\\s*[^.!?]{0,40}(?:뜻해요|뜻이에요|말해요|가리켜요|의미해요|말이에요|을 말|를 말|를 뜻|을 뜻)`).test(sentence)) return true;
  return false;
}

/**
 * 화면에 보이는 글(읽는 순서)에서 사주 용어 사용을 확인해 오류 목록을 돌려준다.
 * 근거 목록은 이 리포트를 쓰는 데 건네는 evidence 전체이며, 어떤 용어를 이 사람의 것으로 쓸 수 있는지를 정한다.
 */
export function checkTermUse(texts: { where: string; text: string }[], evidence: Evidence[]): string[] {
  const errors: string[] = [];
  const usable = (ev: Evidence | undefined) => Boolean(ev) && !ev!.uncertain;
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const evidenceText = evidence.map((e) => `${e.fact} ${e.cue}`).join("\n");
  const explained = new Set<string>();

  for (const { where, text } of texts) {
    for (const sentence of sentencesOf(text)) {
      const distinct = new Set<string>();
      for (const t of ALL_TERMS) {
        const re = new RegExp(t.re.source, "g");
        let m: RegExpExecArray | null;
        while ((m = re.exec(sentence))) {
          distinct.add(t.name);
          const after = sentence.slice(m.index + m[0].length, m.index + m[0].length + 64);
          // 근거 없는 판정
          if (t.cls === "never" && !evidenceText.includes(m[0])) {
            errors.push(`${where}: 근거 목록에 없는 판정(${t.name}) — 이 사람의 ${t.name}은(는) 엔진이 계산하지 않아 쓸 수 없습니다. 근거 목록에 있는 월령 · 통근 · 강약 후보 같은 재료로 풀어 쓰세요.`);
            continue;
          }
          if (t.cls === "structure" && !(t.needs ?? []).some((id) => usable(byId.get(id)))) {
            errors.push(`${where}: 근거 목록에 없는 판정(${t.name}) — 이 사람의 ${t.name}은(는) 근거 목록(${(t.needs ?? []).join(", ")})이 없거나 달라질 수 있어서 쓸 수 없습니다.`);
            continue;
          }
          if (t.cls === "verdict-strength") {
            const ev = byId.get("saju.structure.strength");
            if (!usable(ev) || ev!.strength === "weak") {
              errors.push(`${where}: 근거 없는 판정(${t.name}) — 강약은 후보이고 요소가 한쪽으로 모였을 때만 말할 수 있습니다. "힘을 받는 쪽 · 덜 받는 쪽"처럼 요소를 풀어 쓰세요.`);
              continue;
            }
          }
          // 설명 없는 용어
          if (!explained.has(t.name)) {
            if (explainedHere(t.name, sentence, after)) explained.add(t.name);
            else errors.push(`${where}: 설명 없는 사주 용어(${t.name}) — 처음 쓸 때 "${t.name}(쉬운 풀이)"처럼 바로 풀어 쓰거나 쉬운 말로 바꿔 주세요.`);
          }
        }
      }
      if (distinct.size > TERM_LIMITS.perSentenceMax) errors.push(`${where}: 한 문장에 사주 용어가 ${distinct.size}개(${[...distinct].join(" · ")}) — 용어를 나열하지 말고 한 문장에 ${TERM_LIMITS.perSentenceMax}개까지만, 풀이 속에서 쓰세요.`);
    }
  }
  return errors;
}

// ───────────── 채팅 답의 용어 검사 ─────────────
// 채팅 답은 근거 ID 없이 저장된 풀이 글(known)을 근거로 한다. 규칙은 같은 방향이다 — 사용자가 용어를 물었거나(question) 구매한 리포트 방이면(allowTerms) 용어를 설명과 함께 쓸 수 있고,
// 무료 맛보기 방에서 묻지 않은 용어는 쉬운 말로 바꾼다. 이 사람의 것으로 말해도 되는 판정(월령 · 통근 · 강약 · 조후 · 격국 …)은 풀이 글(known)에 이미 그 낱말이 있을 때만이고,
// 풀이 글에 없는 것은 "무엇인지"를 일반 설명으로만 말하고 이 사람의 것처럼 쓰지 않는다("미유는 아직 계산하지 않아요"라고 밝히는 문장은 괜찮다).

/** 이 사람을 가리키는 말 — 이런 문장에서 판정 용어를 단정하면 개인 판정으로 읽는다 */
const PERSONAL_CUE = /(?:이 분|이분|이 사람|당신|님|내가|나는|내 |나의|제 )/;
/** 일반 개념을 설명하거나 "아직 계산하지 않았다 · 알 수 없다"고 밝히는 말 */
const GENERAL_CUE = /(?:보통|일반적으로|라고 (?:해요|부르|불러)|이란|란 |라는 (?:말|뜻|개념)|뜻|개념|계산하지|계산되지|아직|읽을 수 없|알 수 없|확인하지 못|정하지|판정하지|말하기 어려|없어요|없는|못 해요|못했|않아요|않았어요)/;

export function chatTermIssues(text: string, o: { question: string; allowTerms: boolean; known?: string }): string[] {
  const errors: string[] = [];
  const known = o.known ?? "";
  const explained = new Set<string>();
  for (const sentence of sentencesOf(text)) {
    const distinct = new Set<string>();
    for (const t of ALL_TERMS) {
      const re = new RegExp(t.re.source, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(sentence))) {
        distinct.add(t.name);
        const asked = new RegExp(t.re.source).test(o.question);
        if (!asked && !o.allowTerms) {
          errors.push(`사주 용어(${t.name})는 쓰지 않고 쉬운 말로 풀어 써 주세요(사용자가 물은 용어만 설명할 수 있어요).`);
          continue;
        }
        const after = sentence.slice(m.index + m[0].length, m.index + m[0].length + 64);
        if (!explained.has(t.name)) {
          if (explainedHere(t.name, sentence, after)) explained.add(t.name);
          else errors.push(`설명 없는 사주 용어(${t.name}) — 처음 쓸 때 "${t.name}(쉬운 풀이)"처럼 바로 풀어 쓰거나 쉬운 말로 바꿔 주세요.`);
        }
        // 이 사람의 것으로 말해도 되는 판정인가 — 풀이 글에 그 낱말이 없으면 일반 설명으로만
        if (t.cls !== "explain" && !known.includes(m[0]) && PERSONAL_CUE.test(sentence) && !GENERAL_CUE.test(sentence)) {
          errors.push(`근거 없는 판정(${t.name}) — 풀이 글에 없는 ${t.name}을(를) 이 분의 것처럼 쓰지 않습니다. 무엇인지 일반 설명만 하고, 미유가 아직 계산하지 않았다면 그렇게 밝혀 주세요.`);
        }
      }
    }
    if (distinct.size > TERM_LIMITS.perSentenceMax) errors.push(`한 문장에 사주 용어가 ${distinct.size}개(${[...distinct].join(" · ")}) — 용어를 나열하지 말고 한 문장에 ${TERM_LIMITS.perSentenceMax}개까지만 쓰세요.`);
  }
  return [...new Set(errors)];
}
