// supabase/migrations의 4~10번을 SQL Editor에서 한 번에 실행하는 통합 파일(supabase/apply-4-to-10.sql)로 묶는다.
// 마이그레이션 내용은 그대로이고, 시작 조건 확인 · 트랜잭션 · 마지막 확인 조회만 더한다 (lib/ops/apply-sql.ts).
// 실행: node scripts/render-apply-sql.ts   (miyu 폴더에서)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { buildApplySql } from "../lib/ops/apply-sql.ts";

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const FIRST = 4;
const migrations = files.slice(FIRST - 1).map((name) => ({ name, sql: readFileSync(new URL(name, dir), "utf8") }));
const checkSql = readFileSync(new URL("../supabase/check-migrations.sql", import.meta.url), "utf8");
const out = buildApplySql({ migrations, checkSql, firstNo: FIRST });
writeFileSync(new URL("../supabase/apply-4-to-10.sql", import.meta.url), out);
console.log(`supabase/apply-4-to-10.sql: ${migrations.length}개 파일(${migrations[0].name} ~ ${migrations[migrations.length - 1].name}) ${out.length.toLocaleString("ko-KR")}자`);
