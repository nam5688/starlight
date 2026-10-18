// 7개 대주제(story-7) 제품 경로 — 지시문 · 형식 검사 · 조립 · 생성기 · 채팅 · 내보내기를 확인한다. 실제 AI는 부르지 않는다(모의 작성기만).
// 이 시험이 통과해도 실제 AI의 글이 통과하거나 읽을 만하다는 뜻이 아니다 — 실제 AI로는 아직 한 번도 시험하지 못했다(검증되지 않음).
import assert from "node:assert/strict";
import test from "node:test";
import { REPORT_GENERATION } from "../../config/product.ts";
import type { SajuOk } from "../../saju/engine.ts";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import { ELEMENT_FORTUNE, fortifyCandidatesOf, fortifyPrimaryOf, fortuneEvidence } from "../../saju/interpret/fortune.ts";
import { buildPersonas } from "../ai/compare-personas.ts";
import { buildEvidence, createAiReportGenerator } from "../ai/generator.ts";
import { createMockModel } from "../ai/mock-model.ts";
import { renderReadingMarkdown } from "./render-text.ts";
import { assembleStory7 } from "./story7-assemble.ts";
import { story7Evidence } from "./story7-evidence.ts";
import { composeMockStory7 } from "./story7-mock-model.ts";
import { STORY7_FORMAT, STORY7_PROMPT_VERSION, STORY7_SECTIONS } from "./story7-plan.ts";
import { buildStory7UserMessage, STORY7_SYSTEM_PROMPT } from "./story7-prompt.ts";
import { normalizeStory7Draft, story7Paragraphs, story7VoiceReport, validateStory7Draft, visibleStory7Texts } from "./story7-validate.ts";
import { availableRooms, startRoom } from "./talk-room.ts";
import { buildTalkModel } from "./talk.ts";
import { isReadingReport, isStory7Report, isStoryReport, type Story7DraftV1 } from "./types.ts";

const PERSONAS = buildPersonas(10);
const P01 = PERSONAS[0];
const REF = { year: 2026, month: 10 };
const NOW = new Date("2026-10-17T09:00:00+09:00");
const P01_EVIDENCE = buildEvidence(P01.input, REF, { fortune: true });

const mockDraft = (evidence = P01_EVIDENCE, context = P01.input.context): Story7DraftV1 => composeMockStory7(buildStory7UserMessage(evidence, "2026-10-17", context));
const clone = <T,>(x: T): T => structuredClone(x);
const errorsOf = (mutate: (d: Story7DraftV1) => void, evidence = P01_EVIDENCE, hasContext = Boolean(P01.input.context)) => {
  const d = clone(mockDraft(evidence));
  mutate(d);
  const r = validateStory7Draft(d, evidence, { hasContext });
  return r.ok ? [] : r.errors;
};
/** 경고(WARN) — 저장을 막지 않는 읽기 쉬운 정도의 알림(BLOCK이 있어도 같이 돌려준다) */
const warningsOf = (mutate: (d: Story7DraftV1) => void, evidence = P01_EVIDENCE, hasContext = Boolean(P01.input.context)) => {
  const d = clone(mockDraft(evidence));
  mutate(d);
  return validateStory7Draft(d, evidence, { hasContext }).warnings;
};
const section = (d: Story7DraftV1, no: number) => d.sections.find((s) => s.no === no)!;
/** 모의 문단 하나를 실제 글처럼 바꿔 끼운다(검사가 어떤 말에 걸리는지 보려고) */
const setPara = (d: Story7DraftV1, no: number, text: string, at = 0) => {
  const s = section(d, no);
  if (s.parts) s.parts[0].paragraphs[at] = text;
  else s.paragraphs![at] = text;
};
const PAD = "그 장의 첫 모습을 일상의 말로 풀어 쓰고 있는 자리라서 글자 수는 충분히 채워 둡니다 그래서 길이 검사는 걸리지 않아요";

// ───── 구성 · 지시문 · 입력 ─────

