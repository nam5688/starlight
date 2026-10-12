// 미유 성향 질문 초안을 "검토 화면"(HTML 한 파일)으로 만든다 — 문서를 찾아 읽지 않고 문항 · 선택지 · 채점 방향 · 부족한 점을 한 화면에서 본다.
// 모든 값은 lib/assessment/drafts/ 의 코드에서 읽는다 (화면과 코드가 어긋나지 않게). 화면의 검토 표시는 보는 사람의 브라우저에만 저장된다.
// 실행: node scripts/render-assessment-review.ts           → docs/assessment-review.html (더블클릭으로 열 수 있는 단독 파일)
//       node scripts/render-assessment-review.ts --fragment <경로>  → 게시용 조각(<title> + 스타일 + 본문 + 스크립트)
import { writeFileSync } from "node:fs";
import {
  contribution,
  DOMAIN_LABEL,
  DRAFT_CONTENT_VERSION,
  DRAFT_ITEMS,
  DRAFT_SCORING_VERSION,
  indicatorCounts,
  MANY_SKIPPED,
  MIN_INDICATORS,
  NA_OPTION_TEXT,
  PERSPECTIVE_IDS,
  PERSPECTIVES,
  CLEAR_DISTANCE,
  SLIGHT_DISTANCE,
  type Domain,
  type DraftItem,
  type DraftOption,
  type PerspectiveId,
} from "../lib/assessment/drafts/situational-draft.ts";
import { summarizeReliability, SIM_NA_RATE, SIM_PEOPLE } from "../lib/assessment/drafts/reliability-summary.ts";
import type { SimReport } from "../lib/assessment/drafts/reliability-sim.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (x: number) => `${Math.round(x * 100)}%`;
const f2 = (x: number) => x.toFixed(2);
const signed = (x: number) => (x > 0 ? `+${x.toFixed(2)}` : x.toFixed(2));
const range = (xs: number[], fmt: (x: number) => string) => `${fmt(Math.min(...xs))}~${fmt(Math.max(...xs))}`;
const DOMAINS: Domain[] = ["temperament", "character", "relation"];
const DOMAIN_SHORT: Record<Domain, string> = { temperament: "기질", character: "성격", relation: "관계" };
const counts = indicatorCounts();
const totalIndicators = PERSPECTIVE_IDS.reduce((n, p) => n + counts[p], 0);
const perspectivesOf = (item: DraftItem) => PERSPECTIVE_IDS.filter((p) => item.options.some((o) => o.w[p] !== undefined));

// ───────── 문항 탭 ─────────

function readingOf(item: DraftItem, o: DraftOption) {
  const rows = (Object.entries(o.w) as [PerspectiveId, number][]).map(([p, w]) => {
    const side = w > 0 ? PERSPECTIVES[p].high : PERSPECTIVES[p].low;
    const c = contribution(item, o.id, p);
    return `<li><span class="pid">${p}</span><span class="pname">${esc(PERSPECTIVES[p].name)}</span><span class="side ${w > 0 ? "up" : "down"}">${w > 0 ? "높은 쪽" : "낮은 쪽"} · ${Math.abs(w) === 2 ? "크게" : "조금"}</span><span class="sidetext">${esc(side)}</span><span class="contrib" title="이 문항의 선택지를 모두 같은 확률로 고르는 사람을 0으로 맞춘 값 (−1~+1)">기여값 ${c === null ? "—" : signed(c)}</span></li>`;
  });
  return `<ul class="reading">${rows.join("")}</ul>`;
}

function itemHtml(item: DraftItem) {
  const options = item.options
    .map(
      (o) => `<li class="opt"><span class="letter">${o.id.toUpperCase()}</span><div class="opt-body"><p class="opt-text">${esc(o.text)}</p><div class="analyst">${readingOf(item, o)}</div></div></li>`,
    )
    .join("");
  const touched = perspectivesOf(item)
    .map((p) => `<span class="pid" title="${esc(PERSPECTIVES[p].name)}">${p}</span>`)
    .join("");
  return `<article class="item" id="item-${item.id}" data-id="${item.id}" data-domain="${item.domain}">
  <header class="item-head"><span class="qid">${item.id}</span><span class="topic">${esc(item.topic)}</span><span class="dom dom-${item.domain}">${DOMAIN_SHORT[item.domain]}</span><span class="touch analyst">영향을 주는 관점 ${touched}</span></header>
  <p class="stem">${esc(item.stem)}</p>
  <p class="purpose analyst"><b>이 문항으로 알고 싶은 것</b> ${esc(item.purpose)}</p>
  <ol class="opts">${options}<li class="opt na"><span class="letter">—</span><div class="opt-body"><p class="opt-text">${esc(NA_OPTION_TEXT)}</p><p class="na-note analyst">점수에 넣지 않습니다 (억지로 고르게 하지 않기 위한 선택지).</p></div></li></ol>
  <div class="review" role="group" aria-label="${item.id} 검토">
    <div class="seg" data-id="${item.id}">
      <button type="button" data-mark="ok" id="mark-${item.id}-ok" aria-pressed="false">괜찮음</button>
      <button type="button" data-mark="fix" id="mark-${item.id}-fix" aria-pressed="false">고쳐야 함</button>
      <button type="button" data-mark="drop" id="mark-${item.id}-drop" aria-pressed="false">빼기</button>
    </div>
    <label class="note-label" for="note-${item.id}">한 줄 메모</label>
    <input class="note" id="note-${item.id}" data-id="${item.id}" type="text" maxlength="200" placeholder="예: 선택지 B가 너무 길어요" autocomplete="off">
  </div>
</article>`;
}

