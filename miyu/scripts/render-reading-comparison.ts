// 같은 가상 인물(하린)의 기존 풀이와 자기 이해 풀이(수정안)를 나란히 보여 주는 문서를 만든다.
//   docs/reading-comparison-haerin.html  — 더블클릭으로 여는 나란히 보기 (PC는 두 칸, 모바일은 위아래)
//   docs/philosophical-reading-comparison.md — 같은 내용의 요약 · 측정 · 문단별 점검 · 반영안
// 두 풀이는 실제 AI 출력이 아니라 같은 근거 목록으로 쓴 예시이고(docs/samples/), 아직 생성 지침 · 화면에는 반영하지 않았다.
// 실행: node scripts/render-reading-comparison.ts   (miyu 폴더에서)
import { readFileSync, writeFileSync } from "node:fs";
import { ASSESSMENT_MODULES } from "../lib/assessment/modules/index.ts";
import { EMPTY_BASIC_INFO } from "../lib/profile/basic-info.ts";
import { manseryeokEngine } from "../lib/saju/manseryeok-engine.ts";
import { submitAssessment } from "../lib/services/assessment-service.ts";
import { createMemoryRepository } from "../lib/services/testing/memory-repository.ts";
import { buildEvidence } from "../lib/report/ai/generator.ts";
import { personalV2Texts } from "../lib/report/concern/texts.ts";
import type { ConcernDraftV1 } from "../lib/report/concern/types.ts";
import { concernBlocks, containedShare, groundingOf, noveltyAgainst, readingBlocks, type PhilosophicalReading } from "../lib/report/philosophy/compare.ts";
import type { PersonalContextInput } from "../lib/personalization/context.ts";

const NAME = "하린";
const read = <T,>(name: string) => JSON.parse(readFileSync(new URL(`../docs/samples/${name}`, import.meta.url), "utf8")) as T;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nm = (s: string) => s.replaceAll("{name}", NAME);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const f2 = (x: number) => x.toFixed(2);
const n0 = (x: number) => x.toLocaleString("ko-KR");

// 비교에 쓰는 가상 인물의 근거 목록 (실제 만세력 엔진 계산 + 가상 응답) — target-sample.test.ts와 같은 방법
const USER = "11111111-1111-4111-8111-111111111111";
const now = () => new Date("2026-10-12T00:00:00Z");
const mem = createMemoryRepository(now);
await mem.repo.ensureProfile(USER);
const items = ASSESSMENT_MODULES.flatMap((m) => m.items);
const answers = Object.fromEntries(items.map((i, n) => [i.id, n % 2 ? 2 : 5]));
const saved = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId: USER, channel: "web", info: { ...EMPTY_BASIC_INFO, nickname: NAME, birthYear: "2001", birthMonth: "7", birthDay: "29", birthTime: "06:10", knownMbti: "INFJ" }, answers, today: now() });
if (!saved.ok) throw new Error("save");
const evidence = buildEvidence({ nickname: NAME, knownMbti: "INFJ", birthText: "", summary: saved.assessment.summary, saju: saved.assessment.saju, gender: "female", context: null } as never, { year: 2026, month: 10 });
const byId = new Map(evidence.map((e) => [e.id, e]));
/** 화면용 짧은 근거 이름 — 응답 환산값 숫자는 보이지 않는다 */
const label = (id: string) => {
  const e = byId.get(id);
  if (!e) return id;
  if (e.source !== "saju") return `응답 · ${e.cue.replace("응답에서 나타난 행동 경향: ", "").replace(/[.]$/, "")}`;
  let fact = e.fact.replace(/\s*\(지장간 제외\)/, "").replace(/\s+—\s.*$/, "");
  if ((fact.match(/\(/g) ?? []).length > (fact.match(/\)/g) ?? []).length) fact = fact.replace(/\s*\([^)]*$/, "");
  return `원국 · ${fact}`;
};

const existing = read<{ concern: PersonalContextInput; draft: ConcernDraftV1 }>("concern-existing-format-haerin.json");
const revised = read<{ concern: PersonalContextInput; reading: PhilosophicalReading }>("philosophical-reading-haerin.json");
const base = read<Record<string, unknown>>("target-report-haerin.json");
const baseText = personalV2Texts({ ...base, kind: "personal-v2" } as never).all.join(" ");
const E = existing.draft;
const R = revised.reading;
const eb = concernBlocks(E);
const rb = readingBlocks(R);
const ge = groundingOf(eb, existing.concern, evidence);
const gr = groundingOf(rb, revised.concern, evidence);
const eText = eb.map((b) => b.text).join(" ");

