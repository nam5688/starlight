// 28문항 읽기 표 · 가상 응답 측정 문서를 코드에서 만든다(순수 함수 — 파일 · 네트워크 없음).
// 만드는 문서: docs/assessment-situational-v2-reading-tables.md — `node scripts/situational-render-reading.ts`로 만들고 직접 고치지 않는다.
// 이 문서의 측정은 가상 응답(결정적 난수)으로 규칙이 어떻게 움직이는지 본 것이다 — 실제 사람의 응답 분포가 아니고 정확도 · 신뢰도를 말하지 않는다.
import type { Group } from "../../saju/interpret/structure.ts";
import { FLAVOR_RULES } from "../personal-type.ts";
import { SITUATIONAL_V2_ITEMS } from "../drafts/situational-v2-draft.ts";
import { consistentSheet, measurePreference, rngOf } from "./measure.ts";
import {
  DISTINCTIONS,
  DISTINCTION_IDS,
  INSUFFICIENT_TEXT,
  MIN_CLEAR,
  MIN_LEAD,
  MIN_SCENES,
  SCENE_READINGS,
  SITUATIONAL_CONTENT_VERSION,
  SITUATIONAL_READING_VERSION,
  TYPE_MIN_EVIDENCE,
  TYPE_MIN_LEAD,
  TYPE_SUPPORTS,
  judgeAll,
  scenesOf,
  typeCoverage,
  typeFrom28,
  type Answer,
  type AnswerSheet,
  type DistinctionId,
} from "./reading.ts";

const GROUPS = Object.keys(FLAVOR_RULES) as Group[];
const esc = (s: string) => s.replace(/\|/g, "\\|");
const pct = (x: number, n: number) => `${((x / n) * 100).toFixed(1)}%`;

/** 모든 선택지를 같은 확률로 고르고 일부는 "답하지 않음"으로 둔 가상 응답 */
function randomSheet(rand: () => number, naRate: number): AnswerSheet {
  const sheet: AnswerSheet = {};
  for (const s of SCENE_READINGS) sheet[s.id] = rand() < naRate ? null : ((Math.floor(rand() * 4) + 1) as Answer);
  return sheet;
}

export const SIM = { seed: 20261020, n: 5000, naRate: 0.05, perType: 300 } as const;

export type SimResult = {
  n: number;
  status: Record<DistinctionId, { sufficient: number; contrast: number; insufficient: number }>;
  byGroup: Record<Group, { typed: number; mixed: number }>;
};

/** 무작위 가상 응답 n개로 구분마다 충분 · 상반 · 부족의 몫, 사주 갈래 하나로 정해졌다고 가정했을 때 이름이 붙은 몫을 센다 */
export function simulate(): SimResult {
  const rand = rngOf(SIM.seed);
  const status = Object.fromEntries(DISTINCTION_IDS.map((d) => [d, { sufficient: 0, contrast: 0, insufficient: 0 }])) as SimResult["status"];
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g, { typed: 0, mixed: 0 }])) as SimResult["byGroup"];
  for (let i = 0; i < SIM.n; i++) {
    const readings = judgeAll(randomSheet(rand, SIM.naRate));
    for (const rd of readings) status[rd.d][rd.status] += 1;
    for (const g of GROUPS) {
      if (typeFrom28([g], readings).kind === "type") byGroup[g].typed += 1;
      else byGroup[g].mixed += 1;
    }
  }
  return { n: SIM.n, status, byGroup };
}

function optionTable(): string[] {
  const lines = ["| 문항 | 선택지 | 행동 근거 한 문장(내부) | 읽는 쪽 | 확실도 | 이유 |", "| --- | --- | --- | --- | --- | --- |"];
  for (const scene of SCENE_READINGS) {
    const item = SITUATIONAL_V2_ITEMS.find((i) => i.id === scene.id)!;
    scene.options.forEach((o, i) => {
      const read = o.read ? `${DISTINCTIONS[o.read.d].name} → ${DISTINCTIONS[o.read.d].sides[o.read.side].label}` : "읽지 않음";
      lines.push(`| ${scene.id} | ${i + 1}. ${esc(item.options[i])} | ${esc(o.fact)} | ${read} | ${o.read ? (o.read.clarity === "clear" ? "분명" : "약함") : "—"} | ${esc(o.why ?? "")} |`);
    });
  }
  return lines;
}

