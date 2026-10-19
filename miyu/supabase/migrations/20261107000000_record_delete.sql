-- 리포트 기록 삭제(회원이 MY에서 직접) — 마이그레이션 28번. 로컬 시험 DB에서만 적용해 시험했고 외부(테스트 · 운영) DB에는 적용하지 않았다(운영자가 스키마 · 권한 · 데이터 영향을 검토한 뒤 적용).
-- 규칙: 더하기만 한다(기존 표 · 함수 · 마이그레이션은 바꾸지 않는다). 앞 번호 가운데 17번(맛보기 · 고민 기록 · 리포트 · 대화 · 질문권 표)까지만 있으면 적용된다 — 19~22번 · 25번 같은 다른 미적용 변경에 기대지 않고, 27번의 숨김 열 · 함수는 쓰지도 지우지도 않는다.
-- 이 파일을 실행하는 것만으로는 어떤 데이터도 지워지거나 바뀌지 않는다. 데이터는 회원이 MY에서 "기록 삭제"를 직접 확정했을 때, 아래 함수가 그 회원의 그 기록에 한해서만 처리한다.
--
-- 무엇이 지워지고 무엇이 남는가 (화면의 확인창 문구와 같다)
--   지운다(복구할 수 없다): 이 검사 결과로 받은 개인 통합 리포트 · 고민 반영 리포트의 본문(reports, 만족도 의견 report_feedback 포함) ·
--                          맛보기 리포트의 글(taste_reports의 content) · 고민 입력 기록(personal_contexts) · 고민 기록(concern_records) ·
--                          채팅 방의 "행동 목록"(talk_rooms.actions — 리포트 글을 다시 그리는 데만 쓰던 것. 대화 내용은 아래 읽기용 대화 기록으로 옮긴다)
--   남긴다: 계정 · 가입 동의 기록 · 주문 · 결제 · 환불 기록(결제 증빙) · 질문권(지갑 · 묶음 장부) · 채팅 질문 횟수(chat_questions) · 저장한 채팅 요약(chat_summaries) ·
--           궁합 리포트(사주 궁합 · 리포트 궁합은 별개 상품이라 지우지 않는다) · AI 사용 기록(ai_usage — 토큰 수뿐, 글 내용 없음) ·
--           대화를 이어 가는 데 쓰는 분석 원자료(assessments의 입력한 정보 · 응답 · 계산 결과 — 결과 화면 · 리포트로는 다시 보이지 않는다)
--   읽기용 대화 기록(새 표 talk_transcripts): 삭제 전에 채팅 방에 "이미 표시된" 말(내가 한 말 · 미유가 한 말)을 방마다 줄 단위 글로 옮겨 둔다. 리포트 전체 본문을 옮기는 것이 아니다 —
--           대화 중에 열어 본 부분만이고(열어 보지 않은 풀이는 들어 있지 않다), 새로 만든 글도 없다(AI를 부르지 않는다). 삭제한 기록의 채팅 방에서 이 글을 읽을 수 있다.
--   맛보기: 한 계정에 한 번(taste_reports의 user_id 기본 키). 줄은 지우지 않고 글(content)만 {"deleted": true}로 바꾼다 — 삭제해도 무료 한 번이 다시 생기지 않는다.
--
-- 삭제한 기록에는 아래 장치로 새 리포트 · 새 주문 · 맛보기 글이 생기거나 되살아나지 않는다(앱 코드도 먼저 막지만 DB가 마지막으로 보장한다)
--   · reports · orders에 새 줄을 넣을 때, taste_reports에 새 줄을 넣거나 고칠 때, 그 검사 결과가 삭제된 기록이면 거절한다(미유캐시 = 질문 결제 주문은 채팅이 계속되도록 허용한다).
--     늦게 도착한 생성 응답 · 재시도 · 직접 갱신도 같은 장치에 걸린다(맛보기는 삭제 뒤 예약 저장 함수도 pending 줄이 없어 저장되지 않는다).
--   · 삭제 함수는 그 검사 결과 행을 먼저 잠그므로(for update), 같은 순간에 들어오는 주문 · 리포트 저장은 삭제가 끝난 뒤 위 장치에 걸린다
--   · 진행 중인 생성(어느 상품이든) · 최근 1시간 안의 결제 대기 주문 · 아직 리포트 줄이 없는 결제 완료 궁합 주문 · 방금 오간 질문(30초) · 답을 기다리는 질문이 있으면 삭제하지 않고 'busy'로 돌려준다
--   · 대화방 저장이 삭제 직전 이후에 바뀌었으면(동시 대화) 'stale'로 돌려주고, 앱이 다시 읽어 새로 옮긴 뒤 다시 시도한다 — 오간 말이 읽기용 기록에서 빠지지 않는다
-- 코드를 먼저 배포해도 깨지지 않는다: 이 열이 없으면 MY는 삭제 버튼을 보이지 않고 모든 결과는 예전처럼 동작한다.

