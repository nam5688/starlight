// 읽기 구조 리포트를 사람이 훑어 읽는 글(마크다운)로 옮긴다 — AI 비교의 블라인드 평가용 파일에 쓴다.
// 화면에 보이는 본문(요약 · 예시 · 풀이 · 살펴볼 점 · 행동)만 담고, 코드가 근거 목록에서 만든 "분석 근거"와 내부 근거 ID는 넣지 않는다
// (후보 사이에서 같은 값이라 평가에 도움이 되지 않고, 어느 후보인지 짐작하게 하지도 않는다).
// 나의 유형 이름(~형)과 한 줄은 그 사람의 사주 + 응답에서 코드가 정한 값이라 같은 인물이면 후보와 상관없이 같다 — 화면과 같게 맨 위에 이름 → 한 줄 순서로 보여 준다(어느 후보인지 알려 주지 않는다).
import { resolveTypeTitle, type TypeTitle } from "../type-title.ts";
import type { IntegratedReadingReport } from "./types.ts";

const AREA_NAME: Record<string, string> = { core: "내 사주의 중심", relation: "가까운 관계", "work-money": "일과 재물", flow: "앞으로의 흐름" };

/** 7개 대주제(story-7) 리포트의 번호가 붙은 장 이름 — 1~5번은 blocks, 6번은 flow, 7번은 advice */
const NUMBER = (n: number, topic: string) => `${n}. ${topic}`;

/**
 * 읽기용 글 맨 위의 유형 줄 — 유형 이름 → 바로 이어지는 한 줄 → 진단이 아니라는 안내. 화면(ReadingReportView)과 같은 값(TypeTitle)을 쓴다.
 * 이름이 없으면 null(줄이 없다). 스위치가 꺼진 동안의 옛 후보 이름은 예전 모양 그대로다.
 */
export function typeTitleLine(title: TypeTitle | null | undefined): string | null {
  if (!title) return null;
  if (title.kind === "legacy") return `**나의 대표 경향** ${title.name}${title.line ? ` — ${title.line}` : ""} (응답을 보고 붙인 후보 설명이며, 진단이나 평생 가는 유형이 아닙니다)`;
  return `**나의 유형** ${title.name}${title.line ? ` — ${title.line}` : ""} (진단이나 평생 가는 유형이 아니라, 지금의 사주 구조와 응답에서 가장 두드러진 경향에 붙인 이름입니다)`;
}

export function renderReadingMarkdown(r: IntegratedReadingReport, opts: { typeTitle?: TypeTitle | null } = {}): string {
  const out: string[] = [];
  const p = (...lines: string[]) => out.push(...lines, "");
  p(`# ${r.personName} 님의 개인 통합 리포트`);
  // 화면과 같은 순서 — 유형 이름(~형) → 바로 아래 한 줄 → 핵심 해석. 이름을 모르는 값이어도 이름은 지우지 않는다(읽기용 글에서만 이름이 빠졌던 문제).
  // 화면과 같은 값이어야 하므로 호출하는 쪽이 그 사람의 사주 + 응답으로 계산한 TypeTitle을 넘긴다(넘기지 않으면 스위치가 꺼졌을 때만 저장된 옛 이름을 쓴다).
  const tline = typeTitleLine(resolveTypeTitle(opts.typeTitle, r.base?.tendency.name));
  if (tline) p(tline);
  p(`**핵심 해석** ${r.headline}`);
  p(...r.summary.map((c) => `- ${c.label} · ${c.keyword} — ${c.note}`));
  if (r.focus?.length) {
    p("## 알려 주신 고민까지 반영한 해석");
    for (const f of r.focus) p(f.text);
  }
  const story7 = r.layout === "story7";
  for (const [i, b] of r.blocks.entries()) {
    p(`## ${story7 ? NUMBER(i + 1, b.topic) : b.topic}`, `### ${b.headline}`);
    if (b.parts?.length) {
      for (const part of b.parts) p(`#### ${part.title}`, ...part.paragraphs);
      if (b.caveat) p(`> ${b.caveat}`);
      continue;
    }
    p(b.summary);
    if (b.example) p(`예를 들면: ${b.example}`);
    if (b.traits) for (const t of b.traits) p(`**${t.name}** (내가 강한 포인트: ${t.shinesShort} / 내가 힘들 수 있는 포인트: ${t.burdenShort})`, `- 내가 강한 포인트: ${t.shines}`, `- 내가 힘들 수 있는 포인트: ${t.burden}`, `- 예: ${t.example}`);
    if (b.comfort) p("편안한 조건", ...b.comfort.comfortable.map((x) => `- ${x}`), "부딪히는 방식", ...b.comfort.clash.map((x) => `- ${x}`));
    if (b.reactionFlow) p(`반응이 이어지는 모습 (${b.reactionFlow.when})`, ...b.reactionFlow.steps.map((s, i) => `${i + 1}. ${s.label}: ${s.text}`), `도움이 되는 것: ${b.reactionFlow.helpful}`);
    for (const d of b.details) p(d);
    for (const s of b.sections ?? []) p(`#### ${s.title}`, s.body, `해 볼 것: ${s.tryIt}`);
    if (b.watch) p(`살펴볼 점: ${b.watch}`);
    if (b.caveat) p(`> ${b.caveat}`);
  }
  p(`## ${story7 ? NUMBER(r.blocks.length + 1, r.flow.topic) : r.flow.topic}`, `### ${r.flow.headline}`);
  p(r.flow.summary, ...(r.flow.paragraphs ?? []), `> ${r.flow.caveat}`, r.flow.cardText);
  p(...r.flow.years.map((y) => `- ${y.year}: ${y.theme}`));
  for (const x of r.flow.periods) p(`**${x.period}** ${x.theme}`, x.watch);
  p("이런 모습이 이어지면 / 이렇게 될 수 있습니다", ...r.flow.scenarios.map((s) => `- ${s.when} → ${s.then}`));
  if (story7 && r.advice) p(`## ${NUMBER(r.blocks.length + 2, r.advice.topic)}`, `### ${r.advice.headline}`, r.advice.summary, ...r.advice.details);
  p(story7 ? "### 조언 2~3가지(실천)" : "## 지금 확인해 볼 것");
  p(...r.actions.map((a, i) => `${i + 1}. **${a.title}** ${a.detail}${a.area ? ` (${AREA_NAME[a.area] ?? a.area}에서)` : ""}`));
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
