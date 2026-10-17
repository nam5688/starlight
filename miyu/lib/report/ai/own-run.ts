// 운영자 본인 입력 시험(2026-10-17)의 순수 부분 — 이 PC의 22문항 화면(/analyze)에서 운영자가 직접 답한 입력을 제품과 같은 길로 리포트 입력(ReportInput)으로 바꾸고,
// "AI에 무엇이 가는지"를 사람이 읽는 글로 보여 주고, 받은 글을 같은 검사 도구로 요약한다. 파일 읽기 · 쓰기와 호출은 scripts/run-own-story.ts가 한다. 호출을 하지 않는다.
import { ASSESSMENT_MODULES } from "../../assessment/modules/index.ts";
import { parseAnswers } from "../../assessment/scoring.ts";
import { LIKERT_OPTIONS, type Answers } from "../../assessment/types.ts";
import { parseBasicInfo, type BasicInfo } from "../../profile/basic-info.ts";
import { manseryeokEngine } from "../../saju/manseryeok-engine.ts";
import { submitAssessment } from "../../services/assessment-service.ts";
import { reportInputOf } from "../../services/report-service.ts";
import { createMemoryRepository } from "../../services/testing/memory-repository.ts";
import type { ReportInput } from "../generator.ts";
import type { Evidence } from "../evidence.ts";
import { checkReadingDepth } from "../reading/depth.ts";
import { ISSUE_CLASS_LABEL, groupReadingIssues, type IssueClass } from "../reading/issue-class.ts";
import { findRepeatedPhrasesIn } from "../reading/repeat.ts";
import { storyDepthSource } from "../reading/story-assemble.ts";
import { findMotifSpread } from "../reading/story-motif.ts";
import { STORY_AREAS } from "../reading/story-plan.ts";
import { validateStoryDraft, visibleStoryTexts } from "../reading/story-validate.ts";
import type { StoryDraftV1 } from "../reading/types.ts";
import { buildEvidence } from "./generator.ts";
import { referenceFor, promptsFor } from "./compare-plan.ts";
import type { Persona } from "./compare-personas.ts";
import { estimateInputTokens } from "./budget.ts";

/** /analyze에서 푼 입력을 이 PC의 파일로 내보낸 것(server/own-input.ts) */
export type OwnCapture = { info: BasicInfo; answers: Answers; capturedAt: string | null };

export function parseOwnCapture(raw: unknown): OwnCapture | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const info = parseBasicInfo(r.info);
  const answers = parseAnswers(r.answers);
  if (!info || !answers) return null;
  return { info, answers, capturedAt: typeof r.capturedAt === "string" ? r.capturedAt : null };
}

/**
 * 제품이 검사를 저장할 때와 같은 길(submitAssessment → reportInputOf)을 메모리 저장소로 거쳐 리포트 입력을 만든다.
 * 응답 검증 · 점수 환산 · 사주 계산 · MBTI 확인이 실제 저장 · 생성과 같은 코드다. DB에는 아무것도 저장하지 않는다.
 */
export async function ownReportInput(capture: OwnCapture, today: Date): Promise<{ ok: true; input: ReportInput } | { ok: false; message: string }> {
  const { repo } = createMemoryRepository(() => today);
  const saved = await submitAssessment({ repo, saju: manseryeokEngine }, { userId: "own-input-test", channel: "web", info: capture.info, answers: capture.answers, today });
  if (!saved.ok) return { ok: false, message: saved.message };
  return { ok: true, input: reportInputOf(saved.assessment) };
}

export const ownPersona = (input: ReportInput): Persona => ({ id: "OWN", note: "운영자 본인 입력(22문항 직접 응답)", input });

const answerLabel = (v: number | undefined) => LIKERT_OPTIONS.find((o) => o.value === v)?.label ?? "(답 없음)";

/**
 * "AI에 무엇이 가는가"를 사람이 읽는 글로 만든다 — 실제 요청과 같은 근거 목록 · 지시문을 같은 함수로 만들어 센다.
 * 이 글은 운영자 PC의 로컬 파일에만 두고(생년월일 · 응답이 있다) 저장소에 올리지 않는다.
 */