alter table public.assessments
  add column record_deleted_at timestamptz;

-- 회원 탈퇴(withdrawn_at)와 다른 열이다. 비어 있으면(null) 삭제하지 않은 기록이다. 기존 행은 모두 null이다.

-- 읽기용 대화 기록 ------------------------------------------------------------------------------------------------------------------------------------
-- lines: [{ "from": "me" | "miyu", "text": "…", "label"?: "…", "system"?: true }, …] — 삭제 전에 대화창에 이미 표시된 말을 앱이 줄 단위 글로 옮긴 것(그림 · 표는 글로만)
create table public.talk_transcripts (
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  room_key text not null check (room_key ~ '^[a-z]{3,12}(:[0-9]{4}-[0-9]{2}-[0-9]{2})?$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 500 and pg_column_size(lines) <= 262144),
  created_at timestamptz not null default now(),
  primary key (assessment_id, room_key)
);

create index talk_transcripts_user_idx on public.talk_transcripts (user_id);

-- 검사 결과의 주인과 같은 회원만 (서버 코드 실수로 다른 회원의 결과에 붙지 않게)
create or replace function public.talk_transcripts_owner_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.assessments a where a.id = new.assessment_id and a.user_id = new.user_id) then
    raise exception 'talk transcript owner mismatch';
  end if;
  return new;
end;
$$;

create trigger talk_transcripts_owner before insert on public.talk_transcripts
  for each row execute function public.talk_transcripts_owner_check();

alter table public.talk_transcripts enable row level security;

create policy "본인 읽기용 대화 기록 조회" on public.talk_transcripts
  for select to authenticated using (user_id = (select auth.uid()));

-- 실제 Supabase는 public의 새 표에 anon · authenticated · service_role의 기본 권한(모든 권한)을 자동으로 준다. 그래서 이 새 표에 한해서 PUBLIC과 서버 역할까지 먼저 모두 거둔 뒤 필요한 것만 다시 준다.
-- (기존 표의 권한과 기본 권한 설정은 바꾸지 않는다.) 회원은 본인 것을 읽기만, 서버는 읽기 · 쓰기(넣기)만 — 고치기 · 지우기 · 비우기는 누구에게도 주지 않는다(탈퇴 · 연쇄 삭제는 DB 안에서 처리한다).
revoke all on public.talk_transcripts from public, anon, authenticated, service_role;
grant select on public.talk_transcripts to authenticated;
grant select, insert on public.talk_transcripts to service_role;

-- 탈퇴하면 읽기용 대화 기록도 지운다 — 탈퇴 함수를 다시 바꾸지 않고 프로필의 탈퇴 표시에 반응한다(검사 결과 행은 주문 때문에 지워지지 않으므로 연쇄 삭제만으로는 남는다)
create or replace function public.talk_transcripts_on_withdraw()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    delete from public.talk_transcripts where user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_transcripts_withdraw after update of withdrawn_at on public.profiles
  for each row execute function public.talk_transcripts_on_withdraw();

-- 삭제한 기록에 리포트 · 주문 · 맛보기 줄이 생기거나 바뀌지 않게 하는 장치 -----------------------------------------------------------------------------------