export function renderReadingTables(): string {
  const out: string[] = [];
  const total = SCENE_READINGS.length * 4;
  const readCount = SCENE_READINGS.flatMap((s) => s.options).filter((o) => o.read).length;
  const clearCount = SCENE_READINGS.flatMap((s) => s.options).filter((o) => o.read?.clarity === "clear").length;
  out.push(
    "# 상황형 28문항 읽기 표 (생성 문서)",
    "",
    "> **이 문서는 코드에서 만들었다** — `node scripts/situational-render-reading.ts`(원본: `lib/assessment/situational/reading.ts`). 직접 고치지 않는다.",
    `> 질문 버전 \`${SITUATIONAL_CONTENT_VERSION}\` · 읽기 규칙 \`${SITUATIONAL_READING_VERSION}\` · 이 질문과 읽기는 2026-10-20에 무료 검사 화면에 연결됐다(운영자 결정 B: 28문항 전용 연결표). **원본 복원이 아니라 미유 쪽이 새로 정한 규칙이며 사람에게 풀어 본 적이 없어 검증되지 않았다.**`,
    "> 선택지마다 점수를 더하지 않는다. 고른 선택지는 \"행동 근거 한 문장\"과 \"주 구분의 어느 쪽인지(또는 읽지 않음)\"로만 바뀌고, 여러 장면을 가로로 읽어 구분마다 충분 · 상반 · 부족을 정한다.",
    "> \"읽는 쪽\" · \"확실도\"는 검토자(같은 계열 AI 모델)의 분류이며 운영자 확인이 필요하다. 선택지 문장은 운영자가 보낸 원문 그대로다(문장 · 순서 · 개수는 바꾸지 않았고 다섯째 선택지도 더하지 않았다).",
    "",
    "## 1. 판정 규칙",
    "",
    `- 구분 ${DISTINCTION_IDS.length}개: ${DISTINCTION_IDS.map((d) => DISTINCTIONS[d].name).join(" · ")}.`,
    `- 한 구분을 읽으려면 그 구분으로 읽히는 장면이 **${MIN_SCENES}개 이상** 설계돼 있어야 하고(아니면 어떤 답이어도 읽지 않는다), 고른 답 가운데 읽힌 장면이 2개 이상이어야 한다.`,
    `- 뚜렷한 방향(충분): 같은 쪽으로 **분명하게** 읽힌 장면이 ${MIN_CLEAR}개 이상이고 반대쪽 읽기(약한 읽기 포함)보다 ${MIN_LEAD}개 이상 앞선다. 반대쪽이 하나도 없으면 "일관", 있으면 "대체로"로 예외 장면을 함께 둔다.`,
    "- 상황별 차이(상반): 읽힌 쪽이 둘 이상이고 위 조건을 채우지 못하면 평균을 내지 않고 둘 다 보인다.",
    "- 부족: 설계가 모자라거나 · 읽힌 장면이 모자라거나 · 분명한 장면이 모자라거나 · 답이 없으면 근거를 만들지 않는다.",
    `- 개인 유형 10개: 사주가 갈래를 정하고(\`sajuTilt\`, 변경 없음) 응답이 그 갈래 안의 두 모습을 가른다. 받침이 ${TYPE_MIN_EVIDENCE}개 이상이고 다른 모습보다 ${TYPE_MIN_LEAD}개 이상 앞서야 이름을 붙이고, 아니면 혼합 경향으로 두고 이유를 한 문장으로 말한다.`,
    "- 애착에 관련된 세 구분(확인 방식 · 갈등 뒤 회복 · 도움 받는 방식)은 유형 이름이 아니라 방식으로만 말하고 유형 계산에 쓰지 않는다.",
    "",
    "## 2. 112개 선택지의 읽기 표",
    "",
    `선택지 ${total}개 가운데 읽는 쪽이 있는 것은 ${readCount}개(분명 ${clearCount} · 약함 ${readCount - clearCount}), 읽지 않는 것은 ${total - readCount}개다.`,
    "",
    ...optionTable(),
    "",
    "## 3. 구분마다 읽을 수 있는 장면",
    "",
    "| 구분 | 읽을 수 있는 장면 | 설계 상태 |",
    "| --- | --- | --- |",
    ...DISTINCTION_IDS.map((d) => {
      const scenes = scenesOf(d);
      return `| ${DISTINCTIONS[d].name} | ${scenes.length}개 (${scenes.map((s) => s.id).join(" · ") || "—"}) | ${scenes.length >= MIN_SCENES ? "읽을 수 있음" : `읽지 않음 — ${INSUFFICIENT_TEXT["design-short"]}`} |`;
    }),
    "",
    "## 4. 개인 유형 10개 연결표와 도달 가능성",
    "",
    "| 유형 | 사주 갈래 | 받침(구분 → 쪽, 분명한 장면 수) | 도달 가능 | 일관된 응답에서 |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const row of typeCoverage()) {
    const sheet = consistentSheet(row.id);
    const t = typeFrom28([row.group], judgeAll(sheet));
    out.push(
      `| ${row.name} | ${row.group} | ${row.supports.map((s) => `${DISTINCTIONS[s.d].name} → ${DISTINCTIONS[s.d].sides[s.side].label}(${s.clearScenes})`).join(" · ")} | ${row.reachable ? "예" : "아니오"} | ${t.kind === "type" ? (t.id === row.id ? "그 이름이 붙음" : `다른 이름(${t.name})`) : "혼합 경향"} |`,
    );
  }
  out.push("", "받침 3개는 유형마다 서로 다른 구분의 쪽이며, 2개 이상의 서로 다른 장면 근거가 있어야 이름이 붙는다. \"도달 가능\"은 읽을 수 있는 받침이 2개 이상이라는 설계상의 뜻이고, 실제 사람이 그렇게 답한다는 뜻이 아니다.", "");

  out.push("## 5. 가상 응답 측정 (결정적 난수 · 실제 사람의 응답이 아님)", "");
  out.push(
    `씨앗 ${SIM.seed} · 무작위 가상 응답 ${SIM.n}개(선택지를 같은 확률로 고르고 ${SIM.naRate * 100}%는 답하지 않음)로 구분마다 어떻게 판정되는지 센 값이다.`,
    "",
    "| 구분 | 뚜렷한 방향 | 상황별 차이 | 읽지 않음 |",
    "| --- | --- | --- | --- |",
  );
  const sim = simulate();
  for (const d of DISTINCTION_IDS) out.push(`| ${DISTINCTIONS[d].name} | ${pct(sim.status[d].sufficient, sim.n)} | ${pct(sim.status[d].contrast, sim.n)} | ${pct(sim.status[d].insufficient, sim.n)} |`);
  out.push(
    "",
    "무작위 응답에서 사주 갈래가 하나로 정해졌다고 가정했을 때 이름이 붙은 몫이다(대부분 혼합 경향이 나오는 것이 의도다 — 일관되지 않은 응답에 이름을 붙이지 않는다).",
    "",
    "| 사주 갈래 | 이름이 붙음 | 혼합 경향 |",
    "| --- | --- | --- |",
    ...GROUPS.map((g) => `| ${g} | ${pct(sim.byGroup[g].typed, sim.n)} | ${pct(sim.byGroup[g].mixed, sim.n)} |`),
    "",
    `유형 10개 각각을 향해 세기 p로 기운 가상 응답(유형당 ${SIM.perType}번, 사주는 그 유형의 갈래 하나로 정해졌다고 가정):`,
    "",
    "| p | 맞는 이름 | 반대 모습 | 혼합 경향 |",
    "| --- | --- | --- | --- |",
  );
  for (const p of [0, 0.3, 0.6, 1]) {
    const m = measurePreference(p, SIM.perType, SIM.seed);
    out.push(`| ${p} | ${pct(m.right, m.runs)} | ${pct(m.wrong, m.runs)} | ${pct(m.mixed, m.runs)} |`);
  }
  out.push(
    "",
    "p = 0은 순수한 무작위, p = 1은 그 유형을 받치는 선택지만 고른 응답이다. 이 수치는 규칙이 가상 응답에서 어떻게 움직이는지일 뿐이고 실제 사람 응답의 분포 · 정확도 · 신뢰도가 아니다.",
    "",
    "## 6. 알려진 한계",
    "",
    "- 읽는 쪽 · 확실도 · 연결표의 받침은 검토자의 분류이고 사람 시험 · 전문가 검토를 받지 않았다. 장면의 일부(정보를 받는 방식 · 도움 받는 방식)는 장면 수가 모자라 읽지 않는다.",
    `- 읽기에서 받침으로 쓰는 쪽은 ${GROUPS.length}개 갈래 × 2개 모습, 유형마다 ${TYPE_SUPPORTS["careful-deep"].length}개다. 이 구조는 22문항 점수와 서로 환산되지 않는다.`,
    "- 가상 응답 측정은 선택지를 같은 확률로 고른다는 가정이며 실제 사람의 응답 습관(한쪽으로 쏠림 · 사회적 바람직성)은 반영하지 않았다.",
    "",
  );
  return out.join("\n");
}
