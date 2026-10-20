// 실행: npm test — 무료 결과 문장의 생활 말 시안(plain-life-draft.ts)의 기준을 확인한다. 비용 0 · 무료 미리보기(lib/report/preview.ts)에만 적용된 문구다.
//  · 앞에서 읽히는 문장에는 사주 용어 · 한자 · 합쇼체가 없고 한 문장이 짧다.
//  · 없거나 적은 기운은 지금 문구가 말하는 범위(시기 · 권하는 해석 · 부족하다는 뜻이 아님)만 말하고 "없음 → 기능 부족"으로 번역하지 않는다.
//  · 연결 지점은 lib/report/preview.ts 하나뿐이다 · 생성 문서(docs/free-result-life-language-proposal-v1.md)가 코드와 어긋나지 않는다.
// "읽기 편한가"를 판정하는 시험이 아니다 — 글자 수 · 용어 · 어미 규칙만 지킨다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { splitSentences } from "../report/reading/line-breaks.ts";
import { readSource } from "../report/test-source.ts";
import { customerVoiceLeaks } from "../report/reading/customer-voice.ts";
import { ABSENCE_MAPPING } from "../report/reading/story-plan.ts";
import { FIVE_ELEMENTS } from "./engine.ts";
import { calculateSaju } from "./manseryeok-engine.ts";
import { dayMasterLife, elementLife, headlineLife, relationLeadLife, relationLife } from "./plain-life-draft.ts";
import { SAMPLE_BIRTH, currentFreeTexts, renderLifeLanguageProposal } from "./plain-life-draft-render.ts";
import { ELEMENT_INFO } from "./plain.ts";

const root = join(import.meta.dirname, "..", "..");
const STEMS = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
const LEVELS = ["many", "few", "none"] as const;
const SENTENCE_MAX = 46;

