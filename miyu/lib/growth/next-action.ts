// "다음에 무엇을 보여줄까" 규칙. 고객의 현재 상태(완료 단계·보유 상품)로 먼저 보여줄 행동 하나를 고른다.
// 화면마다 상품 배너를 따로 넣지 않고, 상품이 늘어나도 이 함수만 고친다.
//
// 지켜야 할 것
// - 결제·생성 오류가 있으면 복구만 보여주고 어떤 추가 판매도 하지 않는다
// - 방금 결제한 고객에게는 구매 결과를 먼저 보여주고 추가 상품 팝업을 띄우지 않는다
// - 점수(예: 관계 불안이 높음)를 근거로 더 비싼 상품이나 더 강한 문구를 고르지 않는다 — 입력에 점수를 받지 않는다
//
// 이후 추가할 상태: 검사 도중 이탈(이어서 하기), 상대 초대 대기, 두 사람 응답·동의 완료, 공동 결과 열람 등

import type { ReportStatus } from "../commerce/report.ts";

export type ResultState = {
  purchase: "none" | "paid" | "refunded";
  reportStatus: ReportStatus | null;
};

export type NextActionKind = "buy-report" | "open-report" | "wait-report" | "recover-report" | "refund-info";

export type NextAction = {
  kind: NextActionKind;
  /** 버튼·목록에 쓰는 문구 */
  label: string;
  /** 관련 내용 옆에 다른 상품을 제안해도 되는 상태인지 (오류·결제 직후·미구매에서는 false) */
  allowRelatedOffer: boolean;
};

export function nextActionForResult(state: ResultState): NextAction {
  if (state.purchase === "paid") {
    if (state.reportStatus === "ready") {
      return { kind: "open-report", label: "구매한 리포트 보기", allowRelatedOffer: true };
    }
    if (state.reportStatus === "generating" || state.reportStatus === "queued") {
      return { kind: "wait-report", label: "리포트 준비 중", allowRelatedOffer: false };
    }
    // 생성 실패 또는 아직 만들지 않음: 다시 결제시키지 않고 생성만 복구한다
    return { kind: "recover-report", label: "리포트 다시 만들기", allowRelatedOffer: false };
  }
  if (state.purchase === "refunded") {
    return { kind: "refund-info", label: "환불 안내 보기", allowRelatedOffer: false };
  }
  // 무료 요약만 본 상태: 관련 없는 여러 상품 대신 심층 리포트 하나만 제안한다
  return { kind: "buy-report", label: "심층 리포트 보기", allowRelatedOffer: false };
}
