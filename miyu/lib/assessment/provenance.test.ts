// 실행: npm test — 문항 개발 기록: 화면에 연결된 문항마다 기록이 있고, 기록에 없는 문항 · 확인하지 않은 것을 확인했다고 쓴 표현이 없다
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "./modules/index.ts";
import { CHECKED, DEVELOPMENT, ITEM_RECORDS, MODULE_RECORDS, NOT_CHECKED, PROVENANCE_UPDATED, SIMILARITY, SIMILARITY_LABEL, SOURCES, STANCE_NOTE, provenanceRows, scoringText, versionRows } from "./provenance.ts";

/** 공개 페이지에 그대로 실리는 글 */
const publicText = () => [...CHECKED, ...NOT_CHECKED, ...DEVELOPMENT, STANCE_NOTE, ...SOURCES.flatMap((s) => [s.name, s.used, s.scope]), ...versionRows().flatMap((v) => [v.label, v.version, v.note])].join("\n");

const liveItems = ASSESSMENT_MODULES.flatMap((m) => m.items);

test("화면에 연결된 문항(22개)마다 개발 기록이 있고, 기록에는 지금 없는 문항이 없다", () => {
  assert.equal(liveItems.length, 22);
  for (const item of liveItems) {
    const r = ITEM_RECORDS[item.id];
    assert.ok(r, `${item.id} 개발 기록이 없다 — 새 문항을 화면에 연결하면 lib/assessment/provenance.ts에도 기록을 더한다`);
    assert.ok(r.behavior.length >= 8 && r.why.length >= 15, `${item.id} 기록이 비어 있다`);
  }
  const ids = new Set(liveItems.map((i) => i.id));
  for (const id of Object.keys(ITEM_RECORDS)) assert.ok(ids.has(id), `${id}는 화면에 없는 문항이다`);
});

test("모듈마다 구조 대응 · 가져오지 않은 것 · 다루는 방식이 적혀 있다", () => {
  for (const m of ASSESSMENT_MODULES) {
    const r = MODULE_RECORDS.find((x) => x.moduleId === m.id);
    assert.ok(r, m.id);
    assert.ok(/대응/.test(r.corresponds), `${m.id}: 기존 이론과의 대응을 숨기지 않고 적는다`);
    assert.ok(/가져오지 않/.test(r.notUsed), `${m.id}: 가져오지 않은 것을 적는다`);
    assert.ok(/개발용 예시/.test(r.handling), `${m.id}: 정식 검사가 아니라고 적는다`);
  }
  // 기질 모듈은 이름만 바꾼다고 독립이 되지 않는다는 점을 적는다
  assert.ok(/구조가 독립이 되지는 않/.test(MODULE_RECORDS.find((r) => r.moduleId === "temperament")!.corresponds));
});

test("점수를 읽는 법은 문항 정의(정문항 · 역문항)에서 계산한다", () => {
  const rows = provenanceRows();
  assert.equal(rows.reduce((n, r) => n + r.items.length, 0), 22);
  const m1 = rows.find((r) => r.module.id === "mbti")!.items.find((x) => x.item.id === "m1")!;
  assert.match(m1.scoring, /혼자 정리하며 채움/);
  assert.match(m1.scoring, /그대로 계산/);
  const m2 = rows.find((r) => r.module.id === "mbti")!.items.find((x) => x.item.id === "m2")!;
  assert.match(m2.scoring, /뒤집어 계산/);
  assert.match(m2.scoring, /함께하며 채움/);
  for (const row of rows) for (const x of row.items) assert.ok(scoringText(x.item, row.module).length > 20, x.item.id);
});

test("확인하지 못한 것을 확인했다고 쓰지 않고, 법적 안전 · 정확도 · 전문가 감수를 주장하지 않는다", () => {
  const all = [...CHECKED, ...NOT_CHECKED, ...DEVELOPMENT, STANCE_NOTE, ...SOURCES.flatMap((x) => [x.used, x.scope]), ...MODULE_RECORDS.flatMap((m) => [m.corresponds, m.notUsed, m.handling]), ...Object.values(ITEM_RECORDS).flatMap((r) => [r.behavior, r.why])].join("\n");
  for (const bad of [/검증(됐|된|을 마)/, /정확도가 (높|보장)/, /전문가 감수(를 마|했|됨)/, /법적으로 (문제가 없|안전)/, /법에 (걸리지|저촉되지) 않/, /TCI[^.]*(참고해|바탕으로|그대로)/, /MBTI®?[^.]*(와 같은|환산)/]) {
    assert.ok(!bad.test(all), `쓰면 안 되는 표현: ${bad}`);
  }
  assert.ok(NOT_CHECKED.some((t) => /법률 검토는 받지 않았/.test(t)), "법률 검토를 받지 않았다는 것을 적는다");
  assert.ok(NOT_CHECKED.some((t) => /전문가의 검토/.test(t) && /받지 않았/.test(t)), "전문가 검토를 받지 않았다는 것을 적는다");
});

