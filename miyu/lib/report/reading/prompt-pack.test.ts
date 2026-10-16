// 실행: npm test — 운영자가 전달한 명리 프롬프트 팩(2026-10-16) 점검의 코드 쪽 확인(docs/prompt-pack-review.md).
// ① 지시문 0.12가 0.11을 줄 단위로 포함한다(더하기만 했다) ② 엔진이 주지 않는 학파 의존 판단을 본문에 쓰지 못하게 막는다 ③ 결정 대행 · 처방 · 상품 안내를 막되 선 긋기 문장은 통과시킨다
// ④ AI에게 원국(간지)이 아니라 근거 목록만 간다 ⑤ 전달받은 십성 지적을 엔진 표와 대조한다. 가짜 모델만 쓰며 유료 호출이 없다. 낱말을 센 검사는 좋은 글의 보증이 아니다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getTenGod } from "manseryeok";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import { sajuEvidence } from "../../saju/interpret/rules.ts";
import { sampleReadingAsDraft, SAMPLE_EVIDENCE } from "../../samples/sample-reading-report.ts";
import { surveyEvidence } from "../survey-evidence.ts";
import { sampleReport } from "../../samples/sample-report.ts";
import { ADVICE_RULES, JARGON } from "./plan.ts";
import { buildReadingUserMessage, READING_PROMPT_VERSION, READING_SYSTEM_PROMPT } from "./prompt.ts";
import { validateReadingDraft } from "./validate.ts";

const FROZEN_011 = readFileSync(new URL("../../../docs/samples/prompts/reading-v1-prompt-0.11.txt", import.meta.url), "utf8");
const draft = () => structuredClone(sampleReadingAsDraft());
/** 엔진이 계산해 주지 않는 학파 의존 판단(강약 · 월령 · 조후 · 격국 · 용신 계열 · 지장간 · 신살) */
const SCHOOL_DEPENDENT = /격국|조후|월령|지장간|신살|희신|기신|용신|신강|신약|(?:도화|역마|화개|양인|괴강|백호|홍염|귀문)살/;
const adviceWhy = (s: string) => ADVICE_RULES.filter((r) => r.re.test(s)).map((r) => r.why);

test("지시문 0.12는 0.11의 줄을 하나도 지우지 않고 더하기만 했다(버전이 0.12일 때만 확인 — 다음 버전부터는 이 시험이 요구하지 않는다)", () => {
  if (READING_PROMPT_VERSION !== "reading-v1-prompt-0.12") return;
  const now = READING_SYSTEM_PROMPT.split("\n");
  const set = new Set(now);
  const lost = FROZEN_011.split("\n").filter((l) => !set.has(l) && !now.some((n) => n.startsWith(l)));
  assert.deepEqual(lost, [], "0.11의 줄이 사라지거나 바뀌었다 — 줄 뒤에 문장을 잇는 것만 허용한다");
  assert.ok(READING_SYSTEM_PROMPT.length > FROZEN_011.length);
});

