// 리포트 궁합의 호칭 — 저장되는 글은 두 사람의 이름 · 생년월일 · 응답이 없는 익명 "A님 · B님"이다(assemblePairReport, 개인정보 계약).
// 화면은 저장된 글을 바꾸지 않고, 읽는 사람이 A 쪽인지 B 쪽인지(pair-service의 role)에 맞춰 보여 주기 직전에만 "본인 · 상대"로 바꾼다.
// 그래서 같은 저장 글이어도 A가 읽으면 "A님은 본인", B가 읽으면 "B님이 본인"이 되어 서로 뒤바뀌어 보이고(각자 자기 눈에는 본인이 본인), 이름이 글에 들어가지 않는다.
// 조사는 받침에 맞춰 바꾼다("A님이 → 본인이 / 상대가", "B님은 → 상대는 / 본인은"). 읽는 사람을 모르는 화면(개발용 미리보기)은 호출하지 않고 "A님 · B님"을 그대로 둔다.
// 이 파일은 Next.js · React · 외부 SDK를 불러오지 않는다(lib/core.test.ts).
export type PairViewer = "a" | "b";

export const SELF_LABEL = "본인";
export const OTHER_LABEL = "상대";

/** 받침이 있는 말(본인)에 붙는 조사 — 자리표시자 뒤의 조사를 그대로 두거나 받침에 맞게 바꾼다 */
const SELF_JOSA: Record<string, string> = { 은: "은", 는: "은", 이: "이", 가: "이", 을: "을", 를: "을", 과: "과", 와: "과", 으로: "으로", 로: "으로", 이나: "이나", 나: "이나", 이랑: "이랑", 랑: "이랑" };
/** 받침이 없는 말(상대)에 붙는 조사 */
const OTHER_JOSA: Record<string, string> = { 은: "는", 는: "는", 이: "가", 가: "가", 을: "를", 를: "를", 과: "와", 와: "와", 으로: "로", 로: "로", 이나: "나", 나: "나", 이랑: "랑", 랑: "랑" };

/** "A님" 뒤에 붙을 수 있는 조사(긴 것부터) — 받침에 따라 달라지지 않는 조사(의 · 에게 · 도 · 만 …)는 그대로 둔다 */
const PLACEHOLDER = /([AB])님(께서|에게서|에게|한테|처럼|보다|이랑|이나|으로|은|는|이|가|을|를|과|와|의|도|만|께|로|랑|나)?/g;

/** 읽는 사람 기준으로 "A님 · B님"을 "본인 · 상대"로 바꾼다 — a가 읽으면 A님이 본인, b가 읽으면 B님이 본인이다 */
export function viewerText(text: string, viewer: PairViewer): string {
  return text.replace(PLACEHOLDER, (_m, who: "A" | "B", josa: string | undefined) => {
    const self = (who === "A") === (viewer === "a");
    const label = self ? SELF_LABEL : OTHER_LABEL;
    if (!josa) return label;
    return label + ((self ? SELF_JOSA : OTHER_JOSA)[josa] ?? josa);
  });
}

/** 글 속에 익명 자리표시자(A님 · B님)가 남아 있는가 — 고객 화면에 노출되면 안 되는 말을 시험이 찾는 데 쓴다 */
export const hasPlaceholder = (text: string): boolean => /(?<![A-Za-z])[AB]님/.test(text);
