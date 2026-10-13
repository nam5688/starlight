// AI 비교 1단계를 승인하기 전에 운영자가 확인할 미리보기 문서를 만든다 — docs/ai-stage1-preview.html (더블클릭으로 연다).
// 가상 인물 2명 · 리포트 구성 · 짧은 목표 문장 · 평가 기준 · 비용(호출 없는 계산)을 코드의 실제 값으로 채운다. AI를 부르지 않고 키도 필요 없다.
// 실행: node scripts/render-ai-stage1-preview.ts   (miyu 폴더에서)
import { readFileSync, writeFileSync } from "node:fs";
import { AI_CANDIDATES, COMPARE_STAGES } from "../lib/config/ai-candidates.ts";
import { costKrw, DEFAULT_FX_KRW_PER_USD, DEFAULT_SURCHARGE } from "../lib/report/ai/budget.ts";
import { buildPersonas } from "../lib/report/ai/compare-personas.ts";
import { MAX_OUTPUT_TOKENS, planStage, referenceFor, TYPICAL_OUTPUT_TOKENS } from "../lib/report/ai/compare-plan.ts";
import { buildEvidence } from "../lib/report/ai/generator.ts";
import { PHILOSOPHY_DEPTH } from "../lib/report/philosophy/depth.ts";
import { PHILOSOPHY_PROMPT_VERSION } from "../lib/report/philosophy/prompt.ts";

type Target = { part: string; text?: string; strength?: string; when?: string; cost?: string; option?: string; protects?: string; costs?: string; check?: string; question?: string; action?: string; evidence: string[] };
type Sample = { personas: { id: string; concernNote: string; targets: Target[]; avoid: { text: string; why: string }[] }[] };
const sample = JSON.parse(readFileSync(new URL("../docs/samples/stage1-target-sentences.json", import.meta.url), "utf8")) as Sample;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const won = (x: number) => `${Math.round(x).toLocaleString("ko-KR")}원`;
const now = new Date("2026-10-12T03:00:00Z");
const ref = referenceFor(now);
const personas = buildPersonas(2);
const settings = { fxKrwPerUsd: DEFAULT_FX_KRW_PER_USD, surcharge: DEFAULT_SURCHARGE };

// ───────── 근거를 쉬운 말로 (응답 환산값 숫자는 보이지 않는다) ─────────
const SURVEY_DIR: Record<string, string> = {
  "survey.novelty.low": "새로운 것을 찾아 나서는 정도가 낮은 쪽",
  "survey.novelty.high": "새로운 것을 찾아 나서는 정도가 높은 쪽",
  "survey.caution.high": "행동하기 전에 신중하게 따지는 정도가 높은 쪽",
  "survey.caution.low": "행동하기 전에 신중하게 따지는 정도가 낮은 쪽",
  "survey.sensitivity.high": "다른 사람의 반응에 신경 쓰는 정도가 높은 쪽",
  "survey.sensitivity.low": "다른 사람의 반응에 신경 쓰는 정도가 낮은 쪽",
  "survey.persistence.low": "한 가지를 오래 이어 가는 정도가 낮은 쪽",
  "survey.persistence.high": "한 가지를 오래 이어 가는 정도가 높은 쪽",
  "survey.anxiety.low": "가까운 관계에서 불안을 느끼는 정도가 낮은 쪽",
  "survey.anxiety.high": "가까운 관계에서 불안을 느끼는 정도가 높은 쪽",
  "survey.avoidance.high": "가까운 사람과 거리를 두는 정도가 높은 쪽",
  "survey.avoidance.low": "가까운 사람과 거리를 두는 정도가 낮은 쪽",
};
const plain = (e: { id: string; source: string; fact: string }) => {
  if (e.source === "survey") return `응답 · ${SURVEY_DIR[e.id] ?? e.id}`;
  if (e.source === "self") return e.fact;
  let fact = e.fact.replace(/\s*\(지장간 제외\)/, "");
  fact = fact.replace(/\s+—\s.*$/, (m) => (e.id.startsWith("saju.daeun") || e.id.startsWith("saju.seun") ? m : ""));
  return `원국 · ${fact}`;
};
const shownEvidence = (id: string) => {
  const ev = buildEvidence(personas.find((p) => p.id === id)!.input, ref);
  const main = ev.filter((e) => !e.uncertain && !e.period && !/\.(month|day|hour|year)\./.test(e.id) && !e.id.startsWith("saju.relation"));
  const periods = ev.filter((e) => e.period && /^saju\.(daeun\.(current|next)|seun\.20\d\d)$/.test(e.id));
  return { main, periods, total: ev.length };
};

