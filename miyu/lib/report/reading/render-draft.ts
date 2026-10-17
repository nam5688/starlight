// AI가 쓴 읽기 구조 초안(ReadingDraftV1)을 사람이 읽는 순서로 풀어 쓴다 — 운영자 검토용(저장된 리포트 화면이 아니다).
// 검사에 걸려 저장되지 못한 글도 읽을 수 있게 하고, 원문과 검토 후 수정본을 같은 모양으로 나란히 볼 때 쓴다. 글자는 바꾸지 않고 칸 이름(괄호)만 붙인다.
import type { ReadingDraftV1, Story7DraftV1, StoryDraftV1 } from "./types.ts";

const bullet = (label: string, text: unknown) => (typeof text === "string" && text.trim() ? `- ${text.trim()}  _(${label})_` : "");

export function renderDraftMarkdown(d: ReadingDraftV1): string {
  const out: string[] = [];
  const add = (...lines: string[]) => out.push(...lines.filter(Boolean));
  add(`# ${d.headline}`, "");
  const c = d.cards;
  add("## 첫 화면 카드");
  add(bullet("내가 강한 포인트", `${c?.strength?.keyword} — ${c?.strength?.note}`));
  add(bullet("내가 힘들 수 있는 포인트", `${c?.caution?.keyword} — ${c?.caution?.note}`));
  add(bullet("지금 나의 시기", c?.flow?.keyword), "");
  for (const [i, b] of (d.blocks ?? []).entries()) {
    add(`## ${i + 1}. ${b.headline}  \`${b.id}\``);
    add(bullet("요약", b.summary), bullet("예시", b.example));
    (b.details ?? []).forEach((t, k) => add(bullet(`자세한 풀이 ${k + 1}`, t)));
    (b.sections ?? []).forEach((s, k) => add(`### 소단락 ${k + 1}. ${s.title}`, bullet("풀이", s.body), bullet("해 볼 것", s.tryIt)));
    (b.traits ?? []).forEach((t, k) => add(`### 특징 ${k + 1}. ${t.name}  (${t.shinesShort} / ${t.burdenShort})`, bullet("잘 쓰일 때", t.shines), bullet("부담이 될 때", t.burden), bullet("예시", t.example)));
    if (b.comfort) add(bullet("편안한 조건", b.comfort.comfortable?.join(" · ")), bullet("부딪히기 쉬운 모습", b.comfort.clash?.join(" · ")));
    if (b.reactionFlow) add(bullet("반응 단계 — 언제", b.reactionFlow.when), ...(b.reactionFlow.steps ?? []).map((s) => bullet(`반응 단계 — ${s.label}`, s.text)), bullet("도움이 되는 것", b.reactionFlow.helpful));
    add(bullet("살펴볼 점", b.watch), "");
  }
  const f = d.flow;
  add(`## 앞으로의 시기 — ${f?.headline}`, bullet("요약", f?.summary), bullet("지금 시기 카드", f?.cardText));
  (f?.years ?? []).forEach((y) => add(bullet(`${y.year}년`, y.theme)));
  (f?.periods ?? []).forEach((p) => add(bullet(`시기 ${p.ref}`, p.theme), bullet(`시기 ${p.ref} — 살펴볼 점`, p.watch)));
  (f?.scenarios ?? []).forEach((s, k) => add(bullet(`시나리오 ${k + 1}`, `${s.when} → ${s.then}`)));
  add("", "## 실천");
  (d.actions ?? []).forEach((a, k) => add(bullet(`행동 ${k + 1}`, `${a.title} — ${a.detail}`)));
  if (d.focus?.length) add("", "## 알려 주신 고민을 반영한 해석", ...d.focus.map((p, k) => bullet(`고민 ${k + 1}`, p.text)));
  return out.join("\n") + "\n";
}

