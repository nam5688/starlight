// 실행: npm test — 시범 응답 정리가 풀어보기 화면의 복사 글 형식을 읽고, 고칠 단서를 시범용 시작 기준대로 모으는지 확인한다.
// 아래 글은 형식을 확인하려고 만든 **가짜 참여자**의 글이다. 실제 사람의 응답이 아니며, 개발 테스트에만 쓴다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CODE_LINE_PREFIX, GROUP_TITLES, parseReview, renderPilotSummary, summarizePilot } from "./pilot-summary.ts";
import { DRAFT_CONTENT_VERSION, DRAFT_ITEMS } from "./situational-draft.ts";

type Spec = {
  answers: Record<string, string>;
  obvious?: [string, string][];
  multi?: string[];
  unclear?: string[];
  nothing?: string[];
  talk?: [string, string][];
  overall?: string;
  code?: boolean;
};

/** take-page.ts의 memoText()와 같은 모양의 글 (가짜 참여자용) */
function memo(s: Spec): string {
  const L = [`[미유 성향 질문 풀어보기 · 첫인상 검토 · 문항 ${DRAFT_CONTENT_VERSION}]`, "방향: ...", `답한 문항 ${Object.keys(s.answers).length}/30 · 걸린 시간 5분 · 해당 없음 0개`];
  if (s.code !== false) L.push("", CODE_LINE_PREFIX + DRAFT_ITEMS.map((i) => `${i.id}=${s.answers[i.id] ?? "-"}(${10 + Number(i.id.slice(1))})`).join(" "));
  const group = (title: string, rows: string[]) => { L.push("", `${title} (${rows.length})`, ...rows); };
  group(GROUP_TITLES.obvious, (s.obvious ?? []).map(([id, p]) => `- ${id} 주제 (좋은 답처럼 보인 선택지 ${p})`));
  group(GROUP_TITLES.multi, (s.multi ?? []).map((id) => `- ${id} 주제 (나 같았던 선택지 A·B)`));
  group(GROUP_TITLES.unclear, (s.unclear ?? []).map((id) => `- ${id} 주제 — 어느 부분이 어려운지 메모`));
  group(GROUP_TITLES.nothing, (s.nothing ?? []).map((id) => `- ${id} 주제`));
  group(GROUP_TITLES.fix, []);
  group(GROUP_TITLES.drop, []);
  L.push("", `질문을 이해한 방식 · 고른 이유 (${(s.talk ?? []).length})`, ...(s.talk ?? []).map(([id, t]) => `- ${id} 주제 — ${t}`));
  L.push("", "괜찮음 (2): Q01, Q02");
  if (s.overall) L.push("", `전체 의견: ${s.overall}`);
  return L.join("\n");
}

const all = (letter: string) => Object.fromEntries(DRAFT_ITEMS.map((i) => [i.id, letter]));

test("복사 글 형식: 풀어보기 화면이 실제로 쓰는 묶음 제목과 응답 코드 줄 머리말이 정리 도구가 읽는 것과 같다 (화면을 고치면 여기서 걸린다)", () => {
  const src = readFileSync(new URL("./take-page.ts", import.meta.url), "utf8");
  assert.ok(src.includes(CODE_LINE_PREFIX), "응답 코드 줄 머리말");
  for (const t of Object.values(GROUP_TITLES)) assert.ok(src.includes(`'${t}'`), `묶음 제목 ${t}`);
  assert.ok(src.includes("질문을 이해한 방식 · 고른 이유 ("));
  assert.ok(src.includes("'괜찮음 ('"));
});

