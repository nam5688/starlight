// 월 단위 "움직이는 달" 계산 — 그 해 12개 달(절기 기준)의 월운 간지를 원국과 겹쳐, 달마다 가까운 관계 · 재물 주제가 두드러지는 정도를 코드가 정한다.
// AI가 쓰지 않는다 (달 이름 · 단계 · 이유는 모두 계산 결과이고, 문장은 아래 고정 문구다 — 지어낼 수 없다).
// 이것은 사건이나 날짜를 알려 주는 것이 아니다. "이 달에 만난다 · 헤어진다 · 돈이 들어온다"가 아니라, 전통 해석 규칙이 그 달을 어떤 주제로 읽는지를 표시한다.
// 규칙은 검증된 사실이 아니라 전통 해석을 정리한 초안이며 전문가 검토 전이다 (MONTH_RULE_META에 출처 · 조건 · 예외 · 검토 상태를 기록).
// 두 사람을 비교하는 계산이 아니라 한 사람의 원국 기준이다 (궁합 단계에서 따로 만든다).
import { getBranchTenGod, getTenGod } from "manseryeok";
import type { SajuOk } from "../engine.ts";
import { monthPeriods } from "../yearly.ts";
import { branchRelations, stemRelation, type Relation } from "./relations.ts";
import { GROUP_OF, GROUP_THEME_SHORT, type Group } from "./rules.ts";

export const MONTH_RULE_VERSION = "saju-month-rules-0.1-draft";

type Stem = Parameters<typeof getTenGod>[0];
type Branch = Parameters<typeof getBranchTenGod>[1];

/** 단계 이름 — 좋고 나쁨이 아니라 주제가 두드러지는 정도다 */
export type MonthLevel = "high" | "mid" | "calm";
export const MONTH_LEVEL_LABEL: Record<MonthLevel, string> = { high: "움직임이 큰 달", mid: "조금 움직이는 달", calm: "차분한 달" };

export type MonthTagCode = "palace-union" | "palace-change" | "palace-weak" | "stem-union" | "spouse-star" | "wealth";
export type MonthTag = {
  code: MonthTagCode;
  /** 읽는 사람 화면용 쉬운 말 — 사주 용어 없음 */
  plain: string;
  /** 접어 둔 분석 근거용 — 계산 결과 (용어 · 한자 가능) */
  detail: string;
  /** 단계에 세지 않는 약한 표시 */
  weak?: true;
};

export type MonthTopic = { level: MonthLevel; tags: MonthTag[] };

export type MonthCell = {
  /** 1~12 — 입춘 이후 첫 달이 1 */
  index: number;
  /** 절기 이름 (예: 입춘) */
  termName: string;
  /** 절기가 시작하는 한국 날짜 (YYYY-MM-DD) — 달은 절기 기준이라 양력 달과 며칠 어긋난다 */
  startsOn: string;
  /** 양력으로 어느 달에 시작하는가 (1~12) */
  startMonth: number;
  /** 월운 간지 (예: 경인) */
  ganji: string;
  love: MonthTopic;
  money: MonthTopic;
};

export type MonthCalendar = {
  /** 입춘 기준의 해 */
  year: number;
  months: MonthCell[];
  /** 배우자 별은 성별을 입력했을 때만 본다 */
  usedSpouseStar: boolean;
  /** 일주가 기준에 따라 달라질 수 있어 가까운 관계 단계를 참고로만 봐야 하는가 */
  dayUncertain: boolean;
};

export const MONTH_NOTES = {
  /** 모든 달력에 붙이는 한계 안내 (해요체) */
  limit: "전통 해석으로 읽은 표시이고 검증된 사실이 아니에요. 어느 달이든 이렇게 읽을 수 있는 면이 있고, 실제로 어떤 일이 생긴다는 뜻이 아니에요.",
  solarTerm: "달은 절기 기준이라 양력 달과 며칠 어긋나요.",
  levelMeaning: "‘큰 달’은 좋은 달이나 나쁜 달이 아니라, 그 주제가 눈에 띄기 쉬운 달이라는 뜻이에요.",
  noGender: "성별 정보가 없어 전통에서 배우자와 관련해 보는 기운은 보지 않았어요.",
  dayUncertain: "태어난 날의 기준이 달라질 수 있어, 가까운 관계 달력은 참고로만 봐 주세요.",
} as const;

function levelOf(points: number): MonthLevel {
  return points >= 2 ? "high" : points === 1 ? "mid" : "calm";
}

const KIND_DETAIL: Record<Relation["kind"], string> = {
  천간합: "천간합",
  육합: "육합",
  반합: "반합(약하게 봄)",
  충: "충",
  형: "형(약하게 봄)",
};

