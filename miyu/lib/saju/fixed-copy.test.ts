// 실행: npm test — 코드가 쓰는 고정 문구(plain.ts · glossary.ts · rules.ts · questions.ts)가 "오행 · 십성이 없다 → 생활 기능이 부족하다"로 번역하지 않는지 확인한다(운영자 2026-10-17, 오행 직결 풀이 점검).
// 허용: "그 기운이 들어오는 시기에 그 주제가 상대적으로 크게 느껴질 수 있다 · 전통 해석은 생활에서 의식적으로 채우는 쪽을 권하는 경우가 많다". 막는 것: 없음을 능력 · 결함 · 행동의 원인으로 말하는 낱말.
// 한계: 낱말을 센 어림이다 — 말을 바꾼 단정은 못 잡는다. 문구는 전문가 검토 전 초안이다.
import assert from "node:assert/strict";
import test from "node:test";
import { SAMPLE_CHART } from "../samples/sample-report.ts";
import { personalQuestions } from "../report/questions.ts";
import { FIVE_ELEMENTS } from "./engine.ts";
import { GLOSSARY } from "./glossary.ts";
import { sajuEvidence } from "./interpret/rules.ts";
import { ELEMENT_INFO, plainSajuReading } from "./plain.ts";

/** 없음 · 적음을 생활 기능의 부족이나 행동의 원인으로 말하는 낱말 — 고정 문구에 나오면 안 된다 */
const LACK_AS_FUNCTION = /서툴|못 쉬|쉬지 못|시동이 천천히|시작을 못|결정을 못|돈 관리|돈복|재물복|여백 없이|흔들린다고 느낄|어렵게 느껴|덜 끌리|낯설거나|늦게 나올/;
const FRAME = /시기|전통 해석/;

test("plain.ts: 없음 · 적음의 풀이는 시기와 전통 해석의 틀 안에서만 말하고 생활 기능의 부족으로 옮기지 않는다", () => {
  for (const el of FIVE_ELEMENTS) {
    const info = ELEMENT_INFO[el];
    for (const [name, text] of [["few", info.few], ["relation", info.fewDomains.relation], ["work", info.fewDomains.work], ["choice", info.fewDomains.choice]] as const) {
      assert.ok(!LACK_AS_FUNCTION.test(text), `${el} ${name}: ${text}`);
      assert.ok(FRAME.test(text), `${el} ${name}: 시기 · 전통 해석의 틀이 없다 — ${text}`);
    }
    assert.ok(!/쉬어 가는 힘|시작하려는 힘|결단하는 힘/.test(info.force), `${el} force가 생활 기능 이름이다: ${info.force}`);
  }
});

test("원국 쉬운 풀이(plainSajuReading) · 근거 문구 · 용어집 · 개인 질문 어디에도 같은 번역이 없다 — 수가 없는 서윤의 원국으로 확인", () => {
  const plain = plainSajuReading(SAMPLE_CHART);
  const none = plain.elements.filter((e) => e.level === "none" || e.level === "few");
  assert.ok(none.length > 0, "없거나 적은 기운이 있는 원국이다");
  for (const e of none) {
    assert.ok(!LACK_AS_FUNCTION.test(e.plain), e.plain);
    for (const d of Object.values(e.domains ?? {})) assert.ok(!LACK_AS_FUNCTION.test(d), d);
  }
  for (const line of plain.everyday) assert.ok(!LACK_AS_FUNCTION.test(line), line);

  const evidence = sajuEvidence(SAMPLE_CHART, { reference: { year: 2026, month: 10 }, gender: "female" });
  const absent = evidence.filter((e) => /\.none$/.test(e.id));
  assert.ok(absent.length >= 2, "없음 근거가 있다");
  for (const e of absent) {
    assert.ok(!LACK_AS_FUNCTION.test(e.cue), `${e.id}: ${e.cue}`);
    assert.ok(!/(?:쉬어 가는|시작하는|결단하는|정리하는) 힘/.test(e.cue), `${e.id}가 오행을 생활 기능 이름으로 옮긴다: ${e.cue}`);
    assert.ok(/시기/.test(e.cue), `${e.id}: 시기의 틀이 있다 — ${e.cue}`);
    if (e.id.startsWith("saju.element.")) assert.ok(/결함/.test(e.cue), `${e.id}: 결함이 아니라는 안내가 있다 — ${e.cue}`);
  }
  for (const g of Object.values(GLOSSARY).filter((x) => ["목", "화", "토", "금", "수"].includes(x.term))) assert.ok(!/(?:쉬어 가는|시작하려는|결단하는|정리하고)\s*힘|힘으로 봅니다/.test(g.plain), `${g.term}: ${g.plain}`);

  for (const qa of personalQuestions(evidence)) assert.ok(!LACK_AS_FUNCTION.test(qa.answer), `${qa.id}: ${qa.answer}`);
});