// ───────── 문단별 점검: 수정안의 각 덩어리가 새로 알려 주는 것 (손으로 쓴 점검 — 근거와 겹침은 코드가 센다) ─────────
const NEWS: string[] = [
  "읽는 법: 해석은 가설이고 알려 준 내용은 따로 표시한다. 새로운 정보는 아니다 (기존 '이해' 문단의 \"알아맞힌 것이 아니라\" 문장과 같은 역할).",
  "새로움 + 지속 + 식상→재성을 겹쳐, 중요한 것이 새로움 자체보다 '내 손으로 끝낸 것'일 수 있다는 가설. 기존은 같은 근거를 '끌림과 확인'으로만 읽었다.",
  "남은 프로젝트가 마음에 걸리는 이유를 '그 일의 가치'와 '맡은 사람의 책임'으로 나눠 묻는 질문은 새롭다. 비겁(혼자 감당하기 쉬운 부분)을 설명하는 문장은 기존 구조 문단과 같은 문장을 다시 썼다.",
  "선택의 기준을 '무엇이 더 좋은가'에서 '무엇이 확인되면 정할 수 있는가'로 바꾸는 제안, 일주일째 못 정한 이유의 가설. 기존은 확인 항목 세 가지를 적으라는 행동뿐이었다.",
  "끌림과 확인이 각각 하는 일(시작을 밀고 / 되돌리기 어려운 손실을 줄임)과 '한쪽을 이기게 하지 않는다'는 방향은 새롭다. 근거(끌림 · 신중함 · 목 기운)는 기존 구조 문단과 같다.",
  "반응이 적은 구간을 '견딜 장치가 있는가'의 문제로 바꾸고, 새 팀에서 반응을 얻을 곳은 알려 준 내용에 없다고 밝힌다. 근거는 기존 상황별 해석과 같고 문장은 일부 겹친다.",
  "말로 꺼내는 힘과 혼자 정리하려는 마음의 갈등을, 이 고민이 머릿속에서만 길어질 수 있다는 점과 잇는다. 근거는 기존 차이 문단과 같고 문장은 일부 겹친다.",
  "원국 · 응답 · 알려 준 고민이 한 방향으로 모이지 않는다고 밝히고 합치지 않는다. 기존은 '한쪽이 틀린 것이 아니다' 수준이었다.",
  "이어 가는 힘의 대가(새로 끌리는 일이 들어올 자리가 줄어듦)와 그것이 두드러지는 때. 기존은 강점 쪽만 썼다. 근거를 설명하는 문장 일부는 기존과 겹친다.",
  "신중함의 대가가 '기다리는 사람에게 침묵으로 전달됨'일 수 있다. 기존은 확인이 길어져 답이 늦어진다까지였다.",
  "세심함의 대가: 반응이 없을 때 의욕이 먼저 떨어진다. 기존 구조 문단과 같은 근거를 '강점과 대가'의 형태로 다시 놓았다.",
  "선택지마다 지키는 것 · 내려놓는 것 · 부담이 줄어드는 조건 · 직접 확인할 것(알려 준 내용에 없음). 기존은 상황별 제안만 있고 선택지의 득실이 없었다.",
  "같은 방식. 남아서 끝낼 때 얻는 것과 미루는 것, 확인할 것.",
  "시점을 나누는 선택지 — 그런 방법이 있는지는 알려 준 내용에 없어 가능성으로만 둔다. 기존에는 없는 선택지다.",
  "올해 · 내년의 주제 문장은 기존 시기 항목과 거의 같다. 새로운 것은 그 주제를 '글로 정해 둘 두 가지'(성과의 기준 · 책임의 범위)로 잇는 부분이다.",
  "질문(닫고 싶은 것이 프로젝트인가, 끝낸 사람이라는 기록인가)은 새롭다. 행동(남은 일을 항목으로 적기)은 기존 행동과 비슷하다.",
  "질문(새 팀에서 반응을 얻을 곳)은 새롭고, 행동(중간 점검 날짜 요청)은 기존 상황별 제안 · 행동과 같다.",
  "질문: 무엇이 확인되면 정할 수 있는가. 기존의 '확인 항목 세 가지'와 비슷하나 한 가지 + 날짜로 좁혔다.",
  "질문: 후회할 것 같은 느낌은 확인된 조건에서 오는가, 모르는 것에서 오는가. 행동은 기존 행동과 거의 같고 질문의 형태로 뒤집었다.",
  "질문: 이 고민을 말로 꺼낼 사람. 기존은 차이 문단에서 암시만 했고 행동으로는 없었다.",
];
const audit = rb.map((b, i) => ({
  kind: b.kind,
  head: b.text.slice(0, 26).replace(/[.:]\s*$/, ""),
  evidence: b.evidence,
  inE: containedShare([b], eText, 0.35) >= 1 ? "겹침 큼" : noveltyAgainst([b], eText) >= 0.8 ? "대부분 새 말" : "일부 겹침",
  novel: noveltyAgainst([b], eText),
  news: NEWS[i] ?? "",
}));

