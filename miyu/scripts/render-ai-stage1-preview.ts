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

type Block = { kind: "reading" | "choices" | "actions"; title: string; text?: string[]; options?: { option: string; gains: string; burdens: string; check: string }[]; items?: { question: string; action: string }[]; why: string[]; evidence: string[] };
type Sample = { personas: { id: string; concernNote: string; intro: { text: string }; blocks: Block[]; avoid: { text: string; why: string }[] }[] };
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

const NAME = "○○";
const chips = (ids: string[]) => `<div class="ev">${ids.map((i) => `<span class="chip">${esc(i)}</span>`).join("")}</div>`;
const blockHtml = (b: Block) => {
  const body =
    b.kind === "reading"
      ? (b.text ?? []).map((t) => `<p>${esc(t.replaceAll("{name}", NAME))}</p>`).join("")
      : b.kind === "choices"
        ? (b.options ?? []).map((o) => `<p class="bt">${esc(o.option)}</p><p><b>얻는 것</b> ${esc(o.gains)}</p><p><b>치르는 것</b> ${esc(o.burdens)}</p><p><b>확인할 것</b> ${esc(o.check)}</p>`).join("")
        : (b.items ?? []).map((i) => `<p class="q">${esc(i.question)}</p><p><b>행동</b> ${esc(i.action.replaceAll("{name}", NAME))}</p>`).join("");
  return `<div class="blk"><p class="part">${esc(b.title)}</p>${body}<div class="why"><p class="whyt">이렇게 읽은 이유</p><ul>${b.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>${chips(b.evidence)}</div></div>`;
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
.part{font-size:1rem;color:var(--ink);font-weight:700}
.why{margin-top:8px;padding:8px 10px;background:var(--mist);border-radius:4px;font-size:.84rem;color:var(--ink-3)}
.why ul{margin:4px 0;padding-left:1.1rem}
.why p{margin:0}
.whyt{font-weight:600;color:var(--ink-2)}
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

const opinionRows: [string, string, string][] = [
  ["① 깊은 해석은 두 상품의 공통 품질", "예시는 고민이 없는 사람(P02)도 같은 깊이로 썼다", "문서 · 안내의 상품 설명을 바로잡았다. 9,900원 리포트의 생성 지침 반영은 예시 확정 뒤"],
  ["② 본문은 쉬운 말, 근거는 '이렇게 읽은 이유'로 분리", "반영함. 본문에서 사주 용어와 점수 숫자를 뺐다(테스트로 확인)", "출력 형식에 문단마다 '이유' 칸을 두도록 고친다"],
  ["③ 근거가 결론을 실제로 뒷받침하는지 확인", "근거 문구(해석 규칙의 cue)가 말하는 범위 안에서만 결론을 썼다. 기계 검사는 불가능해 사람이 나란히 읽어야 한다", "근거 ID 존재 검사에 더해, 지시문에 '근거 문구에 없는 능력 · 욕구 · 원인을 만들지 않는다'를 넣는다. 평가표에 항목 추가"],
  ["④ 갈등 · 차이는 근거가 있을 때만", "근거가 약한 갈등은 뺐다(1판 P02의 '끝까지 닫으려는 마음')", "'갈라지는 곳 1개 필수', '갈등 2~3개 필수'를 '근거가 있을 때만'으로 바꾼다"],
  ["⑤ 한계 문구를 반복하지 않음", "읽는 법에서 한 번만 말하고, 나머지는 '맞지 않으면 알 수 있는 질문'으로 전했다(테스트로 확인)", "'가설' · '합치지 않고 나란히' · '정하는 일은 본인 몫' 필수 조건을 없애고 처음 한 번으로 줄인다"],
  ["⑥ 행동에 임의의 시점 · 기간 금지", "'이번 주 10분' · '이틀 안에 답' 같은 기준을 없애고, 연락 기록 보기 · 대화 뒤 한 줄 적기처럼 그 고민에서 확인할 행동으로 바꿨다", "행동마다 시점 · 분량을 요구하는 검사(구체적인 행동 2/3)를 없앤다"],
  ["⑦ 자동 검사는 보조", "예시는 기계 검사를 통과했지만 그것이 좋은 글이라는 뜻은 아니다", "검사는 형식 · 누락 · 잘못된 근거만 찾는다. 낱말 · 비율로 '좋은 글'을 판정하지 않는다 (합격은 이름을 가린 운영자 채점)"],
];

const requestRows: [string, string, string][] = [
  ["내가 중요하게 여기는 가치", "'중요하게 여기는 것'을 정확히 3개(가치 · 혼자 맡는 책임의 범위 · 고를 때의 기준)로 쓰게 한다. 사실이 아니라 근거에서 읽은 가설이므로 \"~일 수 있습니다\"로 쓰게 한다.", "형식 검사: 3개가 아니면 실패 · 읽는 법에 \"가설\"이 없으면 실패"],
  ["내 안에서 충돌하는 마음", "서로 부딪히는 두 마음을 적고 각각 무엇을 지키는지 쓰게 한다. 한쪽을 이기게 하지 않고, 사주와 응답이 갈라지면 \"하나의 결론으로 합치지 않고 나란히 둔다\"고 쓰게 한다.", "형식 검사: 갈등 2~3개, 사주 근거와 응답 근거를 함께 달아야 함 · 합치지 않는다는 말이 없으면 실패"],
  ["잘하는 점이 부담으로 바뀌는 상황", "강점마다 \"어떤 때\" 부담이 되는지(생활 장면)와 그때 치르는 대가를 쓰게 한다.", "형식 검사: 강점 2~3개마다 장면 · 대가 · 근거 문장이 있어야 함"],
  ["선택할 때 생각해 볼 기준", "고민을 알려 준 사람에게만, 선택지마다 지키는 것 · 내려놓는 것 · 확인할 것을 쓰게 한다. 어느 쪽이 맞는지는 정하지 않는다고 밝히게 한다.", "형식 검사: 결정 대신 내리는 말(\"~하세요\" · \"그게 맞습니다\")이 있으면 실패 · 고민이 없는 사람에게 선택지가 나오면 실패"],
  ["구체적인 일상 사례", "모든 해석 문장이 원국 · 응답 · 알려 준 내용 · 조건(\"~할 때\") · 시점이나 분량 중 하나에 붙어 있어야 한다. 질문마다 그 고민에서 확인할 실제 행동(예: 연락 기록 훑어보기, 대화가 끝난 뒤 한 줄 적기)을 붙이게 한다. 시점이나 기간은 임의로 정하지 않는다.", `내용 점검: 붙을 곳 없는 추상 문장 ${T.ungroundedAbstractFail + 1}개 이상이면 실패 (현재 검사는 행동에 시점 · 분량도 요구한다 — 예시 확정 뒤 이 요구를 없앤다)`],
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
  ["구체적인 행동의 몫 (예시 확정 뒤 삭제 — 행동에 시점 · 분량을 강제하게 된다)", `${pct(T.actionConcreteMin)} 미만 실패`, ""],
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
  ["근거가 결론을 뒷받침하는가", "\"이렇게 읽은 이유\"의 근거만으로 그 결론까지 갈 수 있는가 (근거 문구에 없는 능력 · 욕구 · 원인을 만들었으면 낮게) · 알려 준 이야기를 사주로 알아맞힌 것처럼 쓴 문장은 없는가"],
  ["한국어 자연스러움", "번역투 · 반복 · 어색한 문장"],
  ["돈을 낼 만한가", "읽고 나서 \"내가 왜 이랬는지 알겠다\"는 느낌이 있는가 · 통합 리포트 9,900원을 냈다면 아깝지 않은가 · (P01) 고민 반영 4,900원을 냈다면 아깝지 않은가"],
];

const table = (head: string[], rows: string[][], numCols: number[] = []) =>
  `<div class="tablewrap"><table><thead><tr>${head.map((h, i) => `<th${numCols.includes(i) ? ' class="num"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${numCols.includes(i) ? ' class="num"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

const BODY = `<div class="wrap">
<h1>AI 비교 1단계 — 승인 전 미리보기</h1>
<p class="sub">철학적인 사주 해석 방향을 반영한 비교용 지시문 · 가상 인물 2명 · 리포트 구성 · 짧은 목표 문장 · 평가 기준 · 비용</p>
<p class="status warn"><b>지금 상태:</b> 유료 AI 호출 <b>0회</b> · API 키 없음 · 예산 <b>미승인</b> · 제공사 연결 코드 없음. 이 문서는 호출하기 전에 확인하려고 만든 것이며, 아래 내용을 확인하고 승인하기 전에는 아무것도 보내지 않는다.</p>

<h2>0. 운영자 의견(2026-10-13)과 반영 상태</h2>
<p class="sub">1판 예시가 "근거 설명서처럼 읽히고, 근거에서 결론으로 너무 멀리 갔다"는 의견을 받아 예시를 다시 썼다. 지시문 · 검사는 예시를 확정하신 뒤에 맞춘다.</p>
${table(["의견", "예시(2판)", "지시문 · 검사"], opinionRows)}
<p class="note"><b>상품 정리:</b> 철학적인 자기 이해 해석은 <b>최초 통합 리포트 9,900원의 기본 품질</b>이며 기존 구매자 고민 반영 리포트 4,900원에도 같은 품질로 쓴다. 4,900원은 기존 구매자가 새 고민을 반영한 <b>새 리포트</b>를 발급받는 가격이지, 깊은 해석을 추가로 열어 주는 가격이 아니다(이전 리포트는 그대로 보관). 아래 비교는 이 공통 품질을 먼저 확인하는 것이다.</p>

<h2>1. 요청하신 방향을 어떻게 반영했나</h2>
<p class="sub">지시문 버전 <code>${esc(PHILOSOPHY_PROMPT_VERSION)}</code>. 기존 개인 종합 리포트 지시문으로 두 AI를 비교하면 요청하신 방향이 나오는지 판단할 수 없어서, 1단계는 이 지시문으로 한다. 제품의 생성 지침에는 아직 연결하지 않았다.</p>
${table(["요청", "지시문이 AI에게 요구하는 것", "어긋나면 어떻게 거르나"], requestRows)}
<p class="note">사주가 틀이고, 성향 · 관계 응답과 알려 준 고민은 어디를 볼지 초점만 정한다. 응답 때문에 원국이나 시기 해석을 바꾸지 않고, 알려 준 이야기를 사주로 알아맞힌 것처럼 쓰지 않는다. 응답 점수 숫자는 본문에 쓰지 않고 "높게 · 낮게"와 행동으로만 쓰게 한다.</p>

<h2>2. 비교에 쓰는 가상 인물 2명 (실제 고객 아님)</h2>
<p class="sub">원국은 만세력 엔진이 계산한 값이고, 응답은 현재 개발용 문항에 가상으로 답한 값이다. 새 자체 문항(30문항 초안)을 적용한 값이 아니다.</p>
${personaCard("P01")}
${personaCard("P02")}
<p class="small">P01은 고민이 있어 고민을 반영하는 경로를, P02는 고민이 없어 "알려 주신"과 선택지가 나오지 않아야 하는 경로를 시험한다. 두 사람은 일간이 다르고(기토 · 경금) 같은 틀로 쓰되 다른 말이어야 한다.</p>

<h2>3. 리포트 구성 — 현재 코드의 아홉 부분 (운영자 의견에 따라 조정 예정)</h2>
${table(["부분", "개수 · 길이", "고민이 없는 사람(P02)", "고민이 있는 사람(P01)"], structureRows.map((r) => [r[0], r[1], r[2], r[3]]))}
<p class="small">위 표는 지금 코드(비교용 지시문)의 구성이다. 운영자 의견에 따라 ④ 갈라지는 곳과 갈등은 <b>근거가 있을 때만</b> 쓰고, ⑧ 정하지 않는다는 안내는 ① 읽는 법에 한 번만 두며, 부분 수를 억지로 채우지 않는다. 아래 예시(2판)는 이미 이 방향으로 썼다. 9,900원 통합 리포트와 4,900원 고민 반영 리포트 모두에 쓰는 기본 품질이며, 제품 화면 · 생성 지침에는 아직 반영하지 않았다.</p>

<h2>4. 짧은 목표 문장 예시 — 이 정도로 구체적이고 근거가 보이는 글</h2>
<p class="sub">사람이 쓴 기준선(2판)이다. AI가 이 문장을 베끼게 하려는 것이 아니라, 결과를 읽을 때 "이 수준인가"를 비교하는 눈금이다. 본문은 쉬운 말로 사람의 상황과 마음을 먼저 쓰고, 사주 · 응답 · 알려 준 내용은 문단 아래 "이렇게 읽은 이유"로 나눴다. 칩은 그 문단이 단 근거 ID이다. 1판은 근거에서 결론으로 너무 멀리 갔다는 지적(예: "상황이 바뀌면 방향을 빠르게 바꾼다"는 응답을 "이해가 빠르다"로, "없는 기운"을 "표현 통로가 없다"로 읽음)으로 폐기했다.</p>
${sample.personas
  .map(
    (s) => `<h3>${esc(s.id)} 목표 예시${s.id === "P01" ? " (고민이 있는 인물)" : " (고민이 없는 인물)"}</h3>
<div class="blk"><p class="part">읽는 법 (한 번만)</p><p>${esc(s.intro.text.replaceAll("{name}", NAME))}</p></div>
${s.blocks.map(blockHtml).join("")}
<h3>${esc(s.id)} — 이렇게 쓰지 않는다</h3>
${s.avoid.map((a) => `<div class="avoid"><p>${esc(a.text)}</p><p class="small">왜: ${esc(a.why)}</p></div>`).join("")}`,
  )
  .join("\n")}
<p class="small">기계가 확인한 것: 근거 ID가 위 인물의 계산 결과에 있고, 본문에 사주 용어와 응답 점수 숫자가 없으며, 막는 표현이 없고, 해석의 한계 문구를 되풀이하지 않았다 (테스트 6개). 기계가 확인하지 못한 것: 근거가 결론을 실제로 뒷받침하는지 — 각 문단의 "이렇게 읽은 이유"를 근거 문구와 나란히 놓고 사람이 읽어야 한다. 이 글이 읽을 만한지, 실제 AI가 이 수준으로 쓰는지도 확인하지 못했다.</p>

<h2>5. 평가 기준 — 결과를 보기 전에 고정</h2>
<h3>자동 점검 (형식 · 누락 · 잘못된 근거를 찾는 보조 — 통과해도 좋은 글이라는 뜻이 아님)</h3>
${table(["점검", "실패", "경고"], criteriaRows)}
<h3>이름을 가린 채 운영자가 채점 (X · Y, 5점 만점)</h3>
${table(["항목", "보는 것"], blindRows)}
<h3>1단계 합격선</h3>
<ul class="rules">
<li>지어낸 배경 · 사건 · 날짜 · 직업 · 나이: <b>0건</b></li>
<li>자동 점검의 실패 항목 없음 (고쳐 쓰기 1회 안에서). 이것은 필요조건일 뿐이며 합격의 근거가 아니다. 경고는 사람이 읽고 판단</li>
<li>블라인드 평가: "장면의 구체성" · "근거가 결론을 뒷받침하는가" · "돈을 낼 만한가" 평균 4.0 이상, "추상적 위로 · 누구에게나 맞는 말"은 한 편에 3문장 이하</li>
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

<h2>7. 승인 요청 — 예시를 확정하신 뒤에 합니다</h2>
<div class="ask">
<p><b>아직 승인을 요청하지 않습니다.</b> 먼저 위 2판 예시(P01 · P02)를 읽고 "이 글이면 9,900원이 아깝지 않다"고 느끼는지 알려 주세요. 고칠 곳이 있으면 예시를 다시 쓰고, 확정되면 그 수준에 맞게 지시문 · 검사를 고친 뒤 호출 전에 한 번 더 보여 드립니다.</p>
<p>승인 요청 내용(예시 확정 뒤): 가운데 등급 두 모델(<code>${esc(AI_CANDIDATES[0].modelId)}</code> · <code>${esc(AI_CANDIDATES[1].modelId)}</code>)로 위 가상 인물 2명 × 2 = 생성 4건, <b>총 ${won(stage1.capKrw)} 한도</b>. 실제 고객 정보 · 2단계(20건) · 한도 초과 호출 · 키를 대화창에 붙여넣기는 하지 않습니다. 승인 기록이 없으면 아무것도 보내지 않습니다.</p>
</div>
<p class="small">확인해 주실 것: (1) 예시 두 개가 읽을 만한가, 특히 "그래서 내가 왜 이랬는지 알겠다"는 느낌이 있는가 (2) 근거에서 결론으로 넘어가는 곳 중 억지스러운 곳이 있는가 (3) 쉬운 말인가, 어려운 표현이 남았는가.</p>
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
