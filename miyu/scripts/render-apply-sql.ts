// supabase/migrations의 4~10번을 SQL Editor에서 한 번에 실행하는 통합 파일(supabase/apply-4-to-10.sql)로 묶는다.
// 마이그레이션 내용은 그대로이고, 시작 조건 확인 · 트랜잭션 · 마지막 확인 조회만 더한다 (lib/ops/apply-sql.ts).
// 실행: node scripts/render-apply-sql.ts            → supabase/apply-4-to-10.sql
//       node scripts/render-apply-sql.ts --staging  → supabase/apply-staging-all.sql (아무것도 없는 새 스테이징 프로젝트 전용 · 1번부터 전체 · 운영 DB에는 쓰지 않는다)
// (miyu 폴더에서)
import { readFileSync as readRaw, readdirSync, writeFileSync } from "node:fs";
import { buildApplySql, buildStagingApplySql } from "../lib/ops/apply-sql.ts";

// Windows에서 git이 줄바꿈을 CRLF로 받아 와도 합본은 항상 LF로 만든다 — CRLF만 LF로 바꾸고 그 밖의 글자는 그대로(합본이 마이그레이션과 같은지 시험이 확인한다)
const readFileSync = (url: URL, encoding: "utf8") => readRaw(url, encoding).replace(/\r\n/g, "\n");

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const FIRST = 4;
const LAST = 10; // 11번부터는 이 통합 파일에 넣지 않는다 (4~10번은 이미 적용이 끝난 묶음이고, 11번 이후는 파일 하나씩 따로 적용한다)
const migrations = files.slice(FIRST - 1, LAST).map((name) => ({ name, sql: readFileSync(new URL(name, dir), "utf8") }));
const checkSql = readFileSync(new URL("../supabase/check-migrations.sql", import.meta.url), "utf8");
const out = buildApplySql({ migrations, checkSql, firstNo: FIRST });
writeFileSync(new URL("../supabase/apply-4-to-10.sql", import.meta.url), out);
console.log(`supabase/apply-4-to-10.sql: ${migrations.length}개 파일(${migrations[0].name} ~ ${migrations[migrations.length - 1].name}) ${out.length.toLocaleString("ko-KR")}자`);

// 스테이징(비어 있는 새 프로젝트) 전용 — 1번부터 전체
if (process.argv.includes("--staging")) {
  const all = files.map((name) => ({ name, sql: readFileSync(new URL(name, dir), "utf8") }));
  const staging = buildStagingApplySql({ migrations: all, checkSql });
  writeFileSync(new URL("../supabase/apply-staging-all.sql", import.meta.url), staging);
  console.log(`supabase/apply-staging-all.sql: ${all.length}개 파일(${all[0].name} ~ ${all[all.length - 1].name}) ${staging.length.toLocaleString("ko-KR")}자`);
}
