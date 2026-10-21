// 관리자 "결제사와 대조해 맞추기" 한 번의 결과를, 운영자가 화면에서 바로 읽을 말과 운영 기록 한 줄로 옮긴다.
//
// 왜 따로 뒀나 (운영자 확인 2026-10-22): 대조 버튼을 눌러도 새 안내 · 기록이 보이지 않았다. 예전 동작은 ① 결과 종류(ok · error …)를 영어 그대로 한 줄로만 알렸고
// ② 결제사 조회가 실패(error)하면 "주문은 그대로인지 · 어떤 코드였는지"를 말하지 않았으며 ③ 대조 중 오류가 나면 아무 안내 없이 끝났다.
// 이 모듈은 어떤 결과든(성공 · 불일치 · 조회 실패 · 예외) 반드시 "무엇을 했고 주문은 어떻게 됐는지"를 한 번 돌려준다.
// 결제 성공 · 실패의 판단은 하지 않는다 — 판단은 결제사 기록으로 서버가 하고, 여기서는 그 결과를 설명만 한다. 주문 상태를 바꾸는 코드는 이 파일에 없다.

import { newErrorId } from "../ops/redact.ts";
import { orderStatusLabel } from "./my-service.ts";
import type { OrderRecord } from "./ports.ts";
import type { ReconcileOutcome } from "./reconcile-service.ts";

export type AdminReconcileResult = {
  /** 화면에 보이는 결과 (고객 정보 · 키 없음) */
  note: string;
  /** 운영 기록에 남기는 한 줄 */
  record: string;
  /** 운영 기록의 심각도 — 사람이 봐야 하는 결과(조회 실패 · 불일치)는 warn, 예외는 error */
  severity: "info" | "warn" | "error";
  /** 대조가 주문 상태를 바꿨는가 */
  changed: boolean;
  /** 예외가 났을 때만 있는 오류 식별번호 */
  errorId?: string;
  kind: ReconcileOutcome["kind"] | "exception";
  code?: string;
};

/** 결제사 응답 코드 → 운영자가 알아볼 수 있는 한 문장 (코드는 따로 함께 보인다) */
function gatewayCodeHint(code: string): string {
  if (code === "NOT_FOUND_MERCHANT") {
    return "결제사가 '존재하지 않는 상점 정보'라고 응답했다는 뜻입니다. 결제가 성공했는지 실패했는지와는 별개이며, 서버가 쓰는 결제 키 구성을 점검해야 합니다 (docs/toss-key-config-readonly-check-v1.md).";
  }
  if (code === "NETWORK_ERROR" || code === "INVALID_RESPONSE" || /^HTTP_5\d\d$/.test(code)) {
    return "결제사에 연결하지 못했거나 응답을 읽지 못했습니다. 일시적일 수 있으니 잠시 뒤 다시 눌러 보세요.";
  }
  return "결제사가 돌려준 코드입니다. 이 코드로는 결제 성공 · 실패를 알 수 없습니다.";
}

const WAITING_REASON: Record<string, string> = {
  TOO_EARLY: "주문한 지 얼마 안 돼 아직 확인하지 않았습니다",
  NO_PAYMENT_YET: "결제사에 아직 결제 기록이 없습니다",
  READY: "결제사에서 결제가 준비 단계입니다",
  IN_PROGRESS: "결제사에서 결제가 진행 중입니다 (카드사 인증 대기일 수 있습니다)",
  WAITING_FOR_DEPOSIT: "결제사에서 입금을 기다리는 중입니다",
};

