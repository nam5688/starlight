// MY 리포트 "기록 삭제"의 안전선을 소스에서 확인한다 (비용 0): 서버 액션은 로그인 회원 번호로만 일하고, 지우는 버튼은 확인창을 거치며,
// 마이그레이션 28번은 지워도 되는 표만 건드리고 접근 정책 · 기존 권한을 넓히지 않으며 새 함수는 서버만 부를 수 있고,
// 삭제한 기록에서는 결과 · 구매 화면이 먼저 막히고, 읽기용 대화 기록을 만드는 코드는 AI를 부르지 않는다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** SQL 주석(-- 한 줄)을 뺀 문장만 */
const sqlStatements = (sql: string) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

test("서버 액션: 로그인 회원 번호로만 지우고, 화면이 보낸 회원 번호는 받지 않으며, 쓰기는 서버 저장소로 한다", () => {
  const src = read("app/my/actions.ts");
  assert.match(src, /^"use server";/);
  assert.match(src, /export async function deleteReportRecordAction\(assessmentId: string\)/);
  const body = src.slice(src.indexOf("export async function deleteReportRecordAction"));
  assert.ok(body.indexOf("getMember()") < body.indexOf("deleteReportRecord("), "회원 확인이 지우기보다 먼저");
  assert.match(body, /if \(!member \|\| member\.needsConsent\) redirect\("\/my"\)/);
  assert.match(body, /userId: member\.userId/);
  assert.doesNotMatch(body, /userId: (assessmentId|input|formData)/);
  assert.match(body, /typeof assessmentId === "string"/, "번호 모양을 먼저 확인");
  assert.match(body, /writeRepository\(\)/);
  assert.doesNotMatch(src, /readRepository/);
  // 읽기용 대화 기록은 서버가 저장된 리포트로 직접 그린다 — 화면이 보낸 글을 믿지 않는다
  assert.match(body, /transcriptRenderer\(\{ userId: member\.userId, assessmentId \}\)/);
});

test("숨기기 흔적: 고객 화면 · 서비스 코드에 숨기기 · 복원 동작이 남아 있지 않다 (27번 파일 · 열은 쓰지 않고 그대로 둔다)", () => {
  const files = [...walk("app"), ...walk("components"), ...walk("lib"), ...walk("server")].filter((f) => !f.endsWith("record-delete-guard.test.ts"));
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /hideReportAction|restoreReportAction|setReportHidden|setAssessmentMyHidden|listHiddenAssessmentIds|my_hidden_at|myHiddenAt|hiddenCards|hideAvailable|HiddenReports/, f);
  }
});

test("지우는 버튼은 확인창 안의 '삭제하기'로만 서버 액션을 부른다 (카드에 바로 지우는 버튼이 없다)", () => {
  const users = walk("app").concat(walk("components")).filter((f) => read(f).includes("deleteReportRecordAction"));
  assert.deepEqual(users.sort(), ["app/my/actions.ts", "components/my/delete-record-button.tsx"]);
  const src = read("components/my/delete-record-button.tsx");
  // 확인창(<dialog>)을 열어야 지울 수 있다: 서버 액션은 dialog 안의 form에만 있다
  const dialog = src.slice(src.indexOf("<dialog"), src.indexOf("</dialog>"));
  assert.match(dialog, /deleteReportRecordAction\.bind\(null, assessmentId\)/);
  assert.match(dialog, /aria-labelledby=\{titleId\}/);
  const opener = src.slice(src.indexOf("data-testid=\"delete-record-open\"") - 400, src.indexOf("data-testid=\"delete-record-open\""));
  assert.match(opener, /type="button"/, "열기 버튼은 보내지 않는다");
  assert.match(opener, /showModal\(\)/);
  assert.match(opener, /min-h-11/);
  // 어느 카드인지 확인창 맨 위에 다시 보인다: 리포트명 · 표시 이름(분석 대상) · 생성일 (영구 삭제라 다른 카드와 착각하지 않게)
  const target = dialog.slice(dialog.indexOf('data-testid="delete-record-target"'), dialog.indexOf("<div id={bodyId}>"));
  assert.ok(dialog.indexOf('data-testid="delete-record-target"') < dialog.indexOf("<div id={bodyId}>"), "대상 표시가 안내 문구보다 위");
  for (const part of ["{productName}", "{subject}", "{created}", "DELETE_RECORD_COPY.targetTitle", "DELETE_RECORD_COPY.createdPrefix"]) assert.ok(target.includes(part), `확인창 대상 표시에 ${part}`);
  assert.match(dialog, /aria-describedby=\{`\$\{targetId\} \$\{bodyId\}`\}/, "보조기기도 대상을 먼저 읽는다");
  const rows = read("components/my/report-rows.tsx");
  assert.match(rows, /<DeleteRecordButton assessmentId=\{card\.assessmentId\} productName=\{card\.productName\} subject=\{card\.subject\} created=\{formatDate\(card\.createdAt\)\} \/>/, "카드가 보여 주는 값 그대로 넘긴다");
  // 취소 · 삭제하기: 같은 크기(48px) · 보내는 중에는 둘 다 잠긴다(두 번 눌러도 한 번)
  assert.match(src, /useFormStatus/);
  const buttons = src.slice(src.indexOf("function Buttons"), src.indexOf("export function DeleteRecordButton"));
  assert.equal((buttons.match(/disabled=\{pending\}/g) ?? []).length, 2);
  assert.equal((buttons.match(/min-h-12/g) ?? []).length, 2);
  assert.match(buttons, /type="button"[\s\S]*onClick=\{onCancel\}/);
  assert.match(buttons, /type="submit"/);
  // 바깥 누르기는 닫기만 한다(지우지 않는다)
  assert.match(dialog, /e\.target === e\.currentTarget\) close\(\)/);
});

