// 실행: npm test — 장면 질문 별도 버전 설계 초안: 구조 · 선택지 중립 · 조합 규칙 · 22문항 검토 · 예시 글 검사 · 화면 미연결
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../modules/index.ts";
import { FORBIDDEN, sentences } from "../../report/v2/validate.ts";
import { AGE_TEXT, ANSWER_ECHO, BLOCK_PLAN, CAUSE_NARROWING, HEDGE_REPEAT, JARGON, READING_LIMITS, SCORE_TEXT } from "../../report/reading/plan.ts";
import {
  CANDIDATES,
  COMBOS,
  EXAMPLES,
  HOLD_TEXT,
  ITEM_REVIEWS,
  NONE_OPTIONS,
  SCENES,
  SCENE_BY_ID,
  THREADS,
  THREAD_BY_ID,
  readScenarios,
  readThread,
  tagOf,
  textOverlap,
  type ScenarioAnswers,
} from "./scenario-v1.ts";

test("구분 5개 · 장면 10개: 구분마다 서로 다른 장면 2개, 장면마다 선택지 4개와 이름표가 겹치지 않는다", () => {
  assert.equal(THREADS.length, 5);
  assert.equal(SCENES.length, 10);
  assert.equal(new Set(SCENES.map((s) => s.id)).size, 10);
  for (const t of THREADS) {
    const own = SCENES.filter((s) => s.thread === t.id);
    assert.deepEqual(own.map((s) => s.id), t.scenes, `${t.id}: 장면 2개`);
    assert.notEqual(own[0]!.label, own[1]!.label, `${t.id}: 서로 다른 장면`);
  }
  for (const s of SCENES) {
    assert.equal(s.options.length, 4, s.id);
    assert.deepEqual(s.options.map((o) => o.id), ["a", "b", "c", "d"], s.id);
    assert.equal(new Set(s.options.map((o) => o.tag)).size, 4, `${s.id}: 이름표가 겹친다`);
    assert.equal(new Set(s.options.map((o) => o.text)).size, 4, `${s.id}: 선택지 문장이 겹친다`);
    assert.ok(s.ask.endsWith("?") && s.ask.length <= 70, `${s.id}: 질문 문장 길이 · 끝`);
    for (const o of s.options) assert.ok(o.text.length >= 8 && o.text.length <= 45, `${s.id}${o.id}: 선택지가 너무 짧거나 길다`);
    assert.ok(s.difference.length >= 20 && s.watch.length >= 20, `${s.id}: 구분 · 확인점이 비었다`);
  }
  assert.equal(NONE_OPTIONS.length, 2);
  assert.deepEqual(NONE_OPTIONS.map((o) => o.kind), ["no-experience", "no-fit"]);
});

test("구분마다 구분하려는 차이 · 붙이면 안 되는 결론 · 사주 연결 지점 · 겹치는 개념이 적혀 있고, 리포트 영역 id가 실제로 있다", () => {
  const blockIds = new Set(BLOCK_PLAN.map((b) => b.id as string));
  for (const t of THREADS) {
    assert.ok(t.asks.length >= 30, t.id);
    assert.ok(t.notThis.length >= 3, `${t.id}: 붙이면 안 되는 결론이 부족하다`);
    assert.ok(t.sajuPairs.length >= 2, `${t.id}: 사주 연결 지점이 부족하다`);
    for (const p of t.sajuPairs) assert.ok(p.cue.length >= 10 && p.effect.length >= 20, t.id);
    assert.ok(t.overlap.length >= 30 && /가져오지 않았/.test(t.overlap), `${t.id}: 겹치는 개념과 가져오지 않았다는 말`);
    for (const b of t.blocks) assert.ok(blockIds.has(b), `${t.id}: 없는 영역 ${b}`);
  }
});

test("선택지는 성향 이름 · 유형 · 좋고 나쁨의 말을 쓰지 않는다 (좋게 보이는 답 · 나빠 보이는 답을 만들지 않는다)", () => {
  const BAD = /불안(?!정)|회피|안정형|안정적|애착|유형|성격|외향|내향|독립적|의존|집착|완벽|제대로|잘못|올바|훌륭|좋은 |나쁜 |당연히|못하|게으|성실|책임감이 (?:강|약)/;
  for (const s of SCENES) {
    assert.doesNotMatch(s.ask, BAD, `${s.id}: 질문`);
    for (const o of s.options) assert.doesNotMatch(o.text, BAD, `${s.id}${o.id}: ${o.text}`);
  }
  // 질문 안에 결론이 들어가지 않는다: "~한가요?" 식 성향 확인 · "나는 ~한 편이다" 진술
  for (const s of SCENES) assert.doesNotMatch(s.ask, /한가요\?$|편인가요|인가요\?$/, `${s.id}: 성향을 직접 묻는 질문`);
  for (const s of SCENES) for (const o of s.options) assert.doesNotMatch(o.text, /편이다$|편이에요$/, `${s.id}${o.id}: 나는 ~한 편이다 진술`);
});