/**
 * 영역별 이야기(story-v1) 초안을 사람이 읽는 글로 — 영역마다 제목 아래 문단을 이어서 보여 준다(칸 이름을 붙이지 않는다: 이 형식에는 칸이 없다).
 * 영역 끝에 괄호로 연결한 근거 ID만 적어 어떤 자료를 이어 썼는지 볼 수 있게 한다.
 */
export function renderStoryDraftMarkdown(d: StoryDraftV1): string {
  const out: string[] = [];
  const add = (...lines: string[]) => out.push(...lines.filter((l) => l !== undefined));
  add(`# ${d.headline}`, "");
  const c = d.cards;
  add(`- 내가 강한 포인트 · ${c?.strength?.keyword} — ${c?.strength?.note}`, `- 내가 힘들 수 있는 포인트 · ${c?.caution?.keyword} — ${c?.caution?.note}`, `- 지금 나의 시기 · ${c?.flow?.keyword}`, "");
  for (const [i, a] of (d.areas ?? []).entries()) {
    add(`## ${i + 1}. ${a.headline}  \`${a.id}\``, "");
    for (const p of a.paragraphs ?? []) add(p, "");
    add(`_근거: ${(a.evidence ?? []).join(" · ")}_`, "");
  }
  const f = d.flow;
  add(`## 현재와 앞으로의 흐름 — ${f?.headline}`, "");
  for (const p of f?.paragraphs ?? []) add(p, "");
  (f?.years ?? []).forEach((y) => add(`- ${y.year}년 · ${y.theme}`));
  (f?.scenarios ?? []).forEach((s, k) => add(`- 시나리오 ${k + 1} · ${s.when} → ${s.then}`));
  add(`_근거: ${(f?.evidence ?? []).join(" · ")}_`, "");
  if (d.focus?.length) add("## 알려 주신 고민을 반영한 해석", "", ...d.focus.flatMap((p) => [p.text, ""]));
  add("## 지금 해 볼 행동 세 가지", "");
  (d.actions ?? []).forEach((a, k) => add(`${k + 1}. **${a.title}** — ${a.detail}  _(${a.area}에서)_`));
  return out.join("\n") + "\n";
}

/**
 * 7개 대주제(story-7) 초안을 사람이 읽는 글로 — 장마다 제목 아래 문단을 이어서 보여 준다(5번은 소제목 일 · 재물, 6번은 해마다 한 줄과 가능성 표). 장 끝에 괄호로 연결한 근거 ID만 적어 어떤 자료를 이어 썼는지 볼 수 있게 한다.
 * 검사에 걸려 저장되지 못한 글도 읽을 수 있게 하는 용도라 글자는 바꾸지 않는다.
 */
export function renderStory7DraftMarkdown(d: Story7DraftV1): string {
  const out: string[] = [];
  const add = (...lines: string[]) => out.push(...lines);
  add(`# ${d.headline}`, "");
  const c = d.cards;
  add(`- 내가 강한 포인트 · ${c?.strength?.keyword} — ${c?.strength?.note}`, `- 내가 힘들 수 있는 포인트 · ${c?.caution?.keyword} — ${c?.caution?.note}`, "");
  for (const s of d.sections ?? []) {
    add(`## ${s.no}. ${s.headline}`, "");
    for (const p of s.paragraphs ?? []) add(p, "");
    for (const part of s.parts ?? []) {
      add(`#### ${part.title}`, "");
      for (const p of part.paragraphs ?? []) add(p, "");
    }
    (s.years ?? []).forEach((y) => add(`- ${y.year}년 · ${y.theme}`));
    (s.scenarios ?? []).forEach((x, k) => add(`- 가능성 ${k + 1} · ${x.when} → ${x.then}`));
    if ((s.years ?? []).length || (s.scenarios ?? []).length) add("");
    add(`_근거: ${(s.evidence ?? []).join(" · ") || "(앞 장을 엮는 장 — 근거 없음)"}_`, "");
  }
  add("### 조언 2~3가지(실천)", "");
  (d.actions ?? []).forEach((a, k) => add(`${k + 1}. **${a.title}** — ${a.detail}`));
  return out.join("\n") + "\n";
}
