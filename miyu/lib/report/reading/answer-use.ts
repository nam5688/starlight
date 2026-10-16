// 응답(장면 질문의 답)을 글에서 어떻게 썼는지 보는 검사 — 일반 모듈이다(장면 질문 · 선택지 이름을 모른다). 입력(`AnswerUseInput`)은 어댑터가 만든다.
//
// 이 검사는 **두 종류**로 나눈다. 하나로 합쳐 "통과 · 실패" 하나만 내지 않는다(운영자 2026-10-16).
// ① integrity(지어내지 않았는가) — 통과 / 실패. 어기면 글을 저장하지 않는다.
//    · ECHO     : 사용자가 고른 선택지 문장(또는 그에 가까운 문장)을 글에 그대로 옮겼다.
//    · INVENTED : 답을 받지 못한 장면(해당 없음 · 선택지 없음 · 미응답 · 한 장면만 답함)의 행동 · 반응을 사실처럼 썼다. "사주로 읽은 경향"이라고 포장해도 조건형이 아니면 같다.
//    · UNCITED  : 읽은 구분의 행동을 사실처럼 쓰면서 그 근거 ID를 달지 않았다(근거 없이 응답 사실을 말했다).
// ② quality(새로 알게 해 주는가) — 별도 기준. 제품 연결 때 켜고 끌 수 있다(기본은 켠다).
//    · TITLE    : 제목이 고른 답을 나열하거나 답 하나를 그대로 요약한다(제목은 풀이의 결론이어야 한다).
//    · FLAT_EITHER : "~인지 ~인지 그날그날 달라질 수 있어요"처럼 갈라 주는 조건 없이 둘을 늘어놓고 끝낸다.
// 허용하는 것: 사주에서 읽은 성향을 **조건형**("~기 쉬워요 · ~수 있어요")으로 그 장면에 적용하는 추론(공감 · 예측). 막는 것: 답하지 않은 응답을 답한 것처럼 쓰는 것.
//
// 한계: 정규식 · 글자 조각을 센 어림이다. 같은 뜻을 전혀 다른 말로 바꿔 쓰면 못 찾는다(재현율이 낮고 정밀도를 높게 잡았다) — 그 부분은 의미 검토(semantic-review)와 사람이 읽는 평가가 본다.
// 좋은 글임을 보증하지 않는다. cue(정규식)는 사람이 쓴 것이라 장면 질문이 바뀌면 같이 고쳐야 한다.
import type { Evidence } from "../evidence.ts";
import type { ReadingDraftV1 } from "./types.ts";
import { visibleTexts } from "./validate.ts";

export type AnswerUseOption = {
  /** 장면 id (예: S5) */
  scene: string;
  /** 장면 이름(화면용) */
  label: string;
  /** 사용자가 이 선택지를 골랐나 — 읽힌 구분에서 고른 것만 true */
  chosen: boolean;
  /** 선택지에 적힌 글 · 사실 문장 · 보여 주는 방식(옮겨 쓰면 안 되는 글) */
  texts: string[];
  /** 이 선택지를 알아보는 표현(말만 바꿔 쓴 것까지) — 제목 요약 · 지어내기 검사에 쓴다 */
  cues: RegExp[];
};

export type AnswerUseThread = {
  id: string;
  /** 이 구분의 근거 ID (읽힌 구분만 있다) */
  evidenceId: string;
  /** 읽을 수 있었나 — 두 장면 모두 선택지를 골랐을 때만 true */
  readable: boolean;
  /** 이 구분이 다루는 장면의 행동 · 반응을 말하는 표현 — 조건형 표지 없이 쓰면 그 장면의 행동을 사실처럼 말한 것이다 */
  topic: RegExp[];
  /**
   * 이 구분의 장면 상황을 말하는 표현("상대의 답이 늦어질 때"). 상황 하나만으로는 행동을 주장하지 않지만,
   * **관계 반응 단계(reactionFlow)의 상황(when)이 이 상황이면 그 단계들은 이 사람이 그 상황에서 한 반응을 말하는 것**이다.
   */
  situation: RegExp[];
};

export type AnswerUseInput = { options: AnswerUseOption[]; threads: AnswerUseThread[] };