test("지시문: 7개 대주제와 운영자 확정(재물 항상 · 7번 B안 · 조언 2~3가지)에 더해 사주 중심 방향(2026-10-17)이 들어 있고 영역별 이야기 지시문과 구분된다", () => {
  for (const s of STORY7_SECTIONS) assert.ok(STORY7_SYSTEM_PROMPT.includes(s.title), s.title);
  assert.match(STORY7_SYSTEM_PROMPT, /재물 소제목은 모든 리포트에 있다/);
  assert.match(STORY7_SYSTEM_PROMPT, /고민이 없으면.*고민을 지어내지 않고/);
  assert.match(STORY7_SYSTEM_PROMPT, /2~3개/);
  assert.match(STORY7_SYSTEM_PROMPT, /계속 ~라면 ~/);
  assert.equal(STORY7_PROMPT_VERSION, "story-7-prompt-0.5");
  assert.equal(STORY7_FORMAT, "story-7");
  // 사주 중심 방향: 사주풀이가 중심 · 응답이 부족해도 풀이를 비우지 않음 · 전통 개운법 허용 · 반복의 기준 · 계산하지 않은 판정 금지
  assert.match(STORY7_SYSTEM_PROMPT, /\[미유의 방향 — 사주풀이가 중심이고/);
  assert.match(STORY7_SYSTEM_PROMPT, /응답 근거가 부족하다는 이유로 풀이를 비우지 않는다/);
  assert.match(STORY7_SYSTEM_PROMPT, /반복의 기준은 낱말 횟수가 아니다/);
  assert.match(STORY7_SYSTEM_PROMPT, /앞 장에서 이미 말한 결론을 새 정보 없이 되풀이하는 것이다/);
  assert.match(STORY7_SYSTEM_PROMPT, /\[개운법 — 전통 오행 대응으로 색 · 방향 · 숫자 · 장소를 전한다/);
  assert.match(STORY7_SYSTEM_PROMPT, /계산하지 않은 것을 계산한 것처럼 쓰지 않는다/);
  assert.match(STORY7_SYSTEM_PROMPT, /가족은 "전통에서는 ~로 읽어요 · ~기 쉬워요"로만 쓴다/);
  // 사주 풀이 재료 여섯 근거 이름이 지시문에 있다
  for (const id of ["saju.sipsung", "saju.career", "saju.wealth", "saju.kin", "saju.partner", "saju.fortify"]) assert.ok(STORY7_SYSTEM_PROMPT.includes(id), id);
  // 0.2까지의 전면 금지 문장은 없다(전통 해석 · 개운법 허용으로 바뀌었다)
  for (const old of ["가족 이야기는 쓰지 않고", "귀인 · 사람복 · 인복은 신살을 계산하지 않았으므로", "행운의 숫자 · 행운의 날), 특정 상품", "직업 이름 대신 필요한 권한", "한 낱말(예: 정리 · 확인 · 혼자 · 거리)이 여러 장에"]) assert.ok(!STORY7_SYSTEM_PROMPT.includes(old), `옛 문장이 남아 있다: ${old}`);
});

test("사용자 메시지: 장마다 배정된 사주 · 개인 근거를 담고, 입력한 MBTI는 1 · 3 · 5번에만, 고민은 있을 때만 넣는다", () => {
  const msg = buildStory7UserMessage(P01_EVIDENCE, "2026-10-17", null);
  const payload = JSON.parse(msg.slice(msg.indexOf("\n") + 1)) as { sections: { no: number; sajuEvidence: string[]; personalEvidence: string[] }[]; evidence: { id: string }[]; context?: unknown };
  assert.equal(payload.sections.length, 7);
  assert.equal(payload.context, undefined);
  const mine = story7Evidence(P01_EVIDENCE);
  for (const s of payload.sections) {
    assert.deepEqual(s.sajuEvidence, mine.saju[s.no]);
    assert.deepEqual(s.personalEvidence, mine.personal[s.no]);
  }
  assert.deepEqual(payload.sections.filter((s) => s.personalEvidence.includes("self.mbti")).map((s) => s.no), [1, 3, 5]);
  const withContext = buildStory7UserMessage(P01_EVIDENCE, "2026-10-17", { topic: "work", focusGuide: "일을 고르는 기준" } as never);
  assert.ok(JSON.parse(withContext.slice(withContext.indexOf("\n") + 1)).context);
});

// ───── 형식 검사 ─────

test("모의 작성기 초안은 가상 인물 10명 모두에서 형식 검사를 통과한다(검사와 지시문 · 근거 배정이 서로 어긋나지 않는다)", () => {
  for (const p of PERSONAS) {
    const ev = buildEvidence(p.input, REF, { fortune: true });
    const draft = composeMockStory7(buildStory7UserMessage(ev, "2026-10-17", p.input.context));
    const r = validateStory7Draft(draft, ev, { hasContext: Boolean(p.input.context) });
    assert.ok(r.ok, `${p.id}: ${r.ok ? "" : r.errors.slice(0, 3).join(" / ")}`);
  }
});

test("7개 장은 순서대로 모두 있어야 한다 — 빼거나 합치거나 순서를 바꾸면 막는다", () => {
  assert.ok(errorsOf((d) => (d.sections = d.sections.slice(0, 6))).some((e) => /sections: 7개|7개/.test(e)));
  assert.ok(errorsOf((d) => d.sections.reverse()).some((e) => /no가 1번이어야/.test(e)));
});

test("5번 일과 재물은 소제목 일 · 재물로 쓰고, 다른 장은 소제목을 쓰지 않는다", () => {
  assert.ok(errorsOf((d) => { section(d, 5).paragraphs = ["x"]; }).some((e) => /paragraphs가 아니라 소제목/.test(e)));
  assert.ok(errorsOf((d) => { section(d, 5).parts![1].title = "돈"; }).some((e) => /소제목이 "재물"/.test(e)));
  assert.ok(errorsOf((d) => { section(d, 3).parts = [{ title: "일", paragraphs: [] }]; }).some((e) => /소제목\(parts\)은 5번/.test(e)));
});

test("재물은 모든 리포트에 있다 — 돈 이야기가 비면 막고, 작성 과정 문장은 돈 이야기로 세지 않는다", () => {
  const empty = errorsOf((d) => setPara(d, 5, `${PAD} 재물 소제목인데도 돈과 관련된 낱말이 하나도 들어 있지 않은 글이에요.`.replace(/돈|재물/g, "것"), 0));
  // 모의 글의 재물 소제목은 parts[1]이다
  const noMoney = errorsOf((d) => { section(d, 5).parts![1].paragraphs[0] = `${PAD} 그저 평소처럼 지내는 모습이 이어질 수 있어요.`; });
  assert.ok(noMoney.some((e) => /재물 소제목에 돈 이야기가 없습니다/.test(e)), noMoney.join("\n"));
  const processOnly = errorsOf((d) => { section(d, 5).parts![1].paragraphs[0] = `${PAD} 이번 풀이에서는 재물은 근거가 약해 길게 풀지 않았어요 그래서 짧게 마칩니다.`; });
  assert.ok(processOnly.some((e) => /재물 소제목에 돈 이야기가 없습니다|작성 과정을 말하는 문장/.test(e)));
  assert.ok(Array.isArray(empty));
});

test("재물 소제목: 직접 묻지 않은 소비 · 저축 습관은 사실처럼 쓰지 않고 조건형 · 질문으로만 쓴다 · 재물운 판정도 막는다", () => {
  const fact = errorsOf((d) => { section(d, 5).parts![1].paragraphs[0] = `${PAD} 이 사람은 저축을 꼬박꼬박 하고 지출은 늘 줄여서 돈이 쌓이는 사람이에요.`; });
  assert.ok(fact.some((e) => /습관을 사실처럼 쓰지 않습니다/.test(e)), fact.join("\n"));
  const cond = errorsOf((d) => { section(d, 5).parts![1].paragraphs[0] = `${PAD} 큰 지출을 앞두면 이것저것 따져 보느라 결정이 늦어질 수 있어요 돈 앞에서의 선택이에요.`; });
  assert.ok(!cond.some((e) => /습관을 사실처럼/.test(e)), cond.join("\n"));
  const fate = errorsOf((d) => { section(d, 5).parts![1].paragraphs[0] = `${PAD} 큰 부자가 될 사주라서 돈 걱정은 평생 없어요.`; });
  assert.ok(fate.some((e) => /재물의 결과를 확정하는 말/.test(e)), fate.join("\n"));
  // 재물복 · 돈이 들어오고 나가는 양상은 전통 해석으로 쓸 수 있다(운영자 2026-10-17)
  const ok = errorsOf((d) => { section(d, 5).parts![1].paragraphs[0] = `${PAD} 재물복의 그릇은 큰 구조로 읽혀요 다만 같이 쓰고 나누는 돈이 많아 나가기 쉬운 길도 함께 있어요.`; });
  assert.ok(!ok.some((e) => /재물의 결과를 확정|습관을 사실처럼/.test(e)), ok.join("\n"));
});

test("4번: 가족 · 인복 · 귀인은 전통 해석으로 읽는 조건형까지 쓸 수 있고, 가족을 사실처럼 단정한 문장만 막는다 — 신살 이름은 계산하지 않았으므로 계속 막는다", () => {
  const fact = errorsOf((d) => setPara(d, 4, `${PAD} 부모님과의 관계에서도 비슷한 모습이 나타나요.`));
  assert.ok(fact.some((e) => /가족\("부모님"\) 이야기는 입력받은 것이 없으므로 사실처럼 쓰지 않습니다/.test(e)), fact.join("\n"));
  const tradition = errorsOf((d) => setPara(d, 4, `${PAD} 전통에서는 인성을 어머니와 윗사람으로 읽어서 윗사람의 도움이 천간에 드러난 구조로 봐요.`));
  assert.ok(!tradition.some((e) => /가족|귀인|인복/.test(e)), tradition.join("\n"));
  const conditional = errorsOf((d) => setPara(d, 4, `${PAD} 부모님과 거리를 두고 싶은 때는 서운함이 쌓이기 쉬울 수 있어요 그래서 먼저 말해 두면 좋아요.`));
  assert.ok(!conditional.some((e) => /가족\(/.test(e)), conditional.join("\n"));
  // 인복 · 귀인이라는 말 자체는 쓸 수 있다(도움을 주는 사람으로 풀어 쓴다)
  const luck = errorsOf((d) => setPara(d, 4, `${PAD} 도움을 주는 사람이 곁에 모이기 쉬운 인복이 있다고 읽혀요 귀인 같은 윗사람도 만날 수 있어요.`));
  assert.ok(!luck.some((e) => /귀인|인복|사람복/.test(e)), luck.join("\n"));
  // 계산하지 않은 신살 이름은 근거 목록에 없으므로 이 사람의 것으로 쓸 수 없다
  const sinsal = errorsOf((d) => setPara(d, 4, `${PAD} 천을귀인살이 있어서 윗사람의 도움을 받아요 백호살도 있어요.`));
  assert.ok(sinsal.some((e) => /근거 목록에 없는 판정/.test(e)), sinsal.join("\n"));
});

test("6번 개운: 보완 후보 1순위 기운의 방향 · 색 · 숫자 · 장소를 모두 말해야 하고, 근거(saju.fortify)를 달아야 하며, 다른 기운의 대응을 쓰면 막는다", () => {
  const el = fortifyPrimaryOf(P01_EVIDENCE)!;
  const f = ELEMENT_FORTUNE[el];
  assert.ok(el, "P01은 보완 후보 근거가 있다");
  const full = `${PAD} 이 사주에는 이 기운이 적어서 전통에서는 생활에서 보태 주면 균형이 맞는다고 읽어요 방향은 ${f.direction.replace(/\(.*\)/, "")} 쪽을 가까이 두고 ${f.colors[0]} 계열 소품을 쓰고 숫자는 ${f.numbers[0]}과 ${f.numbers[1]}을 가볍게 즐겨 쓰고 ${f.places[0]} 같은 곳에 머물러 보세요.`;
  const none = errorsOf((d) => { section(d, 6).paragraphs![1] = full; });
  assert.ok(!none.some((e) => /개운|saju\.fortify/.test(e)), none.join("\n"));
  // 빠진 것을 알려 준다
  const missing = errorsOf((d) => { section(d, 6).paragraphs![1] = `${PAD} 생활에서 가볍게 기운을 보태 보는 습관을 하나 정해 두면 마음이 한결 편해질 수 있어요.`; });
  assert.ok(missing.some((e) => /개운 풀이\(행운의 색 · 방향 · 숫자 · 장소\)에서 .*이\(가\) 빠졌습니다/.test(e)), missing.join("\n"));
  // 근거를 달지 않으면 알려 준다
  const uncited = errorsOf((d) => { section(d, 6).paragraphs![1] = full; section(d, 6).evidence = section(d, 6).evidence.filter((id) => id !== "saju.fortify"); });
  assert.ok(uncited.some((e) => /개운 풀이의 근거\(saju\.fortify\)를 달아 주세요/.test(e)), uncited.join("\n"));
  // 다른 기운의 대응을 쓰면 1순위 기운의 것이 빠진 것으로 알려 준다(임의 배정 방지)
  const other = (["목", "화", "토", "금", "수"] as const).find((e) => e !== el)!;
  const g = ELEMENT_FORTUNE[other];
  const wrong = errorsOf((d) => { section(d, 6).paragraphs![1] = `${PAD} 방향은 ${g.direction.replace(/\(.*\)/, "")} 쪽이고 ${g.colors[0]} 계열이고 숫자는 ${g.numbers[0]}이고 ${g.places[0]}가 좋다고 읽어요.`; });
  assert.ok(wrong.some((e) => /개운 풀이.*빠졌습니다/.test(e)), wrong.join("\n"));
  // 근거 목록에 보완 후보가 없으면(이전 형식 근거) 이 검사는 하지 않는다
  const noFortify = buildEvidence(P01.input, REF);
  assert.equal(fortifyPrimaryOf(noFortify), null);
});

test("6번 개운 — 보완 후보가 동점이면 한 후보의 대응을 모두 말하면 통과하고, 다른 후보만 말해도 통과하며, 하나를 1순위 · 최우선으로 정해 말하면 막는다(운영자 2026-10-18)", () => {
  const tieChart = calculateSaju({ year: 1980, month: 4, day: 14, calendar: "solar", isLeapMonth: false, birthTime: null, gender: "female" }) as SajuOk;
  const tie = fortuneEvidence(tieChart).find((e) => e.id === "saju.fortify")!;
  const evidence = P01_EVIDENCE.map((e) => (e.id === "saju.fortify" ? { ...e, fact: tie.fact, cue: tie.cue } : e));
  assert.deepEqual(fortifyCandidatesOf(evidence), ["목", "수"]);
  const say = (el: "목" | "수") => {
    const f = ELEMENT_FORTUNE[el];
    return `${PAD} 방향은 ${f.direction.replace(/\(.*\)/, "")} 쪽, ${f.colors[0]} 소품, 숫자 ${f.numbers[0]}과 ${f.numbers[1]}, ${f.places[0]} 같은 곳을 가볍게 해 보세요.`;
  };
  const fortifyErrors = (text: string) => errorsOf((d) => { section(d, 6).paragraphs![1] = text; }, evidence).filter((e) => /개운|saju\.fortify|동점/.test(e));
  // 첫 후보 · 둘째 후보 어느 쪽의 대응이든 네 가지를 모두 말하면 통과
  assert.deepEqual(fortifyErrors(say("목")), []);
  assert.deepEqual(fortifyErrors(say("수")), []);
  // 둘 다 소개해도 통과(한 기운은 네 가지, 다른 후보는 방향 · 색)
  assert.deepEqual(fortifyErrors(`${say("수")} 같은 수로 적은 목 기운은 동쪽과 초록 계열로 곁들여도 좋아요.`), []);
  // 어느 쪽도 네 가지를 채우지 못하면 후보 둘의 대응을 안내한다
  const partial = fortifyErrors(`${PAD} 방향은 북쪽이고 동쪽도 좋아요 색은 남색이고 초록도 좋아요.`);
  assert.ok(partial.some((e) => /보완 후보\(목 · 수\) 기운의 전통 대응을 그대로 쓰세요/.test(e)), partial.join("\n"));
  // 동점인 후보를 하나로 정해 말하면 막는다
  for (const verdict of ["수 기운이 최우선으로 필요한 기운이에요.", "목이 가장 필요한 기운이라 먼저 챙기세요.", "보완 후보 1순위는 수예요."]) {
    const e = fortifyErrors(`${say("수")} ${verdict}`);
    assert.ok(e.some((x) => /동점 후보라/.test(x)), `${verdict}: ${e.join("\n")}`);
  }
  // 하나뿐인 후보(동점이 아닐 때)에는 이 검사가 걸리지 않는다 — 예전 형식 그대로
  const el = fortifyPrimaryOf(P01_EVIDENCE)!;
  const f = ELEMENT_FORTUNE[el];
  const single = errorsOf((d) => { section(d, 6).paragraphs![1] = `${PAD} 방향은 ${f.direction.replace(/\(.*\)/, "")} 쪽, ${f.colors[0]} 소품, 숫자 ${f.numbers[0]}과 ${f.numbers[1]}, ${f.places[0]} 같은 곳으로 가볍게 보태 보세요.`; });
  assert.ok(!single.some((e) => /동점/.test(e)), single.join("\n"));
  // 지시문은 동점 소개를 알려 주고, 근거 문구가 만들던 특정 행동 예시는 싣지 않는다
  assert.match(STORY7_SYSTEM_PROMPT, /동점\(개수가 같아 우선순위를 가릴 수 없는 같은 후보\)으로 둘 이상 적혀 있으면/);
  assert.match(STORY7_SYSTEM_PROMPT, /첫 문장은 이 장의 핵심 사주풀이 결론/);
  assert.match(STORY7_SYSTEM_PROMPT, /같은 행동 조언\(같은 습관 · 같은 문장 정하기\)을 장마다 되풀이하지 않는다/);
  assert.doesNotMatch(STORY7_SYSTEM_PROMPT, /마감 시간 정하기|거절할 때 쓸 문장/);
});

test("전통 개운법 허용: 행운의 숫자 · 방향 · 색은 쓸 수 있고, 효과 · 결과를 보장하는 말과 액운 · 부적 · 행운의 날짜 · 복권 번호만 막는다", () => {
  const el = fortifyPrimaryOf(P01_EVIDENCE)!;
  const f = ELEMENT_FORTUNE[el];
  const base = (extra: string) => errorsOf((d) => { section(d, 6).paragraphs![1] = `${PAD} 방향은 ${f.direction.replace(/\(.*\)/, "")} 쪽, ${f.colors[0]} 소품, 행운의 숫자 ${f.numbers[0]}과 ${f.numbers[1]}, ${f.places[0]} 같은 곳을 가볍게 시도해 보세요 ${extra}`; });
  assert.deepEqual(base("전통의 상징이라 기분 환기로 곁들이면 좋아요."), []);
  for (const bad of ["이 색을 쓰면 반드시 재산이 늘어요.", "숫자를 쓰면 건강이 회복되는 것이 보장돼요.", "부적을 지니면 액운을 막아요.", "행운의 날을 골라 로또를 사 보세요.", "이 방향이면 틀림없이 운이 좋아져요."]) {
    assert.ok(base(bad).some((e) => /쓰지 않는 표현/.test(e)), bad);
  }
  // "효과를 보장하지 않아요" 같은 안내 문장은 막지 않는다
  assert.deepEqual(base("효과를 보장하지 않지만 가볍게 해 볼 수 있어요."), []);
});

test("없는 기운은 전통 해석 · 조건형이면 쓸 수 있고, 조건 없이 생활 기능의 결핍으로 단정한 문장만 막는다", () => {
  assert.ok(!errorsOf((d) => setPara(d, 2, `${PAD} 식상이 원국에 없으면 전통에서는 마음을 밖으로 풀 통로가 좁아지기 쉽다고 읽어요 그래서 말로 꺼내는 연습이 도움이 돼요.`)).some((e) => /생활 기능의 부족이나 원인/.test(e)));
  assert.ok(errorsOf((d) => setPara(d, 2, `${PAD} 수 기운이 없어서 쉬는 힘이 약해요.`)).some((e) => /생활 기능의 부족이나 원인/.test(e)));
});

test("사주 용어 한도: 한 문장 3개 · 한 문단 4개 · 첫 문단 2개를 넘으면 경고(WARN)만 한다 — 저장을 막지 않고 고쳐 쓰기도 부탁하지 않는다(운영자 정책 2026-10-17)", () => {
  // 한 문장에 4개 → 경고, 3개는 경고도 없다. BLOCK(errors)에는 들어가지 않는다
  const fourMutation = (d: Story7DraftV1) => setPara(d, 2, `${PAD} 일간(나를 나타내는 글자)과 오행(다섯 기운)과 십신(관계의 갈래)과 대운(10년 시기)을 함께 풀어요.`, 1);
  assert.ok(warningsOf(fourMutation).some((e) => /한 문장에 사주 용어가 4개/.test(e)), warningsOf(fourMutation).join("\n"));
  assert.ok(!errorsOf(fourMutation).some((e) => /사주 용어/.test(e)), "용어 개수는 BLOCK이 아니다");
  const three = (d: Story7DraftV1) => setPara(d, 2, `${PAD} 일간(나를 나타내는 글자)과 오행(다섯 기운)과 십신(관계의 갈래)을 함께 풀어요.`, 1);
  assert.ok(!warningsOf(three).some((e) => /한 문장에 사주 용어가/.test(e)), warningsOf(three).join("\n"));
  // 한 문단에 5개 → 경고
  const fiveMutation = (d: Story7DraftV1) => setPara(d, 2, `${PAD} 일간(나를 나타내는 글자)이 중심이에요. 오행(다섯 기운)도 있어요. 십신(관계의 갈래)도 있어요. 천간(위 글자)도 있어요. 지지(아래 글자)도 있어요.`, 1);
  assert.ok(warningsOf(fiveMutation).some((e) => /한 문단에 사주 용어가 5개/.test(e)), warningsOf(fiveMutation).join("\n"));
  assert.ok(!errorsOf(fiveMutation).some((e) => /사주 용어/.test(e)));
  // 첫 문단은 2개까지가 권장 — 넘으면 경고
  const first = (d: Story7DraftV1) => setPara(d, 1, `${PAD} 월령과 일간과 오행이 이 사람의 바탕이에요.`);
  assert.ok(warningsOf(first).some((e) => /첫 문단에 사주 용어\(.*\)가 3개/.test(e)), warningsOf(first).join("\n"));
  assert.ok(!errorsOf(first).some((e) => /첫 문단에 사주 용어/.test(e)));
  assert.ok(!warningsOf((d) => setPara(d, 1, `${PAD} 일간(나를 나타내는 글자)과 오행(다섯 기운)이 이 사람의 바탕이에요.`)).some((e) => /첫 문단에 사주 용어/.test(e)));
  // 설명 없는 용어도 경고다 — 그 용어를 쓴 문장이 근거에 없는 판정이면 그것은 여전히 BLOCK이다(아래)
  const plain = (d: Story7DraftV1) => setPara(d, 4, `${PAD} 재성이 두드러져서 돈의 길을 중요하게 읽어요.`);
  assert.ok(warningsOf(plain).some((e) => /설명 없는 사주 용어\(재성\)/.test(e)), warningsOf(plain).join("\n"));
  assert.ok(!errorsOf(plain).some((e) => /설명 없는 사주 용어/.test(e)), "용어 설명 누락은 BLOCK이 아니다");
  // 경고만 있는 글은 통과(ok)이고 경고가 함께 온다 — 통과가 판매 합격은 아니다
  const warnOnly = clone(mockDraft());
  setPara(warnOnly, 4, `${PAD} 재성이 두드러져서 돈의 길을 중요하게 읽어요.`);
  const r = validateStory7Draft(warnOnly, P01_EVIDENCE, { hasContext: Boolean(P01.input.context) });
  assert.ok(r.ok && r.warnings.length > 0, JSON.stringify(r.ok ? r.warnings : r.errors));
  // BLOCK로 남는 것: 근거 목록에 없는 판정(격국 · 용신) · 있는 근거를 쓰지 않는 척 하는 것 — 용어 설명을 붙여도 막는다
  const verdict = errorsOf((d) => setPara(d, 2, `${PAD} 이 사람의 용신은 수(물)로 읽혀요 그래서 물가에서 힘이 나요.`));
  assert.ok(verdict.some((e) => /근거 목록에 없는 판정\(용신\)/.test(e)), verdict.join("\n"));
});

test("문단은 4문장을 넘으면 경고(WARN)만 하고(6~7문장도 저장을 막지 않는다), 핵심 문장은 46자까지다(길이는 BLOCK)", () => {
  const s4 = "첫째 문장은 이렇게 쓰고 있어요. 둘째 문장은 이렇게 이어져요. 셋째 문장도 이어서 써요. 넷째 문장으로 마무리해요 그래서 길이는 충분해요.";
  assert.ok(!warningsOf((d) => setPara(d, 4, s4)).some((e) => /문장 \(/.test(e)));
  const s5 = (d: Story7DraftV1) => setPara(d, 4, `${s4} 다섯째 문장이 더 있어요.`);
  assert.ok(warningsOf(s5).some((e) => /5문장 \(4문장 이하로 묶어 주세요\)/.test(e)));
  assert.ok(!errorsOf(s5).some((e) => /문장 \(/.test(e)), "문장 수는 BLOCK이 아니다");
  const s7 = (d: Story7DraftV1) => setPara(d, 4, `${s4} 다섯째 문장이 더 있어요. 여섯째 문장도 있어요. 일곱째 문장까지 이어져요.`);
  assert.ok(warningsOf(s7).some((e) => /7문장/.test(e)));
  assert.ok(!errorsOf(s7).some((e) => /문장 \(/.test(e)));
  const ok46 = "가".repeat(46);
  assert.ok(!errorsOf((d) => { d.headline = ok46; }).some((e) => /headline: 길이/.test(e)));
  assert.ok(errorsOf((d) => { d.headline = `${ok46}가`; }).some((e) => /headline: 길이 47자 \(10~46자\)/.test(e)));
});

test("시기 이야기는 6번에만 쓴다 — 다른 장 · 카드 · 조언에 올해 · 대운 · 연도를 쓰면 막는다", () => {
  assert.ok(errorsOf((d) => setPara(d, 3, `${PAD} 올해는 특히 관계에서 마음이 앞서기 쉬워요.`)).some((e) => /시기 이야기\("올해"\)는 6번/.test(e)));
  assert.ok(errorsOf((d) => { d.cards.strength.note = "올해 두드러지는 힘이 있어요"; }).some((e) => /cards\.strength\.note: 시기 이야기/.test(e)));
  assert.ok(errorsOf((d) => { d.actions[0].detail = "올해 안에 한 번 짧게 물어보고 기록해 두세요."; }).some((e) => /조언에 시점이나 기간/.test(e)));
  assert.ok(errorsOf((d) => { section(d, 3).years = [{ year: "2026", theme: "한 줄 자리예요 괜찮아요" }]; }).some((e) => /years · scenarios는 6번 장에만/.test(e)));
});

test("조언(actions)은 2~3가지다 — 1개나 4개는 막는다", () => {
  assert.ok(errorsOf((d) => (d.actions = d.actions.slice(0, 1))).some((e) => /actions: 1개 \(2~3개\)/.test(e)));
  assert.ok(errorsOf((d) => (d.actions = [...d.actions, ...d.actions, ...d.actions])).some((e) => /actions: 6개 \(2~3개\)/.test(e)));
});

test("없는 기운을 조건 없이 생활 기능의 부족으로 풀지 않는다 — 4번에서도 마찬가지다", () => {
  assert.ok(errorsOf((d) => setPara(d, 4, `${PAD} 수 기운이 없어서 쉬는 힘이 약해요.`)).some((e) => /생활 기능의 부족이나 원인/.test(e)));
});

test("근거: 소유하는 장(1~6번)은 사주 근거와 개인 성향 근거를 달아야 하고, 엮는 장(7번)은 비워도 된다 · MBTI는 1 · 3 · 5번에서만 · 달았으면 본문에 쓴다", () => {
  assert.ok(errorsOf((d) => { section(d, 3).evidence = []; }).some((e) => /sections\.3.*근거 ID가 없습니다/.test(e)));
  assert.deepEqual(errorsOf((d) => { section(d, 7).evidence = []; }), []);
  assert.ok(errorsOf((d) => { section(d, 2).evidence = []; }).some((e) => /sections\.2.*근거 ID가 없습니다/.test(e)));
  assert.ok(errorsOf((d) => { section(d, 6).evidence.push("self.mbti"); }).some((e) => /MBTI\(self\.mbti\)는 1 · 3 · 5번 장에서만/.test(e)));
  assert.ok(errorsOf((d) => { section(d, 4).evidence.push("self.mbti"); }).some((e) => /MBTI\(self\.mbti\)는 1 · 3 · 5번 장에서만/.test(e)));
  assert.ok(errorsOf((d) => { section(d, 1).evidence = section(d, 1).evidence.filter((id) => id !== "self.mbti"); section(d, 3).evidence = section(d, 3).evidence.filter((id) => id !== "self.mbti"); }).some((e) => /MBTI\(self\.mbti\)를 1 · 3 · 5번 장 가운데 2곳 이상/.test(e)));
  assert.ok(errorsOf((d) => setPara(d, 1, `${PAD} 평소 모습이 이어질 수 있어요.`, 0)).some((e) => /MBTI 근거를 달았는데 본문에서 쓰지 않았습니다/.test(e)));
});

test("같은 응답 근거는 여러 장에서 쓸 수 있고(반복의 기준은 낱말 횟수가 아니다), 거의 모든 장(다섯 이상)을 끌고 갈 때만 막는다", () => {
  const poolIds = story7Evidence(P01_EVIDENCE).personal[1].filter((id) => id !== "self.mbti");
  const three = errorsOf((d) => { for (const no of [1, 3, 4]) if (!section(d, no).evidence.includes(poolIds[0])) section(d, no).evidence.push(poolIds[0]); });
  assert.ok(!three.some((e) => /개인 성향 근거 .*개 장/.test(e)), three.join("\n"));
  const five = errorsOf((d) => { for (const no of [1, 2, 3, 4, 5]) if (!section(d, no).evidence.includes(poolIds[0])) section(d, no).evidence.push(poolIds[0]); });
  assert.ok(five.some((e) => /개인 성향 근거 .*를 5개 장/.test(e)), five.join("\n"));
});

test("맺음 틀 변형 예산 · 작성 과정 문장 · 이름 · 알파벳 유형 코드를 막는다", () => {
  const formula = errorsOf((d) => { setPara(d, 1, `${PAD} 계속 확인하다 보면 지칠 수 있어요.`); setPara(d, 3, `${PAD} 계속 미루다면 어긋날 수 있어요.`); setPara(d, 4, `${PAD} 계속 혼자 하다면 외로울 수 있어요.`); });
  assert.ok(formula.some((e) => /"계속 ~라면"이\(가\) 3곳/.test(e)), formula.join("\n"));
  assert.ok(errorsOf((d) => setPara(d, 4, `${PAD} 이번 분석에서는 강약을 한쪽으로 정하지 않았어요.`)).some((e) => /작성 과정을 말하는 문장/.test(e)));
  assert.ok(errorsOf((d) => { d.headline = "지민 님의 중심은 이런 연결이에요"; }).some((e) => /이름을 쓰지 않습니다/.test(e)));
  assert.ok(errorsOf((d) => setPara(d, 3, `${PAD} INTJ 같은 유형이라서 그래요.`)).some((e) => /알파벳 유형 코드/.test(e)));
});

test("7번: 알려 준 고민이 없으면 \"알려 주신\"을 쓰지 않고, 있으면 첫 문단이 그 고민을 밝힌다", () => {
  assert.ok(errorsOf((d) => setPara(d, 7, `${PAD} 알려 주신 고민을 반영하면 이 순서가 맞아 보여요.`), P01_EVIDENCE, false).some((e) => /"알려 주신"을 썼습니다/.test(e)));
  assert.ok(errorsOf((d) => setPara(d, 7, `${PAD} 앞 장의 결론이 만나는 곳에서 이 순서가 맞아요.`), P01_EVIDENCE, true).some((e) => /알려 준 고민을 밝히며 시작/.test(e)));
});

test("6번: 계산된 해만, 가능성으로 쓰고 시기 근거를 달아야 한다", () => {
  assert.ok(errorsOf((d) => { section(d, 6).years = [{ year: "1999", theme: "한 줄 자리예요 괜찮아요" }]; }).some((e) => /계산된 해가 아닙니다/.test(e)));
  assert.ok(errorsOf((d) => { section(d, 6).scenarios = [{ when: "지금 모습이 그대로 이어지면 어떻게 될까요", then: "이렇게 흘러갑니다 반드시요 확실하게 그렇게요." }]; }).some((e) => /확률이 아닌 가능성/.test(e)));
  assert.ok(errorsOf((d) => { section(d, 6).evidence = [section(d, 6).evidence[0]]; }).some((e) => /시기 근거\(period가 있는 ID\)가 없습니다/.test(e)));
});

test("원문 보존: 문장 수 한도를 넘은 문단도 나누거나 바꾸지 않는다 — 경고(WARN)로만 알린다(운영자 정책 2026-10-17)", () => {
  const d = clone(mockDraft());
  const sentence = "이 문장은 문단을 나누지 않고 그대로 두어야 하는 문장이에요.";
  const five = ["첫째", "둘째", "셋째", "넷째", "다섯째"].map((n) => sentence.replace("이 문장은", `${n} 문장은`)).join(" ");
  section(d, 1).paragraphs = [five];
  const fixed = normalizeStory7Draft(d);
  assert.deepEqual(fixed, d, "문단을 나누지 않고 글도 바꾸지 않는다(actions 위치 보정만 한다)");
  assert.equal(story7Paragraphs(section(fixed, 1)).length, 1);
  const r = validateStory7Draft(fixed, P01_EVIDENCE, { hasContext: Boolean(P01.input.context) });
  assert.ok(r.warnings.some((e) => /5문장/.test(e)), r.warnings.join("\n"));
});

test("조언 행동 위치 보정: 7번 장 안에 들어 있는 actions는 위치만 sections 바깥으로 옮기고 글자는 그대로 — 바깥에 이미 있거나 다른 장에 있으면 건드리지 않는다", () => {
  type Nested = { actions?: unknown; sections: { no: number; actions?: unknown }[] };
  const d = clone(mockDraft());
  const original = JSON.stringify(d.actions);
  // 2026-10-17 실제 AI 글의 모양: 조언 행동이 7번 장 객체 안에 있고 sections 바깥에는 없다
  const nested = clone(d) as unknown as Nested;
  nested.sections.find((s) => s.no === 7)!.actions = nested.actions;
  delete nested.actions;
  const fixed = normalizeStory7Draft(nested);
  assert.equal(JSON.stringify(fixed.actions), original, "행동의 글자 · 근거 · 순서는 그대로다");
  assert.equal(fixed.sections.find((s) => s.no === 7)!.actions, undefined, "옮긴 행동은 7번 장에서 빠진다(같은 글이 두 곳에 있지 않다)");
  assert.equal(nested.actions, undefined, "입력은 바꾸지 않는다");
  assert.ok(nested.sections.find((s) => s.no === 7)!.actions, "입력의 7번 장에는 그대로 있다");
  assert.deepEqual(validateStory7Draft(fixed, P01_EVIDENCE), validateStory7Draft(d, P01_EVIDENCE), "보정한 글은 처음부터 바깥에 있던 글과 같은 검사 결과를 받는다");
  // 바깥에 이미 목록이 있으면 안쪽 것을 옮기지 않는다
  const both = clone(d) as unknown as Nested;
  both.sections.find((s) => s.no === 7)!.actions = [{ title: "안쪽", detail: "안쪽 행동", evidence: [] }];
  assert.equal(JSON.stringify(normalizeStory7Draft(both).actions), original);
  // 7번이 아닌 장의 actions는 옮기지 않는다
  const other = clone(d) as unknown as Nested;
  delete other.actions;
  other.sections.find((s) => s.no === 6)!.actions = JSON.parse(original);
  assert.equal(normalizeStory7Draft(other).actions, undefined);
});

// ───── 조립 · 저장 모양 ─────

const assembled = () => assembleStory7({ draft: mockDraft(), evidence: P01_EVIDENCE, input: P01.input, reference: { ...REF, iso: "2026-10-17" }, promptVersion: "x", ruleVersions: [] });

test("조립: 1~5번은 blocks(채팅이 읽는 id 그대로), 6번은 flow, 7번은 advice + actions — layout story7로 구분한다", () => {
  const report = assembled();
  const flags = { reading: isReadingReport(report), story7: isStory7Report(report), story: isStoryReport(report) };
  assert.deepEqual(flags, { reading: true, story7: true, story: false });
  assert.deepEqual(report.blocks.map((b) => b.id), ["tendency", "strength-burden", "love", "people", "work-money"]);
  assert.deepEqual(report.blocks.map((b) => b.topic), ["나는 어떤 사람일까?", "나의 강점과 약점", "연애와 애착", "인간관계와 인연", "일과 재물"]);
  assert.equal(report.flow.topic, "앞으로의 운과 변화");
  assert.equal(report.advice?.topic, "미유의 종합 조언");
  assert.equal(report.advice?.id, "advice");
  const draft = mockDraft();
  report.blocks.forEach((b, i) => {
    const paragraphs = story7Paragraphs(section(draft, i + 1));
    assert.equal(b.summary, paragraphs[0]);
    assert.deepEqual(b.details, paragraphs.slice(1));
    assert.ok(!b.example && !b.watch && !b.traits && !b.sections && !b.reactionFlow && !b.comfort);
    assert.ok(b.basis.computed.length > 0 || b.evidence.length === 0);
  });
  // 5번만 소제목 구분이 있다
  assert.deepEqual(report.blocks[4].parts?.map((p) => p.title), ["일", "재물"]);
  assert.ok(report.blocks.slice(0, 4).every((b) => !b.parts));
  assert.equal(report.actions.length, draft.actions.length);
  assert.ok(report.actions.every((a) => !a.area));
  assert.equal(report.summary.length, 3);
  assert.deepEqual(report.summary.map((c) => c.kind), ["strength", "caution", "flow"]);
  assert.ok(report.timeline.length > 0 && report.calendars && report.saju && report.extras && report.base);
  assert.equal(report.flow.periods.length, 0);
  // 자료가 실제로 없는 곳(상대 · 가족 · 동료 · 돈 응답)만 코드가 한 줄 밝힌다
  assert.ok(report.blocks[2].caveat?.includes("상대 자료: 없음"));
  assert.ok(report.blocks[3].caveat?.includes("친구 · 가족 · 동료"));
  assert.ok(report.blocks[4].caveat?.includes("소비 · 저축 습관을 직접 물은 응답이 아니라"));
  assert.ok(!report.blocks[0].caveat && !report.blocks[1].caveat);
  // 6번은 개운 풀이를 근거로 달았을 때 안내가 한 줄 더해진다(문장마다 붙이지 않고 코드가 한곳에 붙인다)
  assert.ok(report.flow.caveat?.includes("전통 오행 대응에 따른 상징적인 개운법"), report.flow.caveat);
  // 대표 경향 이름(~형)은 코드가 정한 값이 그대로 저장된다
  assert.ok(/형$/.test(report.base?.tendency.name ?? ""));
  // 참고한 자료 목록에 응답 · MBTI가 나온다
  const names = report.inputs.filter((i) => i.status !== "none").map((i) => i.name);
  for (const n of ["MBTI", "기질 · 성격", "가까운 관계에서의 반응(애착 경향)", "평소 행동 방식"]) assert.ok(names.includes(n), n);
});

test("조립: 7번 장의 알려 준 고민은 지어내지 않는다 — 고민이 없으면 context도 focus도 저장하지 않는다", () => {
  const input = { ...P01.input, context: null };
  const ev = buildEvidence(input, REF, { fortune: true });
  const draft = composeMockStory7(buildStory7UserMessage(ev, "2026-10-17", null));
  const report = assembleStory7({ draft, evidence: ev, input, reference: { ...REF, iso: "2026-10-17" }, promptVersion: "x", ruleVersions: [] });
  assert.ok(!report.focus && !report.generated?.context);
  assert.equal(report.inputs.find((i) => i.name === "알려 준 고민 · 상황")?.status, "none");
});

// ───── 생성기 ─────

test("생성기: story-7은 같은 흐름(초안 → 형식 검사 → 조립)으로 리포트를 만들고 지시문 버전을 남긴다 · 이전 형식 기본값은 그대로", async () => {
  const model = createMockModel({});
  const gen = createAiReportGenerator({ model, format: "story-7", now: () => NOW });
  assert.match(gen.version, /story-7-prompt-0\.5/);
  const report = (await gen.generate(P01.input, {})) as ReturnType<typeof assembleStory7>;
  assert.equal(report.layout, "story7");
  assert.equal(report.generated?.promptVersion, "story-7-prompt-0.5");
  assert.equal(model.calls, 1);
  const legacy = createAiReportGenerator({ model: createMockModel({}), now: () => NOW });
  assert.match(legacy.version, /reading-v1-prompt-0\.13/);
});

test("생성기: 첫 초안이 검사에 걸리면 이유를 주고 한 번 고쳐 쓰게 한다 — maxRepairs 0이면 첫 응답에서 멈추고 원문이 남는다", async () => {
  const fixed = createAiReportGenerator({ model: createMockModel({ invalidTimes: 1 }), format: "story-7", now: () => NOW });
  assert.equal(((await fixed.generate(P01.input, {})) as ReturnType<typeof assembleStory7>).layout, "story7");
  const attempts: { round: number; errors: string[]; text: string }[] = [];
  const once = createAiReportGenerator({ model: createMockModel({ invalidTimes: 5 }), format: "story-7", maxRepairs: 0, maxRetries: 0, now: () => NOW });
  await assert.rejects(() => once.generate(P01.input, { onAttempt: (a) => attempts.push(a) }), /리포트 형식 검사 실패/);
  assert.equal(attempts.length, 1);
  assert.ok(attempts[0].text.length > 0);
});

/** 모의 초안을 고쳐서(경고만 생기게 · 닫는 괄호를 빼서 …) 그대로 돌려주는 모델 — 호출 수를 센다 */
const scriptedModel = (make: (draft: Story7DraftV1) => string) => {
  const model = {
    provider: "mock",
    model: "mock-scripted",
    calls: 0,
    async complete(req: { messages: { role: string; content: string }[] }) {
      model.calls++;
      return { text: make(clone(composeMockStory7(req.messages[0].content))), model: "mock-scripted" };
    },
  };
  return model;
};

test("생성기: 경고(WARN)만 있는 글은 고쳐 쓰기를 부르지 않고 원문 그대로 리포트가 된다 — 경고는 시도 기록에 남는다(운영자 정책 2026-10-17)", async () => {
  const model = scriptedModel((d) => {
    // 4문장을 넘는 문단 + 설명 없는 용어 — 둘 다 읽기 쉬운 정도의 경고일 뿐이다
    const para = "재성이 두드러져서 돈의 길을 중요하게 읽어요. 둘째 문장은 이렇게 이어서 써요. 셋째 문장도 이어서 써요. 넷째 문장으로 이어요. 다섯째 문장이 하나 더 있어요. 여섯째 문장으로 마무리해요 그래서 길이는 충분해요.";
    const s4 = d.sections.find((x) => x.no === 4)!;
    s4.paragraphs = [para, ...(s4.paragraphs ?? []).slice(1)];
    return JSON.stringify(d);
  });
  const attempts: { round: number; errors: string[]; text: string; accepted?: boolean; warnings?: string[] }[] = [];
  const gen = createAiReportGenerator({ model, format: "story-7", now: () => NOW });
  const report = (await gen.generate(P01.input, { onAttempt: (a) => attempts.push(a) })) as ReturnType<typeof assembleStory7>;
  assert.equal(report.layout, "story7");
  assert.equal(model.calls, 1, "경고만으로는 AI를 다시 부르지 않는다");
  const accepted = attempts.find((a) => a.accepted)!;
  assert.ok(accepted && accepted.errors.length === 0);
  assert.ok((accepted.warnings ?? []).some((w) => /문장 \(/.test(w)), (accepted.warnings ?? []).join("\n"));
  assert.ok((accepted.warnings ?? []).some((w) => /설명 없는 사주 용어/.test(w)));
  assert.ok(report.blocks.some((b) => (b.details ?? []).concat(b.summary ?? "").some((t) => t.includes("여섯째 문장으로 마무리해요"))), "글은 나누거나 바꾸지 않고 그대로 저장된다");
});

test("생성기: 끝의 닫는 괄호가 빠지고 조언 행동이 7번 장 안에 들어간 글도(글자는 그대로) 한 번의 호출로 리포트가 된다 — 내용이 빠진 글은 그대로 실패한다", async () => {
  const nestedAndCut = (d: Story7DraftV1) => {
    const asObj = d as unknown as { actions?: unknown; sections: { no: number; actions?: unknown }[] };
    asObj.sections.find((x) => x.no === 7)!.actions = asObj.actions;
    delete asObj.actions;
    return JSON.stringify(d).slice(0, -2); // 맨 끝의 `]}` 둘이 빠진 2026-10-17 실제 글의 모양
  };
  const model = scriptedModel(nestedAndCut);
  const attempts: { round: number; errors: string[]; text: string; accepted?: boolean }[] = [];
  const report = (await createAiReportGenerator({ model, format: "story-7", maxRepairs: 0, maxRetries: 0, now: () => NOW }).generate(P01.input, { onAttempt: (a) => attempts.push(a) })) as ReturnType<typeof assembleStory7>;
  assert.equal(report.layout, "story7");
  assert.equal(model.calls, 1);
  assert.ok(report.actions.length >= 2, "조언 행동이 바깥으로 옮겨져 저장된다");
  assert.ok(attempts[0].accepted, "받아들인 응답으로 기록된다");
  assert.throws(() => JSON.parse(attempts[0].text), "원문은 괄호가 빠진 그대로 남는다(고치지 않는다)");
  // 7번 장이 통째로 빠진 글은 괄호를 닫아도 내용 검사(BLOCK)가 막는다
  const lost = scriptedModel((d) => JSON.stringify({ ...d, sections: d.sections.filter((x) => x.no !== 7) }).slice(0, -1));
  await assert.rejects(() => createAiReportGenerator({ model: lost, format: "story-7", maxRepairs: 0, maxRetries: 0, now: () => NOW }).generate(P01.input, {}), /리포트 형식 검사 실패/);
});

test("신규 생성 기본 형식은 한 곳(REPORT_GENERATION)에서 정하고 한 줄로 되돌릴 수 있다", () => {
  assert.ok(["reading-v1", "story-v1", "story-7"].includes(REPORT_GENERATION.format));
});

// ───── 채팅 · 내보내기 ─────

test("채팅: 7개 대주제 리포트도 같은 방 · 말풍선으로 읽히고 인간관계(people) 주제가 목록에 있다 — 저장된 풀이 글만 쓴다", () => {
  const report = assembled();
  const model = buildTalkModel(report, { saju: P01.input.saju.status === "ok" ? P01.input.saju : null, today: { year: 2026, month: 10, day: 17 } });
  assert.deepEqual(model.topics.filter((t) => t.id !== "flow").map((t) => t.id), ["tendency", "strength-burden", "love", "people", "work-money"]);
  const rooms = availableRooms(model);
  assert.ok(rooms.length > 0);
  for (const room of rooms) assert.doesNotThrow(() => startRoom(model, room), room);
});

test("내보내기: 번호 붙은 7개 장 · 5번 소제목 · 조언 2~3가지가 읽는 순서 글에 모두 나온다", () => {
  const md = renderReadingMarkdown(assembled());
  for (const [i, t] of ["나는 어떤 사람일까?", "나의 강점과 약점", "연애와 애착", "인간관계와 인연", "일과 재물", "앞으로의 운과 변화", "미유의 종합 조언"].entries()) assert.ok(md.includes(`## ${i + 1}. ${t}`), t);
  assert.ok(md.includes("#### 일") && md.includes("#### 재물"));
  assert.ok(md.includes("### 조언 2~3가지(실천)"));
});

test("화면에 보이는 모든 글 조각 위치가 장 번호로 읽힌다(반복 · 모티프 검사가 쓴다)", () => {
  const where = visibleStory7Texts(mockDraft()).map((t) => t.where);
  assert.ok(where.includes("headline") && where.includes("sections.5.parts[1].paragraphs[0]") && where.some((w) => w.startsWith("sections.6.years[")) && where.some((w) => w.startsWith("actions[")));
});

// ───── 미유 문체(운영자 2026-10-17) ─────

test("지시문에 미유의 말투 블록이 들어 있고, 억지 공감을 허용하던 옛 문장과 맺음 틀을 만들던 예시가 없다", () => {
  assert.match(STORY7_SYSTEM_PROMPT, /\[미유의 말투 — 글 전체에 적용한다\]/);
  assert.match(STORY7_SYSTEM_PROMPT, /진단서를 읽어 주는 말투도, 무조건 다정하게 위로만 하는 말투도 아니다/);
  assert.match(STORY7_SYSTEM_PROMPT, /필요한 말은 분명하게 한다/);
  assert.match(STORY7_SYSTEM_PROMPT, /그랬죠\?/);
  for (const old of ['"~한 적 있죠?")은 근거가 있는 반응에만', "있었을 거예요", "편해 보여요. 적고 나서도", "물어볼 시점이에요."]) assert.ok(!STORY7_SYSTEM_PROMPT.includes(old), `옛 문장이 남아 있다: ${old}`);
  // 검사가 막는 말은 지시문이 같은 목록으로 알려 준다
  for (const word of ["서사", "본질", "양상", "발현", "입체적", "구조적"]) assert.ok(STORY7_SYSTEM_PROMPT.includes(word), word);
});

test("문체 검사: 합쇼체 · AI 어휘 · 당신 · 억지 공감은 저장하지 않는 오류이고, 모의 글(해요체)은 통과한다", () => {
  assert.deepEqual(errorsOf(() => {}), []);
  assert.ok(errorsOf((d) => setPara(d, 3, `${PAD} 서로 마음을 확인하는 일이 중요합니다.`)).some((e) => /합쇼체/.test(e)));
  assert.ok(errorsOf((d) => setPara(d, 1, `${PAD} 이 사람의 서사는 천천히 정하는 쪽으로 나타나요.`)).some((e) => /분석 보고서 어휘/.test(e)));
  assert.ok(errorsOf((d) => setPara(d, 4, `${PAD} 당신은 모임에서 한 발 물러나 있을 때가 편해요.`)).some((e) => /당신 · 귀하/.test(e)));
  assert.ok(errorsOf((d) => setPara(d, 3, `${PAD} 연락이 뜸할 때 혼자 버텼죠? 그런 적 많았죠?`)).some((e) => /억지 공감|공감 질문/.test(e)));
});

test("문체 점검은 고쳐 쓰기 안내와 사람 검토 목록을 따로 낸다 — 추상어 · 대조형 틀 · 같은 시작이 많아도 저장 오류가 아니다", () => {
  const d = mockDraft();
  setPara(d, 1, `${PAD} 단순히 조용한 게 아니라 생각이 오래 걸리는 거예요. 단순히 느린 게 아니라 확인이 길어지는 거예요. 균형이 흔들리면 균형부터 맞춰요.`, 1);
  const r = validateStory7Draft(d, P01_EVIDENCE, { hasContext: Boolean(P01.input.context) });
  assert.ok(r.ok, r.ok ? "" : r.errors.join("\n"));
  const report = story7VoiceReport(d, P01_EVIDENCE);
  const repair = report.findings.filter((f) => f.level === "repair").map((f) => f.id);
  assert.ok(repair.includes("contrast-pattern") && repair.includes("abstract-words"), repair.join(","));
  assert.equal(report.findings.filter((f) => f.level === "fail").length, 0);
});
