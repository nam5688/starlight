// 실행: npm test — 운영자가 전달한 명리 프롬프트 팩(2026-10-16) 점검과 지시문 0.13의 코드 쪽 확인(docs/prompt-pack-review.md).
// ① 지시문 0.13이 "해내야 하는 일 · 용어는 설명과 함께 · 이유 있는 방향 · 보완 아이템"을 담고, 예전의 막기만 하던 줄(용어 전면 금지 · 방향 금지 · 행운 처방 전면 금지)이 없다
// ② 용어 검사는 "용어 0건"이 아니라 설명 없는 용어 · 근거 없는 판정을 막는다 ③ 중대한 선택의 확정 · 효과 보장 · 상품 안내만 막고 이유 있는 방향 · 보완 아이템 제안은 통과시킨다
// ④ AI에게 원국 표 항목이 따로 가지 않고 근거 목록만 간다 ⑤ 전달받은 십성 지적을 엔진 표와 대조한다. 서비스 동작(응답을 지어내지 않기 · 저장된 결과 불변)은 다른 시험이 계속 확인한다.
// 가짜 모델만 쓰며 유료 호출이 없다. 낱말을 센 검사는 좋은 글의 보증이 아니다.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { getTenGod } from "manseryeok";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import { sajuEvidence } from "../../saju/interpret/rules.ts";
import { sampleReadingAsDraft, SAMPLE_EVIDENCE } from "../../samples/sample-reading-report.ts";
import { surveyEvidence } from "../survey-evidence.ts";
import { sampleReport } from "../../samples/sample-report.ts";
import { ADVICE_RULES } from "./plan.ts";
import { buildReadingUserMessage, READING_PROMPT_VERSION, READING_SYSTEM_PROMPT } from "./prompt.ts";
import { validateReadingDraft } from "./validate.ts";

const draft = () => structuredClone(sampleReadingAsDraft());
// 아직 엔진이 계산하지 않는 판단(개인의 격국 · 용신 · 희신 · 기신 · 신살) — 근거 목록에 나오면 안 된다
const SCHOOL_DEPENDENT = /격국|신살|희신|기신|용신|(?:도화|역마|화개|양인|괴강|백호|홍염|귀문)살/;
// 구조 분석(2026-10-16)으로 엔진이 계산하게 된 재료 — 근거 ID가 saju.structure.* 인 것에서만 나온다
const STRUCTURE_TERMS = /월령|지장간|조후|통근|투간|강약/;
const adviceWhy = (s: string) => ADVICE_RULES.filter((r) => r.re.test(s)).map((r) => r.why);

test("지시문 0.13: 이전 판(0.11 · 0.12)의 원문은 보관돼 있다 — 0.11의 모든 줄을 남기는 것은 품질 기준이 아니라서 줄 단위 비교는 하지 않는다", () => {
  assert.equal(READING_PROMPT_VERSION, "reading-v1-prompt-0.13");
  for (const v of ["0.11", "0.12"]) assert.ok(existsSync(new URL(`../../../docs/samples/prompts/reading-v1-prompt-${v}.txt`, import.meta.url)), `${v} 원문 보관`);
});

