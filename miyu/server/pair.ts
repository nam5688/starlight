import "server-only";
import type { PairDeps } from "@/lib/services/pair-service";
import { saleGateCheck } from "./capacity";
import { saleOpenOf } from "./sale-switch";
import { now, pairRepository, reportGenerator, writeRepository } from "./services";

/** 리포트 궁합 서비스에 넘기는 구현체 묶음 — 판매 스위치 · AI 연결 · 판매 문(용량 · 예산)은 요청할 때 확인한다 */
export function pairDeps(): PairDeps {
  return { repo: writeRepository(), pairs: pairRepository(), now, gate: saleGateCheck, generatorReady: Boolean(reportGenerator().generatePair), saleOpen: saleOpenOf("report-compat") };
}
