// 미유 성향 질문 "풀어보기" 화면 — 채점 방향 · 관점 이름 · 문항의 의도(운영자 설명)가 화면과 코드에 들어 있지 않다.
// 처음 풀 때 점수 방향이 보이면 답이 유도되므로, 이 화면에는 질문과 선택지 글만 싣는다 (take-page.test.ts가 검사한다).
// 흐름: 소개 → 한 문항씩 풀기(답 · 문항별 시간만 기록) → 완료 → 검토 모드(문항별 의견: 정답이 뻔했나 · 둘 다 나 같았나 · 뜻을 몰랐나 · 고르고 싶은 답이 없었나
// + 인터뷰 칸 세 개: 질문을 어떻게 이해했나 · 왜 이 답을 골랐나 · 같은 행동을 다른 이유로도 하나). 시범 인터뷰(docs/assessment-pilot-protocol.md)는 이 칸을 같이 보며 묻는다.
// 채점 방향을 본 뒤의 두 번째 검토는 별도의 검토 화면(render-assessment-review.ts)에서 한다.
// 표시 · 답은 보는 사람의 브라우저에만 저장된다. 이 화면은 결과를 계산하지 않는다 (가상이 아닌 실제 응답을 점수로 바꾸는 것은 시범 단계에서).
import { DRAFT_CONTENT_VERSION, DRAFT_ITEMS, DOMAIN_LABEL, NA_OPTION_TEXT } from "./situational-draft.ts";

export const TAKE_TITLE = "미유 성향 질문 풀어보기";

/** 화면에 싣는 자료 — 문항 번호 · 이름 · 영역 · 질문 · 선택지 글뿐이다 (점수 방향 · 의도 없음) */
export function takeData() {
  return {
    version: DRAFT_CONTENT_VERSION,
    na: NA_OPTION_TEXT,
    items: DRAFT_ITEMS.map((i) => ({
      id: i.id,
      topic: i.topic,
      domain: DOMAIN_LABEL[i.domain],
      stem: i.stem,
      options: i.options.map((o) => ({ id: o.id, text: o.text })),
    })),
  };
}

