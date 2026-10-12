import type { Instrumentation } from "next";

/**
 * 서버 오류를 운영 기록(ops_events)과 알림으로 남긴다.
 * Node 서버에서만 동작한다 (Edge에는 DB 접속이 없다). 기록 실패는 요청 처리에 영향을 주지 않는다.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { recordRequestError } = await import("./server/request-error");
    await recordRequestError(error, { path: request.path, method: request.method }, { routePath: context.routePath, routeType: context.routeType });
  } catch {
    // 오류 기록 중 오류는 삼킨다
  }
};
