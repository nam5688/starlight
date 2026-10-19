// 실행: npm test — 장면 질문 별도 버전 설계 초안 0.2: 구조 · 중립 선택지 · 해석 규칙(16쌍 빠짐없이, 답 누락 없이, 원인 확정 없이) · 22문항 검토 · 화면 미연결
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../modules/index.ts";
import { BLOCK_PLAN } from "../../report/reading/plan.ts";
import {
  CANDIDATES,
  ITEM_REVIEWS,
  NONE_OPTIONS,
  PATTERNS,
  SCENES,
  SCENE_BY_ID,
  THREADS,
  THREAD_BY_ID,
  answeredScene,
  readScenarios,
  readThread,
  tagOf,
  type ScenarioAnswers,
  type SceneId,
} from "./scenario-v1.ts";

const BAD_LABEL = /불안(?!정)|회피|안정형|안정적|애착|유형|성격|외향|내향|독립적|의존|집착|완벽|제대로|잘못|올바|훌륭|좋은 |나쁜 |당연히|못하|게으|성실|책임감이 (?:강|약)/;
/** 원인을 확정하는 말 — 사실(plain · shows)과 해석 후보에 쓰지 않는다 */
const CAUSE = /때문에|때문이|이라서|여서|이어서 그렇|탓|그래서 [가-힣 ]{0,10}(?:것이다|다)\./;