export function describeOwnInput(opts: { input: ReportInput; capture: OwnCapture; now: Date }): { markdown: string; evidence: Evidence[]; systemChars: number; userChars: number; estInputTokens: number } {
  const ref = referenceFor(opts.now);
  const evidence = buildEvidence(opts.input, ref);
  const [system, user] = promptsFor("story-v1", evidence, ref.iso, opts.input.context);
  const estInputTokens = estimateInputTokens([system, user]);
  const info = opts.capture.info;
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("# 본인 입력 확인 — 실제 AI에 무엇이 가는지");
  push();
  push("> 이 파일은 이 PC에만 있습니다(저장소 · 운영 DB에 올라가지 않는 `pilot-data` 폴더). 실제 호출 전에 이 내용이 맞는지 확인해 주세요.");
  push();
  push("## 1. AI에 가는 것 · 가지 않는 것");
  push(`- **가는 것**: 지시문 1개 + 아래 5번의 근거 문장 ${evidence.length}개 + 기준 날짜(${ref.iso}). 근거 문장에는 **사주 원국 여덟 글자와 계산 결과**, 응답에서 계산한 **경향 문장**, 입력한 **MBTI**가 들어 있습니다.`);
  push("- **가지 않는 것**: 닉네임 · 생년월일 원문 · 지역 · 22개 문항의 문장과 고른 선택지 · 점수 숫자. 응답은 \"이런 경향이 있다\"는 문장으로만 갑니다.");
  push("- 이 정보는 Anthropic(실제 AI 제공사)으로 전송됩니다. 이름 · 생년월일 원문이 없어도 원국 여덟 글자와 응답 경향은 본인 정보이므로, 보내도 되는지 확인한 뒤에만 `--execute`를 실행하세요.");
  push();
  push("## 2. 입력한 정보 (코드가 이해한 값)");
  const time = info.birthTimeUnknown ? "시각 모름" : info.birthTime || "시각 비움";
  push(`- ${info.calendar === "lunar" ? `음력${info.isLeapMonth ? " 윤달" : ""}` : "양력"} ${info.birthYear}-${info.birthMonth.padStart(2, "0")}-${info.birthDay.padStart(2, "0")} · ${time} · 성별 ${info.gender === "male" ? "남성" : info.gender === "female" ? "여성" : "(없음)"} · MBTI ${info.knownMbti || "(입력 안 함)"}`);
  const saju = opts.input.saju;
  if (saju.status === "ok") {
    push(`- 사주 계산: 일간 ${saju.dayMaster.stem}(${saju.dayMaster.stemHanja}) · 양력 환산 ${saju.solarDate.year}-${saju.solarDate.month}-${saju.solarDate.day} · ${saju.hourPillarOmitted ? "시주 없음(출생 시각 모름)" : "시주 포함"} — 이 날짜가 의도한 날인지 확인`);
  }
  push();
  push("## 3. 22개 문항에 답한 내용");
  push("| 번호 | 문항 | 내가 고른 답 |");
  push("| --- | --- | --- |");
  let n = 0;
  for (const m of ASSESSMENT_MODULES) {
    for (const item of m.items) {
      n++;
      push(`| ${n} | ${item.text.replace(/\|/g, "/")} | ${answerLabel(opts.capture.answers[item.id])} |`);
    }
  }
  push();
  push("## 4. 응답에서 코드가 계산한 값 (0~100 환산값 · 화면에는 점수로 보이지 않고 AI에도 숫자로 가지 않음)");
  const s = opts.input.summary;
  push(`- 대표 경향(후보 이름): **${s.tendency.name}**`);
  for (const [title, rows] of [["기질 · 성격", s.temperament], ["가까운 관계 반응", s.relationship]] as const) {
    push(`- ${title}: ${rows.map((r) => `${r.label} ${Math.round(r.score)}`).join(" · ")}`);
  }
  push(`- 평소 행동 방식 네 방향: ${s.mbti.axes.map((r) => `${r.label} ${Math.round(r.score)}`).join(" · ")}`);
  push();
  push(`## 5. 지금 AI가 받는 근거 ${evidence.length}개 (요청에 들어가는 그대로)`);
  const group = (title: string, items: Evidence[]) => {
    push(`### ${title} (${items.length}개)`);
    for (const e of items) push(`- \`${e.id}\` · ${e.strength}${e.uncertain ? " · 불확실(해석에 쓰지 않음)" : ""}\n  - 사실: ${e.fact}\n  - 해석 범위: ${e.cue}`);
    push();
  };
  group("사주 계산(원국 · 구조 · 대운 · 세운)", evidence.filter((e) => e.source === "saju"));
  group("응답에서 읽은 경향(성격 4축 · 기질 · 가까운 관계)", evidence.filter((e) => e.source === "survey"));
  group("입력한 정보(MBTI 등)", evidence.filter((e) => e.source === "self"));
  push("## 6. 요청 크기");
  push(`- 지시문 ${system.length.toLocaleString("ko-KR")}자 + 사용자 메시지 ${user.length.toLocaleString("ko-KR")}자 ≈ 입력 ${estInputTokens.toLocaleString("ko-KR")}토큰(어림)`);
  push(`- 호출은 **한 번**만 합니다. 형식 검사에 걸려도 자동으로 다시 쓰지 않고, 걸린 글을 그대로 저장해 읽을 수 있게 합니다.`);
  return { markdown: lines.join("\n") + "\n", evidence, systemChars: system.length, userChars: user.length, estInputTokens };
}

