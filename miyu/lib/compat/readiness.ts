// 사주 궁합 · 리포트 궁합이 "지금 받을 수 있는지"를 한 곳에서 정한다(채널 독립 순수 규칙).
// 받을 수 있으려면 두 조건이 모두 맞아야 한다: ① 판매 스위치가 열려 있다 ② 풀이를 쓰는 AI가 연결돼 있다(`generatorReady`).
// 예전에는 홈 · 궁합 화면이 ①만 보고 "지금 이용 가능"이라 적었고, AI가 꺼진 환경에서는 누른 뒤에야 "AI 연결이 끝난 뒤에 받을 수 있어요"가 나왔다.
// 이 규칙은 AI를 켜거나 결제 가드를 우회하지 않는다 — 준비되지 않았을 때 준비되지 않았다고 먼저 말할 뿐이다.

export type CompatReadinessState = "open" | "switch-closed" | "ai-off";

export type CompatReadiness = {
  state: CompatReadinessState;
  /** 지금 시작 버튼을 보여 주고 결제를 시작할 수 있는가 */
  open: boolean;
  /** 이름 옆 상태 표시 */
  badge: "지금 이용 가능" | "준비 중";
  /** 준비 중일 때 고객에게 알리는 이유 한 줄(열려 있으면 null) */
  note: string | null;
};

const AI_OFF_NOTE = "풀이를 쓰는 AI가 아직 연결되지 않아 지금은 받을 수 없어요. 결제는 시작되지 않고 카드에서 금액이 빠져나가지 않아요.";
const SWITCH_CLOSED_NOTE = "아직 열리지 않았어요.";

export function compatReadinessOf(input: { saleOpen: boolean; generatorReady: boolean }): CompatReadiness {
  if (!input.saleOpen) return { state: "switch-closed", open: false, badge: "준비 중", note: SWITCH_CLOSED_NOTE };
  if (!input.generatorReady) return { state: "ai-off", open: false, badge: "준비 중", note: AI_OFF_NOTE };
  return { state: "open", open: true, badge: "지금 이용 가능", note: null };
}
