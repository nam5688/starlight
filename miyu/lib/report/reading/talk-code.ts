// 대화 방의 "코드가 계산한 풀이" — 오늘의 한 장(원데이 미유) · 인연의 경향(연애박사 · 결혼박사) · 오래 가는 관계(결혼박사).
// 리포트에 저장된 글이 아니라 사주 계산 결과에서 고정 문구를 골라 만든다(AI가 쓰지 않는다). 같은 입력은 항상 같은 결과다.
// 무료 맛보기(tier "free")에서는 이어지는 부분을 잠그고, 무엇에 답하는지(질문)만 보인다 — 잠긴 문장은 만들지도 담지도 않는다.
// 채널 독립 코드다(React · Next · 브라우저 API를 쓰지 않는다).
import { DAILY_FREE, PARTNER_AGE_DIRECTION } from "../../config/product.ts";
import type { SajuResult } from "../../saju/engine.ts";
import { DAY_AREAS, DAY_NOTES, dayReading, type DayArea } from "../../saju/interpret/day-plain.ts";
import { monthsAtLevel, MONTH_NOTES, type MonthCalendar } from "../../saju/interpret/months.ts";
import { PARTNER_NOTES, partnerBasis, partnerReading } from "../../saju/interpret/partner.ts";
import type { TalkBubble, TalkPiece, TalkTopic } from "./talk.ts";

export type CodeTopicInput = {
  saju: SajuResult | null;
  today: { year: number; month: number; day: number } | null;
  calendar: { items: MonthCalendar[]; reference: { year: number; month: number } } | undefined;
  tier: "paid" | "free";
  /** 무료 맛보기에서 오늘의 한 장을 보여 줄지 (없으면 lib/config/product.ts의 DAILY_FREE) */
  dailyFree?: boolean;
  /** 인연의 경향에서 나이 차의 큰 방향을 보여 줄지 (없으면 lib/config/product.ts의 PARTNER_AGE_DIRECTION) */
  ageDirection?: boolean;
};

const para = (text: string, label?: string): TalkPiece => ({ kind: "para", text, ...(label ? { label } : {}) });
const note = (text: string): TalkPiece => ({ kind: "note", text });

/** 무료 맛보기에서 오늘의 한 장이 닫혀 있을 때(초기 무료 혜택이 끝난 뒤) 리포트에서 이어 보여 주는 것 — 질문만 */
const DAILY_HOOKS = ["오늘은 어떤 하루의 분위기일까?", "오늘 마음이 쓰이기 쉬운 영역은 어디일까?", "오늘 해 볼 수 있는 작은 행동은 무엇일까?"];
/** 무료 맛보기에서 인연의 경향이 리포트에서 이어 보여 주는 것 — 질문만 */
const PARTNER_AGE_HOOK = "나이 차는 어느 쪽으로 기울기 쉬울까?";
const PARTNER_HOOKS = ["연애운이 강해지는 달은 언제일까?", "오래 가는 관계에서 내가 중요하게 보는 것은?"];
const MARRIAGE_HOOKS = ["결혼 이야기가 가까워지기 쉬운 해는 언제일까?", "나는 어떤 분위기의 사람에게 끌릴까?", "연애운이 강해지는 달은 언제일까?"];

/** 인연의 경향 아래의 작은 안내 — 전통 해석이라는 한계 + 일주가 기준에 따라 달라질 수 있으면 참고로만 보라는 말 */
const partnerCaveat = (dayUncertain: boolean) => (dayUncertain ? `${PARTNER_NOTES.limit} ${PARTNER_NOTES.dayUncertain}` : PARTNER_NOTES.limit);

