// 28문항 읽기 설계 초안의 검토용 표 · 예시 결과를 글로 만든다(순수 함수, 파일 · 네트워크 없음). 연결하지 않은 초안이다.
// 만드는 문서: docs/assessment-situational-v2-reading-tables.md — `node scripts/situational-v2-render-reading.ts`로 만들고 직접 고치지 않는다.
// 예시 응답은 모두 가상이다(선호하는 쪽을 정해 두고 장면마다 그쪽 선택지를 고른 것 · 무작위). 운영자가 2026-10-17에 고른 28개는 "이 사람의 응답을 이렇게 읽는다"는 한 번의 예시 입력일 뿐이고 기본값 · 다른 사람의 응답으로 쓰이지 않는다.
import type { Group } from "../../saju/interpret/structure.ts";
import { SITUATIONAL_V2_ITEMS, SITUATIONAL_V2_PARTS } from "./situational-v2-draft.ts";
import {
  DISTINCTIONS,
  DISTINCTION_IDS,
  INSUFFICIENT_TEXT,
  READING_VERSION,
  SCENE_READINGS,
  judgeAll,
  readableRows,
  rowReads,
  sceneBalance,
  scenesOf,
  typeCoverage,
  typeFrom28,
  type Answer,
  type AnswerSheet,
  type DistinctionId,
  type DistinctionReading,
} from "./situational-v2-reading.ts";

const GROUPS: Group[] = ["비겁", "식상", "재성", "관성", "인성"];
const CONTEXT_NAME = { work: "일", social: "친구 · 모임", close: "가까운 관계", solo: "혼자 · 일상" } as const;
const esc = (s: string) => s.replace(/\|/g, "\\|");

/** 선호하는 쪽(구분 → 쪽)을 정해 두고 장면마다 그 쪽으로 읽히는 선택지를 고른 가상 응답. 그 쪽 선택지가 없으면 읽지 않는 선택지(없으면 1번), 주 구분이 없는 장면은 1번 */
export function sheetFromPreference(pref: Partial<Record<DistinctionId, string>>, skip: string[] = []): AnswerSheet {
  const sheet: AnswerSheet = {};
  for (const s of SCENE_READINGS) {
    if (skip.includes(s.id)) {
      sheet[s.id] = "na";
      continue;
    }
    const want = s.main ? pref[s.main] : undefined;
    const clear = s.options.findIndex((o) => want && o.read?.side === want && o.read.clarity === "clear");
    const any = s.options.findIndex((o) => want && o.read?.side === want);
    const unread = s.options.findIndex((o) => !o.read);
    const idx = clear >= 0 ? clear : any >= 0 ? any : unread >= 0 ? unread : 0;
    sheet[s.id] = (idx + 1) as Answer;
  }
  return sheet;
}

/** 운영자 예시 입력 — docs/assessment-situational-v2-provenance.md의 operator-picks 블록(2026-10-17에 운영자가 고른 28개). 기본값이 아니고 이 예시 밖에서 쓰지 않는다 */
export function operatorSheetFromDoc(docText: string): AnswerSheet {
  const block = docText.split("<!-- operator-picks:begin -->")[1]?.split("<!-- operator-picks:end -->")[0] ?? "";
  const sheet: AnswerSheet = {};
  for (const line of block.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const m = /^(\d+)\.\s*(.*?)\s+\/\s+(.*)$/.exec(line);
    if (!m) continue;
    const item = SITUATIONAL_V2_ITEMS[Number(m[1]) - 1];
    const idx = item?.options.findIndex((o) => o.replace(/\s+/g, " ").trim() === m[3].replace(/\s+/g, " ").trim()) ?? -1;
    if (item && idx >= 0) sheet[item.id] = (idx + 1) as Answer;
  }
  return sheet;
}

/** 시험 · 문서용 작은 난수 — 같은 씨앗이면 같은 수열(가상 응답 측정을 다시 만들 수 있게) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 모든 선택지를 같은 확률로 고르고(1~4), 일부는 "해당 없음"으로 답한 가상 응답 */
export function randomSheet(rand: () => number, naRate = 0.05): AnswerSheet {
  const sheet: AnswerSheet = {};
  for (const s of SCENE_READINGS) sheet[s.id] = rand() < naRate ? "na" : ((Math.floor(rand() * 4) + 1) as Answer);
  return sheet;
}

export const SIM = { seed: 20261020, n: 5000, naRate: 0.05 } as const;

