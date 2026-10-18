// 같은 입력으로 받은 두 번의 실제 AI 글(story-7)을 같은 기준으로 나란히 보는 지표 — 호출 없이(0원) 저장된 원문만 읽는다(운영자 2026-10-18).
// 코드가 센 어림이다: 낱말 · 구절의 횟수와 검사 결과만 보여 주고 "어느 글이 좋은가"는 판정하지 않는다 — 풀이의 깊이 · 새로 알려 주는 정보 · 문체의 자연스러움 · 9,900원의 값어치는 글을 읽은 사람이 정한다(맨 아래 채점표).
import type { Evidence } from "../evidence.ts";
import { fortifyCandidatesOf, fortuneMentions, FORTIFY_TIE_VERDICT } from "../../saju/interpret/fortune.ts";
import { STORY7_SECTIONS } from "./story7-plan.ts";
import { story7Paragraphs, validateStory7Draft, visibleStory7Texts } from "./story7-validate.ts";
import type { Story7DraftV1 } from "./types.ts";

/** 조언처럼 되풀이되기 쉬운 낱말 — 운영자가 이전 글에서 지적한 "기준 세우기 · 거절하기 · 미리 정하기 · 혼자 감당" 계열 */
export const ADVICE_WORDS = ["기준", "거절", "미리", "혼자", "마감", "정리", "확인", "정해", "적어"] as const;

export type RunMetrics = {
  totalChars: number;
  chapters: { no: number; headline: string; chars: number; paragraphs: number; firstSentence: string; evidenceCount: number; personalIds: string[] }[];
  block: string[];
  warn: string[];
  adviceWords: { word: string; count: number; chapters: number[] }[];
  /** 같은 세 어절이 세 번 이상 나온 구절(되풀이 후보, 어절 단위 어림) */
  repeatedPhrases: { phrase: string; count: number }[];
  /** 같은 응답(survey.*) 근거를 앞세운 장 수가 가장 많은 것 */
  personalReuse: { id: string; chapters: number[] }[];
  fortify: { candidates: string[]; spoken: Record<string, { direction: boolean; color: boolean; number: boolean; place: boolean }>; tieVerdict: string | null };
  /** 대운 문장에 연도 + 월이 함께 있는가(시각 미상이면 BLOCK) */
  daeunMonthClaims: number;
  /** 운영자가 4차에서 보려는 네 가지(2026-10-18) — 과거 공감 · 연애 · 배우자운 · 재물운 · 시기별 풀이를 낱말 · 표현으로 센 어림 */
  focus: Focus;
};

export type FocusPart = { /** 해당 장(또는 전체)의 글자 수 */ chars: number; /** 해당 표현이 있는 문장 수 */ hits: number; /** 처음 나온 문장 몇 개(앞 90자) */ examples: string[] };
export type Focus = {
  /** 과거를 짚는 공감 문장(전체) — "그 무렵 · 지나온 · ~했을 수 있어요" 같은 표현 */
  past: FocusPart;
  /** 연애 · 배우자 이야기 문장(전체), 글자 수는 3번 장 */
  love: FocusPart;
  /** 재물 이야기 문장(전체), 글자 수는 5번 장 */
  wealth: FocusPart;
  /** 시기별 풀이 — 글자 수는 6번 장, hits는 전체 글의 "만 N세" 표기 수 */
  timing: FocusPart & { years: number; luck: number };
};

const PAST_MARK = /(그 무렵|그때|지나온|지나 온|지난 |돌아보|했을 (?:거예요|수|가능성)|였을 (?:거예요|수|가능성)|던 때|기억에)/;
const LOVE_MARK = /(배우자|연애|인연|애정|이성|짝)/;
const WEALTH_MARK = /(재물|돈|수입|재성|재운|저축|벌어|벌이)/;
const AGE_MARK = /만 \d+(?:~\d+)?세/g;

