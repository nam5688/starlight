// 시범 인터뷰 · 시범 응답 정리 — 풀어보기 화면(take-page.ts)의 "검토 내용 복사"로 만든 글을 읽어 문항별 단서를 모은다.
// 사람 수가 적어서(5~8명) 통계가 아니라 **고칠 단서**를 모으는 용도다. 숫자 기준은 근거 있는 값이 아니라 docs/assessment-pilot-protocol.md의 시범용 시작 기준이다.
// 이 폴더의 코드는 파일을 읽지 않는다(순수 변환). 실제 응답 원본은 저장소에 올리지 않는 `pilot-data/`에만 둔다 (scripts/summarize-pilot.ts).
import { DRAFT_ITEMS, PERSPECTIVES, type DraftItem } from "./situational-draft.ts";

export type Letter = "a" | "b" | "c" | "d";
export type FlagGroup = "obvious" | "multi" | "unclear" | "nothing" | "fix" | "drop";

/** 풀어보기 화면이 복사 글에 쓰는 묶음 제목 (take-page.ts와 같아야 한다 — 테스트가 확인) */
export const GROUP_TITLES: Record<FlagGroup, string> = {
  obvious: "정답이 뻔해 보인 문항",
  multi: "둘 이상이 다 나 같았던 문항",
  unclear: "뜻을 모르겠던 문항",
  nothing: "고르고 싶은 답이 없던 문항",
  fix: "고쳐야 함",
  drop: "빼기",
};
export const CODE_LINE_PREFIX = "응답 코드(문항=답, 걸린 초): ";

export type PilotReview = {
  version: string | null;
  /** 문항 번호 → 고른 답 (해당 없음은 "na", 안 푼 문항은 "-") */
  answers: Record<string, Letter | "na" | "-">;
  seconds: Record<string, number>;
  flags: Record<FlagGroup, { id: string; pick: string[]; note: string }[]>;
  talk: Record<string, { understood?: string; why?: string; other?: string }>;
  ok: string[];
  overall: string;
  /** 응답 코드를 글에 넣지 않은 사람은 false */
  hasCode: boolean;
};

const emptyFlags = (): PilotReview["flags"] => ({ obvious: [], multi: [], unclear: [], nothing: [], fix: [], drop: [] });

export function parseReview(text: string): PilotReview {
  const out: PilotReview = { version: null, answers: {}, seconds: {}, flags: emptyFlags(), talk: {}, ok: [], overall: "", hasCode: false };
  const head = text.match(/문항\s+([^\]\s]+)\]/);
  out.version = head ? head[1] : null;
  let group: FlagGroup | "talk" | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(CODE_LINE_PREFIX)) {
      out.hasCode = true;
      for (const m of line.slice(CODE_LINE_PREFIX.length).matchAll(/(Q\d{2})=([a-d]|na|-)\((\d+)\)/g)) {
        out.answers[m[1]] = m[2] as Letter | "na" | "-";
        out.seconds[m[1]] = Number(m[3]);
      }
      continue;
    }
    const titled = (Object.entries(GROUP_TITLES) as [FlagGroup, string][]).find(([, t]) => line.startsWith(`${t} (`));
    if (titled) { group = titled[0]; continue; }
    if (line.startsWith("질문을 이해한 방식 · 고른 이유 (")) { group = "talk"; continue; }
    if (line.startsWith("괜찮음 (")) {
      out.ok = [...line.matchAll(/Q\d{2}/g)].map((m) => m[0]);
      group = null;
      continue;
    }
    if (line.startsWith("그 밖의 메모")) { group = null; continue; }
    if (line.startsWith("전체 의견:")) { out.overall = line.slice("전체 의견:".length).trim(); group = null; continue; }
    if (line.startsWith("- ") && group) {
      const id = line.match(/^-\s+(Q\d{2})\b/)?.[1];
      if (!id) continue;
      if (group === "talk") {
        const t: PilotReview["talk"][string] = {};
        const body = line.split(" — ").slice(1).join(" — ");
        for (const part of body.split(" / ")) {
          const m = part.match(/^(이해|고른 이유|다른 이유):\s*(.*)$/);
          if (!m) continue;
          t[m[1] === "이해" ? "understood" : m[1] === "고른 이유" ? "why" : "other"] = m[2].trim();
        }
        out.talk[id] = t;
      } else {
        const pick = [...(line.match(/선택지 ([A-D](?:·[A-D])*)\)/)?.[1] ?? "").split("·")].filter(Boolean).map((x) => x.toLowerCase());
        const note = line.split(" — ").slice(1).join(" — ");
        out.flags[group].push({ id, pick, note });
      }
    }
  }
  return out;
}

