// 저장된 AI 초안 글을 새 호출 없이 검토한다 — 같은 근거 · 같은 검사로 다시 돌리고(코드 검사, 외부 AI 호출 없음 · 비용 없음) 읽는 사람용 요약을 만든다.
// 사용: node scripts/review-saved-draft.ts <초안.json> [--persona P01] [--ref 2026-10] [--render] [--evidence]
//   · 검사 결과를 내용 오류 / 형식 · 가독성 / 내용 품질로 나눈다(issue-class.ts). "검사 오탐"은 글을 읽은 사람이 붙이는 판단이라 여기서 알 수 없다.
//   · 칸 사이에 되풀이되는 말(두 낱말 묶음이 몇 개 칸에 나오는지, 어림), 처음 쓴 사주 용어와 그 칸을 센다.
//   · --render: 초안을 사람이 읽는 순서로 풀어 쓴다. --evidence: 이 글을 쓸 때 건넨 근거 목록(가상 인물 자료).
import { readFileSync } from "node:fs";
import { buildPersonas } from "../lib/report/ai/compare-personas.ts";
import { buildEvidence } from "../lib/report/ai/generator.ts";
import { checkReadingDepth } from "../lib/report/reading/depth.ts";
import { ISSUE_CLASS_LABEL, groupReadingIssues, type IssueClass } from "../lib/report/reading/issue-class.ts";
import { READING_PROMPT_VERSION } from "../lib/report/reading/prompt.ts";
import { findRepeatedPhrases, findRepeatedPhrasesIn } from "../lib/report/reading/repeat.ts";
import { renderDraftMarkdown, renderStoryDraftMarkdown } from "../lib/report/reading/render-draft.ts";
import { storyDepthSource } from "../lib/report/reading/story-assemble.ts";
import { STORY_AREAS } from "../lib/report/reading/story-plan.ts";
import { STORY_PROMPT_VERSION } from "../lib/report/reading/story-prompt.ts";
import { validateStoryDraft, visibleStoryTexts } from "../lib/report/reading/story-validate.ts";
import { ALL_TERMS } from "../lib/report/reading/terms.ts";
import type { ReadingDraftV1, StoryDraftV1 } from "../lib/report/reading/types.ts";
import { validateReadingDraft, visibleTexts } from "../lib/report/reading/validate.ts";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--persona" && args[args.indexOf(a) - 1] !== "--ref");
if (!file) throw new Error("초안 JSON 경로가 필요합니다.");
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const personaId = arg("--persona") ?? "P01";
const [ry, rm] = (arg("--ref") ?? "2026-10").split("-").map(Number);

const persona = buildPersonas(10).find((p) => p.id === personaId);
if (!persona) throw new Error(`가상 인물 ${personaId}가 없습니다.`);
const evidence = buildEvidence(persona.input, { year: ry, month: rm });
const raw = JSON.parse(readFileSync(file, "utf8"));
// 영역별 이야기(story-v1)는 areas가 있다 — 같은 검사 도구로 형식에 맞는 검사를 쓴다
const story = Array.isArray((raw as { areas?: unknown }).areas);
const draft = raw as ReadingDraftV1;
const storyDraft = raw as StoryDraftV1;

if (args.includes("--render")) {
  process.stdout.write(story ? renderStoryDraftMarkdown(storyDraft) : renderDraftMarkdown(draft));
  process.exit(0);
}
if (args.includes("--evidence")) {
  for (const e of evidence) console.log(`[${e.id}] ${e.strength}${e.uncertain ? " UNCERTAIN" : ""}\n  fact: ${e.fact}\n  cue: ${e.cue}`);
  process.exit(0);
}

const log = (s = "") => console.log(s);
log(`# 저장된 글 검토 (새 호출 없음 · 비용 0원)`);
log(`- 파일: ${file}`);
log(`- 가상 인물: ${personaId} · 근거 ${evidence.length}개 · 기준 월 ${ry}-${String(rm).padStart(2, "0")} · 형식 ${story ? "영역별 이야기(story-v1)" : "읽기 구조(reading-v1)"} · 현재 지시문 ${story ? STORY_PROMPT_VERSION : READING_PROMPT_VERSION} · 현재 검사 코드로 다시 돌림`);

const v = story ? validateStoryDraft(raw, evidence, { hasContext: Boolean(persona.input.context) }) : validateReadingDraft(raw, evidence, { hasContext: Boolean(persona.input.context) });
log(`\n## 1. 형식 · 근거 검사 (validateReadingDraft)`);
if (v.ok) log("- 통과");
else {
  const g = groupReadingIssues(v.errors);
  for (const k of Object.keys(g) as IssueClass[]) {
    log(`- **${ISSUE_CLASS_LABEL[k]}**: ${g[k].length}건`);
    for (const e of g[k]) log(`  - ${e}`);
  }
}