const CSS = `
:root{--bg:#ffffff;--mist:#f5f6f8;--line:#e2e5e9;--line-strong:#c9ced5;--ink:#1d2125;--ink-2:#464d55;--ink-3:#5f666e;--accent:#1e4b8f;--accent-soft:#edf2f9;--danger:#b3261e;--danger-soft:#fbeeed;--font:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14171a;--mist:#1b1f24;--line:#2b3138;--line-strong:#3c444d;--ink:#e8eaed;--ink-2:#c3c8ce;--ink-3:#9aa1a9;--accent:#8fb3e6;--accent-soft:#1c2736;--danger:#f0988f;--danger-soft:#33201f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#14171a;--mist:#1b1f24;--line:#2b3138;--line-strong:#3c444d;--ink:#e8eaed;--ink-2:#c3c8ce;--ink-3:#9aa1a9;--accent:#8fb3e6;--accent-soft:#1c2736;--danger:#f0988f;--danger-soft:#33201f;color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-padding-top:4rem}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font);font-size:15px;line-height:1.65;word-break:keep-all;overflow-wrap:break-word}
[hidden]{display:none!important}
.wrap{max-width:40rem;margin-inline:auto;padding-inline:16px;padding-block:20px 56px}
h1{font-size:1.45rem;line-height:1.3;margin:0 0 6px;text-wrap:balance}
h2{font-size:1.1rem;line-height:1.4;margin:0 0 10px;text-wrap:balance}
p,li{text-wrap:pretty}
.sub{margin:0;color:var(--ink-2)}
.status{margin:12px 0 0;padding:10px 12px;background:var(--mist);border-left:3px solid var(--accent);color:var(--ink-2);font-size:.9rem}
.screen{margin-top:22px}
.rules{margin:10px 0 18px;padding-left:1.2rem;display:grid;gap:8px}
button{font:inherit}
.btn{appearance:none;border:1px solid var(--line-strong);border-radius:4px;background:var(--bg);color:var(--ink-2);font-size:.95rem;padding:10px 18px;cursor:pointer}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--bg);font-weight:700}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:18px}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.count{display:flex;justify-content:space-between;align-items:baseline;font-size:.88rem;color:var(--ink-3)}
.track{height:4px;background:var(--line);border-radius:2px;margin:6px 0 20px;overflow:hidden}
.bar{height:100%;background:var(--accent);width:0}
.stem{font-size:1.08rem;font-weight:600;margin:0 0 14px}
.choices{display:grid;gap:10px}
.choice{display:grid;grid-template-columns:1.8rem minmax(0,1fr);gap:8px;align-items:start;padding:12px 14px;border:1px solid var(--line-strong);border-radius:4px;background:var(--bg);cursor:pointer;min-height:48px}
.choice input{position:absolute;opacity:0;pointer-events:none}
.choice.sel{border-color:var(--accent);background:var(--accent-soft);box-shadow:inset 3px 0 0 var(--accent)}
.choice:focus-within{outline:2px solid var(--accent);outline-offset:2px}
.choice.na{border-style:dashed;color:var(--ink-2)}
.letter{font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums}
.ctext{display:block}
.note-box{margin-top:14px;padding:12px 14px;background:var(--mist);border-radius:4px;font-size:.92rem;color:var(--ink-2)}
.tabs{display:flex;gap:2px;margin:16px 0 0;border-bottom:1px solid var(--line)}
.tab{appearance:none;border:0;background:none;color:var(--ink-3);font-weight:600;padding:10px 12px;cursor:pointer;border-bottom:2px solid transparent}
.tab[aria-selected="true"]{color:var(--accent);border-bottom-color:var(--accent)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0}
.chip{appearance:none;border:1px solid var(--line-strong);background:var(--bg);color:var(--ink-2);font-size:.88rem;padding:5px 12px;border-radius:4px;cursor:pointer}
.chip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--bg)}
.ritem{padding:18px 0;border-bottom:1px solid var(--line)}
.ritem[data-mark="ok"]{box-shadow:inset 3px 0 0 var(--accent);padding-left:12px}
.ritem[data-mark="fix"]{box-shadow:inset 3px 0 0 var(--danger);padding-left:12px}
.ritem[data-mark="drop"]{box-shadow:inset 3px 0 0 var(--ink-3);padding-left:12px}
.rhead{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.qid{font-weight:700;font-variant-numeric:tabular-nums}
.topic{color:var(--ink-2)}
.dom{font-size:.8rem;color:var(--ink-3);border:1px solid var(--line-strong);padding:0 6px;border-radius:3px}
.secs{margin-left:auto;font-size:.82rem;color:var(--ink-3)}
.rstem{font-weight:600;margin:8px 0}
.ropts{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:6px}
.ropt{display:grid;grid-template-columns:1.8rem minmax(0,1fr);gap:8px;padding:8px 10px;background:var(--mist);border-radius:4px;font-size:.92rem}
.ropt.mine{background:var(--accent-soft);box-shadow:inset 3px 0 0 var(--accent)}
.ropt .tag{font-size:.78rem;color:var(--accent);font-weight:700;margin-left:6px}
.flags{display:grid;gap:8px;margin:10px 0}
.flag{display:flex;gap:8px;align-items:flex-start;font-size:.92rem;cursor:pointer}
.flag input{margin-top:5px}
.pick{margin:4px 0 4px 1.7rem;display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:.86rem;color:var(--ink-3)}
.pickbtn{appearance:none;border:1px solid var(--line-strong);background:var(--bg);color:var(--ink-2);min-width:2.4rem;padding:3px 10px;border-radius:4px;cursor:pointer;font-weight:700}
.pickbtn[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--bg)}
.seg{display:inline-flex;border:1px solid var(--line-strong);border-radius:4px;overflow:hidden}
.seg button{appearance:none;border:0;border-right:1px solid var(--line-strong);background:var(--bg);color:var(--ink-2);font-size:.88rem;padding:6px 12px;cursor:pointer}
.seg button:last-child{border-right:0}
.seg button[aria-pressed="true"][data-mark="ok"]{background:var(--accent);color:var(--bg)}
.seg button[aria-pressed="true"][data-mark="fix"]{background:var(--danger);color:var(--bg)}
.seg button[aria-pressed="true"][data-mark="drop"]{background:var(--ink-3);color:var(--bg)}
.rline{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-top:8px}
.talk{margin:12px 0 4px;padding:10px 12px;background:var(--mist);border-radius:4px}
.talk .lab{margin:8px 0 4px}
.talk .lab:first-child{margin-top:0}
.note.wide{display:block;width:100%}
.note{flex:1 1 14rem;min-width:0;font:inherit;font-size:.9rem;padding:6px 8px;border:1px solid var(--line-strong);border-radius:4px;background:var(--bg);color:var(--ink)}
textarea{width:100%;font:inherit;font-size:.9rem;padding:8px;border:1px solid var(--line-strong);border-radius:4px;background:var(--bg);color:var(--ink);resize:vertical}
.summary{margin:12px 0;padding:12px 14px;background:var(--mist);border-radius:4px;font-size:.92rem}
.summary p{margin:2px 0}
.small{font-size:.84rem;color:var(--ink-3)}
.lab{font-size:.84rem;color:var(--ink-3);display:block;margin:12px 0 4px}
.inline{display:flex;gap:8px;align-items:center;font-size:.92rem;margin:8px 0}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`;