// ───────── 나란히 보기 (HTML) ─────────
const chips = (ids: string[]) => `<span class="ev">${ids.map((id) => `<span class="chip" title="${esc(id)}">${esc(label(id))}</span>`).join("")}</span>`;
const para = (text: string, ids?: string[], title?: string) => `<div class="blk">${title ? `<p class="bt">${esc(nm(title))}</p>` : ""}<p>${esc(nm(text))}</p>${ids ? chips(ids) : ""}</div>`;
const none = (text: string) => `<p class="none">${esc(text)}</p>`;

const eLeft = {
  values: [none("기존 형식에는 '무엇을 중요하게 여기는가'에 답하는 부분이 없습니다. 가장 가까운 것은 고민 이해와 구조 문단입니다."), para(E.understanding[0].text, E.understanding[0].evidence, "이해"), para(E.pattern[0].text, E.pattern[0].evidence, "구조 ①")].join(""),
  conflicts: [none("가장 가까운 것은 구조 문단 하나와 사주와 응답이 다른 부분입니다."), para(E.pattern[2].text, E.pattern[2].evidence, "구조 ③"), ...E.differences.map((d, i) => para(d.text, d.evidence, `사주와 응답의 차이 ${i + 1}`))].join(""),
  strength: [none("기존 형식에는 강점과 대가를 짝지어 쓰는 부분이 없습니다. 가장 가까운 것은 구조 문단 하나입니다."), para(E.pattern[1].text, E.pattern[1].evidence, "구조 ②")].join(""),
  choices: [none("기존 형식은 알려 준 상황마다 '읽기 + 제안'을 씁니다. 선택지마다 무엇을 지키고 내려놓는지는 쓰지 않습니다."), ...E.situations.map((s, i) => para(`${s.reading} ${s.suggestion}`, s.evidence, `상황 ${i + 1}: ${s.situation}`)), ...E.timeline.map((t) => para(`${t.theme}. ${t.opportunity} ${t.caution}`, t.evidence, t.period))].join(""),
  actions: E.actions.map((a) => para(a.action, a.evidence, a.situation)).join(""),
};
const rRight = {
  values: [para(R.intro.text, R.intro.evidence), ...R.values.map((v) => para(v.text, v.evidence, v.title))].join(""),
  conflicts: [...R.conflicts.map((c) => para(c.text, c.evidence, c.title)), para(R.disagreement.text, R.disagreement.evidence, "세 가지를 합치지 않습니다")].join(""),
  strength: R.strengthCost.map((s) => `<div class="blk"><p class="bt">${esc(s.strength)}</p><p><b>대가</b> ${esc(s.cost)} <span class="when">(${esc(s.when)})</span></p><p>${esc(s.reading)}</p>${chips(s.evidence)}</div>`).join(""),
  choices:
    (R.choices ?? []).map((c) => `<div class="blk"><p class="bt">${esc(c.option)}</p><p><b>지키는 것</b> ${esc(c.protects)}</p><p><b>내려놓는 것</b> ${esc(c.costs)}</p><p><b>확인할 것</b> ${esc(c.check)}</p>${chips(c.evidence)}</div>`).join("") +
    para(R.flow.text, R.flow.evidence, "계산된 흐름") +
    `<p class="note">${esc(nm(R.noVerdict ?? ""))}</p>`,
  actions: R.questionsActions.map((q) => `<div class="blk"><p class="bt">${esc(q.when)}</p><p class="q">${esc(q.question)}</p><p>${esc(q.action)}</p>${chips(q.evidence)}</div>`).join(""),
};
const SECTIONS = [
  { id: "values", title: "1. 내가 중요하게 여기는 것" },
  { id: "conflicts", title: "2. 내 안의 갈등" },
  { id: "strength", title: "3. 강점과 그 대가" },
  { id: "choices", title: "4. 이번 고민의 선택지" },
  { id: "actions", title: "5. 돌아볼 질문과 행동" },
] as const;
const left: Record<string, string> = { values: eLeft.values, conflicts: eLeft.conflicts, strength: eLeft.strength, choices: eLeft.choices, actions: eLeft.actions };
const right: Record<string, string> = { values: rRight.values, conflicts: rRight.conflicts, strength: rRight.strength, choices: rRight.choices, actions: rRight.actions };

