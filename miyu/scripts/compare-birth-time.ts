// 출생 시각을 모를 때(시주 없이 세 기둥)와 알 때의 근거 비교 — 같은 출생정보(가상 날짜)로 근거 목록을 만들어 어떤 근거가 같고 · 달라지고 · 없어지는지 세고,
// 시주를 모르면 오행 · 십성의 "없음"이 얼마나 자주 시주 때문에 뒤집히는지를 날짜 × 12시진으로 직접 센다(운영자 2026-10-17: "세 기둥 기준의 없음을 사주 전체에 없다고 말하면 안 된다"를 숫자로 확인).
// 호출하지 않는다(순수 계산). 가정: 출생 시각이 12시진에 고르게 분포한다 · 엔진 기본 설정(`defaultPolicy`)으로 센 값이며 실제 이용자의 분포가 아니다.
// 사용: node scripts/compare-birth-time.ts [--write]   → docs/birth-time-unknown-v1.md
import { writeFileSync } from "node:fs";
import { buildPersonas } from "../lib/report/ai/compare-personas.ts";
import { buildEvidence } from "../lib/report/ai/generator.ts";
import { story7Evidence } from "../lib/report/reading/story7-evidence.ts";
import { STORY7_SECTIONS } from "../lib/report/reading/story7-plan.ts";
import { FIVE_ELEMENTS, type FiveElement, type SajuOk } from "../lib/saju/engine.ts";
import { fortifyOf } from "../lib/saju/interpret/fortune.ts";
import { analyzeStructure, GROUP_OF, type Group } from "../lib/saju/interpret/structure.ts";
import { calculateSaju } from "../lib/saju/manseryeok-engine.ts";

const write = process.argv.includes("--write");
const REF = { year: 2026, month: 10 };
const pct = (a: number, b: number) => (b === 0 ? "—" : `${((a / b) * 100).toFixed(1)}%`);

const compute = (y: number, m: number, d: number, time: string | null, gender: "male" | "female"): SajuOk | null => {
  const r = calculateSaju({ year: y, month: m, day: d, calendar: "solar", isLeapMonth: false, birthTime: time, gender });
  return r.status === "ok" ? (r as SajuOk) : null;
};

// ───── 1. 같은 출생정보 · 시각 있음 / 모름 근거 비교 ─────
const FIXTURE = { year: 1990, month: 5, day: 17, gender: "female" as const, time: "10:30" };
const base = buildPersonas(1)[0].input;
const inputOf = (saju: SajuOk) => ({ ...base, saju, gender: FIXTURE.gender });
const withTime = compute(FIXTURE.year, FIXTURE.month, FIXTURE.day, FIXTURE.time, FIXTURE.gender)!;
const noTime = compute(FIXTURE.year, FIXTURE.month, FIXTURE.day, null, FIXTURE.gender)!;
const evWith = buildEvidence(inputOf(withTime), REF, { fortune: true }).filter((e) => e.source === "saju");
const evNo = buildEvidence(inputOf(noTime), REF, { fortune: true }).filter((e) => e.source === "saju");
const mapWith = new Map(evWith.map((e) => [e.id, e]));
const mapNo = new Map(evNo.map((e) => [e.id, e]));
const ids = [...new Set([...mapWith.keys(), ...mapNo.keys()])];
const same: string[] = [];
const changed: string[] = [];
const onlyWith: string[] = [];
const onlyNo: string[] = [];
for (const id of ids) {
  const a = mapWith.get(id);
  const b = mapNo.get(id);
  if (a && b) (a.fact === b.fact && a.strength === b.strength && !!a.uncertain === !!b.uncertain ? same : changed).push(id);
  else if (a) onlyWith.push(id);
  else onlyNo.push(id);
}

// ───── 2. 장별로 쓸 사주 근거 수 ─────
const sectionRows = (() => {
  const a = story7Evidence(buildEvidence(inputOf(withTime), REF, { fortune: true }));
  const b = story7Evidence(buildEvidence(inputOf(noTime), REF, { fortune: true }));
  return STORY7_SECTIONS.map((s) => ({ no: s.no, title: s.title, withN: a.saju[s.no].length, noN: b.saju[s.no].length }));
})();

