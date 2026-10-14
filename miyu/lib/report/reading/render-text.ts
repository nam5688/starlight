// 읽기 구조 리포트를 사람이 훑어 읽는 글(마크다운)로 옮긴다 — AI 비교의 블라인드 평가용 파일에 쓴다.
// 화면에 보이는 본문(요약 · 예시 · 풀이 · 살펴볼 점 · 행동)만 담고, 코드가 근거 목록에서 만든 "분석 근거"와 내부 근거 ID는 넣지 않는다
// (후보 사이에서 같은 값이라 평가에 도움이 되지 않고, 어느 후보인지 짐작하게 하지도 않는다).
// 대표 경향 이름(~형)은 응답에서 코드가 정한 값이라 같은 인물이면 후보와 상관없이 같다 — 화면과 같게 맨 위에 보여 준다(어느 후보인지 알려 주지 않는다).
import { tendencyPhrase } from "../../assessment/dev-rules.ts";
import type { IntegratedReadingReport } from "./types.ts";

export function renderReadingMarkdown(r: IntegratedReadingReport, opts: { tendencyName?: string } = {}): string {
  const out: string[] = [];
  const p = (...lines: string[]) => out.push(...lines, "");
  p(`# ${r.personName} 님의 개인 통합 리포트`);
  const tendency = tendencyPhrase(opts.tendencyName ?? r.base?.tendency.name);
  if (tendency) p(`**나의 대표 경향** ${tendency} (응답을 보고 붙인 후보 설명이며, 진단이나 평생 가는 유형이 아닙니다)`);
  p(`**핵심 해석** ${r.headline}`);
  p(...r.summary.map((c) => `- ${c.label} · ${c.keyword} — ${c.note}`));
  if (r.focus?.length) {
    p("## 알려 주신 고민까지 반영한 해석");
    for (const f of r.focus) p(f.text);
  }
  for (const b of r.blocks) {
    p(`## ${b.topic}`, `### ${b.headline}`);
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
  p(`## ${r.flow.topic}`, `### ${r.flow.headline}`);
  p(r.flow.summary, `> ${r.flow.caveat}`, r.flow.cardText);
  p(...r.flow.years.map((y) => `- ${y.year}: ${y.theme}`));
  for (const x of r.flow.periods) p(`**${x.period}** ${x.theme}`, x.watch);
  p("이런 모습이 이어지면 / 이렇게 될 수 있습니다", ...r.flow.scenarios.map((s) => `- ${s.when} → ${s.then}`));
  p("## 지금 확인해 볼 것");
  p(...r.actions.map((a, i) => `${i + 1}. **${a.title}** ${a.detail}`));
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