export function describeReconcile(outcome: ReconcileOutcome, now: Date): AdminReconcileResult {
  const order = outcome.order;
  const stateNow = orderStatusLabel(order, now);
  switch (outcome.kind) {
    case "paid": {
      const changed = outcome.transitioned !== false;
      return {
        kind: "paid",
        changed,
        severity: changed ? "warn" : "info",
        note: changed ? "결제사 승인 기록을 확인해 주문을 '결제 완료'로 맞췄습니다. 리포트 준비를 시작했습니다." : `결제사 승인 기록과 주문이 이미 일치합니다. 주문은 '${stateNow}' 그대로이고 바꾼 것이 없습니다.`,
        record: changed ? "운영자가 결제사와 대조: 주문을 결제 완료로 맞춤" : "운영자가 결제사와 대조: 이미 결제 완료로 일치 (변경 없음)",
      };
    }
    case "partial-refund":
      return {
        kind: "partial-refund",
        changed: true,
        severity: "warn",
        note: `결제사의 부분 취소를 확인해 질문 묶음에 반영했습니다 (누적 ${outcome.refund.refundedKrw.toLocaleString("ko-KR")}원 · 질문 ${outcome.refund.questions}개 환불).`,
        record: `운영자가 결제사와 대조: 부분 취소를 묶음에 반영 (누적 ${outcome.refund.refundedKrw}원)`,
      };
    case "refunded":
      return {
        kind: "refunded",
        changed: true,
        severity: "warn",
        note: "결제사에서 취소된 결제를 확인해 주문을 '환불 완료'로 맞췄습니다. 열람 권한을 회수했습니다.",
        record: "운영자가 결제사와 대조: 주문을 환불 완료로 맞춤",
      };
    case "closed":
      return {
        kind: "closed",
        changed: true,
        severity: "info",
        note: `결제가 끝나지 않은 주문을 정리했습니다 (${outcome.reason}). 주문은 이제 '${stateNow}'입니다.`,
        record: `운영자가 결제사와 대조: 끝나지 않은 주문 정리 (${outcome.reason})`,
      };
    case "waiting": {
      const why = WAITING_REASON[outcome.reason] ?? `결제사 상태 ${outcome.reason}`;
      return {
        kind: "waiting",
        changed: false,
        severity: "info",
        code: outcome.reason,
        note: `${why}. 주문은 '${stateNow}' 그대로 두었습니다 (코드 ${outcome.reason}). 시간이 지난 뒤 다시 눌러 주세요.`,
        record: `운영자가 결제사와 대조: 기다리는 중 (${outcome.reason}), 변경 없음`,
      };
    }
    case "ok": {
      const p = outcome.payment;
      if (p) {
        // 결제사에 물어 DONE과 맞았다 — 무엇과 맞았는지(결제사 상태 · 금액 · 취소된 금액 · 조회 경로)를 말한다
        const detail = `결제사 ${p.status} · ${p.totalAmount.toLocaleString("ko-KR")}원 · 취소 ${(p.totalAmount - p.balanceAmount).toLocaleString("ko-KR")}원 · ${p.via === "paymentKey" ? "결제 키로 조회" : "주문번호로 조회"}`;
        return {
          kind: "ok",
          changed: false,
          severity: "info",
          note: `결제사 기록도 승인 완료이고 주문번호 · 금액이 주문과 같습니다 (${detail}). 주문은 '${stateNow}' 그대로이고 바꾼 것이 없습니다.`,
          record: `운영자가 결제사와 대조: 결제사 기록과 일치 (${p.status} ${p.totalAmount}원, ${p.via === "paymentKey" ? "결제 키" : "주문번호"} 조회), 변경 없음`,
        };
      }
      if (order.status !== "paid") {
        // 결제 완료 · 대기가 아닌 주문(환불 완료 · 취소 등)은 이미 정리된 상태라 결제사에 다시 묻지 않는다
        return {
          kind: "ok",
          changed: false,
          severity: "info",
          note: `이 주문은 이미 '${stateNow}'로 정리돼 있어 결제사에 다시 묻지 않았고 바꾼 것이 없습니다.`,
          record: `운영자가 결제사와 대조: 이미 정리된 주문(${stateNow}), 결제사 조회 없음, 변경 없음`,
        };
      }
      return {
        kind: "ok",
        changed: false,
        severity: "info",
        note: `결제사 기록과 이미 맞습니다 (이미 반영한 부분 취소 포함). 주문은 '${stateNow}' 그대로이고 바꾼 것이 없습니다.`,
        record: "운영자가 결제사와 대조: 결제사 기록과 일치 (변경 없음)",
      };
    }
    case "anomaly":
      return {
        kind: "anomaly",
        changed: false,
        severity: "warn",
        code: outcome.code,
        note: `결제사 기록과 주문이 맞지 않습니다 (코드 ${outcome.code}): ${outcome.message} 자동으로 고치지 않았습니다. 주문은 '${stateNow}'로 두었으니 결제사 화면에서 직접 확인하세요.`,
        record: `운영자가 결제사와 대조: 불일치 (${outcome.code}), 자동 수정 없음`,
      };
    case "error":
      return {
        kind: "error",
        changed: false,
        severity: "warn",
        code: outcome.code,
        note: `결제사 조회에 실패해 대조하지 못했습니다 (코드 ${outcome.code}). ${gatewayCodeHint(outcome.code)} 주문은 '${stateNow}' 그대로이고 바꾸지 않았습니다.`,
        record: `운영자가 결제사와 대조: 결제사 조회 실패 (${outcome.code}), 주문 변경 없음 (${stateNow})`,
      };
  }
}

export type AdminReconcileDeps = {
  /** 실제 대조 (서버에서는 reconcileOneNow) — 결제사에 한 번 묻고 주문을 맞춘다 */
  reconcile: (order: OrderRecord) => Promise<ReconcileOutcome>;
  now: () => Date;
  /** 시험에서 오류 번호를 고정할 때만 넘긴다 */
  errorId?: () => string;
};

/**
 * 관리자 대조 한 번 — 결과가 무엇이든(조회 실패 · 예외 포함) 안내 한 건을 돌려준다. 예외는 밖으로 던지지 않는다(안내 없이 끝나지 않게).
 * 예외 메시지는 담지 않는다: DB 오류에 행 내용이 섞일 수 있어, 운영자는 오류 번호로 서버 기록을 찾는다.
 */
export async function adminReconcileOnce(deps: AdminReconcileDeps, order: OrderRecord): Promise<AdminReconcileResult> {
  try {
    return describeReconcile(await deps.reconcile(order), deps.now());
  } catch {
    const errorId = (deps.errorId ?? newErrorId)();
    return {
      kind: "exception",
      changed: false,
      severity: "error",
      errorId,
      note: `대조하는 중 오류가 났습니다 (${errorId}). 주문 상태가 바뀌었는지는 확인되지 않았으니 이 주문을 다시 조회해 확인하세요. 같은 오류 번호로 운영 기록을 찾을 수 있습니다.`,
      record: `운영자가 결제사와 대조하다 오류 (${errorId}), 주문 변경 여부 미확인`,
    };
  }
}
