// 로그인 전 검사 결과를 잠시 담아 두는 쿠키의 암호화 (AES-256-GCM).
// Next.js에 의존하지 않는다 — 단위 테스트에서 직접 불러온다.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/** 서버 비밀값에서 이 용도 전용 키를 따로 만든다 */
export function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "meu-pending-submission", "v1", 32));
}

export function seal(data: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** 위조·손상·다른 키로 만든 값이면 null */
export function open<T>(token: string, key: Buffer): T | null {
  try {
    const raw = Buffer.from(token, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