export type SimResult = {
  n: number;
  /** 구분마다 충분 · 상반 · 부족의 몫 */
  status: Record<DistinctionId, { sufficient: number; contrast: number; insufficient: number }>;
  /** 사주 갈래마다(그 갈래가 후보 하나로 정해졌다고 가정) 유형이 붙은 몫과 이름별 수 */
  byGroup: Record<Group, { typed: number; mixed: number; types: Record<string, number> }>;
};

export function simulate(): SimResult {
  const rand = mulberry32(SIM.seed);
  const status = Object.fromEntries(DISTINCTION_IDS.map((d) => [d, { sufficient: 0, contrast: 0, insufficient: 0 }])) as SimResult["status"];
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g, { typed: 0, mixed: 0, types: {} as Record<string, number> }])) as SimResult["byGroup"];
  for (let i = 0; i < SIM.n; i++) {
    const readings = judgeAll(randomSheet(rand, SIM.naRate));
    for (const rd of readings) status[rd.d][rd.status] += 1;
    for (const g of GROUPS) {
      const t = typeFrom28([g], readings);
      if (t.kind === "type") {
        byGroup[g].typed += 1;
        byGroup[g].types[t.name] = (byGroup[g].types[t.name] ?? 0) + 1;
      } else byGroup[g].mixed += 1;
    }
  }
  return { n: SIM.n, status, byGroup };
}

const pct = (x: number, n: number) => `${((x / n) * 100).toFixed(1)}%`;

function readingLine(rd: DistinctionReading): string {
  const dist = DISTINCTIONS[rd.d];
  const scenes = rd.hits.map((h) => `${h.scene}(${dist.sides[h.side].label}${h.clarity === "weak" ? "·약" : ""})`).join(" · ") || "—";
  if (rd.status === "sufficient") return `| ${dist.name} | **뚜렷한 방향** — ${dist.sides[rd.side!].label} (${rd.strength === "strong" ? "3장면 이상" : "2장면"}) | ${scenes} |`;
  if (rd.status === "contrast") return `| ${dist.name} | **상황별 차이** — 장면에 따라 다른 쪽이 나왔어요(평균 내지 않음) | ${scenes} |`;
  return `| ${dist.name} | 읽지 않음 — ${INSUFFICIENT_TEXT[rd.code!]} | ${scenes} |`;
}

type Example = { title: string; note: string; sheet: AnswerSheet };

function exampleBlock(ex: Example): string[] {
  const readings = judgeAll(ex.sheet);
  const lines = [`### ${ex.title}`, "", ex.note, "", "| 구분 | 읽힌 결과 | 근거 장면(약 = 약하게 읽힘) |", "| --- | --- | --- |", ...readings.map(readingLine), ""];
  const rows = rowReads(readings);
  const rowText = Object.values(rows)
    .filter((x) => x.dir !== "unread")
    .map((x) => `${x.row}: ${x.dir === "split" ? "갈림(정하지 않음)" : `${x.dir === "high" ? "높은 쪽" : "낮은 쪽"}(${x.strength === "strong" ? "강" : "중"})`}`)
    .join(" · ");
  lines.push(`유형 계산이 보는 응답 행: ${rowText || "읽힌 행 없음"}`, "", "같은 응답을 사주에서 정해진 갈래가 다른 사람에게 놓으면(갈래는 사주가 정하며 여기서는 가정):", "", "| 사주 갈래 | 연결되는 유형 | 이유 |", "| --- | --- | --- |");
  for (const g of GROUPS) {
    const t = typeFrom28([g], readings);
    lines.push(t.kind === "type" ? `| ${g} | ${t.name} | 받치는 행: ${t.support.join(" · ")}${t.unreadable.length ? ` / 읽을 수 없는 행: ${t.unreadable.join(" · ")}` : ""} |` : `| ${g} | 혼합 경향(이름을 붙이지 않음) | ${t.detail} |`);
  }
  lines.push("");
  return lines;
}

