// 소스 읽기 도구: 줄바꿈만 LF로 맞추고 글자는 바꾸지 않는다 (Windows core.autocrlf=true 회귀, 2026-10-19)
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { canonicalBytes, canonicalSha256, normalizeEol, readSource } from "./test-source.ts";

test("normalizeEol: CRLF만 LF로 — 낱개 CR · 그 밖의 글자(한글 · 따옴표 · 공백)는 그대로", () => {
  assert.equal(normalizeEol("가\r\n나\r다\n라"), "가\n나\r다\n라");
  assert.notEqual(normalizeEol("가\r나"), normalizeEol("가\n나"), "낱개 CR은 줄바꿈 차이로 눈감아 주지 않는다");
  assert.equal(normalizeEol("  “따옴표”  (괄호) 2024.08  \n"), "  “따옴표”  (괄호) 2024.08  \n");
  assert.equal(normalizeEol(""), "");
});

test("readSource: 실제 파일이 CRLF여도 LF 글을 돌려주고, LF 파일은 그대로다", () => {
  const dir = mkdtempSync(join(tmpdir(), "miyu-eol-"));
  try {
    const crlf = join(dir, "crlf.ts");
    const lf = join(dir, "lf.ts");
    writeFileSync(crlf, "a\r\n    typeTitle,\r\n  });\r\n");
    writeFileSync(lf, "a\n    typeTitle,\n  });\n");
    assert.equal(readSource(crlf), "a\n    typeTitle,\n  });\n");
    assert.equal(readSource(lf), readSource(crlf));
    assert.ok(readSource(crlf).includes("    typeTitle,\n  });"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("canonicalSha256: CRLF ↔ LF 차이만 눈감고, 글자 하나가 바뀌면 다른 값이다 (보존 원본이 실제로 바뀌면 계속 실패한다)", () => {
  const lf = Buffer.from("첫 줄입니다.\n둘째 줄 “따옴표”.\n셋째 줄.\n", "utf8");
  const crlf = Buffer.from("첫 줄입니다.\r\n둘째 줄 “따옴표”.\r\n셋째 줄.\r\n", "utf8");
  assert.equal(canonicalSha256(crlf), canonicalSha256(lf), "CRLF와 LF는 같은 값");
  assert.deepEqual(canonicalBytes(crlf), lf);
  // 실제 변경은 잡힌다: 글자 하나 · 공백 하나 · 줄 하나 · 낱개 CR
  const changed = [
    Buffer.from("첫 줄입니다.\n둘째 줄 “따옴표”!\n셋째 줄.\n", "utf8"),
    Buffer.from("첫 줄입니다.\n둘째 줄  “따옴표”.\n셋째 줄.\n", "utf8"),
    Buffer.from("첫 줄입니다.\n둘째 줄 “따옴표”.\n셋째 줄.\n\n", "utf8"),
    Buffer.from("첫 줄입니다.\r둘째 줄 “따옴표”.\n셋째 줄.\n", "utf8"),
    Buffer.from("첫 줄입니다.\n둘째 줄 \"따옴표\".\n셋째 줄.\n", "utf8"),
  ];
  for (const [i, c] of changed.entries()) assert.notEqual(canonicalSha256(c), canonicalSha256(lf), `변경 ${i + 1}은 달라야 한다`);
  // CRLF로 받은 파일에서도 같은 변경은 똑같이 잡힌다
  assert.notEqual(canonicalSha256(Buffer.from("첫 줄입니다.\r\n둘째 줄 “따옴표”!\r\n셋째 줄.\r\n", "utf8")), canonicalSha256(lf));
});
