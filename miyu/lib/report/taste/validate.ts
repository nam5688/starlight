// 맛보기 리포트 검사 — 저장 · 표시하는 것은 이 검사를 통과한 글뿐이다.
// 자유 질문 답과 같은 내용 규칙(단정 · 진단 · 사건 예언 · 사주 용어 · 점수 · 나이 · 속마음 · 결정 대신 내리기 · 투자 · 합쇼체 · 마크다운)에,
// 맛보기 전용 규칙(섹션 · 분량 · 연애는 정확히 3문장 150자 이상 · 유료 리포트의 핵심을 미리 쓰지 않기)을 더했다. 낱말 · 표지를 센 어림이며 좋은 글의 보증이 아니다.
import { contentIssues } from "../chat/validate.ts";
import { TASTE_PLAN as P } from "./plan.ts";
import { TASTE_SECTION_IDS, TASTE_VERSION, type TasteReport, type TasteSection } from "./types.ts";

export type TasteCheck = { ok: true; report: TasteReport } | { ok: false; errors: string[] };

/** 한 문장의 최대 글자 수 */
const SENTENCE_MAX = 110;

/** 유료 리포트에서만 풀리는 핵심 — 맛보기에 미리 쓰지 않는다 */
const LOCKED_RULES: { re: RegExp; why: string }[] = [
  { re: /(해 보세요|해보세요|해 보시|해보시|하세요|해 봐요|해 봅시다|해 보길|해 보는 게 좋|해 보면 좋|해 보면 돼)/, why: "해 볼 행동 · 조언의 지시(유료 리포트에서 풀리는 부분)" },
  { re: /어울리는\s*(사람|상대|분)|잘 맞는\s*(사람|상대|분)|이상형|맞춰 줄 수 있는 사람/, why: "어울리는 사람(유료 리포트에서 풀리는 부분)" },
  { re: /\d{1,2}\s*월|올해|내년|내후년|\d{4}\s*년|연애운이 (강해|오|들어)|시기가 (오|찾아)/, why: "연애운이 강해지는 시기 · 날짜(유료 리포트에서 풀리는 부분)" },
  { re: /결혼|이혼|자녀|혼인|궁합/, why: "결혼 · 자녀 · 궁합 이야기" },
  { re: /(썸|고백|사귀게|연인이 (되|생)|만나게 (될|돼))/, why: "실제 연애의 진행 · 만남 예언(유료 리포트에서 풀리는 부분)" },
  { re: /(응답하신|답하신|문항|설문|검사에서|테스트에서|\d+\s*번 문항|매우 그렇다|전혀 아니다)/, why: "설문 · 응답 척도를 그대로 말하는 표현(일상의 행동으로 풀어 써 주세요)" },
];

/** 문장 나누기 — 마침표 · 물음표 · 느낌표 뒤 공백에서 끊는다 (짧은 문장도 센다) */
export const tasteSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/** 모델 응답에서 JSON 한 덩어리를 꺼낸다 — 코드 블록 표시나 앞뒤 설명이 붙어 있어도 첫 `{`부터 마지막 `}`까지 읽는다 */
function parseJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

export function validateTaste(raw: string): TasteCheck {
  const data = parseJson(raw) as { headline?: unknown; sections?: unknown } | undefined;
  if (!data || typeof data !== "object") return { ok: false, errors: ["JSON 하나만 출력해 주세요 (headline · sections)."] };
  const errors: string[] = [];

  const headline = typeof data.headline === "string" ? data.headline.replace(/\s+/g, " ").trim() : "";
  if (headline.length < P.headline.min || headline.length > P.headline.max) errors.push(`headline은 ${P.headline.min}~${P.headline.max}자로 써 주세요 (지금 ${headline.length}자).`);

  const list = Array.isArray(data.sections) ? (data.sections as unknown[]) : [];
  if (list.length !== TASTE_SECTION_IDS.length) errors.push(`sections는 ${TASTE_SECTION_IDS.join(" · ")} 네 개를 이 순서로 써 주세요 (지금 ${list.length}개).`);

  const sections: TasteSection[] = [];
  TASTE_SECTION_IDS.forEach((id, i) => {
    const s = list[i] as { id?: unknown; title?: unknown; body?: unknown } | undefined;
    const plan = P.sections[id];
    if (!s || s.id !== id) {
      errors.push(`${i + 1}번째 섹션의 id는 "${id}"여야 해요.`);
      return;
    }
    const title = typeof s.title === "string" ? s.title.replace(/\s+/g, " ").trim() : "";
    const body = typeof s.body === "string" ? s.body.replace(/\s+/g, " ").trim() : "";
    if (title.length < P.title.min || title.length > P.title.max) errors.push(`${id}의 제목은 ${P.title.min}~${P.title.max}자로 써 주세요 (지금 ${title.length}자).`);
    const sents = tasteSentences(body);
    if (sents.length < plan.sentences.min || sents.length > plan.sentences.max) {
      errors.push(plan.sentences.min === plan.sentences.max ? `${id}는 정확히 ${plan.sentences.max}문장으로 써 주세요 (지금 ${sents.length}문장).` : `${id}는 ${plan.sentences.min}~${plan.sentences.max}문장으로 써 주세요 (지금 ${sents.length}문장).`);
    }
    if (body.length < plan.chars.min || body.length > plan.chars.max) errors.push(`${id}는 ${plan.chars.min}~${plan.chars.max}자로 써 주세요 (지금 ${body.length}자).`);
    if (sents.some((x) => x.length > SENTENCE_MAX)) errors.push(`${id}의 한 문장은 ${SENTENCE_MAX}자를 넘지 않게 끊어 주세요.`);
    sections.push({ id, title, body });
  });

  const all = [headline, ...sections.flatMap((s) => [s.title, s.body])].join("\n");
  errors.push(...contentIssues(all));
  for (const r of LOCKED_RULES) if (r.re.test(all)) errors.push(`쓸 수 없는 표현: ${r.why}`);

  const unique = [...new Set(errors)];
  return unique.length > 0 ? { ok: false, errors: unique } : { ok: true, report: { version: TASTE_VERSION, headline, sections } };
}

/** 저장된 글(JSON)을 읽을 때 모양을 다시 확인한다 — 모양이 맞지 않으면 null (화면은 보이지 않는다) */
export function readTasteReport(content: unknown): TasteReport | null {
  if (!content || typeof content !== "object") return null;
  const c = content as { version?: unknown; headline?: unknown; sections?: unknown };
  if (c.version !== TASTE_VERSION || typeof c.headline !== "string" || !Array.isArray(c.sections)) return null;
  const sections: TasteSection[] = [];
  for (const id of TASTE_SECTION_IDS) {
    const s = (c.sections as { id?: unknown; title?: unknown; body?: unknown }[]).find((x) => x?.id === id);
    if (!s || typeof s.title !== "string" || typeof s.body !== "string") return null;
    sections.push({ id, title: s.title, body: s.body });
  }
  return { version: TASTE_VERSION, headline: c.headline, sections };
}
