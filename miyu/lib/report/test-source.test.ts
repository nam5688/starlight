// 소스 읽기 도구: 줄바꿈만 LF로 맞추고 글자는 바꾸지 않는다 (Windows core.autocrlf=true 회귀, 2026-10-19)
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { normalizeEol, readSource } from "./test-source.ts";

test("normalizeEol: CRLF · 낱개 CR을 LF로, 그 밖의 글자(한글 · 따옴표 · 공백)는 그대로", () => {
  assert.equal(normalizeEol("가\r\n나\r다\n라"), "가\n나\n다\n라");
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
