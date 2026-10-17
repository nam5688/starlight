// 미유 문체 — 말투 기준 · 문체 검사. 순수 계산이며 AI를 부르지 않는다(Next · 외부 SDK 없음).
//
// 목표(운영자 2026-10-17): 친한 친구처럼 자연스럽지만 가볍거나 유치하지 않은 해요체. 상담사가 진단서를 읽어 주는 느낌도, 무조건 공감만 하는 친구도 아니고, 필요한 말은 분명하게 하되 어렵거나 거창하게 설명하지 않는다.
// 그래서 이 검사는 "AI가 쓴 설명문처럼 읽히게 만드는 것"을 세되 **단어 하나가 나왔다고 실패시키지 않는다** — 맥락(예: 운의 흐름은 사주 설명에 필요한 말)과 반복 빈도로 판단한다.
//   · fail   — 분명한 위반이라 저장하지 않는다: 합쇼체 끝맺음 · 당신/귀하 · 금지 문구("함께 살펴봅니다" 등) · AI 어휘(서사 · 본질 · 양상 · 발현 · 입체적 · 구조적 …) · 억지 공감 질문("그랬죠?") · 이모지
//   · repair — 저장은 되지만 고쳐 쓰기를 부탁한다(고쳐 쓴 글이 형식 검사에서 떨어지면 첫 글을 쓴다): 추상어가 예산을 넘음 · 대조형 문장 틀의 반복 · 같은 문장 시작 · 같은 마무리 · 이름 호칭 반복 · 근거 문구를 그대로 옮김 · 시적 표현 · 느낌표
//   · review — 코드가 확신하지 못해 **사람이 읽어 판단**해야 하는 것: 같은 뜻을 되풀이한 것으로 의심되는 문장 쌍
// 한계: 낱말 · 표지 · 빈도를 센 어림이다. 말을 바꿔 되풀이한 문장 · 읽는 사람에게 AI처럼 느껴지는지 · 친근한지는 낱말로 못 가르므로 사람이 읽는 평가가 따로 본다(docs/voice-guide.md).
import { COMMON_STEMS } from "../reading/story-motif.ts";

export type VoiceText = { where: string; text: string };
export type VoiceLevel = "fail" | "repair" | "review";
export type VoiceFinding = { id: string; level: VoiceLevel; message: string; examples?: string[] };
export type VoiceMetrics = {
  chars: number;
  sentences: number;
  formal: number;
  tier1: Record<string, number>;
  abstractByWord: Record<string, number>;
  abstractTotal: number;
  contrast: Record<string, number>;
  /** 가장 많이 쓴 마무리 종류와 그 몫(문장 수 대비) */
  topEnding: { kind: string; count: number; share: number };
  topOpeners: { opener: string; count: number }[];
  nameCalls: number;
  hedgeWords: number;
};
export type VoiceReport = { findings: VoiceFinding[]; metrics: VoiceMetrics };

export const failsOf = (r: VoiceReport) => r.findings.filter((f) => f.level === "fail");
export const repairsOf = (r: VoiceReport) => r.findings.filter((f) => f.level === "repair");
export const reviewsOf = (r: VoiceReport) => r.findings.filter((f) => f.level === "review");

// ───────────────────────── 기준(지시문 · 검사 · 시험이 같은 값을 쓴다) ─────────────────────────

/** 분명히 AI 설명문 어휘 — 하나라도 나오면 자연스러운 일상 표현으로 다시 쓰게 한다(맥락 없이 쓸 일이 거의 없는 말) */
export const TIER1_WORDS: { word: string; re: RegExp }[] = [
  { word: "서사", re: /서사/ },
  { word: "본질", re: /본질/ },
  { word: "양상", re: /양상/ },
  { word: "발현", re: /발현/ },
  { word: "입체적", re: /입체적/ },
  { word: "구조적", re: /구조적/ },
  { word: "정서적 에너지", re: /정서적\s*에너지/ },
  { word: "조율의 과정", re: /조율의\s*과정/ },
  { word: "균형을 찾아가는 과정", re: /균형을\s*찾아가는\s*과정/ },
];

