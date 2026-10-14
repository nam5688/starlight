// 월 단위 달력(lib/saju/interpret/months.ts)을 화면 · 채팅 말풍선에 쓰는 문장으로 옮긴다.
// 모든 문장은 계산된 달 · 단계 · 이유와 고정 문구로만 만든다 — AI가 쓰지 않고, 저장된 달력에 없는 달은 나올 수 없다.
import { MONTH_LEVEL_LABEL, MONTH_NOTES, type MonthCalendar, type MonthCell, type MonthLevel } from "../../saju/interpret/months.ts";

export type CalendarTopic = "love" | "money";
export const CALENDAR_TOPIC_LABEL: Record<CalendarTopic, string> = { love: "가까운 관계", money: "재물" };
export { MONTH_LEVEL_LABEL, MONTH_NOTES };

/** 입춘 기준 해의 마지막 달(1월 초)은 다음 해 1월이라 해를 붙여 적는다 */
export function monthLabel(cal: MonthCalendar, m: MonthCell): string {
  return m.startMonth === 1 ? `${cal.year + 1}년 1월` : `${m.startMonth}월`;
}

/** "입춘 2.4부터" — 달이 절기 기준이라는 것을 한 줄로 보여 준다 */
export function startsLabel(m: MonthCell): string {
  const [, mm, dd] = m.startsOn.split("-").map(Number);
  return `${m.termName} ${mm}.${dd}부터`;
}

/** 이 주제의 달력을 보여 줄 수 없으면 이유 (성별 정보가 없는 결과 — 성별을 받기 전에 저장한 결과 — 는 배우자 별을 쓰지 못해 가까운 관계 달력이 거의 비므로 만들지 않는다) */
export function topicUnavailable(cal: MonthCalendar, topic: CalendarTopic): string | null {
  return topic === "love" && !cal.usedSpouseStar ? `${MONTH_NOTES.noGender} 그래서 가까운 관계 달력은 보여 드리지 못해요.` : null;
}

export const monthsOf = (cal: MonthCalendar, topic: CalendarTopic, level: MonthLevel): MonthCell[] => cal.months.filter((m) => m[topic].level === level);

const names = (cal: MonthCalendar, ms: MonthCell[]) => ms.map((m) => monthLabel(cal, m)).join(" · ");

/** 한 해 요약 한 문장 — 큰 달이 없으면 조금 움직이는 달을 함께 보여 준다 */
export function summaryLine(cal: MonthCalendar, topic: CalendarTopic): string {
  const un = topicUnavailable(cal, topic);
  if (un) return un;
  const label = CALENDAR_TOPIC_LABEL[topic];
  const high = monthsOf(cal, topic, "high");
  if (high.length > 0) return `${cal.year}년 ${label} 주제가 움직임이 큰 달은 ${names(cal, high)}이에요.`;
  const mid = monthsOf(cal, topic, "mid");
  if (mid.length > 0) return `${cal.year}년에는 ${label} 주제가 움직임이 큰 달이 없어요. 조금 움직이는 달은 ${names(cal, mid)}이에요.`;
  return `${cal.year}년에는 ${label} 주제가 눈에 띄는 달이 없어요. 차분하게 흘러가는 해로 읽혀요.`;
}

/** 달마다 한 줄 이유 — 단계에 센 이유를 먼저, 없으면 약한 표시, 아무것도 없으면 차분한 달 */
export function reasonLine(m: MonthCell, topic: CalendarTopic): string {
  const tags = m[topic].tags;
  const strong = tags.filter((t) => !t.weak);
  if (strong.length > 0) return strong.length > 1 ? `${strong[0].plain} (이 달에 겹친 이유가 ${strong.length}가지예요)` : strong[0].plain;
  if (tags.length > 0) return tags[0].plain;
  return "눈에 띄는 주제가 없는 달이에요";
}

/** 접어 둔 분석 근거 — 달마다 계산된 이유(용어 · 한자 가능) */
export function basisLines(cal: MonthCalendar, topic: CalendarTopic): string[] {
  return cal.months
    .filter((m) => m[topic].tags.length > 0)
    .map((m) => `${monthLabel(cal, m)}(${m.ganji}월) — ${m[topic].tags.map((t) => t.detail).join(" / ")}`);
}

