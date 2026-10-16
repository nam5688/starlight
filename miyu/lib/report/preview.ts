// 무료 미리보기 — 서버에서 "공개할 것만" 골라 만든다.
// 잠긴 항목에는 내용이 없다 (점수, 상세 분석, 그렇게 읽은 이유(근거 응답), 실천 제안 나머지 모두 여기 들어오지 않는다).
// 대표 경향의 이름과 한 줄 요약은 가리지 않고 완성된 문장으로 보여 준다(운영자 2026-10-16) — 그래도 다른 유료 항목은 열지 않는다.
// 화면의 흐림 처리는 장식일 뿐이고, 가려진 글자는 브라우저로 전송되지 않는다 (CSS로 가리기 금지 원칙).
// 구매한 리포트에는 이 미리보기의 모든 항목이 실제로 들어 있어야 한다 (preview.test.ts가 확인한다).

import { REPORT_BASIS } from "../config/product.ts";
import { pillarsLine } from "../saju/display.ts";
import type { SajuResult } from "../saju/engine.ts";
import type { ElementReading } from "../saju/plain.ts";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { buildReportExtras } from "./extras.ts";
import { sajuSection } from "../saju/display.ts";
import type { DataSource, FreeSummary, SajuSection } from "./types.ts";

export const PREVIEW_VERSION = "preview-2";

export type LockedFeature = { id: string; title: string; teaser: string };

/**
 * 구매하면 답을 주는 질문 — 숨긴 문장 대신 "무엇을 알게 되는지"를 보여 준다.
 * 질문은 모두에게 같은 안내 문구이고(개인 내용이 아님), 구매한 리포트에 답이 되는 부분이 실제로 있는 것만 넣는다 (preview.test.ts가 확인).
 */
export type LockedAnswer = { id: string; question: string; where: string };

export type FreePreview = {
  version: string;
  source: DataSource;
  /** 대표 경향 — 이름 전체와 한 줄 요약(완결된 문장). 그렇게 읽은 이유(근거 응답)는 구매 후 */
  tendency: { name: string; line: string };
  /**
   * 대표 경향 아래의 해석 — 응답이 뒷받침하는 문단이 있으면 전체를 보여 주고(근거 문항 번호는 보내지 않는다),
   * 없으면 일반 한 줄 요약의 앞부분만 보여 준다.
   */
  lead: { kind: "insight"; text: string; basisNote: string; /** 어느 검사 영역의 응답이 근거인가 (무료 맛보기 대화가 어느 방에서 이 문단을 보일지 정하는 데 쓴다) */ module: "relationship" | "temperament" } | { kind: "oneLiner"; shown: string };
  /** 잠긴 핵심 요약 2가지 — 문장 대신 "무엇에 답하는지"(질문)만 */
  core: { shown: { label: string; text: string }[]; locked: { label: string; question: string }[] };
  mbti: FreeSummary["mbti"];
  saju:
    | {
        status: "ok";
        section: SajuSection;
        chartLine: string | null;
        headline: string;
        dayMaster: { label: string; image: string; trait: string };
        elements: Pick<ElementReading, "element" | "hanja" | "image" | "count" | "level" | "levelLabel" | "force" | "keywords">[];
        /** 일상에서 이렇게 나타날 수 있어요 — 첫 번째만 */
        everyday: { shown: string | null; lockedCount: number };
        /**
         * 가까운 관계에서는 이렇게 나타날 수 있어요 — 가장 두드러진 기운(많음 → 없음 → 적음 순) 하나의 관계 풀이 한 줄만(운영자 2026-10-16: 무료 리포트에도 사주로 읽은 연애 이야기를 조금).
         * 나머지 기운의 관계 · 일 · 선택 풀이는 구매 후 리포트에 있다(맛보기는 한 줄, 같은 문장이 구매한 리포트의 오행별 풀이에 그대로 들어 있다).
         */
        relation: { lead: string; text: string } | null;
        notes: string[];
      }
    | { status: "not-ready"; message: string };
  questions: { shown: string[]; lockedCount: number };
  /** 기질 · 관계(애착) 점수 — 점수 대신 "알 수 있는 것"(질문)만 */
  scoreQuestions: { title: string; question: string }[];
  situations: { title: string; strengthLabel: string | null; cautionLabel: string | null; question: string | null }[];
  action: { shown: { title: string; detail: string } | null; lockedCount: number };
  locked: LockedFeature[];
  /** 구매하면 답을 주는 질문 목록 */
  answers: LockedAnswer[];
  /** "분석에 사용한 정보" 표 */
  basis: { mbtiItems: number; temperamentItems: number; relationshipItems: number };
};