export function codeTopicsFor(input: CodeTopicInput): TalkTopic[] {
  const { saju, today, calendar, tier } = input;
  const dailyOpen = tier === "paid" || (input.dailyFree ?? DAILY_FREE.enabled);
  const ageOn = input.ageDirection ?? PARTNER_AGE_DIRECTION.enabled;
  if (!saju || saju.status !== "ok") return [];
  const out: TalkTopic[] = [];

  // 오늘의 한 장 — 하루 한 번 무료(초기 혜택, DAILY_FREE). 고른 영역의 한 줄 팁이 풀이 뒤에 붙고, 한 번으로 끝난다
  if (today && !dailyOpen) {
    // 초기 무료 혜택이 끝난 뒤의 무료 맛보기 — 그날의 풀이는 만들지도 담지도 않고 무엇에 답하는지(질문)만 보인다
    out.push({ id: "daily", number: 0, chip: "오늘의 한 장", title: "오늘의 한 장", headline: "오늘의 한 장은 리포트를 받은 분께 열려 있어요", summary: [], example: [], detail: [], basis: null, locked: { hooks: DAILY_HOOKS }, noFeel: true });
  } else if (today) {
    const d = dayReading(saju, today);
    const picks: Record<string, TalkBubble[]> = Object.fromEntries(DAY_AREAS.map((a) => [a.id, [{ kind: "text", text: d.tips[a.id as DayArea], label: a.label } satisfies TalkBubble]]));
    out.push({
      id: "daily",
      number: 0,
      chip: "오늘의 한 장",
      title: "오늘의 한 장",
      headline: `오늘은 ${d.title}이에요`,
      summary: [d.meaning, ...(d.relation ? [d.relation.line] : [])],
      caveat: `${DAY_NOTES.limit}${d.dayUncertain ? ` ${DAY_NOTES.uncertain}` : ""}`,
      example: [],
      detail: [],
      basis: d.basis,
      picks,
      noFeel: true,
      closing: DAY_NOTES.closing,
    });
  }

  const r = partnerReading(saju);
  const basis = partnerBasis(saju, ageOn);
  const attach = calendar ? { calendar } : {};

  if (tier === "free") {
    out.push({
      id: "partner",
      number: 0,
      chip: "끌리는 사람의 경향",
      title: "사주로 읽은 인연의 경향",
      headline: `${r.mood.title}에게 마음이 편해지기 쉬워요`,
      summary: [r.mood.line],
      caveat: partnerCaveat(r.dayUncertain),
      example: [],
      detail: [],
      basis: null,
      locked: { hooks: ageOn ? [PARTNER_AGE_HOOK, ...PARTNER_HOOKS] : PARTNER_HOOKS },
      askText: TALK_ASK_PARTNER,
    });
    out.push({
      id: "marriage",
      number: 0,
      chip: "오래 가는 관계",
      title: "오래 가는 관계에서 중요하게 보는 것",
      headline: r.longTerm.headline,
      summary: [r.longTerm.line],
      caveat: `${PARTNER_NOTES.compat} ${PARTNER_NOTES.limit}`,
      example: [],
      detail: [],
      basis: null,
      locked: { hooks: MARRIAGE_HOOKS },
      askText: TALK_ASK_MARRIAGE,
    });
    return out;
  }

  out.push({
    id: "partner",
    number: 0,
    chip: "끌리는 사람의 경향",
    title: "사주로 읽은 인연의 경향",
    headline: `${r.mood.title}에게 마음이 편해지기 쉬워요`,
    summary: ageOn ? [r.mood.line, r.ageTilt.line] : [r.mood.line],
    caveat: partnerCaveat(r.dayUncertain),
    example: [],
    detail: [
      para(r.longTerm.line, "오래 가는 관계에서는"),
      ...(r.star ? [para(r.star.line, "인연과 관련해 보는 기운")] : []),
      note(ageOn ? PARTNER_NOTES.criteria : PARTNER_NOTES.criteriaNoAge),
      note(PARTNER_NOTES.scope),
      note(PARTNER_NOTES.months),
      note(PARTNER_NOTES.noStats),
    ],
    basis,
    askText: TALK_ASK_PARTNER,
    ...attach,
  });

  const yearLines: TalkPiece[] = (calendar?.items ?? []).map((cal) => {
    const high = monthsAtLevel(cal, "love", "high").length;
    const mid = monthsAtLevel(cal, "love", "mid").length;
    return para(
      high + mid === 0 ? `${cal.year}년(입춘 기준)에는 연애운이 눈에 띄는 달이 없어요. 차분하게 흘러가는 해로 읽혀요.` : `${cal.year}년(입춘 기준)에는 연애운이 강해지는 달이 ${high}번, 조금 움직이는 달이 ${mid}번 있어요.`,
      "연애운이 강해지는 달 · 한 해 요약",
    );
  });
  const dayUncertain = calendar?.items.some((c) => c.dayUncertain) ?? false;
  out.push({
    id: "marriage",
    number: 0,
    chip: "오래 가는 관계",
    title: "오래 가는 관계에서 중요하게 보는 것",
    headline: r.longTerm.headline,
    summary: [r.longTerm.line, "결혼 여부나 시기를 사주로 정하지는 않고, 오래 가는 관계에서 마음이 편한 조건을 읽었어요."],
    caveat: `${PARTNER_NOTES.compat} ${PARTNER_NOTES.limit}`,
    example: [],
    detail: [...yearLines, ...(yearLines.length > 0 ? [note(MONTH_NOTES.limit)] : []), ...(dayUncertain ? [note(MONTH_NOTES.dayUncertain)] : []), note(PARTNER_NOTES.scope)],
    basis,
    askText: TALK_ASK_MARRIAGE,
    ...attach,
  });
  return out;
}

// 질문 문구는 talk.ts의 TALK_COPY.ask와 같다 — 순환 불러오기를 피하려고 여기서는 같은 글을 상수로 둔다(talk-code.test.ts가 같은지 확인한다)
export const TALK_ASK_PARTNER = "이 분위기, 끌렸던 사람과 닿는 부분이 있어요?";
export const TALK_ASK_MARRIAGE = "이 조건, 내가 생각하는 오래 가는 관계와 닮았어요?";