const metricRows: [string, string, string, string][] = [
  ["글자 수 (보고만 한다)", n0(ge.chars), n0(gr.chars), `수정안이 ${f2(gr.chars / ge.chars)}배`],
  ["글 덩어리 수", String(ge.blocks), String(gr.blocks), ""],
  ["쓰인 서로 다른 근거", String(ge.evidenceDistinct), String(gr.evidenceDistinct), "같은 근거 목록 안에서 쓴 것"],
  ["사주 근거와 응답 근거를 함께 단 덩어리", pct(ge.mixedShare), pct(gr.mixedShare), "사주가 중심이어야 한다"],
  ["조건 · 상황 표지(~할 때는 · ~하면 · 다만)가 있는 덩어리", pct(ge.conditionShare), pct(gr.conditionShare), "기존 검사 기준 60% 이상"],
  ["이 사람의 상황 표지(고민 낱말 · 출처 · 조건 · 분량)가 있는 문장", pct(ge.anchoredSentenceShare), pct(gr.anchoredSentenceShare), ""],
  ["추상적인 낱말이 든 문장 / 그중 상황 표지가 없는 문장", `${ge.abstractSentences} / ${ge.ungroundedAbstract.length}`, `${gr.abstractSentences} / ${gr.ungroundedAbstract.length}`, "말만 추상적이지 않은지 보는 값"],
  ["고민 낱말이 글에 나온 몫", pct(ge.concernCoverage), pct(gr.concernCoverage), "수정안이 더 낮다 (낱말을 그대로 옮기는 정도의 차이)"],
  ["질문으로 끝나는 문장 수", String(ge.questions), String(gr.questions), "스스로 확인하게 하는 부분"],
  ["시점 · 분량과 행동이 모두 보이는 행동", pct(ge.actionConcreteShare), pct(gr.actionConcreteShare), ""],
  ["문단끼리 가장 많이 겹친 정도", f2(ge.selfOverlapMax), f2(gr.selfOverlapMax), "0.35 이하여야 한다"],
  ["개인 종합 리포트와 다른 말 (1이면 전부 새 말)", f2(noveltyAgainst(eb, baseText)), f2(noveltyAgainst(rb, baseText)), ""],
  ["개인 종합 리포트와 거의 같은 덩어리", pct(containedShare(eb, baseText)), pct(containedShare(rb, baseText)), "기존 형식이 더 많이 되풀이한다"],
  ["기존 형식 글과 거의 같은 덩어리 (수정안 기준)", "—", pct(containedShare(rb, eText)), "같은 근거라 일부는 겹친다"],
];

