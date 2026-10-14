// 이메일 로그인(자체 로그인) 입력 규칙 — 채널 독립 코드. 화면과 서버가 같은 규칙을 쓴다.
// 비밀번호는 Supabase Auth가 해시로만 보관한다(미유 DB와 로그에는 비밀번호가 없다).

export const PASSWORD_MIN = 8;
/** bcrypt 해시의 한도(72바이트)를 넘으면 뒷부분이 무시된다 */
export const PASSWORD_MAX = 72;
export const EMAIL_MAX = 254;

export const PASSWORD_RULE = `${PASSWORD_MIN}자 이상, 영문과 숫자를 함께 넣어 주세요.`;

/** 공백을 지우고 소문자로 맞춘다 (같은 주소가 대소문자만 달라 두 계정이 되지 않게) */
export const normalizeEmail = (raw: unknown): string => (typeof raw === "string" ? raw.trim().toLowerCase() : "");

/** 가장 흔한 모양만 확인한다 — 실제로 받아 볼 수 있는지는 확인 메일이 가려 준다 */
export function emailError(email: string): string | null {
  if (!email) return "이메일을 적어 주세요.";
  if (email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(email)) return "이메일 주소 모양이 맞지 않아요.";
  return null;
}

/** 새 비밀번호 규칙 (가입 · 재설정). 로그인할 때는 규칙을 다시 검사하지 않는다 */
export function newPasswordError(password: unknown, email = ""): string | null {
  if (typeof password !== "string" || password.length === 0) return "비밀번호를 적어 주세요.";
  if (password.length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return `비밀번호는 ${PASSWORD_MAX}바이트(영문 기준 ${PASSWORD_MAX}자)를 넘을 수 없어요.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "영문과 숫자를 함께 넣어 주세요.";
  const local = email.split("@")[0];
  if (local.length >= 4 && password.toLowerCase().includes(local)) return "이메일 주소가 들어간 비밀번호는 쓸 수 없어요.";
  return null;
}

/** email: 오류 뒤에도 적던 이메일을 남겨 두기 위한 값 (비밀번호는 남기지 않는다) */
export type EmailFormState = { error?: string; notice?: string; email?: string };