create or replace function public.block_write_on_deleted_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted timestamptz;
begin
  -- 삭제 함수와 같은 행을 잠그는 읽기(for share) — 삭제가 진행 중이면 끝날 때까지 기다린 뒤 결과를 보고 판단한다 (잠금은 쓰기 권한이 필요해 정의자 권한으로 실행한다. 읽는 것은 삭제 시각 하나뿐이다)
  select a.record_deleted_at into v_deleted from public.assessments a where a.id = new.assessment_id for share;
  if v_deleted is not null then
    raise exception 'record_deleted';
  end if;
  return new;
end;
$$;

create trigger reports_block_deleted_record before insert on public.reports
  for each row execute function public.block_write_on_deleted_record();

-- 맛보기는 새 줄뿐 아니라 고치는 것도 막는다 — 삭제 뒤 늦게 도착한 생성 응답 · 재시도 · 직접 갱신으로 글이 되살아나지 않게 한다.
-- 삭제 함수 자신이 글을 비우는 갱신은 검사 결과에 삭제 표시를 하기 전(같은 트랜잭션)이라 이 장치에 걸리지 않는다.
create trigger taste_reports_block_deleted_record before insert or update on public.taste_reports
  for each row execute function public.block_write_on_deleted_record();

-- 주문은 미유캐시(질문 결제, 상품 번호가 cash-charge:로 시작)만 삭제한 기록에도 허용한다 — 채팅은 삭제한 기록에서도 이어지기 때문이다
create or replace function public.orders_block_deleted_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted timestamptz;
begin
  if new.product_id like 'cash-charge:%' then
    return new;
  end if;
  select a.record_deleted_at into v_deleted from public.assessments a where a.id = new.assessment_id for share;
  if v_deleted is not null then
    raise exception 'record_deleted';
  end if;
  return new;
end;
$$;

create trigger orders_block_deleted_record before insert on public.orders
  for each row execute function public.orders_block_deleted_record();

-- 트리거 함수는 누구도 직접 부를 수 없다(트리거가 켜질 때는 실행 권한이 필요 없다). 기존 표 · 함수의 권한은 바꾸지 않는다
revoke all on function public.talk_transcripts_owner_check() from public, anon, authenticated;
revoke all on function public.talk_transcripts_on_withdraw() from public, anon, authenticated;
revoke all on function public.block_write_on_deleted_record() from public, anon, authenticated;
revoke all on function public.orders_block_deleted_record() from public, anon, authenticated;

