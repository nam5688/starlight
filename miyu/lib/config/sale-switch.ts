// 유료 궁합(사주 궁합 · 리포트 궁합) 판매 스위치 — 코드의 `saleOpen` 상수가 기본이고, 로컬 · 스테이징 시험에서만 환경변수로 덮어쓸 수 있다.
// 덮어쓰기는 **결제가 테스트 모드(실결제 아님)일 때만** 듣는다 — 실결제 모드(PAYMENTS_LIVE_MODE=true)에서는 환경변수를 적어도 열리지 않는다(코드 상수만 본다).
// 쓰는 법(시험 환경, 운영자가 직접): MIYU_TEST_OPEN_SALES=saju-compat,report-compat

import { PAIR_COMPAT, SAJU_COMPAT } from "./product.ts";

export type PaidCompat = "saju-compat" | "report-compat";

const CODE_SWITCH: Record<PaidCompat, boolean> = { "saju-compat": SAJU_COMPAT.saleOpen, "report-compat": PAIR_COMPAT.saleOpen };

/** 판매 중인가 — list는 MIYU_TEST_OPEN_SALES 값, liveMode는 실결제 모드 여부(결제 설정이 없으면 false로 본다 — 어차피 결제를 시작할 수 없다) */
export function saleOpenFor(sale: PaidCompat, opts: { list?: string | null; liveMode: boolean }): boolean {
  if (CODE_SWITCH[sale]) return true;
  if (opts.liveMode) return false;
  return (opts.list ?? "")
    .split(",")
    .map((x) => x.trim())
    .includes(sale);
}