/** 금지 문구 — 해설자 말투("함께 살펴봅니다")와 진단서 말투("신호로 읽힙니다") */
export const BANNED_PHRASES: { phrase: string; re: RegExp }[] = [
  { phrase: "함께 살펴보(겠)", re: /함께\s*살펴(?:보겠|봅니다|보도록|볼게요|볼까요)/ },
  { phrase: "알아보겠", re: /알아보겠/ },
  { phrase: "짚어보겠", re: /짚어\s*보겠|짚어보겠/ },
  { phrase: "신호로 읽", re: /신호로\s*읽(?:힙니다|혀요|힐|히는|혀)/ },
];

/**
 * 추상어 — 한 리포트에서 말마다 예산 안에서만 쓴다. 어느 글에나 들어갈 수 있는 말이라 한두 번은 자연스럽지만 되풀이하면 분석 보고서 말투가 된다.
 * 사주 설명에 꼭 필요한 쓰임은 세지 않는다("운 · 대운 · 세운 · 시기 · 기운 · 돈의 흐름", 동사 "연결해요").
 */
export const ABSTRACT_WORDS: { word: string; re: RegExp }[] = [
  { word: "축", re: /(?<![가-힣])축(?=(?:이|을|은|도|의|에|으로)(?![가-힣])|\s|$)/g },
  { word: "흐름", re: /(?<!(?:운|시기|기운|돈|해|달)의 ?)흐름/g },
  { word: "지점", re: /지점/g },
  { word: "맥락", re: /맥락/g },
  { word: "결", re: /(?<![가-힣])결(?=(?:이|을|은|도|의|에)(?![가-힣])|\s|$)/g },
  { word: "내면", re: /내면/g },
  { word: "신호", re: /신호/g },
  { word: "조율", re: /조율/g },
  { word: "균형", re: /균형/g },
  { word: "연결", re: /연결(?!해|했|하|되|돼|시)/g },
  { word: "작용", re: /작용/g },
  { word: "에너지", re: /에너지/g },
];
/** 기준 길이(4,000자 · 심층 리포트 한 편)에서 말마다 · 모두 합쳐 쓸 수 있는 횟수 — 글이 짧으면 말마다 1번, 길면 비례해서 늘어난다 */
export const ABSTRACT_BUDGET = { perWord: 2, total: 6, perChars: 4000 } as const;

/** AI 특유의 대조형 · 설명형 문장 틀 — 전부 금지가 아니라 한 리포트에서 같은 틀이 계속 되풀이되는 것을 막는다 */
export const CONTRAST_PATTERNS: { id: string; label: string; re: RegExp; max: number }[] = [
  { id: "not-simply", label: "단순히 A가 아니라 B예요", re: /단순히[^.!?]{0,40}아니라/g, max: 1 },
  { id: "at-once", label: "A이면서 동시에 B이기도 해요", re: /(?:이면서|하면서|인 동시에|이자)[^.!?]{0,10}동시에|동시에[^.!?]{0,24}이기도 (?:해요|하죠)/g, max: 1 },
  { id: "closer-to", label: "A보다는 B에 가까워요", re: /보다는?[^.!?]{1,30}에 (?:더 )?가까/g, max: 1 },
  { id: "important-not", label: "중요한 것은 A가 아니라 B라는 점이에요", re: /중요한 (?:것|건|점)은[^.!?]{0,40}(?:아니라|보다)/g, max: 1 },
  { id: "this-point", label: "이 지점에서 중요한 건…", re: /이 지점에서|여기서 중요한 (?:건|것은)/g, max: 0 },
  { id: "remember", label: "A라는 점을 기억해 주세요", re: /(?:라는|이라는) 점을 (?:기억|잊지)/g, max: 1 },
  { id: "means", label: "A할 수 있다는 뜻이에요", re: /(?:수 있다는|있다는|다는|라는) 뜻이에요/g, max: 1 },
  { id: "can-say", label: "A하는 편이라고 볼 수 있어요", re: /편이라고 볼 수 있/g, max: 1 },
  { id: "not-mean", label: "A라고 해서 B라는 뜻은 아니에요", re: /(?:이라고|라고) 해서[^.!?]{0,30}(?:아니|않)/g, max: 1 },
  { id: "pile-up", label: "A가 쌓이면 B로 이어질 수 있어요", re: /(?:이|가) 쌓이면[^.!?]{0,30}이어질 수|쌓이다 보면[^.!?]{0,20}이어/g, max: 1 },
  { id: "if-then", label: "A라면 B일 수 있어요", re: /(?:이라면|라면|다면|으면)[^.!?]{2,40}수 있어요/g, max: 5 },
  { id: "not-but", label: "A가 아니라 B예요", re: /(?:이|가) 아니라[^.!?]{2,30}(?:예요|이에요|해요|돼요)/g, max: 3 },
];
/** 위 틀 가운데 if-then · not-but을 뺀 "AI 특유" 틀을 모두 합쳐 쓸 수 있는 횟수 */
export const CONTRAST_TOTAL_MAX = 3;