/** 쉼표 앞까지만 (쉼표가 없으면 앞 8글자) */
export function maskOneLiner(text: string): string {
  const i = text.indexOf(",");
  return i > 0 ? text.slice(0, i + 1) : Array.from(text).slice(0, 8).join("");
}

const CORE_QUESTIONS: Record<string, string> = {
  "스트레스를 받기 쉬운 상황": "나는 어떤 상황에서 가장 쉽게 지칠까?",
  "바로 적용해볼 행동": "오늘 바로 써 볼 수 있는 한 가지는 무엇일까?",
};

const SITUATION_QUESTIONS: Record<string, string> = {
  work: "일할 때 내가 힘이 나는 순간과 막히는 순간은?",
  close: "가까운 사람 사이에서 내 방식이 상대에게 부담이 되는 순간은?",
  decision: "새로운 선택 앞에서 나는 어떤 기준으로 정하게 될까?",
  money: "돈을 쓰고 모을 때 내가 반복하는 습관은?",
  conflict: "갈등이 올 때 나는 어떻게 반응하고, 어떻게 바꿔 볼 수 있을까?",
};

const SCORE_QUESTIONS = [
  { title: "기질", question: "새로운 일 앞에서 나는 먼저 해 보는 편일까, 따져 보는 편일까? 다른 사람의 반응은 내 의욕에 얼마나 영향을 줄까?" },
  { title: "관계(애착)", question: "가까운 관계에서 확인하고 싶은 마음과 혼자 있고 싶은 마음 중 어느 쪽이 더 크게 나타날까?" },
];

const itemCount = (id: string) => ASSESSMENT_MODULES.find((m) => m.id === id)?.items.length ?? 0;

