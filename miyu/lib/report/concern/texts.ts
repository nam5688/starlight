// 저장된 리포트에서 "글"만 뽑는다 — 이미 준 리포트와 새 리포트가 겹치는지 보고, AI에게 되풀이하지 말라고 요약해 보낼 때 쓴다.

import type { AnyReportContent } from "../generator.ts";
import { isReadingReport, type IntegratedReadingReport } from "../reading/types.ts";
import type { Paragraph, PersonalReportV2 } from "../v2/types.ts";
import { isConcernReport, type ConcernReportV1 } from "./types.ts";

const paragraphs = (ps: Paragraph[] | undefined) => (ps ?? []).map((p) => p.text);

/** v1(개발용 규칙) 리포트처럼 구조가 정해지지 않은 내용은 12자 이상인 글을 모두 모은다 */
function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 6) return;
  if (typeof value === "string") {
    if (value.length >= 12) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out, depth + 1);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) if (k !== "source" && k !== "kind") collectStrings(v, out, depth + 1);
  }
}

export type TextParts = { headline: string; summary: string[]; sections: string[]; actions: string[]; all: string[] };

export function personalV2Texts(r: PersonalReportV2): TextParts {
  const summary = paragraphs(r.summary);
  const sections = r.sections.flatMap((s) => paragraphs(s.paragraphs));
  const actions = r.actions.map((a) => `${a.action}`);
  const all = [
    r.headline,
    ...summary,
    ...sections,
    ...paragraphs(r.differences),
    ...paragraphs(r.focus),
    ...r.timeline.flatMap((t) => [t.theme, t.opportunity, t.caution]),
    ...r.actions.flatMap((a) => [a.situation, a.action]),
  ];
  return { headline: r.headline, summary, sections, actions, all };
}

export function concernTexts(r: ConcernReportV1): TextParts {
  const summary = paragraphs(r.understanding);
  const sections = [...paragraphs(r.pattern), ...r.situations.flatMap((s) => [s.reading, s.suggestion])];
  const actions = r.actions.map((a) => a.action);
  const all = [
    r.headline,
    ...summary,
    ...sections,
    ...r.situations.map((s) => s.situation),
    ...paragraphs(r.differences),
    ...r.timeline.flatMap((t) => [t.theme, t.opportunity, t.caution]),
    ...r.actions.flatMap((a) => [a.situation, a.action]),
  ];
  return { headline: r.headline, summary, sections, actions, all };
}

/** 읽기 구조 리포트의 글 — 본문(요약 · 예시 · 풀이 · 행동)만. 접어 둔 분석 근거는 근거 목록에서 코드가 만든 글이므로 넣지 않는다 */
export function readingTexts(r: IntegratedReadingReport): TextParts {
  const summary = r.blocks.map((b) => b.summary);
  const sections = r.blocks.flatMap((b) => [b.example ?? "", ...b.details, b.watch ?? "", ...(b.traits ?? []).flatMap((t) => [t.shines, t.burden, t.example]), b.reactionFlow?.helpful ?? ""]).filter(Boolean);
  const actions = r.actions.map((a) => a.detail);
  const all = [
    r.headline,
    ...r.summary.flatMap((c) => [c.keyword, c.note]),
    ...r.blocks.flatMap((b) => [b.headline, b.summary]),
    ...sections,
    r.flow.headline,
    r.flow.summary,
    ...(r.flow.paragraphs ?? []),
    r.flow.cardText,
    ...r.flow.years.map((y) => y.theme),
    ...r.flow.periods.flatMap((p) => [p.theme, p.watch]),
    ...r.flow.scenarios.flatMap((s) => [s.when, s.then]),
    ...paragraphs(r.focus),
    ...r.actions.flatMap((a) => [a.title, a.detail]),
  ].filter(Boolean);
  return { headline: r.headline, summary, sections, actions, all };
}

/** 어떤 종류의 리포트든 글을 뽑는다 (개인 통합 읽기 구조 · 개인 종합 v2 · 고민 반영 · 개발용 v1) */
export function reportTexts(content: AnyReportContent | null): TextParts {
  if (!content) return { headline: "", summary: [], sections: [], actions: [], all: [] };
  if (isConcernReport(content)) return concernTexts(content);
  if (isReadingReport(content)) return readingTexts(content);
  if ("kind" in content && content.kind === "personal-v2") return personalV2Texts(content);
  const all: string[] = [];
  collectStrings(content, all);
  return { headline: "", summary: [], sections: all.slice(0, 8), actions: [], all };
}
