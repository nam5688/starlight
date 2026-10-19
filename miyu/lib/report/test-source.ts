// 시험이 소스 파일을 글로 읽어 연결을 점검할 때 쓰는 도구 — 글자는 바꾸지 않고 줄바꿈만 LF로 맞춘다.
// Windows에서 git 설정(core.autocrlf=true)으로 작업 폴더의 소스가 CRLF가 되면 "줄바꿈이 든 문자열"을 찾는 점검이 어긋나기 때문이다(2026-10-19, 운영자 Windows 확인).
// 연결 점검 자체를 지우거나 git 전역 설정을 바꾸지 않고, 읽는 단계에서만 정규화한다.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// 허용하는 차이는 "CRLF ↔ LF" 한 가지뿐이다 — 낱개 CR · 글자 · 공백 · 따옴표가 바뀐 것은 그대로 다른 글로 남는다.
// (보존 원본 · 지시문 보관본 · SQL 합본이 실제로 바뀌었는지 잡는 시험이 줄바꿈 때문에 거짓으로 실패하지 않게 하되, 실제 변경은 계속 잡는다.)

/** CRLF를 LF로 — 그 밖의 글자(낱개 CR 포함)는 그대로 */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/** 바이트에서 CRLF(0x0D 0x0A)만 LF(0x0A)로 — 해시 비교용. 낱개 CR · 그 밖의 바이트는 그대로 */
export function canonicalBytes(bytes: Buffer): Buffer {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) continue; // CRLF의 CR은 건너뛰고 LF만 남긴다
    out.push(bytes[i]!);
  }
  return Buffer.from(out);
}

/** 줄바꿈(CRLF ↔ LF)이 달라도 같은 값이 나오는 sha256 — 보존 원본의 "바뀌지 않았다"를 확인할 때 쓴다 */
export function canonicalSha256(bytes: Buffer): string {
  return createHash("sha256").update(canonicalBytes(bytes)).digest("hex");
}

/** 소스 파일을 읽어 줄바꿈을 LF로 맞춘 글을 돌려준다 */
export function readSource(url: URL | string): string {
  return normalizeEol(readFileSync(url, "utf8"));
}
