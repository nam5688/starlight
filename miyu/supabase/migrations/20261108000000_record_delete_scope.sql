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
