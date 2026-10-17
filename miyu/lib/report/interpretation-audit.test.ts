// 실행: npm test — 22문항(개발용 예시, v1 유지)의 해석 점검(운영자 2026-10-17): ① 답을 그대로 되풀이한 문장이 없다 ② 근거 범위를 넘는 확대가 없다 ③ 애착 유형을 단정하지 않는다.
// 새 문항을 더하지 않고 해석 문장만 점검한다. 낱말 · 글자 겹침을 센 어림이라 말만 바꾼 되풀이 · 미묘한 확대는 못 찾는다 — 사람이 읽는 평가가 본다. 실제 사람의 응답으로 검증하지 않았다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { TENDENCY_NAMES, TENDENCY_PHRASES, type TendencyId } from "../assessment/dev-rules.ts";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import type { FreeSummary } from "./types.ts";
import { DEV_SUMMARY_TEMPLATES } from "./dev-summary-templates.ts";
import { buildFreeInsight } from "./free-insight.ts";
import { surveyEvidence } from "./survey-evidence.ts";
import { sampleReport } from "../samples/sample-report.ts";

const TENDENCIES: TendencyId[] = ["reassurance", "distance", "stability", "exploration"];
const items = ASSESSMENT_MODULES.flatMap((m) => m.items);
const norm = (t: string) => t.replace(/[\s.,!?·'"“”‘’()\-]/g, "");
const longestShared = (a: string, b: string) => {
  let best = 0;
  for (let i = 0; i < a.length; i++) for (let len = best + 1; i + len <= a.length; len++) if (b.includes(a.slice(i, i + len))) best = len;
  else break;
  return best;
};
/** 문항 문장과 이만큼(정규화한 글자 수) 겹치면 답을 되풀이한 것으로 본다 — 지금 문장들은 모두 이보다 적게 겹친다 */
const RESTATE_MIN = 9;
const ATTACHMENT_TYPE = /(?:안정|불안|회피|혼란)\s*(?:형|애착)|애착\s*유형|(?:불안|회피)(?:형|적)\s*(?:인|사람|성향)/;

/** 모든 문장이 나오도록 극단 응답으로 돌린다(동의 쪽 · 반대 쪽) — 문항 22개가 그대로다 */
function everyInsight() {
  const rows: { tendency: TendencyId; itemId: string; text: string }[] = [];
  for (const t of TENDENCIES) {
    for (const v of [5, 1]) {
      const answers = Object.fromEntries(items.map((i) => [i.id, v]));
      const f = buildFreeInsight(answers, t);
      if (f) for (const b of f.basis) rows.push({ tendency: t, itemId: b.itemId, text: f.text });
    }
  }
  return rows;
}

test("문항은 22개이고(새 문항을 더하지 않았다), 무료 해석 문장 12개가 모두 점검 대상이다", () => {
  assert.equal(items.length, 22);
  const keys = new Set(everyInsight().map((r) => `${r.tendency}:${r.itemId}`));
  assert.equal(keys.size, 12, `점검된 문장 ${keys.size}개 — 문장을 더했다면 이 수와 점검을 함께 고친다`);
});

test("① 답을 되풀이하지 않는다: 무료 해석 문장이 문항 문장과 9자 이상 겹치지 않는다", () => {
  for (const r of everyInsight()) {
    const item = items.find((i) => i.id === r.itemId)!;
    const shared = longestShared(norm(r.text), norm(item.text));
    assert.ok(shared < RESTATE_MIN, `${r.tendency}:${r.itemId} 문장이 문항과 ${shared}자 겹칩니다 — 답을 풀어 쓰지 말고 그 답이 일상에서 어떻게 나타날 수 있는지로 쓰세요`);
  }
});

test("① 해석은 단정하지 않는다: 무료 해석 문장은 모두 '~할 수 있어요' 같은 가능성으로 끝난다", () => {
  for (const r of everyInsight()) for (const sentence of r.text.split(/(?<=\.)\s+/)) assert.match(sentence, /수 있어요\.$/, `${r.tendency}:${r.itemId} "${sentence}"`);
});

test("② 근거를 넘어 확대하지 않는다: 요약 템플릿의 '반복 반응 · 스트레스 상황'은 그 경향을 읽은 문항이 묻지 않은 장면(계획 변경 · 즉각적인 답 요구 · 감정적인 대화)을 사실처럼 쓰지 않는다", () => {
  const beyond = /계획이 갑자기 바뀌|즉각적인 답|감정적인 대화|연락 빈도|추측하고 다시 확인|물러나/;
  for (const t of TENDENCIES) {
    const tpl = DEV_SUMMARY_TEMPLATES[t];
    for (const [k, v] of Object.entries(tpl.core)) assert.doesNotMatch(v, beyond, `${t}.${k}: "${v}"`);
    // 반응 · 스트레스 문장은 단정("~합니다")이 아니라 가능성이거나 조건("~때")이어야 한다
    assert.ok(/수 있습니다|편일 수|때$/.test(tpl.core.repeatedReaction) || /때$/.test(tpl.core.stressTrigger), `${t}의 반복 반응은 가능성으로 쓴다`);
    assert.doesNotMatch(tpl.core.repeatedReaction, /합니다\.$/, `${t}.repeatedReaction은 단정으로 끝나지 않는다`);
  }
  assert.doesNotMatch(sampleReport.core.repeatedReaction + sampleReport.core.stressTrigger, beyond, "예시 리포트도 같은 규칙");
});

test("② 근거를 넘어 확대하지 않는다: 관계 불안 · 거리 두기가 함께 높을 때의 근거는 '가까워지고 싶은 마음'이나 유형을 만들어 내지 않고 단정하지 않는다고 적는다", () => {
  const summary = {
    temperament: [],
    relationship: [
      { id: "anxiety", label: "관계 불안", score: 70, lowMeaning: "낮음", highMeaning: "높음" },
      { id: "avoidance", label: "거리 두기", score: 68, lowMeaning: "낮음", highMeaning: "높음" },
    ],
    mbti: { axes: [] },
  } as unknown as FreeSummary;
  const both = surveyEvidence(summary, null).find((e) => e.id === "survey.closeness.both");
  assert.ok(both, "두 점수가 모두 55 이상이면 근거가 만들어진다");
  assert.doesNotMatch(both.cue, /가까워지고 싶은 마음/, "문항이 묻지 않은 바람을 읽지 않는다");
  assert.match(both.cue, /단정하지 않고/);
  assert.match(both.cue, /애착의 유형이 어떤지는 말하지 않습니다/);
  assert.equal(both.strength, "moderate", "두 경향의 동시 출현은 강한 근거로 올리지 않는다");
});

test("③ 애착 유형을 단정하지 않는다: 사용자에게 보이는 해석 문장 · 이름 · 방향 설명 · AI에게 가는 근거에 애착 유형 이름이 없다", () => {
  const texts: string[] = [];
  for (const r of everyInsight()) texts.push(r.text);
  for (const m of ASSESSMENT_MODULES) for (const d of m.dimensions) texts.push(d.label, d.lowMeaning, d.highMeaning);
  for (const t of TENDENCIES) texts.push(TENDENCY_NAMES[t], TENDENCY_PHRASES[t], DEV_SUMMARY_TEMPLATES[t].oneLiner, ...Object.values(DEV_SUMMARY_TEMPLATES[t].core));
  const summary = { temperament: [], relationship: [{ id: "anxiety", label: "관계 불안", score: 90, lowMeaning: "낮음", highMeaning: "관계가 불확실하면 상대의 반응을 확인하고 싶어집니다" }, { id: "avoidance", label: "거리 두기", score: 88, lowMeaning: "낮음", highMeaning: "가까워질수록 혼자만의 거리가 필요합니다" }], mbti: { axes: [] } } as unknown as FreeSummary;
  for (const e of surveyEvidence(summary, "INFJ")) texts.push(e.fact, e.cue);
  for (const t of texts) assert.doesNotMatch(t, ATTACHMENT_TYPE, `애착 유형 이름이 보입니다: ${t.slice(0, 60)}`);
});

test("③ 대표 경향 이름은 후보 이름이고 화면에는 설명 문구가 나간다 — 설명 문구는 '~한 편'으로 끝나는 가벼운 말이다", () => {
  for (const t of TENDENCIES) assert.match(TENDENCY_PHRASES[t], /편$/);
});