/** 앞에서 읽히는 문장에 쓰지 않는 말 — 용어 이름은 보조 한 줄(term)에만 둔다 */
const LEAD_BAN = /일간|오행|십성|대운|세운|기운|그 주제|상대적으로 크게|[一-鿿]|[갑을병정무기경신임계][목화토금수]\(|입니다|합니다|봅니다|습니다/;

/** 시안이 앞에서 읽히게 내놓는 문장 전부 */
function allLeadLines(): string[] {
  const out: string[] = [];
  for (const stem of STEMS) out.push(...dayMasterLife(stem, `${stem}수(壬)`, "큰 강 · 바다")!.lines);
  for (const el of FIVE_ELEMENTS) {
    for (const level of LEVELS) out.push(...elementLife(el, level).lines);
    for (const level of ["many", "few", "none"] as const) {
      out.push(...(relationLife(el, level) ?? []), relationLeadLife(el, level)!);
    }
  }
  for (const stem of STEMS) for (const el of FIVE_ELEMENTS) out.push(...headlineLife(stem, [el])!);
  return out;
}

test("앞에서 읽히는 문장에는 사주 용어 · 한자 · 합쇼체가 없고 모두 해요체 한 문장이다", () => {
  for (const line of allLeadLines()) {
    assert.ok(!LEAD_BAN.test(line), `앞 문장에 쓰지 않는 말이 있다: ${line}`);
    assert.deepEqual(customerVoiceLeaks(line), [], `명리 용어가 새어 나왔다: ${line}`);
    assert.equal(splitSentences(line).length, 1, `한 줄에 문장이 둘 이상이다: ${line}`);
    assert.ok(/요\.$/.test(line), `해요체(~요.)로 끝나지 않는다: ${line}`);
  }
});

test(`한 문장은 ${SENTENCE_MAX}자를 넘지 않고(모바일 두 줄 안쪽) 너무 짧지도 않다`, () => {
  for (const line of allLeadLines()) {
    assert.ok(line.length <= SENTENCE_MAX, `${line.length}자: ${line}`);
    assert.ok(line.length >= 8, `너무 짧다: ${line}`);
  }
});

test("용어는 보조 한 줄(term)에만 있고, 그 줄은 사주 용어를 풀어 부른다", () => {
  for (const stem of STEMS) {
    const dm = dayMasterLife(stem, `${stem}수(壬)`, "큰 강 · 바다")!;
    assert.ok(dm.term.startsWith("사주 용어로는"), dm.term);
    assert.equal(dm.lines.length, 3, "일간마다 세 문장 — 한 줄 모습 · 잘하는 점 · 조심할 점");
  }
  for (const el of FIVE_ELEMENTS) for (const level of LEVELS) assert.ok(elementLife(el, level).term.startsWith("사주 용어로는"));
  assert.equal(dayMasterLife("없는간", "x", "y"), null);
  assert.equal(headlineLife("없는간", []), null);
});

test("없거나 적은 기운은 지금 문구가 말하는 세 가지 범위(시기 · 권하는 해석 · 부족하다는 뜻이 아님)만 말하고 문장마다 따로 말한다", () => {
  for (const el of FIVE_ELEMENTS) {
    // 지금 문구가 실제로 이 세 가지를 말한다 — 시안은 같은 범위를 옮긴 것이다
    assert.match(ELEMENT_INFO[el].few, /크게 느껴질 수 있다/);
    assert.match(ELEMENT_INFO[el].few, /채우는 쪽을 권하는/);
    assert.match(ELEMENT_INFO[el].few, /부족하다는 뜻은 아니에요/);
    for (const level of ["few", "none"] as const) {
      const lines = elementLife(el, level).lines;
      assert.equal(lines.length, 4);
      assert.match(lines[0], /크게 도드라지지는 않아요/);
      assert.match(lines[1], /없다는 뜻은 아니에요/);
      assert.match(lines[2], /크게 와닿는 시기가 있다고 봐요/);
      assert.match(lines[3], /권하는 해석이 많아요/);
    }
  }
});

test("없음 · 부족을 생활 기능의 부족이나 원인으로 번역하지 않는다 — 한 문장에 기운 이름 · 생활 기능어와 없음 표현이 함께 없다", () => {
  for (const line of allLeadLines()) {
    const absent = ABSENCE_MAPPING.absent.test(line);
    assert.ok(!(absent && (ABSENCE_MAPPING.kindWithLife.test(line) || ABSENCE_MAPPING.gloss.test(line))), `없음 표현과 기능어가 한 문장에 있다: ${line}`);
    assert.ok(!(absent && ABSENCE_MAPPING.causal.test(line)), `없음 표현과 인과 연결이 한 문장에 있다: ${line}`);
  }
  // 부정문("없다는 뜻은 아니에요")은 단독 문장으로만 쓴다
  for (const el of FIVE_ELEMENTS) assert.equal(elementLife(el, "none").lines[1], "그렇다고 그런 모습이 없다는 뜻은 아니에요.");
});

test("많은 기운의 설명은 지금 문구의 문장을 그대로 나누기만 한다(앞의 \"토(흙) 기운이 많아요 —\" 머리만 사라진다)", () => {
  for (const el of FIVE_ELEMENTS) {
    assert.equal(elementLife(el, "many").lines.join(" "), ELEMENT_INFO[el].many);
    assert.equal(relationLife(el, "many")!.join(" "), ELEMENT_INFO[el].manyDomains.relation);
  }
  assert.equal(relationLife("수", "balanced"), null);
  assert.equal(relationLeadLife("수", "balanced"), null);
});

test("예시 사주(1988-12-23 · 가상)의 지금 문장은 사주 용어가 새어 나오지만 시안은 새지 않는다", () => {
  const saju = calculateSaju({ ...SAMPLE_BIRTH });
  assert.equal(saju.status, "ok");
  if (saju.status !== "ok") return;
  const cur = currentFreeTexts(saju);
  assert.equal(saju.dayMaster.stem, "임");
  assert.ok(customerVoiceLeaks(cur.dayMaster).length >= 1, "지금 일간 문단은 용어 · 한자가 있다");
  assert.ok(cur.dayMaster.length > 80, "지금 일간 문단은 한 덩어리 긴 문장이다");
  assert.deepEqual(cur.plain.elements.filter((e) => e.level === "none").map((e) => e.element), ["금"]);
  assert.deepEqual(cur.plain.elements.filter((e) => e.level === "many").map((e) => e.element), ["수"]);
});

test("연결 지점은 무료 미리보기(lib/report/preview.ts) 하나뿐이다: 그 밖의 화면 · 서버 · 저장 · 리포트 · 스크립트는 이 문구를 불러오지 않고, plain.ts는 문구를 모른다", () => {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name === "pilot-data" || name === "docs" || name.startsWith(".")) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && !/^plain-life-draft/.test(name) && /plain-life-draft|LIFE_DRAFT_VERSION/.test(readFileSync(path, "utf8"))) hits.push(path.slice(root.length + 1));
    }
  };
  for (const d of ["app", "components", "server", "lib", "scripts"]) walk(join(root, d));
  assert.deepEqual(hits, ["lib/report/preview.ts"]);
  assert.ok(!/life-draft/.test(readFileSync(join(root, "lib", "saju", "plain.ts"), "utf8")));
});

test("생성 문서(docs/free-result-life-language-proposal-v1.md)가 코드와 어긋나지 않는다", () => {
  const saju = calculateSaju({ ...SAMPLE_BIRTH });
  assert.equal(saju.status, "ok");
  if (saju.status !== "ok") return;
  const onDisk = readSource(join(root, "docs", "free-result-life-language-proposal-v1.md"));
  assert.equal(onDisk.replace(/\n+$/, ""), renderLifeLanguageProposal(saju).replace(/\n+$/, ""), "문서가 낡았다 — node scripts/plain-life-draft-render.ts로 다시 만든다");
});