/** 시적 · 과장 위로 */
const POETIC = /여정|포근|토닥|따스|빛나|반짝|물결|별처럼|꽃처럼|바다처럼/g;
/** 억지 공감 질문 — "그랬죠?" "그런 적 많았죠?" 같이 겪은 일을 아는 척 묻는 말(바넘 효과식 공감) */
const FORCED_EMPATHY = /(?:그랬|많았|있었|겪었|느꼈|했|겠)(?:죠|지요)\?|적 (?:있|많았|없)(?:었)?(?:죠|지요)\?/g;
const CALL_YOU = /당신|귀하/;
const NAME_CALL = /\{name\}|님(?:은|는|이|가|을|를|의|에게|께)(?![가-힣])/;
const HEDGE = /(?:아마|어쩌면|혹시)(?![가-힣])/g;
const EMOJI = /\p{Extended_Pictographic}/u;
/** 문단을 사주로 시작하는 틀 — 모든 문단이 "사주를 보면"으로 시작하지 않는다 */
const SAJU_OPENER = /^사주(?:를|에서|상|로|는|가)?\s*(?:보면|볼 때|에서는|상으로|로는|는)/;

// ───────────────────────── 문장 도구 ─────────────────────────

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/** 마지막 글자(받침이 있으면 ㅂ인가) — 합쇼체는 "ㅂ니다/ㅂ니까"라 바로 앞 글자의 받침이 ㅂ이다 */
const finalIsB = (ch: string): boolean => {
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 === 17;
};