export type ItemSummary = {
  id: string;
  primary: string;
  /** 고른 답 분포 (응답 코드를 보낸 사람만) */
  picks: Record<Letter | "na", number>;
  answeredBy: number;
  /** 점수를 주는 선택지 중 가장 높은 쪽을 고른 사람의 몫 · 가장 낮은 쪽을 고른 사람의 몫 (한쪽 쏠림 단서) */
  highShare: number | null;
  lowShare: number | null;
  medianSeconds: number | null;
  flags: Record<FlagGroup, number>;
  /** 같은 선택지를 "좋은 답처럼 보였다"고 한 사람 수의 최대 */
  obviousSamePick: { letter: string; people: number } | null;
  /** 사람이 읽을 말 */
  understood: string[];
  why: string[];
  other: string[];
  /** 시범용 시작 기준(assessment-pilot-protocol.md 3장)에 걸린 단서 — 결정이 아니라 읽어 볼 곳 */
  clues: string[];
};

export type PilotSummary = { people: number; withCode: number; items: ItemSummary[]; overall: string[] };

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export function summarizePilot(reviews: PilotReview[], items: readonly DraftItem[] = DRAFT_ITEMS): PilotSummary {
  const out: ItemSummary[] = items.map((item) => {
    const picks: ItemSummary["picks"] = { a: 0, b: 0, c: 0, d: 0, na: 0 };
    const secs: number[] = [];
    let answeredBy = 0;
    const scored = item.options.filter((o) => !o.unscored);
    const w = (o: DraftItem["options"][number]) => o.w[item.primary] ?? 0;
    const hi = scored.reduce((a, b) => (w(b) > w(a) ? b : a)).id;
    const lo = scored.reduce((a, b) => (w(b) < w(a) ? b : a)).id;
    for (const r of reviews) {
      const a = r.answers[item.id];
      if (!a || a === "-") continue;
      answeredBy++;
      picks[a]++;
      if (r.seconds[item.id] !== undefined) secs.push(r.seconds[item.id]);
    }
    const flags = { obvious: 0, multi: 0, unclear: 0, nothing: 0, fix: 0, drop: 0 } as Record<FlagGroup, number>;
    const obviousPicks: Record<string, number> = {};
    const understood: string[] = [];
    const why: string[] = [];
    const other: string[] = [];
    for (const r of reviews) {
      for (const g of Object.keys(flags) as FlagGroup[]) {
        const hit = r.flags[g].find((f) => f.id === item.id);
        if (!hit) continue;
        flags[g]++;
        if (g === "obvious") for (const p of hit.pick) obviousPicks[p] = (obviousPicks[p] ?? 0) + 1;
      }
      const t = r.talk[item.id];
      if (t?.understood) understood.push(t.understood);
      if (t?.why) why.push(t.why);
      if (t?.other) other.push(t.other);
    }
    const bestPick = Object.entries(obviousPicks).sort((x, y) => y[1] - x[1])[0];
    const obviousSamePick = bestPick ? { letter: bestPick[0], people: bestPick[1] } : null;
    const clues: string[] = [];
    if (flags.unclear >= 2) clues.push("뜻을 모르겠다는 사람이 2명 이상 — 질문 문장을 다시 쓴다");
    if (other.length >= 2) clues.push("같은 선택지를 다른 이유로 골랐다는 말이 2명 이상 — 이유를 선택지에 나눠 적고 목표 관점의 이유가 아닌 답은 점수에 넣지 않는 방식을 검토한다");
    if (obviousSamePick && obviousSamePick.people >= 3) clues.push(`선택지 ${obviousSamePick.letter.toUpperCase()}가 좋은 답처럼 보였다는 사람이 3명 이상 — 그 선택지(또는 반대쪽)를 고친다`);
    if (flags.nothing >= 2) clues.push("고르고 싶은 답이 없었다는 사람이 2명 이상 — 실제로 했을 행동을 그대로 적은 선택지를 보완한다");
    if (flags.fix + flags.drop >= 2) clues.push("고쳐야 함 · 빼기 표시가 2명 이상 — 메모를 읽는다");
    const highShare = answeredBy >= 5 ? picks[hi] / answeredBy : null;
    const lowShare = answeredBy >= 5 ? picks[lo] / answeredBy : null;
    if (highShare !== null && highShare >= 0.8) clues.push("가장 높은 쪽 선택지에 80% 이상 몰림 — 모두가 같은 답이면 이 문항으로는 사람을 구분하기 어렵다 (시범용 시작 기준, 근거 없음)");
    if (lowShare !== null && lowShare >= 0.8) clues.push("가장 낮은 쪽 선택지에 80% 이상 몰림 — 모두가 같은 답이면 이 문항으로는 사람을 구분하기 어렵다 (시범용 시작 기준, 근거 없음)");
    return { id: item.id, primary: `${item.primary} ${PERSPECTIVES[item.primary].name}`, picks, answeredBy, highShare, lowShare, medianSeconds: median(secs), flags, obviousSamePick, understood, why, other, clues };
  });
  return { people: reviews.length, withCode: reviews.filter((r) => r.hasCode).length, items: out, overall: reviews.map((r) => r.overall).filter(Boolean) };
}