const sentencesOf = (t: string) => t.match(/[^.!?。\n]+[.!?。]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [];

export function runMetrics(draft: Story7DraftV1, evidence: Evidence[], opts: { hasContext?: boolean } = {}): RunMetrics {
  const personalIdsAll = new Set(evidence.filter((e) => e.id.startsWith("survey.")).map((e) => e.id));
  const sections = draft.sections ?? [];
  const textOf = (no: number) => {
    const s = sections.find((x) => Number(x.no) === no);
    return s ? story7Paragraphs(s).join("\n") : "";
  };
  const chapters = STORY7_SECTIONS.map((plan) => {
    const s = sections.find((x) => Number(x.no) === plan.no);
    const paras = s ? story7Paragraphs(s) : [];
    return {
      no: plan.no,
      headline: s?.headline ?? "",
      chars: paras.join("").length,
      paragraphs: paras.length,
      firstSentence: sentencesOf(paras[0] ?? "")[0] ?? "",
      evidenceCount: s?.evidence?.length ?? 0,
      personalIds: (s?.evidence ?? []).filter((id) => personalIdsAll.has(id)),
    };
  });
  const all = visibleStory7Texts(draft);
  const joined = all.map((x) => x.text).join("\n");
  const v = validateStory7Draft(draft, evidence, { hasContext: Boolean(opts.hasContext) });
  const adviceWords = ADVICE_WORDS.map((word) => ({
    word,
    count: joined.split(word).length - 1,
    chapters: STORY7_SECTIONS.filter((p) => textOf(p.no).includes(word)).map((p) => p.no),
  }));
  const grams = new Map<string, number>();
  const tokens = joined.split(/\s+/).map((t) => t.replace(/[.,!?'"“”‘’()·\-~:;]/g, "")).filter(Boolean);
  for (let i = 0; i + 2 < tokens.length; i++) {
    const g = tokens.slice(i, i + 3).join(" ");
    if (g.length >= 8) grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  const repeatedPhrases = [...grams.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([phrase, count]) => ({ phrase, count }));
  const reuse = new Map<string, number[]>();
  for (const c of chapters) for (const id of c.personalIds) reuse.set(id, [...(reuse.get(id) ?? []), c.no]);
  const personalReuse = [...reuse.entries()].map(([id, chs]) => ({ id, chapters: chs })).sort((a, b) => b.chapters.length - a.chapters.length).slice(0, 5);
  const candidates = fortifyCandidatesOf(evidence);
  const body6 = textOf(6);
  const spoken: RunMetrics["fortify"]["spoken"] = {};
  for (const el of candidates) spoken[el] = fortuneMentions(body6, el);
  const verdict = candidates.length > 1 ? FORTIFY_TIE_VERDICT.exec(joined)?.[0] ?? null : null;
  const daeunMonthClaims = all.filter((x) => /대운/.test(x.text)).flatMap((x) => sentencesOf(x.text)).filter((s) => /대운/.test(s) && /\d{4}년\s?\d{1,2}월/.test(s)).length;
  const allSentences = sentencesOf(joined);
  const part = (mark: RegExp, chars: number): FocusPart => {
    const hit = allSentences.filter((x) => mark.test(x));
    return { chars, hits: hit.length, examples: hit.slice(0, 2).map((x) => x.slice(0, 90)) };
  };
  const chars = (no: number) => chapters.find((c) => c.no === no)?.chars ?? 0;
  const ages = joined.match(AGE_MARK) ?? [];
  const focus: Focus = {
    past: part(PAST_MARK, joined.length),
    love: part(LOVE_MARK, chars(3)),
    wealth: part(WEALTH_MARK, chars(5)),
    timing: { chars: chars(6), hits: ages.length, examples: ages.slice(0, 4), years: (body6.match(/\d{4}년/g) ?? []).length, luck: (body6.match(/대운|세운/g) ?? []).length },
  };
  return { totalChars: joined.length, chapters, block: v.ok ? [] : v.errors, warn: v.warnings, adviceWords, repeatedPhrases, personalReuse, fortify: { candidates, spoken, tieVerdict: verdict }, daeunMonthClaims, focus };
}

/** 두 번의 글을 같은 지표로 나란히 — 마크다운(저장소에 올라가지 않는 결과 폴더에 쓴다) */
export function renderRunComparison(a: { label: string; metrics: RunMetrics }, b: { label: string; metrics: RunMetrics }): string {
  const A = a.metrics;
  const B = b.metrics;
  const L: string[] = [];
  L.push(`# 같은 입력의 두 글을 같은 기준으로 나란히 보기 (AI 호출 0회 · 0원)`);
  L.push(`- 이전: ${a.label} · 새 글: ${b.label}`);
  L.push("- 아래 숫자는 코드가 센 어림입니다. **좋은 글인지는 판정하지 않습니다** — 맨 아래 채점표는 글을 읽은 운영자가 직접 적습니다. 두 글 모두 **같은 검사(현재 코드)**로 봤고 BLOCK / WARN은 새 글의 근거 목록 기준입니다.");
  L.push("\n## 1. 크기와 장별 모양\n");
  L.push("| 장 | 이전 글자 · 문단 | 새 글자 · 문단 |", "| --- | --- | --- |");
  for (let i = 0; i < STORY7_SECTIONS.length; i++) L.push(`| ${STORY7_SECTIONS[i].no}번 ${STORY7_SECTIONS[i].title} | ${A.chapters[i].chars}자 · ${A.chapters[i].paragraphs}문단 | ${B.chapters[i].chars}자 · ${B.chapters[i].paragraphs}문단 |`);
  L.push(`| **전체** | ${A.totalChars.toLocaleString("ko-KR")}자 | ${B.totalChars.toLocaleString("ko-KR")}자 |`);
  L.push("\n## 2. 검사 결과 (BLOCK = 저장하지 않는 오류 / WARN = 저장을 막지 않는 경고)\n");
  L.push("| | 이전 | 새 글 |", "| --- | --- | --- |", `| BLOCK | ${A.block.length}건 | ${B.block.length}건 |`, `| WARN | ${A.warn.length}건 | ${B.warn.length}건 |`, `| 대운 문장의 연 + 월 표기 | ${A.daeunMonthClaims}곳 | ${B.daeunMonthClaims}곳 |`);
  for (const [label, m] of [["이전", A], ["새 글", B]] as const) {
    if (m.block.length) {
      L.push(`\n**${label} BLOCK**`);
      for (const e of m.block) L.push(`- ${e}`);
    }
  }
  L.push("\n## 3. 되풀이되기 쉬운 조언 낱말 — 몇 번 · 몇 개 장에 나왔나\n");
  L.push("낱말은 일상어와 겹치므로 횟수가 곧 반복은 아닙니다. 같은 결론을 새 정보 없이 되풀이하는지는 읽어서 정합니다.\n");
  L.push("| 낱말 | 이전 (횟수 · 장) | 새 글 (횟수 · 장) |", "| --- | --- | --- |");
  for (let i = 0; i < ADVICE_WORDS.length; i++) L.push(`| ${ADVICE_WORDS[i]} | ${A.adviceWords[i].count}번 · ${A.adviceWords[i].chapters.join(",") || "-"}장 | ${B.adviceWords[i].count}번 · ${B.adviceWords[i].chapters.join(",") || "-"}장 |`);
  const phrases = (m: RunMetrics) => (m.repeatedPhrases.length ? m.repeatedPhrases.map((p) => `"${p.phrase}" ${p.count}번`).join(" · ") : "없음");
  L.push(`\n- 같은 세 어절이 세 번 이상: 이전 ${phrases(A)} / 새 글 ${phrases(B)}`);
  const reuse = (m: RunMetrics) => (m.personalReuse.length ? m.personalReuse.map((p) => `${p.id} → ${p.chapters.join("·")}장`).join(", ") : "없음");
  L.push(`- 같은 응답 근거를 앞세운 장: 이전 ${reuse(A)} / 새 글 ${reuse(B)}`);
  L.push("\n## 4. 각 장의 첫 문장 — 핵심 사주풀이 결론으로 시작하는가(읽어서 판단)\n");
  L.push("| 장 | 이전 첫 문장 | 새 글 첫 문장 |", "| --- | --- | --- |");
  const cell = (s: string) => (s ? s.replace(/\|/g, "/").slice(0, 90) : "(없음)");
  for (let i = 0; i < STORY7_SECTIONS.length; i++) L.push(`| ${STORY7_SECTIONS[i].no}번 | ${cell(A.chapters[i].firstSentence)} | ${cell(B.chapters[i].firstSentence)} |`);
  L.push("\n## 4-2. 이번 시험에서 보려는 네 가지 — 과거 공감 · 연애 · 배우자운 · 재물운 · 시기별 풀이 (낱말 · 표현을 센 어림)\n");
  L.push("숫자는 해당 표현이 든 문장 수 · 장의 글자 수입니다. 많다고 좋은 풀이는 아니며, 아래 문장을 읽고 사람이 판단합니다.\n");
  L.push("| 보는 것 | 이전 | 새 글 |", "| --- | --- | --- |");
  L.push(`| 과거를 짚는 공감 문장 | ${A.focus.past.hits}문장 | ${B.focus.past.hits}문장 |`);
  L.push(`| 연애 · 배우자운 (3번 장 글자 수 · 관련 문장) | ${A.focus.love.chars}자 · ${A.focus.love.hits}문장 | ${B.focus.love.chars}자 · ${B.focus.love.hits}문장 |`);
  L.push(`| 재물운 (5번 장 글자 수 · 관련 문장) | ${A.focus.wealth.chars}자 · ${A.focus.wealth.hits}문장 | ${B.focus.wealth.chars}자 · ${B.focus.wealth.hits}문장 |`);
  L.push(`| 시기별 풀이 (6번 장 글자 수) | ${A.focus.timing.chars}자 | ${B.focus.timing.chars}자 |`);
  L.push(`| 시기별 — 전체 글의 "만 N세" 표기 · 6번 장의 연도 · 대운/세운 말 | ${A.focus.timing.hits}곳 · ${A.focus.timing.years}곳 · ${A.focus.timing.luck}곳 | ${B.focus.timing.hits}곳 · ${B.focus.timing.years}곳 · ${B.focus.timing.luck}곳 |`);
  const ex = (label: string, f: (m: RunMetrics) => string[]) => {
    L.push(`\n**${label} — 처음 나온 문장**`);
    for (const [who, m] of [["이전", A], ["새 글", B]] as const) L.push(`- ${who}: ${f(m).length ? f(m).map((x) => `"${x.replace(/\|/g, "/")}"`).join(" / ") : "(없음)"}`);
  };
  ex("과거 공감", (m) => m.focus.past.examples);
  ex("연애 · 배우자운", (m) => m.focus.love.examples);
  ex("재물운", (m) => m.focus.wealth.examples);
  ex("시기별 풀이(나이 표기)", (m) => m.focus.timing.examples);
  L.push("\n## 5. 개운(6번 장) — 보완 후보와 본문\n");
  const fort = (m: RunMetrics) => (m.fortify.candidates.length === 0 ? "근거 없음" : m.fortify.candidates.map((e) => `${e}: ${Object.entries(m.fortify.spoken[e]).filter(([, v]) => v).map(([k]) => ({ direction: "방향", color: "색", number: "숫자", place: "장소" })[k as "direction"]).join("·") || "대응 말 없음"}`).join(" / "));
  L.push(`- 후보와 본문이 말한 대응: 이전 ${fort(A)} / 새 글 ${fort(B)}`);
  L.push(`- 동점 후보를 하나로 정해 말한 표현: 이전 ${A.fortify.tieVerdict ?? "없음"} / 새 글 ${B.fortify.tieVerdict ?? "없음"}`);
  L.push("\n## 6. 글을 읽고 운영자가 직접 채점 (1~10, 이전 글의 전체 평가는 6.5)\n");
  L.push("| 기준 | 이전 | 새 글 | 메모 |", "| --- | --- | --- | --- |");
  for (const k of ["사주풀이의 깊이(연애 · 직업 · 재물 · 운세가 구체적인가)", "장마다 새로 알려 주는 정보가 있는가", "성격 · 기질 · 애착이 사주풀이를 풍부하게 만드는가", "같은 결론(기준 세우기 · 거절하기 등)이 반복되지 않는가", "자연스러운 해요체로 술술 읽히는가", "명리 근거와 본문이 일치하는가(계산값 대조)", "9,900원을 낼 만한가"]) L.push(`| ${k} | | | |`);
  L.push("| **전체** | 6.5 | | |");
  L.push("\n자동 검사 · 위 지표를 통과했다는 것은 판매 합격이 아닙니다. 사주 규칙은 전문가 검토 전입니다.");
  return L.join("\n") + "\n";
}
