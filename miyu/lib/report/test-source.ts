// 시험이 소스 파일을 글로 읽어 연결을 점검할 때 쓰는 도구 — 글자는 바꾸지 않고 줄바꿈만 LF로 맞춘다.
// Windows에서 git 설정(core.autocrlf=true)으로 작업 폴더의 소스가 CRLF가 되면 "줄바꿈이 든 문자열"을 찾는 점검이 어긋나기 때문이다(2026-10-19, 운영자 Windows 확인).
// 연결 점검 자체를 지우거나 git 전역 설정을 바꾸지 않고, 읽는 단계에서만 정규화한다.
import { readFileSync } from "node:fs";

/** CRLF · 낱개 CR을 LF로 — 그 밖의 글자는 그대로 */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** 소스 파일을 읽어 줄바꿈을 LF로 맞춘 글을 돌려준다 */
export function readSource(url: URL | string): string {
  return normalizeEol(readFileSync(url, "utf8"));
}
