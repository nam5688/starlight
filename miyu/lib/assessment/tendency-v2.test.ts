// 실행: npm test — 대표 경향 v2(12유형 + 관계 방식) 설계 초안의 분류 규칙 검사
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyGeneral, classifyRelation, TYPE_DEFS, type GeneralDimension, type GeneralScores, type TypeId } from "./tendency-v2.ts";

const DIMS: GeneralDimension[] = ["novelty", "caution", "sensitivity", "persistence", "direction", "cooperation", "meaning"];
const base = (over: GeneralScores = {}): GeneralScores => ({ ...Object.fromEntries(DIMS.map((d) => [d, 50])), ...over });
const primary = (s: GeneralScores) => {
  const r = classifyGeneral(s);
  return r.status === "clear" ? r.primary.id : r.status;
};

test("유형 12개: 이름이 겹치지 않고, 서명(관점 · 방향) 조합도 모두 다르다", () => {
  assert.equal(TYPE_DEFS.length, 12);
  assert.equal(new Set(TYPE_DEFS.map((d) => d.name)).size, 12);
  const sigs = TYPE_DEFS.map((d) => d.signature.map((p) => `${p.dim}${p.dir > 0 ? "+" : "-"}`).sort().join(","));
  assert.equal(new Set(sigs).size, 12);
  for (const d of TYPE_DEFS) {
    assert.match(d.name, /^[가-힣]+형$/, "한글 이름 + 형 (알파벳 코드 · 별명 없음)");
    assert.doesNotMatch(d.summary, /최고|천재|운명|타고난|완벽/);
  }
});

test("대표 사례: 각 유형의 서명대로 응답하면 그 유형이 뚜렷하게 나온다", () => {
  for (const d of TYPE_DEFS) {
    const s = base(Object.fromEntries(d.signature.map((p) => [p.dim, p.dir > 0 ? 82 : 18])));
    assert.equal(primary(s), d.id, d.name);
  }
});

test("비슷한 유형 구분: 두 유형이 함께 쓰는 관점은 같고, 나머지 한 관점의 방향으로 갈린다", () => {
  const pairs: [GeneralScores, TypeId, GeneralScores, TypeId][] = [
    // 새로움은 높고 — 위험 대비가 낮으면 빠른시도, 높으면 준비탐색
    [{ novelty: 80, caution: 28 }, "quick-try", { novelty: 80, caution: 72 }, "prepared-explore"],
    // 위험 대비는 높고 — 새로움이 높으면 준비탐색, 낮으면 안정유지
    [{ caution: 80, novelty: 72 }, "prepared-explore", { caution: 80, novelty: 28 }, "steady-keep"],
    // 새로움은 높고 — 지속이 낮으면 몰입전환 (위험 대비는 보통)
    [{ novelty: 80, persistence: 25 }, "immerse-shift", { novelty: 80, caution: 25 }, "quick-try"],
    // 위험 대비가 낮고 — 주변 반응에도 덜 움직이면 현장대응, 새로움이 높으면 빠른시도
    [{ caution: 22, sensitivity: 25 }, "on-site", { caution: 22, novelty: 78 }, "quick-try"],
    // 스스로 방향을 정하고 — 맞추는 정도가 높으면 주도조율, 낮으면 독립판단
    [{ direction: 80, cooperation: 75 }, "lead-coordinate", { direction: 80, cooperation: 25 }, "independent"],
    // 방향을 남에게 맡기는 편이고 — 반응이 의욕을 움직이면 인정동기, 관계를 맞추면 조화배려
    [{ direction: 25, sensitivity: 80 }, "recognition", { direction: 25, cooperation: 80 }, "harmony"],
    // 맞추는 정도가 높고 — 방향을 스스로 정하면 주도조율, 남에게 맡기면 조화배려
    [{ cooperation: 80, direction: 75 }, "lead-coordinate", { cooperation: 80, direction: 25 }, "harmony"],
    // 지속이 높고 반응에 덜 움직이면 꾸준완주 / 지속이 낮고 새로움이 높으면 몰입전환
    [{ persistence: 80, sensitivity: 25 }, "long-haul", { persistence: 20, novelty: 80 }, "immerse-shift"],
    // 의미 축의 양쪽
    [{ meaning: 82 }, "meaning", { meaning: 18 }, "practical"],
  ];
  for (const [a, ida, b, idb] of pairs) {
    assert.equal(primary(base(a)), ida, JSON.stringify(a));
    assert.equal(primary(base(b)), idb, JSON.stringify(b));
  }
});