test("지시문 0.13: 해내야 하는 일 · 구조 근거 활용 · 용어 규칙 · 이유 있는 방향 · 보완 아이템 · MBTI 사용이 들어 있다", () => {
  const P = READING_SYSTEM_PROMPT;
  // 먼저 해내야 하는 일을 적고 금지는 그 일을 해치는 것에만 둔다
  assert.match(P, /\[이 글이 해내야 하는 것 — 금지는 이 일을 지키기 위한 것이다\]/);
  assert.match(P, /이유가 있는 방향과 바로 해 볼 행동으로 끝낸다/);
  assert.match(P, /조심스러워서 풀이를 얕게 쓰거나 방향 없이 끝내지 않는다/);
  // 구조 근거(월령 · 지장간 · 통근 · 투간 · 강약 후보 · 조후 후보)를 풀이의 뼈대로
  assert.match(P, /\[사주를 읽는 범위 — 엔진이 계산한 원국 구조와 해석 규칙 안에서 깊게\]/);
  assert.match(P, /saju\.structure\.chart/);
  assert.match(P, /강약 후보는 점수가 아니라 요소의 기록이다/);
  assert.match(P, /"갈림"이면 한쪽으로 정하지 않고/);
  assert.match(P, /uncertain 근거/);
  assert.match(P, /이 사람의 격국 · 용신 · 희신 · 기신 · 신살 이름/);
  assert.match(P, /그 관점이 없어도 풀이는 끝까지 쓴다/);
  assert.match(P, /일대일로 대응시키지 않는다/);
  assert.match(P, /모든 합이 좋고 모든 충이 나쁘다고 단순화하지 않고/);
  assert.match(P, /periods에 있는 기간과 해만 쓴다/);
  assert.match(P, /그 기간 → 두드러지는 주제 → 이 사람이 활용하거나 버거워할 방식 → 준비할 행동/);
  assert.match(P, /태어난 시각을 모르는 사람은 시주 근거가 없다/);
  // 용어: 쓰지 않는다가 아니라 필요하면 쓰고 처음 쓸 때 풀어 준다
  assert.match(P, /\[사주 용어 — 필요하면 쓰고, 처음 쓸 때 바로 풀어 준다\]/);
  assert.match(P, /풀이에 필요하면 사주 용어를 쓸 수 있다/);
  assert.match(P, /"월령\(태어난 달의 기운\)"/);
  assert.match(P, /한 문장에 용어는 2개까지만 쓴다/);
  assert.match(P, /한자만 괄호에 넣는 것은 풀이가 아니다/);
  // 방향 제시와 보완 아이템
  assert.match(P, /\[방향을 제시한다 — 이유와 함께\]/);
  assert.match(P, /"~쪽이 더 맞아 보여요/);
  assert.match(P, /중대한 선택을 확정해 말하지 않는다/);
  assert.match(P, /"이 주식을 사세요", "대출해서 창업하세요"/);
  assert.match(P, /\[보완 아이템 — 가볍게 곁들이는 제안\]/);
  assert.match(P, /색 · 공간 · 습관/);
  assert.match(P, /"운이 트여요", "액운을 막아요"/);
  // MBTI: 장면을 구체화하는 참고, 행동을 정하는 값이 아님, 억지로 끼우지 않음
  assert.match(P, /입력한 MBTI\(source가 self\)는 본인이 알려 준 선호의 참고다/);
  assert.match(P, /맞닿는 곳에서만 짧게 쓴다/);
  assert.match(P, /행동을 정하는 값으로 쓰지 않으며/);
  assert.match(P, /시기나 운 때문에 MBTI나 성향이 바뀐다고 쓰지 않는다/);
  // 자료의 종류 · 분야별 규칙 · 서비스 동작은 그대로
  assert.match(P, /전통 해석은 검증된 사실이 아니라 읽는 방식/);
  assert.match(P, /유형 이름이나 검사 결과처럼 만들어 내지 않는다/);
  assert.match(P, /궁합 · 다른 상품 · 가격 · 구매 · 질문권을 이 글 안에서 안내하지 않고/);
  assert.match(P, /실제로 건넬 수 있는 짧은 말 한 문장/);
  assert.match(P, /성별에 따라 가사 · 경제 역할을 정하지 않고/);
  assert.match(P, /한 줄 규칙으로 결정을 내리지 않고/);
  assert.match(P, /근거 목록에 없는 장면에서의 이 사람의 구체적 행동을 사실처럼 쓰지 않는다/);
});

test("지시문 0.13: 운영자가 풀기로 한 막기만 하던 줄이 없다 — 용어 전면 금지 · 방향 제시 금지 · 행운 처방 전면 금지 · 건너뛴다는 방침", () => {
  const P = READING_SYSTEM_PROMPT;
  assert.doesNotMatch(P, /화면에 보이는 모든 글\(요약 · 예시 · 풀이 · 행동\)에는 사주 용어/, "용어 전면 금지 줄");
  assert.doesNotMatch(P, /용어는 근거로만 남긴다|용어는 근거로만/, "용어를 근거에만 두라는 말");
  assert.doesNotMatch(P, /행운의 색 · 숫자 · 방향 · 물건은 쓰지 않는다/, "행운 처방 전면 금지 줄");
  assert.doesNotMatch(P, /어느 쪽이 낫다고 정하지 않는다/, "방향 제시 금지 줄");
  assert.doesNotMatch(P, /선택 앞에서는 기준과 확인할 질문까지만 쓴다/, "방향을 기준 · 질문까지로 제한한 줄");
  assert.doesNotMatch(P, /조용히 건너뛴다/, "계산하지 않는 판단을 건너뛴다는 방침");
  assert.doesNotMatch(P, /아는 것처럼 쓰는 것이 모르는 것보다 더 큰 잘못이다/);
});

test("용어 검사: 처음 쓸 때 풀이가 붙은 용어 · 앞에서 이미 풀어 준 용어는 통과하고, 설명 없는 용어 · 한 문장에 셋 이상 늘어놓은 용어 · 근거 없는 판정은 이유와 함께 막힌다", () => {
  const withText = (text: string) => {
    const d = draft();
    d.blocks[0].details[0] = text;
    return validateReadingDraft(d, SAMPLE_EVIDENCE);
  };
  const lead = "새 일을 맡을 때는 기준부터 세우는 편이라 시작이 조금 느려 보일 수 있어요.";
  const errs = (text: string) => {
    const r = withText(text);
    return r.ok ? [] : r.errors;
  };
  // 필요한 용어를 풀이와 함께 쓰면 통과한다
  assert.deepEqual(errs(`${lead} 일간(나 자신을 나타내는 글자)이 정화라서 작은 불씨처럼 오래 가는 집중이 있어요.`), []);
  assert.deepEqual(errs(`${lead} 일간이란 나 자신을 나타내는 글자를 말해요. 그 글자가 정화라서 집중이 오래 가요.`), []);
  // 설명 없이 쓰면 막힌다
  assert.ok(errs(`${lead} 일간이 정화라서 집중이 오래 가요.`).some((e) => /설명 없는 사주 용어\(일간\)/.test(e)));
  assert.ok(errs(`${lead} 한자만 달아도 설명이 아니에요. 일간(日干)이 정화예요.`).some((e) => /설명 없는 사주 용어\(일간\)/.test(e)));
  // 용어를 늘어놓으면 막힌다
  assert.ok(errs(`${lead} 비겁(나와 같은 기운)과 식상(표현하는 기운)과 인성(나를 돕는 기운)이 한꺼번에 많아요.`).some((e) => /한 문장에 사주 용어가 3개/.test(e)));
  // 근거 목록에 없는 판정은 막힌다 — 개인 격국 · 용신 · 신살
  assert.ok(errs(`${lead} 격국(사주의 큰 틀)이 잘 짜인 구조예요.`).some((e) => /근거 목록에 없는 판정\(격국\)/.test(e)));
  assert.ok(errs(`${lead} 신살(특별한 기운)이 있어서 사람을 끌어요.`).some((e) => /근거 목록에 없는 판정\(신살\)/.test(e)));
  assert.ok(errs(`${lead} 용신(필요한 기운)은 물이에요.`).some((e) => /근거 목록에 없는 판정\(용신\)/.test(e)));
  // 구조 근거가 있는 용어는 설명과 함께 쓸 수 있다(서윤은 월령 근거가 있다)
  assert.deepEqual(errs(`${lead} 월령(태어난 달의 기운)을 얻지 못한 구조라서 혼자 힘을 쏟기 쉬워요.`), []);
  // 일상어가 같은 글자를 포함해도 걸리지 않는다
  assert.deepEqual(errs(`${lead} 신약 개발 회사에서 일하듯 꼼꼼하게 확인하고, 도화지에 그림을 그리듯 천천히 풀어요.`), []);
});

test("용어 검사: 근거가 없거나 달라질 수 있는 구조 용어는 이 사람의 것으로 쓸 수 없다(월령 · 통근 · 조후 · 신강/신약)", () => {
  const lead = "새 일을 맡을 때는 기준부터 세우는 편이라 시작이 조금 느려 보일 수 있어요.";
  const make = (text: string, evidence = SAMPLE_EVIDENCE) => {
    const d = draft();
    d.blocks[0].details[0] = text;
    const r = validateReadingDraft(d, evidence);
    return r.ok ? [] : r.errors;
  };
  // 서윤은 가을 달이라 조후 근거가 없다 → 조후를 이 사람의 것으로 쓰면 막힌다
  assert.ok(make(`${lead} 조후(계절의 한열)가 맞지 않아 쉽게 지쳐요.`).some((e) => /근거 목록에 없는 판정\(조후\)/.test(e)));
  // 강약 후보가 갈림이 아닌 한쪽(서윤은 "덜 받는 쪽")이면 신약이라는 말을 설명과 함께 쓸 수 있고, 갈림이면 막힌다
  const weakened = SAMPLE_EVIDENCE.map((e) => (e.id === "saju.structure.strength" ? { ...e, strength: "weak" as const } : e));
  assert.ok(make(`${lead} 신약(내 힘을 덜 받는 쪽)이라서 혼자 감당하면 지치기 쉬워요.`, weakened).some((e) => /근거 없는 판정\(신약\)/.test(e)));
  assert.deepEqual(make(`${lead} 신약(내 힘을 덜 받는 쪽)이라서 혼자 감당하면 지치기 쉬워요.`), []);
  // 달라질 수 있는(uncertain) 월령 근거는 해석에 쓸 수 없다
  const uncertain = SAMPLE_EVIDENCE.map((e) => (e.id === "saju.structure.month" || e.id === "saju.structure.roots" ? { ...e, uncertain: true } : e));
  assert.ok(make(`${lead} 월령(태어난 달의 기운)을 얻지 못한 구조라서 혼자 힘을 쏟기 쉬워요.`, uncertain).some((e) => /근거 목록에 없는 판정\(월령\)/.test(e)));
  assert.ok(make(`${lead} 통근(나를 받쳐 주는 뿌리의 힘)이 약해서 쉽게 흔들려요.`, uncertain).some((e) => /근거 목록에 없는 판정\(통근\)/.test(e)));
});

test("확정 · 보장 · 상품 안내 검사: 중대한 선택을 확정하는 말 · 효과 보장 · 구매 안내는 이유와 함께 걸리고, 이유가 있는 방향 · 선 긋기 · 보완 아이템 제안 · 모양이 비슷한 정상 문장은 걸리지 않는다", () => {
  const bad: [string, string][] = [
    ["지금 다니는 곳은 이직하세요.", "중대한 선택을 확정해 말하는 표현"],
    ["이번에는 동업하지 마세요.", "중대한 선택을 확정해 말하는 표현"],
    ["그 사람과는 헤어지는 게 맞아요.", "중대한 선택을 확정해 말하는 표현"],
    ["지금 퇴사하는 게 좋아요.", "중대한 선택을 확정해 말하는 표현"],
    ["대출해서 창업하세요.", "중대한 선택을 확정해 말하는 표현"],
    ["빚을 내서 사업을 시작해요.", "대출로 창업 · 투자를 권하는 표현"],
    ["올해는 부동산을 사세요.", "투자 · 대출 권유 또는 수입 보장"],
    ["이 주식을 사세요.", "투자 · 대출 권유 또는 수입 보장"],
    ["주식 투자는 해도 좋아요.", "투자 · 대출 권유 또는 수입 보장"],
    ["이 시기에는 수익이 보장돼요.", "투자 · 대출 권유 또는 수입 보장"],
    ["자녀운이 좋은 편이에요.", "출산 · 자녀 예언"],
    ["불임을 걱정하게 될 수 있어요.", "출산 · 자녀 예언"],
    ["행운의 숫자는 7이에요.", "운을 바꾼다는 보장 · 행운의 숫자 · 날짜"],
    ["개운법으로 이 물건을 지니세요.", "운을 바꾼다는 보장 · 행운의 숫자 · 날짜"],
    ["이 소품을 두면 운이 트여요.", "운을 바꾼다는 보장 · 행운의 숫자 · 날짜"],
    ["이 색을 쓰면 액운을 막아요.", "운을 바꾼다는 보장 · 행운의 숫자 · 날짜"],
    ["부적을 지니면 좋아요.", "운을 바꾼다는 보장 · 행운의 숫자 · 날짜"],
    ["이 제품을 구매해 보세요.", "다른 상품 · 구매 안내"],
    ["궁합까지 포함되어 있어요.", "다른 상품 · 구매 안내"],
    ["구매하면 더 자세히 알려 드려요.", "다른 상품 · 구매 안내"],
    ["질문권으로 더 물어볼 수 있어요.", "다른 상품 · 구매 안내"],
    ["심층 리포트에서 이어서 봐요.", "다른 상품 · 구매 안내"],
    ["30년 경력의 명리학자가 읽었어요.", "경력 · 전문성을 내세우는 표현"],
  ];
  for (const [s, why] of bad) assert.ok(adviceWhy(s).includes(why), `${s} → ${adviceWhy(s).join(",") || "걸리지 않음"}`);
  const ok = [
    // 이유가 있는 방향 제시 — 막지 않는다
    "퇴사를 고민한다면 지금 일에서 반복되는 부담이 무엇인지 먼저 적어 보는 쪽이 이 사람에게 맞아 보여요.",
    "새 팀에서 역할이 흐릿하면 처음 한 달은 맡을 범위를 문장으로 적어 두는 편이 좋아 보여요.",
    "이직을 생각한다면 책임 범위가 넓어지는 자리가 더 맞아 보여요. 그래도 확인할 질문은 남겨 두세요.",
    "결혼을 서두르기보다 생활 속도를 맞춰 보는 쪽이 도움이 될 수 있어요.",
    "헤어질지 고민될 때는 반복되는 서운함이 무엇인지 적어 보는 게 도움이 될 수 있어요.",
    // 선 긋기
    "대출이나 투자는 사주로 정하지 않아요.",
    "퇴사를 고민할 때는 기준을 먼저 적어 보세요.",
    "이직이 가까워 보여도 서두르지 않는 편이에요.",
    "책임과 권한을 먼저 나누면 동업도 편해질 수 있어요.",
    // 보완 아이템 — 재미 · 기분 환기 수준
    "마음이 차분해지는 색의 소품을 자주 보는 자리에 두면 기분 전환에 도움이 될 수 있어요.",
    "일을 시작하는 자리를 늘 같은 곳으로 정하는 습관을 가볍게 시도해 볼 수 있어요.",
    "책상을 창가 쪽으로 옮겨 보며 집중이 달라지는지 지켜봐도 좋아요.",
    // 모양이 비슷한 정상 문장
    "행운이 따르는 시기라고 읽기보다 준비하기 좋은 시기로 봐요.",
    "구매한 물건을 정리하듯 일의 순서를 정해 보세요.",
    "자녀와 가까운 관계에서는 말수가 줄 수 있어요.",
    "경력이 쌓이는 시기에는 맡는 일이 넓어질 수 있어요.",
  ];
  for (const s of ok) assert.deepEqual(adviceWhy(s), [], s);
});

test("실제 검사에 연결돼 있다: 서윤 예시 초안은 통과하고, 같은 초안에 나쁜 문장을 한 곳만 넣으면 이유와 함께 막히며, 이유 있는 방향 · 설명 있는 용어는 통과한다", () => {
  const base = draft();
  assert.equal(validateReadingDraft(base, SAMPLE_EVIDENCE).ok, true, "예시 초안은 새 검사도 통과한다");
  const make = (text: string) => {
    const d = draft();
    d.blocks[0].details[0] = text;
    return validateReadingDraft(d, SAMPLE_EVIDENCE);
  };
  const lead = "새 일을 맡을 때는 기준부터 세우는 편이라 시작이 조금 느려 보일 수 있어요.";
  const bads: [string, RegExp][] = [
    [`${lead} 그러니 지금 일은 이직하세요.`, /중대한 선택을 확정해 말하는 표현/],
    [`${lead} 올해는 수익이 보장돼요.`, /투자 · 대출 권유 또는 수입 보장/],
    [`${lead} 격국이 잘 짜인 구조예요.`, /근거 목록에 없는 판정\(격국\)/],
    [`${lead} 신살이 있어서 사람을 끌어요.`, /근거 목록에 없는 판정\(신살\)/],
    [`${lead} 책상에 이 소품을 두면 운이 트여요.`, /운을 바꾼다는 보장 · 행운의 숫자 · 날짜/],
    [`${lead} 심층 리포트에서 더 알려 드려요.`, /다른 상품 · 구매 안내/],
  ];
  for (const [text, re] of bads) {
    const r = make(text);
    assert.equal(r.ok, false, text);
    assert.ok(!r.ok && r.errors.some((e) => re.test(e)), `${text} → ${!r.ok ? r.errors.join(" / ") : "통과"}`);
  }
  for (const fine of [
    `${lead} 대출이나 투자는 사주로 정하지 않고 기준부터 적어 두는 쪽이 어울려요.`,
    `${lead} 이직을 고민한다면 책임 범위가 넓어지는 자리가 더 맞아 보여요. 맞지 않는 신호가 보이면 그때 다시 물어보세요.`,
    `${lead} 마음이 차분해지는 색의 소품을 책상에 두는 건 기분 전환 정도로 가볍게 해 봐도 좋아요.`,
    `${lead} 월령(태어난 달의 기운)이 뒷받침해 주지 않아서 혼자 버티는 장면이 늘기 쉬워요.`,
  ]) {
    const r = make(fine);
    assert.equal(r.ok, true, `${fine} → ${!r.ok ? r.errors.join(" / ") : ""}`);
  }
});

test("AI에게는 원국 표 항목이 따로 가지 않고 근거 목록만 간다 — 여덟 글자는 구조 근거의 문장 안에 있고, 이름 · 생년월일 원문은 없으며, 출처는 계산(saju) · 응답(survey) · 본인 입력(self)으로 나뉜다", () => {
  const msg = buildReadingUserMessage(SAMPLE_EVIDENCE, "2026-10-12", null);
  const payload = JSON.parse(msg.slice(msg.indexOf("{")));
  assert.deepEqual(Object.keys(payload).sort(), ["blocks", "evidence", "periods", "referenceDate", "terms"].sort(), "원국 표 · 이름 · 생년월일 항목이 없다");
  assert.ok(!/1994|서윤/.test(msg), "이름 · 생년월일 원문이 없다");
  assert.ok(payload.evidence.some((e: { id: string; fact: string }) => e.id === "saju.structure.chart" && /갑술\(甲戌\)/.test(e.fact)), "원국 여덟 글자는 구조 근거의 사실 문장으로 간다");
  const sources = new Set(payload.evidence.map((e: { source: string }) => e.source));
  assert.deepEqual([...sources].sort(), ["saju", "self", "survey"]);
  for (const e of payload.evidence) assert.ok(e.fact && e.cue && e.strength && e.topics, e.id);
  // 한 근거는 계산 사실(fact)과 해석 규칙(cue)이 나뉘어 있다 — 사주 근거의 cue는 "~로 봅니다" 전통 해석이다
  const dm = payload.evidence.find((e: { id: string }) => e.id === "saju.daymaster");
  assert.match(dm.fact, /일간 .*\(.\)/);
  assert.match(dm.cue, /봅니다/);
});

test("엔진이 근거로 주는 사주 자료: 격국 · 용신 · 희신 · 기신 · 신살은 계산하지 않아 없고, 월령 · 지장간 · 통근 · 투간 · 강약 · 조후는 구조 분석 근거(saju.structure.*)에만 있다", () => {
  const charts = [
    calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" }),
    calculateSaju({ year: 1996, month: 3, day: 29, calendar: "solar", isLeapMonth: false, birthTime: null, gender: "female" }),
    calculateSaju({ year: 1988, month: 8, day: 15, calendar: "solar", isLeapMonth: false, birthTime: "23:30", gender: "male" }),
  ];
  for (const c of charts) {
    assert.equal(c.status, "ok");
    if (c.status !== "ok") continue;
    const ev = [...sajuEvidence(c, { reference: { year: 2026, month: 10 }, gender: c.gender ?? null }), ...surveyEvidence(sampleReport, "INFJ")];
    assert.ok(ev.some((e) => e.id === "saju.structure.hidden"), "지장간 근거가 만들어진다");
    // "(지장간 제외)"는 지장간을 오행 개수에 넣지 않았다는 표시이지 지장간을 읽은 것이 아니다
    for (const e of ev) {
      const text = `${e.id} ${e.fact} ${e.cue}`.replaceAll("(지장간 제외)", "");
      assert.equal(SCHOOL_DEPENDENT.test(text), false, `${e.id}: 아직 계산하지 않는 판단이 근거에 들어 있다`);
      if (!e.id.startsWith("saju.structure.")) assert.equal(STRUCTURE_TERMS.test(text), false, `${e.id}: 구조 분석 용어가 구조 근거 밖에 있다`);
    }
  }
});

test("십성 대조(운영자가 전달한 지적): 일간 丁 기준으로 丙은 겁재 · 辛은 편재 · 癸는 편관 · 庚은 정재 — 엔진 표가 같고, 이 값은 AI가 아니라 엔진이 계산한다", () => {
  const dm = "정" as never;
  assert.equal(getTenGod(dm, "병" as never), "겁재");
  assert.equal(getTenGod(dm, "신" as never), "편재");
  assert.equal(getTenGod(dm, "계" as never), "편관");
  assert.equal(getTenGod(dm, "경" as never), "정재");
  // 같은 癸를 한쪽은 정관 · 다른 쪽은 편관으로 부르지 않는다 — 정관은 壬
  assert.equal(getTenGod(dm, "임" as never), "정관");
});

// ───────────── 분석 근거 화면 숨김(운영자 2026-10-16) ─────────────

test("분석 근거 화면 노출 스위치: 꺼져 있고(숨김), 숨겨도 저장된 리포트의 근거 데이터 · AI에게 가는 근거 목록은 그대로다", async () => {
  const { REPORT_BASIS } = await import("../../config/product.ts");
  const { sampleReadingReport } = await import("../../samples/sample-reading-report.ts");
  assert.equal(REPORT_BASIS.visible, false, "운영자 요청으로 숨긴다(켜려면 lib/config/product.ts 한 줄)");
  // 근거 데이터는 지우지 않는다 — 주제마다 basis · 시기 basis · 사용한 자료 목록이 코드가 채운 그대로 있다
  assert.ok(sampleReadingReport.blocks.every((b) => b.basis && b.basis.computed.length + b.basis.tradition.length > 0), "주제마다 근거 데이터가 남아 있다");
  assert.ok(sampleReadingReport.flow.basis.computed.length > 0, "시기 근거 데이터가 남아 있다");
  assert.ok(sampleReadingReport.inputs.length > 0);
  // AI 요청의 근거 목록은 화면 스위치와 무관하다
  assert.ok(JSON.parse(buildReadingUserMessage(SAMPLE_EVIDENCE, "2026-10-12", null).replace(/^[^{]*/, "")).evidence.length > 30);
});