// ───────── 비용 (호출 없는 계산) ─────────
const cands = AI_CANDIDATES.map((c) => ({ key: c.key, price: c.price }));
const stage1 = COMPARE_STAGES[0];
const plan = planStage({ stage: stage1.name, capKrw: stage1.capKrw, personas: buildPersonas(stage1.personaCount), candidates: cands, settings, now, variant: "philosophical-v0" });
const price = AI_CANDIDATES[0].price;
const inputs = plan.rows.map((r) => r.estInputTokens);
const minIn = Math.min(...inputs);
const maxIn = Math.max(...inputs);
// 호출 없는 compare-ai-dry-run.ts와 같은 시나리오: 평소 = 가장 작은 입력 · 출력 1만, 많이 = 가장 큰 입력 · 출력 최대
const oneTypical = costKrw(price, { inputTokens: minIn, outputTokens: TYPICAL_OUTPUT_TOKENS }, settings);
const oneMax = costKrw(price, { inputTokens: maxIn, outputTokens: MAX_OUTPUT_TOKENS }, settings);
const oneRepair = oneMax + costKrw(price, { inputTokens: maxIn + MAX_OUTPUT_TOKENS + 1300, outputTokens: MAX_OUTPUT_TOKENS }, settings);

const T = PHILOSOPHY_DEPTH;
const pct = (x: number) => `${Math.round(x * 100)}%`;

const chips = (ids: string[]) => `<div class="ev">${ids.map((i) => `<span class="chip">${esc(i)}</span>`).join("")}</div>`;
const targetHtml = (t: Target) => {
  const rows: string[] = [];
  if (t.text) rows.push(`<p>${esc(t.text)}</p>`);
  if (t.strength) rows.push(`<p><b>잘하는 점</b> ${esc(t.strength)}</p><p><b>부담이 되는 때</b> ${esc(t.when ?? "")}</p><p><b>치르는 대가</b> ${esc(t.cost ?? "")}</p>`);
  if (t.option) rows.push(`<p class="bt">${esc(t.option)}</p><p><b>지키는 것</b> ${esc(t.protects ?? "")}</p><p><b>내려놓는 것</b> ${esc(t.costs ?? "")}</p><p><b>확인할 것</b> ${esc(t.check ?? "")}</p>`);
  if (t.question) rows.push(`<p class="when">${esc(t.when ?? "")}</p><p class="q">${esc(t.question)}</p><p><b>행동</b> ${esc(t.action ?? "")}</p>`);
  return `<div class="blk"><p class="part">${esc(t.part)}</p>${rows.join("")}${chips(t.evidence)}</div>`;
};

const personaCard = (id: string) => {
  const p = personas.find((x) => x.id === id)!;
  const s = sample.personas.find((x) => x.id === id)!;
  const ev = shownEvidence(id);
  const concern = p.input.context;
  return `<div class="persona">
<p><b>${id}</b> · ${esc(p.note)}</p>
<p class="small">${esc(s.concernNote)}</p>
${concern ? `<div class="quote">고민(가상): ${esc(concern.question)}<br>상황(가상): ${esc(concern.situation)}</div>` : ""}
<details><summary>AI가 받는 근거 ${ev.main.length + ev.periods.length}개 (전체 ${ev.total}개 중 핵심, 쉬운 말로)</summary>
<ul class="rules">${ev.main.map((e) => `<li>${esc(plain(e))}</li>`).join("")}${ev.periods.map((e) => `<li>${esc(plain(e))} <span class="small">(계산된 시기)</span></li>`).join("")}</ul>
</details>
<p class="small">보내지 않는 것: 이름 · 생년월일 원문 (이름 자리에는 <code>{name}</code>만 쓴다). 응답은 현재 개발용 문항에 가상으로 답한 값이다.</p>
</div>`;
};