test("공개 페이지는 다섯 가지(성향 · 개발 방법 · 자료와 이용 허락 · 확인한 것 · 버전과 수정일)만 싣고 문항 문장 · 문항별 기록은 싣지 않는다", () => {
  const text = publicText();
  for (const item of liveItems) assert.ok(!text.includes(item.text), `${item.id} 문항 문장은 공개 요약에 싣지 않는다`);
  for (const r of Object.values(ITEM_RECORDS)) assert.ok(!text.includes(r.why), "문항별 기록은 내부에 둔다");
  assert.ok(SOURCES.length >= 3 && SOURCES.every((s) => s.used.length > 10 && s.scope.length > 10), "자료마다 쓴 것 · 이용 허락 범위를 적는다");
  const versions = versionRows();
  assert.equal(versions.length, ASSESSMENT_MODULES.length + 1);
  assert.ok(versions.every((v) => v.version.length > 3));
  assert.match(PROVENANCE_UPDATED, /^\d{4}-\d{2}-\d{2}$/);
});

test("하지 않은 전문가 검토 · 검증 · 이용 허락을 했다고 쓰지 않는다 (계획으로도 약속하지 않는다)", () => {
  const text = publicText();
  for (const bad of [/전문가(의)? (검토|감수)(를|가)? (받았|마쳤|거쳤|완료)/, /(검증|검토)(을)? (마쳤|거쳤|완료)/, /이용 허락을 (받았|얻었)/, /출시 전에 받을 계획/, /검증된 (검사|문항)/]) {
    assert.ok(!bad.test(text), `쓰면 안 되는 표현: ${bad}`);
  }
  assert.ok(SOURCES.some((s) => /이용 허락을 받지 않았/.test(s.scope)), "공식 검사는 이용 허락을 받지 않아 쓰지 않았다고 적는다");
  assert.ok(DEVELOPMENT.some((t) => /닮았/.test(t) && /독립이 되는 것은 아니/.test(t)), "구성이 기존 연구와 닮았다는 점을 숨기지 않는다");
});

test("화면의 문항 문장은 예전 이름 · 글자 코드로 MBTI를 흉내 내지 않는다", () => {
  const mbti = ASSESSMENT_MODULES.find((m) => m.id === "mbti")!;
  assert.equal(mbti.title, "평소 행동 방식");
  for (const d of mbti.dimensions) {
    assert.ok(!("lowCode" in d) && !("highCode" in d), "글자 코드는 쓰지 않는다");
    assert.ok(!/외향|내향|감각|직관|사고|감정|판단|인식/.test(`${d.lowName} ${d.highName}`), `유형론 용어 대신 행동으로 말한다: ${d.id}`);
  }
});

test("닮음 표시: 화면 문항마다 있고(내부 기록), 우선 확인 표시는 이유를 적으며, 공개 요약에는 싣지 않는다", () => {
  for (const item of liveItems) {
    const s = SIMILARITY[item.id];
    assert.ok(s, `${item.id} 닮음 표시가 없다`);
    assert.ok(s.note.length >= 15 && SIMILARITY_LABEL[s.level], item.id);
  }
  assert.deepEqual(Object.keys(SIMILARITY).sort(), liveItems.map((i) => i.id).sort());
  const checks = Object.entries(SIMILARITY).filter(([, s]) => s.level === "check");
  assert.ok(checks.length >= 1, "우선 확인 표시가 하나도 없다면 점검을 다시 해야 한다");
  for (const [id, s] of checks) assert.ok(/대조는 못 했/.test(s.note), `${id}: 대조하지 못했다는 것을 적는다`);
  // 닮지 않았다는 보증으로 읽히는 표현 금지 (표시는 기억과 판단일 뿐이다)
  const all = Object.values(SIMILARITY).map((s) => s.note).join("\n") + Object.values(SIMILARITY_LABEL).join("\n");
  for (const bad of [/문제가 없/, /안전하/, /침해(가|는)? 아니/, /독립(적으로)? 개발(됐|했)/]) assert.ok(!bad.test(all), `${bad}`);
  const pub = publicText();
  for (const s of Object.values(SIMILARITY)) assert.ok(!pub.includes(s.note), "닮음 표시는 내부 문서에만 둔다");
});
