-- ME:U(미유) 22번째 마이그레이션 — 혜택 시스템의 마무리: 원가 측정(ai_usage 열) · 비용 입력(광고비 · 고정비) · 탈퇴 시 혜택 정리.
-- 앞의 파일들(1~21번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다.
--
-- ⚠️ 개발 · 테스트 환경에서만 적용해 확인했다. 운영 DB에는 아직 적용하지 않았고, 운영자가 별도로 승인한 뒤에 적용한다.
--
-- 더하기만 한다(열 추가 · 표 추가 · 탈퇴 함수 갱신). 기존 데이터는 바뀌거나 지워지지 않는다.
--
-- 1) ai_usage에 질문 한 번의 원가를 읽을 수 있는 열을 더한다: 어느 기능의 호출인지(purpose) · 어떤 질문권으로 물었는지(credit_source) · 방(room_key) ·
--    한 질문(요청)의 첫 호출 + 재작성 호출을 묶는 번호(request_key). 이 열이 비어 있는 예전 기록은 "분류 안 됨"으로 센다. 질문 · 답 내용은 담지 않는다.
--    질문 1회당 평균 · 95백분위 · 재시도 원가를 임의의 값(예: 30원)으로 정하지 않고 이 기록에서 직접 계산한다.
-- 2) benefit_expenses: 광고비 · 고정비 입력(관리자가 직접 입력). 수익 화면의 손익 계산에 쓴다. 금액과 메모뿐이며 개인정보는 없다.
-- 3) 탈퇴(withdraw_member_data) 갱신 — 운영자 결정 2026-10-17(⑷): 남은 무상 혜택의 이용을 종료한다(잔액 때문에 탈퇴를 막지 않는다). 개인 분석 · 응답은 삭제하고,
--    혜택 장부(금액 · 주문번호 · 회원번호뿐)는 거래 · 정산 기록이라 분리해 남기되 추천 링크 · 방문 기록 · 위험 신호 세부는 지운다. 장부를 얼마나 오래 보관할지는 법률 검토로 정하며,
--    그때까지는 정리하지 않는다(설정 benefit.withdrawn_ledger_retention_days가 null — purge_withdrawn_benefit_ledgers가 정해진 일수가 지난 탈퇴 회원의 장부를 지운다).
--    질문 3개 묶음(유료)의 남은 질문이 있으면 탈퇴를 막는 기존 동작은 바꾸지 않는다(별도 정책안 결정 대기 — 무상 혜택과 유료는 다르다).

alter table public.ai_usage add column if not exists purpose text check (purpose is null or purpose in ('report', 'chat', 'taste', 'compat', 'other'));
alter table public.ai_usage add column if not exists credit_source text check (credit_source is null or credit_source in ('free', 'reward', 'paid'));
alter table public.ai_usage add column if not exists room_key text check (room_key is null or char_length(room_key) <= 40);
alter table public.ai_usage add column if not exists request_key text check (request_key is null or char_length(request_key) <= 80);

create index if not exists ai_usage_request_idx on public.ai_usage (request_key) where request_key is not null;
create index if not exists ai_usage_purpose_idx on public.ai_usage (purpose, created_at desc);

create table public.benefit_expenses (
  id bigint generated always as identity primary key,
  month date not null check (month = date_trunc('month', month)::date),
  kind text not null check (kind in ('ad', 'fixed', 'other')),
  amount_krw integer not null check (amount_krw >= 0),
  memo text check (memo is null or char_length(memo) <= 120),
  entered_by uuid,
  created_at timestamptz not null default now()
);

create index benefit_expenses_month_idx on public.benefit_expenses (month desc, kind);

alter table public.benefit_expenses enable row level security;
revoke all on public.benefit_expenses from anon, authenticated;
grant select, insert, update, delete on public.benefit_expenses to service_role;
grant usage, select on sequence public.benefit_expenses_id_seq to service_role;

-- 탈퇴 회원의 혜택 장부 정리(법률 검토로 보관 일수를 정한 뒤 설정으로 켠다). 정해진 일수가 지난 탈퇴 회원의 포인트 · 질문권 장부를 지운다. 지운 줄 수를 돌려준다
create or replace function public.purge_withdrawn_benefit_ledgers()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := public.benefit_int('benefit.withdrawn_ledger_retention_days', 0);
  v_pl integer := 0;
  v_cl integer := 0;
  v_pr integer := 0;
  v_cr integer := 0;
  v_ops integer := 0;
  v_users uuid[];
begin
  if v_days <= 0 then return jsonb_build_object('status', 'off'); end if;
  select array_agg(id) into v_users from public.profiles where withdrawn_at is not null and withdrawn_at < now() - make_interval(days => v_days);
  if v_users is null then return jsonb_build_object('status', 'none'); end if;
  perform set_config('miyu.benefit_maintenance', 'on', true);
  delete from public.point_ledger where user_id = any (v_users);
  get diagnostics v_pl = row_count;
  delete from public.credit_ledger where user_id = any (v_users);
  get diagnostics v_cl = row_count;
  delete from public.point_lots where user_id = any (v_users);
  get diagnostics v_pr = row_count;
  delete from public.credit_lots where user_id = any (v_users);
  get diagnostics v_cr = row_count;
  delete from public.benefit_ops where user_id = any (v_users);
  get diagnostics v_ops = row_count;
  return jsonb_build_object('status', 'purged', 'pointLedger', v_pl, 'creditLedger', v_cl, 'pointLots', v_pr, 'creditLots', v_cr, 'ops', v_ops);