const CSS = `
:root{--bg:#ffffff;--mist:#f5f6f8;--line:#e2e5e9;--line-strong:#c9ced5;--ink:#1d2125;--ink-2:#464d55;--ink-3:#5f666e;--accent:#1e4b8f;--accent-soft:#edf2f9;--danger:#b3261e;--danger-soft:#fbeeed;--font:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14171a;--mist:#1b1f24;--line:#2b3138;--line-strong:#3c444d;--ink:#e8eaed;--ink-2:#c3c8ce;--ink-3:#9aa1a9;--accent:#8fb3e6;--accent-soft:#1c2736;--danger:#f0988f;--danger-soft:#33201f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#14171a;--mist:#1b1f24;--line:#2b3138;--line-strong:#3c444d;--ink:#e8eaed;--ink-2:#c3c8ce;--ink-3:#9aa1a9;--accent:#8fb3e6;--accent-soft:#1c2736;--danger:#f0988f;--danger-soft:#33201f;color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-padding-top:3.5rem}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font);font-size:15px;line-height:1.7;word-break:keep-all;overflow-wrap:break-word}
.wrap{max-width:72rem;margin-inline:auto;padding-inline:16px;padding-block:20px 56px}
h1{font-size:1.5rem;line-height:1.3;margin:0 0 6px;text-wrap:balance}
h2{font-size:1.15rem;line-height:1.4;margin:34px 0 10px;padding-top:18px;border-top:1px solid var(--line);text-wrap:balance}
p,li{text-wrap:pretty}
.sub{margin:0;color:var(--ink-2)}
.status{margin:12px 0 0;padding:10px 12px;background:var(--mist);border-left:3px solid var(--accent);color:var(--ink-2);font-size:.9rem}
.status.warn{border-left-color:var(--danger);background:var(--danger-soft)}
.persona{display:grid;gap:6px;margin:10px 0;padding:12px 14px;background:var(--mist);border-radius:4px;font-size:.92rem}
.persona p{margin:0}
.quote{margin:6px 0 0;padding:8px 12px;border-left:3px solid var(--line-strong);color:var(--ink-2)}
.pair{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;margin:12px 0 4px}
@media (min-width:900px){.pair{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px}}
.col{min-width:0}
.col>h3{position:sticky;top:env(safe-area-inset-top,0px);z-index:1;margin:0 0 8px;padding:6px 0;background:var(--bg);font-size:.9rem;color:var(--ink-3);border-bottom:2px solid var(--line-strong)}
.col.new>h3{color:var(--accent);border-bottom-color:var(--accent)}
.blk{padding:12px 0;border-bottom:1px solid var(--line)}
.blk p{margin:0 0 6px}
.bt{font-weight:700;color:var(--ink)}
.q{font-weight:600}
.when{color:var(--ink-3);font-size:.9em}
.none{margin:0 0 8px;padding:8px 10px;background:var(--mist);color:var(--ink-3);font-size:.88rem;border-radius:4px}
.note{margin:10px 0 0;padding:10px 12px;background:var(--accent-soft);border-radius:4px;color:var(--ink-2);font-size:.92rem}
.ev{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.chip{font-size:.74rem;color:var(--ink-3);border:1px solid var(--line-strong);border-radius:3px;padding:0 6px;line-height:1.6}
.tablewrap{overflow-x:auto;margin:8px 0}
table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}
th{font-size:.82rem;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--line-strong);background:var(--mist)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.small{font-size:.84rem;color:var(--ink-3)}
ul.rules,ol.rules{margin:8px 0;padding-left:1.3rem;display:grid;gap:6px}
code{font-size:.85em;background:var(--mist);padding:1px 5px;border-radius:3px}
`;

const headlineRow = `<div class="pair"><div class="col"><h3>기존 방식 · 고민 반영 리포트(concern-v1) 형식</h3>${para(E.headline)}</div><div class="col new"><h3>수정안 · 자기 이해 풀이</h3>${para(R.headline)}</div></div>`;
const evidenceList = evidence
  .filter((e) => !e.period || e.id.endsWith(".2026") || e.id.endsWith(".2027"))
  .filter((e) => !e.uncertain && e.id !== "self.mbti")
  .map((e) => `<li>${esc(label(e.id))}</li>`)
  .join("");

