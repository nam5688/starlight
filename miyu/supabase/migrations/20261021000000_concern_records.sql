-- ME:U(미유) 11번째 마이그레이션 — 고민 기록 (내 고민 자세히 알려주기 → 새 리포트 발급 시 "그때의 고민" 저장본)
-- 앞의 파일들(1~10번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 표와 함수를 "더하기만" 한다. 기존 검사 · 회원 · 주문 · 결제 · 리포트 데이터는 이 파일을 실행하는 것만으로는 바뀌거나 지워지지 않는다.
-- (탈퇴 함수는 같은 이름으로 다시 정의해 "고민 기록 삭제"를 더한다 — 함수 내용만 바뀌고 데이터는 건드리지 않는다.)
--
-- 고민 기록이 하는 일
--  - 고객이 적어 둔 현재 고민(personal_contexts)은 언제든 고칠 수 있다. 새 리포트를 발급하는 순간, 그때의 고민을 이 표에 한 건 복사해 둔다.
--  - 기록은 만든 뒤 고치지 않는다. 그래서 이후에 고민을 고쳐도 이미 발급한 리포트가 근거로 삼은 고민(내용 · 작성 시점)은 그대로 남는다.
--  - 고객이 직접 "내용 지우기"를 할 수 있다 — 글만 비우고 기록 자리 · 주제 · 작성 시점 · 지운 시각은 남는다 (이것만 허용한다).
--  - 새 리포트(별도 주문 · 별도 리포트)는 상품 번호 'concern-report:<기록 번호>'로 이 기록에 묶는다. 같은 기록에는 결제 완료 · 결제 대기 주문이 하나뿐이다
--    (기존 주문 고유 조건: 검사 결과 + 상품 번호). 그래서 같은 고민으로 두 번 눌러도 한 건만 발급된다.
--  - 브라우저는 본인 것 조회만, 쓰기는 서버가 소유자를 확인한 뒤에.

create table public.concern_records (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null check (topic in ('love', 'marriage', 'relationship', 'work', 'money', 'self', 'other')),
  question text not null default '' check (char_length(question) <= 300),
  situation text not null default '' check (char_length(situation) <= 300),
  matched text not null default '' check (char_length(matched) <= 300),
  differed text not null default '' check (char_length(differed) <= 300),
  excerpt text not null default '' check (char_length(excerpt) <= 1500),
  -- 이 고민을 마지막으로 쓰거나 고친 시점 (현재 고민의 수정 시각) / 리포트 해석에 쓰는 데 동의한 시각
  written_at timestamptz not null,
  agreed_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- 고객이 내용을 지운 시각 (지우지 않았으면 비어 있다)
  scrubbed_at timestamptz,
  check (scrubbed_at is null or (question = '' and situation = '' and matched = '' and differed = '' and excerpt = ''))
);

create index concern_records_assessment_idx on public.concern_records (assessment_id, created_at desc);
create index concern_records_user_idx on public.concern_records (user_id, created_at desc);

-- 같은 검사 결과의 같은 작성 시점(저장본)에는 (내용을 지운 기록을 빼고) 기록이 하나 — 동시에 두 번 눌러도 기록이 하나만 생긴다
create unique index concern_records_one_version on public.concern_records (assessment_id, written_at) where scrubbed_at is null;

-- 검사 결과의 주인과 같은 회원만 (서버 코드 실수로 다른 회원의 결과에 붙지 않게)
create or replace function public.concern_records_owner_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.assessments a where a.id = new.assessment_id and a.user_id = new.user_id
  ) then
    raise exception 'concern record owner mismatch';
  end if;
  return new;
end;
$$;

create trigger concern_records_owner before insert on public.concern_records
  for each row execute function public.concern_records_owner_check();

-- 기록은 고치지 않는다 — 허용하는 변경은 "내용 지우기"(글을 모두 비우고 지운 시각을 적기) 하나뿐이다
create or replace function public.concern_records_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.assessment_id is distinct from old.assessment_id
     or new.user_id is distinct from old.user_id
     or new.topic is distinct from old.topic
     or new.written_at is distinct from old.written_at
     or new.agreed_at is distinct from old.agreed_at
     or new.created_at is distinct from old.created_at then
    raise exception 'concern record is immutable';
  end if;
  if old.scrubbed_at is not null then
    -- 이미 지운 기록은 더 바뀌지 않는다
    if new.scrubbed_at is distinct from old.scrubbed_at
       or new.question <> '' or new.situation <> '' or new.matched <> '' or new.differed <> '' or new.excerpt <> '' then
      raise exception 'scrubbed concern record is immutable';
    end if;
    return new;
  end if;
  if new.scrubbed_at is null then
    -- 지우는 것이 아니면 글도 바꿀 수 없다
    if new.question is distinct from old.question
       or new.situation is distinct from old.situation
       or new.matched is distinct from old.matched
       or new.differed is distinct from old.differed
       or new.excerpt is distinct from old.excerpt then
      raise exception 'concern record is immutable';
    end if;
  end if;
  return new;
end;
$$;

create trigger concern_records_guard before update on public.concern_records
  for each row execute function public.concern_records_guard();

alter table public.concern_records enable row level security;

create policy "본인 고민 기록 조회" on public.concern_records
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.concern_records from anon, authenticated;
revoke select on public.concern_records from anon;

-- 필요한 권한은 직접 준다: 브라우저는 조회, 서버는 조회 · 저장 · 내용 지우기(수정). 삭제는 탈퇴 함수만 한다
grant select on public.concern_records to authenticated;
grant select, insert, update on public.concern_records to service_role;

-- ─────────────────────────────────────────────
-- 회원 탈퇴 함수 갱신 — 고민 기록(고객이 적은 내용)도 함께 삭제한다. 나머지는 10번 파일과 같다.
-- 주문 · 결제 기록은 그대로 남는다 (고민 기록이 없어져도 주문은 상품 번호만 가진다).
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

  delete from public.report_feedback where user_id = p_user_id;
  get diagnostics v_feedback = row_count;

  delete from public.personal_contexts where user_id = p_user_id;
  get diagnostics v_contexts = row_count;

  -- 고민 기록(고객이 적은 내용) 삭제
  delete from public.concern_records where user_id = p_user_id;
  get diagnostics v_concerns = row_count;

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
    'regions', v_regions
  );
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_member_data(uuid) to service_role;