const CSS = `
:root{--bg:#ffffff;--mist:#f5f6f8;--line:#e2e5e9;--line-strong:#c9ced5;--ink:#1d2125;--ink-2:#464d55;--ink-3:#5f666e;--accent:#1e4b8f;--accent-soft:#edf2f9;--danger:#b3261e;--danger-soft:#fbeeed;--font:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14171a;--mist:#1b1f24;--line:#2b3138;--line-strong:#3c444d;--ink:#e8eaed;--ink-2:#c3c8ce;--ink-3:#9aa1a9;--accent:#8fb3e6;--accent-soft:#1c2736;--danger:#f0988f;--danger-soft:#33201f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#14171a;--mist:#1b1f24;--line:#2b3138;--line-strong:#3c444d;--ink:#e8eaed;--ink-2:#c3c8ce;--ink-3:#9aa1a9;--accent:#8fb3e6;--accent-soft:#1c2736;--danger:#f0988f;--danger-soft:#33201f;color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-padding-top:3.5rem}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font);font-size:15px;line-height:1.7;word-break:keep-all;overflow-wrap:break-word}
.wrap{max-width:60rem;margin-inline:auto;padding-inline:16px;padding-block:20px 56px}
h1{font-size:1.5rem;line-height:1.3;margin:0 0 6px;text-wrap:balance}
h2{font-size:1.15rem;line-height:1.4;margin:34px 0 10px;padding-top:18px;border-top:1px solid var(--line);text-wrap:balance}
h3{font-size:1rem;margin:18px 0 6px}
p,li{text-wrap:pretty}
.sub{margin:0;color:var(--ink-2)}
.status{margin:12px 0 0;padding:10px 12px;background:var(--mist);border-left:3px solid var(--accent);color:var(--ink-2);font-size:.9rem}
.status.warn{border-left-color:var(--danger);background:var(--danger-soft)}
.persona{display:grid;gap:6px;margin:10px 0;padding:12px 14px;background:var(--mist);border-radius:4px;font-size:.92rem}
.persona p{margin:0}
.quote{margin:6px 0 0;padding:8px 12px;border-left:3px solid var(--line-strong);color:var(--ink-2)}
.blk{padding:12px 0;border-bottom:1px solid var(--line)}
.blk p{margin:0 0 6px}
.part{font-size:.82rem;color:var(--accent);font-weight:700}
.bt{font-weight:700;color:var(--ink)}
.q{font-weight:600}
.when{color:var(--ink-3);font-size:.9em}
.avoid{margin:6px 0;padding:10px 12px;background:var(--danger-soft);border-radius:4px;font-size:.92rem}
.avoid p{margin:0}
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
details{margin:4px 0}
summary{cursor:pointer;color:var(--accent);font-size:.9rem}
.ask{margin:14px 0;padding:14px 16px;border:2px solid var(--accent);border-radius:4px;background:var(--accent-soft)}
.ask p{margin:0 0 8px}
.ask p:last-child{margin:0}
`;