function itemsTab() {
  const groups = DOMAINS.map((d) => {
    const items = DRAFT_ITEMS.filter((i) => i.domain === d);
    return `<section class="group" data-group="${d}"><h2>${DOMAIN_LABEL[d]} <span class="count">${items.length}문항</span></h2>${items.map(itemHtml).join("")}</section>`;
  }).join("");
  return `<div class="toolbar">
  <div class="chips" role="group" aria-label="영역 보기">
    <button type="button" class="chip" data-filter="all" aria-pressed="true">전체 ${DRAFT_ITEMS.length}</button>
    ${DOMAINS.map((d) => `<button type="button" class="chip" data-filter="${d}" aria-pressed="false">${DOMAIN_SHORT[d]} ${DRAFT_ITEMS.filter((i) => i.domain === d).length}</button>`).join("")}
    <button type="button" class="chip" data-filter="todo" aria-pressed="false">안 본 것 <span id="todo-count">${DRAFT_ITEMS.length}</span></button>
    <button type="button" class="chip" data-filter="flag" aria-pressed="false">고칠 것 · 뺄 것 <span id="flag-count">0</span></button>
  </div>
  <label class="switch"><input type="checkbox" id="respondent-view"> <span>응답자 화면처럼 보기 (점수 방향 숨김)</span></label>
</div>
<p class="hint">각 문항을 읽고 <b>괜찮음 · 고쳐야 함 · 빼기</b> 중 하나를 누르고, 필요하면 한 줄 메모를 적어 주세요. 표시는 이 브라우저에만 저장되고, <b>검토 메모</b> 탭에서 글로 모아 채팅에 붙여넣을 수 있습니다. 선택지 아래의 <b>점수 방향</b>은 운영자 설명용이며 응답자에게는 보이지 않습니다.</p>
${groups}`;
}

// ───────── 채점 탭 ─────────

function scoringTab() {
  // 예시 1: 한 문항에서 선택지별 기여값 (Q02 · T1)
  const ex = DRAFT_ITEMS.find((i) => i.id === "Q02")!;
  const exRows = ex.options
    .map((o) => {
      const raw = o.w.T1;
      const c = contribution(ex, o.id, "T1");
      return `<tr><td>${o.id.toUpperCase()}</td><td>${esc(o.text)}</td><td class="num">${raw === undefined ? "—" : raw > 0 ? `+${raw}` : raw}</td><td class="num">${c === null ? "—" : signed(c)}</td></tr>`;
    })
    .join("");
  // 예시 2: 가상 응답자 한 명의 T1 점수
  const t1Items = DRAFT_ITEMS.filter((i) => perspectivesOf(i).includes("T1"));
  const pattern = [0, 0, 1, 0, 2];
  const picks = t1Items.map((item, n) => {
    const sorted = [...item.options].sort((a, b) => (b.w.T1 ?? 0) - (a.w.T1 ?? 0));
    const o = sorted[Math.min(pattern[n] ?? 0, sorted.length - 1)];
    return { item, o, c: contribution(item, o.id, "T1") ?? 0 };
  });
  const mean = picks.reduce((n, p) => n + p.c, 0) / picks.length;
  const score = Math.round(50 + 50 * mean);
  const dist = Math.abs(score - 50);
  const band = dist >= CLEAR_DISTANCE ? "뚜렷" : dist >= SLIGHT_DISTANCE ? "약간" : "고르게";
  const pickRows = picks.map((p) => `<tr><td>${p.item.id} ${esc(p.item.topic)}</td><td>${p.o.id.toUpperCase()}</td><td class="num">${signed(p.c)}</td></tr>`).join("");

  return `<h2>답이 점수가 되는 과정</h2>
<ol class="steps">
  <li><b>선택지마다 방향이 정해져 있습니다.</b> 한 선택지는 최대 2개 관점에 "높은 쪽 / 낮은 쪽"과 세기(조금=1, 크게=2)를 줍니다. 문항 탭의 점수 방향이 이 표입니다.</li>
  <li><b>문항마다 가운데를 맞춥니다.</b> 그 문항의 선택지 네 개를 같은 확률로 고르는 사람이 0이 되도록 빼고, 가장 먼 선택지가 ±1이 되게 맞춥니다. 선택지가 한쪽으로 치우쳐 쓰인 문항도 점수를 한쪽으로 끌지 않게 하기 위해서입니다. 이 값이 <b>기여값</b>(−1~+1)입니다.</li>
  <li><b>관점마다 평균을 냅니다.</b> 그 관점에 점수를 주는 문항 중 <b>답한 문항</b>의 기여값 평균을 0~100으로 옮깁니다 (50이 가운데). <b>"해당 없음"은 평균에 넣지 않습니다.</b></li>
  <li><b>정도를 세 칸으로 나눕니다.</b> 가운데(50)에서 ${CLEAR_DISTANCE} 이상 떨어지면 <b>뚜렷</b>, ${SLIGHT_DISTANCE}~${CLEAR_DISTANCE}는 <b>약간</b>, ${SLIGHT_DISTANCE} 미만은 <b>고르게</b>(어느 쪽으로도 기울지 않음)입니다.</li>
  <li><b>답한 문항이 ${MIN_INDICATORS}개 미만이면 그 관점은 판단을 보류합니다.</b> 억지로 분류하지 않습니다. 건너뛴 문항이 ${MANY_SKIPPED}개 이상이면 해석을 줄이고 다시 답하기를 권합니다.</li>
</ol>

<h2>예시 1 — 한 문항이 만드는 기여값 (Q02 · 새로움에 끌리는 정도)</h2>
<div class="tablewrap"><table><thead><tr><th>선택지</th><th>응답자가 보는 문장</th><th class="num">정해 둔 방향</th><th class="num">기여값</th></tr></thead><tbody>${exRows}</tbody></table></div>
<p class="small">정해 둔 방향이 +1인 선택지도, 같은 문항의 다른 선택지가 +2이면 기여값은 +0.5로 낮아집니다. 선택지끼리의 차이를 보는 방식이기 때문입니다.</p>

<h2>예시 2 — 가상 응답자 한 명의 "새로움에 끌리는 정도" 점수</h2>
<p class="small">실제 응답이 아니라 설명을 위해 고른 가상의 응답입니다. 새로움(T1)에 점수를 주는 문항 ${picks.length}개에 아래처럼 답했다고 합니다.</p>
<div class="tablewrap"><table><thead><tr><th>문항</th><th>고른 선택지</th><th class="num">기여값</th></tr></thead><tbody>${pickRows}<tr class="sum"><td colspan="2">평균 ${signed(mean)} → 0~100으로 옮기면</td><td class="num"><b>${score}</b></td></tr></tbody></table></div>
<p>가운데(50)에서 ${dist} 떨어져 있어 <b>${band}</b> 칸입니다. 리포트에서는 숫자보다 <b>"${esc(PERSPECTIVES.T1.high)} 쪽으로 ${band === "뚜렷" ? "뚜렷하게 가까운" : band === "약간" ? "약간 기운" : "치우치지 않은"} 편"</b>처럼 방향과 정도로 씁니다. 이 점수는 응답에서 나온 환산값이고, 백분위나 정확도가 아니며, 높고 낮음이 좋고 나쁨도 아닙니다.</p>

<h2>점수를 읽을 때 지키는 규칙</h2>
<ul class="rules">
  <li>기질 · 성격 · 가까운 관계를 <b>영역별로 따로</b> 보여 주고, 하나의 점수나 이름으로 합치지 않습니다.</li>
  <li>사주와 응답을 합산하지 않습니다. 응답 때문에 사주 원국이나 운의 시기를 바꾸지 않고, 둘이 다르면 상황별 차이로 설명합니다.</li>
  <li>공식 MBTI · TCI · 애착검사의 문항을 가져오지 않았고, 그 점수나 유형으로 환산하지 않습니다. 이 질문의 이름은 "미유 성향 질문"입니다.</li>
  <li>"상황에 따라 다름"을 사람마다 판정하지 않습니다 (부족한 점 탭 참고). 상황 차이는 본인이 문항별로 다르게 답한 내용을 그대로 보여 주는 방식으로 설명합니다.</li>
  <li>문항 · 채점 규칙에는 버전을 붙입니다. 지금 초안은 문항 <code>${DRAFT_CONTENT_VERSION}</code> · 채점 <code>${DRAFT_SCORING_VERSION}</code>이고, 실제 검사 화면에는 연결하지 않았습니다.</li>
</ul>`;
}