/** 모든 달력에 붙이는 작은 안내 */
export function calendarNotes(cal: MonthCalendar, topic: CalendarTopic): string[] {
  return [MONTH_NOTES.limit, ...(topic === "love" && cal.usedSpouseStar ? [MONTH_NOTES.commonLove] : []), MONTH_NOTES.levelMeaning, MONTH_NOTES.solarTerm, ...(topic === "love" && cal.dayUncertain && cal.usedSpouseStar ? [MONTH_NOTES.dayUncertain] : [])];
}

// ───────── 앞으로 12개월 (대화에서 쓴다) ─────────

export type UpcomingMonth = { cal: MonthCalendar; m: MonthCell; /** "2026년 11월" */ label: string };

/** 기준 달(리포트를 만든 달)이 시작하는 달부터 앞으로 12개월 — 저장된 달력 안에서만 고른다(달력이 모자라면 있는 만큼) */
export function upcomingMonths(calendars: MonthCalendar[], reference: { year: number; month: number }, count = 12): UpcomingMonth[] {
  const from = `${reference.year}-${String(reference.month).padStart(2, "0")}`;
  const all = calendars.flatMap((cal) => cal.months.map((m) => ({ cal, m, label: `${m.startsOn.slice(0, 4)}년 ${m.startMonth}월` })));
  return all.filter((x) => x.m.startsOn.slice(0, 7) >= from).slice(0, count);
}

/** 대화에서 보여 줄 달 — 움직임이 큰 달은 모두, 없으면 조금 움직이는 달 앞의 네 개 */
export const MID_SHOWN = 4;
function shown(items: UpcomingMonth[], topic: CalendarTopic): { items: UpcomingMonth[]; level: MonthLevel | null; truncated: boolean } {
  const high = items.filter((x) => x.m[topic].level === "high");
  if (high.length > 0) return { items: high, level: "high", truncated: false };
  const mid = items.filter((x) => x.m[topic].level === "mid");
  return mid.length > 0 ? { items: mid.slice(0, MID_SHOWN), level: "mid", truncated: mid.length > MID_SHOWN } : { items: [], level: null, truncated: false };
}

export function upcomingSummary(calendars: MonthCalendar[], reference: { year: number; month: number }, topic: CalendarTopic): string {
  const un = calendars[0] ? topicUnavailable(calendars[0], topic) : null;
  if (un) return un;
  const label = CALENDAR_TOPIC_LABEL[topic];
  const s = shown(upcomingMonths(calendars, reference), topic);
  const list = s.items.map((x) => x.label).join(" · ");
  if (s.level === "high") return `앞으로 12개월 동안 ${label} 주제가 움직임이 큰 달은 ${list}이에요.`;
  if (s.level === "mid") return `앞으로 12개월 동안에는 ${label} 주제가 움직임이 큰 달이 없어요. 조금 움직이는 달은 ${list}${s.truncated ? " 등" : ""}이에요.`;
  return `앞으로 12개월 동안에는 ${label} 주제가 눈에 띄는 달이 없어요. 차분하게 흘러가는 시기로 읽혀요.`;
}

/** 달마다 말풍선 하나: 이름표(달 · 단계)와 한 줄 이유. 줄일 때는 몇 개를 뺐는지 밝힌다 */
export function upcomingMonthTexts(calendars: MonthCalendar[], reference: { year: number; month: number }, topic: CalendarTopic): { label: string; text: string }[] {
  if (calendars[0] && topicUnavailable(calendars[0], topic)) return [];
  return shown(upcomingMonths(calendars, reference), topic).items.map((x) => ({ label: `${x.label} · ${MONTH_LEVEL_LABEL[x.m[topic].level]}`, text: reasonLine(x.m, topic) }));
}

export const CALENDAR_CHAT_NOTES = {
  more: "이 달력은 전통 해석을 표시한 것이고 모든 달과 다른 해는 리포트의 월별 달력에서 볼 수 있어요.",
} as const;
