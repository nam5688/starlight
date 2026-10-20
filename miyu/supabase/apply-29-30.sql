-- ME:U(미유) DB 변경 29번 + 30번 단독 적용 파일 — SQL Editor에서 한 번 실행한다 (하나의 트랜잭션)
--
-- 이 파일은 supabase/migrations/20261108000000_record_delete_scope.sql (29번)과 supabase/migrations/20261109000000_pair_assessment_guard.sql (30번)을 한 글자도 고치지 않고 이어 붙인 것이다.
-- (scripts/render-apply-sql.ts --29-30 이 만든다 — 직접 고치지 않는다. 내용이 바뀌면 서버 테스트가 알려 준다.)
--
-- ⚠️ 테스트 전용 프로젝트(wdvrwwajakjdfrajgxcm)에 적용하기 위한 파일이다. 운영 DB에는 운영자가 따로 승인하기 전에는 실행하지 않는다.
--
-- 왜 하나로 묶었나: 29번만 먼저 적용한 상태에서는 "리포트 궁합 쌍이 만들어지는 순간과 기록 삭제가 겹치면 원자료가 빈 분석을 쌍이 가리킬 수 있는" 틈이 있다(docs/pair-assessment-guard-v1.md).
--   두 번호를 틈 없이 같은 순간에 적용해 그 틈이 열린 채로 남지 않게 한다. 두 번호를 따로 적용해도 되지만(각자의 사전 · 사후 확인 파일이 있다) 이 파일이 권장 방법이다.
--
-- 사용 순서
--  1) (읽기 전용) supabase/delete-scope-29-precheck.sql 과 supabase/pair-assessment-guard-30-precheck.sql 은 이 파일을 쓰기 전의 개별 사전 확인이다.
--     29번 사전 확인은 "종합 OK"여야 하고, 30번 사전 확인은 29번 적용 전에는 "이상(선행 29번 없음)"으로 나오는 것이 정상이다(이 파일이 둘을 함께 적용한다).
--  2) 이 파일을 SQL Editor에 모두 붙여넣고 Run (한 번만).
--  3) 끝에 나오는 결과 표(check-migrations.sql)에서 29 · 30번이 "적용됨"인지 본다. 그 뒤 pair-assessment-guard-30-postcheck.sql로 30번 사후 확인을 해도 된다.
--
-- 안전장치
--  - 시작 조건: 28번(기록 삭제)과 24번(리포트 궁합)이 적용돼 있고, 29 · 30번이 만드는 것이 하나도 없어야 하며, 필요한 역할이 있어야 한다.
--    아니면 아무것도 바꾸지 않고 "시작 조건 불충족"으로 멈춘다(이미 한 번 실행한 뒤 다시 실행해도 여기서 멈춘다 — 문제가 아니다).
--  - 전체가 하나의 트랜잭션이다. 끝 확인이 하나라도 어긋나면 이 파일이 한 일이 모두 취소된다:
--      · 구조: 새로 생긴 것은 열 assessments.record_purged_at · 함수 3개 · 트리거 5개 · pair_join의 새 정의뿐이어야 한다(다른 열 · 제약 · 인덱스 · 정책 · 함수 · 트리거 · 표 권한이 하나라도 달라지면 취소).
--      · 권한: 새 함수 셋은 서버(service_role)만 실행할 수 있고(트리거 함수 둘은 아무도 직접 실행 못 함) 브라우저 역할(anon · authenticated · public)은 실행할 수 없다. pair_join의 권한은 그대로다.
--      · 데이터: 사용자 자료 표(21개 중 있는 것)의 행 수와 행 내용이 적용 전과 같아야 한다. 29 · 30번은 어떤 행도 만들거나 고치거나 지우지 않는다.
--        (적용하는 동안 다른 사용자의 활동이 겹쳐 행이 바뀌면 안전하게 전체 취소되고 "다시 실행"이라고 알린다.)
--  - 고객 기록 삭제 함수(delete_assessment_record_v2)는 이 파일이 호출하지 않는다 — 만들기만 하고, 확인은 카탈로그(존재 · 권한 · 정의)만 읽는다. 어떤 기록도 지우지 않는다.
--  - 락 대기는 15초, 한 문장은 180초에서 멈춘다(오래 기다리며 다른 요청을 막지 않는다). 시간 초과도 전체 취소다.
--
-- Supabase가 "위험한 작업이 포함되어 있다"는 확인 창을 보여 주면: 함수 안의 삭제 문장(29번의 기록 삭제 함수)과 열 추가 때문이다.
--   이 파일은 함수를 만들기만 하고 부르지 않으며 기존 데이터를 지우지 않으므로 실행해도 된다.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '180s';

do $check$
declare
  problems text[] := '{}';
  t text;
begin
  -- 1) 앞 번호가 만드는 것이 있어야 한다
  if to_regclass('auth.users') is null then problems := problems || '표 auth.users(Supabase Auth)'::text; end if;
  if (select count(*) from pg_roles where rolname in ('service_role', 'authenticated', 'anon')) <> 3 then problems := problems || '역할 service_role · authenticated · anon'::text; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'record_deleted_at') then problems := problems || '열 assessments.record_deleted_at(28번)'::text; end if;
  if to_regprocedure('public.delete_assessment_record(uuid,uuid,jsonb)') is null then problems := problems || '함수 delete_assessment_record(28번)'::text; end if;
  if to_regclass('public.talk_transcripts') is null then problems := problems || '표 talk_transcripts(28번)'::text; end if;
  if to_regclass('public.pairs') is null or to_regprocedure('public.pair_join(text,uuid,uuid,text)') is null then problems := problems || '표 pairs · 함수 pair_join(24번 리포트 궁합)'::text; end if;
  foreach t in array array['talk_rooms', 'chat_summaries', 'chat_questions', 'personal_contexts', 'concern_records', 'taste_reports', 'reports', 'orders', 'cash_ledger'] loop
    if to_regclass('public.' || t) is null then problems := problems || ('표 ' || t)::text; end if;
  end loop;
  if cardinality(problems) > 0 then
    raise exception '시작 조건 불충족 — 필요한 것이 없습니다: %. 아무것도 바꾸지 않았습니다. 이 파일을 실행하지 말고 check-migrations.sql 결과를 알려 주세요.', array_to_string(problems, ' / ');
  end if;

  -- 2) 29 · 30번이 만드는 것이 하나라도 이미 있으면 멈춘다(일부만 적용된 상태에서 다시 실행하지 않기 위해)
  problems := '{}';
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'record_purged_at') then problems := problems || '열 assessments.record_purged_at(29번)'::text; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('delete_assessment_record_v2', 'block_write_on_purged_record', 'pairs_block_deleted_record')) then problems := problems || '함수(29 · 30번)'::text; end if;
  if exists (select 1 from pg_trigger where tgname in ('talk_rooms_block_purged', 'chat_summaries_block_purged', 'talk_transcripts_block_purged', 'chat_questions_block_purged', 'pairs_block_deleted_record') and not tgisinternal) then problems := problems || '트리거(29 · 30번)'::text; end if;
  if cardinality(problems) > 0 then
    raise exception '시작 조건 불충족 — 29 · 30번이 만드는 것이 이미 있습니다: %. 아무것도 바꾸지 않았습니다. 이 파일을 다시 실행하지 말고 check-migrations.sql 결과 표를 그대로 알려 주세요.', array_to_string(problems, ' / ');
  end if;
end
$check$;

