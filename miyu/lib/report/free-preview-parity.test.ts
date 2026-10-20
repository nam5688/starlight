// 실행: npm test — 로그인 전 무료 미리보기와 로그인 뒤 저장된 결과가 같은 입력에서 같은 분석을 보이는지 확인한다(비용 0 — 실제 AI · 결제 · 외부 DB 없음, 메모리 저장소 + 실제 만세력 엔진).
//  · 같은 입력이면 미리보기의 공개 풀이(buildFreePreview)와 개인 유형 카드(buildIdentityType)가 저장된 결과에서 만든 값과 글자까지 같다 — 로그인이 바꾸는 것은 저장 · 권한뿐이다.
//  · 개인 유형은 사람마다 계산돼 하나로 고정되지 않고(10개 + 혼합 경향 안에서), 이름은 코드에 고정된 목록 밖으로 나가지 않는다.
//  · 같은 사람이 다른 과거 결과로 바뀌지 않는다: 저장은 늘 새로 만든 결과를 돌려주고, 이전 결과와 섞이지 않는다.
//  · 고객이 읽는 한 줄에 내부 구현(문항 개수 · 검사 영역 이름)이 없다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PERSONAL_TYPES, MIXED_TYPE } from "../assessment/personal-type.ts";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import type { Answers } from "../assessment/types.ts";
import { EMPTY_BASIC_INFO, genderOf, type BasicInfo } from "../profile/basic-info.ts";
import { manseryeokEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "../services/assessment-service.ts";
import { createMemoryRepository } from "../services/testing/memory-repository.ts";
import { buildDevFreeSummary } from "./build-free-summary.ts";
import { buildIdentityType } from "./identity.ts";
import { buildFreePreview } from "./preview.ts";
import { assessmentTypeTitle, personalTypeTitle } from "./type-title.ts";

const REF = { year: 2026, month: 10, iso: "2026-10-20" };
const TODAY = new Date("2026-10-20T03:00:00Z");

const ids = ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => i.id));
const answersOf = (f: (id: string, index: number) => number): Answers => Object.fromEntries(ids.map((id, i) => [id, f(id, i)]));

type Person = { label: string; info: BasicInfo; answers: Answers };
const info = (over: Partial<BasicInfo>): BasicInfo => ({ ...EMPTY_BASIC_INFO, nickname: "시험", calendar: "solar", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true, gender: "female", ...over });

// 사주 갈래와 응답 양쪽이 서로 다른 사람들 — 한 사람이 아니라 여러 사람이 서로 다른 유형을 받아야 한다
const PEOPLE: Person[] = [];
const dates: [string, string, string][] = [["1988", "1", "20"], ["1990", "6", "8"], ["1993", "9", "30"], ["1995", "4", "12"], ["1997", "12", "3"], ["2000", "2", "25"], ["1985", "7", "14"], ["1979", "11", "5"]];
const patterns: [string, (id: string, i: number) => number][] = [
  ["모두 보통", () => 3],
  ["모두 그렇다", () => 5],
  ["모두 아니다", () => 1],
  ["번갈아", (_id, i) => (i % 2 === 0 ? 5 : 1)],
  ["앞쪽 높음", (_id, i) => (i < 11 ? 5 : 2)],
  ["뒤쪽 높음", (_id, i) => (i < 11 ? 2 : 5)],
];
for (const [y, m, d] of dates) for (const [name, f] of patterns) PEOPLE.push({ label: `${y}-${m}-${d} · ${name}`, info: info({ birthYear: y, birthMonth: m, birthDay: d }), answers: answersOf(f) });

async function preLogin(p: Person) {
  // scoreDevAnswers(app/analyze/actions.ts)와 같은 재료와 함수 — 서버 동작 자체는 Next 환경이 필요해 같은 순서를 그대로 옮겼다
  const saju = await manseryeokEngine.calculate({
    year: Number(p.info.birthYear),
    month: Number(p.info.birthMonth),
    day: Number(p.info.birthDay),
    calendar: p.info.calendar,
    isLeapMonth: false,
    birthTime: p.info.birthTimeUnknown ? null : p.info.birthTime,
    gender: genderOf(p.info),
  });
  const summary = buildDevFreeSummary(p.answers);
  return { saju, summary, preview: buildFreePreview({ summary, saju, reference: REF }), identityType: buildIdentityType({ saju, summary }) };
}

