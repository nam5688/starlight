// AI 품질 비교용 가상 인물 — 실제 고객이 아니다. 원국은 만세력 엔진이 계산하고, 응답은 개발용 문항에 가상으로 답한 값이다.
// 일간 10종을 한 명씩 포함하도록 날짜를 고르고(엔진 계산), 성별 · 시각 유무 · 내 고민 자세히 알려주기 유무 · 응답 패턴이 섞이게 한다.
// 앞의 2명은 1단계에서도 쓴다: 한 명은 내 고민 자세히 알려주기가 있고(적은 고민 반영 경로), 한 명은 없다.
import { ASSESSMENT_MODULES } from "../../assessment/modules/index.ts";
import type { PersonalContextInput } from "../../personalization/context.ts";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import { buildDevFreeSummary } from "../build-free-summary.ts";
import type { ReportInput } from "../generator.ts";

export type Persona = {
  id: string;
  /** 사람이 읽는 설명 (어떤 경우를 시험하는지) */
  note: string;
  input: ReportInput;
};

// 가상의 고민 — 실제 사람의 이야기가 아니다
const CONTEXTS: Partial<PersonalContextInput>[] = [
  { topic: "love", question: "연락이 뜸해지면 먼저 할지 기다릴지 계속 고민돼요.", situation: "대화가 길어지면 말수가 줄고 혼자 정리하려고 해요." },
  { topic: "work", question: "지금 일을 계속할지 옮길지 결정을 못 하고 있어요.", situation: "새 제안이 오면 설레는데 시작하기 전에 오래 따져요." },
  { topic: "relationship", question: "가까운 친구와 서운한 일이 있었는데 말을 꺼내기가 어려워요.", situation: "불편해도 일단 넘기다가 한참 뒤에 지쳐요." },
  { topic: "money", question: "모으는 것과 쓰는 것의 기준을 어떻게 잡아야 할지 모르겠어요.", situation: "필요한 건 바로 사는데 큰 지출은 오래 망설여요." },
];

const EMPTY_CONTEXT: Record<string, string> = { question: "", situation: "", matched: "", differed: "", excerpt: "" };
/** 내 고민 자세히 알려주기를 넣는 인물 번호 (0부터) — 10명 중 4명 */
const WITH_CONTEXT = [0, 3, 6, 9];

export function buildPersonas(count: number): Persona[] {
  const personas: Persona[] = [];
  const seenStems = new Set<string>();
  // 1988-03-05부터 하루씩 보며 아직 없는 일간이 나오면 고른다 (엔진 계산으로 정함 — 어림이 아니다)
  const d = new Date(Date.UTC(1988, 2, 5));
  for (let guard = 0; personas.length < count && guard < 400; guard++, d.setUTCDate(d.getUTCDate() + 1)) {
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const i = personas.length;
    const gender = i % 2 === 0 ? "female" : "male";
    const hourKnown = i % 3 !== 2;
    const birthTime = hourKnown ? `${String(5 + ((i * 3) % 17)).padStart(2, "0")}:${i % 2 === 0 ? "10" : "40"}` : null;
    const saju = calculateSaju({ year, month, day, calendar: "solar", isLeapMonth: false, birthTime, gender });
    if (saju.status !== "ok" || seenStems.has(saju.dayMaster.stem)) continue;
    seenStems.add(saju.dayMaster.stem);

    // 응답 패턴: 인물마다 다른 문항에 높은 값 · 낮은 값이 몰리게 한다
    const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((item, idx) => [item.id, ((i * 7 + idx * (i + 2) + (idx % 3) * i) % 5) + 1])));
    const withContext = WITH_CONTEXT.includes(i);
    const ctx = withContext ? CONTEXTS[WITH_CONTEXT.indexOf(i)] : null;
    personas.push({
      id: `P${String(i + 1).padStart(2, "0")}`,
      note: `${saju.dayMaster.stem}(${saju.dayMaster.stemHanja}) 일간 · ${gender === "female" ? "여성" : "남성"} · 태어난 시각 ${hourKnown ? "있음" : "모름"} · 내 고민 자세히 알려주기 ${withContext ? "있음" : "없음"}`,
      input: {
        nickname: `가상인물${i + 1}`,
        knownMbti: i % 4 === 3 ? null : (["INFJ", "ENTP", "ISTJ", "ENFP"] as const)[i % 4],
        birthText: `가상 인물 ${i + 1}`,
        summary: buildDevFreeSummary(answers),
        saju,
        gender,
        context: ctx ? ({ ...EMPTY_CONTEXT, ...ctx } as PersonalContextInput) : null,
      },
    });
  }
  if (personas.length < count) throw new Error("일간이 서로 다른 가상 인물을 충분히 만들지 못했습니다.");
  return personas;
}
