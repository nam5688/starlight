// 유료 궁합(사주 궁합 · 리포트 궁합) 판매 스위치. 순서는 이렇다.
//  ① 코드의 `saleOpen`(실결제 스위치)이 true면 열린다.
//  ② **실결제 모드(PAYMENTS_LIVE_MODE=true)이거나 결제 설정이 없으면 여기서 끝이다** — `testModeOpen` · 환경변수를 적어도 열리지 않는다.
//  ③ 시험 결제 모드에서는 코드의 `testModeOpen`(운영자 2026-10-20 "다 열고 실제 AI로 테스트")이 true면 열리고, 환경변수 `MIYU_TEST_OPEN_SALES`에 적은 상품도 열린다.
//  ④ 시험 결제 모드에서 닫고 싶으면 환경변수 `MIYU_TEST_CLOSE_SALES`에 상품 이름을 적는다(닫기가 이긴다).
// 쓰는 법(시험 환경, 운영자가 직접): MIYU_TEST_CLOSE_SALES=saju-compat,report-compat

import { PAIR_COMPAT, SAJU_COMPAT } from "./product.ts";

export type PaidCompat = "saju-compat" | "report-compat";

const CODE_SWITCH: Record<PaidCompat, boolean> = { "saju-compat": SAJU_COMPAT.saleOpen, "report-compat": PAIR_COMPAT.saleOpen };
const TEST_MODE_OPEN: Record<PaidCompat, boolean> = { "saju-compat": SAJU_COMPAT.testModeOpen, "report-compat": PAIR_COMPAT.testModeOpen };

const has = (list: string | null | undefined, sale: PaidCompat) =>
  (list ?? "")
    .split(",")
    .map((x) => x.trim())
    .includes(sale);

/** 판매 중인가 — list는 MIYU_TEST_OPEN_SALES 값, closeList는 MIYU_TEST_CLOSE_SALES 값, liveMode는 실결제 모드 여부(결제 설정이 없으면 true로 본다 — 어차피 결제를 시작할 수 없다) */
export function saleOpenFor(sale: PaidCompat, opts: { list?: string | null; closeList?: string | null; liveMode: boolean }): boolean {
  if (CODE_SWITCH[sale]) return true;
  if (opts.liveMode) return false;
  if (has(opts.closeList, sale)) return false;
  return TEST_MODE_OPEN[sale] || has(opts.list, sale);
}
