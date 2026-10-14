// 오늘의 한 장(원데이 미유) — 오늘의 일진(그날의 간지)을 내 원국과 겹쳐, 하루의 분위기를 쉬운 말로 읽는다.
// AI가 쓰지 않는다: 문장은 아래 고정 문구이고, 어떤 문장이 나오는지는 계산 결과(오늘 천간의 십신 그룹 · 오늘 지지와 내 일지의 관계)로만 정한다. 같은 날 같은 원국이면 항상 같은 결과다.
// 오늘 무슨 일이 생긴다는 예언이 아니다. "이런 분위기로 읽는 전통 해석"이고 좋고 나쁜 날을 가르지 않는다(모든 그룹이 같은 무게의 읽기다).
// 규칙은 검증된 사실이 아니라 전통 해석을 정리한 초안이며 전문가 검토 전이다 (DAY_RULE_META에 출처 · 조건 · 예외 · 검토 상태를 기록).
import { getBranchTenGod, getTenGod } from "manseryeok";
import type { SajuOk } from "../engine.ts";
import { dayGanji } from "../yearly.ts";
import { branchRelations } from "./relations.ts";
import { GROUP_OF, type Group } from "./rules.ts";

export const DAY_RULE_VERSION = "saju-day-rules-0.1-draft";

type Stem = Parameters<typeof getTenGod>[0];
type Branch = Parameters<typeof getBranchTenGod>[1];

export type DayArea = "work" | "people" | "money" | "mind";
export const DAY_AREAS: { id: DayArea; label: string }[] = [
  { id: "work", label: "일 · 공부" },
  { id: "people", label: "사람 · 연애" },
  { id: "money", label: "돈 · 소비" },
  { id: "mind", label: "컨디션 · 마음" },
];

type Theme = { title: string; meaning: string; tips: Record<DayArea, string> };

const THEME: Record<Group, Theme> = {
  비겁: {
    title: "내 기준과 페이스가 또렷해지는 날",
    meaning: "내 기준이 분명해지고, 남과 비교하거나 나를 앞세우고 싶은 마음이 올라오기 쉬운 날로 읽어요.",
    tips: {
      work: "남의 속도와 비교하기보다, 오늘 내가 끝낼 일 한 가지를 정해 보세요.",
      people: "내 입장을 말하되 상대 이야기를 한 번 더 들어 주면 부딪힘이 줄어요.",
      money: "남이 산다고 따라 사기보다, 내가 필요한 것만 골라 보세요.",
      mind: "혼자 있는 시간을 짧게라도 잡으면 마음이 정리돼요.",
    },
  },
  식상: {
    title: "표현하고 시도하고 싶어지는 날",
    meaning: "생각을 말이나 결과물로 꺼내고 싶고, 새로운 시도에 마음이 가기 쉬운 날로 읽어요.",
    tips: {
      work: "미뤄 둔 아이디어를 첫 줄만이라도 꺼내 보세요. 완성이 아니어도 괜찮아요.",
      people: "솔직하게 표현하기 좋은 날이지만 말이 앞서기 쉬워서, 한 번 다듬어 말해 보세요.",
      money: "기분 따라 쓰는 소비가 늘 수 있어요. 결제 전에 잠깐 멈춰 보세요.",
      mind: "몸을 움직이거나 무언가를 만들어 보면 답답함이 풀려요.",
    },
  },
  재성: {
    title: "현실을 챙기고 정리하고 싶어지는 날",
    meaning: "일의 결과, 시간, 돈 같은 현실적인 것을 챙기게 되는 날로 읽어요.",
    tips: {
      work: "오늘 끝낼 일을 눈에 보이게 적고, 하나씩 지워 보세요.",
      people: "계산이 앞서 차갑게 보이지 않게, 고마운 마음을 한마디 표현해 보세요.",
      money: "오늘 쓴 돈이나 쓸 돈을 가볍게 정리해 보기 좋은 날이에요.",
      mind: "챙길 게 많아 지칠 수 있어요. 오늘은 하나 덜어 내도 괜찮아요.",
    },
  },
  관성: {
    title: "책임과 약속이 눈에 들어오는 날",
    meaning: "해야 할 일과 약속, 주변의 평가가 신경 쓰이기 쉬운 날로 읽어요.",
    tips: {
      work: "마감이나 약속이 있다면 먼저 챙기고, 부담이 크면 일을 작게 나눠 보세요.",
      people: "약속을 지키는 모습이 신뢰로 이어지기 쉬워요. 너무 격식을 차리지 않아도 돼요.",
      money: "고정으로 나가는 돈이나 꼭 해야 할 지출을 점검해 보기 좋아요.",
      mind: "남의 시선이 신경 쓰일 수 있어요. 오늘은 내 기준으로 하나만 정해 보세요.",
    },
  },
  인성: {
    title: "배우고 쉬며 정리하고 싶어지는 날",
    meaning: "새로 배우거나 생각을 정리하고 싶고, 도움을 받고 싶어지기 쉬운 날로 읽어요.",
    tips: {
      work: "새로 배우거나 정리하기 좋은 날이에요. 자료를 읽고 한 줄로 요약해 보세요.",
      people: "도움을 청하거나 조언을 듣기 좋은 날이에요. 혼자 끌어안지 않아도 돼요.",
      money: "사고 싶은 것이 있다면 바로 결제하기보다 하루 더 살펴보세요.",
      mind: "쉬어도 되는 날이에요. 잠깐의 휴식이 생각을 정리해 줘요.",
    },
  },
};

