// 결제하기(requestPayment) 한 번을 감싸는 안전 장치 — 채널 독립 코드(React · 토스 SDK를 불러오지 않는다. 결제 요청 함수는 호출하는 쪽이 넘겨 준다).
//
// 왜 따로 뒀나 (운영자 코드 점검 2026-10-20): 예전 화면은 "결제하기 뒤 20초 동안 화면이 그대로면 결제가 시작되지 않은 것"이라고 가정해 requestPayment가 아직 끝나지 않았는데도
// 버튼을 다시 열고 "결제는 되지 않았고 금액이 빠져나가지 않았어요"라고 말했다. 이 가정은 틀렸다 —
//  · 결제 요청(Promise)이 끝나지 않았다는 것은 실패가 아니다. 결제 창 · 카드 앱 · 본인 확인이 진행 중이거나 브라우저가 이동하는 중일 수 있고, 모바일에서는 이동하면서 약속이 영영 끝나지 않을 수 있다.
//  · 버튼을 다시 열면 같은 주문으로 결제 창이 두 번 열릴 수 있다.
//  · 결제 승인 여부는 이 화면이 알 수 없다 — 서버가 결제사 기록으로 확인한 뒤에만 정해진다.
// 그래서 이 장치는 ① 눌린 순간 동기로 잠그고(React state는 다음 렌더에야 바뀌므로 빠른 두 번 누름을 막지 못한다) ② 요청이 끝나지 않아도 스스로 풀지 않고 ③ 오래 걸리면 "결과를 확인하지 못했어요"라고만 알리며
// ④ 요청이 분명히 거절(reject)된 경우에만 잠금을 푼다. 승인 · 실패 판단은 하지 않는다.

/** requestPayment를 누른 뒤 이 시간이 지나도 끝나지 않으면 "아직 끝나지 않았다"고 알린다 — 실패로 보지 않고 버튼도 다시 열지 않는다 */
export const PAY_SLOW_MS = 20_000;
/** 운영 기록에 남기는 관찰 코드(오류가 아니다): 결제 요청이 PAY_SLOW_MS 넘게 끝나지 않았다 */
export const PAY_SLOW_CODE = "PAY_REQUEST_PENDING";
/** 숨겨진 화면(카드 앱 · 다른 앱으로 이동 중)에서는 보이는 화면이 될 때까지 이만큼씩 기다린다 */
export const PAY_SLOW_RECHECK_MS = 2_000;

/** 고객에게 보이는 안내 — 결제 여부를 단정하지 않고(되지 않았다고도 되었다고도 말하지 않는다) 다음에 할 수 있는 것을 알린다. 결제 요청이 아직 끝나지 않은 경우(카드사 인증 · 결제 창 진행 중) */
export const PAY_SLOW_NOTICE =
  "결제 창으로 넘어가는 데 시간이 걸리고 있어요. 결제 요청이 아직 끝나지 않았고, 결제가 되었는지는 확인하지 못했어요. 결제 창이나 카드 앱이 열려 있다면 그대로 진행해 주세요. 그래도 아무 창도 보이지 않으면 아래 [화면 새로고침]을 눌러 주세요. 결제가 완료로 확인됐다면 새로고침할 때 결과 화면으로 이동해요. 계속되면 이 화면의 주문번호와 함께 문의해 주세요.";

/** 결제 요청이 성공 응답으로 끝났는데도 20초가 지나도록 화면이 바뀌지 않은 경우의 안내 — 결제 결과는 서버가 결제사 기록으로 확인한다 */
export const PAY_SETTLED_NOTICE =
  "결제 요청은 마쳤고, 결제 결과를 확인하는 중이에요. 화면이 바뀔 때까지 잠시만 기다려 주세요. 오래 바뀌지 않으면 아래 [화면 새로고침]을 눌러 주세요. 결제가 완료로 확인됐다면 새로고침할 때 결과 화면으로 이동해요. 계속되면 이 화면의 주문번호와 함께 문의해 주세요.";

/** 안내 문구를 고른다 — 요청이 끝났는지(settled)에 따라 다르고, 어느 쪽도 결제가 되었는지 아닌지는 말하지 않는다 */
export function payNoticeText(info: { settled: boolean }): string {
  return info.settled ? PAY_SETTLED_NOTICE : PAY_SLOW_NOTICE;
}

export type PayRunResult =
  /** 이미 진행 중이라 새 요청을 보내지 않았다 */
  | { started: false }
  /** 요청이 끝났다(성공 응답) — 곧 결제 결과 화면으로 이동한다. 잠금은 풀지 않는다 */
  | { started: true; outcome: "settled" }
  /** 요청이 분명히 거절됐다(약관 미동의 · 창 닫기 · 오류 등) — 잠금을 풀었고 다시 누를 수 있다 */
  | { started: true; outcome: "rejected"; error: unknown };

export type PayRequestGuardOptions = {
  slowMs?: number;
  recheckMs?: number;
  /** 지금 이 화면이 보이는가(기본: 항상 보임) */
  isVisible?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type PayRequestGuard = {
  /** 결제 요청이 진행 중인가(동기 값) */
  inFlight: () => boolean;
  /**
   * 결제 요청을 한 번 보낸다. 이미 진행 중이면 보내지 않는다(같은 틱에 두 번 불러도 한 번만 나간다).
   * onSlow는 시작한 뒤 slowMs가 지나도록 화면이 사라지지 않았을 때(화면이 보일 때) 한 번만 불린다 — 요청도 잠금도 건드리지 않는다.
   * settled는 그 시점에 요청이 성공 응답으로 이미 끝났는지(끝났어도 이동하지 않았다면 결제 결과는 서버가 확인한다)다.
   */
  run: (requestPayment: () => Promise<unknown>, hooks?: { onSlow?: (info: { settled: boolean }) => void }) => Promise<PayRunResult>;
  /** 화면이 사라질 때 타이머만 치운다(진행 중인 요청 · 잠금은 건드리지 않는다) */
  dispose: () => void;
};

export function createPayRequestGuard(o: PayRequestGuardOptions = {}): PayRequestGuard {
  const slowMs = o.slowMs ?? PAY_SLOW_MS;
  const recheckMs = o.recheckMs ?? PAY_SLOW_RECHECK_MS;
  const isVisible = o.isVisible ?? (() => true);
  const setT = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let flying = false;
  let settled = false;
  let timer: unknown = null;

  const clearSlow = () => {
    if (timer !== null) clearT(timer);
    timer = null;
  };

  return {
    inFlight: () => flying,
    async run(requestPayment, hooks) {
      // 첫 줄에서 동기로 잠근다 — 아래 어떤 await보다 먼저라, 이 틱에 다시 불린 호출은 여기서 걸린다
      if (flying) return { started: false };
      flying = true;
      settled = false;
      clearSlow();
      const slow = () => {
        if (!isVisible()) {
          timer = setT(slow, recheckMs);
          return;
        }
        timer = null;
        hooks?.onSlow?.({ settled });
      };
      timer = setT(slow, slowMs);
      try {
        await requestPayment();
        settled = true;
        // 요청이 끝났다 — 결제 결과 화면으로 이동하는 중이다. 이동하지 않더라도 승인 여부를 모르므로 잠금도 안내 타이머도 그대로 둔다
        return { started: true, outcome: "settled" };
      } catch (error) {
        flying = false;
        clearSlow();
        return { started: true, outcome: "rejected", error };
      }
    },
    dispose: clearSlow,
  };
}