// ───────── 관점 탭 ─────────

function viewsTab() {
  return DOMAINS.map((d) => {
    const rows = PERSPECTIVE_IDS.filter((p) => PERSPECTIVES[p].domain === d)
      .map((p) => {
        const items = DRAFT_ITEMS.filter((i) => perspectivesOf(i).includes(p)).map((i) => i.id);
        const own = DRAFT_ITEMS.filter((i) => i.domain === d && perspectivesOf(i).includes(p)).length;
        return `<tr><td><span class="pid">${p}</span></td><td><b>${esc(PERSPECTIVES[p].name)}</b><br><span class="small">${esc(PERSPECTIVES[p].purpose)}</span></td><td>${esc(PERSPECTIVES[p].high)}</td><td>${esc(PERSPECTIVES[p].low)}</td><td class="num">${counts[p]}</td><td class="small">${items.join(" ")}<br>자기 영역 ${own}개</td></tr>`;
      })
      .join("");
    return `<h2>${DOMAIN_LABEL[d]}</h2><div class="tablewrap"><table class="views"><thead><tr><th></th><th>관점과 쓰임</th><th>높은 쪽</th><th>낮은 쪽</th><th class="num">지표 수</th><th>점수를 주는 문항</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join("") + `<p class="small">지표 수는 그 관점에 점수를 주는 문항의 수입니다 (한 문항이 선택지에 따라 1~2개 관점에 점수를 줍니다). 높은 쪽 · 낮은 쪽은 좋고 나쁨이 아니라 방향입니다. 대표 경향 12유형 설계가 쓰는 7개 관점은 T1 · T2 · T4 · T5 · C1 · C3 · C4입니다.</p>`;
}

// ───────── 부족한 점 탭 ─────────

const sim = summarizeReliability();
const lvl = (name: string): SimReport => sim.levels.find((l) => l.name === name)!.report;
const low = lvl("낮음");
const mid = lvl("보통");
const high = lvl("높음");

function limitsTab() {
  const fewest = PERSPECTIVE_IDS.filter((p) => counts[p] === Math.min(...PERSPECTIVE_IDS.map((q) => counts[q])));
  const sit0 = sim.situational[0];
  const sit1 = sim.situational[1];
  const summaryRows = sim.levels
    .map((l) => {
      const r = l.report;
      return `<tr><td>${l.name}<br><span class="small">${esc(l.note)}</span></td><td class="num">${range(r.perspectives.map((p) => p.retestCorrelation), f2)}</td><td class="num">${range(r.perspectives.map((p) => p.directionAgree), pct)}</td><td class="num">${range(r.perspectives.map((p) => p.classAgree), pct)}</td><td class="num">${pct(r.sevenSignAll)}</td></tr>`;
    })
    .join("");
  const perspRows = PERSPECTIVE_IDS.map((id, i) => {
    const a = low.perspectives[i];
    const b = mid.perspectives[i];
    return `<tr><td><span class="pid">${id}</span> ${esc(a.name)}</td><td class="num">${a.indicators}</td><td class="num">${f2(a.retestCorrelation)}</td><td class="num">${f2(b.retestCorrelation)}</td><td class="num">${pct(b.directionAgree)}</td></tr>`;
  }).join("");
  const naRows = sim.naSensitivity.map((n) => `<tr><td class="num">${pct(n.naRate)}</td><td class="num">${pct(n.meanHold)}</td><td class="num">${pct(n.worstHold)}</td></tr>`).join("");
  const cc = mid.crossCorrelation;

  return `<div class="notice"><b>이 탭의 숫자는 실제 사람의 응답이 아닙니다.</b> 가상 응답자 ${SIM_PEOPLE.toLocaleString("ko-KR")}명이 "자기 성향대로 얼마나 일관되게 고르는가(응답 일관성)"를 낮음 · 보통 · 높음으로 가정하고 답한 결과입니다 (해당 없음 ${pct(SIM_NA_RATE)}). 같은 사람이 같은 성향으로 다시 답한다고 두었으므로 <b>실제 재응답 일치는 이보다 낮을 가능성이 큽니다.</b> "30문항이 정확하다"는 증거가 아니라 <b>문항 구조가 허용하는 한계</b>입니다. 실제 신뢰도는 시범 응답으로만 알 수 있습니다.</div>

<h2>한 줄 결론</h2>
<p class="lead">30문항 · 13관점(지표 ${totalIndicators}개)으로 <b>관점별 "어느 쪽에 가까운가"와 정도</b>는 읽을 수 있습니다. <b>12유형 같은 이름 하나, 점수의 작은 차이, "상황에 따라 다름" 판정</b>은 읽을 수 없습니다. 12유형을 맞추려고 억지로 분류하지 않습니다.</p>

<h2>응답 일관성별로 본 13개 관점</h2>
<div class="tablewrap"><table><thead><tr><th>응답 일관성(가정)</th><th class="num">재응답 점수 상관</th><th class="num">방향 일치</th><th class="num">세 구분 일치</th><th class="num">7개 관점의 높음/낮음이 모두 같음</th></tr></thead><tbody>${summaryRows}</tbody></table></div>
<p class="small">범위는 13개 관점 중 가장 낮은 값~가장 높은 값입니다. <b>재응답 점수 상관</b>은 같은 사람이 두 번 답한 점수끼리의 상관(1에 가까울수록 같음), <b>방향 일치</b>는 두 번 모두 높음/낮음이 나온 사람 중 같은 방향인 몫, <b>세 구분 일치</b>는 높음 · 고르게 · 낮음이 두 번 같은 몫, 마지막 열은 대표 경향 12유형이 쓰는 7개 관점의 방향이 모두 같은 사람의 몫입니다.</p>

<h2>읽어도 되는 것 · 읽으면 안 되는 것</h2>
<div class="two">
  <div><h3>읽어도 되는 것</h3><ul class="rules">
    <li><b>관점별 방향 (높은 쪽 / 낮은 쪽).</b> 응답 일관성이 보통이면 방향이 나온 사람의 ${range(mid.perspectives.map((p) => p.directionAgree), pct)}가 다시 답해도 같은 방향입니다.</li>
    <li>기질 · 성격 · 관계를 <b>영역별로 따로</b> 보여 주는 설계.</li>
  </ul></div>
  <div><h3>읽으면 안 되는 것</h3><ol class="rules">
    <li><b>점수의 작은 차이</b> (58과 62). 보통일 때 재응답 점수 상관 ${range(mid.perspectives.map((p) => p.retestCorrelation), f2)}, 낮으면 ${range(low.perspectives.map((p) => p.retestCorrelation), f2)}입니다.</li>
    <li><b>"약간"과 "고르게"의 경계.</b> 세 구분이 두 번 같은 몫이 보통일 때 ${range(mid.perspectives.map((p) => p.classAgree), pct)}뿐입니다.</li>
    <li><b>12유형 이름.</b> 7개 관점의 높음/낮음이 모두 같게 나오는 사람이 보통일 때 ${pct(mid.sevenSignAll)}, 높아도 ${pct(high.sevenSignAll)}입니다. 같은 사람이 다시 답하면 다른 이름이 나올 가능성이 더 큽니다.</li>
    <li><b>"상황에 따라 다름" 판정.</b> 지금 규칙은 한결같은 가상 응답자의 ${pct(sit0.falseFlag)}(관점에 따라 최대 ${pct(sit0.worstFalseFlag)})에도 붙고, 정말 상황에 따라 달라지는 가상 응답자에는 ${pct(sit0.detected)}에만 붙습니다. 엄격하게(${sit1.rule.spread} · ${sit1.rule.minEach}) 하면 오탐은 ${pct(sit1.falseFlag)}지만 탐지도 ${pct(sit1.detected)}로 무너집니다. 그래서 판정에 쓰지 않고, 본인이 문항별로 다르게 답한 내용을 그대로 보여 줍니다.</li>
  </ol></div>
</div>

<h2>30문항으로 부족한 부분</h2>
<ol class="rules">
  <li><b>재응답이 가장 흔들리는 관점.</b> 응답 일관성이 낮을 때 가장 낮은 세 관점은 ${[...low.perspectives].sort((x, y) => x.retestCorrelation - y.retestCorrelation).slice(0, 3).map((p) => `${p.id} ${esc(p.name)}(${f2(p.retestCorrelation)})`).join(" · ")}입니다. 지표 수가 적다고 항상 더 흔들리는 것은 아닙니다 (지표가 가장 적은 관점은 ${fewest.join(" · ")}로 ${counts[fewest[0]]}개). 이 관점들이 문항을 고치거나 더하는 우선순위입니다.</li>
  <li><b>응답 일관성이 낮으면 지금 지표 수로는 부족합니다.</b> 재응답 상관 0.7에 관점당 ${range(low.perspectives.map((p) => p.neededFor70), (x) => String(Math.ceil(x)))}개, 0.8에 ${range(low.perspectives.map((p) => p.neededFor80), (x) => String(Math.ceil(x)))}개가 필요합니다 (지금 4~7개). 보통이면 대체로 충분합니다. 결국 <b>사람들이 얼마나 일관되게 답하는지는 시범 응답으로만 알 수 있습니다.</b></li>
  <li><b>13개 관점은 30문항에 비해 많습니다.</b> 한 문항이 두 관점에 함께 점수를 주기 때문에, 성향이 서로 독립인 가상 응답자에서도 관점끼리 점수가 같이 움직입니다 (평균 ${f2(cc.meanAbs)}, 가장 큰 쌍 ${cc.max.a}–${cc.max.b} ${f2(cc.max.r)}).${cc.max.a === "T1" && cc.max.b === "T2" ? " 새로움(T1)과 대비(T2)는 12유형 설계가 \"실제로 반대로 움직인다\"고 가정한 값(−0.4)과 같은 크기라서, 시범 응답에서 이 상관이 나와도 사람의 특성인지 문항 구조 때문인지 구분할 수 없습니다." : ""}</li>
  <li><b>해당 없음이 많아지면 관점이 보류됩니다.</b> 응답한 지표가 ${MIN_INDICATORS}개 미만이면 보류하기 때문입니다.</li>
</ol>
<div class="tablewrap narrow"><table><thead><tr><th class="num">해당 없음 비율(가정)</th><th class="num">보류되는 관점의 평균</th><th class="num">가장 많이 보류되는 관점</th></tr></thead><tbody>${naRows}</tbody></table></div>

<h2>어느 관점이 얼마나 흔들리나</h2>
<details><summary>13개 관점 표 펼치기</summary>
<div class="tablewrap"><table><thead><tr><th>관점</th><th class="num">지표 수</th><th class="num">재응답 상관 (일관성 낮음)</th><th class="num">재응답 상관 (보통)</th><th class="num">방향 일치 (보통)</th></tr></thead><tbody>${perspRows}</tbody></table></div></details>

<h2>정해 주실 것</h2>
<div class="tablewrap"><table class="choices"><thead><tr><th>선택</th><th>내용</th><th>장점</th><th>단점</th></tr></thead><tbody>
<tr class="rec"><td><b>A. 30문항 유지 + 읽는 범위를 좁힘 (추천)</b></td><td>관점별 방향과 정도(뚜렷 · 약간 · 고르게)만 리포트에 씁니다. 12유형 이름 · 점수의 작은 차이 · 상황 판정은 쓰지 않습니다. 실제 사람 응답으로 시범 후 결정합니다.</td><td>바로 시범 가능, 문항 수 부담 없음</td><td>"나는 이런 유형"이라는 짧은 이름은 줄 수 없음</td></tr>
<tr><td><b>B. 36~40문항으로 늘림</b></td><td>지표가 적거나 흔들리는 관점에 문항을 더해 관점당 5~6개 이상으로 맞춥니다.</td><td>방향 · 정도의 안정이 올라감</td><td>응답 시간이 늘고 끝까지 답하는 사람이 줄 수 있음</td></tr>
<tr><td><b>C. 관점을 9~10개로 줄임</b></td><td>비슷한 관점을 합치거나 우선순위가 낮은 관점을 뺍니다.</td><td>같은 문항 수로 관점당 지표가 늘어남</td><td>설명 폭이 줄고 관점의 뜻이 뭉개질 수 있음</td></tr>
</tbody></table></div>
<p class="small">시범에서 확인할 것: ① 같은 사람의 재응답 일치 ② 관점 간 상관(위 가상 값보다 큰지) ③ 문항별 해당 없음 비율 ④ 끝까지 답한 비율. 이 결과를 보기 전에는 12유형을 화면에 연결하지 않습니다. 이 계산이 정하지 못하는 것: 문항이 정말 그 성향을 재는지(타당도), 같은 문장을 사람마다 다르게 읽는 정도.</p>`;
}

// ───────── 메모 탭 ─────────

function memoTab() {
  return `<h2>검토 메모</h2>
<p class="hint">문항 탭에서 누른 표시와 한 줄 메모가 아래에 모입니다. <b>복사</b>를 눌러 채팅에 붙여넣으면 제가 그대로 읽고 문항을 고칩니다. 이 표시는 이 브라우저에만 저장됩니다 (다른 기기와 공유되지 않음).</p>
<div class="summary" id="memo-summary" aria-live="polite"></div>
<fieldset class="choice"><legend>전체 방향 (부족한 점 탭의 선택)</legend>
  <label><input type="radio" name="dir" value="A" id="dir-a"> A. 30문항 유지, 읽는 범위를 좁히고 시범 응답부터</label>
  <label><input type="radio" name="dir" value="B" id="dir-b"> B. 36~40문항으로 늘림</label>
  <label><input type="radio" name="dir" value="C" id="dir-c"> C. 관점을 9~10개로 줄임</label>
  <label><input type="radio" name="dir" value="" id="dir-none" checked> 아직 정하지 않음</label>
</fieldset>
<label class="note-label" for="overall">전체 의견 (선택)</label>
<textarea id="overall" rows="4" maxlength="1500" placeholder="예: 관계 영역 문항이 연애 상황에만 치우친 것 같아요."></textarea>
<div class="actions"><button type="button" class="primary" id="copy-btn">검토 내용 복사</button><button type="button" id="clear-btn">표시 모두 지우기</button><span id="copy-status" class="small" role="status"></span></div>
<label class="note-label" for="memo-text">복사될 글</label>
<textarea id="memo-text" rows="14" readonly></textarea>`;
}

// ───────── 조립 ─────────

const CSS = `
:root{--bg:#ffffff;--mist:#f5f6f8;--line:#e2e5e9;--line-strong:#c9ced5;--ink:#1d2125;--ink-2:#464d55;--ink-3:#5f666e;--accent:#1e4b8f;--accent-strong:#163a70;--accent-soft:#edf2f9;--danger:#b3261e;--danger-soft:#fbeeed;--font:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14171a;--mist:#1b1f24;--line:#2b3138;--line-strong:#3c444d;--ink:#e8eaed;--ink-2:#c3c8ce;--ink-3:#9aa1a9;--accent:#8fb3e6;--accent-strong:#b3cdf0;--accent-soft:#1c2736;--danger:#f0988f;--danger-soft:#33201f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#14171a;--mist:#1b1f24;--line:#2b3138;--line-strong:#3c444d;--ink:#e8eaed;--ink-2:#c3c8ce;--ink-3:#9aa1a9;--accent:#8fb3e6;--accent-strong:#b3cdf0;--accent-soft:#1c2736;--danger:#f0988f;--danger-soft:#33201f;color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-padding-top:4.5rem}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font);font-size:15px;line-height:1.65;word-break:keep-all;overflow-wrap:break-word}
[hidden]{display:none!important}
.wrap{max-width:62rem;margin-inline:auto;padding-inline:16px;padding-block:20px 56px}
h1{font-size:1.5rem;line-height:1.3;margin:0 0 6px;text-wrap:balance}
h2{font-size:1.15rem;line-height:1.4;margin:32px 0 10px;padding-top:18px;border-top:1px solid var(--line);text-wrap:balance}
h3{font-size:1rem;margin:0 0 8px}
p,li{text-wrap:pretty}
.sub{margin:0;color:var(--ink-2)}
.status{margin:12px 0 0;padding:10px 12px;background:var(--mist);border-left:3px solid var(--accent);color:var(--ink-2);font-size:.9rem}
.tabs{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;display:flex;gap:2px;margin:18px -16px 0;padding:0 16px;background:var(--bg);border-bottom:1px solid var(--line);overflow-x:auto}
.tab{appearance:none;border:0;background:none;color:var(--ink-3);font:inherit;font-weight:600;padding:12px 12px;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
.tab[aria-selected="true"]{color:var(--accent);border-bottom-color:var(--accent)}
.tab:hover{color:var(--ink)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.panel{padding-top:4px}
.toolbar{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;justify-content:space-between;margin-top:16px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{appearance:none;border:1px solid var(--line-strong);background:var(--bg);color:var(--ink-2);font:inherit;font-size:.88rem;padding:5px 12px;border-radius:4px;cursor:pointer}
.chip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--bg)}
.switch{display:flex;align-items:center;gap:8px;font-size:.9rem;color:var(--ink-2);cursor:pointer}
.hint{margin:12px 0 0;color:var(--ink-2);font-size:.92rem}
.group>h2 .count{font-weight:400;color:var(--ink-3);font-size:.9rem;margin-left:6px}
.item{padding:18px 0;border-bottom:1px solid var(--line)}
.item[data-mark="ok"]{box-shadow:inset 3px 0 0 var(--accent);padding-left:12px}
.item[data-mark="fix"]{box-shadow:inset 3px 0 0 var(--danger);padding-left:12px}
.item[data-mark="drop"]{box-shadow:inset 3px 0 0 var(--ink-3);padding-left:12px}
.item-head{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.qid{font-weight:700;font-variant-numeric:tabular-nums}
.topic{color:var(--ink-2)}
.dom{font-size:.8rem;color:var(--ink-3);border:1px solid var(--line-strong);padding:0 6px;border-radius:3px}
.touch{margin-left:auto;font-size:.82rem;color:var(--ink-3)}
.pid{display:inline-block;min-width:1.9em;text-align:center;font-size:.78rem;font-weight:700;color:var(--accent);background:var(--accent-soft);padding:0 5px;border-radius:3px;margin-right:4px;font-variant-numeric:tabular-nums}
.stem{font-size:1.02rem;font-weight:600;margin:10px 0 6px}
.purpose{margin:0 0 10px;font-size:.88rem;color:var(--ink-3)}
.purpose b{color:var(--ink-2);margin-right:6px}
.opts{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.opt{display:grid;grid-template-columns:1.8rem minmax(0,1fr);gap:8px;padding:10px 12px;background:var(--mist);border-radius:4px}
.opt.na{background:none;border:1px dashed var(--line-strong)}
.letter{font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums}
.opt-text{margin:0}
.na-note{margin:2px 0 0;font-size:.82rem;color:var(--ink-3)}
.reading{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:4px}
.reading li{display:flex;flex-wrap:wrap;gap:2px 8px;align-items:baseline;font-size:.84rem;color:var(--ink-3)}
.pname{color:var(--ink-2);font-weight:600}
.side{font-weight:700}
.side.up{color:var(--accent)}
.side.down{color:var(--ink-2)}
.sidetext{order:3;flex-basis:100%;padding-left:2.4em}
.contrib{margin-left:auto;font-variant-numeric:tabular-nums;order:2}
.review{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-top:12px}
.seg{display:inline-flex;border:1px solid var(--line-strong);border-radius:4px;overflow:hidden}
.seg button{appearance:none;border:0;border-right:1px solid var(--line-strong);background:var(--bg);color:var(--ink-2);font:inherit;font-size:.88rem;padding:6px 12px;cursor:pointer}
.seg button:last-child{border-right:0}
.seg button[aria-pressed="true"][data-mark="ok"]{background:var(--accent);color:var(--bg)}
.seg button[aria-pressed="true"][data-mark="fix"]{background:var(--danger);color:var(--bg)}
.seg button[aria-pressed="true"][data-mark="drop"]{background:var(--ink-3);color:var(--bg)}
.note-label{font-size:.84rem;color:var(--ink-3)}
.note{flex:1 1 14rem;min-width:0;font:inherit;font-size:.9rem;padding:6px 8px;border:1px solid var(--line-strong);border-radius:4px;background:var(--bg);color:var(--ink)}
textarea{width:100%;font:inherit;font-size:.9rem;padding:8px;border:1px solid var(--line-strong);border-radius:4px;background:var(--bg);color:var(--ink);resize:vertical}
body.respondent .analyst{display:none}
.tablewrap{overflow-x:auto;margin:8px 0}
.tablewrap.narrow{max-width:30rem}
table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}
th{font-size:.82rem;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--line-strong);background:var(--mist)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tr.sum td{border-top:1px solid var(--line-strong);font-weight:600}
tr.rec td{background:var(--accent-soft)}
table.views{min-width:44rem}
table.choices{min-width:40rem}
.small{font-size:.84rem;color:var(--ink-3)}
.lead{font-size:1.05rem;margin:6px 0}
.notice{margin:16px 0 0;padding:12px 14px;border:1px solid var(--danger);background:var(--danger-soft);border-radius:4px;font-size:.92rem}
.steps,.rules{margin:8px 0;padding-left:1.3rem;display:grid;gap:8px}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr));gap:18px}
details{margin:8px 0}
summary{cursor:pointer;color:var(--accent);font-weight:600;padding:4px 0}
code{font-size:.85em;background:var(--mist);padding:1px 5px;border-radius:3px}
.summary{margin:12px 0;padding:12px 14px;background:var(--mist);border-radius:4px;font-size:.92rem}
.summary p{margin:2px 0}
fieldset.choice{margin:14px 0;padding:10px 12px;border:1px solid var(--line-strong);border-radius:4px;display:grid;gap:6px}
fieldset.choice legend{font-size:.84rem;color:var(--ink-3);padding:0 6px}
fieldset.choice label{display:flex;gap:8px;align-items:flex-start;font-size:.92rem}
.actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0}
.actions button{appearance:none;font:inherit;font-size:.92rem;padding:8px 16px;border:1px solid var(--line-strong);border-radius:4px;background:var(--bg);color:var(--ink-2);cursor:pointer}
.actions button.primary{background:var(--accent);border-color:var(--accent);color:var(--bg);font-weight:700}
@media (min-width:900px){
  .opt{grid-template-columns:1.8rem minmax(0,1fr)}
  .opt-body{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:6px 18px;align-items:start}
  .reading{margin:0}
  .na-note{margin:0}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`;

const SCRIPT = `
(function(){
  var KEY='miyu-assessment-review-v1';
  var ITEMS=${JSON.stringify(DRAFT_ITEMS.map((i) => ({ id: i.id, topic: i.topic, domain: i.domain })))};
  var state={marks:{},notes:{},overall:'',dir:''};
  try{var raw=localStorage.getItem(KEY);if(raw){var p=JSON.parse(raw);if(p&&typeof p==='object'){state.marks=p.marks||{};state.notes=p.notes||{};state.overall=p.overall||'';state.dir=p.dir||'';}}}catch(e){}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){}}
  var LABEL={ok:'괜찮음',fix:'고쳐야 함',drop:'빼기'};
  var filter='all';

  // 탭
  var tabs=[].slice.call(document.querySelectorAll('.tab'));
  var panels=[].slice.call(document.querySelectorAll('.panel'));
  function showTab(id){
    tabs.forEach(function(t){t.setAttribute('aria-selected',String(t.getAttribute('data-tab')===id));});
    panels.forEach(function(p){p.hidden=p.id!=='panel-'+id;});
    if(id==='memo')renderMemo();
  }
  tabs.forEach(function(t){t.addEventListener('click',function(){showTab(t.getAttribute('data-tab'));window.scrollTo(0,0);});});
  var h=(location.hash||'').replace('#','');
  showTab(['items','scoring','views','limits','memo'].indexOf(h)>=0?h:'items');

  // 표시
  function applyMarks(){
    ITEMS.forEach(function(it){
      var el=document.getElementById('item-'+it.id);
      var m=state.marks[it.id]||'';
      if(m)el.setAttribute('data-mark',m);else el.removeAttribute('data-mark');
      ['ok','fix','drop'].forEach(function(k){
        var b=document.getElementById('mark-'+it.id+'-'+k);
        if(b)b.setAttribute('aria-pressed',String(m===k));
      });
      var n=document.getElementById('note-'+it.id);
      if(n&&n!==document.activeElement)n.value=state.notes[it.id]||'';
    });
    var todo=ITEMS.filter(function(i){return !state.marks[i.id];}).length;
    var flag=ITEMS.filter(function(i){return state.marks[i.id]==='fix'||state.marks[i.id]==='drop';}).length;
    document.getElementById('todo-count').textContent=String(todo);
    document.getElementById('flag-count').textContent=String(flag);
    applyFilter();
  }
  function applyFilter(){
    ITEMS.forEach(function(it){
      var el=document.getElementById('item-'+it.id);
      var m=state.marks[it.id]||'';
      var show=filter==='all'||filter===it.domain||(filter==='todo'&&!m)||(filter==='flag'&&(m==='fix'||m==='drop'));
      el.hidden=!show;
    });
    [].slice.call(document.querySelectorAll('.group')).forEach(function(g){
      var any=[].slice.call(g.querySelectorAll('.item')).some(function(e){return !e.hidden;});
      g.hidden=!any;
    });
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('.seg button');
    if(b){
      var id=b.parentNode.getAttribute('data-id');
      var mk=b.getAttribute('data-mark');
      if(state.marks[id]===mk)delete state.marks[id];else state.marks[id]=mk;
      save();applyMarks();return;
    }
    var c=e.target.closest&&e.target.closest('.chip');
    if(c){
      filter=c.getAttribute('data-filter');
      [].slice.call(document.querySelectorAll('.chip')).forEach(function(x){x.setAttribute('aria-pressed',String(x===c));});
      applyFilter();
    }
  });
  document.addEventListener('input',function(e){
    var t=e.target;
    if(t.classList&&t.classList.contains('note')){var id=t.getAttribute('data-id');if(t.value)state.notes[id]=t.value;else delete state.notes[id];save();}
  });
  document.getElementById('respondent-view').addEventListener('change',function(e){document.body.classList.toggle('respondent',e.target.checked);});

  // 메모
  function memoText(){
    var lines=['[미유 성향 질문 검토 · 문항 ${DRAFT_CONTENT_VERSION}]'];
    var dirName={A:'A. 30문항 유지, 읽는 범위를 좁히고 시범 응답부터',B:'B. 36~40문항으로 늘림',C:'C. 관점을 9~10개로 줄임'};
    lines.push('전체 방향: '+(state.dir?dirName[state.dir]:'아직 정하지 않음'));
    ['fix','drop','ok'].forEach(function(k){
      var list=ITEMS.filter(function(i){return state.marks[i.id]===k;});
      lines.push('');
      lines.push(LABEL[k]+' ('+list.length+')');
      list.forEach(function(i){lines.push('- '+i.id+' '+i.topic+(state.notes[i.id]?' — '+state.notes[i.id]:''));});
    });
    var rest=ITEMS.filter(function(i){return !state.marks[i.id];});
    lines.push('');
    lines.push('아직 안 본 것 ('+rest.length+'): '+(rest.map(function(i){return i.id;}).join(', ')||'없음'));
    var withNote=rest.filter(function(i){return state.notes[i.id];});
    withNote.forEach(function(i){lines.push('- '+i.id+' 메모: '+state.notes[i.id]);});
    if(state.overall){lines.push('');lines.push('전체 의견: '+state.overall);}
    return lines.join('\\n');
  }
  function renderMemo(){
    var c={ok:0,fix:0,drop:0};
    ITEMS.forEach(function(i){var m=state.marks[i.id];if(m)c[m]++;});
    var rest=ITEMS.length-c.ok-c.fix-c.drop;
    document.getElementById('memo-summary').innerHTML='<p><b>괜찮음 '+c.ok+'</b> · <b>고쳐야 함 '+c.fix+'</b> · <b>빼기 '+c.drop+'</b> · 아직 안 본 것 '+rest+' (전체 '+ITEMS.length+'문항)</p>';
    document.getElementById('memo-text').value=memoText();
    document.getElementById('overall').value=state.overall;
    ['a','b','c'].forEach(function(k){document.getElementById('dir-'+k).checked=state.dir===k.toUpperCase();});
    document.getElementById('dir-none').checked=!state.dir;
  }
  document.getElementById('overall').addEventListener('input',function(e){state.overall=e.target.value;save();document.getElementById('memo-text').value=memoText();});
  [].slice.call(document.querySelectorAll('input[name=dir]')).forEach(function(r){r.addEventListener('change',function(){state.dir=r.value;save();document.getElementById('memo-text').value=memoText();});});
  document.getElementById('copy-btn').addEventListener('click',function(){
    var ta=document.getElementById('memo-text');
    var st=document.getElementById('copy-status');
    ta.value=memoText();
    function fallback(){ta.focus();ta.select();st.textContent='글을 선택해 두었어요. 직접 복사(Ctrl+C)해 주세요.';}
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(ta.value).then(function(){st.textContent='복사했어요. 채팅에 붙여넣어 주세요.';},fallback);}
      else fallback();
    }catch(e){fallback();}
  });
  document.getElementById('clear-btn').addEventListener('click',function(){
    var b=document.getElementById('clear-btn');
    if(b.getAttribute('data-armed')!=='1'){b.setAttribute('data-armed','1');b.textContent='한 번 더 누르면 모두 지웁니다';return;}
    state={marks:{},notes:{},overall:'',dir:''};save();applyMarks();renderMemo();
    ITEMS.forEach(function(i){var n=document.getElementById('note-'+i.id);if(n)n.value='';});
    b.removeAttribute('data-armed');b.textContent='표시 모두 지우기';
  });
  applyMarks();
})();
`;

const BODY = `<div class="wrap">
<header>
  <h1>미유 성향 질문 검토</h1>
  <p class="sub">기질 · 성격 · 가까운 관계를 영역별로 따로 보는 상황형 ${DRAFT_ITEMS.length}문항 (초안)</p>
  <p class="status"><b>초안 · 검토 전 · 검사 화면에 적용하지 않았습니다.</b> 공식 MBTI · TCI · 애착검사의 문항을 가져오지 않고 새로 썼습니다. 결과는 "지금 응답에서 나타난 경향"이며 진단이나 평생 유형이 아닙니다. 문항 ${DRAFT_CONTENT_VERSION} · 채점 ${DRAFT_SCORING_VERSION}</p>
