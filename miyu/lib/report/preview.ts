// 무료 미리보기 — 서버에서 "공개할 것만" 골라 만든다.
// 잠긴 항목에는 내용이 없다 (이름 일부, 문장 일부, 점수, 상세 분석, 실천 제안 나머지 모두 여기 들어오지 않는다).
// 화면의 흐림 처리는 장식일 뿐이고, 가려진 글자는 브라우저로 전송되지 않는다 (CSS로 가리기 금지 원칙).
// 구매한 리포트에는 이 미리보기의 모든 항목이 실제로 들어 있어야 한다 (preview.test.ts가 확인한다).

import { pillarsLine } from "../saju/display.ts";
import type { SajuResult } from "../saju/engine.ts";
import type { ElementReading } from "../saju/plain.ts";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { buildReportExtras } from "./extras.ts";
import { sajuSection } from "../saju/display.ts";
import type { DataSource, FreeSummary, SajuSection } from "./types.ts";

export const PREVIEW_VERSION = "preview-1";

export type LockedFeature = { id: string; title: string; teaser: string };

export type FreePreview = {
  version: string;
  source: DataSource;
  /** 대표 경향 이름의 앞부분만 (예: "확인" + 가림 + "형") — 가려진 글자는 담지 않는다 */
  tendency: { head: string; tail: string };
  /** 한 줄 요약의 앞부분만 */
  oneLiner: { shown: string };
  core: { shown: { label: string; text: string }[]; locked: { label: string }[] };
  mbti: FreeSummary["mbti"];
  saju:
    | {
        status: "ok";
        section: SajuSection;
        chartLine: string | null;
        headline: string;
        dayMaster: { label: string; image: string; trait: string };
        elements: Pick<ElementReading, "element" | "hanja" | "image" | "count" | "level" | "levelLabel" | "force">[];
        /** 일상에서 이렇게 나타날 수 있어요 — 첫 번째만 */
        everyday: { shown: string | null; lockedCount: number };
        notes: string[];
      }
    | { status: "not-ready"; message: string };
  questions: { shown: string[]; lockedCount: number };
  situations: { title: string; strengthLabel: string | null; cautionLabel: string | null }[];
  action: { shown: { title: string; detail: string } | null; lockedCount: number };
  locked: LockedFeature[];
  /** "분석에 사용한 정보" 표 */
  basis: { mbtiItems: number; temperamentItems: number; relationshipItems: number };
};

/** "확인추구형" → { head: "확인", tail: "형" } — 가운데 글자는 담지 않는다 */
export function maskTendencyName(name: string): { head: string; tail: string } {
  const chars = Array.from(name);
  const tail = chars[chars.length - 1] === "형" ? "형" : "";
  const head = chars.slice(0, chars.length >= 4 ? 2 : 1).join("");
  return { head, tail };
}

/** 쉼표 앞까지만 (쉼표가 없으면 앞 8글자) */
export function maskOneLiner(text: string): string {
  const i = text.indexOf(",");
  return i > 0 ? text.slice(0, i + 1) : Array.from(text).slice(0, 8).join("");
}

const itemCount = (id: string) => ASSESSMENT_MODULES.find((m) => m.id === id)?.items.length ?? 0;

export function buildFreePreview(input: { summary: FreeSummary; saju: SajuResult; reference: { year: number; month: number } }): FreePreview {
  const { summary, saju } = input;
  const extras = buildReportExtras({ summary, saju, reference: input.reference });
  const rows = [
    { label: "내가 편한 환경", text: summary.core.comfortableEnvironment },
    { label: "자주 반복되는 반응", text: summary.core.repeatedReaction },
  ];
  const lockedCore = [{ label: "스트레스를 받기 쉬운 상황" }, { label: "바로 적용해볼 행동" }];

  const qs = extras.questions;
  const shownQuestions = qs.slice(0, 2).map((q) => q.question);

  const plain = extras.plain;
  const sajuPart: FreePreview["saju"] =
    saju.status === "ok" && plain
      ? {
          status: "ok",
          section: sajuSection(saju),
          chartLine: pillarsLine(saju),
          headline: plain.headline,
          dayMaster: { label: plain.dayMaster.label, image: plain.dayMaster.image, trait: plain.dayMaster.trait },
          elements: plain.elements.map(({ element, hanja, image, count, level, levelLabel, force }) => ({ element, hanja, image, count, level, levelLabel, force })),
          everyday: { shown: plain.everyday[0] ?? null, lockedCount: Math.max(plain.everyday.length - 1, 0) },
          notes: saju.notes.filter((n) => n.kind !== "hour-unknown").map((n) => n.message),
        }
      : { status: "not-ready", message: saju.status === "invalid" ? saju.message : "만세력 계산 결과가 없습니다." };

  const locked: LockedFeature[] = [
    { id: "tendency", title: "대표 경향 이름 전체와 한 줄 요약", teaser: "지금은 이름 앞부분만 보입니다" },
    { id: "core", title: "핵심 요약 나머지 2가지", teaser: "스트레스를 받기 쉬운 상황 · 바로 적용해볼 행동" },
    { id: "scores", title: "기질 · 관계(애착) 점수와 그 의미", teaser: "4가지 기질과 가까운 관계에서의 반응" },
    { id: "detail", title: "상세 분석", teaser: "근거와 한계를 함께 적은 분석" },
    { id: "situations", title: "상황별 잘하는 점 · 주의할 점 상세", teaser: "일 · 관계 · 선택 · 돈 · 갈등 5가지 상황" },
    ...(qs.length ? [{ id: "questions", title: `내 원국에서 나온 질문 ${qs.length}개의 답`, teaser: "질문마다 쉬운 말로 풀어 드립니다" }] : []),
    ...(extras.partner ? [{ id: "partner", title: "어울리는 관계 조건", teaser: "편안한 상대의 성향과 관계 주제가 두드러지는 해" }] : []),
    ...(extras.items ? [{ id: "items", title: "보완 아이템", teaser: "색 · 소재 · 공간 · 습관" }] : []),
    { id: "actions", title: "실천 제안 3가지 전체", teaser: "지금은 1가지만 보입니다" },
  ];

  return {
    version: PREVIEW_VERSION,
    source: summary.source,
    tendency: maskTendencyName(summary.tendency.name),
    oneLiner: { shown: maskOneLiner(summary.oneLiner) },
    core: { shown: rows, locked: lockedCore },
    mbti: summary.mbti,
    saju: sajuPart,
    questions: { shown: shownQuestions, lockedCount: Math.max(qs.length - shownQuestions.length, 0) },
    situations: extras.situations.map((s, i) => ({
      title: s.title,
      strengthLabel: i === 0 ? s.strengthLabel : null,
      cautionLabel: i === 0 ? s.cautionLabel : null,
    })),
    action: { shown: extras.starterActions[0] ?? null, lockedCount: Math.max(extras.starterActions.length - 1, 0) },
    locked,
    basis: { mbtiItems: itemCount("mbti"), temperamentItems: itemCount("temperament"), relationshipItems: itemCount("relationship") },
  };
}