const BODY = `<div class="wrap">
<header>
  <h1>${TAKE_TITLE}</h1>
  <p class="sub">상황형 ${DRAFT_ITEMS.length}문항 · 약 8~10분 · 개발 중인 초안</p>
</header>

<section class="screen" id="screen-intro">
  <p class="status"><b>채점 방향과 운영자 설명이 없는 화면입니다.</b> 답이 유도되지 않게 질문과 선택지만 보여 드립니다. 결과도 보여 주지 않아요. 다 풀고 나면 문항마다 느낀 점을 남기는 검토 모드로 넘어갑니다.</p>
  <ul class="rules">
    <li><b>정답이 없습니다.</b> 지금의 나라면 그 상황에서 가장 먼저 할 행동에 가장 가까운 것을 고르세요. 좋아 보이는 답이 아니라 실제로 하는 쪽을 고릅니다.</li>
    <li>겪어 본 적이 없거나 상황에 따라 너무 달라서 고르기 어려우면, 맨 아래 <b>"겪어 본 적이 없거나…"</b>를 고르세요. 억지로 고르지 않아도 됩니다.</li>
    <li>한 문항씩 풀고, 앞 문항으로 돌아가 답을 고칠 수 있습니다. 걸린 시간은 문항별로만 기록합니다.</li>
    <li>공식 심리검사나 진단이 아닙니다. 결과가 아니라 <b>문항이 자연스러운지</b>를 확인하기 위한 초안입니다.</li>
    <li>답과 의견은 이 브라우저에만 저장되고, 다른 곳으로 보내지 않습니다.</li>
  </ul>
  <div class="btn-row"><button type="button" class="btn primary" id="start-btn">시작하기</button><span class="small" id="resume-note" hidden></span></div>
</section>

<section class="screen" id="screen-take" hidden>
  <div class="count"><span id="take-count"></span></div>
  <div class="track"><div class="bar" id="take-bar"></div></div>
  <p class="stem" id="take-stem"></p>
  <div class="choices" id="take-options" role="radiogroup" aria-label="선택지"></div>
  <div class="btn-row"><button type="button" class="btn" id="take-prev">이전</button><button type="button" class="btn primary" id="take-next" disabled>다음</button></div>
</section>

<section class="screen" id="screen-done" hidden>
  <h2>응답을 마쳤어요</h2>
  <div class="summary" id="done-summary"></div>
  <p>이제 <b>검토 모드</b>에서 문항을 다시 읽으며 느낀 점을 남겨 주세요. 이 단계에서도 채점 방향은 보이지 않습니다.</p>
  <div class="btn-row"><button type="button" class="btn primary" id="to-review">검토 모드로 가기</button><button type="button" class="btn" id="edit-answers">답 고치러 가기</button></div>
</section>

<section class="screen" id="screen-review" hidden>
  <h2>검토 모드 — 문항별 첫인상 의견</h2>
  <p class="note-box">문항을 다시 읽고, 해당하는 것만 표시해 주세요. 표시할 게 없는 문항은 비워 두면 됩니다.<br>
  <b>정답이 뻔해 보였어요</b>: 어느 선택지가 "좋은 답"처럼 보여서 솔직하게 고르기 어려웠다 · <b>둘 이상이 다 나 같았어요</b>: 선택지 둘 이상이 모두 나에게 해당했다 · <b>뜻을 모르겠어요</b>: 질문이나 선택지의 말이 어렵거나 애매했다 · <b>고르고 싶은 답이 없었어요</b>: 내 행동이 어떤 선택지와도 달랐다.<br>
  문항마다 있는 세 칸(질문을 어떻게 이해했는지 · 왜 이 답을 골랐는지 · 같은 행동을 다른 이유로도 할 수 있는지)은 <b>같은 답이어도 이유가 사람마다 다를 수 있는지</b>를 보기 위한 것입니다. 적고 싶은 것만 적으세요. 실명 · 연락처는 적지 마세요.</p>
  <div class="tabs" role="tablist" aria-label="검토 모드">
    <button type="button" class="tab" role="tab" id="rtab-items" data-rtab="items" aria-selected="true">문항별 의견</button>
    <button type="button" class="tab" role="tab" id="rtab-memo" data-rtab="memo" aria-selected="false">복사할 글</button>
  </div>
  <div id="rpanel-items">
    <div class="chips" role="group" aria-label="보기"><button type="button" class="chip" data-rfilter="all" aria-pressed="true">전체</button><button type="button" class="chip" data-rfilter="touched" aria-pressed="false">표시한 것 <span id="touched-count">0</span></button><button type="button" class="chip" data-rfilter="rest" aria-pressed="false">아직 안 본 것 <span id="rest-count">0</span></button></div>
    <div id="review-list"></div>
  </div>
  <div id="rpanel-memo" hidden>
    <div class="summary" id="memo-summary" aria-live="polite"></div>
    <label class="inline" for="include-code"><input type="checkbox" id="include-code" checked> 내가 고른 답(응답 코드)과 걸린 시간을 글에 포함하기</label>
    <p class="small">응답 코드는 내 답을 뜻합니다. 보내고 싶지 않으면 위 칸을 끄세요.</p>
    <label class="lab" for="overall">전체 의견 (선택)</label>
    <textarea id="overall" rows="4" maxlength="1500" placeholder="예: 관계 영역 문항이 연애 상황에만 치우친 느낌이에요."></textarea>
    <div class="btn-row"><button type="button" class="btn primary" id="copy-btn">검토 내용 복사</button><span class="small" id="copy-status" role="status"></span></div>
    <label class="lab" for="memo-text">복사될 글</label>
    <textarea id="memo-text" rows="16" readonly></textarea>
    <div class="btn-row"><button type="button" class="btn" id="redo-btn">처음부터 다시 풀기</button></div>
  </div>
</section>
</div>`;