test("지시문 0.12: 사주를 읽는 범위 · 자료의 종류 · 분야별 추가 · 쓰지 않는 것이 들어 있다", () => {
  const P = READING_SYSTEM_PROMPT;
  // 읽는 범위 — 엔진이 근거로 주지 않는 것은 짐작하지 않고 조용히 건너뛴다
  assert.match(P, /\[사주를 읽는 범위 — 근거 목록에 있는 것만\]/);
  assert.match(P, /목록에 없는 판단을 직접 계산하거나 짐작해 만들지 않는다/);
  assert.match(P, /강약\(신강 · 신약\).*월령 · 조후.*격국.*용신 · 희신 · 기신.*지장간.*신살.*월별/);
  assert.match(P, /조용히 건너뛴다/);
  assert.match(P, /일대일로 대응시키지 않는다/);
  assert.match(P, /모든 합이 좋고 모든 충이 나쁘다고 단순화하지 않고/);
  assert.match(P, /periods에 있는 기간과 해만 쓴다/);
  assert.match(P, /그 기간 → 두드러지는 주제 → 이 사람이 활용하거나 버거워할 방식 → 준비할 행동/);
  assert.match(P, /태어난 시각을 모르는 사람은 시주 근거가 없다/);
  // 자료의 종류
  assert.match(P, /\[자료의 종류를 섞지 않는다\]/);
  assert.match(P, /전통 해석은 검증된 사실이 아니라 읽는 방식/);
  assert.match(P, /입력한 MBTI\(source가 self\)는 본인이 알려 준 참고 정보다/);
  assert.match(P, /시기나 운 때문에 MBTI나 성향이 바뀐다고 쓰지 않는다/);
  assert.match(P, /유형 이름이나 검사 결과처럼 만들어 내지 않는다/);
  assert.match(P, /궁합 · 다른 상품 · 가격 · 구매 · 질문권을 이 글 안에서 안내하지 않고/);
  // 분야별 추가
  assert.match(P, /실제로 건넬 수 있는 짧은 말 한 문장/);
  assert.match(P, /성별에 따라 가사 · 경제 역할을 정하지 않고/);
  assert.match(P, /어느 쪽이 낫다고 정하지 않는다/);
  assert.match(P, /한 줄 규칙으로 결정을 내리지 않고/);
  assert.match(P, /행운의 색 · 숫자 · 방향 · 물건은 쓰지 않는다/);
  // 이미 있던 규칙은 그대로 — 엔진에 없는 것을 지어내지 않는다는 선과 충돌하지 않는다
  assert.match(P, /근거 목록에 없는 장면에서의 이 사람의 구체적 행동을 사실처럼 쓰지 않는다/);
  assert.match(P, /사주 용어\(일간 · 천간/);
});

test("쉬운 말 검사: 엔진이 근거로 주지 않는 학파 판단(격국 · 조후 · 월령 · 지장간 · 신살 · 희신 · 기신 · 신강/신약)을 본문에 쓰면 걸리고, 같은 글자가 든 일상어는 걸리지 않는다", () => {
  for (const bad of ["격국이 좋아서", "조후가 맞지 않아", "월령을 얻어", "지장간 속 글자", "신살이 있어요", "희신이 들어오면", "기신의 해예요", "도화살이 있어서", "역마살 때문에", "신강한 사주예요", "신약한 편이라"]) assert.ok(JARGON.test(bad), bad);
  for (const ok of ["신약 개발 회사에서 일하는 중이라", "도화지에 그림을 그리듯", "신약 연구팀과 함께", "기운이 신기하게 바뀌어요", "조용히 쉬는 시간", "강한 편이라 신경이 쓰여요"]) assert.equal(JARGON.test(ok), false, ok);
});

test("결정 대행 · 처방 · 상품 안내 검사: 나쁜 문장은 이유와 함께 걸리고, 선을 긋는 문장 · 모양이 비슷한 정상 문장은 걸리지 않는다", () => {
  const bad: [string, string][] = [
    ["지금 다니는 곳은 이직하세요.", "결정을 대신 내리는 말"],
    ["이번에는 동업하지 마세요.", "결정을 대신 내리는 말"],
    ["올해는 부동산을 사세요.", "투자 · 대출 권유 또는 수입 보장"],
    ["주식 투자는 해도 좋아요.", "투자 · 대출 권유 또는 수입 보장"],
    ["이 시기에는 수익이 보장돼요.", "투자 · 대출 권유 또는 수입 보장"],
    ["자녀운이 좋은 편이에요.", "출산 · 자녀 예언"],
    ["불임을 걱정하게 될 수 있어요.", "출산 · 자녀 예언"],
    ["행운의 색은 초록이에요.", "행운 상징을 처방으로 쓰는 표현"],
    ["개운법으로 이 숫자를 지니세요.", "행운 상징을 처방으로 쓰는 표현"],
    ["궁합까지 포함되어 있어요.", "다른 상품 · 구매 안내"],
    ["구매하면 더 자세히 알려 드려요.", "다른 상품 · 구매 안내"],
    ["질문권으로 더 물어볼 수 있어요.", "다른 상품 · 구매 안내"],
    ["심층 리포트에서 이어서 봐요.", "다른 상품 · 구매 안내"],
    ["30년 경력의 명리학자가 읽었어요.", "경력 · 전문성을 내세우는 표현"],
  ];
  for (const [s, why] of bad) assert.ok(adviceWhy(s).includes(why), `${s} → ${adviceWhy(s).join(",") || "걸리지 않음"}`);
  const ok = [
    "대출이나 투자는 사주로 정하지 않아요.",
    "퇴사를 고민할 때는 기준을 먼저 적어 보세요.",
    "이직이 가까워 보여도 서두르지 않는 편이에요.",
    "책임과 권한을 먼저 나누면 동업도 편해질 수 있어요.",
    "행운이 따르는 시기라고 읽기보다 준비하기 좋은 시기로 봐요.",
    "구매한 물건을 정리하듯 일의 순서를 정해 보세요.",
    "자녀와 가까운 관계에서는 말수가 줄 수 있어요.",
    "경력이 쌓이는 시기에는 맡는 일이 넓어질 수 있어요.",
  ];
  for (const s of ok) assert.deepEqual(adviceWhy(s), [], s);
});

test("실제 검사에 연결돼 있다: 서윤 예시 초안은 통과하고, 같은 초안에 나쁜 문장을 한 곳만 넣으면 이유와 함께 막힌다", () => {
  const base = draft();
  assert.equal(validateReadingDraft(base, SAMPLE_EVIDENCE).ok, true, "예시 초안은 새 검사도 통과한다");
  const make = (text: string) => {
    const d = draft();
    d.blocks[0].details[0] = text;
    return validateReadingDraft(d, SAMPLE_EVIDENCE);
  };
  const lead = "새 일을 맡을 때는 기준부터 세우는 편이라 시작이 조금 느려 보일 수 있어요.";
  const bads: [string, RegExp][] = [
    [`${lead} 그러니 지금 일은 이직하세요.`, /결정을 대신 내리는 말/],
    [`${lead} 올해는 수익이 보장돼요.`, /투자 · 대출 권유 또는 수입 보장/],
    [`${lead} 격국이 잘 짜인 구조예요.`, /사주 전문 용어\(격국\)/],
    [`${lead} 신살이 있어서 사람을 끌어요.`, /사주 전문 용어\(신살\)/],
    [`${lead} 심층 리포트에서 더 알려 드려요.`, /다른 상품 · 구매 안내/],
  ];
  for (const [text, re] of bads) {
    const r = make(text);
    assert.equal(r.ok, false, text);
    assert.ok(!r.ok && r.errors.some((e) => re.test(e)), `${text} → ${!r.ok ? r.errors.join(" / ") : "통과"}`);
  }
  const fine = make(`${lead} 대출이나 투자는 사주로 정하지 않고 기준부터 적어 두는 쪽이 어울려요.`);
  assert.equal(fine.ok, true, !fine.ok ? fine.errors.join(" / ") : "");
});

test("AI에게는 원국(간지)이 아니라 근거 목록이 간다 — 이름 · 생년월일 원문은 없고, 출처는 계산(saju) · 응답(survey) · 본인 입력(self)으로 나뉜다", () => {
  const msg = buildReadingUserMessage(SAMPLE_EVIDENCE, "2026-10-12", null);
  const payload = JSON.parse(msg.slice(msg.indexOf("{")));
  assert.deepEqual(Object.keys(payload).sort(), ["blocks", "evidence", "periods", "referenceDate", "terms"].sort(), "원국 표 · 이름 · 생년월일 항목이 없다");
  assert.ok(!/1994|서윤/.test(msg), "이름 · 생년월일 원문이 없다");
  const sources = new Set(payload.evidence.map((e: { source: string }) => e.source));
  assert.deepEqual([...sources].sort(), ["saju", "self", "survey"]);
  for (const e of payload.evidence) assert.ok(e.fact && e.cue && e.strength && e.topics, e.id);
  // 한 근거는 계산 사실(fact)과 해석 규칙(cue)이 나뉘어 있다 — 사주 근거의 cue는 "~로 봅니다" 전통 해석이다
  const dm = payload.evidence.find((e: { id: string }) => e.id === "saju.daymaster");
  assert.match(dm.fact, /일간 .*\(.\)/);
  assert.match(dm.cue, /봅니다/);
});

test("엔진이 근거로 주는 사주 자료에는 강약 · 월령 · 조후 · 격국 · 용신 · 지장간 · 신살이 없다(지시문이 \"목록에 있을 때만\"이라고 한 것과 같은 상태) — 엔진에 더하려면 지시문 · 쉬운 말 검사 · 전문가 검토 상태를 함께 바꾼다", () => {
  const charts = [
    calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" }),
    calculateSaju({ year: 1996, month: 3, day: 29, calendar: "solar", isLeapMonth: false, birthTime: null, gender: "female" }),
    calculateSaju({ year: 1988, month: 8, day: 15, calendar: "solar", isLeapMonth: false, birthTime: "23:30", gender: "male" }),
  ];
  for (const c of charts) {
    assert.equal(c.status, "ok");
    if (c.status !== "ok") continue;
    const ev = [...sajuEvidence(c, { reference: { year: 2026, month: 10 }, gender: c.gender ?? null }), ...surveyEvidence(sampleReport, "INFJ")];
    // "(지장간 제외)"는 지장간을 계산하지 않았다는 표시이지 지장간을 읽은 것이 아니다
    for (const e of ev) assert.equal(SCHOOL_DEPENDENT.test(`${e.id} ${e.fact} ${e.cue}`.replaceAll("(지장간 제외)", "")), false, `${e.id}: 근거에 학파 의존 용어가 들어 있다`);
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