export type AnswerUseResult = {
  /** 지어내지 않았는가(통과 · 실패) — 하나라도 있으면 글을 저장하지 않는다 */
  integrity: string[];
  /** 새로 알게 해 주는가(별도 기준) */
  quality: string[];
};

const norm = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "");
const splitSentences = (t: string) =>
  t
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/** 이 글자 수 미만의 선택지 글은 일상 표현과 겹치기 쉬워 옮겨 쓴 것으로 세지 않는다 (예: "혼자 정리할 시간") */
export const ECHO_MIN_CHARS = 12;
/**
 * 선택지에 적힌 글(text)의 4글자 조각이 한 문장에 이만큼 이상 들어 있으면 거의 그대로 옮긴 것이다(끝맺음만 바꾼 정도).
 * 0.7로 잡았을 때는 "마음이 어느 정도 정리된 뒤에야 이야기를 꺼내는 편이라 …"처럼 **고른 행동을 풀이 안에서 설명하는 문장**까지 걸렸다 —
 * 그런 문장은 응답으로 장면을 구체화하는 정상적인 글이므로 막지 않는다(0.9). 막는 것은 선택지 말을 거의 옮겨 붙인 곳이다.
 */
export const ECHO_NEAR_RATIO = 0.9;

/** 조건형 · 제안형 표지 — 이런 끝맺음이 있으면 사실을 단정한 것이 아니다 */
export const HEDGED = /수 있|수도 있|기 쉬|기가 쉬|지도 몰라|일 수|있었을 거|했을 거|였을 거|가능성|듯해|듯하|읽혀|보이기도|보세요|봐요|해 보|좋아요|좋겠|괜찮|면 돼요|도 돼요|\?/;

/** "A인지 B인지 그날그날 달라질 수 있어요" — 둘을 늘어놓고 가르는 조건 없이 끝낸다 */
export const FLAT_EITHER = /(?:인지|한지|일지|던지)[^.。!?]{2,45}(?:인지|한지|일지)[^.。!?]{0,30}(?:달라질 수|그때그때|그날그날|알 수 없|알기 어렵|구분(?:이|하기)? (?:안|어렵|되지)|가려지지|모를 수)/;
/** 같은 문장에 이런 말이 있으면 둘을 가르는 조건을 준 것으로 본다 */
const DISCRIMINATING = /(?:면|때는|때엔|라면|경우에는|으로 (?:가려|구분)|를 보면|을 보면|물어|확인해)/;

const grams = (s: string, n: number) => {
  const out = new Set<string>();
  for (let i = 0; i + n <= s.length; i++) out.add(s.slice(i, i + n));
  return out;
};
const coverage = (needle: string, hay: string) => {
  const g = grams(needle, 4);
  if (g.size === 0) return 0;
  let n = 0;
  for (const x of g) if (hay.includes(x)) n++;
  return n / g.size;
};

/** 제목 자리 — 풀이의 결론이어야 하는 글 */
export function titleSlots(d: ReadingDraftV1): { where: string; text: string }[] {
  return visibleTexts(d).filter((t) => t.where === "headline" || /^blocks\.[^.]+\.headline$/.test(t.where) || /\.sections\[\d+\]\.title$/.test(t.where) || /^cards\.(?:strength|caution|flow)\.keyword$/.test(t.where));
}

/** 어느 주제 블록의 글인가 (블록 밖의 글은 null) */
const blockOf = (where: string) => /^blocks\.([^.]+)\./.exec(where)?.[1] ?? null;