const RELATION_LINE = {
  union: "오늘의 지지가 내 일지와 서로 끌어당기는 관계라, 사람 사이가 부드럽게 이어지기 쉬운 쪽의 주제도 함께 읽어요.",
  clash: "오늘의 지지가 내 일지와 부딪히는 관계라, 계획이 바뀌거나 조정할 일이 생기기 쉬운 쪽의 주제도 함께 읽어요. 일정에 여유를 조금 두면 좋아요.",
} as const;

export const DAY_NOTES = {
  /** 모든 오늘의 한 장에 붙이는 아주 작은 안내 (해요체) */
  limit: "전통 해석이고 100% 정확하거나 검증된 사실이 아니에요. 오늘 무슨 일이 생긴다는 뜻이 아니고, 좋고 나쁜 날을 가르는 것도 아니에요.",
  uncertain: "태어난 날의 기준이 달라질 수 있어, 오늘의 한 장도 참고로만 봐 주세요.",
  closing: "오늘의 무료 운세는 여기까지예요. 내일 새로운 한 장으로 다시 만나요.",
} as const;

export type DayReading = {
  /** 오늘 (한국 날짜) */
  date: { year: number; month: number; day: number };
  /** 오늘의 일진 (예: 경오) */
  ganji: string;
  stemGroup: Group;
  title: string;
  meaning: string;
  relation: { kind: "union" | "clash"; line: string } | null;
  tips: Record<DayArea, string>;
  /** 일주가 기준에 따라 달라질 수 있어 참고로만 봐야 하는가 */
  dayUncertain: boolean;
  basis: { computed: string[]; tradition: string[]; answers: string[]; unknown: string[] };
};

/** 오늘의 일진과 내 원국 → 오늘의 한 장 */
export function dayReading(saju: SajuOk, date: { year: number; month: number; day: number }): DayReading {
  const dm = saju.dayMaster.stem as Stem;
  const myBranch = saju.pillars.find((p) => p.key === "day")?.branch ?? "";
  const today = dayGanji(date);
  const tenGod = getTenGod(dm, today.stem as Stem);
  const stemGroup = GROUP_OF[tenGod];
  const branchGroup = GROUP_OF[getBranchTenGod(dm, today.branch as Branch)];
  const rels = branchRelations(today.branch, myBranch).map((r) => r.kind);
  const kind = rels.includes("육합") ? "union" : rels.includes("충") ? "clash" : null;
  const theme = THEME[stemGroup];
  const dayUncertain = saju.notes.some((n) => (n.kind === "jeolgi-day" || n.kind === "near-boundary" || n.kind === "jasi-school") && n.pillars.includes("day"));
  const ymd = `${date.year}.${String(date.month).padStart(2, "0")}.${String(date.day).padStart(2, "0")}`;
  return {
    date,
    ganji: `${today.stem}${today.branch}`,
    stemGroup,
    title: theme.title,
    meaning: theme.meaning,
    relation: kind ? { kind, line: RELATION_LINE[kind] } : null,
    tips: theme.tips,
    dayUncertain,
    basis: {
      computed: [
        `오늘(${ymd})의 일진 ${today.stem}${today.branch}`,
        `오늘의 천간 ${today.stem}은 내 일간 ${saju.dayMaster.stem} 기준 ${tenGod}(${stemGroup})`,
        `오늘의 지지 ${today.branch}(${branchGroup})와 내 일지 ${myBranch}의 관계: ${kind === "union" ? "육합" : kind === "clash" ? "충" : "합 · 충 없음"}`,
      ],
      tradition: [
        `오늘 천간의 십신 그룹(${stemGroup})으로 하루의 분위기를 읽는 규칙(${DAY_RULE_VERSION}, 전문가 검토 전 초안). 다섯 그룹 모두 좋고 나쁨 없이 같은 무게로 읽는다`,
        "오늘의 지지와 내 일지가 육합이면 사람 사이의 주제, 충이면 계획 조정의 주제를 함께 읽는다(가볍게)",
      ],
      answers: [],
      unknown: ["오늘 실제로 어떤 일이 생길지는 알 수 없어요", "이 규칙은 통계나 조사로 확인된 것이 아니에요"],
    },
  };
}

/** 한국 날짜 (UTC 시각 → 한국 날짜) */
export function seoulDate(now: Date): { year: number; month: number; day: number } {
  const k = new Date(now.getTime() + 9 * 3600_000);
  return { year: k.getUTCFullYear(), month: k.getUTCMonth() + 1, day: k.getUTCDate() };
}

export const dayKey = (d: { year: number; month: number; day: number }) => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
