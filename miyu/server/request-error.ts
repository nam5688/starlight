import "server-only";
import { errorIdFromDigest, newErrorId, safeErrorMessage, safePath } from "@/lib/ops/redact";
import { alert } from "./ops";
import { now, writeRepository } from "./services";

// 같은 요청이 서버 렌더링 · 데이터 렌더링에서 같은 오류를 거의 동시에 여러 번 보고한다 — DB 조회 전에 이 서버 안에서 먼저 걸러낸다
const recent = new Map<string, number>();
const DEDUPE_MS = 60_000;

type RequestInfo = { path: string; method: string };
type ErrorContext = { routePath: string; routeType: string };

/** /checkout/MEU-… · /my/orders/MEU-… 같은 경로에서 주문번호를 꺼낸다 (오류와 주문을 이어 주기 위함) */
function orderNumberFromPath(path: string): string | null {
  const m = /^\/(?:checkout|my\/orders)\/([A-Za-z0-9_=-]{6,64})(?:\/|$)/.exec(path);
  return m?.[1] ?? null;
}

/**
 * 서버에서 처리하지 못한 오류를 운영 기록으로 남기고 알린다 (instrumentation.ts의 onRequestError에서 부른다).
 * 남기는 것: 오류 식별번호 · 경로(쿼리 제외) · 요청 방식 · 종류 · 가린 메시지. 남기지 않는 것: 요청 본문 · 쿠키 · 헤더 · stack · 고객 입력.
 */
export async function recordRequestError(error: unknown, request: RequestInfo, context: ErrorContext): Promise<void> {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : "";
  const errorId = digest ? errorIdFromDigest(digest) : newErrorId();
  const path = safePath(request.path);
  const dedupeKey = `server.error:${context.routePath}:${errorId}`;
  // 1분 안의 같은 오류번호는 한 번만 남긴다
  const t = now().getTime();
  if (t - (recent.get(dedupeKey) ?? 0) < DEDUPE_MS) return;
  recent.set(dedupeKey, t);
  if (recent.size > 200) for (const [k, v] of recent) if (t - v >= DEDUPE_MS) recent.delete(k);
  try {
    if (await writeRepository().hasOpsEventSince(dedupeKey, new Date(t - DEDUPE_MS).toISOString())) return;
  } catch {
    // 조회 실패 시 그냥 남긴다
  }
  await alert({
    kind: "server.error",
    severity: "error",
    title: `화면 · 요청 처리 중 오류 (${context.routeType})`,
    orderNumber: orderNumberFromPath(path),
    errorId,
    // 같은 오류는 6시간에 한 번만 알린다 (기록은 매번 남는다)
    dedupeKey,
    lines: [`${request.method} ${path}`, safeErrorMessage(error, 160)],
  });
}