test("확인창 문구: 무엇이 지워지고(복구 불가) 무엇이 남는지, 다시 만들지도 구매 유도도 하지 않는다는 것을 사실대로 적는다", () => {
  const src = read("components/my/delete-record-button.tsx");
  for (const phrase of [
    "삭제하면 되돌릴 수 없어요",
    "리포트 본문",
    "맛보기 리포트 글",
    "고민 반영 리포트와 적어 둔 고민",
    "지운 글은 복구할 수 없어요",
    "그대로 남는 것",
    "채팅방과 지난 대화",
    "남은 질문권",
    "주문 · 결제 · 환불 기록과 계정 · 동의 정보",
    "다시 만들어 주거나 다시 구매하게 하지 않아요",
    "맛보기 리포트는 계정당 한 번이라 삭제해도 다시 받을 수 없어요",
  ]) {
    assert.ok(src.includes(phrase), `확인창 문구에 있어야 한다: ${phrase}`);
  }
  // 거짓 안내 금지: 아직 하지 못하는 일을 한다고 쓰지 않는다
  assert.doesNotMatch(src, /완전히 삭제|모든 정보가 삭제|전부 삭제|복구할 수 있/);
});

test("마이그레이션 28번: 지워도 되는 표만 지우고, 접근 정책 · 기존 권한을 넓히지 않으며, 새 함수는 서버만 부른다", () => {
  const raw = read("supabase/migrations/20261107000000_record_delete.sql");
  const sql = sqlStatements(raw);
  // 파괴적 문장 금지: 표 · 열 · 함수 · 정책을 없애지 않는다 (27번의 숨김 열도 쓰지 않는다)
  for (const forbidden of [/\bdrop\b/i, /\btruncate\b/i, /alter policy/i, /disable row level security/i, /alter table[^;]*\b(drop|rename)\b/i, /my_hidden_at/i, /grant\s+(update|delete|all)\b/i, /to (anon|authenticated)\b[^;]*\b(insert|update|delete)\b/i]) {
    assert.doesNotMatch(sql, forbidden, String(forbidden));
  }
  // 정책은 읽기용 대화 기록의 본인 조회 하나뿐이다
  assert.deepEqual([...sql.matchAll(/create policy "([^"]+)" on public\.(\w+)/gi)].map((m) => [m[2], m[1]]), [["talk_transcripts", "본인 읽기용 대화 기록 조회"]]);
  assert.match(sql, /for select to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.match(sql, /revoke all on public\.talk_transcripts from public, anon, authenticated, service_role;\s*grant select on public\.talk_transcripts to authenticated;\s*grant select, insert on public\.talk_transcripts to service_role;/);
  // 지우는 표는 정해져 있다 (주문 · 결제 · 환불 · 질문권 · 채팅 질문 횟수 · 채팅 요약 · 동의 · 프로필 · 궁합 리포트 요청은 지우지 않는다)
  const deletes = [...sql.matchAll(/delete\s+from\s+public\.(\w+)/gi)].map((m) => m[1]);
  assert.deepEqual([...new Set(deletes)].sort(), ["concern_records", "personal_contexts", "reports", "talk_rooms", "talk_transcripts", "taste_reports"]);
  assert.match(sql, /delete from public\.reports r\s+using public\.orders o[\s\S]*?\(o\.product_id = 'personal-integrated-report' or o\.product_id like 'personal-integrated-report:r%' or o\.product_id like 'concern-report:%'\);/, "리포트는 개인 · 고민 상품만");
  assert.doesNotMatch(sql.slice(sql.indexOf("delete from public.reports")), /delete from public\.reports[\s\S]{0,400}(saju-compat|report-compat)[\s\S]{0,40}\)\s*;/, "궁합 리포트는 지우지 않는다");
  // 고치는 표는 둘뿐: 맛보기 글 비우기 + 삭제 표시
  const updates = [...sql.matchAll(/update\s+public\.(\w+)\s+set/gi)].map((m) => m[1]);
  assert.deepEqual([...new Set(updates)].sort(), ["assessments", "taste_reports"]);
  assert.match(sql, /update public\.assessments set record_deleted_at = now\(\) where id = p_assessment_id;/);
  assert.match(sql, /set content = '\{"deleted": true\}'::jsonb,\s*generator = null,\s*generator_version = null,\s*reserved_until = null/);
  for (const other of ["orders", "payment_events", "cash_wallets", "cash_ledger", "question_packs", "chat_questions", "chat_summaries", "user_consents", "profiles", "ai_usage", "compat_requests"]) {
    assert.doesNotMatch(sql, new RegExp(`(update|insert into|delete from)\\s+public\\.${other}\\b`, "i"), other);
  }
  // 넣는 곳은 읽기용 대화 기록뿐이다
  assert.deepEqual([...new Set([...sql.matchAll(/insert\s+into\s+public\.(\w+)/gi)].map((m) => m[1]))], ["talk_transcripts"]);
  // 모든 정의자 권한 함수는 빈 검색 경로 + 직접 실행 권한 정리, 삭제 함수는 서버(service_role)만
  const fns = [...sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)([\s\S]*?)\$\$;/g)];
  assert.deepEqual(fns.map((m) => m[1]).sort(), ["block_write_on_deleted_record", "delete_assessment_record", "orders_block_deleted_record", "talk_transcripts_on_withdraw", "talk_transcripts_owner_check"]);
  for (const [, name, args, rest] of fns) {
    assert.match(rest, /set search_path = ''/, `${name}: 빈 검색 경로`);
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(${args.replace(/p_\w+ /g, "").replace(/[()]/g, "\\$&")}\\) from public, anon, authenticated;`), `${name}: 직접 실행 권한 정리`);
  }
  assert.match(sql, /grant execute on function public\.delete_assessment_record\(uuid, uuid, jsonb\) to service_role;/);
  assert.equal((sql.match(/grant execute/gi) ?? []).length, 1, "실행 권한을 주는 곳은 삭제 함수 하나뿐");
  // 삭제 함수: 본인 짝 확인(user_id) + 행 잠금 + 탈퇴한 결과 제외, 진행 중이면 busy, 바뀌었으면 stale
  assert.match(sql, /where id = p_assessment_id and user_id = p_user_id and withdrawn_at is null\s+for update/);
  for (const word of ["'busy'", "'stale'", "'unchanged'", "'not_found'", "'deleted'"]) assert.ok(sql.includes(`return ${word};`), word);
  // 삭제한 기록을 막는 트리거는 리포트(입력) · 주문(입력) · 맛보기(입력 · 수정)이고, 질문 결제 주문은 통과시킨다
  assert.match(sql, /create trigger reports_block_deleted_record before insert on public\.reports/);
  assert.match(sql, /create trigger taste_reports_block_deleted_record before insert or update on public\.taste_reports/);
  assert.match(sql, /create trigger orders_block_deleted_record before insert on public\.orders/);
  assert.match(sql, /if new\.product_id like 'cash-charge:%' then\s+return new;/);
  // 이 파일을 실행하는 것만으로 지워지는 데이터는 없다: 함수 밖(최상위)에서 delete/update를 하지 않는다
  const outside = sql.replace(/create or replace function[\s\S]*?\$\$;/g, "");
  assert.doesNotMatch(outside, /\b(delete\s+from|update\s+public)/i);
});

test("삭제한 기록: 결과 화면은 리포트 · 미리보기 · 구매 안내보다 먼저 삭제 안내로 끝나고, 채팅방은 리포트 링크 없이 읽기용 대화를 보인다", () => {
  const page = read("app/results/[id]/page.tsx");
  const at = page.indexOf("if (view.deleted) return <DeletedRecordNotice");
  assert.ok(at > 0);
  for (const later of ["PurchasePanel", "getInviteView(", "RepurchasePanel", "ReadingReportView", "FreePreviewBody"]) {
    assert.ok(page.indexOf(later, at) > at, `${later}보다 먼저 막는다`);
  }
  const notice = read("components/results/deleted-record.tsx");
  // 구매 · 다시 만들기 링크나 동작이 없다(문장으로 "다시 구매하지 않아요"라고 알리는 것은 있다)
  assert.doesNotMatch(notice, /#r-purchase|\/checkout|buyHref|startCheckout|retry|구매하기|결제하기/);
  assert.deepEqual([...notice.matchAll(/href="([^"]+)"|href=\{([^}]+)\}/g)].map((m) => m[1] ?? m[2]).sort(), ["/analyze", "/my", 'talkRoomPath(assessmentId, "main")']);
  // 채팅방(삭제한 기록): 이어 갈 수 없는 방은 읽기 전용 + 이유, 구매 안내는 하지 않는다
  const room = read("app/results/[id]/talk/talk-room-content.tsx");
  assert.match(room, /if \(view\.deleted\) return <DeletedRecordRoom/);
  const archivedRoom = read("components/talk/archived-room.tsx");
  assert.doesNotMatch(archivedRoom, /buyHref|구매하기|#r-purchase|9,900/);
  const model = read("server/talk-model.ts");
  assert.match(model, /view\.deleted \? \{ \.\.\.model, buy: null, topics: model\.topics\.map\(withoutLock\)/);
  // TalkView: 삭제한 기록에서는 리포트 · 분석 자료 링크를 보이지 않고 MY로만 돌아간다
  const talk = read("components/talk/talk-view.tsx");
  assert.match(talk, /const archived = persist\?\.epoch != null/);
  assert.match(talk, /archived \? "MY로 돌아가기" : "전체 리포트로 돌아가기"/);
  assert.match(talk, /replies\.report && !archived/);
  assert.match(talk, /dataHref=\{archived \? null : dataHref\}/);
  // 저장은 표지(epoch)를 돌려보낸다 — 삭제 전에 열린 화면이 옛 대화를 되돌려 쓰지 못한다
  assert.equal((talk.match(/epoch: persist\.epoch \?\? null/g) ?? []).length, 2);
});

test("읽기용 대화 기록을 만드는 코드는 AI · 결제를 부르지 않고 저장된 글 · 코드 계산 문구만 쓴다", () => {
  for (const f of ["server/talk-transcript.ts", "lib/report/reading/talk-transcript.ts"]) {
    const src = read(f);
    assert.doesNotMatch(src, /integrations\/ai|providers|anthropic|openai|generateReport|askMiyu|chat-service|guardedAnthropicModel|fetch\(/i, f);
    assert.doesNotMatch(src, /order-service|confirmPayment|startCheckout/, f);
  }
  const channel = read("lib/report/reading/talk-transcript.ts");
  assert.doesNotMatch(channel, /from "react"|from "next|window\.|document\./, "채널 독립 코드");
  // 서버 렌더러는 삭제 서비스가 부르고, 이미 삭제된 기록은 그리지 않는다
  const server = read("server/talk-transcript.ts");
  assert.match(server, /^import "server-only";/);
  assert.match(server, /if \(!view \|\| view\.deleted\) throw/);
  assert.match(server, /replayRoom\(model, roomId, actions\)/);
});

test("삭제 시험 파일이 있고 DB 시험 목록에 들어 있다", () => {
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  assert.match(pkg.scripts["test:db"], /supabase\/tests\/record-delete\.db\.test\.ts/);
  assert.doesNotMatch(pkg.scripts["test:db"], /my-hide/);
});