test("구분 5개 · 장면 10개: 구분마다 서로 다른 장면 2개, 장면마다 선택지 4개와 이름표가 겹치지 않고 사실 · 보여 주는 방식이 있다", () => {
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
    for (const o of s.options) {
      assert.ok(o.text.length >= 8 && o.text.length <= 45, `${s.id}${o.id}: 선택지가 너무 짧거나 길다`);
      assert.ok(o.plain.length >= 15 && o.shows.length >= 15, `${s.id}${o.id}: 사실 · 보여 주는 방식이 비었다`);
      assert.doesNotMatch(o.plain, CAUSE, `${s.id}${o.id}: 사실에 원인을 확정하는 말`);
      assert.doesNotMatch(o.shows, CAUSE, `${s.id}${o.id}: 보여 주는 방식에 원인을 확정하는 말`);
    }
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

test("선택지 · 사실 · 보여 주는 방식은 성향 이름 · 유형 · 좋고 나쁨의 말을 쓰지 않는다 (좋게 보이는 답 · 나빠 보이는 답을 만들지 않는다)", () => {
  for (const s of SCENES) {
    assert.doesNotMatch(s.ask, BAD_LABEL, `${s.id}: 질문`);
    assert.doesNotMatch(s.ask, /한가요\?$|편인가요|인가요\?$/, `${s.id}: 성향을 직접 묻는 질문`);
    for (const o of s.options) {
      assert.doesNotMatch(o.text, BAD_LABEL, `${s.id}${o.id}: ${o.text}`);
      assert.doesNotMatch(o.plain, BAD_LABEL, `${s.id}${o.id} 사실: ${o.plain}`);
      assert.doesNotMatch(o.shows, BAD_LABEL, `${s.id}${o.id} 보여 주는 방식: ${o.shows}`);
      assert.doesNotMatch(o.text, /편이다$|편이에요$/, `${s.id}${o.id}: 나는 ~한 편이다 진술`);
    }
  }
});

test("해석 규칙: 한 구분의 16개 답 쌍을 빠짐없이 한 규칙으로 덮고, 후보는 조건형이며 원인을 확정하지 않는다", () => {
  for (const t of THREADS) {
    const [s1, s2] = t.scenes.map((id) => SCENE_BY_ID[id]!);
    const tags1 = new Set(s1!.options.map((o) => o.tag));
    const tags2 = new Set(s2!.options.map((o) => o.tag));
    const rules = PATTERNS.filter((p) => p.thread === t.id);
    const seen = new Map<string, string>();
    for (const p of rules) {
      assert.ok(p.candidates.length >= 1 && p.candidates.every((c) => c.length >= 30), p.id);
      assert.match(p.candidates.join(" "), /수 있/, `${p.id}: 해석 후보가 조건형("~일 수 있다")이 아니다`);
      for (const c of p.candidates) assert.doesNotMatch(c, CAUSE, `${p.id}: 해석 후보에 원인을 확정하는 말`);
      assert.ok(p.notThis.length >= 4, `${p.id}: 붙이면 안 되는 결론이 없다`);
      for (const a of p.first) assert.ok(tags1.has(a), `${p.id}: ${a}가 첫 장면에 없다`);
      for (const b of p.second) assert.ok(tags2.has(b), `${p.id}: ${b}가 둘째 장면에 없다`);
      for (const k of Object.keys(p.nuance ?? {})) assert.ok(p.first.includes(k) || p.second.includes(k), `${p.id}: nuance 키 ${k}가 이 규칙의 답이 아니다`);
      for (const a of p.first) for (const b of p.second) {
        const key = `${a}|${b}`;
        assert.ok(!seen.has(key), `${p.id}와 ${seen.get(key)}가 같은 답 쌍(${key})을 가리킨다`);
        seen.set(key, p.id);
      }
    }
    for (const a of tags1) for (const b of tags2) assert.ok(seen.has(`${a}|${b}`), `${t.id}: ${a} × ${b}를 덮는 해석 규칙이 없다`);
    assert.equal(seen.size, 16, t.id);
  }
  assert.equal(new Set(PATTERNS.map((p) => p.id)).size, PATTERNS.length);
});

test("읽기: 두 장면 모두 선택지를 골랐을 때만 읽고, 읽으면 고른 두 답의 사실을 항상 담는다 (답 누락 없음)", () => {
  for (const t of THREADS) {
    const [s1, s2] = t.scenes.map((id) => SCENE_BY_ID[id]!);
    for (const o1 of s1!.options) for (const o2 of s2!.options) {
      const r = readThread(t.id, { [s1!.id]: o1.id, [s2!.id]: o2.id } as ScenarioAnswers);
      assert.equal(r.kind, "read", `${t.id} ${o1.tag} × ${o2.tag}`);
      if (r.kind !== "read") continue;
      assert.equal(r.answered[0].plain, o1.plain);
      assert.equal(r.answered[1].plain, o2.plain);
      assert.equal(r.answered[0].shows, o1.shows);
      assert.equal(r.answered[1].shows, o2.shows);
    }
  }
  // 한 장면이라도 해당 없음 · 맞는 선택지 없음 · 미응답이면 그 구분은 읽지 않는다 (성향으로 채우지 않는다)
  for (const none of ["x", "y", undefined] as const) {
    const h = readThread("D4", { S7: "a", S8: none });
    assert.equal(h.kind, "hold");
    assert.deepEqual(h.kind === "hold" && h.missing, ["S8"]);
  }
  assert.equal(tagOf("S7", "x"), undefined);
  assert.equal(tagOf("S7", "y"), undefined);
  assert.equal(answeredScene("S7", undefined), undefined);
  assert.equal(tagOf("S7", "a"), "carry-on");
  const all = Object.fromEntries(SCENES.map((s) => [s.id, "x"])) as ScenarioAnswers;
  assert.ok(readScenarios(all).every((x) => x.kind === "hold"));
  assert.equal(readScenarios({}).length, 5);
});

test("묶인 답들이 서로 다르면 구분한다: 같은 규칙이어도 답마다 사실이 다르고, 일부 규칙은 그 답일 때만 덧붙이는 문장(nuance)이 따로 있다", () => {
  const withNuance = PATTERNS.filter((p) => p.nuance);
  assert.ok(withNuance.length >= 12, "묶음 안의 답 차이를 nuance로 구분한 규칙이 너무 적다");
  // 여러 답을 묶은 규칙 중 nuance가 없는 것은 후보가 묶인 모든 답에 맞는다고 본 것 — 아래 회귀 사례처럼 서로 다른 이유를 한 풀이로 묶지 않는다
  for (const p of PATTERNS) {
    const members = p.first.length * p.second.length;
    if (members >= 4) assert.ok(p.nuance || p.thread === "D5", `${p.id}: 답 ${members}쌍을 묶었는데 답마다 구분하는 말이 없다`);
  }
  // 같은 첫 반응(물러남)이라도 풀리는 조건이 다르면 규칙이 다르다
  const stepBack = (second: string) => readThread("D3", { S5: "d", S6: second as never });
  const ids = new Set(["a", "b", "c", "d"].map((o) => (stepBack(o) as { pattern: { id: string } }).pattern.id));
  assert.equal(ids.size, 4);
});

test("운영자 지적 회귀(C5.5 · C3.4 · C4.1): 중단 이유를 다른 이유로 바꿔 읽지 않고, 첫 반응이 다르면 풀이가 다르며, 담담함의 원인을 확정하지 않는다", () => {
  // C5.5 — '내 기준에서 끝은 봐야 함 + 부담이 나에게 몰려 접음'을 '기준에 못 미쳐서 접음'으로 읽지 않는다
  const own = readThread("D5", { S9: "d", S10: "b" });
  assert.ok(own.kind === "read");
  assert.equal(own.pattern.id, "P5.7");
  const ownText = own.pattern.candidates.join(" ");
  assert.doesNotMatch(ownText, /기준(?:을 낮|에 못 미)|낮춰 볼 여지/);
  assert.match(ownText, /부담|책임이 한쪽으로|나눌지/);
  assert.match(own.pattern.notThis, /기준에 못 미쳐서 중단/);
  assert.match(own.pattern.needs ?? "", /기준에 못 미쳐서.*읽지 않는다/);
  // 같은 '내 기준'이어도 접은 계기가 다르면 다른 풀이다
  const noChange = readThread("D5", { S9: "d", S10: "a" });
  assert.ok(noChange.kind === "read" && noChange.pattern.id !== own.pattern.id);
  // 같은 '부담이 몰림'이어도 이어 간 힘이 다르면 다른 풀이다(책임 · 내 기준 · 결과 · 사람)
  const overloaded = ["a", "b", "c", "d"].map((o) => (readThread("D5", { S9: o as never, S10: "b" }) as { pattern: { id: string } }).pattern.id);
  assert.deepEqual(overloaded, ["P5.6", "P5.8", "P5.8", "P5.7"]);

  // C3.4 — 같은 '혼자 정리할 시간'이어도 첫 반응이 다르면 풀이가 다르고, 두 풀이 모두 실제 답 두 개를 담는다
  const speak = readThread("D3", { S5: "a", S6: "d" });
  const hold = readThread("D3", { S5: "d", S6: "d" });
  assert.ok(speak.kind === "read" && hold.kind === "read");
  assert.notEqual(speak.pattern.id, hold.pattern.id);
  assert.notEqual(speak.pattern.candidates.join(" "), hold.pattern.candidates.join(" "));
  assert.match(speak.pattern.candidates.join(" "), /대화로는 풀어 가지만 마음이 가라앉는 데는/);
  assert.match(hold.pattern.candidates.join(" "), /다시 이야기할 때를 정해/);
  assert.deepEqual(speak.answered.map((a) => a.tag), ["state-reasons", "alone-time"]);
  assert.deepEqual(hold.answered.map((a) => a.tag), ["step-back", "alone-time"]);

  // C4.1 — '평소대로 지냄 + 말로 꺼냄'에서 '말할 수 있어서 담담하다'를 원인으로 확정하지 않는다
  const carry = readThread("D4", { S7: "a", S8: "a" });
  assert.ok(carry.kind === "read" && carry.pattern.id === "P4.1");
  assert.doesNotMatch(carry.pattern.candidates.join(" "), /담담함이 .*에서 온다|말할 길이 있어서|말할 수 있어서 담담/);
  assert.match(carry.pattern.notThis, /원인 확정/);
  const lower = readThread("D4", { S7: "a", S8: "c" });
  assert.ok(lower.kind === "read" && lower.pattern.id === "P4.3");
  assert.notEqual(String(lower.pattern.id), String(carry.pattern.id));
  assert.match(lower.pattern.needs ?? "", /사주 근거가 있을 때만/);
});

test("지금 화면의 22문항 검토: 22개 모두 판단 · 이유 · 구분할 차이 · 새 질문 · 함께 볼 문항이 있고, 수정은 조합 예시(실제 해석 규칙 id)가 있다", () => {
  const current = ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => ({ id: i.id, text: i.text })));
  assert.equal(current.length, 22);
  assert.deepEqual(ITEM_REVIEWS.map((r) => r.id).sort(), current.map((c) => c.id).sort(), "22문항 전부를 검토해야 한다");
  const sceneIds = new Set(SCENES.map((s) => s.id as string));
  const candIds = new Set(CANDIDATES.map((c) => c.id as string));
  const patternIds = new Set(PATTERNS.map((p) => p.id));
  for (const r of ITEM_REVIEWS) {
    assert.equal(r.text, current.find((c) => c.id === r.id)!.text, `${r.id}: 지금 문장과 다르다`);
    assert.ok(r.reason.length >= 20 && r.difference.length >= 6 && r.readWith.length >= 2, r.id);
    // 이유가 "형식이 동의형이라서"만이 아니라 풀이에서 무엇이 구분되지 않는지를 말한다
    assert.doesNotMatch(r.reason, /동의하는 형식이라|동의형이라서/, `${r.id}: 형식만으로 판단했다`);
    assert.ok(r.replacedBy.length >= 1, `${r.id}: 새 질문이 없다`);
    for (const id of r.replacedBy) assert.ok(sceneIds.has(id) || candIds.has(id), `${r.id}: 없는 질문 ${id}`);
    if (r.judgment === "수정") assert.ok(r.comboExample.length >= 30, `${r.id}: 수정인데 조합 예시가 없다`);
    else assert.equal(r.comboExample, "—");
    for (const id of r.comboExample.match(/P\d\.\d/g) ?? []) assert.ok(patternIds.has(id), `${r.id}: 없는 해석 규칙 ${id}`);
  }
  assert.equal(new Set(ITEM_REVIEWS.map((r) => r.reason)).size, ITEM_REVIEWS.length);
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
    for (const o of c.options) assert.doesNotMatch(o.text, BAD_LABEL, `${c.id}${o.id}`);
  }
  for (const c of CANDIDATES) assert.ok(ITEM_REVIEWS.some((r) => r.replacedBy.includes(c.id)), `${c.id}: 어느 22문항 검토에서도 쓰이지 않는다`);
});

