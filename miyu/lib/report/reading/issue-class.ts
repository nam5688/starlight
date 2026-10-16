// 검사가 돌려준 오류 문구를 성격별로 가른다(운영자 2026-10-16: "내용 오류와 사소한 형식 문제를 같은 실패로 묶지 마").
//   · content — 계산 · 응답 · 시기 · 사건을 잘못 만들었거나 근거 없는 판정 · 확정 · 예언을 쓴 내용 오류. 고치기 전에는 정상 리포트로 확정하지 않는다.
//   · format  — 용어 설명 · 문장 수 · 글자 수 · 개수 · 구조 같은 형식 · 가독성 문제. 설명을 보완하거나 구조를 맞추면 되며 판정이 틀린 것과 같은 수준으로 묶지 않는다.
//   · quality — 반복 · 재진술 · 응답 읽어 주기 · 되풀이 같은 내용 품질 문제. 편집(통합 · 줄이기)으로 다룬다.
// 네 번째 구분인 "검사가 정상 문장을 잘못 막은 오탐"은 글을 읽은 사람이 붙이는 판단이라 문구만으로는 알 수 없다 — 검토 문서(prompt-pack-review.md 12장)가 사람이 읽고 붙인다.
// 이 분류는 읽는 사람을 위한 보고 · 검토 도구다. 생성기의 통과 · 고쳐 쓰기 판단은 그대로이며(어느 종류든 저장 전에는 고쳐 쓰게 한다), 품질로 분류된 글이 자동으로 고객에게 보이지 않는다.
export type IssueClass = "content" | "format" | "quality";

export const ISSUE_CLASS_LABEL: Record<IssueClass, string> = {
  content: "내용 오류 (계산 · 응답 · 시기 · 사건을 잘못 만듦, 근거 없는 판정)",
  format: "형식 · 가독성 (용어 설명 · 문장 수 · 글자 수 · 개수 · 구조)",
  quality: "내용 품질 (반복 · 재진술 · 응답 읽어 주기)",
};

// 위에서부터 처음 맞는 것이 이긴다. 맞는 것이 없으면 내용 오류로 본다(모르는 오류를 가볍게 취급하지 않는다).
const RULES: { re: RegExp; cls: IssueClass }[] = [
  // 장면 질문 경로(answer-use.ts)의 표지: 답하지 않은 응답을 사실처럼 쓰거나 근거 ID 없이 응답을 말하면 내용 오류, 선택지 문장 옮기기 · 답을 나열한 제목 · 얼버무린 양자택일은 내용 품질
  { re: /^(?:INVENTED|UNCITED)\b/, cls: "content" },
  { re: /^(?:ECHO|TITLE|FLAT_EITHER)\b/, cls: "quality" },
  // 형식 · 가독성이지만 낱말이 내용 오류와 겹치는 문구를 먼저 가른다
  { re: /설명 없는 사주 용어|한 문장에 사주 용어가|해석 키워드 나열/, cls: "format" },
  // 내용 오류: 근거 없는 판정 · 계산과 반대 · 계산되지 않은 시기 · 없는 근거 · 나이 · 예언 · 확정 · 보장 · 원인 단정 · 점수
  { re: /근거 목록에 없는 판정|근거 없는 판정|계산된 .*와 반대|계산되지 않은 해|계산된 해가 아닙니다|없는 근거 ID|확실하지 않은 근거만|사주 근거가 없습니다|시기 근거|ref가 목록에 없습니다|나이를 쓰지 않습니다|쓰지 않는 표현|원인을 하나로 좁혀|고민을 알려 주지 않았는데|점수 · 퍼센트|확률이 아닌 가능성/, cls: "content" },
  // 내용 품질: 반복 · 재진술 · 응답 읽어 주기 · 한계 경고 반복 · 자료 없음 말
  { re: /되풀이|반복됩니다|같은 표현이 여러 곳|응답을 그대로 읽어 주는|경고를 붙이지|응답이나 자료가 없다는 말|같은 장면|거의 같습니다|예시가 요약과 같습니다|좋고 나쁨으로 말하지|두 번 썼습니다/, cls: "quality" },
  // 형식 · 가독성: 글자 수 · 문장 수 · 개수 · 구조 · 목록 · 이름 · 겹침
  { re: /길이 \d+자|\d+문장|\d+개 \(|글이 없습니다|카드가 없습니다|목록이 아닙니다|근거 ID가 없습니다|JSON 형식|이름을 쓰지 않습니다|이 주제는 .*(?:쓰지 않습니다|따로 두지 않습니다)|겹칩니다|가 없습니다|알려 준 내용임을 밝히며|focus: 알려 주신 고민이 없는데|반응이 이어지는 모습이 없습니다/, cls: "format" },
];

export function classifyReadingIssue(message: string): IssueClass {
  for (const r of RULES) if (r.re.test(message)) return r.cls;
  return "content";
}

/** 오류 문구 목록을 성격별로 묶는다 */
export function groupReadingIssues(errors: string[]): Record<IssueClass, string[]> {
  const out: Record<IssueClass, string[]> = { content: [], format: [], quality: [] };
  for (const e of errors) out[classifyReadingIssue(e)].push(e);
  return out;
}