export function checkAnswerUse(draft: ReadingDraftV1, input: AnswerUseInput): AnswerUseResult {
  const integrity: string[] = [];
  const quality: string[] = [];
  const texts = visibleTexts(draft);
  const blockEvidence = new Map((draft.blocks ?? []).map((b) => [String(b?.id), new Set(b?.evidence ?? [])]));

  // ── ECHO: 선택지 문장을 그대로 옮겼다
  for (const o of input.options) {
    const forms = o.texts.map(norm).filter((n) => n.length >= ECHO_MIN_CHARS);
    if (forms.length === 0) continue;
    for (const { where, text } of texts) {
      const nt = norm(text);
      if (forms.some((f) => nt.includes(f))) {
        integrity.push(`ECHO ${where}: 고른 선택지 문장을 그대로 옮겼습니다 (${o.scene} “${o.texts[0]}”) — 고른 말을 되풀이하지 말고, 사주에서 읽은 성향이 이 사람에게 나타나는 장면으로 풀어 쓰세요.`);
        continue;
      }
      if (!o.chosen) continue;
      const own = norm(o.texts[0] ?? "");
      if (own.length < ECHO_MIN_CHARS) continue;
      for (const s of splitSentences(text)) {
        const ns = norm(s);
        if (coverage(own, ns) >= ECHO_NEAR_RATIO) {
          integrity.push(`ECHO ${where}: 고른 선택지(${o.scene})를 거의 그대로 옮긴 문장입니다 — “${s.slice(0, 40)}”. 말만 바꾼 되풀이가 아니라 이 사람의 장면으로 풀어 쓰세요.`);
          break;
        }
      }
    }
  }

  // ── INVENTED(관계 반응 단계): 상황(when)이 읽을 수 없는 구분의 장면이면 단계들은 그 장면에서의 이 사람의 반응을 단정한 것이다
  const flagged = new Set<string>();
  for (const b of draft.blocks ?? []) {
    const flow = b?.reactionFlow;
    if (!flow || typeof flow.when !== "string") continue;
    for (const th of input.threads) {
      if (th.readable || !th.situation.some((re) => re.test(flow.when))) continue;
      (flow.steps ?? []).forEach((st, i) => {
        if (typeof st?.text === "string" && !HEDGED.test(st.text) && !th.situation.some((re) => re.test(st.text))) {
          flagged.add(`blocks.${b.id}.reactionFlow.steps[${i}].text`);
          integrity.push(`INVENTED blocks.${b.id}.reactionFlow.steps[${i}].text: 답을 받지 못한 장면(“${flow.when}”)에서의 이 사람의 반응을 사실처럼 썼습니다 — “${st.text.slice(0, 44)}”. 이 장면은 읽을 수 없으니 반응 단계를 이 장면으로 짜지 말고, 읽은 구분의 장면으로 바꾸거나 조건형("~기 쉬워요")으로만 쓰세요.`);
        }
      });
    }
  }

  // ── INVENTED · UNCITED: 답하지 않은 장면의 행동을 사실처럼 쓴다 / 읽은 구분의 행동을 근거 없이 쓴다
  for (const th of input.threads) {
    for (const { where, text } of texts) {
      if (flagged.has(where)) continue;
      const block = blockOf(where);
      const hasId = block ? blockEvidence.get(block)?.has(th.evidenceId) : undefined;
      for (const s of splitSentences(text)) {
        if (!th.topic.some((re) => re.test(s))) continue;
        if (HEDGED.test(s)) continue;
        if (!th.readable) {
          integrity.push(`INVENTED ${where}: 답을 받지 못한 장면의 행동을 사실처럼 썼습니다 — “${s.slice(0, 44)}”. 이 장면은 읽을 수 없으니 사주에서 읽은 경향을 "~기 쉬워요 · ~수 있어요" 같은 조건형으로만 쓰거나 쓰지 않으세요.`);
        } else if (block && !hasId) {
          integrity.push(`UNCITED ${where}: 응답으로 읽은 행동을 근거 ID(${th.evidenceId})를 달지 않고 썼습니다 — “${s.slice(0, 44)}”. 이 주제 블록의 evidence에 ${th.evidenceId}를 더하거나 문장을 조건형으로 고치세요.`);
        }
      }
    }
  }

  // ── TITLE: 제목이 고른 답을 나열하거나 답 하나를 그대로 요약한다
  const chosen = input.options.filter((o) => o.chosen);
  for (const { where, text } of titleSlots(draft)) {
    const hits = chosen
      .map((o) => {
        const lens = o.cues.map((re) => re.exec(text)?.[0]).filter((m): m is string => Boolean(m)).map((m) => norm(m).length);
        return lens.length ? { scene: o.scene, len: Math.max(...lens) } : null;
      })
      .filter((h): h is { scene: string; len: number } => Boolean(h));
    const scenes = new Set(hits.map((h) => h.scene));
    if (scenes.size >= 2) {
      quality.push(`TITLE ${where}: 제목이 고른 답 ${scenes.size}개(${[...scenes].join(" · ")})를 나열합니다 — “${text}”. 제목은 본문을 쓴 뒤 그 풀이가 내린 결론 한 문장으로 쓰세요(답을 이어 붙이지 않기).`);
      continue;
    }
    if (scenes.size === 1) {
      const total = norm(text).length;
      const cover = Math.max(...hits.map((h) => h.len)) / Math.max(total, 1);
      if (cover >= 0.5) quality.push(`TITLE ${where}: 제목이 고른 답(${hits[0]!.scene}) 하나를 그대로 요약합니다 — “${text}”. 그 답이 이 사람에게 어떤 결과 · 부담 · 선택으로 이어지는지를 결론으로 쓰세요.`);
    }
  }

  // ── FLAT_EITHER: 둘을 늘어놓고 가르는 조건 없이 끝낸다
  for (const { where, text } of texts) {
    for (const s of splitSentences(text)) {
      if (FLAT_EITHER.test(s) && !DISCRIMINATING.test(s)) quality.push(`FLAT_EITHER ${where}: 두 가능성을 늘어놓고 갈라 주는 조건 없이 끝납니다 — “${s.slice(0, 50)}”. 어떨 때 어느 쪽인지(조건)를 한 가지 쓰거나, 갈라지는 곳이 없으면 말하지 마세요.`);
    }
  }

  return { integrity: [...new Set(integrity)], quality: [...new Set(quality)] };
}