-- 본인 검사 결과의 리포트 기록을 삭제한다 ---------------------------------------------------------------------------------------------------------
--   p_transcripts: 앱이 삭제 전에 대화방마다 만든 읽기용 줄 — [{ "roomKey": "love", "updatedAt": "<그때 읽은 talk_rooms.updated_at 그대로>", "lines": [ … ] }, …]
--   반환: 'deleted'(이번에 삭제함) · 'unchanged'(이미 삭제한 기록) · 'busy'(진행 중인 결제 · 생성 · 질문이 있어 지금은 삭제하지 않음) ·
--         'stale'(앱이 대화를 읽은 뒤 대화방이 바뀌었다 — 삭제하지 않았고 앱이 다시 읽어 시도한다) · 'not_found'(없거나 본인 것이 아님 — 둘을 구분해 알리지 않는다)
--   같은 요청을 여러 번(동시에도) 보내도 한 번만 처리하고 나머지는 'unchanged'다. 한 번에 한 트랜잭션이라 중간까지만 처리된 상태가 남지 않는다.
create or replace function public.delete_assessment_record(p_user_id uuid, p_assessment_id uuid, p_transcripts jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assessments%rowtype;
  t record;
  lines_json jsonb;
  v_payload jsonb := coalesce(p_transcripts, '[]'::jsonb);
begin
  if p_user_id is null or p_assessment_id is null or jsonb_typeof(v_payload) <> 'array' then
    return 'not_found';
  end if;

  -- 검사 결과 행을 먼저 잠근다 — 같은 순간의 주문 · 리포트 저장 · 다른 삭제 요청은 이 줄 뒤로 줄을 선다
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

  -- 진행 중인 생성 · 결제 · 질문이 있으면 지금은 삭제하지 않는다 (15분 넘게 멈춘 생성은 진행 중으로 보지 않는다)
  -- 1) 생성 중인 리포트(개인 · 고민 · 궁합 모두) — 궁합의 진행 중 생성이 삭제와 부딪혀 사라지지 않게 지금은 기다린다
  if exists (
    select 1 from public.reports r
     where r.assessment_id = p_assessment_id
       and r.status in ('queued', 'generating')
       and r.updated_at > now() - interval '15 minutes'
  ) then
    return 'busy';
  end if;
  -- 2) 최근 1시간 안의 결제 대기 주문(질문 결제는 제외)
  if exists (
    select 1 from public.orders o
     where o.assessment_id = p_assessment_id
       and o.status = 'pending'
       and o.created_at > now() - interval '1 hour'
       and o.product_id not like 'cash-charge:%'
  ) then
    return 'busy';
  end if;
  -- 3) 결제는 끝났는데 아직 리포트 줄이 없는 궁합 주문 — 삭제 뒤에는 새 줄을 넣을 수 없으므로 줄이 생긴 뒤에 삭제한다
  if exists (
    select 1 from public.orders o
     where o.assessment_id = p_assessment_id
       and o.status = 'paid'
       and (o.product_id like 'saju-compat:%' or o.product_id like 'report-compat:%')
       and not exists (select 1 from public.reports r where r.order_id = o.id)
  ) then
    return 'busy';
  end if;
  -- 4) 맛보기를 쓰는 중
  if exists (
    select 1 from public.taste_reports tr
     where tr.assessment_id = p_assessment_id and tr.user_id = p_user_id and tr.status = 'pending' and tr.reserved_until > now()
  ) then
    return 'busy';
  end if;
  -- 5) 답을 기다리는 질문 · 방금(30초) 오간 질문 — 화면에 보인 답이 아직 대화방에 저장되기 전일 수 있다
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

  -- 대화방: 앱이 읽은 그대로인지 먼저 모두 확인하고(그 사이 바뀌었으면 아무것도 쓰지 않고 stale), 그다음 읽기용 대화 기록을 저장한 뒤 행동 목록 줄을 정리한다.
  -- 방 줄을 잠그므로 이 확인과 정리 사이에 대화가 저장될 수 없다. 방이 새로 생겼거나 방의 저장 시각이 다르면 앱이 옮기지 못한 말이 있다는 뜻이다.
  for t in select room_key, updated_at from public.talk_rooms where assessment_id = p_assessment_id order by room_key for update loop
    if not exists (
      select 1 from jsonb_array_elements(v_payload) v
       where v ->> 'roomKey' = t.room_key and (v ->> 'updatedAt')::timestamptz = t.updated_at
    ) then
      return 'stale';
    end if;
  end loop;
  for t in select room_key, updated_at from public.talk_rooms where assessment_id = p_assessment_id order by room_key loop
    select v -> 'lines' into lines_json
      from jsonb_array_elements(v_payload) v
     where v ->> 'roomKey' = t.room_key and (v ->> 'updatedAt')::timestamptz = t.updated_at
     limit 1;
    if jsonb_typeof(lines_json) = 'array' and jsonb_array_length(lines_json) > 0 then
      insert into public.talk_transcripts (assessment_id, room_key, user_id, lines)
        values (p_assessment_id, t.room_key, p_user_id, lines_json);
    end if;
  end loop;
  delete from public.talk_rooms where assessment_id = p_assessment_id;

  -- 리포트 본문 삭제(주문은 남는다). 이 검사 결과의 개인 통합 리포트 · 고민 반영 리포트만 — 사주 궁합 · 리포트 궁합은 별개 상품이라 남긴다. 만족도 의견은 함께 지워진다(연쇄 삭제)
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

  update public.assessments set record_deleted_at = now() where id = p_assessment_id;
  return 'deleted';
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.delete_assessment_record(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.delete_assessment_record(uuid, uuid, jsonb) to service_role;
