-- ME:U(미유) 17번째 마이그레이션 — 맛보기 리포트(무료 · 로그인한 회원만 · 한 계정당 1번)
-- 앞의 파일들(1~16번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 표와 함수를 "더하기만" 한다. 기존 검사 · 회원 · 주문 · 결제 · 리포트 · 대화 · 질문 장부 데이터는 이 파일을 실행하는 것만으로는 바뀌거나 지워지지 않는다.
-- 탈퇴 함수(withdraw_member_data)는 맛보기 리포트를 함께 지우도록 아래에서 갱신한다(주문이 있는 검사는 지워지지 않고 비워지기만 하므로 연쇄 삭제만으로는 부족하다).
--
-- 하는 일
--  - taste_reports: 무료 분석을 마친 회원이 [맛보기 리포트 받기]를 누르면 AI가 사주 · 응답을 엮어 쓴 짧은 글(나는 이런 사람 · 연애 · 일 · 마음)을 한 번만 만들어 저장한다.
--    회원 한 명당 한 줄(user_id가 기본 키)이라 "한 계정당 1번"을 DB가 지킨다. 저장된 글은 검사(형식 · 금지 표현 · 쉬운 말)를 통과한 것뿐이다.
--    status = 'pending' → 작성 중(예약, 5분 안에서만 유효 — 서버가 죽어 남은 예약은 영원히 잠기지 않는다) · 'ready' → 완성.
--  - reserve_taste_report / save_taste_report / release_taste_report: 예약 → 저장(또는 실패하면 풀기). 같은 회원의 동시 요청은 한 번에 하나씩 처리한다.
--  - 브라우저는 본인 줄 조회만, 쓰기는 서버가 소유자를 확인한 뒤에(서버 비밀키 함수로만).
--
-- 하지 않는 일
--  - 질문 · 사용자가 적은 글은 담지 않는다. 담는 것은 AI가 쓴 맛보기 글(JSON)과 어떤 모델 · 지시문 버전으로 썼는지뿐이다.
--  - 이미 결제한 리포트와는 상관없다. 이 표는 무료 맛보기 전용이다.

create table public.taste_reports (
  -- 한 계정당 1번: 회원 한 명이 한 줄만 가진다
  user_id uuid primary key references auth.users (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  status text not null check (status in ('pending', 'ready')),
  -- { version, headline, sections: [{ id, title, body }] } — 검사를 통과한 글만. 크기를 제한한다
  content jsonb check (content is null or (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 32768)),
  generator text,
  generator_version text,
  -- 작성 중(pending)일 때만: 이 시각까지 예약이 유효하다
  reserved_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taste_reports_ready_has_content check (status <> 'ready' or content is not null)
);

create index taste_reports_assessment_idx on public.taste_reports (assessment_id);

-- 검사 결과의 주인과 같은 회원만 (서버 코드 실수로 다른 회원의 결과에 붙지 않게)
create or replace function public.taste_reports_owner_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.assessments a where a.id = new.assessment_id and a.user_id = new.user_id
  ) then
    raise exception 'taste report owner mismatch';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger taste_reports_owner before insert or update on public.taste_reports
  for each row execute function public.taste_reports_owner_check();

alter table public.taste_reports enable row level security;

create policy "본인 맛보기 리포트 조회" on public.taste_reports
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.taste_reports from anon, authenticated;
grant select on public.taste_reports to authenticated;
grant select, insert, update, delete on public.taste_reports to service_role;

-- ─────────────────────────────────────────────
-- 예약 → 저장 / 풀기. 서버(비밀키)만 부른다.
-- ─────────────────────────────────────────────

-- 결과: { state: 'reserved' } 새로 쓸 수 있다 · { state: 'busy' } 다른 요청이 쓰는 중 · { state: 'ready', assessmentId, content, generator, generatorVersion, createdAt } 이미 받았다
create or replace function public.reserve_taste_report(p_user_id uuid, p_assessment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.taste_reports%rowtype;
begin
  if p_user_id is null or p_assessment_id is null then
    raise exception 'taste_invalid_input';
  end if;
  -- 같은 회원의 확인 · 예약은 한 번에 하나씩 (여러 서버에서 동시에 와도)
  perform pg_advisory_xact_lock(hashtextextended('taste:' || p_user_id::text, 0));
  select * into r from public.taste_reports where user_id = p_user_id;
  if found then
    if r.status = 'ready' then
      return jsonb_build_object(
        'state', 'ready',
        'assessmentId', r.assessment_id,
        'content', r.content,
        'generator', r.generator,
        'generatorVersion', r.generator_version,
        'createdAt', r.created_at
      );
    end if;
    if r.reserved_until is not null and r.reserved_until > now() then
      return jsonb_build_object('state', 'busy');
    end if;
    -- 오래된 예약(서버가 죽었거나 답이 오지 않음)은 이어받는다
    update public.taste_reports
       set assessment_id = p_assessment_id, reserved_until = now() + interval '5 minutes'
     where user_id = p_user_id;
    return jsonb_build_object('state', 'reserved');
  end if;
  insert into public.taste_reports (user_id, assessment_id, status, reserved_until)
    values (p_user_id, p_assessment_id, 'pending', now() + interval '5 minutes');
  return jsonb_build_object('state', 'reserved');
end;
$$;

create or replace function public.save_taste_report(p_user_id uuid, p_assessment_id uuid, p_content jsonb, p_generator text, p_generator_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.taste_reports
     set status = 'ready', content = p_content, generator = p_generator, generator_version = p_generator_version, reserved_until = null
   where user_id = p_user_id and assessment_id = p_assessment_id and status = 'pending';
  if not found then
    -- 예약이 만료돼 다른 요청이 이어받았거나 지워졌다 — 저장하지 않는다
    raise exception 'taste_not_reserved';
  end if;
end;
$$;

-- 글을 만들지 못했을 때: 예약을 풀어 다시 받을 수 있게 한다(받은 것으로 세지 않는다). 이미 완성된 줄은 건드리지 않는다
create or replace function public.release_taste_report(p_user_id uuid, p_assessment_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.taste_reports where user_id = p_user_id and assessment_id = p_assessment_id and status = 'pending'
$$;

revoke all on function public.reserve_taste_report(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_taste_report(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.release_taste_report(uuid, uuid) from public, anon, authenticated;

grant execute on function public.reserve_taste_report(uuid, uuid) to service_role;
grant execute on function public.save_taste_report(uuid, uuid, jsonb, text, text) to service_role;
grant execute on function public.release_taste_report(uuid, uuid) to service_role;

-- ─────────────────────────────────────────────
-- 회원 탈퇴 함수 갱신: 맛보기 리포트(AI가 쓴 글)도 지운다.
-- 주문이 있는 검사는 탈퇴 때 지워지지 않고 내용만 비워지므로(주문 · 결제 기록 보존), 외래 키 연쇄 삭제만으로는 글이 남을 수 있다.
-- 아래 함수는 14번(20261024000000_chat_summaries.sql)의 탈퇴 함수에 "맛보기 리포트 삭제" 한 단계와 결과의 taste_reports 개수만 더한 것이다.
-- ─────────────────────────────────────────────

create or replace function public.withdraw_member_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reports int := 0;
  v_deleted_assessments int := 0;
  v_scrubbed_assessments int := 0;
  v_contexts int := 0;
  v_concerns int := 0;
  v_feedback int := 0;
  v_regions int := 0;
  v_talks int := 0;
  v_questions int := 0;
  v_summaries int := 0;
  v_tastes int := 0;
begin
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'withdraw_not_found';
  end if;

  -- 진행 중인 결제 · 리포트 생성이 있으면 처리하지 않는다 (결제 확인이나 생성이 끝난 뒤에 다시)
  if exists (select 1 from public.orders where user_id = p_user_id and status = 'pending' and created_at > now() - interval '1 hour') then
    raise exception 'withdraw_blocked_pending_order';
  end if;
  if exists (select 1 from public.reports where user_id = p_user_id and status in ('queued', 'generating')) then
    raise exception 'withdraw_blocked_report_in_progress';
  end if;
  -- 남은 미유캐시가 있으면 처리하지 않는다 (다 쓰거나 환불 문의를 마친 뒤에 다시 — 정책 확정 전 초안, docs/cash-policy.md)
  if exists (select 1 from public.cash_wallets where user_id = p_user_id and balance > 0) then
    raise exception 'withdraw_blocked_cash_balance';
  end if;

  delete from public.report_feedback where user_id = p_user_id;
  get diagnostics v_feedback = row_count;

  delete from public.personal_contexts where user_id = p_user_id;
  get diagnostics v_contexts = row_count;

  -- 고민 기록(고객이 적은 내용) 삭제
  delete from public.concern_records where user_id = p_user_id;
  get diagnostics v_concerns = row_count;

  -- 대화(채팅방에 저장한 눌렀던 행동 · 자유 질문 · 미유의 답)와 질문 횟수 기록 삭제
  delete from public.talk_rooms where user_id = p_user_id;
  get diagnostics v_talks = row_count;
  delete from public.chat_questions where user_id = p_user_id;
  get diagnostics v_questions = row_count;

  -- 채팅 요약(직접 저장한 것 · 저장하지 않고 끝낸 대화의 참고 기록) 삭제
  delete from public.chat_summaries where user_id = p_user_id;
  get diagnostics v_summaries = row_count;

  -- 맛보기 리포트(AI가 쓴 글) 삭제 — 주문이 있는 검사는 지워지지 않고 비워지기만 하므로 여기서 직접 지운다
  delete from public.taste_reports where user_id = p_user_id;
  get diagnostics v_tastes = row_count;

  -- 리포트 내용 삭제 (주문은 남는다). 완성 리포트는 수정할 수 없지만 삭제는 회원 탈퇴 때만 이 함수로 한다
  delete from public.reports where user_id = p_user_id;
  get diagnostics v_reports = row_count;

  delete from public.user_regions where user_id = p_user_id;
  get diagnostics v_regions = row_count;

  -- 주문이 없는 검사는 통째로 삭제
  delete from public.assessments a
   where a.user_id = p_user_id
     and not exists (select 1 from public.orders o where o.assessment_id = a.id);
  get diagnostics v_deleted_assessments = row_count;

  -- 주문이 가리키는 검사는 내용을 비운다 (생년월일 · 응답 · 닉네임 · MBTI · 계산 결과 모두). 날짜 자리는 형식 검사를 맞추기 위한 빈 값(1900-01-01)이다
  update public.assessments
     set nickname = '탈퇴',
         birth_calendar = 'solar',
         birth_is_leap_month = false,
         birth_year = 1900, birth_month = 1, birth_day = 1,
         birth_time = null,
         known_mbti = null,
         answers = '{}'::jsonb,
         summary = '{}'::jsonb,
         saju = '{}'::jsonb,
         content_version = 'withdrawn',
         withdrawn_at = coalesce(withdrawn_at, now())
   where user_id = p_user_id and withdrawn_at is null;
  get diagnostics v_scrubbed_assessments = row_count;

  update public.profiles
     set nickname = null,
         withdrawn_at = coalesce(withdrawn_at, now())
   where id = p_user_id;

  return jsonb_build_object(
    'reports', v_reports,
    'assessments_deleted', v_deleted_assessments,
    'assessments_emptied', v_scrubbed_assessments,
    'personal_contexts', v_contexts,
    'concern_records', v_concerns,
    'feedback', v_feedback,
    'regions', v_regions,
    'talk_rooms', v_talks,
    'chat_questions', v_questions,
    'chat_summaries', v_summaries,
    'taste_reports', v_tastes
  );
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_member_data(uuid) to service_role;