-- 적용 전 상태를 임시로 저장한다 (이 트랜잭션이 끝나면 사라진다 — 영구 표 · 뷰를 만들지 않는다)
create temp view _a2930_state as
  select 'column'::text as kind, c.table_name::text || '.' || c.column_name::text as key, c.data_type::text || ':' || c.is_nullable::text || ':' || coalesce(c.column_default::text, '') as val
    from information_schema.columns c where c.table_schema = 'public'
  union all
  select 'constraint', conrelid::regclass::text || '.' || conname::text, pg_get_constraintdef(oid) from pg_constraint where connamespace = 'public'::regnamespace
  union all
  select 'index', schemaname::text || '.' || indexname::text, indexdef from pg_indexes where schemaname = 'public'
  union all
  select 'table-acl', c.relname::text, coalesce(c.relacl::text, '-') || ':rls=' || c.relrowsecurity::text from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'S', 'v')
  union all
  select 'policy', tablename::text || '.' || policyname::text, coalesce(cmd::text, '') || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') from pg_policies where schemaname = 'public'
  union all
  select 'function-acl', 'public.' || p.proname::text || '(' || oidvectortypes(p.proargtypes) || ')', coalesce(p.proacl::text, '-') from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all
  select 'function-def', 'public.' || p.proname::text || '(' || oidvectortypes(p.proargtypes) || ')', md5(pg_get_functiondef(p.oid)) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  union all
  select 'trigger', t.tgname::text, c.relname::text || ':' || t.tgenabled::text || ':' || md5(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
  union all
  select 'rows', n.name, (xpath('/row/c/text()', query_to_xml(format('select count(*)::text || '':'' || md5(coalesce(string_agg(md5((to_jsonb(x) - ''record_purged_at'')::text), '''' order by md5((to_jsonb(x) - ''record_purged_at'')::text)), '''')) as c from public.%I x', n.name), false, true, '')))[1]::text
    from unnest(array['profiles', 'assessments', 'orders', 'payment_events', 'reports', 'report_feedback', 'taste_reports', 'talk_rooms', 'chat_summaries', 'talk_transcripts', 'chat_questions', 'cash_ledger', 'cash_wallets', 'question_packs', 'personal_contexts', 'concern_records', 'pairs', 'user_consents', 'compat_requests', 'user_regions', 'reviews']) as n(name) where to_regclass('public.' || n.name) is not null;

create temp table _a2930_before on commit drop as select * from _a2930_state;

-- ═════════════════════════════════════════════════════════════════
-- 29번: 20261108000000_record_delete_scope.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- 리포트 기록 삭제 범위 확대 — 마이그레이션 29번(운영자 요청 2026-10-19). 로컬 시험 DB에서만 적용해 시험했고 외부(테스트 · 운영) DB에는 적용하지 않았다(운영자가 스키마 · 권한 · 데이터 영향을 검토한 뒤 적용).
-- 규칙: 더하기만 한다 — 28번(record_delete) 파일과 그 함수 delete_assessment_record는 한 글자도 바꾸지 않고 그대로 둔다(이미 삭제한 기록은 소급해서 정리하지 않는다).
-- 앞 번호 가운데 28번까지 있으면 적용된다 — 19~22번 · 25번 · 27번 같은 다른 미적용 변경에 기대지 않는다(리포트 궁합 표 pairs는 있을 때만 확인한다).
-- 이 파일을 실행하는 것만으로는 어떤 데이터도 지워지거나 바뀌지 않는다. 데이터는 회원이 MY에서 "기록 삭제"를 직접 확정했을 때, 아래 새 함수가 그 회원의 그 기록에 한해서만 처리한다.
--
-- 28번과 달라지는 점 (화면의 확인창 문구와 같다)
--   28번 함수(예전 범위): 리포트 · 맛보기 · 고민은 지우고 채팅방 대화는 "읽기용 대화 기록"으로 옮겨 남기며 채팅 요약 · 분석 원자료도 남긴다.
--   새 함수(삭제 범위 확대): 위에 더해 이 결과의 채팅방 · 나눈 대화 · 저장한 채팅 요약 · 읽기용 대화 기록도 지운다. 분석 원자료는 대화를 이어 가려고 남기던 것이라, 다른 서비스가 쓰고 있지 않으면 함께 비운다.
--   지운다(복구할 수 없다): 개인 통합 리포트 · 고민 반영 리포트의 본문(만족도 의견 포함) · 맛보기 글 · 고민 입력 · 고민 기록 · 채팅방(talk_rooms의 행동 목록 = 대화 내용) · 저장한 채팅 요약(chat_summaries의 질문 · 답) ·
--                          읽기용 대화 기록(talk_transcripts) · 분석 원자료(assessments의 닉네임 · 생년월일 · 응답 · 계산 결과 — 리포트 궁합 쌍(pairs)이 이 결과를 가리키고 있으면 그 궁합이 쓰는 동안 남긴다)
--   남긴다: 계정 · 가입 동의 · 주문 · 결제 · 환불 기록(결제 증빙) · 질문권(지갑 · 묶음 장부 · cash_ledger — 질문 내용 없이 개수 · 참조번호 · 시각뿐) · 채팅 질문 횟수(chat_questions — 내용 없이 누가 · 언제 · 어느 방만) ·
--           다른 분석 결과 · 사주 궁합 · 리포트 궁합 · AI 사용 기록(토큰 수뿐) · 맛보기 줄(글만 비우고 줄은 남겨 무료 한 번이 다시 생기지 않는다) · 삭제 표시(assessments.record_deleted_at) · 이 파일의 삭제 완료 표시(record_purged_at)
--
-- 내용과 사용 이력의 구분(운영자 요청): 대화 "내용"이 들어 있는 곳은 talk_rooms.actions · chat_summaries.items · talk_transcripts.lines 셋뿐이고 모두 지운다.
--   chat_questions · cash_ledger · question_packs · ai_usage에는 질문 · 답이 없다(열 구성으로 확인) — 개수 · 시각 · 참조번호만 있는 사용 이력이라 그대로 남긴다. 질문권 잔액과 환불 계산이 이 이력에 기대기 때문이다.
--
-- 삭제 뒤에 대화가 되살아나지 않게 하는 장치: 삭제 완료 표시(record_purged_at)가 있는 검사 결과에는 talk_rooms · chat_summaries · talk_transcripts · chat_questions에 새 줄을 넣거나(방은 고치는 것도) 할 수 없다 —
--   삭제 직전에 열려 있던 대화 화면의 늦은 저장 · 늦게 도착한 AI 답 · 직접 호출도 이 장치에 걸린다(앱 코드도 먼저 막지만 DB가 마지막으로 보장한다).
--
-- 코드를 먼저 배포해도 깨지지 않는다: 이 함수가 없으면 앱은 28번의 예전 범위 삭제(예전 확인창 문구)로 동작하고, 이 파일을 적용하면 같은 앱이 새 범위로 동작한다.

alter table public.assessments
  add column record_purged_at timestamptz;

-- 28번의 record_deleted_at(삭제했다)과 다른 열이다. 비어 있으면(null) 예전 범위로 삭제했거나 삭제하지 않은 기록이다 — 기존 행은 모두 null이고 소급해서 바꾸지 않는다.

-- 삭제 완료한 기록에 대화가 생기거나 바뀌지 않게 하는 장치 ------------------------------------------------------------------------------------------------

create or replace function public.block_write_on_purged_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purged timestamptz;
begin
  -- 삭제 함수와 같은 행을 잠그는 읽기(for share) — 삭제가 진행 중이면 끝날 때까지 기다린 뒤 결과를 보고 판단한다
  select a.record_purged_at into v_purged from public.assessments a where a.id = new.assessment_id for share;
  if v_purged is not null then
    raise exception 'record_purged';
  end if;
  return new;
end;
$$;

create trigger talk_rooms_block_purged before insert or update on public.talk_rooms
  for each row execute function public.block_write_on_purged_record();
create trigger chat_summaries_block_purged before insert on public.chat_summaries
  for each row execute function public.block_write_on_purged_record();
create trigger talk_transcripts_block_purged before insert on public.talk_transcripts
  for each row execute function public.block_write_on_purged_record();
create trigger chat_questions_block_purged before insert on public.chat_questions
  for each row execute function public.block_write_on_purged_record();

revoke all on function public.block_write_on_purged_record() from public, anon, authenticated;

-- 본인 검사 결과의 기록을 삭제한다(삭제 범위 확대) ------------------------------------------------------------------------------------------------------
--   반환: 'deleted'(이번에 삭제함) · 'unchanged'(이미 삭제한 기록 — 예전 범위로 삭제한 기록도 소급해서 바꾸지 않는다) ·
--         'busy'(진행 중인 결제 · 생성 · 질문이 있어 지금은 삭제하지 않음) · 'not_found'(없거나 본인 것이 아님 — 둘을 구분해 알리지 않는다. 번호가 비어 있어도 같다 — 앱이 이 함수가 있는지 확인하는 데 쓴다)
--   읽기용 대화 기록으로 옮기는 단계가 없으므로 앱이 대화를 읽어 넘길 인자가 없다(그래서 'stale'도 없다 — 대화방 줄을 잠그고 한 번에 지운다).
--   같은 요청을 여러 번(동시에도) 보내도 한 번만 처리하고 나머지는 'unchanged'다. 한 번에 한 트랜잭션이라 중간까지만 처리된 상태가 남지 않는다.
create or replace function public.delete_assessment_record_v2(p_user_id uuid, p_assessment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assessments%rowtype;
  v_pair_refs boolean := false;
begin
  if p_user_id is null or p_assessment_id is null then
    return 'not_found';
  end if;

  -- 검사 결과 행을 먼저 잠근다 — 같은 순간의 주문 · 리포트 · 대화 저장 · 다른 삭제 요청은 이 줄 뒤로 줄을 선다
  select * into a
    from public.assessments
   where id = p_assessment_id and user_id = p_user_id and withdrawn_at is null
   for update;
  if not found then
    return 'not_found';
  end if;
  if a.record_deleted_at is not null then
    return 'unchanged';
  end if;

  -- 진행 중인 생성 · 결제 · 질문이 있으면 지금은 삭제하지 않는다 (28번 함수와 같은 기준 — 15분 넘게 멈춘 생성은 진행 중으로 보지 않는다)
  if exists (
    select 1 from public.reports r
     where r.assessment_id = p_assessment_id
       and r.status in ('queued', 'generating')
       and r.updated_at > now() - interval '15 minutes'
  ) then
    return 'busy';
  end if;
  if exists (
    select 1 from public.orders o
     where o.assessment_id = p_assessment_id
       and o.status = 'pending'
       and o.created_at > now() - interval '1 hour'
       and o.product_id not like 'cash-charge:%'
  ) then
    return 'busy';
  end if;
  if exists (
    select 1 from public.orders o
     where o.assessment_id = p_assessment_id
       and o.status = 'paid'
       and (o.product_id like 'saju-compat:%' or o.product_id like 'report-compat:%')
       and not exists (select 1 from public.reports r where r.order_id = o.id)
  ) then
    return 'busy';
  end if;
  if exists (
    select 1 from public.taste_reports tr
     where tr.assessment_id = p_assessment_id and tr.user_id = p_user_id and tr.status = 'pending' and tr.reserved_until > now()
  ) then
    return 'busy';
  end if;
  if exists (
    select 1 from public.chat_questions c
     where c.assessment_id = p_assessment_id
       and ((c.state = 'reserved' and c.reserved_until > now()) or c.created_at > now() - interval '30 seconds')
  ) then
    return 'busy';
  end if;
  if exists (
    select 1 from public.cash_ledger l
     where l.user_id = p_user_id and l.kind = 'spend' and l.created_at > now() - interval '30 seconds'
  ) then
    return 'busy';
  end if;

  -- 대화 내용: 채팅방(행동 목록 = 나눈 대화) · 저장한 채팅 요약(질문 · 답) · 읽기용 대화 기록. 방 줄을 잠그고 한 번에 지운다 — 이 결과의 것만(다른 결과 · 다른 회원의 것은 건드리지 않는다)
  perform 1 from public.talk_rooms where assessment_id = p_assessment_id for update;
  delete from public.talk_rooms where assessment_id = p_assessment_id;
  delete from public.chat_summaries where assessment_id = p_assessment_id and user_id = p_user_id;
  delete from public.talk_transcripts where assessment_id = p_assessment_id and user_id = p_user_id;

  -- 리포트 본문(주문은 남는다). 이 검사 결과의 개인 통합 리포트 · 고민 반영 리포트만 — 사주 궁합 · 리포트 궁합은 별개 상품이라 남긴다. 만족도 의견은 함께 지워진다(연쇄 삭제)
  delete from public.reports r
        using public.orders o
  where o.id = r.order_id
    and r.assessment_id = p_assessment_id
    and (o.product_id = 'personal-integrated-report' or o.product_id like 'personal-integrated-report:r%' or o.product_id like 'concern-report:%');

  -- 고민 입력 · 고민 기록(고객이 적은 글)
  delete from public.personal_contexts where assessment_id = p_assessment_id;
  delete from public.concern_records where assessment_id = p_assessment_id;

  -- 맛보기: 작성이 끝나지 않고 멈춘 예약 줄은 받은 적이 없으므로 지우고, 받은 글은 줄을 남긴 채 글만 비운다(무료 한 번이 다시 생기지 않는다)
  delete from public.taste_reports
   where assessment_id = p_assessment_id and user_id = p_user_id and status = 'pending';
  update public.taste_reports
     set content = '{"deleted": true}'::jsonb,
         generator = null,
         generator_version = null,
         reserved_until = null
   where assessment_id = p_assessment_id and user_id = p_user_id and status = 'ready';

  -- 분석 원자료: 채팅이 이어지도록 남기던 것이라 대화를 지운 지금은 쓸 곳이 없다. 다만 리포트 궁합 쌍(pairs)이 이 결과를 가리키고 있으면 그 궁합이 쓰는 동안 남긴다(표가 없는 DB에서는 확인하지 않는다).
  -- 비우는 값은 회원 탈퇴 함수(10번)와 같다 — 날짜 자리는 형식 검사를 맞추기 위한 빈 값(1900-01-01)이다.
  if to_regclass('public.pairs') is not null then
    execute 'select exists (select 1 from public.pairs where a_assessment_id = $1 or b_assessment_id = $1)' into v_pair_refs using p_assessment_id;
  end if;
  if not v_pair_refs then
    update public.assessments
       set nickname = '삭제',
           birth_calendar = 'solar',
           birth_is_leap_month = false,
           birth_year = 1900, birth_month = 1, birth_day = 1,
           birth_time = null,
           known_mbti = null,
           answers = '{}'::jsonb,
           summary = '{}'::jsonb,
           saju = '{}'::jsonb,
           content_version = 'record-deleted'
     where id = p_assessment_id;
  end if;

  -- 삭제 표시 둘(예전 범위 삭제와 구분): 이 순간부터 위의 장치가 이 결과의 대화 · 리포트 · 주문 쓰기를 막는다
  update public.assessments set record_deleted_at = now(), record_purged_at = now() where id = p_assessment_id;
  return 'deleted';
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.delete_assessment_record_v2(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_assessment_record_v2(uuid, uuid) to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 30번: 20261109000000_pair_assessment_guard.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- 리포트 궁합 쌍(pairs) × 기록 삭제가 같은 순간 겹칠 때의 무결성 장치. 마이그레이션 30번.
-- 규칙: 더하기만 한다 — 28 · 29번 파일은 고치지 않고, 이 파일이 새 트리거 하나 + pair_join 함수의 새 정의만 더한다(데이터는 바꾸지 않는다).
--
-- 문제(로컬 DB에서 동시 트랜잭션 두 줄로 재현했다 — supabase/tests/pair-purge.db.test.ts):
--   pairs는 검사 결과(assessments)를 외래 키로 묶지 않는다(24번 주석: 회원 탈퇴가 주문 없는 검사 결과를 지우는데 그때 이 표가 탈퇴를 막으면 안 되기 때문).
--   그래서 쌍을 만드는 쪽(insert)과 수락하는 쪽(pair_join의 update)은 검사 결과 행을 잠그지 않고,
--   29번 삭제 함수(delete_assessment_record_v2)의 "쌍이 이 결과를 가리키면 분석 원자료를 남긴다" 확인(select exists ...)은
--   아직 커밋하지 않은 쌍을 볼 수 없다. 그 결과
--     ① 삭제가 결과 행을 잠근 채 원자료를 비우는 동안 새 쌍이 만들어지거나(쌍 만들기는 기다리지 않는다)
--     ② 쌍 만들기 트랜잭션이 끝나기 전에 삭제가 확인을 마치고 원자료를 비우면
--   "원자료(생년월일 · 응답 · 사주)가 빈 값인 분석을 새 쌍이 가리키는" 상태가 남을 수 있었다(그 쌍으로 궁합을 만들면 빈 자료로 계산한다).
--   앱은 쌍을 만들기 전에 삭제 여부를 읽어 확인하지만 읽기와 쓰기 사이에 삭제가 끼어들 수 있고, DB는 이를 막지 못했다.
--
-- 장치: 28 · 29번의 대화 · 주문 · 리포트 차단과 같은 방식이다.
--   · 쌍이 결과를 가리키는 순간(만들기 · 수락 · 결과 번호 변경)에 그 검사 결과 행을 for share로 읽는다 — 삭제 함수의 for update와 같은 행이라
--       삭제가 진행 중이면 끝날 때까지 기다린 뒤 결과를 보고 판단하고(삭제를 마친 결과면 거절),
--       쌍이 먼저면 삭제 함수가 그 쌍이 커밋될 때까지 기다린 뒤 쌍을 보고 원자료를 남긴다.
--   · 이미 삭제한 결과(28번 범위: record_deleted_at, 29번 범위: record_purged_at)를 가리키는 쌍은 만들 수 없다 — 순서가 겹치지 않아도 DB가 지킨다.
--   · 결과 번호를 바꾸지 않는 갱신(연결 해제 · 동의 철회 · 탈퇴 반응)은 막지 않는다 — 한쪽이 기록을 삭제한 뒤에도 기존 쌍은 정리할 수 있다.
--   · 없는 결과(회원 탈퇴로 지워진 번호)를 가리키는 쌍은 예전처럼 허용한다(외래 키가 없는 설계는 그대로).
--   · 잠금은 공유 잠금(for share)뿐이라 쌍끼리는 서로 기다리지 않는다. 삭제 함수는 결과 행 하나만 잠그고 쌍 행은 잠그지 않으므로(읽기만) 서로 기다리는 순환이 없다.
--       (pair_join은 쌍 행 → 결과 행 순서로 잠근다. 이 순서를 거꾸로 잡는 곳은 없다 — 탈퇴 함수는 상대가 들어오기 전의 쌍 행을 건드리지 않는다.)
--
-- 보존: 이미 만들어진 쌍 · 연결 · 완성된 글 · 다른 회원의 자료 · 질문권은 바뀌지 않는다. 이 파일은 새 쌍이 지워진 결과를 가리키지 못하게만 한다.
--       이미 이 상태(원자료가 비어 있는데 쌍이 가리킴)가 된 행이 있는지는 supabase/pair-assessment-guard-30-precheck.sql로 읽어서 확인한다(읽기 전용).
-- 선행조건: 24번(pairs) · 29번(record_purged_at)이 적용돼 있어야 한다. 없으면 아래에서 멈춘다(아무것도 바꾸지 않는다).

do $$
begin
  if to_regclass('public.pairs') is null then
    raise exception '30번은 24번(리포트 궁합, pairs 표)을 먼저 적용해야 합니다';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'assessments' and column_name = 'record_purged_at'
  ) then
    raise exception '30번은 29번(기록 삭제 범위 확대, assessments.record_purged_at)을 먼저 적용해야 합니다';
  end if;
end;
$$;

-- 쌍이 가리키는 검사 결과가 삭제 중이거나 삭제를 마쳤으면 거절한다 -----------------------------------------------------------------------------------
create or replace function public.pairs_block_deleted_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted timestamptz;
  v_purged timestamptz;
begin
  -- 만들 때는 두 자리 모두, 바꿀 때는 번호가 달라진 자리만 본다(번호를 바꾸지 않는 갱신은 지나간다)
  if tg_op = 'INSERT' or new.a_assessment_id is distinct from old.a_assessment_id then
    -- 삭제 함수와 같은 행을 잠그는 읽기(for share) — 삭제가 진행 중이면 끝날 때까지 기다린 뒤 결과를 보고 판단한다 (읽는 것은 삭제 시각 둘뿐이다)
    select a.record_deleted_at, a.record_purged_at into v_deleted, v_purged
      from public.assessments a where a.id = new.a_assessment_id for share;
    if v_purged is not null then
      raise exception 'record_purged';
    end if;
    if v_deleted is not null then
      raise exception 'record_deleted';
    end if;
  end if;
  if new.b_assessment_id is not null and (tg_op = 'INSERT' or new.b_assessment_id is distinct from old.b_assessment_id) then
    select a.record_deleted_at, a.record_purged_at into v_deleted, v_purged
      from public.assessments a where a.id = new.b_assessment_id for share;
    if v_purged is not null then
      raise exception 'record_purged';
    end if;
    if v_deleted is not null then
      raise exception 'record_deleted';
    end if;
  end if;
  return new;
end;
$$;

create trigger pairs_block_deleted_record before insert or update of a_assessment_id, b_assessment_id on public.pairs
  for each row execute function public.pairs_block_deleted_record();

revoke all on function public.pairs_block_deleted_record() from public, anon, authenticated;

-- pair_join: 24번 정의와 같고, 상대의 결과를 for share로 읽으며 삭제한 결과는 'bad-assessment'로 돌려준다(위 트리거 전에 깨끗한 상태 값으로 거절) --------------------------
create or replace function public.pair_join(p_token text, p_user uuid, p_assessment uuid, p_consent_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.pairs%rowtype;
  v_owner uuid;
  v_withdrawn timestamptz;
  v_deleted timestamptz;
  v_purged timestamptz;
begin
  select * into v from public.pairs where token = p_token for update;
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if v.status = 'unlinked' then
    return jsonb_build_object('status', 'closed');
  end if;
  if v.b_user_id is not null then
    -- 이미 이 사람이 들어와 있으면 같은 결과(다시 눌러도 한 번만)
    if v.b_user_id = p_user then
      return jsonb_build_object('status', 'joined', 'pair', v.id);
    end if;
    return jsonb_build_object('status', 'taken');
  end if;
  if v.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  if v.a_user_id = p_user then
    return jsonb_build_object('status', 'self');
  end if;
  if v.a_withdrawn_at is not null then
    return jsonb_build_object('status', 'closed');
  end if;
  -- 상대의 결과 행을 공유 잠금으로 읽는다: 삭제가 진행 중이면 끝날 때까지 기다린 뒤 결과를 보고 판단하고, 이 수락이 먼저면 삭제가 이 수락이 끝날 때까지 기다린다
  select user_id, withdrawn_at, record_deleted_at, record_purged_at into v_owner, v_withdrawn, v_deleted, v_purged
    from public.assessments where id = p_assessment for share;
  if v_owner is null or v_owner <> p_user or v_withdrawn is not null or v_deleted is not null or v_purged is not null then
    return jsonb_build_object('status', 'bad-assessment');
  end if;
  update public.pairs
     set b_user_id = p_user, b_assessment_id = p_assessment, b_consent_at = now(), b_consent_version = p_consent_version, status = 'linked'
   where id = v.id;
  return jsonb_build_object('status', 'joined', 'pair', v.id);
end;
$$;

-- 권한은 24번과 같다(서버만 부를 수 있다). create or replace는 기존 권한을 유지하지만 의도를 한 번 더 적어 둔다
revoke all on function public.pair_join(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.pair_join(text, uuid, uuid, text) to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 끝 확인 — 하나라도 어긋나면 위의 모든 변경이 취소된다 (고객 삭제 함수는 부르지 않는다: 카탈로그만 읽는다)
-- ═════════════════════════════════════════════════════════════════
create temp table _a2930_after on commit drop as select * from _a2930_state;

do $verify$
declare
  diff text;
  rows_diff text;
  def text;
  acl text;
  fn text;
begin
  -- 1) 구조 · 권한 · 행의 변화가 정확히 예상한 것뿐인가 (표 · 열 · 제약 · 인덱스 · 정책 · 표 권한 · 함수 권한과 정의 · 트리거 · 사용자 자료 행 수와 내용)
  create temp table _a2930_allowed (side text, kind text, key text) on commit drop;
  insert into _a2930_allowed
    select 'added', k.kind, k.key from (values
      ('column', 'assessments.record_purged_at'),
      ('function-acl', 'public.delete_assessment_record_v2(uuid, uuid)'),
      ('function-def', 'public.delete_assessment_record_v2(uuid, uuid)'),
      ('function-acl', 'public.block_write_on_purged_record()'),
      ('function-def', 'public.block_write_on_purged_record()'),
      ('function-acl', 'public.pairs_block_deleted_record()'),
      ('function-def', 'public.pairs_block_deleted_record()'),
      ('function-def', 'public.pair_join(text, uuid, uuid, text)'),
      ('trigger', 'talk_rooms_block_purged'),
      ('trigger', 'chat_summaries_block_purged'),
      ('trigger', 'talk_transcripts_block_purged'),
      ('trigger', 'chat_questions_block_purged'),
      ('trigger', 'pairs_block_deleted_record')
    ) as k(kind, key);
  insert into _a2930_allowed values ('removed', 'function-def', 'public.pair_join(text, uuid, uuid, text)');

  create temp table _a2930_changes (side text, kind text, key text) on commit drop;
  insert into _a2930_changes
    select 'added', kind, key from (select kind, key, val from _a2930_after except select kind, key, val from _a2930_before) a
    union all
    select 'removed', kind, key from (select kind, key, val from _a2930_before except select kind, key, val from _a2930_after) r;

  select string_agg(side || ' ' || kind || ' ' || key, ' / ' order by kind, key) into rows_diff from _a2930_changes where kind = 'rows';
  if rows_diff is not null then
    raise exception '끝 확인 실패 — 사용자 자료의 행 수 또는 내용이 적용 전과 달라졌습니다: %. 29 · 30번은 행을 바꾸지 않으므로 이 사이에 다른 사용자의 활동이 겹쳤을 수 있습니다. 전체 취소했습니다 — 다시 실행해 주세요. 반복되면 결과를 그대로 알려 주세요.', rows_diff;
  end if;
  select string_agg(c.side || ' ' || c.kind || ' ' || c.key, ' / ' order by c.kind, c.key) into diff
    from _a2930_changes c where not exists (select 1 from _a2930_allowed a where a.side = c.side and a.kind = c.kind and a.key = c.key);
  if diff is not null then
    raise exception '끝 확인 실패 — 예상하지 못한 변화가 있습니다: %. 전체 취소했습니다. 결과를 그대로 알려 주세요.', diff;
  end if;
  select string_agg(a.side || ' ' || a.kind || ' ' || a.key, ' / ' order by a.kind, a.key) into diff
    from _a2930_allowed a where not exists (select 1 from _a2930_changes c where a.side = c.side and a.kind = c.kind and a.key = c.key);
  if diff is not null then
    raise exception '끝 확인 실패 — 만들어져야 할 것이 없습니다: %. 전체 취소했습니다. 결과를 그대로 알려 주세요.', diff;
  end if;

  -- 2) 29번: 삭제 완료 표시는 모든 행이 비어 있다(적용만으로는 어떤 기록도 삭제 완료로 바뀌지 않는다)
  if exists (select 1 from public.assessments where record_purged_at is not null) then
    raise exception '끝 확인 실패 — 삭제 완료로 표시된 기록이 있습니다. 전체 취소했습니다.';
  end if;

  -- 3) 새 함수 셋의 권한: 서버(service_role)만, 브라우저 역할 · public 불가 (트리거 함수 둘은 service_role도 직접 실행할 이유가 없지만 기존 방식과 같은 권한이면 된다 — 브라우저 역할만 막는다)
  foreach fn in array array['public.delete_assessment_record_v2(uuid,uuid)', 'public.block_write_on_purged_record()', 'public.pairs_block_deleted_record()'] loop
    if has_function_privilege('anon', fn, 'execute') or has_function_privilege('authenticated', fn, 'execute') then
      raise exception '끝 확인 실패 — 브라우저 역할이 % 를 실행할 수 있습니다. 전체 취소했습니다.', fn;
    end if;
    select coalesce(p.proacl::text, '') into acl from pg_proc p where p.oid = fn::regprocedure;
    if acl ~ '(^\{|,)=' then
      raise exception '끝 확인 실패 — % 에 public 실행 권한이 남아 있습니다 (%). 전체 취소했습니다.', fn, acl;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.delete_assessment_record_v2(uuid,uuid)', 'execute') then
    raise exception '끝 확인 실패 — 서버 역할이 delete_assessment_record_v2를 실행할 수 없습니다. 전체 취소했습니다.';
  end if;
  -- pair_join: 서버만 (24번과 같다)
  select coalesce(p.proacl::text, '') into acl from pg_proc p where p.oid = 'public.pair_join(text,uuid,uuid,text)'::regprocedure;
  if not has_function_privilege('service_role', 'public.pair_join(text,uuid,uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.pair_join(text,uuid,uuid,text)', 'execute') or has_function_privilege('authenticated', 'public.pair_join(text,uuid,uuid,text)', 'execute') or acl ~ '(^\{|,)=' then
    raise exception '끝 확인 실패 — pair_join의 실행 권한이 예상과 다릅니다 (%). 전체 취소했습니다.', acl;
  end if;
  -- 28번 삭제 함수의 권한은 그대로: 서버만
  if not has_function_privilege('service_role', 'public.delete_assessment_record(uuid,uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.delete_assessment_record(uuid,uuid,jsonb)', 'execute') or has_function_privilege('authenticated', 'public.delete_assessment_record(uuid,uuid,jsonb)', 'execute') then
    raise exception '끝 확인 실패 — 28번 삭제 함수의 권한이 달라졌습니다. 전체 취소했습니다.';
  end if;

  -- 4) 트리거 5개가 올바른 표에 켜져 있다(enabled = O)
  if not exists (select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid where g.tgname = 'talk_rooms_block_purged' and c.relname = 'talk_rooms' and c.relnamespace = 'public'::regnamespace and g.tgenabled = 'O' and not g.tgisinternal) then raise exception '끝 확인 실패 — 트리거 talk_rooms_block_purged가 표 talk_rooms에 켜져 있지 않습니다. 전체 취소했습니다.'; end if;
  if not exists (select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid where g.tgname = 'chat_summaries_block_purged' and c.relname = 'chat_summaries' and c.relnamespace = 'public'::regnamespace and g.tgenabled = 'O' and not g.tgisinternal) then raise exception '끝 확인 실패 — 트리거 chat_summaries_block_purged가 표 chat_summaries에 켜져 있지 않습니다. 전체 취소했습니다.'; end if;
  if not exists (select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid where g.tgname = 'talk_transcripts_block_purged' and c.relname = 'talk_transcripts' and c.relnamespace = 'public'::regnamespace and g.tgenabled = 'O' and not g.tgisinternal) then raise exception '끝 확인 실패 — 트리거 talk_transcripts_block_purged가 표 talk_transcripts에 켜져 있지 않습니다. 전체 취소했습니다.'; end if;
  if not exists (select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid where g.tgname = 'chat_questions_block_purged' and c.relname = 'chat_questions' and c.relnamespace = 'public'::regnamespace and g.tgenabled = 'O' and not g.tgisinternal) then raise exception '끝 확인 실패 — 트리거 chat_questions_block_purged가 표 chat_questions에 켜져 있지 않습니다. 전체 취소했습니다.'; end if;
  if not exists (select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid where g.tgname = 'pairs_block_deleted_record' and c.relname = 'pairs' and c.relnamespace = 'public'::regnamespace and g.tgenabled = 'O' and not g.tgisinternal) then raise exception '끝 확인 실패 — 트리거 pairs_block_deleted_record가 표 pairs에 켜져 있지 않습니다. 전체 취소했습니다.'; end if;

  -- 5) pair_join의 새 정의: 삭제한 결과를 거절하고 결과 행을 공유 잠금으로 읽는다
  select pg_get_functiondef('public.pair_join(text,uuid,uuid,text)'::regprocedure) into def;
  if def !~ 'record_purged_at' or def !~ 'record_deleted_at' or def !~* 'for share' then
    raise exception '끝 확인 실패 — pair_join이 새 정의가 아닙니다. 전체 취소했습니다.';
  end if;
