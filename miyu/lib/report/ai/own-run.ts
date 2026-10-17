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
import { story7DepthSource } from "../reading/story7-assemble.ts";
import { story7Evidence } from "../reading/story7-evidence.ts";
import { piecesOfStory7, textRepetition, type Story7Draft } from "../reading/story7-measure.ts";
import { STORY7_SECTIONS } from "../reading/story7-plan.ts";
import { STORY7_MOTIF_BLOCKS, story7Paragraphs, story7VoiceReport, validateStory7Draft, visibleStory7Texts } from "../reading/story7-validate.ts";
import { type VoiceReport } from "../style/voice.ts";
import type { Story7DraftV1, StoryDraftV1 } from "../reading/types.ts";
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
export function describeOwnInput(opts: { input: ReportInput; capture: OwnCapture; now: Date; /** 어떤 지시문으로 보내는가(기본 story-v1) */ variant?: "story-v1" | "story-7" }): { markdown: string; evidence: Evidence[]; systemChars: number; userChars: number; estInputTokens: number } {
  const ref = referenceFor(opts.now);
  const evidence = buildEvidence(opts.input, ref);
  const variant = opts.variant ?? "story-v1";
  const [system, user] = promptsFor(variant, evidence, ref.iso, opts.input.context);
  const estInputTokens = estimateInputTokens([system, user]);
  const info = opts.capture.info;
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("# 본인 입력 확인 — 실제 AI에 무엇이 가는지");
  push();
  push("> 이 파일은 이 PC에만 있습니다(저장소 · 운영 DB에 올라가지 않는 `pilot-data` 폴더). 실제 호출 전에 이 내용이 맞는지 확인해 주세요.");
  push();
  push("## 1. AI에 가는 것 · 가지 않는 것");
  push(`- **지시문**: ${variant === "story-7" ? "story-7(7개 고정 대주제 — 나는 어떤 사람일까? · 나의 강점과 약점 · 연애와 애착 · 인간관계와 인연 · 일과 재물 · 앞으로의 운과 변화 · 미유의 종합 조언)" : "story-v1(영역별 이야기)"}`);
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
  // 7개 대주제(story-7) 모양이면 그 검사 · 지표로 읽는다
  if (typeof raw === "object" && raw !== null && Array.isArray((raw as { sections?: unknown }).sections)) return reviewStory7Draft(raw, evidence, hasContext);
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

/**
 * 7개 대주제(story-7) 글의 읽기 전 보조 지표 — 코드가 셀 수 있는 것만 센다(합격 판정이 아니다). 형식 · 근거 검사 · 장마다 분량 · 반복(같은 구절 · 한 낱말이 여러 장으로 번진 곳 · 장 사이 낱말 겹침) ·
 * 장마다 연결한 근거(사주 · 응답 · MBTI)와 같은 응답이 몇 장에 쓰였는지 · 재물 소제목 · 조언 개수. 말을 바꿔 되풀이한 문장 · 근거를 제대로 풀었는지 · 새로 알게 해 주는가 ·
 * 연애 · 일 · 재물이 서로 다른 이야기인지 · 9,900원을 낼 만한지는 낱말로 셀 수 없어 글 전문을 직접 읽어야 한다.
 */
export function reviewStory7Draft(raw: unknown, evidence: Evidence[], hasContext = false): string {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("# 읽기 전 보조 지표 — 7개 대주제 (코드 · 합격 판정 아님)");
  push();
  const draft = raw as Story7DraftV1;
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const v = validateStory7Draft(raw, evidence, { hasContext });
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
  push("## 2. 장마다 분량과 연결한 근거");
  push("| 장 | 종류 | 문단 | 글자 | 사주 근거 | 응답 근거 | 입력한 MBTI |");
  push("| --- | --- | --- | --- | --- | --- | --- |");
  const sections = Array.isArray(draft.sections) ? draft.sections : [];
  const usedBy = new Map<string, number[]>();
  for (const plan of STORY7_SECTIONS) {
    const s = sections.find((x) => Number(x?.no) === plan.no);
    if (!s) {
      push(`| ${plan.no} ${plan.title} | ${plan.kind === "owner" ? "근거를 소유" : "앞 장을 엮음"} | (없음) | | | | |`);
      continue;
    }
    const ps = story7Paragraphs(s);
    const ids = Array.isArray(s.evidence) ? s.evidence : [];
    const of = (src: Evidence["source"]) => ids.filter((id) => byId.get(id)?.source === src);
    for (const id of of("survey")) usedBy.set(id, [...(usedBy.get(id) ?? []), plan.no]);
    push(`| ${plan.no} ${plan.title} | ${plan.kind === "owner" ? "근거를 소유" : "앞 장을 엮음"} | ${ps.length} | ${ps.join("").length} | ${of("saju").length} | ${of("survey").length}${of("survey").length ? `(${of("survey").join(", ")})` : ""} | ${of("self").length ? "연결" : "-"} |`);
  }
  push();
  const surveyAll = evidence.filter((e) => e.source === "survey" && !e.uncertain);
  const cited = new Set(usedBy.keys());
  push(`- 응답 근거 ${surveyAll.length}개 가운데 7개 장에 연결된 것 ${cited.size}개(연결하지 않은 응답 근거 = 글에 반영되지 않은 응답)`);
  const multi = [...usedBy].filter(([, nos]) => nos.length >= 2);
  push(multi.length === 0 ? "- 같은 응답 근거를 두 장 이상이 인용한 곳: 없음" : `- 같은 응답 근거를 두 장 이상이 인용한 곳 ${multi.length}개: ${multi.map(([id, nos]) => `${id} → ${nos.join("·")}번`).join(" / ")}`);
  const mine = story7Evidence(evidence);
  push(`- 배정(코드가 장마다 나눠 건넨 근거): ${STORY7_SECTIONS.filter((p) => p.kind === "owner").map((p) => `${p.no}번 사주 ${mine.saju[p.no].length} · 응답 ${mine.personal[p.no].filter((id) => id !== "self.mbti").length}`).join(" / ")}`);
  push();
  push("## 3. 내용 검사 (어림 — 좋은 글의 보증이 아님)");
  const depth = checkReadingDepth({ draft: story7DepthSource(draft) });
  push(`- 통과: ${depth.pass ? "예" : "아니오"}`);
  for (const f of depth.flags) push(`  - [${f.severity}] ${f.id}: ${f.message}`);
  push();
  push("## 4. 반복");
  const texts = visibleStory7Texts(draft);
  const reps = findRepeatedPhrasesIn(texts);
  push(reps.length === 0 ? "- 12자 이상 같은 구절이 두 칸에 있는 곳: 없음" : `- 12자 이상 같은 구절이 두 칸에 있는 곳 ${reps.length}개`);
  for (const r of reps) push(`  - "${r.phrase}" (${r.where[0]} · ${r.where[1]})`);
  const motifs = findMotifSpread(texts, STORY7_MOTIF_BLOCKS);
  push(motifs.length === 0 ? "- 한 낱말이 제목 · 카드와 여러 장으로 번진 곳: 없음(어림)" : `- 한 낱말이 제목 · 카드와 여러 장으로 번진 곳 ${motifs.length}개(어림 — 일관된 이야기인지 되풀이인지는 읽어서 판단)`);
  for (const m of motifs) push(`  - ${JSON.stringify(m)}`);
  const rep = textRepetition(piecesOfStory7(draft as unknown as Story7Draft));
  push(`- 장 사이 낱말 겹침(평균 ${rep.pairOverlapMean.toFixed(2)} · 최대 ${rep.pairOverlapMax.value.toFixed(2)}${rep.pairOverlapMax.a ? ` — ${rep.pairOverlapMax.a} · ${rep.pairOverlapMax.b}` : ""}) · 제목과 본문 겹침 최대 ${rep.headOverlapMax.value.toFixed(2)}${rep.headOverlapMax.block ? ` — ${rep.headOverlapMax.block}` : ""} · 전체 글자 ${rep.chars.toLocaleString("ko-KR")}자`);
  if (rep.topStems.length) push(`- 가장 많은 장에 걸친 낱말(앞 두 글자): ${rep.topStems.map((x) => `${x.stem}… ${x.blocks}곳 ${x.total}번`).join(" · ")}`);
  push();
  push("## 5. 문체 점검 (미유 말투 — 코드가 센 어림, 읽는 사람의 판단을 대신하지 않음)");
  voiceLines(story7VoiceReport(draft, evidence)).forEach((l) => push(l));
  push();
  push("## 6. 5번 일과 재물 · 7번 조언");
  const five = sections.find((x) => Number(x?.no) === 5);
  const money = five?.parts?.find((p) => p?.title === "재물");
  push(money ? `- 재물 소제목: ${money.paragraphs?.length ?? 0}문단 · ${(money.paragraphs ?? []).join("").length}자 — 돈 이야기가 실제로 있는지 · 근거 없는 습관 단정이 없는지는 읽어서 확인` : "- 재물 소제목이 없습니다.");
  push(`- 7번 조언(actions): ${Array.isArray(draft.actions) ? draft.actions.length : 0}개 — 앞 장의 다른 결론에서 나온 서로 다른 행동인지는 읽어서 확인`);
  push();
  push("※ 반복(말을 바꿔 되풀이한 문장) · 새로 알게 해 주는 정보 · 명리 근거를 제대로 풀었는지 · 성격 · 기질 · 애착이 풀이와 자연스럽게 이어지는지 · 연애 · 일 · 재물이 서로 다른 이야기인지 · 9,900원을 낼 만한지는 낱말로 셀 수 없어 글 전문을 직접 읽고 판단해야 합니다(docs/real-ai-evaluation-rubric.md).");
  return lines.join("\n") + "\n";
}

/** 문체 점검 결과를 읽기 전 지표에 싣는 줄들 — 실패(저장하지 않음) · 고쳐 쓰기 안내 · 사람이 읽고 판단할 목록 · 센 값 */
export function voiceLines(r: VoiceReport): string[] {
  const out: string[] = [];
  const m = r.metrics;
  out.push(`- 센 값: ${m.chars.toLocaleString("ko-KR")}자 · ${m.sentences}문장 · 합쇼체 ${m.formal}곳 · 추상어 합계 ${m.abstractTotal}번${Object.keys(m.abstractByWord).length ? `(${Object.entries(m.abstractByWord).map(([w, n]) => `${w} ${n}`).join(" · ")})` : ""} · 대조형 틀 ${Object.keys(m.contrast).length ? Object.entries(m.contrast).map(([k, n]) => `${k} ${n}`).join(" · ") : "없음"} · 가장 많은 마무리 "~${m.topEnding.kind}" ${Math.round(m.topEnding.share * 100)}% · 이름 호칭 ${m.nameCalls}문단`);
  const group = (level: "fail" | "repair" | "review", label: string) => {
    const f = r.findings.filter((x) => x.level === level);
    out.push(f.length === 0 ? `- ${label}: 없음` : `- **${label}**: ${f.length}건`);
    for (const x of f) {
      out.push(`  - ${x.message}`);
      for (const e of x.examples ?? []) out.push(`    · ${e}`);
    }
  };
  group("fail", "저장하지 않는 위반(실패)");
  group("repair", "고쳐 쓰기를 부탁할 것");
  group("review", "사람이 읽고 판단할 것");
  return out;
}
