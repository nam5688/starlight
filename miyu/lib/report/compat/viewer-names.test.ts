// 실행: npm test — 리포트 궁합의 호칭(viewer-names.ts). 저장되는 글은 익명 "A님 · B님"이고(개인정보 계약), 화면이 읽는 사람(a · b)에 맞춰 보여 주기 직전에만 "본인 · 상대"로 바꾼다.
// 확인하는 것: ① 같은 저장 글을 A가 읽을 때와 B가 읽을 때 본인 · 상대가 서로 뒤바뀐다 ② 조사가 받침에 맞게 바뀐다 ③ 저장 글에는 이름이 들어가지 않고 화면에 자리표시자(A님 · B님)가 남지 않는다 ④ 화면이 읽는 사람(role)을 넘기는지(정적 확인).
// 비용 0 — 실제 AI · 결제 · DB 없음.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compatOf } from "../../saju/interpret/compat.ts";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import type { SajuOk } from "../../saju/engine.ts";
import { assemblePairReport } from "./assemble.ts";
import { composeMockCompat } from "./mock-model.ts";
import { buildPairUserMessage } from "./prompt.ts";
import { hasPlaceholder, viewerText } from "./viewer-names.ts";
import { validateCompatDraft } from "./validate.ts";

test("같은 저장 글이어도 A가 읽으면 A님이 본인, B가 읽으면 B님이 본인이다 — 서로 뒤바뀐다", () => {
  const stored = "A님이 먼저 연락을 꺼내고 B님은 한 번 더 확인하는 편이에요. A님과 B님이 함께 정할 일은 B님에게 먼저 물어보세요.";
  const a = viewerText(stored, "a");
  const b = viewerText(stored, "b");
  assert.equal(a, "본인이 먼저 연락을 꺼내고 상대는 한 번 더 확인하는 편이에요. 본인과 상대가 함께 정할 일은 상대에게 먼저 물어보세요.");
  assert.equal(b, "상대가 먼저 연락을 꺼내고 본인은 한 번 더 확인하는 편이에요. 상대와 본인이 함께 정할 일은 본인에게 먼저 물어보세요.");
  assert.notEqual(a, b);
  assert.ok(!hasPlaceholder(a) && !hasPlaceholder(b), "화면에 A님 · B님이 남지 않는다");
});

test("조사는 받침에 맞게 바뀐다 — 본인(받침 있음) · 상대(받침 없음)", () => {
  const cases: [string, "a" | "b", string][] = [
    ["A님은", "a", "본인은"], ["A님는", "a", "본인은"], ["A님이", "a", "본인이"], ["A님가", "a", "본인이"], ["A님을", "a", "본인을"], ["A님를", "a", "본인을"], ["A님과", "a", "본인과"], ["A님와", "a", "본인과"], ["A님의", "a", "본인의"], ["A님에게", "a", "본인에게"], ["A님도", "a", "본인도"], ["A님으로", "a", "본인으로"], ["A님이랑", "a", "본인이랑"],
    ["B님은", "a", "상대는"], ["B님이", "a", "상대가"], ["B님을", "a", "상대를"], ["B님과", "a", "상대와"], ["B님의", "a", "상대의"], ["B님에게", "a", "상대에게"], ["B님으로", "a", "상대로"], ["B님이랑", "a", "상대랑"], ["B님이나", "a", "상대나"],
    ["B님은", "b", "본인은"], ["A님은", "b", "상대는"], ["A님과 B님", "b", "상대와 본인"], ["A님 × B님", "a", "본인 × 상대"],
  ];
  for (const [input, viewer, expected] of cases) assert.equal(viewerText(input, viewer), expected, `${input} (${viewer})`);
  // 조사가 아닌 글자는 건드리지 않는다
  assert.equal(viewerText("두 분이 함께 있을 때 A님 쪽 속도를 먼저 맞춰요.", "a"), "두 분이 함께 있을 때 본인 쪽 속도를 먼저 맞춰요.");
  assert.equal(viewerText("이름 없는 글", "a"), "이름 없는 글");
});