export function buildFreePreview(input: { summary: FreeSummary; saju: SajuResult; reference: { year: number; month: number } }): FreePreview {
  const { summary, saju } = input;
  const extras = buildReportExtras({ summary, saju, reference: input.reference });
  const rows = [
    { label: "내가 편한 환경", text: summary.core.comfortableEnvironment },
    { label: "자주 반복되는 반응", text: summary.core.repeatedReaction },
  ];
  const lockedCore = Object.entries(CORE_QUESTIONS).map(([label, question]) => ({ label, question }));

  const qs = extras.questions;
  const shownQuestions = qs.slice(0, 2).map((q) => q.question);

  const plain = extras.plain;
  // 가장 두드러진 기운 하나 — 많은 기운(개수가 많은 순) → 없는 기운 → 적은 기운. 보통(고른 기운)에는 관계 풀이가 없다
  const notable = plain
    ? [...plain.elements.filter((e) => e.level === "many").sort((a, b) => b.count - a.count), ...plain.elements.filter((e) => e.level === "none"), ...plain.elements.filter((e) => e.level === "few")].find((e) => e.domains)
    : undefined;
  const relation: { lead: string; text: string } | null = notable?.domains
    ? { lead: `${notable.element}(${notable.image}) 기운이 ${notable.level === "many" ? "많아요" : notable.level === "none" ? "없어요" : "적어요"}`, text: notable.domains.relation }
    : null;
  const sajuPart: FreePreview["saju"] =
    saju.status === "ok" && plain
      ? {
          status: "ok",
          section: sajuSection(saju),
          chartLine: pillarsLine(saju),
          headline: plain.headline,
          dayMaster: { label: plain.dayMaster.label, image: plain.dayMaster.image, trait: plain.dayMaster.trait },
          elements: plain.elements.map(({ element, hanja, image, count, level, levelLabel, force, keywords }) => ({ element, hanja, image, count, level, levelLabel, force, keywords })),
          everyday: { shown: plain.everyday[0] ?? null, lockedCount: Math.max(plain.everyday.length - 1, 0) },
          relation,
          notes: saju.notes.filter((n) => n.kind !== "hour-unknown").map((n) => n.message),
        }
      : { status: "not-ready", message: saju.status === "invalid" ? saju.message : "만세력 계산 결과가 없습니다." };

  const locked: LockedFeature[] = [
    // "그렇게 읽은 이유(근거 응답)"는 분석 근거 화면 노출 스위치(lib/config/product.ts)가 켜져 있을 때만 약속한다 — 꺼져 있으면 구매 후에도 보이지 않는다
    ...(summary.insight && REPORT_BASIS.visible ? [{ id: "tendency", title: "대표 경향을 그렇게 읽은 이유", teaser: "이 경향을 읽는 데 쓴 내 응답" }] : []),
    { id: "core", title: "핵심 요약 나머지 2가지", teaser: "스트레스를 받기 쉬운 상황 · 바로 적용해볼 행동" },
    { id: "scores", title: "기질 · 관계(애착) 점수와 그 의미", teaser: "4가지 기질과 가까운 관계에서의 반응" },
    { id: "detail", title: "상세 분석", teaser: "관점마다 풀이와 한계를 함께 적은 분석" },
    { id: "situations", title: "상황별 잘하는 점 · 주의할 점 상세", teaser: "일 · 관계 · 선택 · 갈등 4가지 상황" },
    ...(qs.length ? [{ id: "questions", title: `내 원국에서 나온 질문 ${qs.length}개의 답`, teaser: "질문마다 쉬운 말로 풀어 드립니다" }] : []),
    ...(extras.partner ? [{ id: "partner", title: "어울리는 관계 조건", teaser: "편안한 상대의 성향과 관계 주제가 두드러지는 해" }] : []),
    ...(extras.items ? [{ id: "items", title: "보완 아이템", teaser: "색 · 소재 · 공간 · 습관" }] : []),
    { id: "actions", title: "실천 제안 3가지 전체", teaser: "지금은 1가지만 보입니다" },
  ];

  const answers: LockedAnswer[] = [
    { id: "close", question: SITUATION_QUESTIONS.close, where: "상황별 · 가까운 사람과 지낼 때" },
    ...(extras.partner ? [{ id: "partner", question: "나는 어떤 상대에게 편안함을 느끼고, 어떤 상대는 맞추기 어려울까?", where: "어울리는 관계 조건" }] : []),
    { id: "repeat", question: "가까운 관계에서 반복하는 반응과, 그것을 바꿔 보는 방법은?", where: "상황별 · 바로 해볼 것" },
    ...(extras.partner ? [{ id: "years", question: "가까운 3년 중 관계 주제가 두드러질 수 있는 해는 언제일까?", where: "어울리는 관계 조건 · 관계 주제가 두드러질 수 있는 해" }] : []),
    { id: "work", question: SITUATION_QUESTIONS.work, where: "상황별 · 일하고 공부할 때" },
    { id: "stress", question: CORE_QUESTIONS["스트레스를 받기 쉬운 상황"], where: "핵심 요약" },
    ...(plain && plain.everyday.length > 1 ? [{ id: "elements", question: "내 원국에서 많거나 없는 기운은 관계 · 일 · 선택에서 어떻게 나타날까?", where: "오행별 풀이" }] : []),
    { id: "actions", question: "오늘부터 해 볼 수 있는 나머지 실천 2가지는?", where: "바로 해볼 실천 제안" },
  ];

  const insight = summary.insight;
  const lead: FreePreview["lead"] = insight
    ? {
        kind: "insight",
        text: insight.text,
        basisNote: `${insight.basisModule === "relationship" ? "관계(애착)" : "기질"} 문항에 답하신 내용 중 ${insight.basis.length}개가 이 문단의 근거입니다. 모든 사람에게 같은 문장이 나오지 않고, 응답이 뒷받침할 때만 들어갑니다.`,
        module: insight.basisModule,
      }
    : { kind: "oneLiner", shown: maskOneLiner(summary.oneLiner) };

  return {
    version: PREVIEW_VERSION,
    source: summary.source,
    tendency: { name: summary.tendency.name, line: summary.oneLiner },
    lead,
    core: { shown: rows, locked: lockedCore },
    mbti: summary.mbti,
    saju: sajuPart,
    questions: { shown: shownQuestions, lockedCount: Math.max(qs.length - shownQuestions.length, 0) },
    scoreQuestions: SCORE_QUESTIONS,
    situations: extras.situations.map((s, i) => ({
      title: s.title,
      strengthLabel: i === 0 ? s.strengthLabel : null,
      cautionLabel: i === 0 ? s.cautionLabel : null,
      question: i === 0 ? null : (SITUATION_QUESTIONS[s.id] ?? null),
    })),
    action: { shown: extras.starterActions[0] ?? null, lockedCount: Math.max(extras.starterActions.length - 1, 0) },
    locked,
    answers,
    basis: { mbtiItems: itemCount("mbti"), temperamentItems: itemCount("temperament"), relationshipItems: itemCount("relationship") },
  };
}
