// 읽기 쉬운 정도의 경고(WARN) 표지 — 개인 심층 리포트(story-7)와 궁합 풀이(사주 궁합 · 리포트 궁합)가 같이 쓴다(운영자 정책 2026-10-17).
// "미유는 사주를 실제로 풀이하는 서비스라 명리 용어를 쓸 때마다 즉시 풀이하게 강제하면 글이 부자연스러워진다 — 용어로 어떤 결론을 냈는지는 읽는 사람이 이해할 수 있어야 한다."
//  · WARN: 설명 없는 사주 용어 · 한 문장 / 한 문단 / 첫 문단의 용어 개수 · 용어 나열 · 문단 문장 수. 저장을 막지 않고 고쳐 쓰기도 부탁하지 않으며 글은 그대로 두고 경고로만 보인다.
//  · BLOCK(나머지 전부): 계산 · 십성/오행 대응이 근거와 어긋남 · 없는 근거 ID 인용 · 근거에 없는 판정(격국 · 용신 등) · 없는 시주를 확정하는 풀이 · 입력하지 않은 사건 · 가족사 단정 · 개인정보(이름 · 호칭) · 장 · 필수 칸 누락 · 형식 오류.
// 오류 문구의 첫머리로 가른다(검사들이 같은 문구를 쓴다 — terms.ts · story7-validate.ts · compat/validate.ts). 문구를 바꾸면 이 표지도 같이 바꾼다(warn-policy.test.ts가 확인).
//  · WARN(운영자 정책 2026-10-18, story-7만): 장 제목 길이(8~40자)와 문단 최소 길이(60자)가 어긋난 것 — 글이 있으면 경고만 하고 저장을 막지 않는다. 글이 없거나 비어 있는 것(내용 누락) · 문단 최대 길이(420자)는 BLOCK 그대로다.
const TERM_WARNING = /설명 없는 사주 용어|한 문장에 사주 용어가|한 문단에 사주 용어가|첫 문단에 사주 용어|해석 키워드 나열|\d+문장 \(\d+문장 이하로 묶어 주세요\)|길이 \d+자 \(권장 \d+~\d+자 — 경고만 하고 저장은 막지 않습니다\)/;

export const isTermWarning = (message: string): boolean => TERM_WARNING.test(message);

/** 오류 문구를 BLOCK(blocks)과 WARN(warnings)으로 가른다(같은 문구는 하나로) */
export function splitWarnings(messages: string[]): { blocks: string[]; warnings: string[] } {
  const all = [...new Set(messages)];
  return { blocks: all.filter((m) => !isTermWarning(m)), warnings: all.filter(isTermWarning) };
}