</header>
<nav class="tabs" role="tablist" aria-label="검토 화면">
  <button type="button" class="tab" role="tab" data-tab="items" aria-selected="true">문항 ${DRAFT_ITEMS.length}개</button>
  <button type="button" class="tab" role="tab" data-tab="scoring" aria-selected="false">채점 방식</button>
  <button type="button" class="tab" role="tab" data-tab="views" aria-selected="false">관점 ${PERSPECTIVE_IDS.length}개</button>
  <button type="button" class="tab" role="tab" data-tab="limits" aria-selected="false">부족한 점</button>
  <button type="button" class="tab" role="tab" data-tab="memo" aria-selected="false">검토 메모</button>
</nav>
<section class="panel" id="panel-items">${itemsTab()}</section>
<section class="panel" id="panel-scoring" hidden>${scoringTab()}</section>
<section class="panel" id="panel-views" hidden>${viewsTab()}</section>
<section class="panel" id="panel-limits" hidden>${limitsTab()}</section>
<section class="panel" id="panel-memo" hidden>${memoTab()}</section>
</div>`;

const TITLE = "미유 성향 질문 검토";
const fragment = `<title>${TITLE}</title>\n<style>${CSS}</style>\n${BODY}\n<script>${SCRIPT}</script>\n`;
const standalone = `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="robots" content="noindex">\n<title>${TITLE}</title>\n<style>${CSS}</style>\n</head>\n<body>\n${BODY}\n<script>${SCRIPT}</script>\n</body>\n</html>\n`;

const args = process.argv.slice(2);
const fragIdx = args.indexOf("--fragment");
if (fragIdx >= 0) {
  writeFileSync(args[fragIdx + 1], fragment);
  console.log(`게시용 조각을 ${args[fragIdx + 1]}에 썼습니다 (${fragment.length.toLocaleString("ko-KR")}자).`);
} else {
  writeFileSync(new URL("../docs/assessment-review.html", import.meta.url), standalone);
  console.log(`docs/assessment-review.html을 썼습니다 (${standalone.length.toLocaleString("ko-KR")}자).`);
}