const requestRows: [string, string, string][] = [
  ["내가 중요하게 여기는 가치", "'중요하게 여기는 것'을 정확히 3개(가치 · 혼자 맡는 책임의 범위 · 고를 때의 기준)로 쓰게 한다. 사실이 아니라 근거에서 읽은 가설이므로 \"~일 수 있습니다\"로 쓰게 한다.", "형식 검사: 3개가 아니면 실패 · 읽는 법에 \"가설\"이 없으면 실패"],
  ["내 안에서 충돌하는 마음", "서로 부딪히는 두 마음을 적고 각각 무엇을 지키는지 쓰게 한다. 한쪽을 이기게 하지 않고, 사주와 응답이 갈라지면 \"하나의 결론으로 합치지 않고 나란히 둔다\"고 쓰게 한다.", "형식 검사: 갈등 2~3개, 사주 근거와 응답 근거를 함께 달아야 함 · 합치지 않는다는 말이 없으면 실패"],
  ["잘하는 점이 부담으로 바뀌는 상황", "강점마다 \"어떤 때\" 부담이 되는지(생활 장면)와 그때 치르는 대가를 쓰게 한다.", "형식 검사: 강점 2~3개마다 장면 · 대가 · 근거 문장이 있어야 함"],
  ["선택할 때 생각해 볼 기준", "고민을 알려 준 사람에게만, 선택지마다 지키는 것 · 내려놓는 것 · 확인할 것을 쓰게 한다. 어느 쪽이 맞는지는 정하지 않는다고 밝히게 한다.", "형식 검사: 결정 대신 내리는 말(\"~하세요\" · \"그게 맞습니다\")이 있으면 실패 · 고민이 없는 사람에게 선택지가 나오면 실패"],
  ["구체적인 일상 사례", "모든 해석 문장이 원국 · 응답 · 알려 준 내용 · 조건(\"~할 때\") · 시점이나 분량 중 하나에 붙어 있어야 한다. 마지막 질문마다 \"이번 주 안에 10분\"처럼 시점이 보이는 행동을 붙이게 한다.", `내용 점검: 붙을 곳 없는 추상 문장 ${T.ungroundedAbstractFail + 1}개 이상이면 실패 · 구체적인 행동 ${pct(T.actionConcreteMin)} 미만이면 실패`],
  ["추상적인 위로 · 누구에게나 맞는 말 줄이기", "\"본질 · 영혼 · 진정한 자아\" 같은 큰 낱말과 \"누구나\" · \"괜찮아요\" 같은 문장을 쓰지 않게 한다. 어린 시절 · 상처 · 앞날의 사건을 지어내지 않게 한다.", "형식 검사: 지어낸 배경 · 부풀린 추상어 · 금지 표현 1건이라도 실패"],
];

const structureRows: [string, string, string, string][] = [
  ["① 읽는 법", "40~300자", "근거에서 읽은 가설이며 마지막 질문으로 직접 확인하라는 안내", "+ 알려 주신 내용은 사주로 알아맞힌 것이 아니라는 말"],
  ["② 내가 중요하게 여기는 것", "3개 · 각 150~600자", "가치 / 혼자 맡는 책임의 범위 / 고를 때의 기준", "+ 알려 주신 고민에서 읽은 것"],
  ["③ 내 안의 갈등", "2~3개 · 각 120~500자", "부딪히는 두 마음, 각각 지키는 것", "+ 알려 주신 장면"],
  ["④ 갈라지는 곳", "1개 · 50~400자", "사주와 응답이 다른 곳은 합치지 않고 나란히", "같음"],
  ["⑤ 잘하는 점이 부담이 되는 때", "2~3개", "잘하는 점 · 부담이 되는 때 · 대가 · 읽은 이유", "같음"],
  ["⑥ 이번 고민의 선택지", "고민이 있을 때만 2~4개", "(쓰지 않음)", "지키는 것 · 내려놓는 것 · 확인할 것"],
  ["⑦ 큰 흐름", "1개 · 80~500자", "계산된 해의 주제 + \"어떤 일이 일어난다는 뜻은 아닙니다\"", "같음"],
  ["⑧ 정하지 않는다는 안내", "고민이 있을 때만", "(쓰지 않음)", "\"어느 쪽이 맞는지 정하지 않습니다\""],
  ["⑨ 돌아볼 질문과 행동", "4~5개", "때 · 질문 · 시점이 보이는 행동", "같음"],
];

const criteriaRows: [string, string, string][] = [
  ["형식 · 구성 순서 · 개수 · 글자 범위", "어기면 실패 (한 번 고쳐 쓰게 한 뒤 다시 점검)", ""],
  ["근거 ID 오류 · 계산된 시기 밖의 해 · 앞날 단정", "1건이라도 실패", ""],
  ["지어낸 배경 · 부풀린 추상어 · 결정 대신 내리기 · 금지 표현", "1건이라도 실패", ""],
  ["고민이 없는 인물에서 \"알려 주신\" · 선택지 · 정하지 않는다는 안내", "1건이라도 실패", ""],
  ["상황 표지 없는 추상 문장", `${T.ungroundedAbstractFail + 1}개 이상 실패`, `1~${T.ungroundedAbstractFail}개 경고`],
  ["사주 근거를 단 덩어리의 몫", `${pct(T.sajuCitedMin)} 미만 실패`, ""],
  ["구체적인 행동의 몫", `${pct(T.actionConcreteMin)} 미만 실패`, ""],
  ["덩어리끼리 겹침", `${pct(T.selfOverlapMax)} 초과 실패`, ""],
  ["조건 표지 · 사주와 응답을 함께 단 덩어리", "", `각각 ${pct(T.conditionWarn)} 미만 경고`],
  ["응답 점수 숫자(\"88점\" · 백분위)를 본문에 씀", "", "1건이라도 경고"],
];