/** 사람이 읽는 요약 글 (고칠 단서가 있는 문항을 먼저) */
export function renderPilotSummary(s: PilotSummary): string {
  const lines: string[] = [];
  lines.push(`# 시범 응답 요약 — ${s.people}명 (응답 코드 포함 ${s.withCode}명)`);
  lines.push("");
  lines.push("- 사람 수가 적어 **통계가 아니라 고칠 단서**다. 실제 신뢰도 · 타당도가 아니며, 가상 응답이 아니라 실제 사람의 응답일 때만 의미가 있다.");
  lines.push("- 아래 기준은 시범용 시작 기준이고 근거 있는 값이 아니다 (docs/assessment-pilot-protocol.md). 문항을 고치기 전에 이해한 방식 · 이유를 직접 읽는다.");
  if (s.people < 5) lines.push(`- **${s.people}명은 쏠림 계산(5명 이상)에 모자라 쏠림 단서는 내지 않았다.**`);
  const withClues = s.items.filter((i) => i.clues.length);
  lines.push("");
  lines.push(`## 고칠 단서가 있는 문항 (${withClues.length}개)`);
  if (!withClues.length) lines.push("", "없음 (단서가 없다는 것이 문항이 괜찮다는 증거는 아니다).");
  for (const i of withClues) {
    lines.push("", `### ${i.id} · ${i.primary}`);
    for (const c of i.clues) lines.push(`- ${c}`);
    if (i.understood.length) lines.push(`- 이해한 방식: ${i.understood.map((x) => `“${x}”`).join(" / ")}`);
    if (i.why.length) lines.push(`- 고른 이유: ${i.why.map((x) => `“${x}”`).join(" / ")}`);
    if (i.other.length) lines.push(`- 다른 이유: ${i.other.map((x) => `“${x}”`).join(" / ")}`);
  }
  lines.push("", "## 문항별 응답 분포", "", "| 문항 | 관점 | 답한 사람 | A | B | C | D | 해당 없음 | 가장 높은 쪽 | 가장 낮은 쪽 | 걸린 시간(중앙값 초) | 뻔함 | 다 나 같음 | 모르겠음 | 답 없음 |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const i of s.items) {
    const pct = (x: number | null) => (x === null ? "-" : `${Math.round(x * 100)}%`);
    lines.push(`| ${i.id} | ${i.primary} | ${i.answeredBy} | ${i.picks.a} | ${i.picks.b} | ${i.picks.c} | ${i.picks.d} | ${i.picks.na} | ${pct(i.highShare)} | ${pct(i.lowShare)} | ${i.medianSeconds ?? "-"} | ${i.flags.obvious} | ${i.flags.multi} | ${i.flags.unclear} | ${i.flags.nothing} |`);
  }
  if (s.overall.length) lines.push("", "## 전체 의견", "", ...s.overall.map((o) => `- ${o}`));
  return lines.join("\n") + "\n";
}
