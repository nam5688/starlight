-- ME:U(미유) 21번째 마이그레이션 — 친구 추천(새 정책): 추천 링크 · 추천 가입 검증 후 500P · 친구 첫 구매 6,900원 · 첫 구매 시 양쪽 질문권.
-- 앞의 파일들(1~20번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다.
--
-- ⚠️ 개발 · 테스트 환경에서만 적용해 확인했다. 운영 DB에는 아직 적용하지 않았고, 운영자가 별도로 승인한 뒤에 적용한다.
--
-- 기존 초대 링크 · 초대 할인(18번: 5,900원 · 한 명당 3명)은 **고치지 않는다.** 새 추천은 별도 표 · 함수로 더하고, 앱이 설정 feature.referral이 켜져 있을 때만 새 경로를 쓴다
-- (꺼져 있으면 기존 초대 할인 그대로 동작한다). 이미 받은 초대 할인 기록 · 주문 · 질문권 · 권한은 그대로다.
--
-- 운영자 결정(2026-10-17, D14 + 6가지 정책):
--  - 추천 링크: 가입 회원 누구나, 초대 인원 제한 없음.
--  - 추천 가입 보상 500P는 **가입 즉시 확정하지 않는다.** 확정 조건: 계정 확인 → 무료 분석 1회 정상 완료 → (보류 시간 지남 · 중복 · 부정 가입 검사 통과) → 추천인 500P 지급.
--    위험 신호가 있거나 한도(추천인별 하루 확정 수)를 넘으면 지급하지 않고 관리자 확인 대기(review)로 올린다. 무료 분석을 끝낸 가짜 계정까지 막는다는 뜻은 아니며 중복 · 패턴 · 한도 · 이상 징후는 별도로 지켜본다.
--  - 친구 첫 구매: 추천으로 가입한 회원이 개인 심층 리포트를 처음 살 때 6,900원(정가 9,900원). 첫 구매 1회(환불해도 다시 할인받지 못한다).
--  - 첫 구매 보상: 정상 결제가 확인되면 추천인 · 구매자 각각 질문권 1개(주문당 한 번). 환불되면 미사용분만 회수하고 이미 쓴 몫은 shortfall로 남긴다.
--  - 모든 보상은 설정(feature.referral_signup_points · feature.referral_purchase_credits)으로 관리자가 중지할 수 있다.

create table public.referral_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{24}$'),
  created_at timestamptz not null default now(),
  deactivated_at timestamptz
);

-- 링크 방문 측정(익명 방문 번호만 — 회원번호 · 이름 · 생년월일 없음). 90일 뒤 정리한다
create table public.referral_visits (
  id bigint generated always as identity primary key,
  token text not null,
  anon_id text not null check (char_length(anon_id) between 8 and 64),
  created_at timestamptz not null default now()
);

create index referral_visits_token_idx on public.referral_visits (token, created_at desc);
create index referral_visits_anon_idx on public.referral_visits (anon_id, token);

-- 신규 회원 한 명의 추천인은 한 명(평생 한 줄)
create table public.referral_signups (
  invitee_user_id uuid primary key references auth.users (id) on delete cascade,
  inviter_user_id uuid not null references auth.users (id) on delete restrict,
  link_token text not null,
  anon_id text check (anon_id is null or char_length(anon_id) between 8 and 64),
  -- pending: 검증 대기 · review: 위험 신호 · 한도 초과로 관리자 확인 대기 · confirmed: 500P 지급 확정 · rejected: 지급하지 않기로 함 · revoked: 확정 뒤 부정이 확인되어 회수
  status text not null default 'pending' check (status in ('pending', 'review', 'confirmed', 'rejected', 'revoked')),
  risk jsonb not null default '[]'::jsonb,
  signed_up_at timestamptz not null default now(),
  hold_until timestamptz not null,
  decided_at timestamptz,
  decided_by uuid,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 200),
  constraint referral_signups_not_self check (invitee_user_id <> inviter_user_id)
);

create index referral_signups_inviter_idx on public.referral_signups (inviter_user_id, status);
create index referral_signups_status_idx on public.referral_signups (status, hold_until);