test("조합 규칙: 이름표가 실제 장면에 있고, 같은 구분 안에서 두 조합이 같은 답 쌍을 가리지 않으며, 모든 선택지가 적어도 한 조합에 쓰인다", () => {
  for (const t of THREADS) {
    const [s1, s2] = t.scenes.map((id) => SCENE_BY_ID[id]!);
    const tags1 = new Set(s1!.options.map((o) => o.tag));
    const tags2 = new Set(s2!.options.map((o) => o.tag));
    const combos = COMBOS.filter((c) => c.thread === t.id);
    assert.ok(combos.length >= 4, `${t.id}: 대표 조합이 부족하다`);
    const seen = new Map<string, string>();
    for (const c of combos) {
      assert.ok(c.meaning.length >= 30 && c.notThis.length >= 4, c.id);
      for (const a of c.first) assert.ok(tags1.has(a), `${c.id}: ${a}가 첫 장면에 없다`);
      for (const b of c.second) assert.ok(tags2.has(b), `${c.id}: ${b}가 둘째 장면에 없다`);
      for (const a of c.first) for (const b of c.second) {
        const key = `${a}|${b}`;
        assert.ok(!seen.has(key), `${c.id}와 ${seen.get(key)}가 같은 답 쌍(${key})을 가리킨다`);
        seen.set(key, c.id);
      }
    }
    for (const tag of tags1) assert.ok(combos.some((c) => c.first.includes(tag)), `${t.id}: ${tag}가 어느 조합에도 없다`);
    for (const tag of tags2) assert.ok(combos.some((c) => c.second.includes(tag)), `${t.id}: ${tag}가 어느 조합에도 없다`);
  }
  assert.equal(new Set(COMBOS.map((c) => c.id)).size, COMBOS.length);
});

test("읽기: 두 장면 모두 선택지를 골랐을 때만 읽고, '거의 없었어요' · '맞는 선택지 없음' · 미응답은 성향으로 읽지 않는다", () => {
  const r = readThread("D4", { S7: "a", S8: "a" });
  assert.equal(r.kind, "combo");
  assert.equal(r.kind === "combo" && r.combo.id, "C4.1");
  assert.equal(readThread("D4", { S7: "a", S8: "c" }).kind === "combo" && (readThread("D4", { S7: "a", S8: "c" }) as { combo: { id: string } }).combo.id, "C4.2");
  // 대표 조합에 없는 쌍은 일반화하지 않는 fallback
  const fb = readThread("D4", { S7: "a", S8: "b" });
  assert.equal(fb.kind, "fallback");
  // 한 장면이라도 해당 없음 · 맞는 선택지 없음 · 미응답이면 그 구분은 읽지 않는다
  for (const none of ["x", "y", undefined] as const) {
    const h = readThread("D4", { S7: "a", S8: none });
    assert.equal(h.kind, "hold");
    assert.equal(h.kind === "hold" && h.text, HOLD_TEXT);
    assert.deepEqual(h.kind === "hold" && h.missing, ["S8"]);
  }
  assert.equal(tagOf("S7", "x"), undefined);
  assert.equal(tagOf("S7", "y"), undefined);
  assert.equal(tagOf("S7", "a"), "carry-on");
  // 전부 해당 없음이어도 아무 구분도 읽지 않고 점수 · 유형이 없다
  const all = Object.fromEntries(SCENES.map((s) => [s.id, "x"])) as ScenarioAnswers;
  assert.ok(readScenarios(all).every((x) => x.kind === "hold"));
  assert.equal(readScenarios({}).length, 5);
});