export function renderReadingTables(operatorDoc: string): string {
  const out: string[] = [];
  out.push(
    "# 상황형 28문항 읽기 표 (생성 문서)",
    "",
    "> **이 문서는 코드에서 만들었다** — `node scripts/situational-v2-render-reading.ts`(원본: `lib/assessment/drafts/situational-v2-reading.ts`). 직접 고치지 않는다.",
    `> 읽기 설계 버전 \`${READING_VERSION}\` · **새 설계 초안이며 원본 복원이 아니다**(원본은 장면 28 · 선택지 112뿐, 채점 · 읽기는 처음부터 없었다) · 화면 · 저장 · 점수 · 리포트 · 운영 DB · AI 어디에도 연결하지 않았다 · 사람에게 풀어 본 적이 없어 검증되지 않았다.`,
    "> 선택지마다 점수를 더하지 않는다. 고른 선택지는 \"행동 근거 한 문장\"과 \"주 구분의 어느 쪽인지(또는 읽지 않음)\"로만 바뀌고, 여러 장면을 가로로 읽어 구분마다 충분 · 상반 · 부족을 정한다.",
    "> \"읽는 쪽\" · \"확실도\"는 검토자(같은 계열 AI 모델)의 분류이며 운영자 확인이 필요하다. 선택지 문장은 운영자가 보낸 원문 그대로다.",
    "",
    "## 1. 판정 규칙 (한 장)",
    "",
    "한 구분을 읽을 때(점수 없음):",
    "",
    "1. 그 구분을 읽는 장면이 3개보다 적게 설계돼 있으면 → **읽지 않음**(어떤 답이어도).",
    "2. 답한 장면(1~4번을 고름, \"해당 없음\" · 미응답 제외)이 3개보다 적으면 → **읽지 않음**.",
    "3. 답한 장면 가운데 그 구분으로 읽히는 선택을 한 장면이 2개보다 적으면 → **읽지 않음**.",
    "4. 읽힌 쪽이 둘 이상이면 → **상황별 차이**(어느 쪽이 \"진짜\"인지 정하지 않고 장면 이름과 함께 둘 다 보여 준다). 약하게 읽힌 선택도 반대쪽 신호로 센다.",
    "5. 읽힌 쪽이 하나이고 뚜렷하게 읽힌 장면이 2개 이상이며(같은 쪽 읽기가 서로 다른 맥락에 걸쳐 있으면) → **뚜렷한 방향**. 3장면 이상이면 강, 2장면이면 중.",
    "   - 같은 쪽 읽기가 약한 것뿐이거나 한 가지 맥락에만 있으면 방향으로 쓰지 않고 읽지 않는다.",
    "",
    "## 2. 구분 9개",
    "",
    "| 구분 | 가르는 것 | 쪽 | 설계된 장면 | 맥락 조건 | 개인 유형 계산에 연결되는 응답 행 |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const id of DISTINCTION_IDS) {
    const d = DISTINCTIONS[id];
    const sc = scenesOf(id);
    const rowsOf = [...new Set(Object.values(d.sides).flatMap((s) => s.rows.map((r) => `${r.row}`)))];
    out.push(
      `| ${d.name} | ${esc(d.plain)} | ${Object.values(d.sides).map((s) => s.label).join(" / ")} | ${sc.map((s) => s.id).join(" · ")} (${sc.length}개${sc.length < d.minScenes ? " — 모자람, 읽지 않음" : ""}) | ${d.mixedContext ? "같은 쪽이 2가지 맥락 이상" : "가까운 관계뿐이라 맥락 조건 없음"} | ${d.attachmentWay ? "연결하지 않음(애착은 세 가지 방식으로만 읽고 유형 이름 계산에 쓰지 않는다)" : rowsOf.join(" · ")} |`,
    );
  }
  const none = SCENE_READINGS.filter((s) => !s.main);
  out.push("", `주 구분이 없어 읽지 않는 장면: ${none.map((s) => s.id).join(" · ")}(${none.length}개). 장면 28개 = ${DISTINCTION_IDS.map((d) => `${DISTINCTIONS[d].name} ${scenesOf(d).length}`).join(" + ")} + 읽지 않는 장면 ${none.length}.`, "");

  let read = 0;
  let clear = 0;
  let weak = 0;
  let unread = 0;
  for (const s of SCENE_READINGS) {
    for (const o of s.options) {
      if (!o.read) unread++;
      else {
        read++;
        if (o.read.clarity === "clear") clear++;
        else weak++;
      }
    }
  }
  out.push(
    "## 3. 장면 28개 · 선택지 112개",
    "",
    `선택지 112개 가운데 **읽는 쪽이 있는 것 ${read}개**(뚜렷하게 ${clear}개 · 약하게 ${weak}개), **읽지 않는 것 ${unread}개**(이유를 적었다). 맥락은 검토자가 나눈 분류이며 운영자 확인이 필요하다.`,
    "",
  );
  for (const scene of SCENE_READINGS) {
    const item = SITUATIONAL_V2_ITEMS.find((i) => i.id === scene.id)!;
    const part = SITUATIONAL_V2_PARTS.find((p) => p.id === item.part)!;
    out.push(`### ${scene.id} · ${item.scene}`, "", `묶음 ${part.id}(${part.title}) · 맥락: ${CONTEXT_NAME[scene.context]} · 주 구분: ${scene.main ? DISTINCTIONS[scene.main].name : "없음(읽지 않음)"}${scene.note ? `  \n${scene.note}` : ""}`, "", "| # | 선택지(원문) | 행동 근거 | 읽는 쪽 | 확실도 · 이유 |", "| --- | --- | --- | --- | --- |");
    scene.options.forEach((opt, i) => {
      const side = opt.read && scene.main ? DISTINCTIONS[scene.main].sides[opt.read.side].label : "읽지 않음";
      out.push(`| ${i + 1} | ${esc(item.options[i])} | ${esc(opt.fact)} | ${side} | ${opt.read ? (opt.read.clarity === "clear" ? "뚜렷" : `약함 — ${esc(opt.why ?? "")}`) : esc(opt.why ?? "")} |`);
    });
    out.push("");
  }

  const oneSided = SCENE_READINGS.filter((s) => sceneBalance(s).oneSided);
  out.push(
    "## 4. 한쪽으로 쏠린 장면",
    "",
    "뚜렷하게 읽히는 쪽이 하나뿐인 장면이다. 이 장면에서는 반대 방향이 뚜렷하게 나올 수 없어, 한 장면만으로 방향을 정하지 않고 다른 장면과 가로로 읽는 규칙이 필요한 이유다(약하게 읽힌 선택은 상반 신호로만 센다).",
    "",
    "| 장면 | 읽을 수 있는 쪽(뚜렷 / 약함) |",
    "| --- | --- |",
    ...oneSided.map((s) => {
      const b = sceneBalance(s);
      const dist = DISTINCTIONS[s.main!];
      return `| ${s.id} | ${Object.entries(b.sides).map(([k, v]) => `${dist.sides[k].label} (${v.clear} / ${v.weak})`).join(" · ")} |`;
    }),
    "",
    "## 5. 개인 유형 10개 연결 가능성",
    "",
    "유형 이름과 두 모습을 가르는 응답 행은 지금 코드(`personal-type.ts` FLAVOR_RULES)를 **그대로** 쓴다. 28문항으로 읽을 수 있는 행(○)만 근거가 되고, 읽을 수 없는 행(×)은 어떤 답이어도 근거가 없다.",
    "",
    "| 유형 | 사주 갈래 | 모습을 가르는 응답 행(방향) | 이 설계로 읽는가 | 이 유형에 닿을 수 있는가 |",
    "| --- | --- | --- | --- | --- |",
    ...typeCoverage().map((t) => `| ${t.name} | ${t.group} | ${t.parts.map((p) => `${p.row}(${p.toward === "high" ? "높음" : "낮음"})`).join(" · ")} | ${t.parts.map((p) => (p.readable ? "○" : "×")).join(" ")} | ${t.parts.every((p) => p.readable) ? "닿을 수 있음(두 행 모두 읽음)" : t.reachable ? "닿을 수 있음(읽을 수 없는 행은 빠짐)" : "**닿을 수 없음**"} |`),
    "",
    `읽을 수 있는 행과 그 행을 읽는 구분: ${Object.entries(readableRows()).map(([row, ds]) => `${row}=${ds.length ? ds.map((d) => DISTINCTIONS[d].name).join(" + ") : "읽는 구분 없음"}`).join(" · ")}`,
    "",
    "## 6. 예시 결과 (모두 가상 응답, 검토용)",
    "",
    "예시 응답은 선호하는 쪽을 정해 두고 장면마다 그쪽 선택지를 고른 것이다. 실제 사람의 응답이 아니며 어떤 사람의 기본값도 아니다.",
    "",
  );
  const examples: Example[] = [
    { title: "예시 A — 한쪽으로 일관된 가상 응답", note: "선호: 혼자 정리 · 근거 먼저 · 미리 정함 · 점검 먼저 · 따져 보고 익숙한 쪽 · 시간을 둠(확인 · 회복) · 먼저 혼자 해 봄.", sheet: sheetFromPreference({ energy: "alone", info: "fact", basis: "logic", structure: "planned", first: "check", explore: "settled", confirm: "wait", repair: "later", help: "self" }) },
    { title: "예시 B — 장면에 따라 달라지는 가상 응답", note: "에너지: 모임에서는 사람 쪽 · 일상에서는 혼자 쪽으로 골랐고, 구조 · 판단 기준은 일관되게 열어 두는 쪽 · 사람 먼저로 골랐다.", sheet: { ...sheetFromPreference({ basis: "people", structure: "open", first: "talk", explore: "venture", confirm: "ask", repair: "now", help: "ask" }), s04: 1, s08: 2, s12: 1, s14: 1 } },
    { title: "예시 C — \"해당 없음\"이 많은 가상 응답", note: "장면 28개 가운데 14개를 \"이런 일이 거의 없었어요 · 맞는 선택지가 없어요\"로 답한 응답 — 읽을 장면이 모자라면 근거를 만들지 않는 모습을 보인다(다섯째 선택지는 제안이며 원본에는 없다).", sheet: sheetFromPreference({ energy: "with", basis: "logic", structure: "planned", first: "act", explore: "venture", confirm: "ask", repair: "now" }, SCENE_READINGS.filter((_, i) => i % 2 === 1).map((s) => s.id)) },
  ];
  const operator = operatorSheetFromDoc(operatorDoc);
  if (Object.keys(operator).length === 28) {
    examples.push({ title: "예시 D — 운영자가 2026-10-17에 고른 28개(예시 입력 한 번)", note: "이 한 사람의 응답을 이렇게 읽는다는 예시일 뿐이다. 기본값 · 다른 사람의 응답 · 22문항 응답과 대응시키지 않으며, 읽힌 모습은 진단이 아니고 사람 시험 전에는 검증되지 않았다.", sheet: operator });
  }
  for (const ex of examples) out.push(...exampleBlock(ex));

  const sim = simulate();
  out.push(
    "## 7. 가상 무작위 응답 측정",
    "",
    `가정: 사람이 아니라 **모든 선택지를 같은 확률로 고르고 ${(SIM.naRate * 100).toFixed(0)}%는 "해당 없음"으로 답하는 가상 응답 ${sim.n}개**(씨앗 ${SIM.seed}). 실제 사람의 선택 분포가 아니므로 이 숫자는 설계가 어디서 막히는지 보는 참고일 뿐 신뢰도 · 정확도가 아니다.`,
    "",
    "| 구분 | 뚜렷한 방향 | 상황별 차이 | 읽지 않음 |",
    "| --- | --- | --- | --- |",
    ...DISTINCTION_IDS.map((d) => `| ${DISTINCTIONS[d].name} | ${pct(sim.status[d].sufficient, sim.n)} | ${pct(sim.status[d].contrast, sim.n)} | ${pct(sim.status[d].insufficient, sim.n)} |`),
    "",
    "같은 응답을 사주 갈래가 하나로 정해진 사람에게 놓았을 때(갈래별 가정):",
    "",
    "| 사주 갈래 | 유형이 붙은 몫 | 혼합 경향 | 붙은 유형 |",
    "| --- | --- | --- | --- |",
    ...GROUPS.map((g) => `| ${g} | ${pct(sim.byGroup[g].typed, sim.n)} | ${pct(sim.byGroup[g].mixed, sim.n)} | ${Object.entries(sim.byGroup[g].types).map(([k, v]) => `${k} ${pct(v, sim.n)}`).join(" · ") || "없음"} |`),
    "",
    "## 8. 하지 못한 것",
    "",
    "- 실제 사람에게 풀어 본 적이 없다 — 읽는 쪽 · 확실도 · 맥락 분류는 모두 검토자의 판단이다.",
    "- 선택지 문장의 독립성 · 기존 검사와의 닮음은 확인하지 않았다(`assessment-situational-v2-provenance.md` 6장).",
    "- 문항 → 구분 분류는 검토 문서 3-3의 표를 바탕으로 장면마다 주 구분을 하나로 줄인 것이며, 검토 표와 달라진 장면은 위 3장의 장면 설명에 적었다.",
    "- 서비스 어디에도 연결하지 않았고 실제 AI 글을 쓰지 않았다.",
    "",
  );
  return out.join("\n");
}