test("경계: 갈리는 관점이 보통(50)이면 함께 보여 주고, 어느 쪽도 우선하지 않는다", () => {
  const r = classifyGeneral(base({ novelty: 82, caution: 28, sensitivity: 18 }));
  assert.equal(r.status, "boundary", "빠른시도(새로움+ · 위험 대비−)와 현장대응(위험 대비− · 반응−)이 같은 만큼 맞음");
  if (r.status !== "boundary") return;
  assert.deepEqual(r.group.map((x) => x.id).sort(), ["on-site", "quick-try"]);
  assert.equal(r.shared, null);

  // 위험 대비가 조금만 기울어도(46 · 54) 경계로 남는다 — 4점 차이로 유형이 갈리지 않게
  for (const c of [46, 54]) {
    const b = classifyGeneral(base({ novelty: 82, caution: c }));
    assert.equal(b.status, "boundary", `caution ${c}`);
  }
  // 충분히 기울면 한쪽으로
  assert.equal(primary(base({ novelty: 82, caution: 38 })), "quick-try");
  assert.equal(primary(base({ novelty: 82, caution: 62 })), "prepared-explore");
});

test("경계: 한 관점만 뚜렷하면(새로움만 높음) 세 유형 중 하나를 고르지 않고 그 관점을 대표로 보여 준다", () => {
  const r = classifyGeneral(base({ novelty: 82 }));
  assert.equal(r.status, "boundary");
  if (r.status !== "boundary") return;
  assert.deepEqual(r.group.map((x) => x.id).sort(), ["immerse-shift", "prepared-explore", "quick-try"]);
  assert.equal(r.shared?.dim, "novelty");
  assert.equal(r.shared?.label, "새로움에 끌리는 정도가 높은 편");
});

test("쏠림 없음 · 판정 보류: 모두 보통이거나 같은 답만 고르면 유형 이름을 붙이지 않는다 (예전 규칙은 확인추구형)", () => {
  assert.equal(classifyGeneral(base()).status, "flat");
  assert.equal(classifyGeneral(base(Object.fromEntries(DIMS.map((d) => [d, 58])))).status, "flat");
  assert.equal(classifyGeneral(base({ novelty: 62 })).status, "flat", "한 관점이 조금 높은 것만으로는 유형을 붙이지 않는다");
  assert.equal(classifyGeneral(base({ novelty: 90 }), { straightLined: true }).status, "insufficient");
  assert.equal(classifyGeneral({ novelty: 80, caution: 20 }).status, "insufficient", "필요한 관점 점수가 없으면 보류");
  assert.equal(classifyRelation({ anxiety: 50, avoidance: 50 }, { straightLined: true }).status, "insufficient");
});

test("보조 경향: 두 번째 유형이 충분히 뚜렷할 때만 함께 보여 준다", () => {
  const withSecondary = classifyGeneral(base({ novelty: 85, caution: 20, meaning: 78 }));
  assert.equal(withSecondary.status, "clear");
  if (withSecondary.status === "clear") {
    assert.equal(withSecondary.primary.id, "quick-try");
    assert.equal(withSecondary.secondary?.id, "meaning");
  }
  const alone = classifyGeneral(base({ novelty: 85, caution: 20 }));
  assert.ok(alone.status === "clear" && alone.secondary === null, "같은 관점(새로움)을 공유할 뿐인 몰입전환형은 보조로 붙이지 않는다");
});