/** 제품 검사에 끼워 넣는 확인 — validateReadingDraft의 `extra` · 생성기의 `extraChecks`로 쓴다. 기본은 둘 다 막는다. */
export function answerUseChecker(input: AnswerUseInput, opts: { quality?: boolean } = {}): (draft: ReadingDraftV1) => string[] {
  return (draft) => {
    const r = checkAnswerUse(draft, input);
    return opts.quality === false ? r.integrity : [...r.integrity, ...r.quality];
  };
}

// ── 근거 구분: 사주 / 실제 응답 / 입력 정보 / 둘 이상을 연결한 풀이 ────────────────────────────────────────────────────────────
export type SourceMix = {
  block: string;
  saju: number;
  response: number;
  selfInput: number;
  /** 사주만 · 사주 + 응답 · 사주 + 응답 + 입력 정보 … */
  kind: string;
  /** 응답 근거를 달았지만 글에서 그 구분의 장면을 한 번도 쓰지 않았다 */
  citedButUnused: string[];
};

export function sourceMix(draft: ReadingDraftV1, evidence: Evidence[], input?: AnswerUseInput): SourceMix[] {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const rows: SourceMix[] = [];
  const texts = visibleTexts(draft);
  const label = (kinds: string[]) => (kinds.length ? kinds.join(" + ") : "근거 없음");
  const groups: { id: string; ids: string[] }[] = [
    ...(draft.blocks ?? []).map((b) => ({ id: `blocks.${b.id}`, ids: b.evidence ?? [] })),
    { id: "flow", ids: draft.flow?.evidence ?? [] },
  ];
  for (const g of groups) {
    const ids = [...new Set(g.ids)];
    const kinds = ids.map((id) => byId.get(id)?.source);
    const saju = kinds.filter((k) => k === "saju").length;
    const response = kinds.filter((k) => k === "survey").length;
    const selfInput = kinds.filter((k) => k === "self").length;
    const used: string[] = [];
    const cited: string[] = [];
    for (const id of ids) {
      if (byId.get(id)?.source !== "survey") continue;
      cited.push(id);
      const th = input?.threads.find((t) => t.evidenceId === id);
      if (!th) continue;
      const mine = texts.filter((t) => t.where === g.id || t.where.startsWith(`${g.id}.`));
      if (mine.some((t) => splitSentences(t.text).some((s) => th.topic.some((re) => re.test(s))))) used.push(id);
    }
    rows.push({
      block: g.id,
      saju,
      response,
      selfInput,
      kind: label([saju ? "사주" : "", response ? "응답" : "", selfInput ? "입력 정보(MBTI)" : ""].filter(Boolean)),
      citedButUnused: input ? cited.filter((id) => !used.includes(id)) : [],
    });
  }
  return rows;
}
