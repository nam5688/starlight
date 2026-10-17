// 운영자 본인 입력 시험(2026-10-17) — 로컬 22문항 화면(/analyze)에서 푼 응답을 이 PC의 파일로만 내보내도 되는 환경인지 판단한다. 순수 함수(환경변수를 인자로 받는다).
// 운영 DB · 공개 배포에서는 절대 켜지지 않아야 하므로 "켠 사람이 직접 적은 값 + 개발 서버 + Vercel 아님"이 모두 맞을 때만 켠다.

export const OWN_INPUT_ENV = "MIYU_OWN_INPUT_CAPTURE";

export type OwnInputGuardEnv = { MIYU_OWN_INPUT_CAPTURE?: string; NODE_ENV?: string; VERCEL?: string; VERCEL_ENV?: string };

/** true일 때만 /analyze의 응답을 pilot-data/own-input/latest.json(저장소에 올라가지 않는 폴더)에 적는다 */
export function ownInputCaptureEnabled(env: OwnInputGuardEnv): boolean {
  if (env.MIYU_OWN_INPUT_CAPTURE !== "yes") return false;
  // 개발 서버(next dev)에서만 — 빌드된 서버(production) · Vercel(미리보기 · 운영)에서는 값을 적어도 켜지지 않는다
  if (env.NODE_ENV === "production") return false;
  if (env.VERCEL || env.VERCEL_ENV) return false;
  return true;
}
