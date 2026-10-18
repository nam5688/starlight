// 읽는 사람의 연령대에 맞춘 근거 정리 — 만 19세 미만(운영자 2026-10-18)은 배우자 · 결혼 · 인연의 나이 방향 풀이를 하지 않는다.
//  · 만 16~18세(teen): 호감 · 연애 · 관계 경험 중심, 결혼 · 배우자 확정 풀이 제한 / 만 16세 미만(child): 또래 관계와 대인관계 성장 중심
//  · 기존 근거 가운데 배우자 별(saju.spouse-star)과 인연의 경향(saju.partner — 편한 상대의 분위기 · 나이 방향 · 오래 가는 관계)은 빼고, 나머지는 "배우자 · 연인" 말만 가까운 관계 말로 바꾼다.
//  · 새 명리 계산은 없다. story-7 형식에만 쓴다(이전 형식은 그대로).
import type { Evidence } from "../../../report/evidence.ts";
import { forAudience } from "./base.ts";
import type { Audience } from "./types.ts";

const DROPPED = new Set(["saju.spouse-star", "saju.partner"]);

export function adaptEvidenceForAudience(evidence: Evidence[], audience: Audience): Evidence[] {
  if (audience === "adult") return evidence;
  return evidence
    .filter((e) => !DROPPED.has(e.id))
    .map((e) => (e.id.startsWith("saju.frame.") ? e : { ...e, fact: forAudience(e.fact, audience), cue: forAudience(e.cue, audience), topics: e.topics.filter((t) => t !== "marriage") }));
}