/** 달 지지와 일지의 관계 — 육합 · 충은 단계에 세고 반합 · 형은 약한 표시만 한다 */
function palaceTags(monthBranch: string, dayBranch: string): MonthTag[] {
  const out: MonthTag[] = [];
  for (const r of branchRelations(monthBranch, dayBranch)) {
    const detail = `그 달의 지지 ${monthBranch}와 일지(배우자 자리) ${dayBranch}의 ${KIND_DETAIL[r.kind]}`;
    if (r.kind === "육합") out.push({ code: "palace-union", plain: "가까운 관계가 묶이거나 가까워지는 쪽의 주제가 두드러져요", detail });
    else if (r.kind === "충") out.push({ code: "palace-change", plain: "가까운 관계에서 변화나 조정이 필요한 주제가 두드러져요", detail });
    else out.push({ code: "palace-weak", plain: "가까운 관계의 주제가 조금 건드려져요", detail, weak: true });
  }
  return out;
}

/** 그 해 입춘부터 12개 달의 달력 — 원국 · 성별(선택)만 쓴다. 같은 입력은 항상 같은 결과다 */
export function monthCalendar(saju: SajuOk, input: { year: number; gender?: "male" | "female" | null }): MonthCalendar {
  const dm = saju.dayMaster.stem as Stem;
  const dayBranch = saju.pillars.find((p) => p.key === "day")?.branch ?? "";
  const star: Group | null = input.gender ? (input.gender === "female" ? "관성" : "재성") : null;
  const dayUncertain = saju.notes.some((n) => (n.kind === "jeolgi-day" || n.kind === "near-boundary" || n.kind === "jasi-school") && n.pillars.includes("day"));

  const months = monthPeriods(input.year).map((m, i): MonthCell => {
    const stemGroup = GROUP_OF[getTenGod(dm, m.stem as Stem)];
    const branchGroup = GROUP_OF[getBranchTenGod(dm, m.branch as Branch)];
    const kst = new Date(new Date(m.starts).getTime() + 9 * 3600000);

    // 가까운 관계: 일지와 육합 · 충(각 1점) / 일간과 천간합(1점) / 배우자 별이 월 천간 · 지지에 있음(1점)
    const love: MonthTag[] = [...palaceTags(m.branch, dayBranch)];
    const stemUnion = stemRelation(m.stem, saju.dayMaster.stem) ?? stemRelation(saju.dayMaster.stem, m.stem);
    if (stemUnion) love.push({ code: "stem-union", plain: "새로운 인연이나 결속에 마음이 열리기 쉬운 주제가 두드러져요", detail: `그 달의 천간 ${m.stem}과 일간 ${saju.dayMaster.stem}의 천간합` });
    if (star && (stemGroup === star || branchGroup === star)) {
      love.push({
        code: "spouse-star",
        plain: "전통에서 배우자 · 연애와 관련해 보는 기운이 들어오는 달이에요",
        detail: `그 달의 ${stemGroup === star ? `천간 ${m.stem}(${stemGroup})` : ""}${stemGroup === star && branchGroup === star ? " · " : ""}${branchGroup === star ? `지지 ${m.branch}(${branchGroup})` : ""} — 배우자 별(${input.gender === "female" ? "여성 원국: 관성" : "남성 원국: 재성"})`,
      });
    }
    const lovePoints = love.filter((t) => !t.weak && t.code !== "palace-weak").length;

    // 재물: 월 천간 · 지지가 재성(각 1점)
    const money: MonthTag[] = [];
    if (stemGroup === "재성") money.push({ code: "wealth", plain: `${GROUP_THEME_SHORT.재성} 주제가 두드러져요`, detail: `그 달의 천간 ${m.stem}(재성)` });
    if (branchGroup === "재성") money.push({ code: "wealth", plain: `${GROUP_THEME_SHORT.재성} 주제가 두드러져요`, detail: `그 달의 지지 ${m.branch}(재성)` });

    return {
      index: i + 1,
      termName: m.termName,
      startsOn: `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`,
      startMonth: kst.getUTCMonth() + 1,
      ganji: `${m.stem}${m.branch}`,
      love: { level: levelOf(lovePoints), tags: love },
      money: { level: levelOf(money.length), tags: money },
    };
  });

  return { year: input.year, months, usedSpouseStar: star !== null, dayUncertain };
}

/**
 * 리포트에 싣는 달력 — 기준 날짜가 속한 해부터 3년(세운과 같은 길이). 입춘 전(1 · 2월)에는 전년도 달력이 아직 진행 중이라 한 해 앞에서 시작한다.
 * 성별은 계산 결과(saju.gender)에서 가져온다 — 성별을 받기 전에 저장한 결과에는 없어 배우자 별을 쓰지 않는다.
 */
export const CALENDAR_YEARS = 3;
export function monthCalendars(saju: SajuOk, reference: { year: number; month: number }): MonthCalendar[] {
  const first = reference.month <= 2 ? reference.year - 1 : reference.year;
  return Array.from({ length: CALENDAR_YEARS }, (_, k) => monthCalendar(saju, { year: first + k, gender: saju.gender ?? null }));
}

/** 단계가 같은 달들을 시작 순서대로 (화면의 "움직임이 큰 달: 3월 · 9월" 같은 요약용) */
export function monthsAtLevel(cal: MonthCalendar, topic: "love" | "money", level: MonthLevel): MonthCell[] {
  return cal.months.filter((m) => m[topic].level === level);
}
