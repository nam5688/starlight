// 유료 질문 결제를 다녀오는 동안 질문 글을 브라우저에만 둔다 — 서버에는 저장하지 않는다(결제 주문에는 방 이름과 임의 번호만 있다).
// 결제가 끝나 돌아오면 한 번 읽어 바로 지우고, 결제하지 못한 채 돌아와도 한 번 읽어 입력창에 되돌려 놓은 뒤 지운다. 막힌 브라우저에서는 질문을 다시 적어야 할 뿐이다.

const VERSION = 1;
/** 이 시간이 지난 기록은 쓰지 않는다 — 오래된 질문이 갑자기 보내지지 않게 */
export const PAY_PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type PayPending = { q: string; orderNumber: string; at: number };
/** 저장할 때는 시각을 채워서 넘기지 않는다 — 이 파일이 지금 시각으로 적는다 */
export type PayPendingInput = Omit<PayPending, "at">;

const keyOf = (assessmentId: string, roomKey: string) => `miyu-pay-question:v${VERSION}:${assessmentId}:${roomKey}`;

export function savePayPending(assessmentId: string, roomKey: string, p: PayPendingInput): void {
  try {
    window.localStorage.setItem(keyOf(assessmentId, roomKey), JSON.stringify({ v: VERSION, ...p, at: Date.now() }));
  } catch {
    // 저장이 막힌 브라우저 — 결제 뒤 질문을 다시 적어야 할 뿐이다
  }
}

/** 읽고 바로 지운다 — 한 번만 쓰인다. 모양이 틀렸거나 오래됐으면 null */
export function takePayPending(assessmentId: string, roomKey: string, now = Date.now()): PayPending | null {
  try {
    const k = keyOf(assessmentId, roomKey);
    const raw = window.localStorage.getItem(k);
    if (!raw) return null;
    window.localStorage.removeItem(k);
    const v = JSON.parse(raw) as Partial<PayPending> & { v?: number };
    if (v.v !== VERSION || typeof v.q !== "string" || typeof v.orderNumber !== "string" || typeof v.at !== "number") return null;
    if (!v.q.trim() || now - v.at > PAY_PENDING_MAX_AGE_MS || now < v.at - 60_000) return null;
    return { q: v.q, orderNumber: v.orderNumber, at: v.at };
  } catch {
    return null;
  }
}
