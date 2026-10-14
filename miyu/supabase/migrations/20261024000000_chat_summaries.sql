-- ME:U(미유) 14번째 마이그레이션 — 채팅 요약 저장
-- 앞의 파일들(1~13번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 표 · 열 · 함수를 "더하기만" 한다. 기존 검사 · 회원 · 주문 · 결제 · 리포트 · 고민 · 대화 · 미유캐시 데이터는 이 파일을 실행하는 것만으로는 바뀌거나 지워지지 않는다.
-- (탈퇴 함수는 같은 이름으로 다시 정의해 "채팅 요약 삭제"를 더한다 — 함수 내용만 바뀌고 데이터는 건드리지 않는다.)
--
-- 하는 일
--  - chat_summaries: 채팅방에서 [저장하기]를 누르거나 대화를 끝낼 때 "그때까지 나눈 질문과 답"을 짧게 요약한 줄을 남긴다.
--    visible = true  → 회원이 직접 저장한 요약. MY의 "저장한 채팅 요약 보기"에서 본인만 볼 수 있다.
--    visible = false → 저장하지 않고 끝낸 대화의 참고 기록. 회원 화면에는 보이지 않고(브라우저는 읽을 수 없다), 다음 질문에서 AI가 이전 이야기를 참고하는 데만 쓴다.
--                      회원은 MY에서 "이전 대화 기록 모두 지우기"로 지울 수 있고, 탈퇴하면 함께 삭제된다. 보관 기간 · 방식은 초안이다 — docs/withdrawal-policy.md의 결정 항목.
--    요약에는 리포트 글을 옮겨 담지 않는다: 읽은 풀이의 이름표 · 먼저 묻는 질문에 고른 답 · 내 경험 답장 · 직접 적은 질문과 답의 앞부분만 담는다.
--  - talk_rooms.saved_upto: 이 방의 행동 목록에서 어디까지 요약했는지. 다음 저장은 여기부터 새로 요약한다(저장마다 "이전 저장 이후의 대화"를 담는다). 방을 끝내면(방 줄이 지워지면) 처음부터 다시 센다.
--  - 브라우저는 본인이 저장한(visible) 요약 조회만, 쓰기 · 지우기는 서버가 소유자를 확인한 뒤에.

alter table public.talk_rooms
  add column if not exists saved_upto int not null default 0 check (saved_upto >= 0 and saved_upto <= 200);

create table public.chat_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  -- 방 이름(오늘의 한 장 방도 날짜 없이 daily 로 묶는다)
  room text not null check (room ~ '^[a-z]{3,12}$'),
  visible boolean not null,
  -- { read: [읽은 풀이 이름표...], qa: [{ q, a }...] } — 짧게 줄인 글만. 크기를 제한한다
  items jsonb not null check (jsonb_typeof(items) = 'object' and pg_column_size(items) <= 32768),
  created_at timestamptz not null default now()
);

create index chat_summaries_user_idx on public.chat_summaries (user_id, visible, created_at desc);
create index chat_summaries_room_idx on public.chat_summaries (assessment_id, room, created_at desc);

-- 검사 결과의 주인과 같은 회원만 (서버 코드 실수로 다른 회원의 결과에 붙지 않게)
create or replace function public.chat_summaries_owner_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.assessments a where a.id = new.assessment_id and a.user_id = new.user_id
  ) then
    raise exception 'chat summary owner mismatch';
  end if;
  return new;
end;
$$;

create trigger chat_summaries_owner before insert on public.chat_summaries
  for each row execute function public.chat_summaries_owner_check();

alter table public.chat_summaries enable row level security;

-- 회원이 직접 저장한 요약만 본인이 읽는다. 저장하지 않고 끝낸 참고 기록(visible = false)은 브라우저가 읽을 수 없다
create policy "본인이 저장한 채팅 요약 조회" on public.chat_summaries
  for select to authenticated using (user_id = (select auth.uid()) and visible);

revoke all on public.chat_summaries from anon, authenticated;
grant select on public.chat_summaries to authenticated;
-- 요약은 만든 뒤 고치지 않는다 (insert · select · delete만)
grant select, insert, delete on public.chat_summaries to service_role;

-- ─────────────────────────────────────────────
-- 회원 탈퇴 함수 갱신 — 채팅 요약(저장한 것 · 참고 기록 모두)도 함께 삭제한다. 나머지는 13번 파일과 같다.
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
    'chat_summaries', v_summaries
  );
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_member_data(uuid) to service_role;
