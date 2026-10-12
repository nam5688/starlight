// 실행: npm test — 핵심 로직이 특정 프레임워크·채널에 묶이지 않았는지, 개발용 리포트 문장이 규칙을 지키는지 확인한다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ASSESSMENT_MODULES } from "./assessment/modules/index.ts";
import { canTransition, createOrderNumber, isValidOrderNumber } from "./commerce/order.ts";
import { buildDevFreeSummary } from "./report/build-free-summary.ts";
import { buildDevReport } from "./report/generate-dev-report.ts";

const LIB = fileURLToPath(new URL(".", import.meta.url));

/** 채널 공통 핵심 폴더 — Next.js, React, 외부 서비스 SDK를 불러오면 안 된다 */
const CORE_DIRS = ["assessment", "commerce", "growth", "membership", "personalization", "profile", "report", "saju", "samples", "services"];
const FORBIDDEN = [/from "next/, /from "react/, /"server-only"/, /from "@supabase\//, /from "@tosspayments\//, /integrations\//];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
  });
}

test("핵심 로직은 Next.js·React·외부 서비스 SDK를 불러오지 않는다", () => {
  const offenders = CORE_DIRS.flatMap((d) => files(join(LIB, d))).flatMap((path) => {
    const src = readFileSync(path, "utf8");
    return FORBIDDEN.filter((re) => re.test(src)).map((re) => `${path.slice(LIB.length)} ${re}`);
  });
  assert.deepEqual(offenders, []);
});

test("주문번호는 결제사 형식을 지키고 매번 다르다", () => {
  const a = createOrderNumber(new Date("2026-10-11T00:00:00Z"));
  const b = createOrderNumber(new Date("2026-10-11T00:00:00Z"));
  assert.ok(isValidOrderNumber(a), a);
  assert.match(a, /^MEU-20261011-[A-Z2-9]{10}$/);
  assert.notEqual(a, b);
});

test("주문 상태 변경 규칙", () => {
  assert.ok(canTransition("pending", "paid"));
  assert.ok(canTransition("paid", "refunded"));
  assert.ok(!canTransition("paid", "pending"));
  assert.ok(!canTransition("refunded", "paid"));
});

test("개발용 리포트: 모든 영역을 채우고, 괄호 바로 뒤에 조사가 붙는 문장을 만들지 않는다", () => {
  const patterns = [1, 2, 3, 4, 5];
  for (const v of patterns) {
    const answers = Object.fromEntries(
      ASSESSMENT_MODULES.flatMap((m) => m.items.map((item, i) => [item.id, ((v + i) % 5) + 1])),
    );
    const summary = buildDevFreeSummary(answers);
    const report = buildDevReport({ nickname: "지민", knownMbti: "INFJ", birthText: "1995년 4월 12일 (양력) · 출생시간 모름", summary, saju: { status: "not-connected" }, gender: null, context: null });
    assert.equal(report.source, "dev-scoring");
    assert.ok(report.details.mbti.findings.length >= 4);
    assert.ok(report.integrated.common.length >= 1);
    assert.ok(report.integrated.different.length >= 1);
    assert.equal(report.actions.length, 3);
    const text = JSON.stringify(report);
    assert.doesNotMatch(text, /\)[가-힣]/, "괄호 뒤 조사");
    assert.doesNotMatch(text, /정확도|백분위|진단합니다/);
  }
});