end;
$$;

-- 탈퇴 시 혜택 정리: 남은 포인트 · 질문권은 소멸 처리(장부에 남긴다), 추천 링크 · 방문 기록 · 위험 신호 세부는 지운다
create or replace function public.forfeit_member_benefits(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_pts integer := 0;
  v_cr integer := 0;
  v_links integer := 0;
  v_signups integer := 0;
begin
  perform public.benefit_lock(p_user);
  for r in select id, remaining from public.point_lots where user_id = p_user and remaining > 0 loop
    if public.benefit_claim_op('point-forfeit:' || r.id::text, p_user, 'point-forfeit') then
      update public.point_lots set remaining = 0 where id = r.id;
      insert into public.point_ledger (user_id, kind, amount, lot_id, op_key) values (p_user, 'forfeit', -r.remaining, r.id, 'point-forfeit:' || r.id::text);
      v_pts := v_pts + r.remaining;
    end if;
  end loop;
  for r in select id, remaining from public.credit_lots where user_id = p_user and remaining > 0 loop
    if public.benefit_claim_op('credit-forfeit:' || r.id::text, p_user, 'credit-forfeit') then
      update public.credit_lots set remaining = 0 where id = r.id;
      insert into public.credit_ledger (user_id, kind, qty, lot_id, op_key) values (p_user, 'forfeit', -r.remaining, r.id, 'credit-forfeit:' || r.id::text);
      v_cr := v_cr + r.remaining;
    end if;
  end loop;
  -- 쿠폰: 결제 대기 주문에 잡아 둔 자리는 놓는다(사용한 기록은 주문처럼 남는다)
  update public.coupon_redemptions set status = 'released' where user_id = p_user and status = 'reserved';
  -- 추천: 링크 · 방문 기록 · 위험 신호 세부(익명 방문 번호)는 지운다. 추천 가입 기록은 상태와 회원번호 · 시각만 남기고 방문 번호 · 위험 신호는 비운다
  delete from public.referral_links where user_id = p_user;
  get diagnostics v_links = row_count;
  update public.referral_signups set anon_id = null, risk = '[]'::jsonb where invitee_user_id = p_user or inviter_user_id = p_user;
  get diagnostics v_signups = row_count;
  return jsonb_build_object('forfeitedPoints', v_pts, 'forfeitedCredits', v_cr, 'referralLinks', v_links, 'referralSignupsScrubbed', v_signups);
end;
$$;

-- 탈퇴 함수 갱신: 21번까지의 탈퇴 함수(20261028000000_invites.sql)에 "혜택 정리" 한 단계와 결과의 benefits 항목만 더한 것이다
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
  v_invites int := 0;
  v_benefits jsonb;
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
  -- 결제해 두고 쓰지 않은 질문(유료 장부)이 남아 있으면 처리하지 않는다 (정책 확정 전 임시 — 무상 혜택은 탈퇴를 막지 않는다)
  if exists (select 1 from public.cash_wallets where user_id = p_user_id and balance > 0) then
    raise exception 'withdraw_blocked_cash_balance';
  end if;

  delete from public.report_feedback where user_id = p_user_id;
  get diagnostics v_feedback = row_count;

  delete from public.personal_contexts where user_id = p_user_id;
  get diagnostics v_contexts = row_count;

  delete from public.concern_records where user_id = p_user_id;
  get diagnostics v_concerns = row_count;

  delete from public.talk_rooms where user_id = p_user_id;
  get diagnostics v_talks = row_count;
  delete from public.chat_questions where user_id = p_user_id;
  get diagnostics v_questions = row_count;

  delete from public.chat_summaries where user_id = p_user_id;
  get diagnostics v_summaries = row_count;

  delete from public.taste_reports where user_id = p_user_id;
  get diagnostics v_tastes = row_count;

  delete from public.invites where inviter_user_id = p_user_id;
  get diagnostics v_invites = row_count;

  -- 남은 무상 혜택(포인트 · 질문권)은 소멸 처리하고 추천 링크 · 방문 기록 · 위험 신호 세부를 지운다
  v_benefits := public.forfeit_member_benefits(p_user_id);

  delete from public.reports where user_id = p_user_id;
  get diagnostics v_reports = row_count;

  delete from public.user_regions where user_id = p_user_id;
  get diagnostics v_regions = row_count;

  delete from public.assessments a
   where a.user_id = p_user_id
     and not exists (select 1 from public.orders o where o.assessment_id = a.id);
  get diagnostics v_deleted_assessments = row_count;

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
    'taste_reports', v_tastes,
    'invites', v_invites,
    'benefits', v_benefits
  );
end;
$$;

revoke all on function public.purge_withdrawn_benefit_ledgers() from public, anon, authenticated;
revoke all on function public.forfeit_member_benefits(uuid) from public, anon, authenticated;
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.purge_withdrawn_benefit_ledgers() to service_role;
grant execute on function public.forfeit_member_benefits(uuid) to service_role;
grant execute on function public.withdraw_member_data(uuid) to service_role;
