// 실제 생성 경로 시험(scenario-cases.ts의 사례로 쓴 글)을 비교하는 순수 함수 — 시험 · 문서 만들기에서만 쓴다. 화면 · 저장 · 실제 리포트 생성에는 연결하지 않았다.
// 글자 겹침 비율은 **참고값**이다. 판단 기준은 "어떤 해석이 어떤 근거 때문에 달라졌는가"이고, 이 파일은 그 근거를 찾는 데 필요한 사실(어느 부분이 바뀌었나 · 어느 근거를 달았나)만 센다.
import type { ReadingDraftV1 } from "../../report/reading/types.ts";
import { visibleTexts } from "../../report/reading/validate.ts";
import { textOverlap } from "./scenario-v1.ts";

/** 글 조각을 부분(헤드라인 · 카드 · 주제 블록 · 시기 · 실천 · 초점)별로 묶는다 */
export function partTexts(d: ReadingDraftV1): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of visibleTexts(d)) {
    const m = /^(blocks\.[^.]+)\./.exec(t.where);
    const part = m ? m[1]! : t.where.startsWith("cards.") ? "cards" : t.where.startsWith("flow.") ? "flow" : t.where.replace(/\[\d+\]$/, "");
    out[part] = out[part] ? `${out[part]} ${t.text}` : t.text;
  }
  return out;
}

export type PartDiff = { part: string; same: boolean; overlap: number };

/** 두 글을 부분별로 견준다 — 같은 글이면 same, 아니면 글자 조각(4글자) 겹침 비율(0이면 하나도 겹치지 않음) */
export function diffParts(a: ReadingDraftV1, b: ReadingDraftV1): PartDiff[] {
  const A = partTexts(a);
  const B = partTexts(b);
  const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])];
  return keys.map((part) => {
    const x = A[part] ?? "";
    const y = B[part] ?? "";
    return { part, same: x === y, overlap: x && y ? textOverlap(x, y) : 0 };
  });
}

/** 글이 단 근거 id를 부분별로 모은다 (주제 블록 · 시기 · 실천 · 초점) */
export function citedEvidence(d: ReadingDraftV1): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const b of d.blocks ?? []) out[`blocks.${b.id}`] = [...new Set(b.evidence ?? [])];
  out.flow = [...new Set(d.flow?.evidence ?? [])];
  out.actions = [...new Set((d.actions ?? []).flatMap((a) => a.evidence ?? []))];
  out.focus = [...new Set((d.focus ?? []).flatMap((a) => a.evidence ?? []))];
  return out;
}

export const sceneCitations = (d: ReadingDraftV1): Record<string, string[]> =>
  Object.fromEntries(Object.entries(citedEvidence(d)).map(([k, v]) => [k, v.filter((id) => id.startsWith("scene."))]));

/** 모든 글 조각을 하나로 */
export const allText = (d: ReadingDraftV1) => visibleTexts(d).map((t) => t.text).join("\n");