const blindRows: [string, string][] = [
  ["장면의 구체성", "이름을 가려도 이 사람의 이야기로 읽히는가 · \"~할 때\" 같은 생활 장면이 있는가"],
  ["중요하게 여기는 것", "가설로 쓰였고 근거와 맞으며 \"그럴 수 있겠다\"고 느껴지는가 (단정 · 일반론이면 낮게)"],
  ["내 안의 갈등", "부딪히는 두 마음이 각각 무엇을 지키는지 보이는가 (한쪽 편들기 · 뻔한 대립이면 낮게)"],
  ["잘하는 점이 부담이 되는 때", "부담이 되는 때가 구체적인 장면인가"],
  ["선택지 (P01만)", "지키는 것 · 내려놓는 것 · 확인할 것이 있고 결정을 대신하지 않는가"],
  ["추상적 위로 · 누구에게나 맞는 말", "\"아무에게나 해당한다\"고 느낀 문장 수를 센다 (적을수록 좋다 — 거꾸로 점수)"],
  ["근거 일치", "문단이 단 근거와 내용이 맞는가 · 알려 준 이야기를 사주로 알아맞힌 것처럼 쓴 문장은 없는가"],
  ["한국어 자연스러움", "번역투 · 반복 · 어색한 문장"],
  ["따로 받을 만한가", "개인 종합 리포트와 다른 것을 얻었고 더 알고 싶은가"],
];

