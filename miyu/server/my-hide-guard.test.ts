// MY 리포트 숨기기의 안전선을 소스에서 확인한다 (비용 0): 서버 액션은 로그인 회원 번호로만 일하고,
// 마이그레이션 27번은 열 하나 + 서버 전용 함수 하나만 더하며 접근 정책(RLS) · 기존 권한을 넓히지 않고, 숨기기 · 복원 버튼은 모바일에서 누르기 쉬운 크기와 이름을 갖는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** SQL 주석(-- 한 줄)을 뺀 문장만 */
const sqlStatements = (sql: string) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("서버 액션: 로그인 회원 번호로만 바꾸고, 화면이 보낸 회원 번호는 받지 않는다", () => {
  const src = read("app/my/actions.ts");
  assert.match(src, /export async function hideReportAction\(assessmentId: string\)/);
  assert.match(src, /export async function restoreReportAction\(assessmentId: string\)/);
  // 회원은 서버가 세션으로 확인한다 — 없거나 동의 전이면 아무것도 하지 않고 MY로 돌려보낸다
  const body = src.slice(src.indexOf("async function changeReportVisibility"));
  assert.ok(body.indexOf("getMember()") < body.indexOf("setReportHidden("), "회원 확인이 바꾸기보다 먼저");
  assert.match(body, /if \(!member \|\| member\.needsConsent\) redirect\("\/my"\)/);
  assert.match(body, /userId: member\.userId/);
  assert.doesNotMatch(body, /userId: (assessmentId|input|formData)/);
  // 쓰기는 서버 비밀키 저장소로, 소유자 확인은 서비스가 한다 (읽기 저장소로 쓰지 않는다)
  assert.match(body, /writeRepository\(\)/);
  assert.doesNotMatch(src, /readRepository/);
});

test("마이그레이션 27번: 열 하나 + 서버 전용 함수 하나만 더하고 접근 정책 · 기존 권한을 넓히지 않는다", () => {
  const raw = read("supabase/migrations/20261106000000_my_report_hide.sql");
  const sql = sqlStatements(raw);
  // 더하기만: 지우기 · 비우기 · 기존 정책 변경 · 쓰기 권한 부여가 없다
  for (const forbidden of [/\bdrop\b/i, /\bdelete\b/i, /\btruncate\b/i, /create policy/i, /alter policy/i, /drop policy/i, /disable row level security/i, /grant\s+(insert|update|delete|all)\b/i, /to (anon|authenticated)\b/i]) {
    assert.doesNotMatch(sql, forbidden, String(forbidden));
  }
  assert.match(sql, /add column my_hidden_at timestamptz/);
  // 바꾸는 표 · 열은 assessments.my_hidden_at 하나뿐이다 (주문 · 리포트 · 결제 · 질문권 · 채팅 · 동의는 건드리지 않는다)
  const updates = [...sql.matchAll(/update\s+public\.(\w+)\s+set\s+([\w, =()]+?)\s+where/gi)];
  assert.ok(updates.length >= 2);
  for (const u of updates) {
    assert.equal(u[1], "assessments");
    assert.match(u[2], /^my_hidden_at\s*=\s*(now\(\)|null)$/);
  }
  for (const other of ["orders", "reports", "payment_events", "cash_wallets", "cash_ledger", "question_packs", "talk_rooms", "chat_questions", "taste_reports", "user_consents", "profiles"]) {
    assert.doesNotMatch(sql, new RegExp(`(update|insert into|delete from)\\s+public\\.${other}\\b`, "i"), other);
  }
  // 탈퇴 표시(withdrawn_at)는 조건으로 읽기만 한다 — 위 검사가 바꾸는 열을 my_hidden_at 하나로 묶으므로 숨기기가 탈퇴 상태를 만들지 않는다
  assert.match(sql, /withdrawn_at is null/);
  // 함수: 정의자 권한 + 빈 검색 경로 + 본인 확인(user_id 짝) + 서버만 실행
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /user_id = p_user_id/);
  assert.match(sql, /revoke all on function public\.set_assessment_my_hidden\(uuid, uuid, boolean\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.set_assessment_my_hidden\(uuid, uuid, boolean\) to service_role/);
});

test("숨기기 · 복원 버튼: 모바일에서 누르기 쉬운 높이(44px)와 이름을 갖고, 서버 액션 형식으로 보낸다", () => {
  const src = read("components/my/report-rows.tsx");
  // 숨기기 버튼
  const hide = src.slice(src.indexOf("hideReportAction.bind"), src.indexOf("목록에서 숨기기\n"));
  assert.match(hide, /min-h-11/);
  assert.match(hide, /aria-label=/);
  assert.match(hide, /type="submit"/);
  // 복원 버튼 · 숨긴 리포트 펼침 줄
  const restore = src.slice(src.indexOf("restoreReportAction.bind"), src.indexOf("목록에 다시 보이기\n"));
  assert.match(src, /const touch = "[^"]*min-h-11/, "복원 버튼 · 열기 링크가 쓰는 크기");
  assert.match(restore, /\$\{touch\}/);
  assert.match(restore, /aria-label=/);
  assert.match(restore, /type="submit"/);
  assert.match(src, /<summary className="[^"]*min-h-11/, "펼침 머리글도 44px 이상");
  // 삭제로 오해하지 않게: 화면 문구에 삭제 · 탈퇴가 아니라는 뜻과 그대로 남는 것을 밝힌다
  assert.match(src, /삭제나 탈퇴가 아니라서/);
  assert.match(src, /결과 · 대화 · 구매 기록 · 질문권은 그대로/);
});