const person = (y: number, m: number, d: number): SajuOk => {
  const r = calculateSaju({ year: y, month: m, day: d, calendar: "solar", isLeapMonth: false, birthTime: "09:30", gender: "female" });
  assert.equal(r.status, "ok");
  return r as SajuOk;
};

test("리포트 궁합 저장 글에는 이름이 들어가지 않는다 — 익명 A님 · B님 그대로 저장되고, 읽는 사람마다 서로 다른 화면 글이 된다", () => {
  const result = compatOf(person(1996, 3, 29), person(1994, 11, 2));
  const evidence = result.evidence;
  const message = buildPairUserMessage(evidence, result.cautions);
  const draft = composeMockCompat(message);
  const v = validateCompatDraft(draft, evidence, { pair: true });
  assert.ok(v.ok, JSON.stringify(v));
  const report = assemblePairReport(draft, result, { labels: [], skipped: 0 }, { provider: "mock", model: "mock", at: "2026-10-19T00:00:00Z" });
  const stored = JSON.stringify(report);
  // 저장 글 안의 호칭은 익명 자리표시자이고(예전 그대로), 이름 필드 자체가 없다
  assert.ok(!("names" in report), "리포트 궁합 저장 형식에는 이름이 없다");
  for (const forbidden of ["슬기", "남수", "지민", "도윤"]) assert.ok(!stored.includes(forbidden));
  // 화면 글 — 같은 저장 글이 읽는 사람에 따라 달라지고, 자리표시자는 어느 쪽에도 남지 않는다
  const view = (viewer: "a" | "b") => [report.headline, ...report.sections.flatMap((s) => [s.headline, ...s.paragraphs]), ...Object.values(report.steps).flat().flatMap((x) => [x.title, x.detail, x.say]), ...(report.questions ?? [])].map((t) => viewerText(t, viewer));
  const a = view("a");
  const b = view("b");
  for (const t of [...a, ...b]) assert.ok(!hasPlaceholder(t), t);
  // 모의 글은 이름을 부르지 않으므로 같은 글이다 — 호칭이 들어 있는 글로 뒤바뀜을 확인한다
  const named = { ...report, sections: report.sections.map((s, i) => (i === 0 ? { ...s, paragraphs: [`${s.paragraphs[0]} A님이 먼저 움직이고 B님은 확인하는 때가 있어요.`] } : s)) };
  const first = (viewer: "a" | "b") => viewerText(named.sections[0]!.paragraphs[0]!, viewer);
  assert.ok(first("a").endsWith("본인이 먼저 움직이고 상대는 확인하는 때가 있어요."));
  assert.ok(first("b").endsWith("상대가 먼저 움직이고 본인은 확인하는 때가 있어요."));
});

test("화면은 읽는 사람(role)을 넘기고 리포트 궁합 글에만 호칭을 바꾼다 — 사주 궁합(구매자 본인의 이름이 이미 들어 있는 글)은 그대로", () => {
  const view = readFileSync(new URL("../../../components/report/compat-report-view.tsx", import.meta.url), "utf8");
  assert.match(view, /const vt = \(t: string\): string => \(pair && viewer \? viewerText\(t, viewer\) : t\);/);
  for (const part of ["vt(report.headline)", "vt(sec.headline)", "vt(p)", "vt(a.title)", "vt(a.detail)", "vt(a.say)", "vt(q)", "vt(stepLabel(g.id, names))"]) assert.ok(view.includes(part), part);
  const page = readFileSync(new URL("../../../app/pair/[pairId]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<CompatReportView report=\{view\.report\.report\} viewer=\{view\.role\} \/>/);
  // 저장하는 조립 코드는 이름으로 바꾸지 않는다(리포트 궁합 assemblePairReport) — 사주 궁합만 nameText로 바꾼다
  const assemble = readFileSync(new URL("./assemble.ts", import.meta.url), "utf8");
  const pairPart = assemble.slice(assemble.indexOf("export function assemblePairReport"));
  assert.ok(!pairPart.includes("nameText("), "리포트 궁합은 저장 글에 이름을 넣지 않는다");
});