// ───── 3. 날짜 × 12시진으로 센 "시주 때문에 뒤집히는 정도" ─────
const HOURS = ["00:30", "02:00", "04:00", "06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"];
const GROUPS: Group[] = ["비겁", "식상", "재성", "관성", "인성"];
const groupCounts = (s: SajuOk) => {
  const c: Record<Group, number> = { 비겁: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 };
  for (const p of s.pillars) for (const tg of [p.tenGod.stem, p.tenGod.branch]) {
    const g = GROUP_OF[tg];
    if (g) c[g] += 1;
  }
  return c;
};
const strengthOf = (s: SajuOk) => analyzeStructure({ dayMaster: s.dayMaster.stem, pillars: s.pillars.map((p) => ({ key: p.key, stem: p.stem, branch: p.branch })) }).strength.candidate;

let nCases = 0;
let elemNone3 = 0; // 세 기둥에 없는 오행(날짜 × 시진 × 오행) 수
let elemNoneFlip = 0; // 그 가운데 시주를 알면 생기는 수
let anyNone3 = 0; // 세 기둥에 없는 오행이 하나라도 있는 경우
let anyNoneFlip = 0; // 그 가운데 시주를 알면 그중 하나 이상이 생기는 경우
let groupNone3 = 0;
let groupNoneFlip = 0;
let fortifySame = 0;
let strengthSame = 0;
let strengthDecided3 = 0;
let strengthDecidedSame = 0;
let pillarsSame = 0;
let pillarsDiffNoted = 0; // 연 · 월 · 일주가 달라졌는데 엔진이 "절기 당일 · 경계 · 자시 관법"으로 알린(notes) 경우
const start = Date.UTC(1950, 0, 3);
const end = Date.UTC(2008, 11, 31);
for (let t = start, n = 0; t <= end; t += 7 * 86400000, n++) {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const gender = n % 2 ? "male" : "female";
  const no = compute(y, m, day, null, gender);
  if (!no) continue;
  for (const h of HOURS) {
    const full = compute(y, m, day, h, gender);
    if (!full || full.pillars.length !== 4) continue;
    nCases++;
    // 연 · 월 · 일주는 시각 유무와 같다
    if (["year", "month", "day"].every((k) => { const a = no.pillars.find((p) => p.key === k)!; const b = full.pillars.find((p) => p.key === k)!; return a.stem === b.stem && a.branch === b.branch; })) pillarsSame++;
    else if (no.notes.some((x) => x.kind === "jeolgi-day" || x.kind === "near-boundary" || x.kind === "jasi-school")) pillarsDiffNoted++;
    const zero = FIVE_ELEMENTS.filter((e: FiveElement) => no.elementCounts[e] === 0);
    elemNone3 += zero.length;
    const flipped = zero.filter((e) => full.elementCounts[e] > 0);
    elemNoneFlip += flipped.length;
    if (zero.length > 0) {
      anyNone3++;
      if (flipped.length > 0) anyNoneFlip++;
    }
    const g3 = groupCounts(no);
    const gf = groupCounts(full);
    for (const g of GROUPS) if (g3[g] === 0) {
      groupNone3++;
      if (gf[g] > 0) groupNoneFlip++;
    }
    if (fortifyOf(no).primary.element === fortifyOf(full).primary.element) fortifySame++;
    const s3 = strengthOf(no);
    const sf = strengthOf(full);
    if (s3 === sf) strengthSame++;
    if (s3 !== "갈림") {
      strengthDecided3++;
      if (s3 === sf) strengthDecidedSame++;
    }
  }
}