test("읽기: 응답 코드 · 걸린 시간 · 표시한 문항 · 이해한 방식과 이유 · 전체 의견을 읽고, 응답 코드를 뺀 글도 읽는다", () => {
  const r = parseReview(memo({ answers: { ...all("b"), Q03: "na" }, obvious: [["Q06", "B"]], multi: ["Q19"], unclear: ["Q22"], nothing: ["Q14"], talk: [["Q05", "이해: 낯선 모임에 가는지 묻는 것 / 고른 이유: 친구가 있어서 / 다른 이유: 사람 만나기가 부담"]], overall: "전반적으로 읽기 쉬웠다" }));
  assert.equal(r.version, DRAFT_CONTENT_VERSION);
  assert.equal(r.hasCode, true);
  assert.equal(r.answers.Q01, "b");
  assert.equal(r.answers.Q03, "na");
  assert.equal(r.seconds.Q07, 17);
  assert.deepEqual(r.flags.obvious, [{ id: "Q06", pick: ["b"], note: "" }]);
  assert.equal(r.flags.multi[0].id, "Q19");
  assert.deepEqual(r.flags.multi[0].pick, ["a", "b"]);
  assert.equal(r.flags.unclear[0].note, "어느 부분이 어려운지 메모");
  assert.deepEqual(r.talk.Q05, { understood: "낯선 모임에 가는지 묻는 것", why: "친구가 있어서", other: "사람 만나기가 부담" });
  assert.deepEqual(r.ok, ["Q01", "Q02"]);
  assert.equal(r.overall, "전반적으로 읽기 쉬웠다");
  const noCode = parseReview(memo({ answers: all("a"), code: false }));
  assert.equal(noCode.hasCode, false);
  assert.deepEqual(noCode.answers, {});
});

test("요약: 시범용 시작 기준(뜻을 모르겠다 2명 · 다른 이유 2명 · 같은 선택지가 좋은 답처럼 보임 3명 · 답 없음 2명)에 걸린 문항만 단서로 내고, 5명 미만이면 쏠림 단서는 내지 않는다", () => {
  const people = [
    memo({ answers: all("b"), unclear: ["Q22"], obvious: [["Q06", "B"]], talk: [["Q05", "다른 이유: 낯가림"]] }),
    memo({ answers: all("b"), unclear: ["Q22"], obvious: [["Q06", "B"]], nothing: ["Q14"], talk: [["Q05", "다른 이유: 사람 만나기가 부담"]] }),
    memo({ answers: all("b"), obvious: [["Q06", "B"]], nothing: ["Q14"] }),
  ].map(parseReview);
  const s = summarizePilot(people);
  const by = new Map(s.items.map((i) => [i.id, i]));
  assert.equal(s.people, 3);
  assert.ok(by.get("Q22")!.clues.some((c) => /뜻을 모르겠다는 사람이 2명 이상/.test(c)));
  assert.ok(by.get("Q06")!.clues.some((c) => /선택지 B가 좋은 답처럼/.test(c)));
  assert.ok(by.get("Q05")!.clues.some((c) => /다른 이유로 골랐다는 말이 2명/.test(c)));
  assert.ok(by.get("Q14")!.clues.some((c) => /고르고 싶은 답이 없었다는 사람이 2명/.test(c)));
  assert.deepEqual(by.get("Q01")!.clues, [], "표시가 없는 문항은 단서가 없다");
  assert.equal(by.get("Q01")!.highShare, null, "3명이면 쏠림 계산을 하지 않는다");
  assert.equal(by.get("Q01")!.picks.b, 3);
});

test("요약: 5명 이상이 모두 가장 높은 쪽(또는 낮은 쪽)을 고르면 쏠림 단서를 내고, 요약 글은 통계가 아니라는 말과 시범용 기준임을 밝힌다", () => {
  const q01 = DRAFT_ITEMS[0];
  const hi = q01.options.reduce((a, b) => ((b.w.T1 ?? 0) > (a.w.T1 ?? 0) ? b : a)).id;
  const people = Array.from({ length: 5 }, () => parseReview(memo({ answers: all(hi) })));
  const s = summarizePilot(people);
  const item = s.items[0];
  assert.equal(item.highShare, 1);
  assert.ok(item.clues.some((c) => /가장 높은 쪽 선택지에 80% 이상 몰림/.test(c)));
  const text = renderPilotSummary(s);
  assert.match(text, /통계가 아니라 고칠 단서/);
  assert.match(text, /시범용 시작 기준/);
  assert.match(text, /5명 \(응답 코드 포함 5명\)/);
  assert.doesNotMatch(text, /신뢰도가 높|타당도가 높|정확도 \d/);
});