test("답 조합이 풀이를 바꾼다: 같은 구분 안에서 서로 다른 의미가 나오는 답 쌍이 있고, 한 장면의 답만 바뀌어도 의미가 달라진다", () => {
  for (const t of THREADS) {
    const [s1, s2] = t.scenes.map((id) => SCENE_BY_ID[id]!) as [typeof SCENES[number], typeof SCENES[number]];
    const meanings = new Set<string>();
    let covered = 0;
    for (const o1 of s1.options) for (const o2 of s2.options) {
      const r = readThread(t.id, { [s1.id]: o1.id, [s2.id]: o2.id } as ScenarioAnswers);
      assert.notEqual(r.kind, "hold");
      if (r.kind === "combo") {
        covered++;
        meanings.add(r.combo.id);
      }
    }
    assert.ok(covered >= 8, `${t.id}: 대표 조합이 16쌍 중 ${covered}쌍뿐이다`);
    assert.ok(meanings.size >= 4, `${t.id}: 서로 다른 의미가 ${meanings.size}개뿐이다`);
  }
  // 같은 답 하나(평소처럼 지냄)여도 둘째 장면의 답이 바뀌면 의미가 달라진다 — 22문항 방식에서는 같은 문장이 나오던 자리
  const a = readThread("D4", { S7: "a", S8: "a" });
  const b = readThread("D4", { S7: "a", S8: "c" });
  assert.ok(a.kind === "combo" && b.kind === "combo" && a.combo.meaning !== b.combo.meaning);
});

test("지금 화면의 22문항 검토: 22개 모두 판단 · 이유 · 구분할 차이 · 새 질문 · 함께 볼 문항이 있고, 수정은 조합 예시가 있다", () => {
  const current = ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => ({ id: i.id, text: i.text })));
  assert.equal(current.length, 22);
  assert.deepEqual(ITEM_REVIEWS.map((r) => r.id).sort(), current.map((c) => c.id).sort(), "22문항 전부를 검토해야 한다");
  const sceneIds = new Set(SCENES.map((s) => s.id as string));
  const candIds = new Set(CANDIDATES.map((c) => c.id as string));
  for (const r of ITEM_REVIEWS) {
    assert.equal(r.text, current.find((c) => c.id === r.id)!.text, `${r.id}: 지금 문장과 다르다`);
    assert.ok(r.reason.length >= 20 && r.difference.length >= 6 && r.readWith.length >= 2, r.id);
    assert.ok(r.replacedBy.length >= 1, `${r.id}: 새 질문이 없다`);
    for (const id of r.replacedBy) assert.ok(sceneIds.has(id) || candIds.has(id), `${r.id}: 없는 질문 ${id}`);
    if (r.judgment === "수정") assert.ok(r.comboExample.length >= 30, `${r.id}: 수정인데 조합 예시가 없다`);
    else assert.equal(r.comboExample, "—");
  }
  // 이유가 같은 문장을 되풀이하지 않는다
  assert.equal(new Set(ITEM_REVIEWS.map((r) => r.reason)).size, ITEM_REVIEWS.length);
  // 모든 문항이 "나는 ~하다"에 동의하는 형식이라 유지는 없다
  assert.ok(ITEM_REVIEWS.every((r) => r.judgment === "수정" || r.judgment === "삭제"));
  // 우선 확인 문항 r2 · r4는 수정으로 다룬다
  assert.equal(ITEM_REVIEWS.find((r) => r.id === "r2")!.judgment, "수정");
  assert.equal(ITEM_REVIEWS.find((r) => r.id === "r4")!.judgment, "수정");
});

test("후보 장면 4개는 선택지가 중립이고 짝 장면이 실제로 있다 (이번 묶음에는 넣지 않았다)", () => {
  assert.equal(CANDIDATES.length, 4);
  for (const c of CANDIDATES) {
    assert.ok(SCENE_BY_ID[c.pairWith], c.id);
    assert.equal(c.options.length, 4);
    assert.equal(new Set(c.options.map((o) => o.tag)).size, 4);
    assert.ok(c.why.length >= 20 && c.difference.length >= 20);
    assert.ok(c.ask.endsWith("?"));
  }
  for (const c of CANDIDATES) assert.ok(ITEM_REVIEWS.some((r) => r.replacedBy.includes(c.id)), `${c.id}: 어느 22문항 검토에서도 쓰이지 않는다`);
});