test("같은 입력이면 로그인 전 미리보기와 저장된 결과가 같은 공개 풀이 · 같은 유형 카드를 만든다", async () => {
  const mem = createMemoryRepository();
  for (const p of PEOPLE) {
    const before = await preLogin(p);
    const saved = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId: `user-${p.label}`, channel: "web", info: p.info, answers: p.answers, today: TODAY });
    assert.ok(saved.ok, `${p.label}: 저장 실패`);
    if (!saved.ok) continue;
    // 저장소를 한 번 오간 값처럼 직렬화해도 같아야 한다(DB 왕복)
    const stored = JSON.parse(JSON.stringify(saved.assessment));
    const after = buildFreePreview({ summary: stored.summary, saju: stored.saju, reference: REF });
    assert.deepEqual(after, before.preview, `${p.label}: 공개 풀이가 로그인 전후에 다르다`);
    assert.deepEqual(buildIdentityType({ saju: stored.saju, summary: stored.summary }), before.identityType, `${p.label}: 유형 카드가 로그인 전후에 다르다`);
    assert.deepEqual(assessmentTypeTitle(stored), personalTypeTitle({ saju: before.saju, summary: before.summary }), `${p.label}: 화면 제목이 로그인 전후에 다르다`);
  }
});

test("개인 유형은 하나로 고정되지 않는다: 사람마다 계산되고, 이름은 코드에 고정된 10개 + 혼합 경향 안에만 있으며, 10개가 모두 나온다", async () => {
  const allowed = new Set<string>([...Object.values(PERSONAL_TYPES).map((t) => t.name), MIXED_TYPE.name]);
  assert.equal(Object.keys(PERSONAL_TYPES).length, 10);
  // 같은 씨앗이면 같은 150명 — 사주 갈래(생년월일 · 성별)와 응답(1~5)이 모두 제각각인 사람들
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const seen = new Map<string, number>();
  const N = 150;
  for (let n = 0; n < N; n++) {
    const saju = await manseryeokEngine.calculate({
      year: 1970 + Math.floor(rnd() * 35),
      month: 1 + Math.floor(rnd() * 12),
      day: 1 + Math.floor(rnd() * 28),
      calendar: "solar",
      isLeapMonth: false,
      birthTime: null,
      gender: rnd() < 0.5 ? "female" : "male",
    });
    const summary = buildDevFreeSummary(answersOf(() => 1 + Math.floor(rnd() * 5)));
    const t = buildIdentityType({ saju, summary });
    assert.ok(t, "사주가 계산되는 입력이면 유형 카드가 있다");
    assert.ok(allowed.has(t.name), `목록에 없는 이름 ${t.name}`);
    seen.set(t.name, (seen.get(t.name) ?? 0) + 1);
  }
  for (const t of Object.values(PERSONAL_TYPES)) assert.ok(seen.has(t.name), `${t.name}이(가) 한 번도 나오지 않았다 — ${[...seen].map(([k, v]) => `${k}:${v}`).join(" ")}`);
  assert.ok((seen.get(MIXED_TYPE.name) ?? 0) < N * 0.5, "혼합 경향이 절반을 넘으면 이름이 거의 붙지 않는 것이다");
  for (const [name, count] of seen) assert.ok(count < N * 0.35, `${name}이(가) 전체의 35% 이상 — 한 이름으로 쏠린다`);
});

test("같은 사람의 입력은 몇 번을 계산해도 같은 유형이고, 입력이 다르면 다른 사람의 값이 섞이지 않는다", async () => {
  const a = PEOPLE[3];
  const b = PEOPLE[PEOPLE.length - 2];
  const a1 = await preLogin(a);
  const b1 = await preLogin(b);
  const a2 = await preLogin(a);
  assert.deepEqual(a1.identityType, a2.identityType);
  assert.deepEqual(a1.preview, a2.preview);
  assert.notDeepEqual(a1.preview, b1.preview);
});

test("저장은 늘 이번에 낸 입력의 새 결과를 만든다 — 같은 입력으로 다시 저장해도 이전 결과를 대신 돌려주지 않는다", async () => {
  const mem = createMemoryRepository();
  const p = PEOPLE[4];
  const first = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId: "same-user", channel: "web", info: p.info, answers: p.answers, today: TODAY });
  const other = PEOPLE[PEOPLE.length - 1];
  const second = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId: "same-user", channel: "web", info: other.info, answers: other.answers, today: TODAY });
  assert.ok(first.ok && second.ok);
  if (!first.ok || !second.ok) return;
  assert.notEqual(first.assessment.id, second.assessment.id);
  assert.equal(second.assessment.birthYear, Number(other.info.birthYear));
  assert.deepEqual(second.assessment.answers, other.answers);
});

test("고객이 읽는 무료 풀이의 안내 한 줄에는 문항 개수 · 검사 영역 이름 같은 내부 설명이 없다", async () => {
  // 관계 · 기질 어느 쪽 문단이 나오든 같은 문장 — 응답이 뒷받침할 때만 문장이 들어간다는 약속만 말한다
  const shown = new Set<string>();
  for (const p of PEOPLE) {
    const { preview } = await preLogin(p);
    if (preview.lead.kind === "insight") shown.add(preview.lead.basisNote);
  }
  assert.ok(shown.size >= 1);
  assert.equal(shown.size, 1, "안내 문장은 한 가지로 고정");
  for (const note of shown) {
    assert.doesNotMatch(note, /\d+개|문항|응답 중|기질|애착|근거예요/, note);
    assert.match(note, /답/);
  }
});