const table = (head: string[], rows: string[][], numCols: number[] = []) =>
  `<div class="tablewrap"><table><thead><tr>${head.map((h, i) => `<th${numCols.includes(i) ? ' class="num"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${numCols.includes(i) ? ' class="num"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

const BODY = `<div class="wrap">
<h1>AI 비교 1단계 — 승인 전 미리보기</h1>
<p class="sub">철학적인 사주 해석 방향을 반영한 비교용 지시문 · 가상 인물 2명 · 리포트 구성 · 짧은 목표 문장 · 평가 기준 · 비용</p>
<p class="status warn"><b>지금 상태:</b> 유료 AI 호출 <b>0회</b> · API 키 없음 · 예산 <b>미승인</b> · 제공사 연결 코드 없음. 이 문서는 호출하기 전에 확인하려고 만든 것이며, 아래 내용을 확인하고 승인하기 전에는 아무것도 보내지 않는다.</p>

<h2>1. 요청하신 방향을 어떻게 반영했나</h2>
<p class="sub">지시문 버전 <code>${esc(PHILOSOPHY_PROMPT_VERSION)}</code>. 기존 개인 종합 리포트 지시문으로 두 AI를 비교하면 요청하신 방향이 나오는지 판단할 수 없어서, 1단계는 이 지시문으로 한다. 제품의 생성 지침에는 아직 연결하지 않았다.</p>
${table(["요청", "지시문이 AI에게 요구하는 것", "어긋나면 어떻게 거르나"], requestRows)}
<p class="note">사주가 틀이고, 성향 · 관계 응답과 알려 준 고민은 어디를 볼지 초점만 정한다. 응답 때문에 원국이나 시기 해석을 바꾸지 않고, 알려 준 이야기를 사주로 알아맞힌 것처럼 쓰지 않는다. 응답 점수 숫자는 본문에 쓰지 않고 "높게 · 낮게"와 행동으로만 쓰게 한다.</p>

<h2>2. 비교에 쓰는 가상 인물 2명 (실제 고객 아님)</h2>
<p class="sub">원국은 만세력 엔진이 계산한 값이고, 응답은 현재 개발용 문항에 가상으로 답한 값이다. 새 자체 문항(30문항 초안)을 적용한 값이 아니다.</p>
${personaCard("P01")}
${personaCard("P02")}
<p class="small">P01은 고민이 있어 고민을 반영하는 경로를, P02는 고민이 없어 "알려 주신"과 선택지가 나오지 않아야 하는 경로를 시험한다. 두 사람은 일간이 다르고(기토 · 경금) 같은 틀로 쓰되 다른 말이어야 한다.</p>

<h2>3. 리포트 구성 — 아홉 부분 (순서와 개수 고정)</h2>
${table(["부분", "개수 · 길이", "고민이 없는 사람(P02)", "고민이 있는 사람(P01)"], structureRows.map((r) => [r[0], r[1], r[2], r[3]]))}
<p class="small">기존 개인 종합 리포트(9,900원)를 되풀이하는 글이 아니라, 같은 사람을 "무엇을 중요하게 여기고 어디서 부딪히는가"의 틀로 다시 읽는 글이다. 이 구성은 아직 제품 화면 · 생성 지침에 반영하지 않았다 (4,900원 고민 반영 리포트에 쓸지는 운영자가 비교 결과를 본 뒤 정한다).</p>

<h2>4. 짧은 목표 문장 예시 — 이 정도로 구체적이고 근거가 보이는 글</h2>
<p class="sub">사람이 쓴 기준선이다. AI가 이 문장을 베끼게 하려는 것이 아니라, 결과를 읽을 때 "이 수준인가"를 비교하는 눈금이다. 아래 칩은 문단이 단 근거 ID이며, 실제 인물의 계산 결과에 있는 것만 썼다.</p>
${sample.personas
  .map(
    (s) => `<h3>${esc(s.id)} 목표 문장${s.id === "P01" ? " (고민이 있는 인물)" : " (고민이 없는 인물)"}</h3>
${s.targets.map(targetHtml).join("")}
<h3>${esc(s.id)} — 이렇게 쓰지 않는다 (자동 점검에도 걸리는 예)</h3>
${s.avoid.map((a) => `<div class="avoid"><p>${esc(a.text)}</p><p class="small">왜: ${esc(a.why)}</p></div>`).join("")}`,
  )
  .join("\n")}
<p class="small">확인한 것: 근거 ID와 "높게 · 낮게"로 쓴 방향이 위 인물의 실제 계산 결과와 맞고, 막는 표현이 없으며, "이렇게 쓰지 않는다" 예시가 실제로 점검에 걸린다 (테스트 5개). 확인하지 못한 것: 이 문장들이 좋은 글인지(사람이 읽고 판단해야 한다), 실제 AI가 이 수준으로 쓰는지.</p>

<h2>5. 평가 기준 — 결과를 보기 전에 고정</h2>
<h3>자동 점검 (낱말과 표지를 세는 어림 · 좋은 글의 보증이 아님)</h3>
${table(["점검", "실패", "경고"], criteriaRows)}
<h3>이름을 가린 채 운영자가 채점 (X · Y, 5점 만점)</h3>
${table(["항목", "보는 것"], blindRows)}
<h3>1단계 합격선</h3>
<ul class="rules">
<li>지어낸 배경 · 사건 · 날짜 · 직업 · 나이: <b>0건</b></li>
<li>자동 점검의 실패 항목 없음 (고쳐 쓰기 1회 안에서). 경고는 사람이 읽고 판단</li>
<li>블라인드 평가: "장면의 구체성" · "근거 일치" · "따로 받을 만한가" 평균 4.0 이상, "추상적 위로 · 누구에게나 맞는 말"은 한 편에 3문장 이하</li>
<li>건당 비용 400원 이하 (고쳐 쓰기 포함 평균)</li>
</ul>
<p class="note"><b>생성 4건으로 알 수 있는 것:</b> 지시문대로 구성을 지키는가 · 지어낸 내용이 있는가 · 비용과 시간이 예상 범위인가 · 같은 근거로 쓴 두 글의 질감이 눈에 띄게 다른가.<br><b>알 수 없는 것:</b> 어느 회사가 더 낫다는 순위(4건은 우연의 폭이 크다), 사주 해석의 정확성(해석 규칙은 전문가 검토 전 초안), 실제 고객의 만족, 새 자체 문항으로 만든 근거에서의 품질. 글이 깊어 보이는 것이 곧 해석이 맞다는 뜻도 아니다. 후보 하나가 이 작업을 하는 Claude와 같은 계열이므로, 이름을 가린 운영자 채점이 판단의 기준이다.</p>

<h2>6. 비용 — 호출 없는 계산</h2>
<p class="sub">같은 지시문 · 같은 근거를 두 후보 모두에게 보낸다. 두 후보 단가는 입력 $${AI_CANDIDATES[0].price.inputUsdPerMTok} · 출력 $${AI_CANDIDATES[0].price.outputUsdPerMTok} (100만 토큰당, 공식 문서 확인일 ${esc(AI_CANDIDATES[0].checkedAt)} — 운영자가 따로 확인한 값은 아님). 환율 ${DEFAULT_FX_KRW_PER_USD.toLocaleString("ko-KR")}원/달러(가정) · 여유율 ${Math.round((DEFAULT_SURCHARGE - 1) * 100)}% · 입력 토큰은 한글 글자당 2토큰으로 보수적으로 추정.</p>
${table(
  ["구분", "금액"],
  [
    ["생성 1건 — 평소(출력 1만 토큰)", `약 ${won(oneTypical)}`],
    ["생성 1건 — 많이(출력 최대 1만 6천 토큰)", `약 ${won(oneMax)}`],
    ["생성 1건 — 많이 + 형식 검사 실패로 고쳐 쓰기 1회", `약 ${won(oneRepair)}`],
    ["1단계 평소 예상 (생성 4건)", `약 ${won(plan.expectedKrw)}`],
    ["1단계 첫 호출만 쓰는 최악", `약 ${won(plan.firstCallWorstKrw)}`],
    ["1단계 모든 생성이 고쳐 쓰기까지 하는 최악", `약 ${won(plan.twoRoundWorstKrw)} (승인 한도 ${won(stage1.capKrw)} ${plan.worstFits ? "안" : "초과"})`],
  ],
  [1],
)}
<p class="small">이 한도(${won(stage1.capKrw)})는 이번 테스트에서 쓸 수 있는 최대 금액이며 API 계정에 먼저 충전해야 하는 금액과는 다를 수 있다(계정마다 최소 충전액이 다르다). 앞으로 고객 리포트를 만들 때의 호출 비용은 이와 별개다. 모든 호출은 호출 전에 최악 비용을 예약하고, 한도를 넘길 호출은 제공사에 보내지 않으며, 승인 기록이 없으면 실행하지 않는다.</p>

<h2>7. 승인 요청</h2>
<div class="ask">
<p><b>1단계만 요청합니다.</b> 가운데 등급 두 모델(<code>${esc(AI_CANDIDATES[0].modelId)}</code> · <code>${esc(AI_CANDIDATES[1].modelId)}</code>)로 위 가상 인물 2명 × 2 = 생성 4건에 <b>총 ${won(stage1.capKrw)} 한도</b>의 유료 API 호출을 해도 되는가.</p>
<p>승인해도 일어나지 않는 것: 실제 고객 정보 사용 · 2단계(20건) 실행 · 한도를 넘는 호출 · 키를 대화창에 붙여넣기 · 제품 화면 변경 · 실결제.</p>
<p>승인하면 이어지는 일: ① 운영자가 두 회사 API 계정을 만들고 월 사용 한도를 걸고 키를 <code>.env.local</code>에만 입력합니다(한 단계씩 안내, 키는 채팅에 보내지 않음). ② 그다음에야 두 회사 연결 코드를 만들고, 호출 직전에 이 비용 표를 한 번 더 보여 드립니다. ③ 운영자 PC에서 실행하고 결과는 X · Y로 가린 파일로 나옵니다.</p>
</div>
<p class="small">확인해 주실 것 세 가지: (1) 위 아홉 부분 구성이 원하는 풀이 방향과 맞는가 (2) 목표 문장의 수준 · 말투가 맞는가 (3) 평가 기준과 합격선을 이대로 고정해도 되는가.</p>
</div>`;

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>AI 비교 1단계 미리보기</title>
<style>${CSS}</style>
</head>
<body>
${BODY}
</body>
</html>
`;
writeFileSync(new URL("../docs/ai-stage1-preview.html", import.meta.url), html);
console.log(`docs/ai-stage1-preview.html ${html.length}자 · 1단계 평소 ${won(plan.expectedKrw)} · 최악 ${won(plan.twoRoundWorstKrw)}`);