const L: string[] = [];
const push = (s = "") => L.push(s);
push("# 출생 시각을 모를 때의 풀이 범위 (2026-10-17)");
push();
push("> `node scripts/compare-birth-time.ts --write`가 만든 문서입니다(호출하지 않는 순수 계산). 사주아이 결과지의 이름 · 생년월일은 이 문서 · 저장소 어디에도 쓰지 않았고, 아래 비교는 가상 날짜와 가상 인물만 씁니다.");
push("> 운영자 지시(2026-10-17): 출생시간을 몰라도 7개 대주제를 모두 풀이하되, 시주가 있어야 아는 것은 확정하지 않는다. **사주아이의 결과는 계산의 정답이 아니라 구조를 참고한 사례**이고, 만세력과 십성 대응은 이 저장소의 시험이 독립적으로 대조한다(5장).");
push();
push("## 1. 시주가 있을 때와 모를 때, 무엇이 같고 무엇이 달라지나");
push();
push("| 구분 | 시각을 알 때 | 시각을 모를 때 | 어떻게 다루나 |");
push("| --- | --- | --- | --- |");
push("| 연주 · 월주 · 일주 | 계산 | **거의 같음** — 절기가 바뀌는 날 · 경계 · 자시 관법에서는 시각에 따라 달라질 수 있다(엔진이 notes로 알리고 그 기둥의 근거는 uncertain으로 표시해 해석에 쓰지 않는다, 비율은 2장) | 그대로 읽되 uncertain은 쓰지 않는다 |");
push("| 일간 · 일주 · 월령(월지) · 월주의 십성 · 배우자 자리(일지) · 년주 · 월주의 육친 대응 | 읽음 | **같음**(위 경계 경우만 예외) | 그대로 읽는다 |");
push("| 대운(성별을 입력했을 때) | 계산 | 같음(월주 · 절입 기준) | 그대로 읽는다 |");
push("| 오행 개수 | 8글자(천간 4 + 지지 4, 지장간 제외) | **6글자**(세 기둥, 지장간 제외) | 없음 · 적음은 \"세 기둥 기준\"으로만 말한다(검사가 확인) |");
push("| 십성 분포 | 일간을 뺀 7자리 | **5자리** | 없는 쪽은 \"세 기둥 기준, 시주에 있을 수 있음\"으로만 말한다 |");
push("| 지장간 | 네 지지 | **세 지지**(시지 없음) | 지장간은 개수에 넣지 않고 별도 근거(`saju.structure.hidden`)로만 쓴다 |");
push("| 강약 후보(월령 · 뿌리 · 세력) | 세 요소 | 월령은 같음 · 뿌리는 시지 제외 · 세력은 5자리 | 후보로만 두고 근거 강도를 weak로 낮추며 \"신강 · 신약\"으로 부르지 않는다 |");
push("| 조후 후보 | 월지의 계절(겨울 · 여름만) | 같음(개수는 세 기둥) | 계절 판단은 같고 개수 설명에 세 기둥 기준을 붙인다 |");
push("| 개운 보완 후보 | 8글자 개수 기준 | 6글자 개수 기준 | 후보로 가볍게 전하고 weak로 낮춘다 — 시주를 알면 달라질 수 있다고 한 문장 곁들인다 |");
push("| 시주 풀이(자녀와 이어지는 자리 · 말년 · 시주의 십성) | (읽는 규칙 없음) | **읽지 않음** | 자녀 · 말년 · 시주 언급을 검사가 막는다 |");
push();
push(`### 같은 출생정보(가상: ${FIXTURE.year}-${FIXTURE.month}-${FIXTURE.day} ${FIXTURE.gender === "female" ? "여성" : "남성"}, 시각 ${FIXTURE.time} 대 모름)로 만든 사주 근거 목록`);
push();
push(`- 시각 ${FIXTURE.time}: 사주 근거 ${evWith.length}개 · 시각 모름: ${evNo.length}개`);
push(`- **그대로 같은 근거 ${same.length}개**: ${same.join(", ")}`);
push(`- **내용이 달라진 근거 ${changed.length}개**(같은 ID, 문장 · 강도가 다름): ${changed.join(", ") || "없음"}`);
push(`- 시각이 있을 때만 있는 근거 ${onlyWith.length}개: ${onlyWith.join(", ") || "없음"}`);
push(`- 시각을 모를 때만 있는 근거 ${onlyNo.length}개: ${onlyNo.join(", ") || "없음"}`);
push();
push("### 장별로 쓸 수 있는 사주 근거 수(코드가 장에 나눠 주는 근거 개수)");
push();
push("| 장 | 시각 있음 | 시각 모름 |");
push("| --- | --- | --- |");
for (const r of sectionRows) push(`| ${r.no} ${r.title} | ${r.withN} | ${r.noN} |`);
push();
push("→ 7번 장은 자기 근거가 없고 앞 장을 엮는 장이라 0이 정상이다. 나머지 장은 시각을 몰라도 쓸 사주 근거가 비지 않는다 — 시주가 없다고 장을 비우지 않는다.");
push();
push("## 2. 시주를 모르면 \"없음\"이 얼마나 자주 뒤집히나(직접 센 값)");
push();
push(`> 가정: 1950~2008년의 날짜(7일마다 ${Math.round(((end - start) / 86400000 / 7))}개 · 성별 번갈아) × 12시진(출생 시각이 12시진에 고르게 분포한다고 가정) = ${nCases.toLocaleString("ko-KR")}가지. 엔진 기본 설정으로 센 값이며 실제 이용자 분포가 아니다.`);
push();
push("| 질문 | 값 |");
push("| --- | --- |");
push(`| 연 · 월 · 일주가 시각 유무와 같은 경우 | ${pct(pillarsSame, nCases)} (${pillarsSame.toLocaleString("ko-KR")} / ${nCases.toLocaleString("ko-KR")}) — 나머지 ${(nCases - pillarsSame).toLocaleString("ko-KR")}가지 가운데 ${pillarsDiffNoted.toLocaleString("ko-KR")}가지는 절기가 바뀌는 날 · 경계 · 자시 관법이라 엔진이 \"시각에 따라 달라질 수 있다\"고 notes로 알린 경우 |`);
push(`| 세 기둥에서 오행이 하나 이상 \"없는\" 경우 | ${pct(anyNone3, nCases)} |`);
push(`| 그 가운데 시주를 알면 **없던 오행 중 하나 이상이 생기는** 경우 | **${pct(anyNoneFlip, anyNone3)}** |`);
push(`| 세 기둥에서 \"없는\" 오행(날짜 × 시진 × 오행) 가운데 시주를 알면 생기는 몫 | **${pct(elemNoneFlip, elemNone3)}** |`);
push(`| 세 기둥에서 \"없는\" 십성 갈래 가운데 시주를 알면 생기는 몫 | **${pct(groupNoneFlip, groupNone3)}** |`);
push(`| 개운 보완 후보 1순위가 시주를 알아도 같은 경우 | ${pct(fortifySame, nCases)} |`);
push(`| 강약 후보가 시주를 알아도 같은 경우(전체) | ${pct(strengthSame, nCases)} |`);
push(`| 강약 후보가 \"갈림\"이 아닌 한쪽이었던 경우(세 기둥) | ${pct(strengthDecided3, nCases)} · 그 가운데 시주를 알아도 같은 몫 ${pct(strengthDecidedSame, strengthDecided3)} |`);
push();
push("이 숫자가 지시문 · 검사 · 근거 문장에 반영된 이유: 세 기둥에서 \"없다\"고 읽힌 오행의 상당수는 시주(두 글자)를 알면 생기므로, 세 기둥의 \"없음\"을 \"사주 전체에 없다\"로 쓰면 틀릴 가능성이 높다. 그래서 근거 문장에 세 기둥 기준을 적고(`saju.element.*.none` · `saju.tengod.*.none` · `saju.sipsung` · `saju.career` · `saju.wealth` · `saju.fortify`), 글에서 없음 · 적음을 말하는 문장은 범위를 같은 문장이나 바로 앞 문장에 밝히게 검사한다(`hour-scope.ts`).");
push();
push("## 3. 지장간 포함 여부와 신강 · 신약 · 조후 판단의 근거(코드가 쓰는 기준)");
push();
push("| 항목 | 이 코드의 기준 | 근거 ID | 한계 |");
push("| --- | --- | --- | --- |");
push("| 오행 개수 | 천간 + 지지의 글자 자체(**지장간 제외**). 지지의 오행은 정기(본기)의 오행 | `saju.fortify` · `saju.element.*` | 지장간까지 세는 학파와 숫자가 달라진다 |");
push("| 십성 분포 | 일간을 뺀 천간 · 지지(지지는 **정기** 십성). 지장간 십성은 세지 않는다 | `saju.sipsung` · `saju.tengod.*` | 지장간 십성을 따로 보는 풀이는 별도 근거 `saju.structure.hidden`에만 있다 |");
push("| 지장간 | 위키백과 '지장간' 표와 대조한 통용 표(여기 · 중기 · 정기), 정기의 십성이 엔진의 지지 십성과 12 × 10 모두 일치(시험) | `saju.structure.hidden` | 학파에 따라 일부 달리 쓰는 표기가 있을 수 있다 |");
push("| 월령(득령 · 실령) | 월지 정기가 일간과 같은 오행(비겁) 또는 일간을 생하는 오행(인성)이면 득령, 아니면 실령 | `saju.structure.month` | 월주가 절기 경계에 걸리면 uncertain으로 해석에 쓰지 않는다 |");
push("| 강약 후보 | 월령 · 뿌리 · 세력 세 요소의 방향 기록 — 두 요소 이상이 같은 쪽이고 반대쪽이 없을 때만 한쪽, 아니면 \"갈림\"(점수 아님) | `saju.structure.strength` | **전통 해석의 단순화 초안이며 원전과 대조하지 못했고 전문가 검토 전이다.** 시각을 모르면 세력이 한 기둥 빠져 후보로만 두고 신강 · 신약으로 부르지 않는다 |");
push("| 조후 후보 | 겨울(해 · 자 · 축)이면 화, 여름(사 · 오 · 미)이면 수라는 가장 큰 원칙만. 봄 · 가을 · 일간별 세부표(궁통보감 계열)는 쓰지 않는다 | `saju.structure.johu` | 일간 · 달별 세부 조후는 계산하지 않았다 |");
push("| 격국 · 용신 · 희신 · 기신 · 신살 · 십이운성 | **계산하지 않는다** — 근거 문장에 이 낱말이 없고, 글에 쓰면 검사가 막는다 | (없음) | 운영자 결정: 전문가 검토 뒤 판정 가능한 범위만 |");
push();
push("## 4. 이번에 코드로 바꾼 것");
push();
push("1. **근거**: 시각을 모를 때만 `saju.hour.unknown`(strong)을 더한다 — 세 기둥(여섯 글자) 기준임 · 시주에 따라 달라질 수 있는 근거 · 그대로 읽을 수 있는 근거 · 읽지 않는 풀이를 적는다(`lib/saju/interpret/hour-unknown.ts`).");
push("2. **근거 문장**: 없음 · 적음 · 후보를 말하는 근거(오행 · 십성 · 재물 · 일 · 개운 · 강약)에 \"세 기둥(시주 제외) 기준\"을 적고, 시주에 따라 달라질 수 있는 근거(없음 · 개운 · 강약)는 보조 근거(weak)로 낮췄다. 새로운 계산 규칙은 없다.");
push("3. **검사**: 시각을 모르면 (가) 없다 · 적다는 말에 범위를 밝히게 하고 (나) 시주 풀이(자녀 · 말년)와 신강 · 신약을 막는다. **시각과 상관없이** 가족에게 있었던 일을 지난 사실처럼 쓰는 것도 막는다(`hour-scope.ts`).");
push("4. **지시문 0.4**: 시각을 모를 때도 7개 장을 끝까지 쓰고(재물 · 연애 · 직업 · 인간관계 · 개운을 비우지 않는다) 사주에서 읽은 모습과 응답이 같은지 · 다른지를 설명하게 했다.");
push("5. **조립**: 시각을 모르면 1번 장 아래에 코드가 \"세 기둥으로 읽었어요\" 안내를 한 번 붙인다.");
push("6. 실행 스크립트 `scripts/run-own-story.ts`에 `--birth-time-unknown`(같은 입력에서 출생 시각만 비움)을 더했다.");
push();
push("## 5. 독립 대조(사주아이 결과를 정답으로 쓰지 않았다)");
push();
push("`lib/report/reading/hour-unknown.test.ts`가 아래를 이 저장소 코드와 **따로** 확인한다.");
push();
push("- **십성**: 일간 10 × 천간 10 = 100가지를 오행의 생극과 음양에서 직접 정한 값과 비교(엔진의 표를 보지 않는다) — 전부 일치. 운영자가 전달한 사례의 일간(辛) 기준 병 정관 · 을 편재 · 계 식신 · 경 겁재도 이 규칙으로 확인했다.");
push("- **지지 십성**: 12지지의 정기 천간으로 정한 십성과 엔진의 지지 십성이 12 × 10가지 모두 일치(申 정기 庚 겁재 · 卯 乙 편재 · 子 癸 식신 포함).");
push("- **월주 천간**: 오호둔 규칙(년간 → 인월 천간)으로 직접 구한 월간이 엔진의 월주와 4개 연도 × 12달 모두 일치(절기 이후인 매달 20일 기준), 이 날들은 시각이 없어도 연 · 월 · 일주가 시각이 있을 때와 같다. 절기 당일 · 경계는 위 2장의 표대로 달라질 수 있어 uncertain으로 알린다.");
push("- **운영자 전달 사례의 날짜**(음력 → 양력 · 일주 · 월주 · 년주)는 개발 도구로 대조했고 일치했다 — 날짜 · 명식은 개인정보라 이 문서에 싣지 않는다(대화로만 보고).");
push("- 사주아이의 \"신약\" 강조 · 자녀 성향 · 가족사 · 자산관리 · 해외 거주 같은 구체 결론은 **미유가 따라 하지 않는 것**이다 — 시주가 없으면 근거로 만들 수 없고 검사가 막는다.");
push();
push("## 6. 하지 못한 것 · 운영자 확인 항목");
push();
push("- **실제 AI로 시각 미상 글을 한 번도 생성하지 못했다.** 이 문서의 검사 · 시험은 모의 작성기 · 단위 시험이며 실제 AI의 글이 범위를 지키는지는 운영자가 글을 읽고 판단한다(`docs/real-ai-run-guide.md` 9장).");
push("- 오행 · 십성 · 강약 · 개운의 판정 기준은 전통 해석을 단순화한 초안이며 전문가 검토 전이다(`docs/saju-rules.md` 규칙 이력).");
push("- 시주 신살 · 자녀궁 · 시주의 십성 해석은 계산하지 않았고 만들지 않았다(근거 검증 없이 새 규칙을 만들지 않는다). 시각을 아는 사람의 자녀 · 말년 풀이도 지금은 없다.");
push("- 무료 리포트(코드가 쓴 고정 문구 `lib/saju/plain.ts` · 보완 아이템 `items.ts`)의 \"기운이 적어요\"는 시각을 모를 때 세 기둥 기준이라는 말이 없다 — AI 글은 아니라서 이번에 바꾸지 않았다(별도 작업, 운영자 확인).");
push("- 시주 시간대(12시진)와 자시 처리(야자시 · 조자시)는 엔진 기본 설정을 썼다(`docs/operator-decisions.md`).");

const out = `${L.join("\n")}\n`;
if (write) {
  writeFileSync("docs/birth-time-unknown-v1.md", out);
  console.log("docs/birth-time-unknown-v1.md를 만들었습니다.");
} else console.log(out);