test("초안은 별도 버전이다: scenario-v1.ts는 다른 모듈을 불러오지 않고, 화면 · 저장 · 리포트 · 문항 기록에 연결돼 있지 않으며, 22문항을 바꾸지 않았다", () => {
  const src = readFileSync(new URL("./scenario-v1.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /^import /m, "초안은 다른 모듈을 불러오지 않는다");
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (["node_modules", ".next", "docs", "pilot-data", "external-data"].includes(name) || name.startsWith(".")) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !/scenario-/.test(name) && /scenario-(?:v1|evidence|cases)/.test(readFileSync(p, "utf8"))) hits.push(p.slice(root.length));
    }
  };
  for (const d of ["app", "components", "server", "lib/services", "lib/report", "lib/commerce", "lib/assessment/modules", "lib/assessment/provenance.ts"]) {
    try {
      const p = join(root, d);
      if (statSync(p).isDirectory()) walk(p);
      else if (/scenario-(?:v1|evidence|cases)/.test(readFileSync(p, "utf8"))) hits.push(d);
    } catch {
      /* 없는 경로는 건너뛴다 */
    }
  }
  // 예외: 이 PC에서만 열리는 개발용 테스트 화면(/dev/scenario)과 그 서버 쪽 — production에서는 열리지 않고 아무것도 저장하지 않는다
  const DEV_ONLY = ["server/dev-scenario.ts", "app/dev/scenario/page.tsx"];
  assert.deepEqual(hits.filter((h) => !DEV_ONLY.includes(h)).sort(), [], `화면 · 서비스 · 리포트에 연결돼 있다: ${hits.join(", ")}`);
  for (const f of DEV_ONLY) assert.match(readFileSync(join(root, f), "utf8"), /NODE_ENV === "production"/, `${f}: production에서 막는 확인이 없다`);
  const devFiles = ["server/dev-scenario.ts", "app/dev/scenario/actions.ts"].map((f) => readFileSync(join(root, f), "utf8")).join("\n");
  assert.doesNotMatch(devFiles, /\.(?:insert|upsert|update|delete)\(|saveAssessment|createOrder|startCheckout/, "테스트 화면은 회원 결과 · 주문을 쓰지 않는다");
  assert.equal(ASSESSMENT_MODULES.flatMap((m) => m.items).length, 22);
  assert.ok(THREAD_BY_ID.D4.scenes.every((id: SceneId) => SCENE_BY_ID[id]!.thread === "D4"));
});