test("관계 방식: 일상 유형과 따로 분류하고, 두 마음이 함께 높으면 관계신중", () => {
  const rel = (anxiety: number, avoidance: number) => {
    const r = classifyRelation({ anxiety, avoidance });
    return r.status === "clear" ? r.id : r.status;
  };
  assert.equal(rel(78, 30), "reassurance");
  assert.equal(rel(30, 78), "distance");
  assert.equal(rel(75, 72), "careful");
  assert.equal(rel(30, 35), "secure");
  assert.equal(rel(55, 45), "flat");
  assert.equal(rel(50, 50), "flat", "모두 보통이면 확인추구로 몰지 않는다");
});

// ---- 분포 검사: 가상 응답에서 특정 유형으로 몰리지 않는지 ----

function rng(seed: number) {
  let s = seed;
  const u = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  return { u, g: () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()) };
}

function distribution(gen: () => GeneralScores, n = 12000) {
  const counts = new Map<string, number>();
  let flat = 0;
  let boundary = 0;
  for (let i = 0; i < n; i++) {
    const r = classifyGeneral(gen());
    if (r.status === "flat") flat++;
    if (r.status === "boundary") {
      boundary++;
      for (const x of r.group) counts.set(x.id, (counts.get(x.id) ?? 0) + 1 / r.group.length);
    }
    if (r.status === "clear") counts.set(r.primary.id, (counts.get(r.primary.id) ?? 0) + 1);
  }
  const typed = n - flat;
  const shares = TYPE_DEFS.map((d) => ({ name: d.name, share: (counts.get(d.id) ?? 0) / typed }));
  return { shares, flat: flat / n, boundary: boundary / n };
}

test("분포: 관점끼리 관련이 없을 때 모든 유형이 6~11% (기대 8.3%), 쏠림 없음 · 경계 비율도 확인", () => {
  const { g } = rng(2026);
  const d = distribution(() => Object.fromEntries(DIMS.map((k) => [k, Math.min(100, Math.max(0, 50 + 18 * g()))])));
  for (const s of d.shares) assert.ok(s.share > 0.06 && s.share < 0.11, `${s.name} ${(s.share * 100).toFixed(1)}%`);
  assert.ok(d.flat < 0.15, `쏠림 없음 ${(d.flat * 100).toFixed(1)}%`);
  assert.ok(d.boundary < 0.3, `경계 ${(d.boundary * 100).toFixed(1)}%`);
});

test("분포: 관점끼리 관련이 있다고 가정해도(새로움↔위험 대비 −0.4 등) 어느 유형도 15%를 넘지 않고 3% 아래로 사라지지 않는다", () => {
  const { g } = rng(7);
  const d = distribution(() => {
    const e = DIMS.map(() => g());
    const [n, c, s, p, dir, co, m] = e;
    const v = {
      novelty: n,
      caution: -0.4 * n + Math.sqrt(1 - 0.16) * c,
      sensitivity: s,
      persistence: p,
      direction: 0.35 * p - 0.2 * s + Math.sqrt(1 - 0.35 ** 2 - 0.2 ** 2) * dir,
      cooperation: 0.3 * s + Math.sqrt(1 - 0.09) * co,
      meaning: 0.2 * p + 0.15 * n + Math.sqrt(1 - 0.04 - 0.0225) * m,
    };
    return Object.fromEntries(DIMS.map((k) => [k, Math.min(100, Math.max(0, 50 + 18 * v[k]))]));
  });
  for (const s of d.shares) assert.ok(s.share > 0.03 && s.share < 0.15, `${s.name} ${(s.share * 100).toFixed(1)}%`);
});

test("분포: 관계 방식은 확인추구로 몰리지 않는다", () => {
  const { g } = rng(11);
  const counts: Record<string, number> = {};
  const n = 12000;
  for (let i = 0; i < n; i++) {
    const r = classifyRelation({ anxiety: 50 + 18 * g(), avoidance: 50 + 18 * g() });
    const k = r.status === "clear" ? r.id : r.status;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  assert.ok(Math.abs(counts.reassurance - counts.distance) / n < 0.03, "확인추구와 거리유지는 대칭");
  for (const k of ["secure", "reassurance", "distance", "careful", "flat"]) assert.ok(counts[k] / n > 0.05 && counts[k] / n < 0.32, `${k} ${((counts[k] / n) * 100).toFixed(1)}%`);
});