const BODY = `<div class="wrap">
<h1>같은 사람의 풀이를 나란히 — 기존 방식과 자기 이해 풀이(수정안)</h1>
<p class="sub">가상 인물 ${NAME} · 가상 고민 · 같은 근거 목록으로 쓴 두 가지 풀이</p>
<p class="status"><b>실제 AI 출력도, 실제 고객 정보도 아닙니다.</b> 두 풀이는 같은 근거(실제 만세력 엔진 계산 + 가상 응답)로 사람이 쓴 예시입니다. 수정안은 <b>아직 생성 지침 · 화면에 반영하지 않았습니다.</b> 이 비교를 보고 구조가 맞는지 먼저 정한 뒤에 반영합니다. 아래 숫자는 낱말 · 표지를 센 어림이며 좋은 글의 보증이 아닙니다.</p>

<h2>이 인물과 고민</h2>
<div class="persona">
  <p><b>${NAME}</b> (가상 · 2001년 7월 29일 오전 6시 10분생 · 여성 · 본인이 알고 있는 MBTI는 INFJ — 참고만 하고 근거로 쓰지 않음)</p>
  <p><b>쓸 수 있는 근거</b> (이 안에서만 해석합니다)</p>
  <ul class="rules">${evidenceList}</ul>
  <p><b>알려 주신 고민 (가상 · 고객이 직접 쓴 글이며 근거가 아닙니다)</b></p>
  <p class="quote">${esc(existing.concern.situation)}</p>
  <p class="quote">${esc(existing.concern.question)}</p>
</div>

<h2>제목</h2>
${headlineRow}

${SECTIONS.map((s) => `<h2>${s.title}</h2>\n<div class="pair"><div class="col"><h3>기존 방식</h3>${left[s.id]}</div><div class="col new"><h3>수정안</h3>${right[s.id]}</div></div>`).join("\n")}

<h2>말만 추상적으로 길어졌나 — 측정</h2>
<div class="tablewrap"><table><thead><tr><th>무엇을 셌나</th><th class="num">기존 방식</th><th class="num">수정안</th><th>읽는 법</th></tr></thead><tbody>
${metricRows.map((r) => `<tr><td>${esc(r[0])}</td><td class="num">${esc(r[1])}</td><td class="num">${esc(r[2])}</td><td class="small">${esc(r[3])}</td></tr>`).join("\n")}
</tbody></table></div>
<ul class="rules">
  <li><b>수정안이 ${f2(gr.chars / ge.chars)}배 깁니다.</b> 늘어난 만큼이 '갈등 · 강점과 대가 · 선택지의 득실 · 질문'이라는 새 구조에 쓰였는지가 핵심인데, 아래 문단별 점검이 그것을 보여 줍니다.</li>
  <li><b>추상적인 낱말(가치 · 의미 등)이 든 문장은 ${gr.abstractSentences}개이고 상황 표지가 없는 것은 ${gr.ungroundedAbstract.length}개</b>입니다. 모든 해석 문장이 원국 · 응답 · 알려 주신 내용 · 조건 중 하나에 붙어 있습니다. 다만 사람이 쓴 글이라서 그렇고, 실제 AI가 쓸 때 같은 수준이 나온다는 뜻은 아닙니다 (아직 AI를 연결하지 않았습니다).</li>
  <li>수정안이 <b>더 낮은 값</b>: 고민 낱말이 글에 나온 몫(${pct(gr.concernCoverage)} vs ${pct(ge.concernCoverage)}), 조건 표지(기존과 같은 수준). 불리한 값도 숨기지 않았습니다.</li>
</ul>

<h2>수정안의 문단별 점검 — 무엇을 새로 알려 주나</h2>
<p class="small">"새로 알게 되는 것"은 사람이 쓴 점검입니다. "기존 형식 글과의 겹침"은 코드가 센 값입니다 (4글자 조각 기준). 겹침이 큰 곳은 같은 근거를 다른 틀로 다시 놓은 것이어서, 그 부분의 가치는 새 정보가 아니라 틀(갈등 · 대가 · 득실 · 질문)입니다.</p>
<div class="tablewrap"><table><thead><tr><th>구분</th><th>시작 부분</th><th>근거</th><th>기존 형식 글과의 겹침</th><th>새로 알게 되는 것</th></tr></thead><tbody>
${audit.map((a) => `<tr><td>${esc(a.kind)}</td><td>${esc(nm(a.head))}</td><td class="small">${esc(a.evidence.join(", "))}</td><td>${esc(a.inE)} <span class="small">(새 말 ${pct(a.novel)})</span></td><td class="small">${esc(a.news)}</td></tr>`).join("\n")}
</tbody></table></div>

<h2>수정안이 하지 않는 것 · 알려진 약점</h2>
<ul class="rules">
  <li>어린 시절 · 상처 · 가족 이야기를 지어내지 않고, 앞으로의 사건을 예언하지 않습니다. 시기는 계산된 해의 주제만 말합니다.</li>
  <li>고객이 적은 내용을 사주가 알아맞힌 것처럼 쓰지 않습니다. 알려 준 내용은 "알려 주신"으로 밝히고, 알려 주지 않은 것(예: 새 팀에서 반응을 얻을 곳, 말로 꺼내 본 상대)은 "없다"고 쓰고 질문으로 남깁니다.</li>
  <li>원국 · 응답 · 고민이 서로 다른 방향을 가리켜도 하나의 결론으로 합치지 않습니다. 어느 쪽이 맞는지 정해 주지도 않습니다.</li>
  <li><b>'중요하게 여기는 것'은 사실이 아니라 가설</b>입니다. 응답과 원국에서 읽은 것을 겹쳐 본 추정이고, 맞는지는 마지막 질문으로 본인이 확인합니다. 단정 문장으로 바뀌지 않도록 "일 수 있습니다 · 읽힙니다"와 읽는 법 안내를 둡니다.</li>
  <li><b>약점:</b> ① 기존보다 ${f2(gr.chars / ge.chars)}배 깁니다. ② 갈등 · 강점과 대가 · 시기의 일부는 기존 글과 같은 근거를 쓰고 문장도 일부 겹칩니다 — 가치는 새 사실이 아니라 틀입니다. ③ 행동 일부(반응을 얻을 곳 묻기, 남은 일 적기, 후회의 이유 나누기)는 기존 제안과 같거나 비슷한 행동입니다. ④ 두 글을 모두 같은 사람(이 작업의 AI)이 썼습니다. 실제 AI 제공사의 글이 이 수준이라는 보장이 없고, 가려 읽는 사람의 평가를 거치지 않았습니다.</li>
</ul>

<h2>승인하시면 생성 지침에 반영할 것 (아직 하지 않음)</h2>
<ol class="rules">
  <li>4,900원 고민 반영 리포트의 출력 구조를 이 다섯 부분으로 바꿉니다 (<code>concern-v2</code>, 기존 <code>concern-v1</code>로 만든 리포트는 그대로 보여 줍니다). 개인 종합 리포트(9,900원)에도 같은 깊이를 적용합니다 — 철학적 깊이는 두 상품의 공통 품질이고, 4,900원은 새 고민을 반영한 새 리포트의 가격입니다(2026-10-13 운영자).</li>
  <li>지시문에 부분별 규칙을 더합니다: 가치는 가설로(근거 + "일 수 있습니다") · 갈등은 합치지 않기 · 강점마다 대가와 그때 · 선택지마다 지키는 것 / 내려놓는 것 / 직접 확인할 것 · 결정 대신 내리지 않기 · 질문마다 시점 · 분량이 보이는 행동.</li>
  <li>형식 검사에 더합니다: 추상어 문장은 상황 표지가 있어야 함 · 어린 시절 · 상처 · 운명 같은 낱말 금지 · 알려 준 내용을 말하는 문단은 "알려 주신"을 밝힘 · 선택지 필드가 비면 다시 쓰게 함. 이 검사는 위 측정과 같은 어림이며 좋은 글을 보증하지 않습니다.</li>
  <li>모의 작성기 · 화면(기록별 리포트) · 안내 문구를 새 구조로 바꾸고 테스트합니다. 실제 AI 연결과 가려 읽는 평가는 예산 승인 뒤입니다.</li>
</ol>
</div>`;