/** 문장이 합쇼체(~입니다 · ~합니다 · ~습니다 · ~됩니다 · ~바랍니다 · ~십시오 · ~니까)로 끝나는가 */
export function isFormalEnding(sentence: string): boolean {
  const t = sentence.replace(/[.?!。"'”’)\]\s]+$/g, "");
  if (/십시오$/.test(t)) return true;
  const m = /([가-힣])니[다까]$/.exec(t);
  return Boolean(m && finalIsB(m[1]));
}

const endingKind = (sentence: string): string => {
  const t = sentence.replace(/[.?!。"'”’)\]\s]+$/g, "");
  if (/수 있(?:어요|죠|지요)$/.test(t)) return "수 있어요";
  if (/(?:거예요|거에요|것 같아요)$/.test(t)) return "거예요";
  if (/편이에요$|편이죠$/.test(t)) return "편이에요";
  if (/(?:예요|이에요)$/.test(t)) return "예요";
  if (/기 쉬워요$|기 쉬워요$/.test(t)) return "기 쉬워요";
  if (/세요$/.test(t)) return "세요";
  if (/좋아요$/.test(t)) return "좋아요";
  return "other";
};

const openerKey = (sentence: string): string => sentence.replace(/^["'“‘(]+/, "").split(/\s+/).slice(0, 2).join(" ");
const firstToken = (sentence: string): string => sentence.replace(/^["'“‘(]+/, "").split(/\s+/)[0] ?? "";

const norm = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "");
const stemsOf = (text: string): Set<string> => {
  const out = new Set<string>();
  for (const w of text.match(/[가-힣]{2,}/g) ?? []) {
    const s = w.slice(0, 2);
    if (!COMMON_STEMS.has(s)) out.add(s);
  }
  return out;
};

const count = (text: string, re: RegExp): number => text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))?.length ?? 0;
const sample = (where: string, s: string) => `${where}: ${s.length > 48 ? `${s.slice(0, 48)}…` : s}`;

// ───────────────────────── 검사 ─────────────────────────

export type VoiceOptions = {
  /** 근거 목록의 글(fact · cue) — 있으면 근거 문구를 그대로 옮긴 곳을 센다(근거 문구는 분석 보고서 말투라 옮기면 AI 문체가 번진다) */
  evidenceTexts?: string[];
  /** 7개 대주제처럼 문단 묶음 단위로 센다 — 같은 장 안의 반복을 따로 보려고 where의 앞부분(예: "sections.3")을 묶음 이름으로 쓴다 */
  blockOf?: (where: string) => string;
};

export function checkVoice(texts: VoiceText[], opts: VoiceOptions = {}): VoiceReport {
  const findings: VoiceFinding[] = [];
  const add = (f: VoiceFinding) => findings.push(f);
  const body = texts.map((t) => t.text).join("\n");
  const chars = norm(body).length;
  // 글이 짧으면(채팅 답) 예산도 줄어 말마다 1번까지, 기준 길이(4,000자) 이상이면 길이에 비례해 늘어난다
  const scale = chars / ABSTRACT_BUDGET.perChars;
  const budget = (max: number) => (max === 0 ? 0 : Math.max(1, Math.round(max * scale)));

  const sentenceList = texts.flatMap((t) => splitSentences(t.text).map((s) => ({ where: t.where, s })));

  // 1) 합쇼체 혼입 — 해요체로 통일(법률 고지 · 약관은 이 검사를 쓰지 않는다)
  const formal = sentenceList.filter(({ s }) => isFormalEnding(s));
  if (formal.length > 0) add({ id: "formal", level: "fail", message: `합쇼체(~입니다 · ~합니다 · ~습니다)로 끝나는 문장이 ${formal.length}곳이에요 — 해요체(~예요 · ~해요 · ~할 수 있어요)로 써 주세요.`, examples: formal.slice(0, 3).map((x) => sample(x.where, x.s)) });

  // 2) 호칭 · 금지 문구 · AI 어휘 · 억지 공감 · 이모지
  const calls = texts.filter((t) => CALL_YOU.test(t.text));
  if (calls.length > 0) add({ id: "call-you", level: "fail", message: `"당신 · 귀하"라고 부르지 않아요(${calls.length}곳) — 미유가 사용자에게 직접 말해 주듯 호칭 없이 쓰세요.`, examples: calls.slice(0, 2).map((x) => sample(x.where, x.text)) });
  const banned = BANNED_PHRASES.filter((b) => b.re.test(body));
  if (banned.length > 0) add({ id: "banned-phrase", level: "fail", message: `해설자 · 진단서 말투 문구를 쓰지 않아요: ${banned.map((b) => `"${b.phrase}"`).join(" · ")} — 하려는 말을 바로 이어서 쓰세요.` });
  const tier1: Record<string, number> = {};
  for (const w of TIER1_WORDS) {
    const n = count(body, w.re);
    if (n > 0) tier1[w.word] = n;
  }
  if (Object.keys(tier1).length > 0) add({ id: "ai-vocabulary", level: "fail", message: `분석 보고서 어휘(${Object.entries(tier1).map(([w, n]) => `${w} ${n}번`).join(" · ")})는 쓰지 않아요 — 일상에서 쓰는 말로 풀어서 다시 써 주세요(예: 양상 → 모습, 본질 → 가장 중요한 부분).` });
  const forced = texts.filter((t) => count(t.text, FORCED_EMPATHY) > 0);
  if (forced.length > 0) add({ id: "forced-empathy", level: "fail", message: `겪은 일을 아는 것처럼 묻는 공감 질문("그랬죠?" · "그런 적 많았죠?")을 쓰지 않아요(${forced.length}곳) — 근거가 말하는 모습을 조건으로 쓰세요.`, examples: forced.slice(0, 2).map((x) => sample(x.where, x.text)) });
  if (EMOJI.test(body)) add({ id: "emoji", level: "fail", message: "이모지를 쓰지 않아요." });

  // 3) 추상어 예산 — 말마다 · 모두 합쳐
  const abstractByWord: Record<string, number> = {};
  for (const w of ABSTRACT_WORDS) {
    const n = count(body, w.re);
    if (n > 0) abstractByWord[w.word] = n;
  }
  const abstractTotal = Object.values(abstractByWord).reduce((a, b) => a + b, 0);
  const perWord = budget(ABSTRACT_BUDGET.perWord);
  const over = Object.entries(abstractByWord).filter(([, n]) => n > perWord);
  if (over.length > 0 || abstractTotal > budget(ABSTRACT_BUDGET.total)) {
    const listed = (over.length > 0 ? over : Object.entries(abstractByWord)).map(([w, n]) => `${w} ${n}번`).join(" · ");
    add({ id: "abstract-words", level: "repair", message: `추상적인 말이 많아요(${listed} — 합쳐서 ${abstractTotal}번). 흐름 · 연결 · 균형 · 맥락 같은 말은 꼭 필요한 곳(예: 운의 흐름)에만 쓰고, 나머지는 어떤 상황에서 무슨 일이 생기는지 구체적인 말로 바꿔 주세요.` });
  }

  // 4) 대조형 · 설명형 문장 틀의 반복
  const contrast: Record<string, number> = {};
  const overPatterns: string[] = [];
  let aiTotal = 0;
  for (const p of CONTRAST_PATTERNS) {
    const n = count(body, p.re);
    if (n === 0) continue;
    contrast[p.id] = n;
    if (p.id !== "if-then" && p.id !== "not-but") aiTotal += n;
    if (n > budget(p.max)) overPatterns.push(`"${p.label}" ${n}번`);
  }
  if (overPatterns.length > 0 || aiTotal > budget(CONTRAST_TOTAL_MAX)) {
    add({ id: "contrast-pattern", level: "repair", message: `같은 문장 틀이 되풀이돼요(${overPatterns.join(" · ") || `대조형 틀 합쳐서 ${aiTotal}번`}). 한 리포트에서 같은 틀은 한 번까지만 쓰고, 나머지는 하려는 말을 바로 쓰거나 필요 없는 문장은 지워 주세요.` });
  }

  // 5) 같은 문장 시작
  const openers = new Map<string, number>();
  const firsts = new Map<string, number>();
  for (const { s } of sentenceList) {
    const key = openerKey(s);
    if (key.replace(/\s/g, "").length >= 3) openers.set(key, (openers.get(key) ?? 0) + 1);
    const f = firstToken(s);
    if (f.length >= 2) firsts.set(f, (firsts.get(f) ?? 0) + 1);
  }
  const topOpeners = [...openers].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([opener, n]) => ({ opener, count: n }));
  const repeatedOpeners = [...openers].filter(([, n]) => n >= Math.max(3, budget(3))).map(([k, n]) => `"${k}…" ${n}번`);
  const repeatedFirsts = [...firsts].filter(([, n]) => n >= Math.max(4, budget(5))).map(([k, n]) => `"${k}" ${n}번`);
  if (repeatedOpeners.length > 0 || repeatedFirsts.length > 0) add({ id: "repeated-opener", level: "repair", message: `같은 말로 시작하는 문장이 많아요(${[...repeatedOpeners, ...repeatedFirsts].slice(0, 4).join(" · ")}) — 문장 시작을 다르게 해 주세요.` });
  const sajuStarts = texts.filter((t) => splitSentences(t.text).length > 0 && SAJU_OPENER.test(splitSentences(t.text)[0]));
  if (sajuStarts.length > 1) add({ id: "saju-opener", level: "repair", message: `문단 ${sajuStarts.length}개가 "사주를 보면"으로 시작해요 — 한 번까지만 쓰고, 나머지 문단은 이 사람의 모습이나 장면부터 시작하세요.` });

  // 6) 같은 마무리(수 있어요가 계속 이어짐 · 한 가지 마무리가 절반 가까이)
  const kinds = sentenceList.map((x) => endingKind(x.s));
  const tally = new Map<string, number>();
  for (const k of kinds) if (k !== "other") tally.set(k, (tally.get(k) ?? 0) + 1);
  const top = [...tally].sort((a, b) => b[1] - a[1])[0] ?? ["other", 0];
  const topEnding = { kind: top[0], count: top[1], share: kinds.length ? top[1] / kinds.length : 0 };
  let longRun = { kind: "", n: 0 };
  for (const t of texts) {
    const ks = splitSentences(t.text).map(endingKind);
    let run = 1;
    for (let i = 1; i < ks.length; i++) {
      run = ks[i] === ks[i - 1] && ks[i] !== "other" ? run + 1 : 1;
      if (run >= 3 && run > longRun.n) longRun = { kind: ks[i], n: run };
    }
  }
  const endRepeats: string[] = [];
  if (longRun.n >= 3) endRepeats.push(`한 문단에서 "~${longRun.kind}"로 ${longRun.n}문장 연속`);
  if (topEnding.kind !== "other" && topEnding.count >= 8 && topEnding.share > 0.4) endRepeats.push(`"~${topEnding.kind}"가 문장의 ${Math.round(topEnding.share * 100)}%`);
  if (endRepeats.length > 0) add({ id: "repeated-ending", level: "repair", message: `문장 마무리가 같은 모양으로 이어져요(${endRepeats.join(" · ")}). 짧은 문장과 긴 문장을 섞고, 모든 문장에 "~할 수 있어요"를 붙이지 말고 말할 수 있는 건 분명하게 써 주세요.` });

  // 7) 이름 호칭 · 아마/어쩌면 · 느낌표 · 시적 표현
  const nameParas = texts.filter((t) => NAME_CALL.test(t.text)).length;
  if (nameParas > 2) add({ id: "name-calls", level: "repair", message: `이름 호칭이 ${nameParas}개 문단에 나와요 — 두 번까지만 쓰고 나머지는 호칭 없이 써 주세요.` });
  const hedgeWords = count(body, HEDGE);
  if (hedgeWords > budget(3)) add({ id: "hedge-words", level: "repair", message: `"아마 · 어쩌면"이 ${hedgeWords}번 나와요 — 문장마다 붙이지 말고 정말 불확실한 곳에만 쓰세요.` });
  const bangs = count(body, /!/g);
  if (bangs > 2) add({ id: "exclamation", level: "repair", message: `느낌표가 ${bangs}개예요 — 과장 없이 차분하게 써 주세요.` });
  const poetic = body.match(POETIC);
  if (poetic) add({ id: "poetic", level: "repair", message: `시적이거나 과장된 말(${[...new Set(poetic)].join(" · ")})을 쓰지 않아요 — 담백하게 써 주세요.` });

  // 8) 근거 문구를 그대로 옮김
  if (opts.evidenceTexts?.length) {
    const grams = new Set<string>();
    for (const e of opts.evidenceTexts) {
      const n = norm(e);
      for (let i = 0; i + 14 <= n.length; i += 1) grams.add(n.slice(i, i + 14));
    }
    const copied = sentenceList.filter(({ s }) => {
      const n = norm(s);
      for (let i = 0; i + 14 <= n.length; i += 1) if (grams.has(n.slice(i, i + 14))) return true;
      return false;
    });
    if (copied.length >= 2) add({ id: "evidence-copy", level: "repair", message: `근거 문구를 그대로 옮긴 문장이 ${copied.length}곳이에요 — 근거는 분석 보고서 말투라 그대로 쓰면 AI가 쓴 글처럼 읽혀요. 이 사람의 장면으로 일상의 말로 다시 써 주세요.`, examples: copied.slice(0, 2).map((x) => sample(x.where, x.s)) });
  }

  // 9) 같은 뜻 반복 의심 — 코드가 확신할 수 없어 사람이 읽고 판단하는 목록
  const blockOf = opts.blockOf ?? ((w: string) => w);
  const longSentences = sentenceList.filter((x) => stemsOf(x.s).size >= 6);
  const pairs: { a: string; b: string; v: number }[] = [];
  for (let i = 0; i < longSentences.length; i++) {
    for (let j = i + 1; j < longSentences.length; j++) {
      if (blockOf(longSentences[i].where) === blockOf(longSentences[j].where)) continue;
      const A = stemsOf(longSentences[i].s);
      const B = stemsOf(longSentences[j].s);
      const inter = [...A].filter((x) => B.has(x)).length;
      const v = inter / (A.size + B.size - inter);
      if (v >= 0.6) pairs.push({ a: sample(longSentences[i].where, longSentences[i].s), b: sample(longSentences[j].where, longSentences[j].s), v });
    }
  }
  if (pairs.length > 0) add({ id: "same-meaning", level: "review", message: `서로 다른 곳에 같은 뜻을 되풀이한 것으로 의심되는 문장 쌍이 ${pairs.length}개예요(사람이 읽고 판단해 주세요).`, examples: pairs.sort((x, y) => y.v - x.v).slice(0, 4).map((p) => `${p.a}  ↔  ${p.b}`) });

  return {
    findings,
    metrics: { chars, sentences: sentenceList.length, formal: formal.length, tier1, abstractByWord, abstractTotal, contrast, topEnding, topOpeners, nameCalls: nameParas, hedgeWords },
  };
}

/** 검사 오류로 쓰는 문장 — 저장하지 않는다(fail) */
export const voiceErrors = (r: VoiceReport): string[] => failsOf(r).map((f) => (f.examples?.length ? `${f.message} 예) ${f.examples[0]}` : f.message));
/** 고쳐 쓰기를 부탁하는 문장 — 저장은 되지만 한 번 다시 쓰게 한다(repair) */
export const voiceRepairNotes = (r: VoiceReport): string[] => repairsOf(r).map((f) => f.message);
