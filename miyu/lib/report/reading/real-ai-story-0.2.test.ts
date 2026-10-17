// 실행: npm test — 실제 서비스 AI(claude-sonnet-5-5)가 story-v1 지시문 0.2로 쓴 글(가상 인물 P01, 2026-10-17, 운영자 PC 실행)을 제품 검사에 다시 넣어 본다.
// 그 글은 재작성까지 두 번 모두 형식 검사를 통과하지 못해 리포트로 저장되지 않았다(기록은 docs/samples/real-ai/). 실제 실행 당시의 검사는 4문장 한 건만 잡았고,
// 없는 십성("식상은 보이지 않아서 … 부담")을 생활 부담으로 푼 문장은 잡지 못했다 — 글을 본 뒤 검사를 넓혔다(사후 수정). 이 시험은 그 상태를 고정한다.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildPersonas } from "../ai/compare-personas.ts";
import { buildEvidence } from "../ai/generator.ts";
import { checkReadingDepth } from "./depth.ts";
import { storyDepthSource } from "./story-assemble.ts";
import { normalizeStoryDraft } from "./story-motif.ts";
import { validateStoryDraft } from "./story-validate.ts";
import type { StoryDraftV1 } from "./types.ts";

const DIR = "../../../docs/samples/real-ai/story-0.2-P01-story-p01-20261017-020347/";
const FIXTURE = new URL(`${DIR}failed/P01-X-round2.json`, import.meta.url);
/** 실제 AI 원문의 해시 — 원문은 바꾸지 않고 보존한다 */
const ORIGINAL_SHA256 = "142a01c977418d93aa38a3598b91de066791adf4dde9b4a1634c1ebe9d6696d3";

test("실제 AI의 story-v1 0.2 글(P01, 재작성 뒤): 원문이 그대로이고, 지금 검사는 4문장 1건 + 없는 십성 풀이 1건 + 작성 과정 문장 2건 + 재물 비어 있음 1건을 잡는다", () => {
  const buf = readFileSync(FIXTURE);
  assert.equal(createHash("sha256").update(buf).digest("hex"), ORIGINAL_SHA256, "실제 AI 원문은 바꾸지 않는다");
  const p = buildPersonas(2)[0];
  const evidence = buildEvidence(p.input, { year: 2026, month: 10 });
  const raw = JSON.parse(buf.toString("utf8")) as StoryDraftV1;
  const check = (draft: unknown) => {
    const r = validateStoryDraft(draft, evidence, { hasContext: Boolean(p.input.context) });
    assert.equal(r.ok, false);
    return r.ok ? [] : r.errors;
  };
  const errors = check(raw);
  // 실제 실행에서 걸린 한 건: 핵심 영역 둘째 문단이 4문장
  assert.ok(errors.some((e) => /areas\.core.*paragraphs\[1\]: 4문장/.test(e)), errors.join("\n"));
  // 사후 보강으로 잡히게 된 것들: 식상이 없다는 것을 결과물을 내보이는 부담으로 푼 문장 · 글을 쓴 사정을 말하는 두 문장 · 돈 이야기가 비어 있음
  assert.ok(errors.some((e) => /work-money.*식상.*생활 기능의 부족이나 원인/.test(e)), errors.join("\n"));
  assert.equal(errors.filter((e) => /작성 과정을 말하는 문장/.test(e)).length, 2, errors.join("\n"));
  assert.ok(errors.some((e) => /일과 재물 영역에 돈 이야기가 없습니다/.test(e)), errors.join("\n"));
  assert.equal(errors.length, 5, errors.join("\n"));
  // 문단 나눔 보정을 거치면 4문장 한 건은 사라진다(문장은 그대로, 문단 나눔만 둘로 — 한 문단 때문에 글 전체를 버리지 않는다)
  const normalized = normalizeStoryDraft(raw);
  const fixed = check(normalized);
  assert.ok(!fixed.some((e) => /4문장/.test(e)), fixed.join("\n"));
  assert.equal(fixed.length, 4, fixed.join("\n"));
  const flat = (d: StoryDraftV1) => d.areas.flatMap((a) => a.paragraphs).join(" ");
  assert.equal(flat(normalized).replace(/\s+/g, " "), flat(raw).replace(/\s+/g, " "), "문장은 한 글자도 바뀌지 않는다");
  // 내용 검사(어림)는 통과한다 — 통과가 좋은 글이라는 뜻이 아니다(반복 · 일반론은 글을 읽어야 보인다)
  assert.equal(checkReadingDepth({ draft: storyDepthSource(raw) }).pass, true);
});

test("실제 AI 글의 반복 모티프를 고정한다: '정리'가 제목 · 카드 · 영역 · 시기 · 고민 · 행동에 걸쳐 열 번 넘게 나온다(검사로는 못 잡는 반복의 측정)", () => {
  const raw = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const count = (JSON.stringify(raw).match(/정리/g) ?? []).length;
  assert.ok(count >= 15, `정리 ${count}회`);
});
