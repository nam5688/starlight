-- ME:U(미유) 10번째 마이그레이션 — 회원 탈퇴 (개인정보 삭제 + 거래 기록 분리 보관)
-- 앞의 파일들을 실행한 뒤 SQL Editor에서 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 표와 함수를 "더하기만" 한다. 기존 검사 · 회원 · 주문 · 결제 기록은 이 파일을 실행하는 것만으로는 바뀌거나 지워지지 않는다.
-- 데이터는 회원이 직접 탈퇴를 확정했을 때에만, 아래 함수가 그 회원의 것에 한해 처리한다.
--
-- 탈퇴 시 처리 (정책 확정 전 초안 — docs/withdrawal-policy.md):
--   삭제: 검사 결과(기본 정보 · 응답 · 사주 계산 결과) · 구매한 리포트 내용 · 나를 더 반영하기 입력 · 만족도 · 거주 지역 · 닉네임
--   보관: 주문 · 결제 기록(주문번호 · 금액 · 결제 시각 · 결제 승인 / 취소 기록), 가입 동의 기록. 이름 · 생년월일 · 응답 등은 남기지 않는다.
--         주문이 가리키는 검사 행은 지우지 않고 내용을 비운 빈 껍데기로 남긴다 (주문이 검사를 참조하는 관계를 유지하기 위해).
--   로그인 연결(카카오 식별 정보)은 서버가 Supabase Auth의 "탈퇴 처리"로 따로 지운다 (이 함수는 DB 표만 다룬다).

alter table public.profiles    add column if not exists withdrawn_at timestamptz;
alter table public.assessments add column if not exists withdrawn_at timestamptz;

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
    'feedback', v_feedback,
    'regions', v_regions
  );
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_member_data(uuid) to service_role;