function script() {
  return `
(function(){
  var KEY='miyu-assessment-take-v1';
  var DATA=${JSON.stringify(takeData())};
  var ITEMS=DATA.items;
  var state={stage:'intro',idx:0,answers:{},times:{},review:{},overall:'',code:true};
  try{var raw=localStorage.getItem(KEY);if(raw){var p=JSON.parse(raw);if(p&&typeof p==='object'&&p.version===DATA.version){state=Object.assign(state,p.state||{});}}}catch(e){}
  function save(){try{localStorage.setItem(KEY,JSON.stringify({version:DATA.version,state:state}));}catch(e){}}
  function $(id){return document.getElementById(id);}
  function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  var SCREENS=['intro','take','done','review'];
  function show(name){SCREENS.forEach(function(s){$('screen-'+s).hidden=s!==name;});state.stage=name;save();window.scrollTo(0,0);}
  function answered(){return ITEMS.filter(function(i){return state.answers[i.id];}).length;}
  function fmt(ms){var s=Math.round(ms/1000);var m=Math.floor(s/60);return m>0?m+'분 '+(s%60)+'초':s+'초';}
  function totalMs(){return ITEMS.reduce(function(n,i){return n+(state.times[i.id]||0);},0);}
  var LETTERS=['a','b','c','d'];

  // ── 풀기 ──
  var shownAt=0;
  function flush(){var it=ITEMS[state.idx];if(!it||!shownAt)return;var d=Date.now()-shownAt;shownAt=0;if(d>0)state.times[it.id]=(state.times[it.id]||0)+Math.min(d,120000);save();}
  document.addEventListener('visibilitychange',function(){if(document.hidden&&state.stage==='take')flush();else if(!document.hidden&&state.stage==='take'&&!shownAt)shownAt=Date.now();});
  function renderTake(){
    var it=ITEMS[state.idx];
    $('take-count').textContent='문항 '+(state.idx+1)+' / '+ITEMS.length;
    $('take-bar').style.width=(answered()/ITEMS.length*100)+'%';
    $('take-stem').textContent=it.stem;
    var box=$('take-options');box.textContent='';
    it.options.concat([{id:'na',text:DATA.na}]).forEach(function(o){
      var label=el('label','choice'+(o.id==='na'?' na':''));
      var input=document.createElement('input');input.type='radio';input.name='take-opt';input.value=o.id;input.id='take-opt-'+it.id+'-'+o.id;
      input.checked=state.answers[it.id]===o.id;
      if(input.checked)label.classList.add('sel');
      input.addEventListener('change',function(){
        state.answers[it.id]=o.id;save();
        [].slice.call(box.children).forEach(function(c){c.classList.remove('sel');});
        label.classList.add('sel');updateNext();
        $('take-bar').style.width=(answered()/ITEMS.length*100)+'%';
      });
      label.appendChild(input);
      label.appendChild(el('span','letter',o.id==='na'?'—':o.id.toUpperCase()));
      label.appendChild(el('span','ctext',o.text));
      box.appendChild(label);
    });
    $('take-prev').disabled=state.idx===0;
    updateNext();
    shownAt=Date.now();
  }
  function updateNext(){
    var it=ITEMS[state.idx];
    var b=$('take-next');
    b.disabled=!state.answers[it.id];
    b.textContent=state.idx===ITEMS.length-1?'응답 마치기':'다음';
  }
  $('take-next').addEventListener('click',function(){
    flush();
    if(state.idx<ITEMS.length-1){state.idx++;save();renderTake();window.scrollTo(0,0);return;}
    var firstEmpty=ITEMS.findIndex(function(i){return !state.answers[i.id];});
    if(firstEmpty>=0){state.idx=firstEmpty;save();renderTake();return;}
    renderDone();show('done');
  });
  $('take-prev').addEventListener('click',function(){flush();if(state.idx>0){state.idx--;save();renderTake();window.scrollTo(0,0);}});
  $('start-btn').addEventListener('click',function(){show('take');renderTake();});

  // ── 완료 ──
  function naCount(){return ITEMS.filter(function(i){return state.answers[i.id]==='na';}).length;}
  function renderDone(){
    var box=$('done-summary');box.textContent='';
    box.appendChild(el('p','', ITEMS.length+'문항에 모두 답했어요.'));
    box.appendChild(el('p','', '걸린 시간 '+fmt(totalMs())+' · "겪어 본 적이 없거나…"를 고른 문항 '+naCount()+'개'));
  }
  $('to-review').addEventListener('click',function(){buildReview();show('review');});
  $('edit-answers').addEventListener('click',function(){state.idx=0;save();show('take');renderTake();});

  // ── 검토 모드 ──
  function rv(id){if(!state.review[id])state.review[id]={obvious:false,obviousPick:'',multi:false,multiPicks:[],unclear:false,nothing:false,mark:'',note:'',understood:'',why:'',other:''};var r=state.review[id];if(r.understood===undefined){r.understood='';r.why='';r.other='';}return r;}
  function touched(id){var r=state.review[id];return !!(r&&(r.obvious||r.multi||r.unclear||r.nothing||r.mark||r.note||r.understood||r.why||r.other));}
  var rfilter='all';
  function optText(it,id){if(id==='na')return DATA.na;var o=it.options.filter(function(x){return x.id===id;})[0];return o?o.text:'';}
  function buildReview(){
    var list=$('review-list');list.textContent='';
    ITEMS.forEach(function(it){
      var r=rv(it.id);
      var art=el('article','ritem');art.id='r-'+it.id;art.setAttribute('data-id',it.id);
      var head=el('div','rhead');
      head.appendChild(el('span','qid',it.id));head.appendChild(el('span','topic',it.topic));head.appendChild(el('span','dom',it.domain));
      head.appendChild(el('span','secs','걸린 시간 '+fmt(state.times[it.id]||0)));
      art.appendChild(head);
      art.appendChild(el('p','rstem',it.stem));
      var ol=el('ol','ropts');
      it.options.concat([{id:'na',text:DATA.na}]).forEach(function(o){
        var li=el('li','ropt'+(state.answers[it.id]===o.id?' mine':''));
        li.appendChild(el('span','letter',o.id==='na'?'—':o.id.toUpperCase()));
        var t=el('span','',o.text);
        if(state.answers[it.id]===o.id)t.appendChild(el('span','tag','내가 고른 답'));
        li.appendChild(t);ol.appendChild(li);
      });
      art.appendChild(ol);
      var flags=el('div','flags');
      function flag(key,label){
        var wrap=el('div','');
        var lab=el('label','flag');
        var cb=document.createElement('input');cb.type='checkbox';cb.id='f-'+it.id+'-'+key;cb.checked=!!r[key];
        lab.appendChild(cb);lab.appendChild(el('span','',label));
        wrap.appendChild(lab);
        cb.addEventListener('change',function(){r[key]=cb.checked;save();syncPicks();refresh();});
        flags.appendChild(wrap);
        return wrap;
      }
      var wObvious=flag('obvious','정답이 뻔해 보였어요');
      var pickO=el('div','pick');pickO.appendChild(el('span','','어느 선택지가 "좋은 답"처럼 보였나요?'));
      LETTERS.forEach(function(l){var b=el('button','pickbtn',l.toUpperCase());b.type='button';b.id='po-'+it.id+'-'+l;b.addEventListener('click',function(){r.obviousPick=r.obviousPick===l?'':l;save();syncPicks();refresh();});pickO.appendChild(b);});
      wObvious.appendChild(pickO);
      var wMulti=flag('multi','둘 이상이 다 나 같았어요');
      var pickM=el('div','pick');pickM.appendChild(el('span','','나 같았던 선택지 (여러 개)'));
      LETTERS.forEach(function(l){var b=el('button','pickbtn',l.toUpperCase());b.type='button';b.id='pm-'+it.id+'-'+l;b.addEventListener('click',function(){var i=r.multiPicks.indexOf(l);if(i>=0)r.multiPicks.splice(i,1);else r.multiPicks.push(l);r.multiPicks.sort();save();syncPicks();refresh();});pickM.appendChild(b);});
      wMulti.appendChild(pickM);
      flag('unclear','뜻을 모르겠어요 (메모에 어느 부분인지 적어 주세요)');
      flag('nothing','고르고 싶은 답이 없었어요');
      art.appendChild(flags);
      var talk=el('div','talk');
      [['understood','이 질문을 어떻게 이해했나요? (내 말로 한 줄)','예: 친구가 갑자기 부르면 내가 어떻게 하는지 묻는 것 같았어요'],['why','왜 이 답을 골랐나요?','예: 비슷한 일이 얼마 전에 있었어요'],['other','같은 행동을 다른 이유로도 할 수 있나요? 그렇다면 어떤 이유인가요?','예: 나는 약속 때문에 한 것이지만, 걱정돼서 하는 사람도 있을 것 같아요']].forEach(function(f){
        var lab=el('label','lab',f[1]);var inp=document.createElement('input');inp.type='text';inp.className='note wide';inp.maxLength=200;inp.id='rt-'+it.id+'-'+f[0];inp.placeholder=f[2];inp.value=r[f[0]]||'';inp.autocomplete='off';inp.setAttribute('aria-label',f[1]);
        inp.addEventListener('input',function(){r[f[0]]=inp.value;save();refreshCounts();});
        lab.htmlFor=inp.id;talk.appendChild(lab);talk.appendChild(inp);
      });
      art.appendChild(talk);
      var line=el('div','rline');
      var seg=el('div','seg');
      [['ok','괜찮음'],['fix','고쳐야 함'],['drop','빼기']].forEach(function(m){
        var b=el('button','',m[1]);b.type='button';b.setAttribute('data-mark',m[0]);b.id='rm-'+it.id+'-'+m[0];b.setAttribute('aria-pressed',String(r.mark===m[0]));
        b.addEventListener('click',function(){r.mark=r.mark===m[0]?'':m[0];save();syncPicks();refresh();});
        seg.appendChild(b);
      });
      line.appendChild(seg);
      var note=document.createElement('input');note.type='text';note.className='note';note.id='rn-'+it.id;note.maxLength=200;note.placeholder='한 줄 메모 (예: B가 너무 길어요)';note.value=r.note||'';note.autocomplete='off';
      note.addEventListener('input',function(){r.note=note.value;save();refreshCounts();});
      line.appendChild(note);
      art.appendChild(line);
      list.appendChild(art);
      function syncPicks(){
        pickO.hidden=!r.obvious;pickM.hidden=!r.multi;
        LETTERS.forEach(function(l){
          $('po-'+it.id+'-'+l).setAttribute('aria-pressed',String(r.obviousPick===l));
          $('pm-'+it.id+'-'+l).setAttribute('aria-pressed',String(r.multiPicks.indexOf(l)>=0));
        });
        ['ok','fix','drop'].forEach(function(k){$('rm-'+it.id+'-'+k).setAttribute('aria-pressed',String(r.mark===k));});
        if(r.mark)art.setAttribute('data-mark',r.mark);else art.removeAttribute('data-mark');
      }
      syncPicks();
    });
    refresh();
  }
  function refreshCounts(){
    var t=ITEMS.filter(function(i){return touched(i.id);}).length;
    $('touched-count').textContent=String(t);
    $('rest-count').textContent=String(ITEMS.length-t);
  }
  function refresh(){
    refreshCounts();
    ITEMS.forEach(function(it){
      var show=rfilter==='all'||(rfilter==='touched'&&touched(it.id))||(rfilter==='rest'&&!touched(it.id));
      $('r-'+it.id).hidden=!show;
    });
  }
  document.addEventListener('click',function(e){
    var c=e.target.closest&&e.target.closest('.chip');
    if(c){rfilter=c.getAttribute('data-rfilter');[].slice.call(document.querySelectorAll('.chip')).forEach(function(x){x.setAttribute('aria-pressed',String(x===c));});refresh();}
  });
  function showRtab(name){
    ['items','memo'].forEach(function(n){$('rtab-'+n).setAttribute('aria-selected',String(n===name));$('rpanel-'+n).hidden=n!==name;});
    if(name==='memo')renderMemo();
    window.scrollTo(0,0);
  }
  $('rtab-items').addEventListener('click',function(){showRtab('items');});
  $('rtab-memo').addEventListener('click',function(){showRtab('memo');});

  // ── 복사할 글 ──
  function memoText(){
    var L=['[미유 성향 질문 풀어보기 · 첫인상 검토 · 문항 '+DATA.version+']'];
    L.push('방향: A안은 최종 검사가 아니라 시범용(30문항 유지, 관점 · 12유형은 시범 응답을 보고 조정). 이 글은 문항을 고치기 위한 의견과 질문을 이해한 방식입니다.');
    L.push('답한 문항 '+answered()+'/'+ITEMS.length+' · 걸린 시간 '+fmt(totalMs())+' · 해당 없음 '+naCount()+'개');
    if(state.code){
      L.push('');
      L.push('응답 코드(문항=답, 걸린 초): '+ITEMS.map(function(i){return i.id+'='+(state.answers[i.id]||'-')+'('+Math.round((state.times[i.id]||0)/1000)+')';}).join(' '));
    }
    function group(title,pred,fmtItem){
      var list=ITEMS.filter(function(i){return pred(rv(i.id));});
      L.push('');L.push(title+' ('+list.length+')');
      list.forEach(function(i){var r=rv(i.id);L.push('- '+i.id+' '+i.topic+fmtItem(r)+(r.note?' — '+r.note:''));});
    }
    group('정답이 뻔해 보인 문항',function(r){return r.obvious;},function(r){return r.obviousPick?' (좋은 답처럼 보인 선택지 '+r.obviousPick.toUpperCase()+')':'';});
    group('둘 이상이 다 나 같았던 문항',function(r){return r.multi;},function(r){return r.multiPicks.length?' (나 같았던 선택지 '+r.multiPicks.map(function(x){return x.toUpperCase();}).join('·')+')':'';});
    group('뜻을 모르겠던 문항',function(r){return r.unclear;},function(){return '';});
    group('고르고 싶은 답이 없던 문항',function(r){return r.nothing;},function(){return '';});
    group('고쳐야 함',function(r){return r.mark==='fix';},function(){return '';});
    group('빼기',function(r){return r.mark==='drop';},function(){return '';});
    var talked=ITEMS.filter(function(i){var r=rv(i.id);return r.understood||r.why||r.other;});
    L.push('');L.push('질문을 이해한 방식 · 고른 이유 ('+talked.length+')');
    talked.forEach(function(i){var r=rv(i.id);var parts=[];if(r.understood)parts.push('이해: '+r.understood);if(r.why)parts.push('고른 이유: '+r.why);if(r.other)parts.push('다른 이유: '+r.other);L.push('- '+i.id+' '+i.topic+' — '+parts.join(' / '));});
    var ok=ITEMS.filter(function(i){return rv(i.id).mark==='ok';}).map(function(i){return i.id;});
    L.push('');L.push('괜찮음 ('+ok.length+'): '+(ok.join(', ')||'없음'));
    var noteOnly=ITEMS.filter(function(i){var r=rv(i.id);return r.note&&!r.obvious&&!r.multi&&!r.unclear&&!r.nothing&&r.mark!=='fix'&&r.mark!=='drop';});
    if(noteOnly.length){L.push('');L.push('그 밖의 메모');noteOnly.forEach(function(i){L.push('- '+i.id+' '+i.topic+' — '+rv(i.id).note);});}
    if(state.overall){L.push('');L.push('전체 의견: '+state.overall);}
    return L.join('\\n');
  }
  function renderMemo(){
    var t=ITEMS.filter(function(i){return touched(i.id);}).length;
    var s=$('memo-summary');s.textContent='';
    s.appendChild(el('p','','의견을 남긴 문항 '+t+' / '+ITEMS.length));
    $('include-code').checked=state.code;
    $('overall').value=state.overall;
    $('memo-text').value=memoText();
  }
  $('include-code').addEventListener('change',function(e){state.code=e.target.checked;save();$('memo-text').value=memoText();});
  $('overall').addEventListener('input',function(e){state.overall=e.target.value;save();$('memo-text').value=memoText();});
  $('copy-btn').addEventListener('click',function(){
    var ta=$('memo-text');var st=$('copy-status');ta.value=memoText();
    function fallback(){ta.focus();ta.select();st.textContent='글을 선택해 두었어요. 직접 복사(Ctrl+C)해 주세요.';}
    try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(ta.value).then(function(){st.textContent='복사했어요. 채팅에 붙여넣어 주세요.';},fallback);}else fallback();}catch(e){fallback();}
  });
  $('redo-btn').addEventListener('click',function(){
    var b=$('redo-btn');
    if(b.getAttribute('data-armed')!=='1'){b.setAttribute('data-armed','1');b.textContent='한 번 더 누르면 답과 의견이 모두 지워집니다';return;}
    state={stage:'intro',idx:0,answers:{},times:{},review:{},overall:'',code:true};save();
    b.removeAttribute('data-armed');b.textContent='처음부터 다시 풀기';
    $('review-list').textContent='';show('intro');initIntro();
  });

  // ── 시작 ──
  function initIntro(){
    var n=answered();
    var note=$('resume-note');
    if(n>0&&n<ITEMS.length){$('start-btn').textContent='이어서 풀기';note.hidden=false;note.textContent=n+'문항까지 답했어요.';}
    else{$('start-btn').textContent='시작하기';note.hidden=true;}
  }
  initIntro();
  if(state.stage==='take'&&answered()<ITEMS.length){show('take');renderTake();}
  else if(state.stage==='done'||(state.stage==='take'&&answered()===ITEMS.length)){renderDone();show('done');}
  else if(state.stage==='review'&&answered()===ITEMS.length){buildReview();show('review');}
  else{show('intro');}
})();
`;
}

export function takeFragment(): string {
  return `<title>${TAKE_TITLE}</title>\n<style>${CSS}</style>\n${BODY}\n<script>${script()}</script>\n`;
}

export function takeStandalone(): string {
  return `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="robots" content="noindex">\n<title>${TAKE_TITLE}</title>\n<style>${CSS}</style>\n</head>\n<body>\n${BODY}\n<script>${script()}</script>\n</body>\n</html>\n`;
}