end
$verify$;

drop view _a2930_state;

commit;

-- ═════════════════════════════════════════════════════════════════
-- 확인: 적용 이력 (읽기 전용 — supabase/check-migrations.sql과 같다. 아무것도 바꾸지 않는다. 29 · 30번이 "적용됨"이면 끝이다)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) DB 변경 적용 여부 확인 — 읽기만 한다 (아무것도 만들거나 바꾸거나 지우지 않는다).
--
-- 사용: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용을 붙여넣고 Run.
-- 결과 표의 "상태"가 "아직 안 함"인 번호만, 번호 순서대로 실행하면 된다 (supabase/migrations 폴더의 같은 번호 파일).
-- "적용됨"인 파일은 다시 실행하지 않는다.
--
-- 주의: 이 확인은 각 파일이 만드는 대표 항목(표 · 열 · 함수 · 권한)이 있는지 본다. 파일을 중간까지만 실행한 경우처럼
--       애매한 상태는 "일부만"으로 표시한다 — 그럴 때는 임의로 다시 실행하지 말고 이 결과 표를 그대로 알려 달라.

with
t as (
  select
    to_regclass('public.profiles')            is not null as profiles,
    to_regclass('public.assessments')         is not null as assessments,
    to_regclass('public.user_regions')        is not null as user_regions,
    to_regclass('public.orders')              is not null as orders,
    to_regclass('public.payment_events')      is not null as payment_events,
    to_regclass('public.reports')             is not null as reports,
    to_regclass('public.user_consents')       is not null as user_consents,
    to_regclass('public.personal_contexts')   is not null as personal_contexts,
    to_regclass('public.ops_events')          is not null as ops_events,
    to_regclass('public.ai_usage')            is not null as ai_usage,
    to_regclass('public.funnel_events')       is not null as funnel_events,
    to_regclass('public.report_feedback')     is not null as report_feedback,
    to_regclass('public.concern_records')     is not null as concern_records,
    to_regclass('public.talk_rooms')          is not null as talk_rooms,
    to_regclass('public.chat_questions')      is not null as chat_questions,
    to_regclass('public.cash_wallets')        is not null as cash_wallets,
    to_regclass('public.cash_ledger')         is not null as cash_ledger,
    to_regclass('public.chat_summaries')      is not null as chat_summaries
),
wd as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles'    and column_name = 'withdrawn_at') as profile_col,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'withdrawn_at') as assessment_col,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'withdraw_member_data') as fn
),
-- 11번: 탈퇴 함수가 고민 기록 삭제를 포함하도록 갱신됐는가
wd11 as (
  select coalesce((select bool_or(pg_get_functiondef(p.oid) like '%concern_records%')
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as fn_updated
),
-- 12번: 탈퇴 함수가 대화 삭제를 포함하도록 갱신됐는가
wd12 as (
  select coalesce((select bool_or(pg_get_functiondef(p.oid) like '%talk_rooms%')
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as fn_updated
),
-- 14번: 방 요약 위치 열 · 탈퇴 함수가 채팅 요약 삭제를 포함하도록 갱신됐는가
wd14 as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'talk_rooms' and column_name = 'saved_upto') as saved_col,
    coalesce((select bool_or(pg_get_functiondef(p.oid) like '%chat_summaries%')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as fn_updated
),
-- 13번: 캐시 함수 · 충전 트리거 · 탈퇴 함수가 캐시 잔액 확인을 포함하도록 갱신됐는가
wd13 as (
  select
    coalesce((select bool_or(pg_get_functiondef(p.oid) like '%cash_wallets%')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as fn_updated,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'spend_cash') as spend_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'restore_cash_spend') as restore_fn,
    exists (select 1 from pg_trigger g where g.tgname = 'orders_cash_change' and not g.tgisinternal) as trigger_ok
),
-- 15번: 운영자 수동 질문 반영 함수
wd15 as (
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_credit_question') as fn
),
-- 16번: 질문 묶음 장부 · 부분 환불 반영 함수 · 무료 질문 예약 함수와 열
wd16 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'question_packs') as packs,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'apply_cash_refund') as refund_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reserve_chat_question') as reserve_fn,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chat_questions' and column_name = 'reserved_until') as reserved_col,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cash_ledger' and column_name = 'pack_order_id') as pack_col
),
-- 17번: 맛보기 리포트 표(한 계정당 1번) · 예약 · 저장 · 풀기 함수
wd17 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'taste_reports') as tbl,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reserve_taste_report') as reserve_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'save_taste_report') as save_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'release_taste_report') as release_fn,
    coalesce((select bool_or(pg_get_functiondef(p.oid) like '%taste_reports%')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as withdraw_fn
),
-- 18번: 초대 링크 · 초대 할인 표와 함수, 탈퇴 함수의 초대 링크 삭제
wd18 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'invites') as invites,
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'invite_discounts') as discounts,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'invite_discount_status') as status_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'claim_invite_discount') as claim_fn,
    coalesce((select bool_or(pg_get_functiondef(p.oid) like '%public.invites%')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as withdraw_fn
),
-- 19~22번: 혜택 시스템(포인트 · 질문권 · 쿠폰 · 0원 혜택 주문 · 추천 · 비용 · 탈퇴 정리)
wd19 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'benefit_settings') as settings,
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'point_lots') as lots,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'grant_points') as grant_fn
),
wd20 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'coupons') as coupons,
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'benefit_order_grants') as grants,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'grant_benefit_order') as grant_fn
),
wd21 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'referral_signups') as signups,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'register_referral_signup') as register_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'claim_referral_discount') as claim_fn
),
wd22 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'benefit_expenses') as expenses,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_usage' and column_name = 'request_key') as request_key,
    coalesce((select bool_or(pg_get_functiondef(p.oid) like '%forfeit_member_benefits%')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as withdraw_fn
),
wd23 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'compat_requests') as requests,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'scrub_compat_request') as scrub_fn,
    exists (select 1 from pg_trigger where tgname = 'profiles_compat_withdraw' and not tgisinternal) as withdraw_trigger,
    coalesce((select has_table_privilege('service_role', 'public.compat_requests', 'insert') from information_schema.tables where table_schema = 'public' and table_name = 'compat_requests'), false) as service_grant
),
wd24 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'pairs') as pairs,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'pair_join') as join_fn,
    exists (select 1 from pg_trigger where tgname = 'profiles_pairs_withdraw' and not tgisinternal) as withdraw_trigger,
    exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'orders_one_paid_pair') as one_paid,
    coalesce((select has_table_privilege('service_role', 'public.pairs', 'insert') from information_schema.tables where table_schema = 'public' and table_name = 'pairs'), false) as service_grant
),
wd25 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'reviews') as reviews,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'review_admin_apply') as admin_fn,
    exists (select 1 from pg_trigger where tgname = 'profiles_reviews_withdraw' and not tgisinternal) as withdraw_trigger,
    exists (select 1 from pg_constraint where conname = 'funnel_events_name_check' and pg_get_constraintdef(oid) like '%review_section_view%') as funnel_names,
    coalesce((select has_table_privilege('service_role', 'public.reviews', 'insert') from information_schema.tables where table_schema = 'public' and table_name = 'reviews'), false) as service_grant
),
wd26 as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pairs' and column_name = 'relationship') as relationship_col
),
wd27 as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'my_hidden_at') as hidden_col,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_assessment_my_hidden') as hide_fn,
    coalesce(has_function_privilege('service_role', 'public.set_assessment_my_hidden(uuid, uuid, boolean)', 'execute'), false) as service_grant
),
wd28 as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'record_deleted_at') as deleted_col,
    to_regclass('public.talk_transcripts') is not null as transcripts_table,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'delete_assessment_record') as delete_fn,
    coalesce(has_function_privilege('service_role', 'public.delete_assessment_record(uuid, uuid, jsonb)', 'execute'), false) as service_grant,
    coalesce(not has_function_privilege('anon', 'public.delete_assessment_record(uuid, uuid, jsonb)', 'execute') and not has_function_privilege('authenticated', 'public.delete_assessment_record(uuid, uuid, jsonb)', 'execute'), false) as browser_blocked,
    exists (select 1 from pg_trigger where tgname in ('reports_block_deleted_record', 'orders_block_deleted_record', 'taste_reports_block_deleted_record') having count(*) = 3) as guard_triggers
),
wd29 as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'record_purged_at') as purged_col,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'delete_assessment_record_v2') as delete_fn,
    coalesce(has_function_privilege('service_role', 'public.delete_assessment_record_v2(uuid, uuid)', 'execute'), false) as service_grant,
    coalesce(not has_function_privilege('anon', 'public.delete_assessment_record_v2(uuid, uuid)', 'execute') and not has_function_privilege('authenticated', 'public.delete_assessment_record_v2(uuid, uuid)', 'execute'), false) as browser_blocked,
    exists (select 1 from pg_trigger where tgname in ('talk_rooms_block_purged', 'chat_summaries_block_purged', 'talk_transcripts_block_purged', 'chat_questions_block_purged') having count(*) = 4) as guard_triggers
),
wd30 as (
  select
    exists (select 1 from pg_trigger t where t.tgname = 'pairs_block_deleted_record' and not t.tgisinternal) as guard_trigger,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'pairs_block_deleted_record') as guard_fn,
    coalesce(pg_get_functiondef(to_regprocedure('public.pair_join(text,uuid,uuid,text)')) ~ 'record_purged_at', false) as join_checks_deleted,
    coalesce(not has_function_privilege('anon', 'public.pairs_block_deleted_record()', 'execute') and not has_function_privilege('authenticated', 'public.pairs_block_deleted_record()', 'execute'), false) as browser_blocked
),
col as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'payment_env')  as payment_env,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'acq_source')   as acq_source
),
fn as (
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'ai_cost_since') as ai_cost_since
),
-- 3번: 프로필이 빠진 회원이 없고, 서버가 프로필을 만들 수 있는 권한이 있는가 (profiles 표가 있을 때만 센다)
missing_profiles as (
  select case
    when to_regclass('public.profiles') is null then null
    else (xpath('/row/c/text()', query_to_xml('select count(*) as c from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)', false, true, '')))[1]::text::int
  end as n
),
grants as (
  select case
    when to_regclass('public.profiles') is null then null
    else has_table_privilege('service_role', 'public.profiles', 'insert')
  end as profiles_insert
),
-- 6번: 결제 기록 출처에 reconcile이 허용되는가
src as (
  select coalesce((select pg_get_constraintdef(c.oid) like '%reconcile%'
                   from pg_constraint c
                   where c.conrelid = to_regclass('public.payment_events') and c.conname = 'payment_events_source_check'), false) as reconcile_ok
)
select * from (
  select 1 as "번호", '20261011000000_init.sql' as "파일",
         case when t.profiles and t.assessments and t.user_regions and t.orders and t.payment_events and t.reports then '적용됨'
              when t.profiles or t.assessments or t.user_regions or t.orders or t.payment_events or t.reports then '일부만' else '아직 안 함' end as "상태",
         '표 6개: profiles, assessments, user_regions, orders, payment_events, reports' as "확인한 것"
  from t
  union all
  select 2, '20261012000000_consents.sql',
         case when t.user_consents then '적용됨' else '아직 안 함' end,
         '표 user_consents'
  from t
  union all
  select 3, '20261013000000_profile_backfill.sql',
         case when mp.n is null then '아직 안 함 (1번 먼저)'
              when mp.n = 0 and g.profiles_insert then '적용됨'
              when mp.n = 0 and not g.profiles_insert then '아직 안 함'
              else '아직 안 함' end,
         '프로필 없는 회원 ' || coalesce(mp.n::text, '-') || '명 / 서버의 프로필 생성 권한 ' || coalesce(g.profiles_insert::text, '-')
  from missing_profiles mp, grants g
  union all
  select 4, '20261014000000_payment_env.sql',
         case when col.payment_env then '적용됨' else '아직 안 함' end,
         '주문의 payment_env 열'
  from col
  union all
  select 5, '20261015000000_personal_context.sql',
         case when t.personal_contexts then '적용됨' else '아직 안 함' end,
         '표 personal_contexts'
  from t
  union all
  select 6, '20261016000000_ops_events.sql',
         case when t.ops_events and src.reconcile_ok then '적용됨'
              when t.ops_events or src.reconcile_ok then '일부만' else '아직 안 함' end,
         '표 ops_events / 결제 기록 출처에 reconcile 허용: ' || src.reconcile_ok::text
  from t, src
  union all
  select 7, '20261017000000_ai_usage.sql',
         case when t.ai_usage then '적용됨' else '아직 안 함' end,
         '표 ai_usage'
  from t
  union all
  select 8, '20261018000000_funnel_feedback.sql',
         case when t.funnel_events and t.report_feedback and col.acq_source then '적용됨'
              when t.funnel_events or t.report_feedback or col.acq_source then '일부만' else '아직 안 함' end,
         '표 funnel_events, report_feedback / 주문의 acq_source 열'
  from t, col
  union all
  select 9, '20261019000000_performance.sql',
         case when fn.ai_cost_since then '적용됨' else '아직 안 함' end,
         '함수 ai_cost_since'
  from fn
  union all
  select 10, '20261020000000_account_withdrawal.sql',
         case when wd.profile_col and wd.assessment_col and wd.fn then '적용됨'
              when wd.profile_col or wd.assessment_col or wd.fn then '일부만' else '아직 안 함' end,
         '프로필 · 검사의 withdrawn_at 열 / 함수 withdraw_member_data'
  from wd
  union all
  select 11, '20261021000000_concern_records.sql',
         case when t.concern_records and wd11.fn_updated then '적용됨'
              when t.concern_records or wd11.fn_updated then '일부만' else '아직 안 함' end,
         '표 concern_records / 탈퇴 함수에 고민 기록 삭제 포함: ' || wd11.fn_updated::text
  from t, wd11
  union all
  select 12, '20261022000000_talk_rooms.sql',
         case when t.talk_rooms and t.chat_questions and wd12.fn_updated then '적용됨'
              when t.talk_rooms or t.chat_questions or wd12.fn_updated then '일부만' else '아직 안 함' end,
         '표 talk_rooms, chat_questions / 탈퇴 함수에 대화 삭제 포함: ' || wd12.fn_updated::text
  from t, wd12
  union all
  select 13, '20261023000000_miyu_cash.sql',
         case when t.cash_wallets and t.cash_ledger and wd13.spend_fn and wd13.restore_fn and wd13.trigger_ok and wd13.fn_updated then '적용됨'
              when t.cash_wallets or t.cash_ledger or wd13.spend_fn or wd13.restore_fn or wd13.trigger_ok or wd13.fn_updated then '일부만' else '아직 안 함' end,
         '표 cash_wallets, cash_ledger / 함수 spend_cash, restore_cash_spend / 주문 결제 완료 때 충전하는 트리거 / 탈퇴 함수에 캐시 잔액 확인 포함: ' || wd13.fn_updated::text
  from t, wd13
  union all
  select 14, '20261024000000_chat_summaries.sql',
         case when t.chat_summaries and wd14.saved_col and wd14.fn_updated then '적용됨'
              when t.chat_summaries or wd14.saved_col or wd14.fn_updated then '일부만' else '아직 안 함' end,
         '표 chat_summaries / 열 talk_rooms.saved_upto: ' || wd14.saved_col::text || ' / 탈퇴 함수에 채팅 요약 삭제 포함: ' || wd14.fn_updated::text
  from t, wd14
  union all
  select 15, '20261025000000_admin_credit_question.sql',
         case when wd15.fn then '적용됨' else '아직 안 함' end,
         '함수 admin_credit_question (결제사 확인 뒤 운영자가 주문에 적힌 만큼 질문을 넣는 함수)'
  from wd15
  union all
  select 16, '20261026000000_question_packs.sql',
         case when wd16.packs and wd16.refund_fn and wd16.reserve_fn and wd16.reserved_col and wd16.pack_col then '적용됨'
              when wd16.packs or wd16.refund_fn or wd16.reserve_fn or wd16.reserved_col or wd16.pack_col then '일부만' else '아직 안 함' end,
         '표 question_packs (묶음별 사용 · 환불 장부) / 함수 apply_cash_refund (부분 환불 반영) · reserve_chat_question (무료 질문 한도를 DB에서 보장) / 열 chat_questions.reserved_until: ' || wd16.reserved_col::text
  from wd16
  union all
  select 17, '20261027000000_taste_reports.sql',
         case when wd17.tbl and wd17.reserve_fn and wd17.save_fn and wd17.release_fn and wd17.withdraw_fn then '적용됨'
              when wd17.tbl or wd17.reserve_fn or wd17.save_fn or wd17.release_fn or wd17.withdraw_fn then '일부만' else '아직 안 함' end,
         '표 taste_reports (맛보기 리포트 · 회원 한 명당 한 줄) / 함수 reserve_taste_report · save_taste_report · release_taste_report / 탈퇴 함수에 맛보기 리포트 삭제 포함: ' || wd17.withdraw_fn::text
  from wd17
  union all
  select 18, '20261028000000_invites.sql',
         case when wd18.invites and wd18.discounts and wd18.status_fn and wd18.claim_fn and wd18.withdraw_fn then '적용됨'
              when wd18.invites or wd18.discounts or wd18.status_fn or wd18.claim_fn or wd18.withdraw_fn then '일부만' else '아직 안 함' end,
         '표 invites (초대 링크) · invite_discounts (초대 할인 기록) / 함수 invite_discount_status · claim_invite_discount / 탈퇴 함수에 초대 링크 삭제 포함: ' || wd18.withdraw_fn::text
  from wd18
  union all
  select 19, '20261029000000_benefits_core.sql',
         case when wd19.settings and wd19.lots and wd19.grant_fn then '적용됨'
              when wd19.settings or wd19.lots or wd19.grant_fn then '일부만' else '아직 안 함' end,
         '표 benefit_settings (혜택 설정 · 모두 꺼진 채로 시작) · point_lots (포인트 묶음) / 함수 grant_points · 질문권 장부 함수'
  from wd19
  union all
  select 20, '20261030000000_coupons_free_orders.sql',
         case when wd20.coupons and wd20.grants and wd20.grant_fn then '적용됨'
              when wd20.coupons or wd20.grants or wd20.grant_fn then '일부만' else '아직 안 함' end,
         '표 coupons · benefit_order_grants / 함수 grant_benefit_order (0원 혜택 주문, 서버가 승인한 혜택만)'
  from wd20
  union all
  select 21, '20261031000000_referrals.sql',
         case when wd21.signups and wd21.register_fn and wd21.claim_fn then '적용됨'
              when wd21.signups or wd21.register_fn or wd21.claim_fn then '일부만' else '아직 안 함' end,
         '표 referral_signups (추천 가입) / 함수 register_referral_signup · claim_referral_discount'
  from wd21
  union all
  select 22, '20261101000000_benefit_finance_ai.sql',
         case when wd22.expenses and wd22.request_key and wd22.withdraw_fn then '적용됨'
              when wd22.expenses or wd22.request_key or wd22.withdraw_fn then '일부만' else '아직 안 함' end,
         '표 benefit_expenses (비용 입력) / 열 ai_usage.request_key (질문 한 번의 AI 원가) / 탈퇴 함수에 혜택 정리 포함: ' || wd22.withdraw_fn::text
  from wd22
  union all
  select 23, '20261102000000_compat_requests.sql',
         case when wd23.requests and wd23.scrub_fn and wd23.withdraw_trigger and wd23.service_grant then '적용됨'
              when wd23.requests or wd23.scrub_fn or wd23.withdraw_trigger or wd23.service_grant then '일부만' else '아직 안 함' end,
         '표 compat_requests (사주 궁합 상대 입력 · 리포트 완성 · 환불 · 탈퇴 때 지움) / 함수 scrub_compat_request / 탈퇴 시 지우는 트리거: ' || wd23.withdraw_trigger::text || ' / 서버 권한: ' || wd23.service_grant::text
  from wd23
  union all
  select 24, '20261103000000_pair_reports.sql',
         case when wd24.pairs and wd24.join_fn and wd24.withdraw_trigger and wd24.one_paid and wd24.service_grant then '적용됨'
              when wd24.pairs or wd24.join_fn or wd24.withdraw_trigger or wd24.one_paid or wd24.service_grant then '일부만' else '아직 안 함' end,
         '표 pairs (리포트 궁합 쌍 · 동의 · 해제 · 철회) / 함수 pair_join · pair_withdraw_consent · pair_unlink / 탈퇴 시 쌍을 끊는 트리거: ' || wd24.withdraw_trigger::text || ' / 쌍마다 결제 완료 주문 하나(고유 조건): ' || wd24.one_paid::text || ' / 서버 권한: ' || wd24.service_grant::text
  from wd24
  union all
  select 25, '20261104000000_reviews.sql',
         case when wd25.reviews and wd25.admin_fn and wd25.withdraw_trigger and wd25.funnel_names and wd25.service_grant then '적용됨'
              when wd25.reviews or wd25.admin_fn or wd25.withdraw_trigger or wd25.funnel_names or wd25.service_grant then '일부만' else '아직 안 함' end,
         '표 reviews (이용 후기 · 보상 한 번 · 삭제는 묘비) · review_admin_log · review_reports / 함수 review_admin_apply · submit_review_report / 탈퇴 시 후기를 지우는 트리거: ' || wd25.withdraw_trigger::text || ' / 방문 단계 이름에 후기 이벤트 포함: ' || wd25.funnel_names::text || ' / 서버 권한: ' || wd25.service_grant::text
  from wd25
  union all
  select 26, '20261105000000_pair_relationship.sql',
         case when wd26.relationship_col then '적용됨' else '아직 안 함' end,
         '표 pairs의 사이(relationship) 열 — 리포트 궁합 새 초대에만 필요하다. 이 열이 없으면 새 초대 만들기만 준비 중으로 멈추고 기존 쌍 · 개인 리포트 · 무료 궁합 · 사주 궁합은 그대로 동작한다: ' || wd26.relationship_col::text
  from wd26
  union all
  select 27, '20261106000000_my_report_hide.sql',
         case when wd27.hidden_col and wd27.hide_fn and wd27.service_grant then '적용됨'
              when wd27.hidden_col or wd27.hide_fn or wd27.service_grant then '일부만' else '아직 안 함' end,
         '열 assessments.my_hidden_at (MY 목록에서 숨긴 시각) / 함수 set_assessment_my_hidden (본인 것만 숨기기 · 다시 보이게 하기) / 서버 권한: ' || wd27.service_grant::text || ' — 이 열이 없으면 MY의 숨기기 버튼만 보이지 않고 나머지는 그대로 동작한다'
  from wd27
  union all
  select 28, '20261107000000_record_delete.sql',
         case when wd28.deleted_col and wd28.transcripts_table and wd28.delete_fn and wd28.service_grant and wd28.browser_blocked and wd28.guard_triggers then '적용됨'
              when wd28.deleted_col or wd28.transcripts_table or wd28.delete_fn or wd28.guard_triggers then '일부만' else '아직 안 함' end,
         '열 assessments.record_deleted_at / 표 talk_transcripts(읽기용 대화 기록) / 함수 delete_assessment_record(서버만 실행: ' || wd28.service_grant::text || ' · 브라우저 실행 막힘: ' || wd28.browser_blocked::text || ') / 삭제한 기록에 새 리포트 · 주문 · 맛보기 글을 막는 장치 3개: ' || wd28.guard_triggers::text || ' — 이 열이 없으면 MY의 기록 삭제 버튼만 보이지 않고 나머지는 그대로 동작한다'
  from wd28
  union all
  select 29, '20261108000000_record_delete_scope.sql',
         case when wd29.purged_col and wd29.delete_fn and wd29.service_grant and wd29.browser_blocked and wd29.guard_triggers then '적용됨'
              when wd29.purged_col or wd29.delete_fn or wd29.guard_triggers then '일부만' else '아직 안 함' end,
         '열 assessments.record_purged_at(삭제 완료 표시) / 함수 delete_assessment_record_v2(서버만 실행: ' || wd29.service_grant::text || ' · 브라우저 실행 막힘: ' || wd29.browser_blocked::text || ') / 삭제를 마친 기록에 대화방 · 요약 · 읽기용 기록 · 질문 횟수가 다시 생기지 않게 막는 장치 4개: ' || wd29.guard_triggers::text || ' — 이 함수가 없으면 MY의 기록 삭제는 예전 범위(채팅방은 읽기용 기록으로 남음)로 동작하고 나머지는 그대로 동작한다'
  from wd29
  union all
  select 30, '20261109000000_pair_assessment_guard.sql',
         case when wd30.guard_trigger and wd30.guard_fn and wd30.join_checks_deleted and wd30.browser_blocked then '적용됨'
              when wd30.guard_trigger or wd30.guard_fn or wd30.join_checks_deleted then '일부만' else '아직 안 함' end,
         '장치 pairs_block_deleted_record(삭제 중이거나 삭제한 검사 결과를 가리키는 쌍을 막음, 삭제와 같은 행을 잠그는 읽기): ' || wd30.guard_trigger::text || ' / 함수 pair_join이 삭제한 결과를 거절하는 새 정의: ' || wd30.join_checks_deleted::text || ' / 브라우저 실행 막힘: ' || wd30.browser_blocked::text || ' — 이 장치가 없으면 리포트 궁합 쌍을 만드는 일과 기록 삭제가 같은 순간 겹칠 때 DB가 막지 못한다(앱의 삭제 확인만 있다). 29번(기록 삭제 범위 확대)이 먼저 적용돼 있어야 한다'
  from wd30
) r
order by "번호";
