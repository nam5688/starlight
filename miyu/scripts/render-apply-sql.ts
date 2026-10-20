// supabase/migrations의 4~10번을 SQL Editor에서 한 번에 실행하는 통합 파일(supabase/apply-4-to-10.sql)로 묶는다.
// 마이그레이션 내용은 그대로이고, 시작 조건 확인 · 트랜잭션 · 마지막 확인 조회만 더한다 (lib/ops/apply-sql.ts).
// 실행: node scripts/render-apply-sql.ts            → supabase/apply-4-to-10.sql
//       node scripts/render-apply-sql.ts --reviews  → supabase/apply-25-reviews.sql (DB 변경 25번 후기만 · 19~22번이 없는 테스트 DB에도 쓸 수 있다)
//       node scripts/render-apply-sql.ts --staging  → supabase/apply-staging-all.sql (아무것도 없는 새 스테이징 프로젝트 전용 · 1번부터 전체 · 운영 DB에는 쓰지 않는다)
//       node scripts/render-apply-sql.ts --29-30    → supabase/apply-29-30.sql (DB 변경 29번 기록 삭제 범위 확대 + 30번 쌍 × 삭제 동시성 장치를 하나의 트랜잭션으로 · 테스트 전용 프로젝트용)
// (miyu 폴더에서)
import { readFileSync as readRaw, readdirSync, writeFileSync } from "node:fs";
import { buildApplySql, buildReviewsApplySql, buildScope2930ApplySql, buildStagingApplySql } from "../lib/ops/apply-sql.ts";

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

// DB 변경 25번(후기)만 — 시작 조건 · 끝 확인 · 트랜잭션을 더한 단독 적용 파일
if (process.argv.includes("--reviews")) {
  const name = files.find((f) => f.includes("_reviews.sql"))!;
  const migration = { name, sql: readFileSync(new URL(name, dir), "utf8") };
  const postSql = readFileSync(new URL("../supabase/review-25-postcheck.sql", import.meta.url), "utf8");
  const out25 = buildReviewsApplySql({ migration, postSql });
  writeFileSync(new URL("../supabase/apply-25-reviews.sql", import.meta.url), out25);
  console.log(`supabase/apply-25-reviews.sql: ${name} ${out25.length.toLocaleString("ko-KR")}자`);
}

// DB 변경 29번 + 30번을 한 트랜잭션으로 — 시작 조건 · 끝 확인(구조 · 행 · 권한 · 트리거 · 함수)이 어긋나면 전체 취소
if (process.argv.includes("--29-30")) {
  const n29 = files.find((f) => f.endsWith("_record_delete_scope.sql"))!;
  const n30 = files.find((f) => f.endsWith("_pair_assessment_guard.sql"))!;
  const m29 = { name: n29, sql: readFileSync(new URL(n29, dir), "utf8") };
  const m30 = { name: n30, sql: readFileSync(new URL(n30, dir), "utf8") };
  const out2930 = buildScope2930ApplySql({ migrations: [m29, m30], checkSql });
  writeFileSync(new URL("../supabase/apply-29-30.sql", import.meta.url), out2930);
  console.log(`supabase/apply-29-30.sql: ${n29} + ${n30} ${out2930.length.toLocaleString("ko-KR")}자`);
}