const TITLE = "같은 사람의 풀이 나란히 보기";
const html = `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="robots" content="noindex">\n<title>${TITLE}</title>\n<style>${CSS}</style>\n</head>\n<body>\n${BODY}\n</body>\n</html>\n`;
writeFileSync(new URL("../docs/reading-comparison-haerin.html", import.meta.url), html);

// ───────── 요약 문서 (md) ─────────
const md = `# 자기 이해 풀이(수정안) — 같은 가상 인물의 기존 풀이와 나란히 비교

- 상태: **비교용 예시. 생성 지침 · 화면에 반영하지 않았다.** 나란히 보기는 \`docs/reading-comparison-haerin.html\` (더블클릭으로 연다). 이 문서는 구조 · 측정 · 반영안의 요약이다. \`node scripts/render-reading-comparison.ts\`로 만든다.
- 인물: ${NAME}(가상 · 실제 만세력 엔진 계산 + 가상 응답). 고민은 가상이며 고객이 직접 쓴 글로 다룬다(근거 아님).
- 두 풀이는 **실제 AI 출력이 아니라 같은 근거 목록으로 쓴 예시**이고(\`docs/samples/concern-existing-format-haerin.json\` · \`philosophical-reading-haerin.json\`), 같은 사람(이 작업의 AI)이 썼다. 기존 형식 예시는 지금 제품의 형식 · 근거 · 내용 차이 검사를 통과한다(\`lib/report/philosophy/philosophy-sample.test.ts\`).

## 수정안의 구조

내가 중요하게 여기는 것 → 내 안의 갈등 → 강점과 그 대가 → 이번 고민의 선택지 → 돌아볼 질문과 행동. 사주가 해석의 틀이고, 응답과 알려 준 고민은 초점을 정한다. 세 가지가 한 방향으로 모이지 않으면 합치지 않고 나란히 둔다. 알려 준 내용은 사주로 알아맞힌 것처럼 쓰지 않는다. 어린 시절 · 상처 · 앞날의 사건을 지어내지 않는다.

## 측정 (낱말 · 표지를 센 어림 — 좋은 글의 보증이 아니다)

| 무엇을 셌나 | 기존 방식 | 수정안 | 읽는 법 |
| --- | --- | --- | --- |
${metricRows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`).join("\n")}