test("서윤 예시 글: 같은 사주에 다른 가상 답 조합 — 제품 본문 검사를 통과하고, 고른 선택지 문장을 되풀이하지 않으며, 두 글이 서로 다르다", () => {
  assert.ok(EXAMPLES.length >= 3);
  const L = READING_LIMITS.sections.body;
  for (const ex of EXAMPLES) {
    for (const side of [ex.a, ex.b] as const) {
      const r = readThread(ex.thread, side.answers as ScenarioAnswers);
      assert.equal(r.kind, "combo", `${ex.thread}: 예시의 답 쌍이 대표 조합이 아니다`);
      assert.equal(r.kind === "combo" && r.combo.id, side.combo, `${ex.thread}: 예시가 가리키는 조합이 다르다`);
      const t = side.reading;
      const where = `${ex.thread} ${side.combo}`;
      assert.ok(t.length >= L.min && t.length <= L.max, `${where}: 글자 수 ${t.length}`);
      assert.ok(sentences(t).length <= L.sentencesMax, `${where}: 문장이 ${sentences(t).length}개`);
      assert.doesNotMatch(t, JARGON, `${where}: 사주 전문 용어`);
      assert.doesNotMatch(t, ANSWER_ECHO, `${where}: 응답 읽어 주기`);
      assert.doesNotMatch(t, HEDGE_REPEAT, `${where}: 풀이마다 붙는 한계 경고`);
      assert.doesNotMatch(t, SCORE_TEXT, `${where}: 점수 · 확률`);
      assert.doesNotMatch(t, AGE_TEXT, `${where}: 나이`);
      assert.doesNotMatch(t, CAUSE_NARROWING, `${where}: 원인 단정`);
      assert.doesNotMatch(t, /(?:습니다|입니다|합니다)[.!?]?\s*$|(?:습니다|입니다|합니다)[.!?]\s/, `${where}: 합쇼체`);
      for (const f of FORBIDDEN) assert.doesNotMatch(t, f.re, `${where}: ${f.why}`);
      assert.doesNotMatch(t, /서윤|님[은는이가을를의]?(?![가-힣])/, `${where}: 이름을 쓰지 않는다`);
      // 고른 선택지의 문장을 그대로 되풀이하지 않는다 (22문항 방식의 문제)
      for (const sceneId of Object.keys(side.answers) as (keyof typeof side.answers)[]) {
        const opt = SCENE_BY_ID[sceneId]!.options.find((o) => o.id === side.answers[sceneId])!;
        assert.ok(!t.includes(opt.text), `${where}: 선택지 문장을 그대로 옮겼다 (${opt.text})`);
      }
      // 조건 · 가능성 표현(단정하지 않음)
      assert.match(t, /수 있어요|일 수|쪽이에요|방식이에요|편이에요/, `${where}: 조건 · 가능성 표현이 없다`);
    }
    const o = textOverlap(ex.a.reading, ex.b.reading);
    assert.ok(o < 0.35, `${ex.thread}: 답 조합이 달라도 두 글이 비슷하다 (겹침 ${o.toFixed(2)})`);
  }
  // 예시는 서로 다른 구분을 다룬다
  assert.equal(new Set(EXAMPLES.map((e) => e.thread)).size, EXAMPLES.length);
});

test("초안은 별도 버전이다: 다른 모듈을 불러오지 않고, 화면 · 저장 · 리포트 · 문항 기록에 연결돼 있지 않으며, 22문항을 바꾸지 않았다", () => {
  const src = readFileSync(new URL("./scenario-v1.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /^import /m, "초안은 다른 모듈을 불러오지 않는다");
  const root = new URL("../../../", import.meta.url).pathname;
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (["node_modules", ".next", "docs", "pilot-data", "external-data"].includes(name) || name.startsWith(".")) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !/scenario-v1/.test(name) && /scenario-v1/.test(readFileSync(p, "utf8"))) hits.push(p.slice(root.length));
    }
  };
  for (const d of ["app", "components", "server", "lib/services", "lib/report", "lib/assessment/modules", "lib/assessment/provenance.ts"]) {
    try {
      const p = join(root, d);
      if (statSync(p).isDirectory()) walk(p);
      else if (/scenario-v1/.test(readFileSync(p, "utf8"))) hits.push(d);
    } catch {
      /* 없는 경로는 건너뛴다 */
    }
  }
  assert.deepEqual(hits, [], `화면 · 서비스 · 리포트에 연결돼 있다: ${hits.join(", ")}`);
  // 22문항은 그대로다 (개발용 예시)
  assert.equal(ASSESSMENT_MODULES.flatMap((m) => m.items).length, 22);
  assert.ok(THREAD_BY_ID.D4.scenes.every((id) => SCENE_BY_ID[id]!.thread === "D4"));
});
