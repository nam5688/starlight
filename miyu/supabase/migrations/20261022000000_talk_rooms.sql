-- ME:U(미유) 12번째 마이그레이션 — 대화(상담방) 저장 · 자유 질문 횟수
-- 앞의 파일들(1~11번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 표와 함수를 "더하기만" 한다. 기존 검사 · 회원 · 주문 · 결제 · 리포트 · 고민 데이터는 이 파일을 실행하는 것만으로는 바뀌거나 지워지지 않는다.
-- (탈퇴 함수는 같은 이름으로 다시 정의해 "대화 삭제"를 더한다 — 함수 내용만 바뀌고 데이터는 건드리지 않는다.)
--
-- 하는 일
--  - talk_rooms: 로그인한 회원의 채팅방(상담 모드)마다 "눌렀던 행동 목록과 자유 질문 · 미유의 답"을 한 줄로 저장한다. 그래서 폰을 바꾸거나 다른 브라우저로 들어와도 대화가 이어진다.
--    리포트의 글(풀이)은 저장하지 않는다 — 풀이는 저장된 리포트에서 다시 만든다. 회원은 방마다 "새로 시작하기"로 지울 수 있고, 탈퇴하면 함께 삭제된다.
--  - chat_questions: 자유 질문을 한 번 보낼 때마다 "누가 · 언제 · 어느 방"만 한 줄 남긴다(질문 내용은 담지 않는다). 하루 질문 횟수 한도를 세는 데만 쓴다.
--  - 브라우저는 본인 대화 조회만, 쓰기는 서버가 소유자를 확인한 뒤에. 질문 횟수 표는 브라우저가 읽을 수 없다.
--  - 보관 기간은 초안이다: 회원이 지우거나 탈퇴할 때까지(오늘의 한 장 방은 저장 때 지난 날짜를 함께 지운다). 확정 전에는 docs/withdrawal-policy.md의 결정 항목으로 둔다.

create table public.talk_rooms (
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  -- 방 이름. 오늘의 한 장 방은 날짜별로 나눠 daily:YYYY-MM-DD 로 저장한다
  room_key text not null check (room_key ~ '^[a-z]{3,12}(:[0-9]{4}-[0-9]{2}-[0-9]{2})?$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 눌렀던 행동 목록 + 자유 질문 · 답 (최대 200개). 리포트 글은 담지 않는다
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) <= 200 and pg_column_size(actions) <= 262144),
  version int not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (assessment_id, room_key)
);

create index talk_rooms_user_idx on public.talk_rooms (user_id, updated_at desc);

-- 검사 결과의 주인과 같은 회원만 (서버 코드 실수로 다른 회원의 결과에 붙지 않게)
create or replace function public.talk_rooms_owner_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.assessments a where a.id = new.assessment_id and a.user_id = new.user_id
  ) then
    raise exception 'talk room owner mismatch';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger talk_rooms_owner before insert or update on public.talk_rooms
  for each row execute function public.talk_rooms_owner_check();

alter table public.talk_rooms enable row level security;

create policy "본인 대화 조회" on public.talk_rooms
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.talk_rooms from anon, authenticated;
revoke select on public.talk_rooms from anon;
grant select on public.talk_rooms to authenticated;
grant select, insert, update, delete on public.talk_rooms to service_role;

-- 자유 질문 횟수 — 질문 내용은 담지 않는다
create table public.chat_questions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  room_key text not null check (room_key ~ '^[a-z]{3,12}(:[0-9]{4}-[0-9]{2}-[0-9]{2})?$'),
  created_at timestamptz not null default now()
);

create index chat_questions_user_idx on public.chat_questions (user_id, created_at desc);

alter table public.chat_questions enable row level security;
revoke all on public.chat_questions from anon, authenticated;
grant select, insert, delete on public.chat_questions to service_role;
grant usage, select on sequence public.chat_questions_id_seq to service_role;

-- ─────────────────────────────────────────────
-- 회원 탈퇴 함수 갱신 — 대화(채팅방 저장)와 질문 횟수 기록도 함께 삭제한다. 나머지는 11번 파일과 같다.
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

  -- 대화(채팅방에 저장한 눌렀던 행동 · 자유 질문 · 미유의 답)와 질문 횟수 기록 삭제
  delete from public.talk_rooms where user_id = p_user_id;
  get diagnostics v_talks = row_count;
  delete from public.chat_questions where user_id = p_user_id;
  get diagnostics v_questions = row_count;

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
    'chat_questions', v_questions
  );
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_member_data(uuid) to service_role;