- 수정안은 **${f2(gr.chars / ge.chars)}배 길다.** 추상적인 낱말이 든 문장 ${gr.abstractSentences}개 중 상황 표지가 없는 것은 ${gr.ungroundedAbstract.length}개다. 고민 낱말 반영 몫(${pct(gr.concernCoverage)} vs ${pct(ge.concernCoverage)})과 조건 표지는 기존과 같거나 더 낮다.
- 길이는 기준이 아니라 보고값이다. 테스트는 1.5배 이내를 "말만 불린 글"을 거르는 느슨한 상한으로만 쓴다.

## 문단별 점검 — 무엇을 새로 알려 주나

| 구분 | 시작 부분 | 기존 형식 글과의 겹침 | 새로 알게 되는 것 |
| --- | --- | --- | --- |
${audit.map((a) => `| ${a.kind} | ${nm(a.head)} | ${a.inE} (새 말 ${pct(a.novel)}) | ${a.news} |`).join("\n")}

## 알려진 약점

1. 기존보다 ${f2(gr.chars / ge.chars)}배 길다.
2. 갈등 · 강점과 대가 · 시기의 일부는 기존 글과 같은 근거를 쓰고 문장도 일부 겹친다. 가치는 새 사실이 아니라 틀(갈등 · 대가 · 득실 · 질문)이다.
3. 행동 일부(반응을 얻을 곳 묻기, 남은 일 적기, 후회의 이유 나누기)는 기존 제안과 같거나 비슷한 행동이다.
4. '중요하게 여기는 것'은 사실이 아니라 가설이다. 단정 문장으로 바뀌지 않도록 읽는 법 안내와 "일 수 있습니다"를 둔다.
5. 두 글을 같은 사람이 썼다. 실제 AI 제공사의 글이 이 수준이라는 보장이 없고, 가려 읽는 사람의 평가를 거치지 않았다. AI는 아직 연결하지 않았다.

## 승인하면 생성 지침에 반영할 것 (아직 하지 않음)

1. 4,900원 고민 반영 리포트의 출력 구조를 다섯 부분으로 바꾼다(\`concern-v2\`, 이미 만든 \`concern-v1\` 리포트는 그대로 보여 준다). 개인 종합 리포트(9,900원)에도 같은 깊이를 적용한다 — 철학적 깊이는 두 상품의 공통 품질이고, 4,900원은 새 고민을 반영한 새 리포트의 가격이다(2026-10-13 운영자).
2. 지시문에 부분별 규칙을 더한다 (가치는 가설 · 갈등은 합치지 않기 · 강점마다 대가와 그때 · 선택지마다 지키는 것 / 내려놓는 것 / 직접 확인할 것 · 결정 대신 내리지 않기 · 질문마다 시점 · 분량이 보이는 행동).
3. 형식 검사에 더한다 (추상어 문장은 상황 표지 필요 · 어린 시절 · 상처 · 운명 같은 낱말 금지 · 알려 준 내용은 "알려 주신"으로 밝힘 · 선택지 필드가 비면 다시 쓰게 함).
4. 모의 작성기 · 화면 · 안내 문구를 바꾸고 테스트한다. 실제 AI 연결 · 가려 읽는 평가는 예산 승인 뒤.
`;
writeFileSync(new URL("../docs/philosophical-reading-comparison.md", import.meta.url), md);
console.log(`docs/reading-comparison-haerin.html ${html.length}자 · docs/philosophical-reading-comparison.md ${md.length}자 · 길이 비 ${f2(gr.chars / ge.chars)}`);