-- 추천받은 친구의 첫 심층 리포트 구매 추적(첫 구매 1회)
create table public.referral_first_purchases (
  invitee_user_id uuid primary key references public.referral_signups (invitee_user_id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete restrict,
  -- pending: 결제 전 · confirmed: 결제 확인 · held: 추천 가입이 관리자 확인 대기라 질문권 보류 · void: 결제 실패 · 취소(다시 할인 가능) · revoked: 환불됨 · 보상 대상 아님(다시 할인받지 못한다)
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'held', 'void', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger referral_first_purchases_updated_at before update on public.referral_first_purchases
  for each row execute function public.set_updated_at();

alter table public.referral_links enable row level security;
alter table public.referral_visits enable row level security;
alter table public.referral_signups enable row level security;
alter table public.referral_first_purchases enable row level security;
-- 추천인은 자기 링크만 읽는다. 다른 표는 서버만 쓰고 읽는다(다른 사람의 이름 · 결과는 보이지 않는다)
create policy "본인 추천 링크 조회" on public.referral_links for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.referral_links, public.referral_visits, public.referral_signups, public.referral_first_purchases from anon, authenticated;
grant select on public.referral_links to authenticated;
grant select, insert, update, delete on public.referral_links, public.referral_visits, public.referral_signups, public.referral_first_purchases to service_role;
grant usage, select on sequence public.referral_visits_id_seq to service_role;

-- 이 회원의 추천 링크(없으면 만든다). 같은 회원은 언제나 같은 링크를 받는다
create or replace function public.ensure_referral_link(p_user uuid, p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  perform public.benefit_lock(p_user);
  insert into public.referral_links (user_id, token) values (p_user, p_token) on conflict (user_id) do nothing;
  select token into v_token from public.referral_links where user_id = p_user;
  return v_token;
end;
$$;

create or replace function public.log_referral_visit(p_token text, p_anon text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_anon is null or char_length(p_anon) < 8 then return; end if;
  if exists (select 1 from public.referral_links where token = p_token and deactivated_at is null) then
    insert into public.referral_visits (token, anon_id) values (p_token, left(p_anon, 64));
  end if;
end;
$$;

-- 새 회원이 추천 링크로 가입했음을 기록한다(가입을 마친 직후 서버가 부른다). 보상은 여기서 주지 않는다 — evaluate_referral_signup이 조건을 확인한 뒤 확정한다.
-- 결과: { ok: true, status, risk } · { ok: true, already: true } · { ok: false, reason }
--  reason: feature-off · invalid(없는 링크 · 중지된 링크) · self(본인 링크) · no-profile · not-new(가입한 지 오래됐거나 이미 구매함 — 신규 회원만 추천 가입으로 센다)
create or replace function public.register_referral_signup(p_token text, p_invitee uuid, p_anon text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.referral_links%rowtype;
  v_prof timestamptz;
  v_inviter_prof timestamptz;
  v_risk jsonb := '[]'::jsonb;
  v_first timestamptz;
  v_burst integer;
  v_existing public.referral_signups%rowtype;
begin
  if not public.benefit_flag('feature.referral') then return jsonb_build_object('ok', false, 'reason', 'feature-off'); end if;
  select * into l from public.referral_links where token = p_token and deactivated_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if l.user_id = p_invitee then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  perform public.benefit_lock(l.user_id);
  select * into v_existing from public.referral_signups where invitee_user_id = p_invitee;
  if found then return jsonb_build_object('ok', true, 'already', true, 'status', v_existing.status); end if;
  select created_at into v_prof from public.profiles where id = p_invitee;
  if v_prof is null then return jsonb_build_object('ok', false, 'reason', 'no-profile'); end if;
  if now() - v_prof > make_interval(hours => public.benefit_int('referral.new_member_hours', 48))
     or exists (select 1 from public.orders o where o.user_id = p_invitee and o.status in ('paid', 'refunded')) then
    return jsonb_build_object('ok', false, 'reason', 'not-new');
  end if;

  -- 위험 신호(제안 기준 · 설정으로 바꾼다). 신호가 있어도 가입은 기록하고 지급만 관리자 확인으로 올린다
  if p_anon is not null and char_length(p_anon) >= 8 then
    if exists (select 1 from public.referral_signups s where s.inviter_user_id = l.user_id and s.anon_id = left(p_anon, 64)) then
      v_risk := v_risk || '"same_device_repeat"'::jsonb;
    end if;
    select min(created_at) into v_first from public.referral_visits where token = p_token and anon_id = left(p_anon, 64);
    if v_first is not null and now() - v_first < make_interval(secs => public.benefit_int('referral.risk.min_visit_seconds', 10)) then
      v_risk := v_risk || '"too_fast"'::jsonb;
    end if;
  end if;
  select count(*) into v_burst from public.referral_signups where link_token = p_token and signed_up_at > now() - interval '1 hour';
  if v_burst >= public.benefit_int('referral.risk.burst_per_hour', 10) then v_risk := v_risk || '"burst"'::jsonb; end if;
  select created_at into v_inviter_prof from public.profiles where id = l.user_id;
  if v_inviter_prof is not null and now() - v_inviter_prof < make_interval(mins => public.benefit_int('referral.risk.young_inviter_minutes', 60)) then
    v_risk := v_risk || '"young_inviter"'::jsonb;
  end if;

  insert into public.referral_signups (invitee_user_id, inviter_user_id, link_token, anon_id, status, risk, hold_until)
    values (p_invitee, l.user_id, p_token, left(p_anon, 64), case when jsonb_array_length(v_risk) = 0 then 'pending' else 'review' end, v_risk,
            now() + make_interval(hours => public.benefit_int('referral.hold_hours', 72)));
  return jsonb_build_object('ok', true, 'status', case when jsonb_array_length(v_risk) = 0 then 'pending' else 'review' end, 'risk', v_risk);
end;
$$;

-- 추천인에게 줄 500P의 확정 조건을 확인하고 충족하면 지급한다(주기적으로 · 무료 분석을 마친 직후에 부른다).
-- 결과 status: not-found · decided(이미 확정 · 거절 · 회수) · feature-off · not-confirmed(계정 확인 전) · no-analysis(무료 분석 전) · holding(보류 시간) · review(관리자 확인 대기) · confirmed
create or replace function public.evaluate_referral_signup(p_invitee uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.referral_signups%rowtype;
  v_points integer;
  v_days integer;
  v_grant jsonb;
  v_today integer;
  v_cap integer;
begin
  select * into s from public.referral_signups where invitee_user_id = p_invitee;
  if not found then return jsonb_build_object('status', 'not-found'); end if;
  perform public.benefit_lock(s.inviter_user_id);
  select * into s from public.referral_signups where invitee_user_id = p_invitee for update;
  if s.status in ('confirmed', 'rejected', 'revoked') then return jsonb_build_object('status', 'decided', 'to', s.status); end if;
  if not public.benefit_flag('feature.referral_signup_points') then return jsonb_build_object('status', 'feature-off'); end if;
  -- 1) 계정 확인(이메일 확인 또는 소셜 로그인)
  if not exists (
    select 1 from auth.users u where u.id = p_invitee
       and (u.email_confirmed_at is not null or exists (select 1 from auth.identities i where i.user_id = u.id and i.provider <> 'email'))
  ) then
    return jsonb_build_object('status', 'not-confirmed');
  end if;
  -- 2) 무료 분석 1회 정상 완료(저장된 분석 결과)
  if not exists (select 1 from public.assessments a where a.user_id = p_invitee and a.withdrawn_at is null) then
    return jsonb_build_object('status', 'no-analysis');
  end if;
  -- 3) 보류 시간
  if now() < s.hold_until then return jsonb_build_object('status', 'holding', 'until', s.hold_until); end if;
  -- 4) 위험 신호가 있으면 관리자 확인으로
  if s.status = 'review' or jsonb_array_length(s.risk) > 0 then
    if s.status <> 'review' then update public.referral_signups set status = 'review' where invitee_user_id = p_invitee; end if;
    return jsonb_build_object('status', 'review');
  end if;
  -- 5) 추천인별 하루 확정 한도(지급 한도)
  v_cap := public.benefit_int('referral.max_confirmed_per_inviter_per_day', 20);
  select count(*) into v_today from public.referral_signups x
   where x.inviter_user_id = s.inviter_user_id and x.status = 'confirmed' and x.decided_at > now() - interval '1 day';
  if v_today >= v_cap then
    update public.referral_signups set status = 'review', risk = risk || '"daily_cap"'::jsonb where invitee_user_id = p_invitee;
    return jsonb_build_object('status', 'review');
  end if;

  v_points := public.benefit_int('referral.signup_points', 500);
  v_days := public.benefit_int('point.expire_days', 0);
  v_grant := public.grant_points(s.inviter_user_id, v_points, 'referral_signup', p_invitee::text, 'referral-signup:' || p_invitee::text,
    case when v_days > 0 then now() + make_interval(days => v_days) else null end, null, jsonb_build_object('inviteeConfirmedAt', now()));
  update public.referral_signups set status = 'confirmed', decided_at = now() where invitee_user_id = p_invitee;
  return jsonb_build_object('status', 'confirmed', 'points', v_points, 'grant', v_grant);
end;
$$;

-- 관리자 결정: confirm(위험 신호를 확인하고 지급 확정) · reject(지급하지 않음). 사유 필수.
-- confirm은 계정 확인 · 무료 분석 완료는 여전히 요구한다(빈 가입에는 지급하지 않는다). 보류 시간 · 위험 신호만 관리자가 건너뛴다. 결제 보상이 보류돼 있었다면 함께 처리한다
create or replace function public.admin_decide_referral_signup(p_invitee uuid, p_decision text, p_reason text, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.referral_signups%rowtype;
  v_points integer;
  v_days integer;
  v_grant jsonb;
  v_held public.referral_first_purchases%rowtype;
begin
  if p_reason is null or char_length(btrim(p_reason)) = 0 then return jsonb_build_object('ok', false, 'reason', 'reason'); end if;
  if p_decision not in ('confirm', 'reject') then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  select * into s from public.referral_signups where invitee_user_id = p_invitee;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;
  perform public.benefit_lock(s.inviter_user_id);
  select * into s from public.referral_signups where invitee_user_id = p_invitee for update;
  if s.status not in ('pending', 'review') then return jsonb_build_object('ok', false, 'reason', 'decided'); end if;
  if p_decision = 'reject' then
    update public.referral_signups set status = 'rejected', decided_at = now(), decided_by = p_admin, decision_reason = left(p_reason, 200) where invitee_user_id = p_invitee;
    -- 보류돼 있던 첫 구매 질문권도 주지 않는다
    update public.referral_first_purchases set status = 'revoked' where invitee_user_id = p_invitee and status = 'held';
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;
  if not public.benefit_flag('feature.referral_signup_points') then return jsonb_build_object('ok', false, 'reason', 'feature-off'); end if;
  if not exists (
    select 1 from auth.users u where u.id = p_invitee
       and (u.email_confirmed_at is not null or exists (select 1 from auth.identities i where i.user_id = u.id and i.provider <> 'email'))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not-confirmed');
  end if;
  if not exists (select 1 from public.assessments a where a.user_id = p_invitee and a.withdrawn_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'no-analysis');
  end if;
  v_points := public.benefit_int('referral.signup_points', 500);
  v_days := public.benefit_int('point.expire_days', 0);
  v_grant := public.grant_points(s.inviter_user_id, v_points, 'referral_signup', p_invitee::text, 'referral-signup:' || p_invitee::text,
    case when v_days > 0 then now() + make_interval(days => v_days) else null end, null, jsonb_build_object('adminDecided', true));
  update public.referral_signups set status = 'confirmed', decided_at = now(), decided_by = p_admin, decision_reason = left(p_reason, 200) where invitee_user_id = p_invitee;
  -- 보류돼 있던 첫 구매 질문권을 이어서 처리한다
  select * into v_held from public.referral_first_purchases where invitee_user_id = p_invitee and status = 'held';
  if found then
    update public.referral_first_purchases set status = 'pending' where invitee_user_id = p_invitee;
    perform public.confirm_referral_purchase(v_held.order_id);
  end if;
  return jsonb_build_object('ok', true, 'status', 'confirmed', 'points', v_points, 'grant', v_grant);
end;
$$;

-- 확정된 추천 가입을 부정으로 확인해 회수한다(미사용 포인트만 · 이미 쓴 몫은 회수 불가 이력). 사유 필수
create or replace function public.revoke_referral_signup(p_invitee uuid, p_reason text, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.referral_signups%rowtype;
  v_claw jsonb;
begin
  if p_reason is null or char_length(btrim(p_reason)) = 0 then return jsonb_build_object('ok', false, 'reason', 'reason'); end if;
  select * into s from public.referral_signups where invitee_user_id = p_invitee;
  if not found or s.status <> 'confirmed' then return jsonb_build_object('ok', false, 'reason', 'not-confirmed'); end if;
  v_claw := public.clawback_points_by_source('referral_signup', p_invitee::text, left(p_reason, 100));
  update public.referral_signups set status = 'revoked', decided_at = now(), decided_by = p_admin, decision_reason = left(p_reason, 200) where invitee_user_id = p_invitee;
  return jsonb_build_object('ok', true, 'clawback', v_claw);
end;
$$;

-- 이 사람이 추천 가격(6,900원)을 받을 수 있는가(읽기만).
-- 결과: { ok: true, price, inviterUserId } 또는 { ok: false, reason } — feature-off · no-signup(추천으로 가입한 기록 없음) · signup-rejected · not-first(이미 심층 리포트를 샀다) · used(이미 추천 가격으로 구매했다)
create or replace function public.referral_discount_status(p_invitee uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.referral_signups%rowtype;
  fp public.referral_first_purchases%rowtype;
  v_ostatus text;
begin
  if not public.benefit_flag('feature.referral') then return jsonb_build_object('ok', false, 'reason', 'feature-off'); end if;
  select * into s from public.referral_signups where invitee_user_id = p_invitee;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no-signup'); end if;
  if s.status in ('rejected', 'revoked') then return jsonb_build_object('ok', false, 'reason', 'signup-rejected'); end if;
  select * into fp from public.referral_first_purchases where invitee_user_id = p_invitee;
  if found then
    if fp.status in ('confirmed', 'held', 'revoked') then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
    if fp.status = 'pending' then
      select status into v_ostatus from public.orders where id = fp.order_id;
      if v_ostatus = 'paid' then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
    end if;
  elsif exists (
    select 1 from public.orders o
     where o.user_id = p_invitee and o.status in ('paid', 'refunded')
       and (o.product_id = 'personal-integrated-report' or o.product_id like 'personal-integrated-report:r%')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not-first');
  end if;
  return jsonb_build_object('ok', true, 'price', public.benefit_int('referral.invitee_price', 6900), 'inviterUserId', s.inviter_user_id);
end;
$$;

-- 이미 만든 결제 대기 주문(6,900원)에 추천 가격을 확정한다. 주문 금액이 설정 가격과 같고 이 사람의 심층 리포트 첫 구매 상품이어야 한다.
-- 확정하지 못하면 아무것도 바꾸지 않고 이유를 돌려준다(서비스가 그 주문을 취소하고 고객이 정가를 확인하게 한다). 결과는 referral_discount_status와 같은 모양(+ order-mismatch)
create or replace function public.claim_referral_discount(p_invitee uuid, p_order uuid, p_list_price integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status jsonb;
  ord public.orders%rowtype;
  fp public.referral_first_purchases%rowtype;
begin
  perform public.benefit_lock(p_invitee);
  v_status := public.referral_discount_status(p_invitee);
  if not (v_status ->> 'ok')::boolean then return v_status; end if;
  select * into ord from public.orders where id = p_order;
  if not found or ord.user_id <> p_invitee or ord.status <> 'pending' or ord.provider <> 'tosspayments'
     or ord.product_id <> 'personal-integrated-report' or ord.amount <> (v_status ->> 'price')::integer then
    return jsonb_build_object('ok', false, 'reason', 'order-mismatch');
  end if;
  select * into fp from public.referral_first_purchases where invitee_user_id = p_invitee for update;
  if found then
    -- 이전 할인 주문이 결제 대기로 남아 있으면 취소한다(두 주문 모두 추천 가격으로 결제되는 일을 막는다)
    if fp.order_id <> p_order then
      update public.orders set status = 'canceled', failure_code = 'DISCOUNT_REPLACED', failure_message = '새 추천 가격 주문으로 대체됨'
       where id = fp.order_id and status = 'pending';
    end if;
    update public.referral_first_purchases set order_id = p_order, status = 'pending' where invitee_user_id = p_invitee;
  else
    insert into public.referral_first_purchases (invitee_user_id, order_id) values (p_invitee, p_order);
  end if;
  update public.orders set list_amount = p_list_price, discount_krw = greatest(p_list_price - ord.amount, 0), discount_kind = 'referral', discount_ref = 'referral'
   where id = p_order;
  return v_status;
end;
$$;

-- 친구 첫 구매가 결제 완료로 확인됐을 때: 추천인 · 구매자에게 질문권을 준다(주문당 각각 한 번). 주문이 paid로 바뀌는 트랜잭션에서 부른다
-- 결과 status: nothing · void-signup(추천 가입이 거절 · 회수됨) · off(보상이 꺼져 있음 — 켜도 소급하지 않는다) · held(관리자 확인 대기 중이라 보류) · confirmed
create or replace function public.confirm_referral_purchase(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fp public.referral_first_purchases%rowtype;
  s public.referral_signups%rowtype;
  v_days integer;
  v_exp timestamptz;
  v_src text := 'referral-buy:' || p_order::text;
begin
  select * into fp from public.referral_first_purchases where order_id = p_order for update;
  if not found or fp.status <> 'pending' then return jsonb_build_object('status', 'nothing'); end if;
  select * into s from public.referral_signups where invitee_user_id = fp.invitee_user_id;
  if not found or s.status in ('rejected', 'revoked') then
    update public.referral_first_purchases set status = 'revoked' where invitee_user_id = fp.invitee_user_id;
    return jsonb_build_object('status', 'void-signup');
  end if;
  if not public.benefit_flag('feature.referral_purchase_credits') then
    update public.referral_first_purchases set status = 'confirmed' where invitee_user_id = fp.invitee_user_id;
    perform public.benefit_claim_op('referral-buy-skipped:' || p_order::text, fp.invitee_user_id, 'referral-buy-skipped');
    return jsonb_build_object('status', 'off');
  end if;
  if s.status = 'review' then
    update public.referral_first_purchases set status = 'held' where invitee_user_id = fp.invitee_user_id;
    return jsonb_build_object('status', 'held');
  end if;
  v_days := public.benefit_int('credit.expire_days', 0);
  v_exp := case when v_days > 0 then now() + make_interval(days => v_days) else null end;
  perform public.grant_credit(s.inviter_user_id, 'referral_inviter', public.benefit_int('referral.inviter_credits', 1), v_src, v_src || ':inviter', v_exp);
  perform public.grant_credit(fp.invitee_user_id, 'referral_invitee', public.benefit_int('referral.invitee_credits', 1), v_src, v_src || ':invitee', v_exp);
  update public.referral_first_purchases set status = 'confirmed' where invitee_user_id = fp.invitee_user_id;
  return jsonb_build_object('status', 'confirmed');
end;
$$;

-- 주문 상태가 바뀔 때: 결제 완료 → 첫 구매 보상 · 환불 → 미사용 질문권 회수 · 결제 실패 · 취소 → 추천 가격을 다시 쓸 수 있게 풀기. 오류가 나도 결제 확정은 그대로 진행한다
create or replace function public.orders_referral_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.status = 'paid' and old.status is distinct from 'paid' then
      perform public.confirm_referral_purchase(new.id);
    elsif new.status = 'refunded' and old.status = 'paid' then
      if exists (select 1 from public.referral_first_purchases where order_id = new.id and status in ('confirmed', 'held')) then
        perform public.revoke_credits_by_source('referral-buy:' || new.id::text, 'order-refunded');
        update public.referral_first_purchases set status = 'revoked' where order_id = new.id;
      end if;
    elsif new.status in ('failed', 'canceled') and old.status = 'pending' then
      update public.referral_first_purchases set status = 'void' where order_id = new.id and status = 'pending';
    end if;
  exception when others then
    insert into public.benefit_failures (kind, ref, message) values ('orders_trigger_referral', new.id::text, left(sqlerrm, 300));
  end;
  return new;
end;
$$;

create trigger orders_referral_state after update of status on public.orders
  for each row execute function public.orders_referral_state();

-- 정기 점검: 보류 시간이 지난 추천 가입 확인 + 트리거가 놓친 첫 구매 보상 처리 + 오래된 방문 기록 정리
create or replace function public.reconcile_referrals()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_eval integer := 0;
  v_confirmed integer := 0;
  v_buy integer := 0;
  v_res jsonb;
  v_visits integer;
begin
  for r in select invitee_user_id from public.referral_signups where status in ('pending', 'review') and hold_until <= now() order by hold_until loop
    begin
      v_res := public.evaluate_referral_signup(r.invitee_user_id);
      v_eval := v_eval + 1;
      if v_res ->> 'status' = 'confirmed' then v_confirmed := v_confirmed + 1; end if;
    exception when others then
      insert into public.benefit_failures (kind, ref, message) values ('reconcile_referral_signup', r.invitee_user_id::text, left(sqlerrm, 300));
    end;
  end loop;
  for r in
    select fp.order_id from public.referral_first_purchases fp join public.orders o on o.id = fp.order_id
     where fp.status = 'pending' and o.status = 'paid'
  loop
    begin
      perform public.confirm_referral_purchase(r.order_id);
      v_buy := v_buy + 1;
    exception when others then
      insert into public.benefit_failures (kind, ref, message) values ('reconcile_referral_purchase', r.order_id::text, left(sqlerrm, 300));
    end;
  end loop;
  perform set_config('miyu.benefit_maintenance', 'on', true);
  delete from public.referral_visits where created_at < now() - interval '90 days';
  get diagnostics v_visits = row_count;
  return jsonb_build_object('evaluated', v_eval, 'confirmedSignups', v_confirmed, 'purchaseRewards', v_buy, 'visitsPurged', v_visits);
end;
$$;

revoke all on function public.ensure_referral_link(uuid, text) from public, anon, authenticated;
revoke all on function public.log_referral_visit(text, text) from public, anon, authenticated;
revoke all on function public.register_referral_signup(text, uuid, text) from public, anon, authenticated;
revoke all on function public.evaluate_referral_signup(uuid) from public, anon, authenticated;
revoke all on function public.admin_decide_referral_signup(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.revoke_referral_signup(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.referral_discount_status(uuid) from public, anon, authenticated;
revoke all on function public.claim_referral_discount(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.confirm_referral_purchase(uuid) from public, anon, authenticated;
revoke all on function public.orders_referral_state() from public, anon, authenticated;
revoke all on function public.reconcile_referrals() from public, anon, authenticated;
grant execute on function public.ensure_referral_link(uuid, text) to service_role;
grant execute on function public.log_referral_visit(text, text) to service_role;
grant execute on function public.register_referral_signup(text, uuid, text) to service_role;
grant execute on function public.evaluate_referral_signup(uuid) to service_role;
grant execute on function public.admin_decide_referral_signup(uuid, text, text, uuid) to service_role;
grant execute on function public.revoke_referral_signup(uuid, text, uuid) to service_role;
grant execute on function public.referral_discount_status(uuid) to service_role;
grant execute on function public.claim_referral_discount(uuid, uuid, integer) to service_role;
grant execute on function public.confirm_referral_purchase(uuid) to service_role;
grant execute on function public.reconcile_referrals() to service_role;