/**
 * 받은 글(통과 여부와 무관한 원문 JSON)을 같은 검사 도구로 요약한다 — 합격 판정이 아니라 읽기 전의 보조 지표다.
 * 반복 · 새 정보량 · 사주 근거 · 성격 · 기질 · 애착 반영을 코드가 셀 수 있는 만큼만 센다. 말을 바꿔 되풀이한 문장 · 근거를 제대로 풀었는지는 사람이 읽어야 한다.
 */
export function reviewOwnDraft(raw: unknown, evidence: Evidence[], hasContext = false): string {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("# 읽기 전 보조 지표 (코드 · 합격 판정 아님)");
  push();
  const story = typeof raw === "object" && raw !== null && Array.isArray((raw as { areas?: unknown }).areas);
  if (!story) {
    push("- 모델이 돌려준 글이 영역별 이야기(story-v1) 모양이 아니라 지표를 만들지 못했습니다. 원문을 직접 읽어 주세요.");
    return lines.join("\n") + "\n";
  }
  const draft = raw as StoryDraftV1;
  const v = validateStoryDraft(raw, evidence, { hasContext });
  push("## 1. 형식 · 근거 검사");
  if (v.ok) push("- 통과");
  else {
    const g = groupReadingIssues(v.errors);
    for (const k of Object.keys(g) as IssueClass[]) {
      push(`- **${ISSUE_CLASS_LABEL[k]}**: ${g[k].length}건`);
      for (const e of g[k]) push(`  - ${e}`);
    }
  }
  push();
  push("## 2. 내용 검사 (어림 — 좋은 글의 보증이 아님)");
  const depth = checkReadingDepth({ draft: storyDepthSource(draft) });
  push(`- 통과: ${depth.pass ? "예" : "아니오"}`);
  for (const f of depth.flags) push(`  - [${f.severity}] ${f.id}: ${f.message}`);
  push();
  const texts = visibleStoryTexts(draft);
  push("## 3. 반복");
  const reps = findRepeatedPhrasesIn(texts);
  push(reps.length === 0 ? "- 12자 이상 같은 구절이 두 칸에 있는 곳: 없음" : `- 12자 이상 같은 구절이 두 칸에 있는 곳 ${reps.length}개`);
  for (const r of reps) push(`  - "${r.phrase}" (${r.where[0]} · ${r.where[1]})`);
  const motifs = findMotifSpread(texts);
  push(motifs.length === 0 ? "- 한 낱말이 여러 영역으로 번진 곳: 없음(어림)" : `- 한 낱말이 여러 영역으로 번진 곳 ${motifs.length}개(어림 — 일관된 이야기인지 되풀이인지는 읽어서 판단)`);
  for (const m of motifs) push(`  - ${JSON.stringify(m)}`);
  push();
  push("## 4. 영역마다 이어 쓴 근거 (사주 · 응답 · 입력한 MBTI)");
  const byId = new Map(evidence.map((e) => [e.id, e]));
  for (const a of draft.areas ?? []) {
    const plan = STORY_AREAS.find((x) => x.id === a.id);
    const ids = a.evidence ?? [];
    const kinds = (src: Evidence["source"]) => ids.filter((id) => byId.get(id)?.source === src);
    push(`- ${a.id}(${plan?.topic ?? ""}): 사주 ${kinds("saju").length} · 응답 ${kinds("survey").length}(${kinds("survey").join(", ") || "-"}) · 입력한 MBTI ${kinds("self").length ? "연결" : "-"} · 문단 ${a.paragraphs?.length ?? 0}개`);
  }
  const allSurvey = evidence.filter((e) => e.source === "survey" && !e.uncertain);
  const used = new Set((draft.areas ?? []).flatMap((a) => a.evidence ?? []).filter((id) => byId.get(id)?.source === "survey"));
  push(`- 응답 근거 ${allSurvey.length}개 가운데 영역에 연결된 것 ${used.size}개 (연결하지 않은 응답 근거 = 글에 반영되지 않은 응답)`);
  push();
  push("※ 반복 · 새 정보량 · 근거를 제대로 풀었는지 · 연애 · 일 · 재물 해석이 서로 다른 이야기인지 · 9,900원을 낼 만한지는 낱말로 셀 수 없어 글 전문을 직접 읽고 판단해야 합니다(docs/real-ai-evaluation-rubric.md).");
  return lines.join("\n") + "\n";
}
