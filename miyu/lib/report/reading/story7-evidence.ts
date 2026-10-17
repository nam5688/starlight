// 7개 대주제(story-7)마다 쓸 근거를 코드가 나눠 건네는 규칙 — 지시문의 사용자 메시지와 검사가 같은 함수를 쓴다(근거를 두 군데에서 따로 정하면 지시문은 A를 건네고 검사는 B를 요구하는 어긋남이 생긴다).
// 사주 근거는 장마다 소유(story7-plan.ts의 sajuOwns), 응답 · 입력 근거는 겹치지 않게 나눠 주되(assignPersonal) 모자란 장은 다른 장의 근거를 빌려 받고, 입력한 MBTI는 맞닿는 장(1 · 3 · 5번)마다 건넨다.
import type { Evidence } from "../evidence.ts";
import { assignPersonal, slotsOf7 } from "./story7-measure.ts";
import { STORY7_MBTI_NOS, STORY7_SECTIONS } from "./story7-plan.ts";

export type Story7Evidence = {
  /** 장 번호 → 그 장이 앞세울 사주 근거 ID */
  saju: Record<number, string[]>;
  /** 장 번호 → 그 장이 쓸 개인 성향 근거 ID(소유 + 빌림 + 입력한 MBTI) */
  personal: Record<number, string[]>;
  /** 장 번호 → 소유한 개인 성향 근거 ID(빌린 것 · MBTI 제외) */
  owned: Record<number, string[]>;
  /** 장 번호 → 모자라서 다른 장에서 빌려 온 개인 성향 근거 ID */
  borrowed: Record<number, string[]>;
};

export function story7Evidence(evidence: Evidence[]): Story7Evidence {
  const assigned = assignPersonal(evidence, slotsOf7());
  const sajuUsable = evidence.filter((e) => e.source === "saju" && !e.uncertain);
  const hasMbti = evidence.some((e) => e.id === "self.mbti" && !e.uncertain);
  const out: Story7Evidence = { saju: {}, personal: {}, owned: {}, borrowed: {} };
  for (const s of STORY7_SECTIONS) {
    const key = String(s.no);
    out.saju[s.no] = sajuUsable.filter((e) => s.sajuOwns.some((re) => re.test(e.id))).map((e) => e.id);
    out.owned[s.no] = assigned.owned[key];
    out.borrowed[s.no] = assigned.borrowed[key];
    out.personal[s.no] = [...assigned.owned[key], ...assigned.borrowed[key], ...(hasMbti && (STORY7_MBTI_NOS as readonly number[]).includes(s.no) ? ["self.mbti"] : [])];
  }
  return out;
}