log(`\n## 2. 내용 검사 (checkReadingDepth — 어림, 좋은 글의 보증이 아님)`);
const depth = checkReadingDepth({ draft: story ? storyDepthSource(storyDraft) : draft });
log(`- 통과: ${depth.pass ? "예" : "아니오"}`);
for (const f of depth.flags) log(`  - [${f.severity}] ${f.id}: ${f.message}`);

log(`\n## 3. 되풀이 구절 (12자 이상 같은 토막이 두 칸에 있음)`);
const reps = story ? findRepeatedPhrasesIn(visibleStoryTexts(storyDraft)) : findRepeatedPhrases(draft);
if (reps.length === 0) log("- 없음");
for (const r of reps) log(`- "${r.phrase}" (${r.where[0]} · ${r.where[1]})`);

log(`\n## 4. 여러 칸에 나오는 말 (낱말 두 개 묶음의 앞 두 글자 기준 어림 — 몇 개 칸에 나오는지)`);
const texts = story ? visibleStoryTexts(storyDraft) : visibleTexts(draft);
const cover = new Map<string, Set<string>>();
for (const { where, text } of texts) {
  const words = text.match(/[가-힣]{2,}/g) ?? [];
  for (let i = 0; i + 1 < words.length; i++) {
    const key = `${words[i].slice(0, 2)} ${words[i + 1].slice(0, 2)}`;
    (cover.get(key) ?? cover.set(key, new Set()).get(key)!).add(where);
  }
}
const top = [...cover.entries()].map(([k, s]) => [k, s.size] as const).filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]).slice(0, 10);
if (top.length === 0) log("- 4개 칸 이상에 나오는 묶음 없음");
for (const [k, n] of top) log(`- "${k}…" ${n}개 칸`);
log(`- 글 칸 ${texts.length}개 · 문장 약 ${texts.reduce((a, t) => a + (t.text.match(/[^.!?]+[.!?]?/g)?.filter((x) => x.trim()).length ?? 0), 0)}개 · ${texts.reduce((a, t) => a + t.text.length, 0).toLocaleString("ko-KR")}자`);

log(`\n## 5. 처음 쓴 사주 용어 (읽는 순서대로)`);
const seen = new Set<string>();
for (const { where, text } of texts) {
  for (const t of ALL_TERMS) {
    if (seen.has(t.name)) continue;
    if (new RegExp(t.re.source).test(text)) {
      seen.add(t.name);
      const at = text.search(new RegExp(t.re.source));
      log(`- ${t.name} — ${where}: "…${text.slice(Math.max(0, at - 12), at + t.name.length + 22).trim()}…"`);
    }
  }
}
if (seen.size === 0) log("- 없음");

if (story) {
  log(`\n## 6. 영역마다 이어 쓴 근거 (사주 · 개인 성향 · 입력한 MBTI)`);
  const byId = new Map(evidence.map((e) => [e.id, e]));
  for (const a of storyDraft.areas ?? []) {
    const plan = STORY_AREAS.find((x) => x.id === a.id);
    const ids = a.evidence ?? [];
    const saju = ids.filter((id) => byId.get(id)?.source === "saju");
    const survey = ids.filter((id) => byId.get(id)?.source === "survey");
    const self = ids.filter((id) => byId.get(id)?.source === "self");
    log(`- ${a.id}(${plan?.topic ?? ""}): 사주 ${saju.length} · 응답 ${survey.length}(${survey.join(", ") || "-"}) · 입력한 MBTI ${self.length ? "연결" : "-"} · 문단 ${a.paragraphs?.length ?? 0}개`);
  }
  const mbtiAreas = (storyDraft.areas ?? []).filter((a) => (a.evidence ?? []).includes("self.mbti")).length;
  log(`- 입력한 MBTI를 연결한 영역 ${mbtiAreas}곳 (기준: 근거가 있으면 핵심 · 관계 · 일 가운데 2곳 이상, 시기에는 쓰지 않음)`);
  const all = (storyDraft.areas ?? []).flatMap((a) => a.evidence ?? []);
  const usedSurvey = new Set(all.filter((id) => byId.get(id)?.source === "survey"));
  const allSurvey = evidence.filter((e) => e.source === "survey" && !e.uncertain);
  log(`- 응답 근거 ${allSurvey.length}개 가운데 영역에 연결된 것 ${usedSurvey.size}개`);
}
